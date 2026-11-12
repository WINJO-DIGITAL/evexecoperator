import { describe, it, expect } from "vitest";
import { legalFormFromTenant, legalPayload, legalGaps, bandsProblem } from "./legal";

const tenant = {
  name: "Coastal Cars",
  contact_email: "hello@coastal.test",
  contact_phone: "07123456789",
  brand: {
    licence: "PHO1234",
    legal: {
      legal_name: "Coastal Cars Ltd", status: "limited company", company_number: "12345678",
      registered_address: "1 High Street, Southport", base: "Southport, Merseyside", area: "Southport",
      service: "airport transfers", fleet: "three saloons", luggage: "four suitcases", jurisdiction: "scotland",
      points_name: "", ico_registration: "ZA123456", insurance_confirmed: true,
    },
  },
};

describe("legal form", () => {
  it("starts from the business's own details, with the licence and contact read-only", () => {
    const f = legalFormFromTenant(tenant);
    expect(f.legalName).toBe("Coastal Cars Ltd");
    expect(f.jurisdiction).toBe("scotland");
    expect(f.insuranceConfirmed).toBe(true);
    expect(f.licence).toBe("PHO1234");
    expect(f.email).toBe("hello@coastal.test");
  });

  it("starts empty and England and Wales for a business that has set nothing", () => {
    const f = legalFormFromTenant({ name: "New", brand: {} });
    expect(f.status).toBe("");
    expect(f.legalName).toBe("");
    expect(f.jurisdiction).toBe("england-wales");
    expect(f.insuranceConfirmed).toBe(false);
  });

  it("ignores an unknown status or jurisdiction rather than saving it", () => {
    const f = legalFormFromTenant({ brand: { legal: { status: "plc", jurisdiction: "wales" } } });
    expect(f.status).toBe("");
    expect(f.jurisdiction).toBe("england-wales");
  });

  it("saves only the fields this screen owns, trimmed", () => {
    const p = legalPayload({ ...legalFormFromTenant(tenant), legalName: "  Coastal Cars Ltd  ", licence: "IGNORED" });
    expect(p.legal_name).toBe("Coastal Cars Ltd");
    expect(p).not.toHaveProperty("licence");
    expect(p).not.toHaveProperty("email");
    expect(Object.keys(p).sort()).toEqual([
      "area", "base", "company_number", "custom_terms", "fleet", "ico_registration", "insurance_confirmed", "jurisdiction",
      "legal_name", "luggage", "numbers_confirmed", "points_name", "policy", "privacy_extra", "registered_address", "service", "status", "terms_mode",
    ]);
  });
});

describe("legal gaps", () => {
  it("lists nothing when every detail is set and insurance is confirmed", () => {
    expect(legalGaps(legalFormFromTenant(tenant))).toEqual([]);
  });

  it("lists the missing details for a business that has set nothing", () => {
    const keys = legalGaps(legalFormFromTenant({ name: "New", contact_email: "a@b.test", contact_phone: "07123456789", brand: {} })).map((g) => g.key);
    expect(keys.sort()).toEqual(["area", "base", "insurance", "licence", "status"].sort());
  });

  it("asks for the company number and registered office of a limited company", () => {
    const f = { ...legalFormFromTenant(tenant), companyNumber: "", registeredAddress: "" };
    expect(legalGaps(f).map((g) => g.key)).toEqual(expect.arrayContaining(["company_number", "registered_address"]));
  });

  it("asks for insurance until it is confirmed", () => {
    expect(legalGaps({ ...legalFormFromTenant(tenant), insuranceConfirmed: false }).map((g) => g.key)).toContain("insurance");
  });
});

describe("cancellation bands on the Legal screen", () => {
  it("start from the standard bands, or from the operator's own", () => {
    expect(legalFormFromTenant({ brand: {} }).bands).toEqual([
      { hours: "48", pct: "0" }, { hours: "24", pct: "25" }, { hours: "2", pct: "50" },
    ]);
    const own = legalFormFromTenant({ brand: { legal: { policy: { standard: [
      { hours: 72, pct: 0 }, { hours: 24, pct: 50 }, { hours: 4, pct: 75 },
    ] } } } });
    expect(own.bands[1]).toEqual({ hours: "24", pct: "50" });
  });

  it("accept a sensible set of bands, and save them as numbers", () => {
    const bands = [{ hours: "72", pct: "0" }, { hours: "24", pct: "50" }, { hours: "4", pct: "75" }];
    expect(bandsProblem(bands)).toBeNull();
    expect(legalPayload({ ...legalFormFromTenant({ brand: {} }), bands }).policy).toEqual({ standard: [
      { hours: 72, pct: 0 }, { hours: 24, pct: 50 }, { hours: 4, pct: 75 },
    ] });
  });

  it("refuse anything the database would refuse", () => {
    const base = [{ hours: "72", pct: "0" }, { hours: "24", pct: "50" }, { hours: "4", pct: "75" }];
    expect(bandsProblem([{ hours: "", pct: "0" }, base[1], base[2]])).toMatch(/Fill in all three/);
    expect(bandsProblem([{ hours: "72", pct: "5" }, base[1], base[2]])).toMatch(/first band must be 0%/);
    expect(bandsProblem([base[0], { hours: "96", pct: "50" }, base[2]])).toMatch(/closer to pickup/);
    expect(bandsProblem([base[0], base[1], { hours: "4", pct: "40" }])).toMatch(/charge more/);
    expect(bandsProblem([base[0], base[1], { hours: "4", pct: "150" }])).toMatch(/between 0 and 100/);
    expect(bandsProblem([base[0], base[1], { hours: "0", pct: "75" }])).toMatch(/between 1 and 336/);
  });
});

import { termsProblem, legalPayload as _lp, legalFormFromTenant as _lf } from "./legal";
describe("custom terms", () => {
  const base = { customTerms: "", privacyExtra: "", termsMode: "standard", numbersConfirmed: false };
  it("standard needs nothing", () => expect(termsProblem(base)).toBeNull());
  it("custom needs text", () => expect(termsProblem({ ...base, termsMode: "custom", numbersConfirmed: true })).toMatch(/Write your terms/));
  it("custom needs the tick", () => expect(termsProblem({ ...base, termsMode: "custom", customTerms: "x".repeat(120) })).toMatch(/Tick the box/));
  it("custom with both is fine", () => expect(termsProblem({ ...base, termsMode: "custom", customTerms: "x".repeat(120), numbersConfirmed: true })).toBeNull());
  it("round-trips through the tenant row", () => {
    const form = _lf({ brand: { legal: { terms_mode: "custom", custom_terms: "abc", privacy_extra: "p", numbers_confirmed: true } } });
    expect(form.termsMode).toBe("custom");
    expect(_lp(form)).toMatchObject({ terms_mode: "custom", custom_terms: "abc", privacy_extra: "p", numbers_confirmed: true });
  });
});

import { licenceProblem } from "./legal";
describe("licence number", () => {
  it("accepts a normal licence and empty", () => {
    expect(licenceProblem("PHO0079")).toBeNull();
    expect(licenceProblem(" pho 0079 ")).toBeNull();
    expect(licenceProblem("")).toBeNull();
  });
  it("refuses too short, too long or symbols", () => {
    expect(licenceProblem("AB")).toMatch(/3 to 20/);
    expect(licenceProblem("A".repeat(21))).toMatch(/3 to 20/);
    expect(licenceProblem("<b>1</b>")).toMatch(/3 to 20/);
  });
});
