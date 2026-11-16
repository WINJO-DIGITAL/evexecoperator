import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, DEFAULT_PRIMARY, EV_EXEC_TENANT_ID, brandFrom, brandWarning, contrastRatio, logoFileProblem, textOn } from "./brand";

describe("brandFrom", () => {
  it("uses EV Exec's colours and built-in logo when nothing is set", () => {
    expect(brandFrom({ id: EV_EXEC_TENANT_ID, name: "EV Exec", brand: {} })).toEqual({
      name: "EV Exec", logoUrl: null, useBuiltInLogo: true, primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT,
    });
  });

  it("never gives another business the EV Exec logo", () => {
    expect(brandFrom({ id: "other", name: "Acme Cars", brand: {} }).useBuiltInLogo).toBe(false);
  });

  it("reads the saved logo and colours, ignoring bad values", () => {
    const b = brandFrom({ id: "other", name: "Acme", brand: { logo_url: "https://x.supabase.co/l.png", colors: { primary: "#112233", accent: "red" } } });
    expect(b.logoUrl).toBe("https://x.supabase.co/l.png");
    expect(b.useBuiltInLogo).toBe(false);
    expect(b.primary).toBe("#112233");
    expect(b.accent).toBe(DEFAULT_ACCENT);
  });
});

describe("colour checks", () => {
  it("measures contrast", () => {
    expect(Math.round(contrastRatio("#000000", "#FFFFFF"))).toBe(21);
    expect(textOn("#0B132B")).toBe("#FFFFFF");
    expect(textOn("#FFF8E1")).toBe("#0F1B33");
  });
  it("warns about an accent that won't read on the main colour", () => {
    expect(brandWarning(DEFAULT_PRIMARY, DEFAULT_ACCENT)).toBeNull();
    expect(brandWarning("#0B132B", "#1A2340")).toMatch(/hard to read/);
  });
});

describe("logoFileProblem", () => {
  it("accepts small PNG/JPEG/WebP and refuses anything else", () => {
    expect(logoFileProblem({ type: "image/png", size: 50_000 })).toBeNull();
    expect(logoFileProblem({ type: "image/svg+xml", size: 1000 })).toMatch(/PNG/);
    expect(logoFileProblem({ type: "image/png", size: 2 * 1024 * 1024 })).toMatch(/1 MB/);
    expect(logoFileProblem(null)).toMatch(/Choose/);
  });
});
