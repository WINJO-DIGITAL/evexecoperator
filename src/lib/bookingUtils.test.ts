import { describe, it, expect } from "vitest";
import { timeToMinutes, quoteToPrefill, quoteToBookingForm, looksLikeAirport } from "./bookingUtils";
import type { DbQuoteRequest } from "./database.types";

describe("timeToMinutes", () => {
  it("returns null for null input", () => {
    expect(timeToMinutes(null)).toBeNull();
  });

  it("converts HH:MM to minutes since midnight", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("01:30")).toBe(90);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("handles HH:MM:SS by ignoring the seconds component", () => {
    expect(timeToMinutes("09:15:00")).toBe(555);
  });

  it("returns null for an invalid string", () => {
    expect(timeToMinutes("not-a-time")).toBeNull();
  });
});

function makeQuote(overrides: Partial<DbQuoteRequest> = {}): DbQuoteRequest {
  return {
    id: "q1",
    customer_name: "Jane Doe",
    phone: "07123456789",
    email: null,
    pickup_location: null,
    destination: null,
    pickup_date: null,
    pickup_time: null,
    passengers: null,
    luggage: null,
    return_required: null,
    return_date: null,
    return_time: null,
    return_pickup: null,
    return_destination: null,
    return_airport: null,
    return_flight_number: null,
    journey_type: null,
    airport: null,
    flight_number: null,
    contact_method: null,
    notes: null,
    status: "new",
    created_at: null,
    ...overrides,
  };
}

describe("quoteToPrefill", () => {
  it("maps basic customer and contact details", () => {
    const prefill = quoteToPrefill(makeQuote({ email: "jane@example.com" }));
    expect(prefill.customer_name).toBe("Jane Doe");
    expect(prefill.customer_phone).toBe("07123456789");
    expect(prefill.customer_email).toBe("jane@example.com");
  });

  it("uses the quote's airport as the literal pickup when no pickup_location is set", () => {
    const prefill = quoteToPrefill(makeQuote({ airport: "Heathrow", destination: "Central London" }));
    expect(prefill.pickup).toBe("Heathrow");
    expect(prefill.dropoff).toBe("Central London");
  });

  it("uses pickup_location as the literal pickup when set", () => {
    const prefill = quoteToPrefill(makeQuote({ pickup_location: "Home address" }));
    expect(prefill.pickup).toBe("Home address");
  });

  it("copies travel date/time and trims seconds from pickup_time", () => {
    const prefill = quoteToPrefill(makeQuote({ pickup_date: "2026-07-01", pickup_time: "14:30:00" }));
    expect(prefill.travel_date).toBe("2026-07-01");
    expect(prefill.travel_time).toBe("14:30");
  });

  it("folds passengers, luggage, return trip and contact method into notes", () => {
    const prefill = quoteToPrefill(makeQuote({
      passengers: 2,
      luggage: "2 large cases",
      return_required: true,
      return_date: "2026-07-05",
      return_time: "10:00:00",
      return_pickup: "Hotel",
      return_destination: "Heathrow",
      return_airport: "Heathrow",
      return_flight_number: "BA123",
      contact_method: "WhatsApp",
      notes: "Please call on arrival",
    }));

    expect(prefill.notes).toContain("2 passengers");
    expect(prefill.notes).toContain("Luggage: 2 large cases");
    expect(prefill.notes).toContain("Return trip requested on 05/07/2026 at 10:00 from Hotel to Heathrow (airport: Heathrow) flight BA123");
    expect(prefill.notes).toContain("Contact via WhatsApp");
    expect(prefill.notes).toContain("Please call on arrival");
  });

  it("uses singular 'passenger' for a single passenger", () => {
    const prefill = quoteToPrefill(makeQuote({ passengers: 1 }));
    expect(prefill.notes).toContain("1 passenger");
    expect(prefill.notes).not.toContain("1 passengers");
  });

  it("omits notes entirely when there is nothing to fold in", () => {
    const prefill = quoteToPrefill(makeQuote());
    expect(prefill.notes).toBeUndefined();
  });

  it("includes a flight number when provided", () => {
    const prefill = quoteToPrefill(makeQuote({ flight_number: "BA456" }));
    expect(prefill.flight_number).toBe("BA456");
  });
});
describe("quoteToBookingForm", () => {
  it("maps a quote onto the operator booking form fields", () => {
    const form = quoteToBookingForm(makeQuote({
      email: "jane@example.com",
      pickup_location: "Lytham St Annes",
      destination: "Manchester Airport",
      pickup_date: "2026-11-02",
      pickup_time: "04:30:00",
      flight_number: "EZY123",
    }));
    expect(form).toMatchObject({
      customer: "Jane Doe",
      phone: "07123456789",
      email: "jane@example.com",
      pickup: "Lytham St Annes",
      dropoff: "Manchester Airport",
      date: "2026-11-02",
      time: "04:30",
      flight: "EZY123",
    });
    expect(form.returnJourney).toBeUndefined();
  });

  it("leaves the return unticked when the quote's return route isn't the reverse", () => {
    const form = quoteToBookingForm(makeQuote({
      pickup_location: "Lytham St Annes",
      destination: "Manchester Airport",
      return_required: true,
      return_date: "2026-11-09",
      return_pickup: "Liverpool Airport",
    }));
    expect(form.returnJourney).toBeUndefined();
    expect(String(form.notes)).toContain("Liverpool Airport");
  });

  it("ticks the return when the quote's return route is the reverse", () => {
    const form = quoteToBookingForm(makeQuote({
      pickup_location: "Lytham St Annes",
      destination: "Manchester Airport",
      return_required: true,
      return_pickup: "manchester airport",
      return_destination: "Lytham St Annes",
    }));
    expect(form.returnJourney).toBe(true);
  });

  it("ticks the return journey when the quote asks for one", () => {
    const form = quoteToBookingForm(makeQuote({
      return_required: true,
      return_date: "2026-11-09",
      return_time: "18:15:00",
      return_flight_number: "EZY124",
    }));
    expect(form).toMatchObject({ returnJourney: true, returnDate: "2026-11-09", returnTime: "18:15", returnFlight: "EZY124" });
  });
});

describe("looksLikeAirport", () => {
  it("spots airports however they're typed", () => {
    expect(looksLikeAirport("Birmingham Airport")).toBe(true);
    expect(looksLikeAirport("manchester airport T2")).toBe(true);
    expect(looksLikeAirport("Manchester Airport (MAN)")).toBe(true);
    expect(looksLikeAirport("LPL (lpl)")).toBe(true);
  });
  it("leaves ordinary addresses alone", () => {
    expect(looksLikeAirport("18 Lowther Rd, Fleetwood")).toBe(false);
    expect(looksLikeAirport("Airportside Lane")).toBe(false);
    expect(looksLikeAirport(null)).toBe(false);
  });
});
