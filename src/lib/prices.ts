// Fixed prices per operator. Each business keeps its own list in
// tenants.pricing (edited in Settings → Prices, saved by the
// update_tenant_pricing RPC); the website reads the same row to price its
// bookings. DEFAULT_PRICING is only the fallback when a business has no list
// yet (it is EV Exec's list as it was seeded on 15/10/2026).
export type AirportPrice = { name: string; code?: string | null; oneWay: number; ret: number };
export type Pricing = { airports: AirportPrice[]; extraStop: number };

export const AIRPORT_PRICES: AirportPrice[] = [
  { name: "Manchester Airport", code: "MAN", oneWay: 90, ret: 160 },
  { name: "Liverpool Airport", code: "LPL", oneWay: 95, ret: 170 },
  { name: "Leeds Bradford Airport", code: "LBA", oneWay: 135, ret: 250 },
  { name: "Birmingham Airport", code: "BHX", oneWay: 215, ret: 410 },
  { name: "Newcastle Airport", code: "NCL", oneWay: 250, ret: 480 },
];

/** Extra charge per additional stop when a business hasn't set its own. */
export const EXTRA_STOP_PRICE = 5;

export const DEFAULT_PRICING: Pricing = { airports: AIRPORT_PRICES, extraStop: EXTRA_STOP_PRICE };

type StoredAirport = { name?: unknown; code?: unknown; one_way?: unknown; return_fare?: unknown };
type StoredPricing = { airports?: unknown; extra_stop?: unknown } | null | undefined;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** tenants.pricing as stored → Pricing; the default list if it is missing or unusable. */
export function pricingFromTenant(stored: StoredPricing): Pricing {
  if (!stored || !Array.isArray(stored.airports)) return DEFAULT_PRICING;
  const airports: AirportPrice[] = (stored.airports as StoredAirport[]).flatMap((a) => {
    const name = String(a?.name ?? "").trim();
    const oneWay = num(a?.one_way);
    const ret = num(a?.return_fare);
    if (!name || oneWay == null || ret == null) return [];
    return [{ name, code: typeof a?.code === "string" ? a.code : null, oneWay, ret }];
  });
  if (!airports.length) return DEFAULT_PRICING;
  return { airports, extraStop: num(stored.extra_stop) ?? 0 };
}

/** Pricing → the shape update_tenant_pricing expects. */
export function pricingForSave(p: Pricing) {
  return {
    airports: p.airports.map((a) => ({
      name: a.name.trim(),
      ...(a.code ? { code: a.code.trim().toUpperCase() } : {}),
      one_way: a.oneWay,
      return_fare: a.ret,
    })),
    extra_stop: p.extraStop,
  };
}

/** What's wrong with a price list before saving (same rules as the database), or null. */
export function pricingProblem(p: Pricing): string | null {
  if (p.airports.length > 30) return "At most 30 airports.";
  const seen = new Set<string>();
  for (const a of p.airports) {
    const name = a.name.trim();
    if (!name) return "Every row needs a name.";
    if (name.length > 80) return `"${name.slice(0, 20)}…" is too long (max 80 characters).`;
    if (seen.has(name.toLowerCase())) return `${name} is listed twice.`;
    seen.add(name.toLowerCase());
    if (a.code && !/^[A-Za-z]{3,4}$/.test(a.code.trim())) return `The code for ${name} must be 3 or 4 letters.`;
    if (!(a.oneWay > 0) || a.oneWay > 10000) return `Enter a one-way price for ${name} (up to £10,000).`;
    if (!(a.ret > 0) || a.ret > 20000) return `Enter a return price for ${name} (up to £20,000).`;
  }
  if (!(p.extraStop >= 0) || p.extraStop > 500) return "The extra stop charge must be between £0 and £500.";
  return null;
}

function findAirport(location: string | null | undefined, airports: AirportPrice[]): AirportPrice | null {
  const s = String(location || "").toLowerCase();
  if (!s) return null;
  return (
    airports.find((a) => {
      const base = a.name.toLowerCase().replace(/\s+airport\b/, "").trim();
      if (base && s.includes(base)) return true;
      return Boolean(a.code) && new RegExp(`\\b${String(a.code).toLowerCase()}\\b`).test(s);
    }) ?? null
  );
}

/** The fixed one-way price for a location naming one of the listed places, else null. */
export function fixedOneWayPrice(location: string | null | undefined, airports: AirportPrice[] = AIRPORT_PRICES): number | null {
  return findAirport(location, airports)?.oneWay ?? null;
}

/**
 * The fixed price the customer pays for a booking: the one-way fare, or the
 * whole return fare for a return. A return is paid once, on the outbound
 * booking (Manchester return £160 is one £160 payment); its return leg is a
 * £0 job, matching how the website stores return bookings.
 */
export function fixedTripPrice(
  location: string | null | undefined,
  isReturn: boolean,
  airports: AirportPrice[] = AIRPORT_PRICES,
): number | null {
  const a = findAirport(location, airports);
  if (!a) return null;
  return isReturn ? a.ret : a.oneWay;
}
