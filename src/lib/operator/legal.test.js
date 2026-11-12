import { describe, it, expect } from "vitest";
import { legalFormFromTenant, legalPayload, legalGaps } from "./legal";

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
      "area", "base", "company_number", "fleet", "ico_registration", "insurance_confirmed", "jurisdiction",
      "legal_name", "luggage", "points_name", "registered_address", "service", "status",
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
