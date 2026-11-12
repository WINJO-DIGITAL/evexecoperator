// Legal details for this business (tenants.brand.legal), as the Legal settings
// screen edits them. The rules match the website's lib/legal/details.js, which
// builds the terms and privacy pages from the same details. The database
// (update_tenant_legal) checks every value again on save.

export const LEGAL_STATUSES = ["sole trader", "limited company", "partnership"];
export const LEGAL_JURISDICTIONS = [
  { value: "england-wales", label: "England and Wales" },
  { value: "scotland", label: "Scotland" },
  { value: "northern-ireland", label: "Northern Ireland" },
];

const str = (v) => (typeof v === "string" ? v : "");

// The form's starting values, from the business's own row.
export function legalFormFromTenant(tenant) {
  const brand = tenant?.brand && typeof tenant.brand === "object" ? tenant.brand : {};
  const l = brand.legal && typeof brand.legal === "object" ? brand.legal : {};
  return {
    legalName: str(l.legal_name),
    status: LEGAL_STATUSES.includes(l.status) ? l.status : "",
    companyNumber: str(l.company_number),
    registeredAddress: str(l.registered_address),
    base: str(l.base),
    area: str(l.area),
    service: str(l.service),
    fleet: str(l.fleet),
    luggage: str(l.luggage),
    jurisdiction: LEGAL_JURISDICTIONS.some((j) => j.value === l.jurisdiction) ? l.jurisdiction : "england-wales",
    pointsName: str(l.points_name),
    icoRegistration: str(l.ico_registration),
    insuranceConfirmed: l.insurance_confirmed === true,
    // Read-only here: set on the business record, not in this screen.
    licence: str(brand.licence),
    name: str(tenant?.name),
    email: str(tenant?.contact_email),
    phone: str(tenant?.contact_phone),
  };
}

// What the database saves: only the fields this screen owns.
export function legalPayload(form) {
  return {
    legal_name: form.legalName.trim(),
    status: form.status,
    company_number: form.companyNumber.trim(),
    registered_address: form.registeredAddress.trim(),
    base: form.base.trim(),
    area: form.area.trim(),
    service: form.service.trim(),
    fleet: form.fleet.trim(),
    luggage: form.luggage.trim(),
    jurisdiction: form.jurisdiction,
    points_name: form.pointsName.trim(),
    ico_registration: form.icoRegistration.trim(),
    insurance_confirmed: form.insuranceConfirmed,
  };
}

// The details still missing before the terms and privacy policy can be published.
// Same list as the website's legalGaps(): a limited company must also give its
// company number and registered office.
export function legalGaps(form) {
  const gaps = [];
  const need = (key, label, value) => { if (!value || !String(value).trim()) gaps.push({ key, label }); };
  need("name", "Business name (set in Business details)", form.name);
  need("status", "Trading status (sole trader, limited company or partnership)", form.status);
  if (form.status === "limited company") {
    need("company_number", "Company number", form.companyNumber);
    need("registered_address", "Registered office address", form.registeredAddress);
  }
  need("licence", "Private hire operator licence number (set by the platform owner)", form.licence);
  need("email", "Contact email (set in Business details)", form.email);
  need("phone", "Contact phone (set in Business details)", form.phone);
  need("base", "Where you are based (town and county)", form.base);
  need("area", "The area you serve", form.area);
  if (!form.insuranceConfirmed) {
    gaps.push({ key: "insurance", label: "Confirm you hold hire & reward and public liability insurance, and that your drivers are DBS checked" });
  }
  return gaps;
}
