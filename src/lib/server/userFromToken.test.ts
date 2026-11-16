import { describe, it, expect, vi } from "vitest";

// Who a sign-in token belongs to: the public key is tried first, the admin key is the fallback.
const calls: string[] = [];
let anonResult: { error: unknown; data: { user: unknown } } = { error: null, data: { user: { id: "anon-user" } } };

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => ({
    auth: {
      getUser: async () => {
        calls.push(key);
        return key === "anon-key" ? anonResult : { error: null, data: { user: { id: "admin-user" } } };
      },
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

describe("userFromToken", () => {
  it("uses the public key first and does not touch the admin key when it works", async () => {
    const { userFromToken, adminClient } = await import("./staff");
    calls.length = 0;
    const user = await userFromToken(adminClient()!, "t");
    expect((user as { id: string }).id).toBe("anon-user");
    expect(calls).toEqual(["anon-key"]);
  });

  it("falls back to the admin key when the public key refuses", async () => {
    const { userFromToken, adminClient } = await import("./staff");
    calls.length = 0;
    anonResult = { error: new Error("401"), data: { user: null } };
    const user = await userFromToken(adminClient()!, "t");
    expect((user as { id: string }).id).toBe("admin-user");
    expect(calls).toEqual(["anon-key", "service-key"]);
  });
});
