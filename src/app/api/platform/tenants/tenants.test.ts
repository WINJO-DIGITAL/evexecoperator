// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the service-role Supabase client used by /api/platform/tenants.
type Row = Record<string, unknown>;
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const db: {
  tenant_users: Row[]; tenants: Row[]; caller: string; callerOk: boolean;
  users: Record<string, { email: string; last_sign_in_at: string | null }>; existing: Set<string>;
  rpcCalls: Row[]; rpcError: { code: string; message: string } | null;
} = { tenant_users: [], tenants: [], caller: "owner1", callerOk: true, users: {}, existing: new Set(), rpcCalls: [], rpcError: null };

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "delete" = "select";
  const rows = () => (table === "tenant_users" ? db.tenant_users : table === "tenants" ? db.tenants : []);
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return q; },
    in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return q; },
    order: () => q, limit: () => q,
    delete: () => { op = "delete"; return q; },
    upsert: async (row: Row) => {
      if (!db.tenant_users.some((r) => r.tenant_id === row.tenant_id && r.user_id === row.user_id && r.role === row.role)) db.tenant_users.push(row);
      return { error: null };
    },
    maybeSingle: async () => ({ data: rows().filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => {
      const match = (r: Row) => filters.every((f) => f(r));
      if (op === "delete") { db.tenant_users = db.tenant_users.filter((r) => !match(r)); return res({ error: null }); }
      return res({ data: rows().filter(match), error: null });
    },
  };
  return q;
}

const sent: Array<{ to: string; subject: string; html: string }> = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: query,
    rpc: async (fn: string, args: Row) => {
      db.rpcCalls.push({ fn, ...args });
      if (db.rpcError) return { data: null, error: db.rpcError };
      return { data: { id: T2, slug: args.p_slug, name: String(args.p_name).trim() }, error: null };
    },
    auth: {
      getUser: async () => db.callerOk
        ? { data: { user: { id: db.caller, email: `${db.caller}@x.com`, user_metadata: { full_name: "Platform Owner" } } }, error: null }
        : { data: { user: null }, error: { message: "bad token" } },
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, ...(db.users[id] ?? { email: `${id}@x.com`, last_sign_in_at: "2026-10-01T09:00:00Z" }) } } }),
        generateLink: async ({ type, email }: { type: string; email: string }) => {
          const id = email.split("@")[0];
          if (type === "invite" && db.existing.has(email)) return { data: null, error: { message: "already registered" } };
          db.existing.add(email);
          db.users[id] = db.users[id] ?? { email, last_sign_in_at: null };
          return { data: { user: { id, last_sign_in_at: db.users[id].last_sign_in_at }, properties: { hashed_token: "tok123" } }, error: null };
        },
      },
    },
  }),
}));

vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
  if (String(url).includes("api.resend.com")) {
    const b = JSON.parse(init?.body ?? "{}");
    if (db.users["failmail"] && b.to?.[0]?.startsWith("failmail")) return { ok: false, json: async () => ({ message: "mailbox full" }) };
    sent.push({ to: b.to[0], subject: b.subject, html: b.html });
    return { ok: true, json: async () => ({}) };
  }
  return { ok: true, json: async () => ({}) };
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.RESEND_API_KEY = "re_x";

