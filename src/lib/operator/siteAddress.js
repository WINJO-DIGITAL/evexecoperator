// A business's website address (Settings → Platform, platform owner only). The website matches a
// visitor's domain to the business whose address it is, so it must be an https domain and nothing
// else. The same rule is checked again in the database (set_tenant_site), which also refuses an
// address another business already uses.

const DOMAIN = /^https:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** Tidy what was typed: trim, lower-case, drop a trailing slash. A blank stays blank. */
export function tidySiteAddress(text) {
  return String(text ?? "").trim().toLowerCase().replace(/\/+$/, "");
}

/** A message if the address can't be used, or null. A blank address is allowed (it clears it). */
export function siteAddressProblem(text) {
  const v = tidySiteAddress(text);
  if (v === "") return null;
  if (v.startsWith("http://")) return "Use https, for example https://www.example.co.uk";
  if (!DOMAIN.test(v)) return "Enter just the website address, for example https://www.example.co.uk (no page after the domain).";
  return null;
}
