import { DEPLOYMENT_BRAND } from "@/lib/deploymentBrand";
// A business's look: logo and two colours, from tenants.brand (Settings →
// Branding, saved by the update_tenant_branding RPC). Used by the sidebar and
// invoices; the website's customer invoice PDF reads the same fields.
//
// - primary: the dark band behind the logo (invoice header/footer)
// - accent:  headings, rules and icons on that band
// A business that hasn't chosen colours gets EV Exec's navy and gold. Only the
// EV Exec business falls back to the built-in EV Exec badge; any other
// business without a logo shows its name instead.

export const DEFAULT_PRIMARY = "#0B132B";
export const DEFAULT_ACCENT = "#D7A23F";
export const EV_EXEC_TENANT_ID = "00000000-0000-0000-0000-000000000001";
/** The built-in EV Exec badge as a static file (same image as lib/operator/brandLogo.js). */
export const BUILT_IN_LOGO_SRC = "/ev-exec-badge.png";

const HEX = /^#[0-9A-Fa-f]{6}$/;
export const isHexColour = (v) => HEX.test(String(v || ""));

/** { name, logoUrl, useBuiltInLogo, primary, accent } for a tenants row. */
export function brandFrom(tenant) {
  const b = tenant?.brand || {};
  const colors = b.colors || {};
  const logoUrl = typeof b.logo_url === "string" && b.logo_url ? b.logo_url : null;
  return {
    name: tenant?.name || DEPLOYMENT_BRAND.name,
    logoUrl,
    useBuiltInLogo: !logoUrl && (!tenant || tenant.id === EV_EXEC_TENANT_ID),
    primary: isHexColour(colors.primary) ? colors.primary.toUpperCase() : DEFAULT_PRIMARY,
    accent: isHexColour(colors.accent) ? colors.accent.toUpperCase() : DEFAULT_ACCENT,
  };
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio between two hex colours (1–21). */
export function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Black or white, whichever reads better on the given colour. */
export function textOn(hex) {
  return contrastRatio(hex, "#FFFFFF") >= contrastRatio(hex, "#0F1B33") ? "#FFFFFF" : "#0F1B33";
}

/** A short warning when the accent won't read well on the main colour, else null. */
export function brandWarning(primary, accent) {
  if (!isHexColour(primary) || !isHexColour(accent)) return null;
  const r = contrastRatio(primary, accent);
  return r < 3 ? "The accent colour is hard to read on the main colour. Pick a lighter accent or a darker main colour." : null;
}

/** File checks before uploading a logo: PNG, JPEG or WebP up to 1 MB. Returns a message or null. */
export function logoFileProblem(file) {
  if (!file) return "Choose an image.";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "Use a PNG, JPEG or WebP image.";
  if (file.size > 1024 * 1024) return "The logo must be 1 MB or smaller.";
  return null;
}
