import { describe, it, expect, afterEach, vi } from "vitest";

// The deployment's own name and website: EV Exec's by default, and a
// different business's when the environment says so.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const load = async () => (await import("./deploymentBrand")).DEPLOYMENT_BRAND;

describe("DEPLOYMENT_BRAND", () => {
  it("defaults to EV Exec", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "");
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_URL", "");
    expect(await load()).toEqual({
      name: "EV Exec",
      site: "https://www.evexec.co.uk",
      loginPlaceholder: "you@evexec.co.uk",
    });
  });

  it("another business sets its own name and site, with nothing of EV Exec's left", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "  Coastal Cars ");
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_URL", "https://www.coastal.test/");
    const b = await load();
    expect(b).toEqual({ name: "Coastal Cars", site: "https://www.coastal.test", loginPlaceholder: "you@coastal.test" });
    expect(JSON.stringify(b)).not.toMatch(/evexec/i);
  });
});
