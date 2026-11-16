// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the service-role Supabase client used by /api/drivers.
type Rec = Record<string, unknown>;
const DRIVER_A = "11111111-1111-1111-1111-111111111111";
const PARTNER = "22222222-2222-2222-2222-222222222222";
const OTHER_TENANT = "33333333-3333-3333-3333-333333333333";
const db: {
  tables: Record<string, Rec[]>;
  users: Record<string, { email: string; last_sign_in_at: string | null }>;
  emailsTaken: Set<string>;
  created: Rec[];
} = { tables: {}, users: {}, emailsTaken: new Set(), created: [] };

function query(table: string) {
  const filters: Array<(r: Rec) => boolean> = [];
  let patch: Rec | null = null;
  const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const q: Rec = {
    select: () => q,
    eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return q; },
    in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return q; },
    order: () => q, limit: () => q,
    update: (p: Rec) => { patch = p; return q; },
    upsert: async (row: Rec) => {
      const t = (db.tables[table] ??= []);
      if (!t.some((r) => r.tenant_id === row.tenant_id && r.user_id === row.user_id && r.role === row.role)) t.push(row);
      return { error: null };
    },
    maybeSingle: async () => {
      if (table === "tenants") return { data: { id: "t1", name: "Test Cars" }, error: null };
      return { data: rows()[0] ?? null, error: null };
    },
    then: (res: (v: unknown) => unknown) => {
      if (patch) { rows().forEach((r) => Object.assign(r, patch)); return res({ error: null }); }
      return res({ data: rows(), error: null });
    },
  };
  return q;
}

const sent: string[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: query,
    auth: {
      getUser: async () => ({ data: { user: { id: "admin1", email: "admin1@x.com", user_metadata: { full_name: "Sam" } } }, error: null }),
      admin: {
        getUserById: async (id: string) => ({ data: { user: db.users[id] ? { id, ...db.users[id] } : null } }),
        createUser: async ({ id, email }: { id: string; email: string }) => {
          if (db.emailsTaken.has(email)) return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
          db.users[id] = { email, last_sign_in_at: null };
          db.emailsTaken.add(email);
          db.created.push({ id, email });
          return { data: { user: { id, email, last_sign_in_at: null } }, error: null };
        },
        updateUserById: async (id: string, { email }: { email: string }) => { db.users[id].email = email; return { error: null }; },
        generateLink: async () => ({ data: { properties: { hashed_token: "h" } }, error: null }),
      },
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.RESEND_API_KEY = "re_x";
process.env.DRIVER_APP_URL = "https://drivers.example";

const call = async (method: string, body?: unknown) => {
  const mod = await import("./route");
  const fn = (mod as unknown as Record<string, (r: Request) => Promise<Response>>)[method];
  const res = await fn(new Request("http://localhost/api/drivers", {
    method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  db.tables = {
    tenant_users: [{ tenant_id: "t1", user_id: "admin1", role: "operator_admin" }],
    drivers: [
      { id: DRIVER_A, tenant_id: "t1", name: "Ann Driver", full_name: null, email: "ann@x.com", kind: "driver" },
      { id: PARTNER, tenant_id: "t1", name: "Marks Taxi", full_name: null, email: "info@marks.example", kind: "partner" },
      { id: OTHER_TENANT, tenant_id: "t2", name: "Not Ours", full_name: null, email: "no@x.com", kind: "driver" },
    ],
  };
  db.users = {};
  db.emailsTaken = new Set();
  db.created = [];
  sent.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { sent.push(String(init?.body)); return new Response("{}", { status: 200 }); }));
});

describe("/api/drivers", () => {
  it("lists app access for this business's drivers only, partners as partner", async () => {
    db.users[DRIVER_A] = { email: "ann@x.com", last_sign_in_at: null };
    const r = await call("GET");
    expect(r.status).toBe(200);
    expect(r.body.access).toEqual({
      [DRIVER_A]: { status: "invited", lastSignIn: null },
      [PARTNER]: { status: "partner", lastSignIn: null },
    });
  });

  it("invites a driver: login with the driver's own id, driver role, emailed Driver App link", async () => {
    const r = await call("POST", { driverId: DRIVER_A });
    expect(r.status).toBe(200);
    expect(r.body.emailed).toBe(true);
    expect(db.created).toEqual([{ id: DRIVER_A, email: "ann@x.com" }]);
    expect(db.tables.tenant_users).toContainEqual({ tenant_id: "t1", user_id: DRIVER_A, role: "driver" });
    expect(db.tables.drivers[0].full_name).toBe("Ann Driver");
    expect(sent[0]).toContain("https://drivers.example/reset-password?token_hash=h");
  });

  it("resending reuses the existing login", async () => {
    db.users[DRIVER_A] = { email: "ann@x.com", last_sign_in_at: null };
    expect((await call("POST", { driverId: DRIVER_A })).status).toBe(200);
    expect(db.created).toEqual([]);
  });

  it("never invites a trusted partner", async () => {
    expect((await call("POST", { driverId: PARTNER })).status).toBe(422);
    expect(db.created).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("can't invite another business's driver", async () => {
    expect((await call("POST", { driverId: OTHER_TENANT })).status).toBe(404);
  });

  it("refuses an email that already belongs to another login", async () => {
    db.emailsTaken.add("ann@x.com");
    const r = await call("POST", { driverId: DRIVER_A });
    expect(r.status).toBe(409);
    expect(sent).toEqual([]);
  });
});
