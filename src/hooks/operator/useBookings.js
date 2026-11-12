"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import { useRealtimeBookings } from "./useRealtimeBookings";
import {
  validateBookingPayload,
  validateStatusTransition,
  BOOKING_STATUSES,
  ValidationError,
  generateBookingRef,
  sanitizeText,
} from "@/lib/operator/validation";
import { markBookingCreated } from "@/lib/operator/recentBookingRefs";
import { looksLikeAirport } from "@/lib/bookingUtils";
import { ukToIso } from "@/lib/dates";
import { fetchRefPrefix } from "@/lib/operator/refPrefix";
import { ukDateDaysAgo, OPERATIONAL_DAYS_BACK } from "@/lib/operator/ukDate";

// Re-exported: screens import these from here.
export { ukDateDaysAgo, OPERATIONAL_DAYS_BACK };

function compact(value) {
  return value ? String(value).split(",")[0] : null;
}

export function shapedBooking(row) {
  const pickupLocation = row.pickup_location ?? null;
  const dropoffAddress = row.dropoff_address ?? row.destination ?? null;
  const airport = row.airport ?? null;
  const displayPickup = pickupLocation || airport || row.direction || null;
  const displayDropoff = dropoffAddress || airport || null;
  const route = [compact(displayPickup), compact(displayDropoff)].filter(Boolean).join(" → ") || dropoffAddress || airport || "—";
  const returnRoute = row.return_journey
    ? [row.return_pickup || row.return_airport, row.return_destination || row.return_airport].filter(Boolean).join(" → ")
    : null;

  return {
    id: row.ref,
    dbId: row.id,
    customer: row.customer_name,
    phone: row.customer_phone ?? null,
    email: row.customer_email ?? null,
    flight: row.flight_number ?? row.flight ?? "—",
    route,
    pickupLocation,
    dropoffAddress,
    airport,
    destination: dropoffAddress,
    direction: row.direction ?? null,
    journeyType: row.journey_type ?? null,
    time: row.travel_time ? row.travel_time.slice(0, 5) : "—",
    pickupTime: row.pickup_time ?? ukToIso(row.travel_date, row.travel_time),
    travelDate: row.travel_date ?? null,
    passengers: row.passengers ?? null,
    luggage: row.luggage ?? null,
    returnJourney: row.return_journey ?? false,
    returnPickup: row.return_pickup ?? null,
    returnAirport: row.return_airport ?? null,
    returnFlight: row.return_flight ?? null,
    returnDate: row.return_date ?? null,
    returnTime: row.return_time ?? null,
    returnDestination: row.return_destination ?? null,
    returnRoute,
    vehicleType: row.vehicle_type ?? null,
    contactMethod: row.contact_method ?? null,
    driver: row.drivers?.name ?? "Unassigned",
    driverId: row.driver_id ?? row.assigned_driver_id ?? null,
    // Pence kept (£87.50): screens, invoices and the edit form parse this back.
    price: row.quoted_price ? `£${Number(row.quoted_price).toFixed(Number.isInteger(Number(row.quoted_price)) ? 0 : 2)}` : "TBC",
    // The fare as a number (null when not priced), for totals that must not
    // lose the pence (calendar revenue).
    priceValue: row.quoted_price == null || row.quoted_price === "" ? null : Number(row.quoted_price),
    status: row.status,
    source: row.source ?? null,
    operatorResponse: row.operator_response ?? null,
    // Driver pickup confirmation (attestation-engine, reminder-only).
    attestation: row.attestation_status ?? null,
    paymentStatus: row.payment_status ?? "Unpaid",
    paymentMethod: row.payment_method ?? null,
    priority: row.priority ?? false,
    notes: row.notes ?? row.operator_note ?? "",
    updatedAt: row.updated_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

// Which bookings a screen loads:
// - "operational" (default): from OPERATIONAL_DAYS_BACK days ago onwards (UK
//   date), plus undated bookings, earliest first. Live screens care about
//   today and what's coming; older ones load on demand with loadEarlier().
// - "all": every booking (analytics, customer look-up).
// Before this, every screen loaded the 100 OLDEST bookings, so once there were
// more than 100, today's and upcoming jobs fell off the first page.
const PAGE_SIZE = 200;
const ALL_PAGE_SIZE = 2000;


const SELECT = "*, drivers!driver_id(name)";

// The note that marks an automatically created return leg. Its opening words
// are what the website, the email builders and the invoice trigger look for
// (/^Return leg created automatically/), so keep them exactly.
/** Whether `b` (a shaped booking) is the automatically created return leg of booking `outboundRef`. */
export function isReturnLegOf(b, outboundRef) {
  const notes = String(b?.notes || "");
  return /^Return leg created automatically/i.test(notes) && notes.includes(`Outbound ref: ${outboundRef}`);
}

export function returnLegNote(outboundRef, totalPrice) {
  return [
    "Return leg created automatically from return booking.",
    totalPrice ? `Original return fare: £${totalPrice}.` : null,
    `Outbound ref: ${outboundRef}`,
  ].filter(Boolean).join(" ");
}

const RETURN_LEG_MARKER = /^Return leg created automatically from return booking\.(?: Original return fare: £[\d.]+\.)?(?: Outbound ref: \S+)?/i;

/** New notes for a booking, keeping a return leg's marker sentence at the start
 *  so the leg stays recognised (and unpayable) everywhere. */
export function keepReturnLegMarker(oldNotes, newNotes) {
  const marker = String(oldNotes || "").match(RETURN_LEG_MARKER)?.[0];
  const next = String(newNotes ?? "").trim();
  if (!marker || next.startsWith(marker)) return next;
  const rest = next.replace(RETURN_LEG_MARKER, "").trim();
  return rest ? `${marker}\n${rest}` : marker;
}

export function useBookings({ scope = "operational" } = {}) {
  const all = scope === "all";
  const pageSize = all ? ALL_PAGE_SIZE : PAGE_SIZE;
  const [bookings, setBookings] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  // Whether bookings older than the operational window may still exist:
  // unknown until the first loadEarlier(), false once a page comes back short.
  const [hasEarlier, setHasEarlier] = useState(true);
  // Starts true when there is a database to ask: the first load begins on mount.
  const [loading, setLoading] = useState(isConfigured);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const bookingsRef = useRef(bookings);
  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  // How many rows of each window are loaded, so the periodic refresh reloads
  // the same amount instead of dropping pages loaded with "Load more".
  const forwardLoadedRef = useRef(0);
  const earlierLoadedRef = useRef(0);
  const fetchIdRef = useRef(0);

  const forwardQuery = useCallback((from, to, withCount) => {
    let q = supabase.from("bookings").select(SELECT, withCount ? { count: "exact" } : undefined);
    if (!all) q = q.or(`travel_date.gte.${ukDateDaysAgo(OPERATIONAL_DAYS_BACK)},travel_date.is.null`);
    return q
      .order("travel_date", { ascending: true, nullsFirst: false })
      .order("travel_time", { ascending: true })
      .range(from, to);
  }, [all]);

  const earlierQuery = useCallback((from, to, withCount) => (
    supabase.from("bookings").select(SELECT, withCount ? { count: "exact" } : undefined)
      .lt("travel_date", ukDateDaysAgo(OPERATIONAL_DAYS_BACK))
      .order("travel_date", { ascending: false })
      .order("travel_time", { ascending: false })
      .range(from, to)
  ), []);

  // Reads the whole window currently on screen. Sets no state.
  const queryBookings = useCallback(() => {
    const forwardN = Math.max(pageSize, forwardLoadedRef.current);
    const earlierN = earlierLoadedRef.current;
    return Promise.all([
      forwardQuery(0, forwardN - 1, true),
      earlierN > 0 && !all ? earlierQuery(0, earlierN - 1, false) : Promise.resolve({ data: [] }),
    ]);
  }, [all, pageSize, forwardQuery, earlierQuery]);

  // Shows a response, unless a newer fetch (numbered after this one) has started.
  const applyBookings = useCallback((myId, fwd, early) => {
    if (fetchIdRef.current !== myId) return;
    const err = fwd.error || early.error;
    if (err) {
      setError(err.message);
    } else {
      const earlierRows = (early.data || []).slice().reverse();
      forwardLoadedRef.current = fwd.data.length;
      earlierLoadedRef.current = earlierRows.length;
      setBookings([...earlierRows, ...fwd.data].map(shapedBooking));
      // totalCount = bookings reachable with loadMore (forward window) plus the
      // earlier ones already loaded.
      setTotalCount((fwd.count ?? 0) + earlierRows.length);
      setError(null);
    }
    setLoading(false);
  }, []);

  const fetchBookings = useCallback(async () => {
    if (!isConfigured) return;
    const myId = ++fetchIdRef.current;
    setLoading(true);
    try {
      const [fwd, early] = await queryBookings();
      applyBookings(myId, fwd, early);
    } catch (e) {
      if (fetchIdRef.current === myId) setLoading(false);
      throw e;
    }
  }, [queryBookings, applyBookings]);

  const loadMore = useCallback(async () => {
    if (!isConfigured || loadingMore) return;
    const from = forwardLoadedRef.current;
    setLoadingMore(true);
    try {
      const { data, error: err } = await forwardQuery(from, from + pageSize - 1, false);
      if (err) throw new Error(err.message);
      forwardLoadedRef.current += data.length;
      setBookings((prev) => {
        const existingIds = new Set(prev.map((b) => b.id));
        return [...prev, ...data.map(shapedBooking).filter((b) => !existingIds.has(b.id))];
      });
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, forwardQuery, pageSize]);

  // Older bookings (before the operational window), newest first, added to
  // the start of the list.
  const loadEarlier = useCallback(async () => {
    if (!isConfigured || all || loadingMore) return;
    const from = earlierLoadedRef.current;
    setLoadingMore(true);
    try {
      const { data, error: err } = await earlierQuery(from, from + PAGE_SIZE - 1, false);
      if (err) throw new Error(err.message);
      earlierLoadedRef.current += data.length;
      if (data.length < PAGE_SIZE) setHasEarlier(false);
      setTotalCount((n) => n + data.length);
      setBookings((prev) => {
        const existingIds = new Set(prev.map((b) => b.id));
        return [...data.slice().reverse().map(shapedBooking).filter((b) => !existingIds.has(b.id)), ...prev];
      });
    } finally {
      setLoadingMore(false);
    }
  }, [all, loadingMore, earlierQuery]);

  // First load (and again if the window changes). `loading` already starts
  // true, so nothing is set until the answer arrives.
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    const myId = ++fetchIdRef.current;
    queryBookings().then(
      ([fwd, early]) => {
        if (!cancelled) applyBookings(myId, fwd, early);
      },
      () => {
        if (!cancelled && fetchIdRef.current === myId) setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [queryBookings, applyBookings]);

  useRealtimeBookings(fetchBookings);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchBookings();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchBookings]);

  useEffect(() => {
    if (!isConfigured) return;
    const id = setInterval(fetchBookings, 60_000);
    return () => clearInterval(id);
  }, [fetchBookings]);

  const updateStatus = useCallback(async (id, status) => {
    if (!BOOKING_STATUSES.includes(status)) {
      throw new ValidationError(`"${status}" is not a valid booking status`);
    }

    const current = bookingsRef.current.find((b) => b.id === id);
    if (current) {
      validateStatusTransition(current.status, status);
    }

    const snapshot = bookingsRef.current;
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));

    if (!isConfigured) return;

    try {
      const { error: err } = await supabase
        .from("bookings")
        .update({ status })
        .eq("ref", id);
      if (err) throw new Error(err.message);
    } catch (err) {
      setBookings(snapshot);
      throw err;
    }
  }, []);

  // Operator accepts or rejects an incoming website booking. Records the
  // decision (rejecting also cancels the job), then notifies the customer —
  // email first, SMS fallback — via the booking-response route. Returns the
  // channel used so the caller can surface it.
  const respondToBooking = useCallback(async (id, decision) => {
    if (decision !== "accepted" && decision !== "rejected") {
      throw new ValidationError("Decision must be accepted or rejected.");
    }
    const current = bookingsRef.current.find((b) => b.id === id);
    const snapshot = bookingsRef.current;
    const rejecting = decision === "rejected";

    // A website return booking is one request: its £0 return leg (notes
    // "Return leg created automatically … Outbound ref: <ref>") takes the same
    // decision, so it never waits for a second reply or sends a second email.
    const isLegOf = (b) => isReturnLegOf(b, id) && !b.operatorResponse;
    setBookings((prev) =>
      prev.map((b) =>
        b.id === id || isLegOf(b)
          ? { ...b, operatorResponse: decision, ...(rejecting && !["Cancelled", "Completed"].includes(b.status) ? { status: "Cancelled" } : {}) }
          : b
      )
    );

    if (isConfigured) {
      const patch = {
        operator_response: decision,
        operator_responded_at: new Date().toISOString(),
      };
      if (rejecting && current && !["Cancelled", "Completed"].includes(current.status)) {
        patch.status = "Cancelled";
      }
      const { error: err } = await supabase.from("bookings").update(patch).eq("ref", id);
      if (err) {
        setBookings(snapshot);
        throw new Error(err.message);
      }
      const legPatch = { operator_response: decision, operator_responded_at: patch.operator_responded_at };
      const legs = supabase
        .from("bookings")
        .update(rejecting ? { ...legPatch, status: "Cancelled" } : legPatch)
        .like("notes", `Return leg created automatically%Outbound ref: ${id}%`)
        .is("operator_response", null);
      const { error: legErr } = rejecting ? await legs.not("status", "in", "(Cancelled,Completed)") : await legs;
      if (legErr) console.error("Return leg not updated:", legErr.message);
    }

    // Notify the customer. Failures here don't roll back the decision.
    let channel = null;
    let textQueued = false;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token ?? "";
      const res = await fetch("/api/booking-response", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ref: id,
          decision,
          name: current?.customer ?? "",
          email: current?.email && current.email !== "—" ? current.email : "",
          phone: current?.phone ?? "",
          whenText: [current?.travelDate, current?.time && current.time !== "—" ? current.time : ""]
            .filter(Boolean)
            .join(" "),
          routeText: current?.route && current.route !== "—" ? current.route : "",
        }),
      });
      const out = await res.json().catch(() => ({}));
      channel = out?.channel ?? null;
      textQueued = out?.smsQueued === true;
      if (!res.ok || out?.ok === false) {
        return { decision, channel, textQueued, warning: out?.error ?? "Customer could not be notified." };
      }
    } catch {
      return { decision, channel: null, warning: "Decision saved, but the customer notification failed to send." };
    }
    return { decision, channel, textQueued };
  }, []);

  const createBooking = useCallback(
    async (form) => {
      validateBookingPayload(form);

      // The form captures a plain pickup + drop-off. Either side may be the
      // airport; detect it so airport (flight context) and direction (legacy /
      // analytics) still get sensible values, while pickup_location and
      // dropoff_address always hold the literal route the operator entered.
      const pickup = (form.pickup || "").trim();
      const dropoff = (form.dropoff || "").trim();
      const airportSide = looksLikeAirport(pickup) ? pickup : looksLikeAirport(dropoff) ? dropoff : null;
      const direction = looksLikeAirport(pickup)
        ? "Airport → Destination"
        : looksLikeAirport(dropoff)
        ? "Destination → Airport"
        : "Point to Point";

      if (!isConfigured) throw new Error("Database not configured. Please add Supabase credentials.");

      const { data: driverRow } = form.driver
        ? await supabase
            .from("drivers")
            .select("id, name")
            .eq("id", form.driver)
            .single()
        : { data: null };

      const refPrefix = await fetchRefPrefix(supabase);

      // Insert one booking row, retrying on a ref collision (23505). Returns the ref.
      const insertLeg = async (fields) => {
        let ref;
        let succeeded = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          ref = generateBookingRef(refPrefix);
          const { error: insertErr } = await supabase.from("bookings").insert({ ref, ...fields });
          if (!insertErr) { succeeded = true; break; }
          if (insertErr.code !== "23505") throw new Error(insertErr.message);
        }
        if (!succeeded) throw new Error("Failed to generate a unique booking reference after 3 attempts. Please try again.");
        return ref;
      };

      // Shared customer/meta for both legs. `source: "operator"` tags the booking
      // so the DB trigger sends the customer the confirmation, 24h reminder and
      // status-update SMS (website bookings get theirs from the public site).
      // The operator made the booking, so it is accepted from the start: only
      // website requests wait for Accept/Decline. Without this the customer's
      // booking page showed "Awaiting Confirmation" and refused payment.
      const shared = {
        customer_name:  sanitizeText(form.customer, 120),
        customer_phone: sanitizeText(form.phone, 30),
        customer_email: form.email?.trim() || null,
        payment_status: "Unpaid",
        source:         "operator",
        operator_response:     "accepted",
        operator_responded_at: new Date().toISOString(),
      };
      const price = form.price ? Number(form.price) : null;
      const hasReturn = Boolean(form.returnJourney && form.returnDate && form.returnTime);

      // Outbound leg. A return booking is stored the way the website stores
      // one: the outbound carries the whole fare (both ways) and the return
      // details, so the customer pays once, for the full amount, on one page.
      const ref = await insertLeg({
        ...shared,
        quoted_price:       price,
        return_journey:     hasReturn,
        ...(hasReturn ? {
          return_pickup:      dropoff,
          return_destination: pickup,
          return_airport:     airportSide,
          return_flight:      form.returnFlight?.trim() || null,
          return_date:        form.returnDate,
          return_time:        form.returnTime,
        } : {}),
        flight_number:      form.flight?.trim() || null,
        direction,
        airport:            airportSide,
        pickup_location:    pickup,
        dropoff_address:    dropoff,
        travel_date:        form.date || null,
        travel_time:        form.time || null,
        pickup_time:        ukToIso(form.date, form.time),
        driver_id:          driverRow?.id ?? null,
        assigned_driver_id: driverRow?.id ?? null,
        status:             driverRow ? "Dispatched" : "Unassigned",
        notes:              form.notes?.trim() || null,
      });

      // Suppress the new-booking alert for a booking this operator just made.
      markBookingCreated(ref);

      // Optional return leg — the reverse trip (pickup/drop-off swapped) on the
      // return date/time, created as its own dispatchable job (left unassigned).
      // It has no price of its own (£0) and the website's return-leg note, so
      // emails, the payment page, invoices and the DB trigger treat it as paid
      // with the outbound booking instead of a second payment.
      let returnRef = null;
      if (hasReturn) {
        const returnDirection =
          direction === "Airport → Destination"
            ? "Destination → Airport"
            : direction === "Destination → Airport"
            ? "Airport → Destination"
            : "Point to Point";
        try {
          returnRef = await insertLeg({
            ...shared,
            flight_number:      form.returnFlight?.trim() || null,
            direction:          returnDirection,
            airport:            airportSide,
            pickup_location:    dropoff,
            dropoff_address:    pickup,
            travel_date:        form.returnDate,
            travel_time:        form.returnTime,
            pickup_time:        ukToIso(form.returnDate, form.returnTime),
            driver_id:          null,
            assigned_driver_id: null,
            status:             "Unassigned",
            quoted_price:       0,
            return_journey:     false,
            notes:              returnLegNote(ref, price),
          });
        } catch (err) {
          // Don't leave a whole-fare outbound with no return leg: a retry
          // would create a second payable booking for the same trip.
          await supabase.from("bookings").delete().eq("ref", ref);
          throw err;
        }
        markBookingCreated(returnRef);
      }

      await fetchBookings();
      return { ref, returnRef };
    },
    [fetchBookings]
  );

  const assignDriver = useCallback(async (id, driverId, driverName) => {
    const current = bookingsRef.current.find((b) => b.id === id);
    const currentStatus = current?.status ?? "";

    let newStatus = null;
    if (driverId) {
      if (currentStatus === "Unassigned" || currentStatus === "Unassigned / Missed Call Recovery") newStatus = "Dispatched";
    } else {
      if (currentStatus === "Dispatched" || currentStatus === "Unassigned / Missed Call Recovery") newStatus = "Unassigned";
    }

    const snapshot = bookingsRef.current;
    setBookings((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, driverId: driverId || null, driver: driverName ?? (driverId ? b.driver : "Unassigned"), ...(newStatus ? { status: newStatus } : {}) } : b
      )
    );

    if (!isConfigured) return;

    try {
      const update = { driver_id: driverId || null, assigned_driver_id: driverId || null };
      if (newStatus) update.status = newStatus;

      const { error: err } = await supabase
        .from("bookings")
        .update(update)
        .eq("ref", id);
      if (err) throw new Error(err.message);
    } catch (err) {
      setBookings(snapshot);
      throw err;
    }
  }, []);

  const updateNotes = useCallback(async (id, rawNotes) => {
    const snapshot = bookingsRef.current;
    const notes = keepReturnLegMarker(snapshot.find((b) => b.id === id)?.notes, rawNotes);
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, notes: notes ?? "" } : b)));

    if (!isConfigured) return;

    try {
      const { error: err } = await supabase
        .from("bookings")
        .update({ notes: notes?.trim() || null })
        .eq("ref", id);
      if (err) throw new Error(err.message);
    } catch (err) {
      setBookings(snapshot);
      throw err;
    }
  }, []);

  const togglePriority = useCallback(async (id) => {
    const current = bookingsRef.current.find((b) => b.id === id);
    const newPriority = !current?.priority;

    const snapshot = bookingsRef.current;
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, priority: newPriority } : b)));

    if (!isConfigured) return;

    try {
      const { error: err } = await supabase
        .from("bookings")
        .update({ priority: newPriority })
        .eq("ref", id);
      if (err) throw new Error(err.message);
    } catch (err) {
      setBookings(snapshot);
      throw err;
    }
  }, []);

  const updatePaymentStatus = useCallback(async (id, paymentStatus) => {
    const snapshot = bookingsRef.current;
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, paymentStatus } : b)));

    if (!isConfigured) return;

    try {
      const { error: err } = await supabase
        .from("bookings")
        .update({ payment_status: paymentStatus })
        .eq("ref", id);
      if (err) throw new Error(err.message);
    } catch (err) {
      setBookings(snapshot);
      throw err;
    }
  }, []);

  const updatePaymentMethod = useCallback(async (id, paymentMethod) => {
    const snapshot = bookingsRef.current;
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, paymentMethod } : b)));

    if (!isConfigured) return;

    try {
      const { error: err } = await supabase
        .from("bookings")
        .update({ payment_method: paymentMethod })
        .eq("ref", id);
      if (err) throw new Error(err.message);
    } catch (err) {
      setBookings(snapshot);
      throw err;
    }
  }, []);

  // Edit an existing booking's details (passengers, bags, time, addresses, etc.).
  // `fields` is a partial of shaped-booking keys; only the keys present are
  // written. Optimistically merges locally, then re-fetches authoritative data
  // (so derived values like route/pickupTime stay correct) and rolls back on error.
  const updateBooking = useCallback(async (id, fields) => {
    const FIELD_TO_COLUMN = {
      customer:       (v) => ({ customer_name: sanitizeText(v, 120) }),
      phone:          (v) => ({ customer_phone: sanitizeText(v, 30) }),
      email:          (v) => ({ customer_email: v?.trim() || null }),
      flight:         (v) => ({ flight_number: v?.trim() || null }),
      passengers:     (v) => ({ passengers: v === "" || v == null ? null : Number(v) }),
      luggage:        (v) => ({ luggage: (v ?? "").toString().trim() || null }),
      pickupLocation: (v) => ({ pickup_location: v?.trim() || null }),
      dropoffAddress: (v) => ({ dropoff_address: v?.trim() || null }),
      airport:        (v) => ({ airport: v?.trim() || null }),
      travelDate:     (v) => ({ travel_date: v || null }),
      time:           (v) => ({ travel_time: v || null }),
      price:          (v) => ({ quoted_price: v === "" || v == null ? null : Number(v) }),
      vehicleType:    (v) => ({ vehicle_type: v?.trim() || null }),
    };

    const dbPatch = {};
    for (const [k, v] of Object.entries(fields)) {
      if (FIELD_TO_COLUMN[k]) Object.assign(dbPatch, FIELD_TO_COLUMN[k](v));
    }
    // When the pickup date/time changes, store the matching moment (UK time),
    // or clear it if either half is now missing.
    if ("travelDate" in fields || "time" in fields) {
      const cur = bookingsRef.current.find((b) => b.id === id) || {};
      const date = "travelDate" in fields ? fields.travelDate : cur.travelDate;
      const time = "time" in fields ? fields.time : cur.time;
      dbPatch.pickup_time = ukToIso(date, time);
      fields = { ...fields, pickupTime: dbPatch.pickup_time };
    }
    if (Object.keys(dbPatch).length === 0) return;

    const snapshot = bookingsRef.current;
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...fields } : b)));

    if (!isConfigured) return;

    try {
      const { error: err } = await supabase.from("bookings").update(dbPatch).eq("ref", id);
      if (err) throw new Error(err.message);
      await fetchBookings();
    } catch (err) {
      setBookings(snapshot);
      throw err;
    }
  }, [fetchBookings]);

  const deleteBooking = useCallback(async (id, password) => {
    if (!password?.trim()) throw new Error("Enter your password to confirm deletion.");

    // Second-factor style confirmation: re-verify the operator's password
    // immediately before this destructive action.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.email) {
      throw new Error("You must be signed in to delete a booking.");
    }
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userData.user.email,
      password,
    });
    if (authError) throw new Error("Password verification failed.");

    const snapshot = bookingsRef.current;
    setBookings((prev) => prev.filter((b) => b.id !== id));

    if (!isConfigured) return true;

    try {
      const { data: removed, error: err } = await supabase.from("bookings").delete().eq("ref", id).select("ref");
      if (err) throw new Error(err.message);
      // RLS hides rows this account may not delete: no error, nothing removed.
      if (Array.isArray(removed) && removed.length === 0) {
        throw new Error("This booking could not be deleted. Refresh and try again.");
      }
      return true;
    } catch (err) {
      setBookings(snapshot);
      throw err;
    }
  }, []);

  return { bookings, totalCount, hasEarlier: !all && hasEarlier, loading, loadingMore, loadMore, loadEarlier, error, createBooking, updateStatus, assignDriver, respondToBooking, updateNotes, togglePriority, updatePaymentStatus, updatePaymentMethod, updateBooking, deleteBooking, refetch: fetchBookings };
}
