/**
 * Supabase Edge Function: verify-flight
 *
 * The real flight-verification layer between customer input, flight data,
 * the booking, and the driver (see the operator's brief). Looks up a
 * booking's flight via AeroDataBox, cross-checks it against what was
 * entered, computes a recommended pickup time for arrivals, and persists an
 * append-only audit row to public.flight_verifications.
 *
 * Supersedes the old `check-flight` function (unused, AeroDataBox-based but
 * incomplete, and returned a fabricated "Unknown" flight when unconfigured
 * instead of an honest failure) -- that function has been removed.
 *
 * Required Supabase secret (set via the Dashboard or
 * `supabase secrets set AERODATABOX_API_KEY=...`; this is a Supabase Edge
 * Function secret, not a Vercel environment variable -- this code runs on
 * Supabase's infrastructure):
 *   AERODATABOX_API_KEY -- RapidAPI key from rapidapi.com/aedbx-aerodatabox
 *
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are provided
 * automatically to every Edge Function in this project.
 *
 * Request body (JSON):
 *   {
 *     bookingId: string,                 // required
 *     leg?: "outbound" | "return",       // default "outbound"
 *     direction?: "arrival" | "departure", // override the derived default
 *     source?: "manual" | "auto_initial" | "auto_day_before", // default "manual"
 *     override?: boolean,                // operator proceeding past a warning
 *     overrideReason?: string,
 *   }
 *
 * Called with a staff member's own JWT (operator UI, "Verify Flight" button),
 * the assigned driver's own JWT (driver app, refresh button on their own
 * job), or the service-role key directly (the daily day-before re-verify
 * job in evexec's cron) -- any of these is accepted; a plain anon-key call
 * with no staff/driver relationship to the booking is rejected.
 *
 * Response: { ok: boolean, verification?: {...}, cached?: boolean, error?: string }
 */

import {
  buildVerificationResult,
  normalizeFlightNumber,
  ukLocalToUtcIso,
  type Direction,
} from "./logic.ts";
import { fetchFlight, isAeroDataBoxConfigured } from "./aerodatabox.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Don't hit AeroDataBox again for a manual re-click within this window if
// nothing about the flight being checked has changed (Requirement 7).
const MANUAL_CACHE_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getCaller(authHeader: string | null): Promise<{ id: string; email: string | null } | null> {
  if (!authHeader) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: authHeader },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? null };
}

