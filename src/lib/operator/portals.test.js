import { describe, it, expect } from "vitest";
import { bookingPageLink } from "./portals";

describe("booking page link", () => {
  it("is the business's own website address", () => {
    expect(bookingPageLink({ brand: { site_url: "https://www.othercabs.co.uk" } })).toBe("https://www.othercabs.co.uk");
    expect(bookingPageLink({ brand: { site_url: "https://www.othercabs.co.uk/" } })).toBe("https://www.othercabs.co.uk");
  });
  it("is null when the business has none, so nobody is sent to another business's site", () => {
    expect(bookingPageLink(null)).toBeNull();
    expect(bookingPageLink({ brand: {} })).toBeNull();
    expect(bookingPageLink({ brand: { site_url: "" } })).toBeNull();
  });
  it("only accepts a plain https domain", () => {
    for (const bad of ["http://x.co.uk", "javascript:alert(1)", "https://x.co.uk/page", "//x.co.uk", "x.co.uk", "https://a b.co.uk"]) {
      expect(bookingPageLink({ brand: { site_url: bad } }), bad).toBeNull();
    }
  });
});
