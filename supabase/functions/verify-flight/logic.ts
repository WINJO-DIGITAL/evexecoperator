// Pure flight-verification decision logic -- no Deno globals, no fetch, no
// Supabase client. Kept dependency-free so the exact same module can be
// imported both by the Edge Function (index.ts, Deno runtime) and by the
// Vitest suite (logic.test.ts, Node runtime) -- one implementation, tested
// for real rather than a parallel reimplementation that could drift.

export type Direction = "arrival" | "departure";
export type Severity = "green" | "amber" | "red";
export type Result = "verified" | "mismatch" | "unavailable" | "error";

export interface AeroFlightLeg {
  iata: string | null;
  name: string | null;
  scheduledUtc: string | null;
  revisedUtc: string | null;
  actualUtc: string | null;
}

export interface AeroFlight {
  number: string;
  status: string | null;
  departure: AeroFlightLeg;
  arrival: AeroFlightLeg;
}

export interface PreviousVerification {
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
}

export interface VerifyInput {
  direction: Direction;
  departureAirportInput: string | null;
  arrivalAirportInput: string | null;
  /** Combined travel_date + travel_time as an ISO string, or null if unset. */
  customerPickupIso: string | null;
  previous?: PreviousVerification | null;
}

export interface VerifyOutcome {
  result: Result;
  severity: Severity;
  issues: string[];
  flightStatus: string | null;
  departureIata: string | null;
  arrivalIata: string | null;
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  /** The flight's own actual/estimated/scheduled landing time -- no buffer applied. */
  recommendedPickup: string | null;
}

// Minimum-viable alias table for the UK regionals and common leisure/
// business destinations this operator actually serves. Airport fields on a
// booking are free text ("Manchester", "Manchester T2", "Alicante"), so an
// exact IATA-code match is never expected from the input side -- this maps
// the API's IATA code back to the words an operator would actually type.
const AIRPORT_ALIASES: Record<string, string[]> = {
  MAN: ["manchester"],
  LPL: ["liverpool", "john lennon"],
  LBA: ["leeds", "bradford"],
  LHR: ["heathrow"],
  LGW: ["gatwick"],
  STN: ["stansted"],
  LTN: ["luton"],
  BHX: ["birmingham"],
  EMA: ["east midlands"],
  NCL: ["newcastle"],
  ALC: ["alicante"],
  AGP: ["malaga"],
  PMI: ["palma", "mallorca"],
  MCO: ["orlando"],
  DXB: ["dubai"],
  BCN: ["barcelona"],
  FAO: ["faro"],
  TFS: ["tenerife"],
  LPA: ["gran canaria", "las palmas"],
  ACE: ["lanzarote"],
};

export function normalizeFlightNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** True during British Summer Time for the given (approximate) UTC instant --
 * last Sunday in March 01:00 UTC to last Sunday in October 01:00 UTC. */
function isUkBst(utcDate: Date): boolean {
  const year = utcDate.getUTCFullYear();
  const lastSunday = (monthIndex: number) => {
    const d = new Date(Date.UTC(year, monthIndex + 1, 0)); // last day of that month
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d;
  };
  const start = lastSunday(2); // March
  start.setUTCHours(1, 0, 0, 0);
  const end = lastSunday(9); // October
  end.setUTCHours(1, 0, 0, 0);
  return utcDate >= start && utcDate < end;
}

/** Converts a UK local wall-clock date+time (as entered on a booking) to a
 * UTC ISO string, so it can be compared directly against AeroDataBox's UTC
 * timestamps without a systematic BST/GMT offset error. */
