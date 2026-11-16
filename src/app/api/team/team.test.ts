// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the service-role Supabase client used by /api/team.
type Row = { tenant_id: string | null; user_id: string; role: string; created_at?: string };
const db: { tenant_users: Row[]; caller: string; users: Record<string, { email: string; last_sign_in_at: string | null }>; existing: Set<string> } = {
  tenant_users: [], caller: "admin1", users: {}, existing: new Set(),
};

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "delete" = "select";
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (col: string, v: unknown) => { filters.push((r) => (r as Record<string, unknown>)[col] === v); return q; },
    in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes((r as Record<string, unknown>)[col])); return q; },
    order: () => q, limit: () => q,
    delete: () => { op = "delete"; return q; },
    upsert: async (row: Row) => {
      if (!db.tenant_users.some((r) => r.tenant_id === row.tenant_id && r.user_id === row.user_id && r.role === row.role)) db.tenant_users.push(row);
      return { error: null };
    },
    maybeSingle: async () => ({ data: table === "tenants" ? { id: "t1", name: "Test Cars" } : null, error: null }),
    then: (res: (v: unknown) => unknown) => {
      const match = (r: Row) => filters.every((f) => f(r));
      if (op === "delete") { db.tenant_users = db.tenant_users.filter((r) => !match(r)); return res({ error: null }); }
      return res({ data: table === "tenant_users" ? db.tenant_users.filter(match) : [], error: null });
    },
  };
  return q;
}

const sent: string[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: query,
    auth: {
      getUser: async () => ({ data: { user: { id: db.caller, email: `${db.caller}@x.com`, user_metadata: {} } }, error: null }),
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, ...(db.users[id] ?? { email: `${id}@x.com`, last_sign_in_at: "2026-10-01T09:00:00Z" }) } } }),
        generateLink: async ({ type, email }: { type: string; email: string }) => {
          const id = email.split("@")[0];
          if (type === "invite" && db.existing.has(email)) return { data: null, error: { message: "already registered" } };
          db.existing.add(email);
          db.users[id] = db.users[id] ?? { email, last_sign_in_at: null };
          return { data: { user: { id, last_sign_in_at: db.users[id].last_sign_in_at }, properties: { hashed_token: "h" } }, error: null };
        },
      },
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.RESEND_API_KEY = "re_x";

const call = async (method: string, body?: unknown) => {
  const mod = await import("./route");
  const fn = (mod as unknown as Record<string, (r: Request) => Promise<Response>>)[method];
  const res = await fn(new Request("http://localhost/api/team", {
    method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  db.caller = "admin1";
  db.tenant_users = [
    { tenant_id: "t1", user_id: "admin1", role: "operator_admin" },
    { tenant_id: "t1", user_id: "disp1", role: "dispatcher" },
    { tenant_id: "t2", user_id: "other", role: "operator_admin" },
  ];
  db.users = {};
  db.existing = new Set(["admin1@x.com", "disp1@x.com", "other@x.com"]);
  sent.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { sent.push(String(init?.body)); return new Response("{}", { status: 200 }); }));
});

describe("/api/team", () => {
  it("lists only this business's staff", async () => {
    const r = await call("GET");
    expect(r.status).toBe(200);
    expect(r.body.members.map((m: { userId: string }) => m.userId).sort()).toEqual(["admin1", "disp1"]);
    expect(r.body.canManage).toBe(true);
  });

  it("an admin can invite a new dispatcher, who gets an email", async () => {
    const r = await call("POST", { email: "new@x.com", role: "dispatcher" });
    expect(r.status).toBe(200);
    expect(r.body.emailed).toBe(true);
    expect(db.tenant_users).toContainEqual({ tenant_id: "t1", user_id: "new", role: "dispatcher" });
    expect(sent[0]).toContain("set-password?token_hash=h");
  });

  it("a dispatcher can see the team but not change it", async () => {
    db.caller = "disp1";
    expect((await call("GET")).body.canManage).toBe(false);
    expect((await call("POST", { email: "new@x.com", role: "operator_admin" })).status).toBe(403);
    expect((await call("DELETE", { userId: "admin1" })).status).toBe(403);
    expect((await call("PATCH", { userId: "admin1", role: "dispatcher" })).status).toBe(403);
  });

  it("rejects roles other than admin and dispatcher", async () => {
    expect((await call("POST", { email: "new@x.com", role: "super_admin" })).status).toBe(422);
  });

  it("won't let you remove yourself or change your own role", async () => {
    expect((await call("DELETE", { userId: "admin1" })).status).toBe(422);
    expect((await call("PATCH", { userId: "admin1", role: "dispatcher" })).status).toBe(422);
  });

  it("keeps at least one admin", async () => {
    db.tenant_users.push({ tenant_id: "t1", user_id: "admin2", role: "operator_admin" });
    db.caller = "admin2";
    // admin1 can be demoted while admin2 remains an admin...
    expect((await call("PATCH", { userId: "admin1", role: "dispatcher" })).status).toBe(200);
    // ...and a role change replaces the old role rather than adding one.
    expect(db.tenant_users.filter((r) => r.user_id === "admin1").map((r) => r.role)).toEqual(["dispatcher"]);
  });

  it("a platform admin can't demote or remove a business's only admin", async () => {
    db.tenant_users.push({ tenant_id: null, user_id: "super", role: "super_admin" });
    db.caller = "super";
    expect((await call("PATCH", { userId: "admin1", role: "dispatcher" })).status).toBe(422);
    expect((await call("DELETE", { userId: "admin1" })).status).toBe(422);
    expect(db.tenant_users).toContainEqual({ tenant_id: "t1", user_id: "admin1", role: "operator_admin" });
  });

  it("can't touch someone from another business", async () => {
    expect((await call("DELETE", { userId: "other" })).status).toBe(404);
    expect(db.tenant_users.some((r) => r.user_id === "other")).toBe(true);
  });

  it("removing someone keeps their other roles (e.g. driver)", async () => {
    db.tenant_users.push({ tenant_id: "t1", user_id: "disp1", role: "driver" });
    expect((await call("DELETE", { userId: "disp1" })).status).toBe(200);
    expect(db.tenant_users.filter((r) => r.user_id === "disp1").map((r) => r.role)).toEqual(["driver"]);
  });
});
