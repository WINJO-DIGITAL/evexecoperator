import { describe, it, expect } from "vitest";
import { fetchRefPrefix } from "./refPrefix";
import { generateBookingRef } from "./validation";

// A fake client that answers the two queries the lookup makes.
const client = ({ user = { id: "u1" }, roles = [{ tenant_id: "t1" }], tenant = { ref_prefix: "COAS" }, fail = false } = {}) => ({
  auth: { getUser: async () => ({ data: { user } }) },
  from: (table) => ({
    select: () => ({
      eq: () => (table === "tenant_users"
        ? Promise.resolve({ data: roles })
        : { maybeSingle: async () => { if (fail) throw new Error("boom"); return { data: tenant }; } }),
    }),
  }),
});

describe("fetchRefPrefix", () => {
  it("returns the business's own prefix", async () => { expect(await fetchRefPrefix(client())).toBe("COAS"); });
  it("falls back to EVX with no login, no business, a bad prefix or an error", async () => {
    expect(await fetchRefPrefix(client({ user: null }))).toBe("EVX");
    expect(await fetchRefPrefix(client({ roles: [] }))).toBe("EVX");
    expect(await fetchRefPrefix(client({ tenant: { ref_prefix: "x" } }))).toBe("EVX");
    expect(await fetchRefPrefix(client({ tenant: null }))).toBe("EVX");
    expect(await fetchRefPrefix(client({ fail: true }))).toBe("EVX");
  });
});

describe("generateBookingRef with a prefix", () => {
  it("uses the prefix and defaults to EVX", () => {
    expect(generateBookingRef("COAS")).toMatch(/^COAS-[A-Z0-9]+$/);
    expect(generateBookingRef()).toMatch(/^EVX-[A-Z0-9]+$/);
  });
  it("ignores an invalid prefix", () => { expect(generateBookingRef("bad prefix")).toMatch(/^EVX-/); });
});
