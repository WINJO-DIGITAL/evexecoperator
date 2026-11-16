import { describe, it, expect, vi, beforeEach } from "vitest";

// getCaller: who is this signed-in staff member? When the database refuses the server's
// service key, the answer must still come from the user's own access.

const USER = { id: "970bb48c-398f-40b2-ad7a-f761351e997d", email: "staff@example.test", user_metadata: { full_name: "Sam Staff" } };
const TENANT = "00000000-0000-0000-0000-000000000001";
let serviceKeyRefused = false;

vi.mock("@supabase/supabase-js", () => {
  const rows = [{ tenant_id: "00000000-0000-0000-0000-000000000001", role: "operator_admin" }];
  const client = (kind: "service" | "user") => ({
    auth: { getUser: async () => ({ data: { user: USER }, error: null }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => ({ data: table === "tenants" ? { id: "00000000-0000-0000-0000-000000000001", name: "EV Exec" } : null, error: null }),
        then: (resolve: (v: unknown) => void) => {
          if (kind === "service" && serviceKeyRefused) resolve({ data: null, error: { message: "Invalid API key" } });
          else resolve({ data: table === "tenant_users" ? rows : [], error: null });
        },
      };
      return chain;
    },
  });
  return {
    createClient: (_url: string, key: string, opts?: { global?: { headers?: Record<string, string> } }) =>
      client(opts?.global?.headers?.Authorization ? "user" : key === "service-key" ? "service" : "user"),
  };
});

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

const { getCaller, adminClient } = await import("./staff");
const req = () => new Request("https://x.test/api/x", { headers: { authorization: "Bearer user-token" } });

beforeEach(() => { serviceKeyRefused = false; });

describe("getCaller", () => {
  it("finds the staff member and their business with the service key", async () => {
    const caller = await getCaller(req(), adminClient()!);
    expect(caller).toMatchObject({ tenantId: TENANT, tenantName: "EV Exec", isAdmin: true });
  });

  it("still finds them from their own access when the database refuses the service key", async () => {
    serviceKeyRefused = true;
    const caller = await getCaller(req(), adminClient()!);
    expect(caller).toMatchObject({ tenantId: TENANT, isAdmin: true });
    expect(caller?.db).toBeDefined();
  });

  it("refuses a request with no sign-in token", async () => {
    expect(await getCaller(new Request("https://x.test/api/x"), adminClient()!)).toBeNull();
  });
});
