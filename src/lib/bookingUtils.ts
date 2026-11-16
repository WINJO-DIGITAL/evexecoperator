import type { DbQuoteRequest } from "@/lib/database.types";
import { fmtDate } from "./dates";

// Minimum gap required between two jobs assigned to the same driver on the
// same day, to allow for drive time / handover between transfers.
export const CLASH_BUFFER_MINUTES = 90;

// True when a location reads as an airport: the word "airport" (any case) or a
// bracketed 3-letter code such as "(MAN)". Shared by the booking form, the
// booking drawer, booking creation and the booking cards.
export function looksLikeAirport(s: string | null | undefined): boolean {
  return /\bairport\b|\([A-Za-z]{3}\)/i.test(String(s || ""));
}

export function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Fields a booking form can be pre-filled with (from a quote request).
export interface BookingPrefill {
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  travel_date?: string;
  travel_time?: string;
  pickup?: string;
  dropoff?: string;
  flight_number?: string;
  passengers?: number;
  luggage?: string;
  notes?: string;
}

// Maps a Booking Brain quote request onto the New Transfer form fields.
// Anything without a direct field on the booking (passengers, luggage,
// return trip, contact method) is folded into the notes for the operator
// to review.
export function quoteToPrefill(quote: DbQuoteRequest): BookingPrefill {
  // The quote form only ever collects a plain pickup + drop-off (no separate
  // airport field is set on quote_requests in practice) -- carry those
  // straight over as literal text. Which side is the airport gets detected
  // from the text itself when the operator turns this into a booking, the
  // same way AddBookingModal / the Dispatch board's BookingModal do.
  const pickup = quote.pickup_location ?? quote.airport ?? undefined;
  const dropoff = quote.destination ?? undefined;

  const noteParts: string[] = [];
  if (quote.passengers) noteParts.push(`${quote.passengers} passenger${quote.passengers !== 1 ? "s" : ""}`);
  if (quote.luggage) noteParts.push(`Luggage: ${quote.luggage}`);
  if (quote.return_required) {
    const parts = ["Return trip requested"];
    if (quote.return_date) parts.push(`on ${fmtDate(quote.return_date)}`);
    if (quote.return_time) parts.push(`at ${quote.return_time.slice(0, 5)}`);
    if (quote.return_pickup) parts.push(`from ${quote.return_pickup}`);
    if (quote.return_destination) parts.push(`to ${quote.return_destination}`);
    if (quote.return_airport) parts.push(`(airport: ${quote.return_airport})`);
    if (quote.return_flight_number) parts.push(`flight ${quote.return_flight_number}`);
    noteParts.push(parts.join(" "));
  }
  if (quote.contact_method) noteParts.push(`Contact via ${quote.contact_method}`);
  if (quote.notes) noteParts.push(quote.notes);

  const prefill: BookingPrefill = {
    customer_name: quote.customer_name,
    customer_phone: quote.phone,
  };
  if (quote.email) prefill.customer_email = quote.email;
  if (quote.pickup_date) prefill.travel_date = quote.pickup_date;
  if (quote.pickup_time) prefill.travel_time = quote.pickup_time.slice(0, 5);
  if (pickup) prefill.pickup = pickup;
  if (dropoff) prefill.dropoff = dropoff;
  if (quote.flight_number) prefill.flight_number = quote.flight_number;
  if (noteParts.length) prefill.notes = noteParts.join(" · ");

  return prefill;
}

const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();

/** True when the quote's return (if it names one) is the outbound trip reversed. */
function isReverseReturn(quote: DbQuoteRequest, pickup?: string, dropoff?: string): boolean {
  const rp = norm(quote.return_pickup);
  const rd = norm(quote.return_destination);
  const ra = norm(quote.return_airport);
  if (rp && rp !== norm(dropoff)) return false;
  if (rd && rd !== norm(pickup)) return false;
  if (ra && ra !== norm(pickup) && ra !== norm(dropoff)) return false;
  return true;
}

// The quote as initial values for the operator New Booking form
// (components/operator/BookingModal). A requested return becomes a ticked
// return journey with its date/time/flight, so the return leg is created too.
export function quoteToBookingForm(quote: DbQuoteRequest): Record<string, string | boolean> {
  const p = quoteToPrefill(quote);
  const form: Record<string, string | boolean> = {
    customer: p.customer_name ?? "",
    phone: p.customer_phone ?? "",
    email: p.customer_email ?? "",
    pickup: p.pickup ?? "",
    dropoff: p.dropoff ?? "",
    flight: p.flight_number ?? "",
    date: p.travel_date ?? "",
    time: p.travel_time ?? "",
    notes: p.notes ?? "",
  };
  // Only tick the return when it really is the reverse trip: the form books the
  // return leg as drop-off → pickup, so a different return route (another
  // airport, another address) is left in the notes for the operator to book.
  if (quote.return_required && isReverseReturn(quote, p.pickup, p.dropoff)) {
    form.returnJourney = true;
    form.returnDate = quote.return_date ?? "";
    form.returnTime = quote.return_time ? quote.return_time.slice(0, 5) : "";
    form.returnFlight = quote.return_flight_number ?? "";
  }
  return form;
}
