// What the platform charges each operator (Settings → Platform → Fees). Amounts are
// stored in pence; the screen shows and takes pounds. These rates are a RECORD only:
// nothing is billed from them (no Stripe subscription or invoice is created).
// The same limits are checked again in the database (set_default_fees, set_tenant_fees).

export const MAX_MONTHLY_PENCE = 1000000; // £10,000
export const MAX_SETUP_PENCE = 10000000;  // £100,000

/** Pence as pounds for an input box: 4900 -> "49.00". */
export const penceToPounds = (pence) => (Number.isFinite(pence) ? (pence / 100).toFixed(2) : "");

/** £ text to pence. Returns an integer, or null for blank ("use the default"), or NaN if it isn't an amount. */
export function poundsToPence(text) {
  const t = String(text ?? "").trim().replace(/^£/, "").replace(/,/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

/** "£49.00" for display. */
export const formatFee = (pence) => (Number.isFinite(pence) ? `£${(pence / 100).toFixed(2)}` : "—");

/**
 * Checks a monthly and set-up amount typed in pounds. `allowBlank` is true for a
 * business's own rate (blank = use the default) and false for the default rates.
 * Returns { error, monthly, setup } with pence values, or an error message.
 */
export function checkFees({ monthly, setup, allowBlank }) {
  const m = poundsToPence(monthly);
  const s = poundsToPence(setup);
  if (Number.isNaN(m) || Number.isNaN(s)) return { error: "Enter amounts in pounds, for example 49 or 49.50." };
  if (!allowBlank && (m === null || s === null)) return { error: "Both default fees are required." };
  if (m !== null && (m < 0 || m > MAX_MONTHLY_PENCE)) return { error: "The monthly fee must be between £0 and £10,000." };
  if (s !== null && (s < 0 || s > MAX_SETUP_PENCE)) return { error: "The set-up fee must be between £0 and £100,000." };
  return { error: null, monthly: m, setup: s };
}
