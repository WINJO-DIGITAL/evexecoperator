// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake service-role client: getUser returns state.user; tenant_users returns
// state.roles; writes to operator_push_subscriptions are recorded.
const state: {
  user: { id: string } | null;
  roles: Array<{ tenant_id: string | null; role: string }>;
  upserts: Array<Record<string, unknown>>;
  deletes: Array<Array<[string, unknown]>>;
} = { user: null, roles: [], upserts: [], deletes: [] };

function chain(table: string) {
  const filters: Array<[string, unknown]> = [];
  let op: "select" | "delete" = "select";
  const q: Record<string, unknown> = {
    select: () => q,
    order: () => q,
    limit: () => q,
    in: () => q,
    eq: (col: string, v: unknown) => { filters.push([col, v]); return q; },
    delete: () => { op = "delete"; return q; },
    upsert: async (row: Record<string, unknown>) => { state.upserts.push(row); return { error: null }; },
    maybeSingle: async () => ({ data: table === "tenants" ? { id: "t1", name: "EV Exec" } : null, error: null }),
    then: (res: (v: unknown) => unknown) => {
      if (op === "delete") { state.deletes.push(filters); return res({ error: null }); }
      return res({ data: table === "tenant_users" ? state.roles : [], error: null });
    },
  };
  return q;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user ? { ...state.user, email: "x@example.com", user_metadata: {} } : null }, error: state.user ? null : { message: "bad" } }) },
    from: (t: string) => chain(t),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";

const sub = { subscription: { endpoint: "https://push.example/dev1", keys: { p256dh: "k", auth: "a" } }, label: "Office PC" };
const call = async (method: "POST" | "DELETE", body: unknown, token = "tok") => {
  const mod = await import("./route");
  const res = await mod[method](new Request("http://localhost/api/push/subscribe", {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return res.status;
};

beforeEach(() => {
  state.user = { id: "u1" };
  state.roles = [];
  state.upserts = [];
  state.deletes = [];
});

describe("/api/push/subscribe", () => {
  it("refuses a signed-in customer (no office role) and stores nothing", async () => {
    expect(await call("POST", sub)).toBe(401);
    expect(state.upserts).toEqual([]);
  });

  it("refuses a driver", async () => {
    state.roles = [{ tenant_id: "t1", role: "driver" }];
    expect(await call("POST", sub)).toBe(401);
    expect(state.upserts).toEqual([]);
  });

  it("refuses an invalid token", async () => {
    state.user = null;
    expect(await call("POST", sub)).toBe(401);
  });

  it("lets a dispatcher register their device", async () => {
    state.roles = [{ tenant_id: "t1", role: "dispatcher" }];
    expect(await call("POST", sub)).toBe(200);
    expect(state.upserts).toEqual([{ endpoint: "https://push.example/dev1", p256dh: "k", auth: "a", label: "Office PC", user_id: "u1" }]);
  });

  it("refuses DELETE from non-staff", async () => {
    expect(await call("DELETE", { endpoint: "https://push.example/dev1" })).toBe(401);
    expect(state.deletes).toEqual([]);
  });

  it("DELETE by staff only removes their own device", async () => {
    state.roles = [{ tenant_id: "t1", role: "operator_admin" }];
    expect(await call("DELETE", { endpoint: "https://push.example/dev1" })).toBe(200);
    expect(state.deletes).toEqual([[["endpoint", "https://push.example/dev1"], ["user_id", "u1"]]]);
  });
});