const call = async (method: "GET" | "POST", body?: unknown, auth = "Bearer t") => {
  const mod = await import("./route");
  const fn = mod[method] as (r: Request) => Promise<Response>;
  const res = await fn(new Request("http://localhost/api/platform/tenants", {
    method, headers: { authorization: auth, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  db.caller = "owner1"; db.callerOk = true; db.rpcCalls = []; db.rpcError = null; db.existing = new Set(); db.users = {};
  db.tenant_users = [
    { tenant_id: null, user_id: "owner1", role: "super_admin" },
    { tenant_id: T1, user_id: "admin1", role: "operator_admin" },
  ];
  db.tenants = [
    { id: T1, name: "EV Exec", slug: "ev-exec", status: "active", contact_email: "book@evexec.co.uk", contact_phone: null, created_at: "2026-09-07" },
    { id: T2, name: "Coastal Cars", slug: "coastal", status: "active", contact_email: null, contact_phone: null, created_at: "2026-11-01" },
  ];
  sent.length = 0;
});

describe("who can use it", () => {
  it("refuses a request with no sign-in", async () => {
    const r = await call("GET", undefined, "");
    expect(r.status).toBe(403);
  });
  it("refuses an invalid token", async () => {
    db.callerOk = false;
    expect((await call("GET")).status).toBe(403);
  });
  it("refuses a business admin (only the platform owner may)", async () => {
    db.caller = "admin1";
    for (const r of [await call("GET"), await call("POST", { action: "create", slug: "x", name: "X" }), await call("POST", { action: "invite", tenantId: T1, email: "a@b.co" })]) {
      expect(r.status).toBe(403);
    }
    expect(db.rpcCalls).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});

describe("list", () => {
  it("lists every business with its admin count", async () => {
    const r = await call("GET");
    expect(r.status).toBe(200);
    expect(r.body.tenants.map((t: { slug: string; admins: number }) => [t.slug, t.admins])).toEqual([["ev-exec", 1], ["coastal", 0]]);
  });
});

describe("create", () => {
  it("sets a business up through provision_tenant", async () => {
    const r = await call("POST", { action: "create", slug: "new-cars", name: " New Cars ", contactEmail: "hi@new.test", contactPhone: "07123 456789" });
    expect(r.status).toBe(200);
    expect(r.body.tenant.slug).toBe("new-cars");
    expect(db.rpcCalls).toEqual([{ fn: "provision_tenant", p_slug: "new-cars", p_name: " New Cars ", p_contact_email: "hi@new.test", p_contact_phone: "07123 456789" }]);
  });
  it("leaves optional contact details out as null", async () => {
    await call("POST", { action: "create", slug: "bare", name: "Bare" });
    expect(db.rpcCalls[0]).toMatchObject({ p_contact_email: null, p_contact_phone: null });
  });
  it("says so when the short name is taken", async () => {
    db.rpcError = { code: "23505", message: "duplicate key" };
    const r = await call("POST", { action: "create", slug: "coastal", name: "Again" });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/already taken/);
  });
  it("passes the database's message for invalid input", async () => {
    db.rpcError = { code: "22023", message: "The business name is required (up to 100 characters)." };
    const r = await call("POST", { action: "create", slug: "ok", name: "" });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/business name is required/);
  });
});

describe("invite the first admin", () => {
  it("makes them an admin of that business and emails a set-password link in its name", async () => {
    const r = await call("POST", { action: "invite", tenantId: T2, email: "  Boss@Coastal.TEST " });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, email: "boss@coastal.test", emailed: true });
    expect(db.tenant_users).toContainEqual({ tenant_id: T2, user_id: "boss", role: "operator_admin" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("boss@coastal.test");
    expect(sent[0].html).toContain("Coastal Cars");
    expect(sent[0].html).toContain("/set-password?token_hash=tok123&amp;type=invite");
    expect(sent[0].html).toContain("COASTAL CARS");
    expect(sent[0].html + sent[0].subject).not.toMatch(/ev exec|evexec|07721|PHO0079/i);
  });
  it("can be run again to resend (an existing account gets a reset link, not a second role)", async () => {
    await call("POST", { action: "invite", tenantId: T2, email: "boss@coastal.test" });
    const again = await call("POST", { action: "invite", tenantId: T2, email: "boss@coastal.test" });
    expect(again.status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent[1].html).toContain("type=recovery");
    expect(db.tenant_users.filter((r) => r.tenant_id === T2 && r.user_id === "boss")).toHaveLength(1);
  });
  it("rejects a bad email, a missing or malformed business, and an unknown business", async () => {
    expect((await call("POST", { action: "invite", tenantId: T2, email: "nope" })).status).toBe(422);
    expect((await call("POST", { action: "invite", tenantId: "", email: "a@b.co" })).status).toBe(422);
    expect((await call("POST", { action: "invite", tenantId: "not-a-uuid", email: "a@b.co" })).status).toBe(422);
    expect((await call("POST", { action: "invite", tenantId: "33333333-3333-4333-8333-333333333333", email: "a@b.co" })).status).toBe(404);
    expect(sent).toHaveLength(0);
  });
  it("still makes them an admin, and says the email failed, if sending fails", async () => {
    db.users["failmail"] = { email: "failmail@x.com", last_sign_in_at: null };
    const r = await call("POST", { action: "invite", tenantId: T2, email: "failmail@x.com" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, emailed: false });
    expect(r.body.emailError).toMatch(/mailbox full/);
    expect(db.tenant_users).toContainEqual({ tenant_id: T2, user_id: "failmail", role: "operator_admin" });
  });
});

describe("members and bad requests", () => {
  it("lists a business's staff and whether they have signed in", async () => {
    db.users["admin1"] = { email: "admin1@x.com", last_sign_in_at: null };
    const r = await call("POST", { action: "members", tenantId: T1 });
    expect(r.body.members).toEqual([{ email: "admin1@x.com", role: "operator_admin", pending: true }]);
  });
  it("refuses an unknown action", async () => {
    expect((await call("POST", { action: "delete_everything" })).status).toBe(400);
  });
});