export function ukLocalToUtcIso(dateStr: string | null | undefined, timeStr: string | null | undefined): string | null {
  if (!dateStr || !timeStr) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(timeStr.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  const naiveUtc = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00Z`);
  if (Number.isNaN(naiveUtc.getTime())) return null;
  const offsetHours = isUkBst(naiveUtc) ? 1 : 0;
  return new Date(naiveUtc.getTime() - offsetHours * 3600000).toISOString();
}

/** True if the free-text airport the operator entered plausibly refers to
 * the airport AeroDataBox returned. Absence of data on either side is never
 * treated as a mismatch -- there is nothing to contradict. */
export function airportMatches(
  input: string | null | undefined,
  iata: string | null,
  name: string | null
): boolean {
  if (!input || !input.trim()) return true;
  if (!iata && !name) return true;
  const norm = input.trim().toLowerCase();
  if (iata && norm.includes(iata.toLowerCase())) return true;
  if (name) {
    const n = name.toLowerCase();
    if (norm.includes(n) || n.includes(norm)) return true;
  }
  const aliases = iata ? AIRPORT_ALIASES[iata.toUpperCase()] : undefined;
  if (aliases && aliases.some((a) => norm.includes(a))) return true;
  return false;
}

function bestKnownTime(leg: AeroFlightLeg): string | null {
  return leg.actualUtc ?? leg.revisedUtc ?? leg.scheduledUtc;
}

/** Minutes between two ISO timestamps (a - b), rounded. */
export function diffMinutes(aIso: string, bIso: string): number {
  return Math.round((new Date(aIso).getTime() - new Date(bIso).getTime()) / 60000);
}

const UNAVAILABLE: VerifyOutcome = {
  result: "error",
  severity: "red",
  issues: ["Flight verification unavailable. Please verify manually."],
  flightStatus: null,
  departureIata: null,
  arrivalIata: null,
  scheduledDeparture: null,
  scheduledArrival: null,
  estimatedDeparture: null,
  estimatedArrival: null,
  actualDeparture: null,
  actualArrival: null,
  recommendedPickup: null,
};

const NOT_OPERATING: VerifyOutcome = {
  result: "mismatch",
  severity: "red",
  issues: ["Flight number does not operate on this date."],
  flightStatus: null,
  departureIata: null,
  arrivalIata: null,
  scheduledDeparture: null,
  scheduledArrival: null,
  estimatedDeparture: null,
  estimatedArrival: null,
  actualDeparture: null,
  actualArrival: null,
  recommendedPickup: null,
};

/** The threshold below which a customer-time vs flight-time gap is not worth
 * flagging -- ordinary rounding/estimation noise, not a real mismatch. */
const PICKUP_DIFF_THRESHOLD_MINUTES = 20;

export function buildVerificationResult(
  input: VerifyInput,
  flight: AeroFlight | null,
  apiFailed: boolean
): VerifyOutcome {
  if (apiFailed) return { ...UNAVAILABLE, issues: [...UNAVAILABLE.issues] };
  if (!flight) return { ...NOT_OPERATING, issues: [...NOT_OPERATING.issues] };

  const dep = flight.departure;
  const arr = flight.arrival;
  const issues: string[] = [];

  if (!airportMatches(input.departureAirportInput, dep.iata, dep.name)) {
    issues.push("Departure airport does not match booking.");
  }
  if (!airportMatches(input.arrivalAirportInput, arr.iata, arr.name)) {
    issues.push("Arrival airport does not match booking.");
  }

  let severity: Severity = "green";
  let result: Result = "verified";
  if (issues.length) {
    severity = "red";
    result = "mismatch";
  }

  // Detect drift against the previous verification of this same booking --
  // a schedule change since we last checked is worth a flag even if
  // everything else still matches.
  if (severity !== "red" && input.previous) {
    const prevRelevant =
      input.direction === "arrival" ? input.previous.scheduledArrival : input.previous.scheduledDeparture;
    const curRelevant = input.direction === "arrival" ? arr.scheduledUtc : dep.scheduledUtc;
    if (prevRelevant && curRelevant && prevRelevant !== curRelevant) {
      issues.push("Flight information has changed.");
      severity = "amber";
    }
  }

  const relevantBest = bestKnownTime(input.direction === "arrival" ? arr : dep);

  if (severity !== "red" && input.customerPickupIso && relevantBest) {
    const diff = diffMinutes(input.customerPickupIso, relevantBest);
    if (Math.abs(diff) >= PICKUP_DIFF_THRESHOLD_MINUTES) {
      const label = input.direction === "arrival" ? "flight arrival" : "flight departure";
      const rel = diff > 0 ? "after" : "before";
      issues.push(`Customer pickup time differs from ${label} by ${Math.abs(diff)} minutes (${rel}).`);
      if (severity === "green") severity = "amber";
    }
  }

  if (!issues.length) issues.push("Flight verified.");

  // Recommended pickup is the flight's own landing time (actual, else
  // estimated, else scheduled) -- no buffer added. Arrivals only
  // (Requirement 5's own scope; a departure has no "pickup" to recommend).
  const recommendedPickup: string | null = input.direction === "arrival" ? relevantBest : null;

  return {
    result,
    severity,
    issues,
    flightStatus: flight.status,
    departureIata: dep.iata,
    arrivalIata: arr.iata,
    scheduledDeparture: dep.scheduledUtc,
    scheduledArrival: arr.scheduledUtc,
    estimatedDeparture: dep.revisedUtc,
    estimatedArrival: arr.revisedUtc,
    actualDeparture: dep.actualUtc,
    actualArrival: arr.actualUtc,
    recommendedPickup,
  };
}
