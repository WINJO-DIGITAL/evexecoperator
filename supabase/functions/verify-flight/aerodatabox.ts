// Thin AeroDataBox client. Deno-only (reads Deno.env, calls fetch) --
// deliberately kept separate from logic.ts so the decision logic stays
// pure and unit-testable without mocking global fetch.
//
// Required secret (Supabase Edge Function secret, NOT a Vercel env var --
// this function runs on Supabase's infrastructure, not Vercel's):
//   AERODATABOX_API_KEY  -- RapidAPI key from rapidapi.com/aedbx-aerodatabox

import type { AeroFlight, AeroFlightLeg } from "./logic.ts";

const AERODATABOX_API_KEY = Deno.env.get("AERODATABOX_API_KEY") ?? "";

export function isAeroDataBoxConfigured(): boolean {
  return Boolean(AERODATABOX_API_KEY.trim());
}

function leg(raw: Record<string, unknown> | null | undefined): AeroFlightLeg {
  const airport = (raw?.airport as Record<string, unknown>) ?? {};
  const scheduled = (raw?.scheduledTime as Record<string, unknown>) ?? {};
  const revised = (raw?.revisedTime as Record<string, unknown>) ?? {};
  const actual = (raw?.actualTime as Record<string, unknown>) ?? {};
  return {
    iata: (airport.iata as string | null) ?? null,
    name: (airport.name as string | null) ?? (airport.municipalityName as string | null) ?? null,
    scheduledUtc: (scheduled.utc as string | null) ?? null,
    revisedUtc: (revised.utc as string | null) ?? null,
    actualUtc: (actual.utc as string | null) ?? null,
  };
}

export interface FetchResult {
  flight: AeroFlight | null;
  failed: boolean;
  rawResponse: unknown;
}

/**
 * Looks up a flight number for a specific operating date.
 * flightDate must be YYYY-MM-DD -- this is the date AeroDataBox uses to
 * disambiguate which day's instance of a recurring flight number to return,
 * not necessarily the arrival date (see Requirement 2, cross-midnight).
 */
export async function fetchFlight(flightNumber: string, flightDate: string): Promise<FetchResult> {
  if (!isAeroDataBoxConfigured()) {
    return { flight: null, failed: true, rawResponse: { reason: "AERODATABOX_API_KEY not configured" } };
  }

  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${flightDate}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": AERODATABOX_API_KEY,
        "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
      },
    });
  } catch (err) {
    console.error("[verify-flight] AeroDataBox fetch threw:", err);
    return { flight: null, failed: true, rawResponse: { error: String(err) } };
  }

  if (res.status === 404) {
    // AeroDataBox's honest "no such flight on that date" -- not a failure,
    // a genuine not-found that logic.ts turns into a red mismatch.
    return { flight: null, failed: false, rawResponse: { status: 404 } };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[verify-flight] AeroDataBox ${res.status}:`, text);
    return { flight: null, failed: true, rawResponse: { status: res.status, body: text } };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    return { flight: null, failed: true, rawResponse: { error: "Invalid JSON from AeroDataBox" } };
  }

  const arr = Array.isArray(raw) ? raw : [raw];
  if (arr.length === 0 || !arr[0]) {
    return { flight: null, failed: false, rawResponse: raw };
  }

  const f = arr[0] as Record<string, unknown>;
  const flight: AeroFlight = {
    number: (f.number as string | null) ?? flightNumber,
    status: (f.status as string | null) ?? null,
    departure: leg(f.departure as Record<string, unknown>),
    arrival: leg(f.arrival as Record<string, unknown>),
  };

  return { flight, failed: false, rawResponse: raw };
}
