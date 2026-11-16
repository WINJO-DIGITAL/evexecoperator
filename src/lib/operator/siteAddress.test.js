import { describe, it, expect } from "vitest";
import { siteAddressProblem, tidySiteAddress } from "./siteAddress";

describe("website address", () => {
  it("tidies case, spaces and a trailing slash", () => {
    expect(tidySiteAddress("  HTTPS://WWW.Example.co.uk/ ")).toBe("https://www.example.co.uk");
    expect(tidySiteAddress(null)).toBe("");
  });
  it("accepts an https domain, with or without www", () => {
    expect(siteAddressProblem("https://www.example.co.uk")).toBeNull();
    expect(siteAddressProblem("https://example.co.uk/")).toBeNull();
    expect(siteAddressProblem("https://sub.example.co.uk")).toBeNull();
  });
  it("accepts a blank address (it clears the setting)", () => {
    expect(siteAddressProblem("")).toBeNull();
    expect(siteAddressProblem("   ")).toBeNull();
  });
  it("refuses plain http, a page, a port and things that are not a domain", () => {
    expect(siteAddressProblem("http://example.co.uk")).toMatch(/https/);
    for (const bad of ["https://example.co.uk/page", "https://example.co.uk:8080", "example.co.uk", "https://localhost", "https://", "https://exa mple.co.uk", "ftp://example.co.uk"]) {
      expect(siteAddressProblem(bad), bad).not.toBeNull();
    }
  });
});