async function isStaffForTenant(userId: string, tenantId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_users?user_id=eq.${userId}&select=role,tenant_id`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return false;
  const rows: { role: string; tenant_id: string | null }[] = await res.json();
  return rows.some(
    (r) => r.role === "super_admin" || (r.tenant_id === tenantId && (r.role === "operator_admin" || r.role === "dispatcher"))
  );
}

// Mirrors the driver_select_flight_verifications RLS policy: a driver may
// trigger a check only for a booking actually assigned to them.
async function isAssignedDriver(
  callerId: string,
  callerEmail: string | null,
  assignedDriverId: string | null
): Promise<boolean> {
  if (!assignedDriverId) return false;
  if (assignedDriverId === callerId) return true;
  if (!callerEmail) return false;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/drivers?id=eq.${assignedDriverId}&email=eq.${encodeURIComponent(callerEmail)}&select=id`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

interface BookingRow {
  id: string;
  tenant_id: string;
  journey_type: string | null;
  flight_number: string | null;
  airport: string | null;
  travel_date: string | null;
  travel_time: string | null;
  return_flight: string | null;
  return_airport: string | null;
  return_date: string | null;
  return_time: string | null;
  assigned_driver_id: string | null;
}

async function getBooking(bookingId: string): Promise<BookingRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=id,tenant_id,journey_type,flight_number,airport,travel_date,travel_time,return_flight,return_airport,return_date,return_time,assigned_driver_id&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

interface StoredVerification {
  flight_number: string;
  flight_date: string;
  direction: Direction;
  scheduled_arrival: string | null;
  scheduled_departure: string | null;
  verified_at: string;
  [key: string]: unknown;
}

async function getLatestVerification(bookingId: string): Promise<StoredVerification | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/flight_verifications?booking_id=eq.${bookingId}&select=*&order=verified_at.desc&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

function defaultDirection(journeyType: string | null, leg: "outbound" | "return"): Direction {
  const jt = (journeyType ?? "").toLowerCase();
  const isDeparture = jt.includes("to airport");
  const isArrival = jt.includes("from airport");
  if (leg === "outbound") {
    if (isDeparture) return "departure";
    if (isArrival) return "arrival";
    return "arrival";
  }
  // Return leg is conventionally the opposite of the outbound leg.
  if (isDeparture) return "arrival";
  if (isArrival) return "departure";
  return "arrival";
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: {
    bookingId?: string;
    leg?: "outbound" | "return";
    direction?: Direction;
    source?: "manual" | "auto_initial" | "auto_day_before";
    override?: boolean;
    overrideReason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const bookingId = body.bookingId;
  if (!bookingId || !UUID_RE.test(bookingId)) {
    return json({ ok: false, error: "A valid bookingId is required" }, 400);
  }
  const leg = body.leg === "return" ? "return" : "outbound";
  const source = body.source ?? "manual";

  const booking = await getBooking(bookingId);
  if (!booking) return json({ ok: false, error: "Booking not found" }, 404);

  // Auth: accept the service-role key directly (the evexec cron job calling
  // server-to-server), a staff member's own JWT, or the driver actually
  // assigned to this booking (so they can re-check their own job). Reject
  // everyone else -- this writes to the DB and calls a metered third-party API.
  const authHeader = req.headers.get("authorization");
  const isServiceCall = authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
  let verifiedById: string | null = null;
  let verifiedByName: string | null = null;

  if (!isServiceCall) {
    const caller = await getCaller(authHeader);
    if (!caller) return json({ ok: false, error: "Unauthorized" }, 401);
    const staff = await isStaffForTenant(caller.id, booking.tenant_id);
    if (!staff) {
      const driver = await isAssignedDriver(caller.id, caller.email, booking.assigned_driver_id);
      if (!driver) return json({ ok: false, error: "Forbidden" }, 403);
    }
    verifiedById = caller.id;
    verifiedByName = caller.email;
  } else {
    verifiedByName = "System (scheduled re-verification)";
  }

  const flightNumberRaw = leg === "outbound" ? booking.flight_number : booking.return_flight;
  const flightDateRaw = leg === "outbound" ? booking.travel_date : booking.return_date;
  const customerTimeRaw = leg === "outbound" ? booking.travel_time : booking.return_time;
  const airportRaw = leg === "outbound" ? booking.airport : booking.return_airport;

  if (!flightNumberRaw || !flightNumberRaw.trim()) {
    return json({ ok: false, error: "This booking has no flight number to verify." }, 422);
  }
  if (!flightDateRaw) {
    return json({ ok: false, error: "This booking has no travel date to verify against." }, 422);
  }

  const flightNumber = normalizeFlightNumber(flightNumberRaw);
  const direction: Direction = body.direction ?? defaultDirection(booking.journey_type, leg);

  // Cache: skip the AeroDataBox call for a manual re-click if nothing about
  // what we're checking has changed since a recent verification.
  const previousRow = await getLatestVerification(bookingId);
  if (
    source === "manual" &&
    previousRow &&
    previousRow.flight_number === flightNumber &&
    previousRow.flight_date === flightDateRaw &&
    previousRow.direction === direction &&
    Date.now() - new Date(previousRow.verified_at).getTime() < MANUAL_CACHE_MS
  ) {
    return json({ ok: true, verification: previousRow, cached: true });
  }

  let { flight, failed, rawResponse } = await fetchFlight(flightNumber, flightDateRaw);

  // Cross-midnight fallback (Requirement 2): an arrival booked against the
  // day it lands may be indexed by AeroDataBox under the previous day's
  // departure date for an overnight flight. Retry once before concluding
  // the flight doesn't operate on the entered date.
  if (!flight && !failed && direction === "arrival") {
    const retry = await fetchFlight(flightNumber, shiftDate(flightDateRaw, -1));
    if (retry.flight) {
      flight = retry.flight;
      rawResponse = retry.rawResponse;
    }
  }

  const customerPickupIso = ukLocalToUtcIso(flightDateRaw, customerTimeRaw);

  const outcome = buildVerificationResult(
    {
      direction,
      departureAirportInput: direction === "departure" ? airportRaw : null,
      arrivalAirportInput: direction === "arrival" ? airportRaw : null,
      customerPickupIso,
      previous: previousRow
        ? { scheduledArrival: previousRow.scheduled_arrival, scheduledDeparture: previousRow.scheduled_departure }
        : null,
    },
    flight,
    failed
  );

  const insertBody = {
    tenant_id: booking.tenant_id,
    booking_id: bookingId,
    direction,
    flight_number: flightNumber,
    flight_date: flightDateRaw,
    departure_airport_input: direction === "departure" ? airportRaw : null,
    arrival_airport_input: direction === "arrival" ? airportRaw : null,
    customer_time_input: customerTimeRaw,
    result: outcome.result,
    severity: outcome.severity,
    issues: outcome.issues,
    flight_status: outcome.flightStatus,
    departure_iata: outcome.departureIata,
    arrival_iata: outcome.arrivalIata,
    scheduled_departure: outcome.scheduledDeparture,
    scheduled_arrival: outcome.scheduledArrival,
    estimated_departure: outcome.estimatedDeparture,
    estimated_arrival: outcome.estimatedArrival,
    actual_departure: outcome.actualDeparture,
    actual_arrival: outcome.actualArrival,
    recommended_pickup: outcome.recommendedPickup,
    buffer_minutes_used: null,
    raw_response: rawResponse ?? null,
    source,
    verified_by: verifiedById,
    verified_by_name: verifiedByName,
    override: Boolean(body.override),
    override_reason: body.override ? body.overrideReason ?? null : null,
    override_by: body.override ? verifiedById : null,
    override_at: body.override ? new Date().toISOString() : null,
  };

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/flight_verifications`, {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(insertBody),
  });

  if (!insertRes.ok) {
    const text = await insertRes.text().catch(() => "");
    console.error("[verify-flight] Failed to persist verification:", text);
    // Still return the computed result -- a storage failure shouldn't hide
    // a real verification outcome from the operator.
    return json({ ok: true, verification: insertBody, persisted: false });
  }

  const [stored] = await insertRes.json();
  return json({ ok: true, verification: stored, configured: isAeroDataBoxConfigured() });
});
