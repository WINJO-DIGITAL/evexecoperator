"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Plane, MapPin, Clock, User, Car, PoundSterling, ChevronDown, ArrowLeftRight, Search } from "lucide-react";
import { useDrivers } from "@/hooks/operator/useDrivers";
import { fixedTripPrice } from "@/lib/prices";
import { useOperator } from "./OperatorContext";
import { looksLikeAirport } from "@/lib/bookingUtils";

// Builds a de-duplicated list of past customers from the bookings feed, so a
// manual booking can reuse a saved customer's details — and their addresses —
// instead of retyping them. Keyed by phone (falling back to name); later
// records backfill a missing email, and every non-airport location the
// customer has used is collected (most-recent first) as their saved addresses.
export function customersFromBookings(bookings = []) {
  const clean = (v) => (v && v !== "—" ? String(v).trim() : "");
  const map = new Map();
  for (const b of bookings) {
    const name = clean(b.customer);
    const phone = clean(b.phone);
    const email = clean(b.email);
    if (!name && !phone) continue;
    const key = phone || name.toLowerCase();
    let c = map.get(key);
    if (!c) {
      c = { name, phone, email, _addr: new Map() };
      map.set(key, c);
    } else {
      if (!c.email && email) c.email = email;
      if (!c.phone && phone) c.phone = phone;
      if (!c.name && name) c.name = name;
    }
    const ts = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
    for (const loc of [clean(b.pickupLocation), clean(b.dropoffAddress)]) {
      if (!loc || looksLikeAirport(loc)) continue;
      const k = loc.toLowerCase();
      const prev = c._addr.get(k);
      if (!prev || ts > prev.ts) c._addr.set(k, { loc, ts });
    }
  }
  return [...map.values()]
    .filter((c) => c.name)
    .map((c) => ({
      name: c.name,
      phone: c.phone,
      email: c.email,
      addresses: [...c._addr.values()].sort((a, b) => b.ts - a.ts).map((x) => x.loc).slice(0, 6),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Type-ahead picker for reusing an existing customer's details.
function CustomerPicker({ customers, onPick }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, []);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? customers.filter((c) =>
          c.name.toLowerCase().includes(t) ||
          c.phone.toLowerCase().includes(t) ||
          c.email.toLowerCase().includes(t))
      : customers;
    return list.slice(0, 8);
  }, [q, customers]);

  if (!customers.length) return null;

  return (
    <div ref={ref} className="relative mb-4">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Use an existing customer — search name, phone or email"
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-[#0F1B33] outline-none placeholder:text-slate-400 focus:border-amber-400/40 transition"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-2xl">
          {results.map((c, i) => (
            <button
              type="button"
              key={`${c.phone || c.name}-${i}`}
              onClick={() => { onPick(c); setOpen(false); setQ(""); }}
              className="flex w-full flex-col items-start px-4 py-2.5 text-left transition hover:bg-slate-100"
            >
              <span className="text-sm font-medium text-[#0F1B33]">{c.name}</span>
              {(c.phone || c.email) && (
                <span className="text-xs text-slate-500">{[c.phone, c.email].filter(Boolean).join("  ·  ")}</span>
              )}
              {c.addresses?.length > 0 && (
                <span className="text-[11px] text-amber-600">
                  {c.addresses.length} saved address{c.addresses.length > 1 ? "es" : ""}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const AIRPORTS = [
  "Manchester Airport (MAN)",
  "Liverpool Airport (LPL)",
  "Leeds Bradford Airport (LBA)",
  "Birmingham Airport (BHX)",
  "Blackpool Airport (BLK)",
  "London Heathrow (LHR)",
  "London Gatwick (LGW)",
  "East Midlands Airport (EMA)",
  "Newcastle Airport (NCL)",
  "Glasgow Airport (GLA)",
  "Edinburgh Airport (EDI)",
];

const DESTINATIONS = [
  "Blackpool",
  "Lytham St Annes",
  "Poulton-le-Fylde",
  "Preston",
  "Southport",
  "Chorley",
];

// The operator's fixed price (Settings → Prices) for whichever end of the trip
// is a listed place: the one-way fare, or the whole return fare (paid once,
// on the outbound booking), so a phone booking is quoted the same as an online one.
function getSuggestedPrice(pickup, dropoff, isReturn, airports) {
  return fixedTripPrice(pickup, isReturn, airports) ?? fixedTripPrice(dropoff, isReturn, airports);
}

function Field({ label, icon: Icon, error, children }) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[#0F1B33] outline-none focus:border-amber-400/40 transition"
      >
        <option value="" className="bg-white">{placeholder}</option>
        {options.map((o) => (
          <option key={typeof o === "string" ? o : o.id} value={typeof o === "string" ? o : o.id} className="bg-white">
            {typeof o === "string" ? o : o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", list, onFocus }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder={placeholder}
      list={list}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[#0F1B33] outline-none placeholder:text-slate-400 focus:border-amber-400/40 transition"
    />
  );
}

// Combined suggestions for the pickup / drop-off comboboxes — airports first,
// then the common local towns. Operators can still type any free-text address.
const LOCATIONS = [...AIRPORTS, ...DESTINATIONS];

// True when a location reads as an airport (has "airport" or a 3-letter code).
export { looksLikeAirport };

const empty = {
  customer: "",
  phone: "",
  email: "",
  pickup: "",
  dropoff: "",
  flight: "",
  date: "",
  time: "",
  returnJourney: false,
  returnDate: "",
  returnTime: "",
  returnFlight: "",
  driver: "",
  price: "",
  notes: "",
};

// `eyebrow` / `heading` label the form for where it was opened from (a return
// journey, a converted quote); a plain new booking uses the defaults.
export default function BookingModal({ open, onClose, onSubmit, initialValues, customers = [], eyebrow, heading }) {
  const { pricing } = useOperator().profile;
  const { drivers } = useDrivers();
  const vehicles = useMemo(
    () => drivers.map((d) => ({ id: d.id, label: d.kind === "partner" ? `${d.name} — trusted partner` : `${d.name} — ${d.vehicle}` })),
    [drivers]
  );
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  // Saved addresses for the picked customer, and which route field to drop the
  // next tapped address into (whichever pickup/drop-off the operator last used).
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [lastRouteField, setLastRouteField] = useState(null);
  const closeTimerRef = useRef(null);
  const dialogRef = useRef(null);
  // True while the price shown is our suggestion (not typed or pre-filled), so
  // it can follow the route and the return-journey tick.
  const [priceAuto, setPriceAuto] = useState(false);

  // Reset (on close) or pre-fill (on open) the form. Done while rendering, as
  // React recommends for state that follows a prop, so the new values are the
  // first thing painted. `null` first, so the first render counts as a change.
  const [wasOpen, setWasOpen] = useState(null);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setForm(empty);
      setPriceAuto(false);
      setErrors({});
      setSubmitted(false);
      setSubmitting(false);
      setSubmitError(null);
      setSavedAddresses([]);
      setLastRouteField(null);
    } else {
      // Pre-fill with initial values when provided (e.g. a return journey, which
      // arrives with pickup/drop-off already swapped).
      setForm(initialValues ? { ...empty, ...initialValues } : { ...empty });
    }
  }

  useEffect(() => {
    if (!open) {
      clearTimeout(closeTimerRef.current);
      return;
    }
    // Focus first focusable element when modal opens
    const t = setTimeout(() => {
      const first = dialogRef.current?.querySelector(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    return () => clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (!open) return;
      if (e.key === "Escape" && !submitting) { onClose(); return; }
      // Focus trap: cycle Tab within the dialog
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, submitting]);

  const set = useCallback(
    (field) => (value) => setForm((f) => ({ ...f, [field]: value })),
    []
  );

  // Drop a saved address into the route field the operator last touched (or the
  // first empty one).
  const fillAddress = useCallback((addr) => {
    setForm((f) => {
      const target = lastRouteField || (!f.pickup ? "pickup" : "dropoff");
      return { ...f, [target]: addr };
    });
  }, [lastRouteField]);

  // Suggest a price whenever the route, the return tick or the price list
  // changes (again while rendering, not in an effect). Typing in the price box
  // stops the suggestions.
  const [priceFor, setPriceFor] = useState(null);
  if (
    !priceFor ||
    priceFor.pickup !== form.pickup ||
    priceFor.dropoff !== form.dropoff ||
    priceFor.returnJourney !== form.returnJourney ||
    priceFor.pricing !== pricing
  ) {
    setPriceFor({ pickup: form.pickup, dropoff: form.dropoff, returnJourney: form.returnJourney, pricing });
    // Never override a typed or pre-filled price.
    if (!form.price || priceAuto) {
      // The operator's own price list (Settings → Prices): whichever end of the
      // trip is a listed place sets the price.
      const suggested = getSuggestedPrice(form.pickup, form.dropoff, form.returnJourney, pricing.airports);
      if (suggested !== null) {
        setPriceAuto(true);
        setForm((f) => ({ ...f, price: String(suggested) }));
      } else if (priceAuto) {
        // The route no longer matches a listed place: drop the old suggestion.
        setPriceAuto(false);
        setForm((f) => ({ ...f, price: "" }));
      }
    }
  }

  function validate() {
    const e = {};
    if (!form.customer.trim()) e.customer = "Customer name is required";
    if (!form.phone.trim()) e.phone = "Phone number is required";
    if (!form.pickup.trim()) e.pickup = "Pickup location is required";
    if (!form.dropoff.trim()) e.dropoff = "Drop-off location is required";
    if (!form.date) e.date = "Date is required";
    if (!form.time) e.time = "Pickup time is required";
    if (form.returnJourney) {
      if (!form.returnDate) e.returnDate = "Return date is required";
      if (!form.returnTime) e.returnTime = "Return time is required";
    }
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) {
      setErrors(e2);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const numPrice = form.price ? Number(form.price) || null : null;
      await onSubmit?.({ ...form, price: numPrice });
      setSubmitted(true);
      closeTimerRef.current = setTimeout(onClose, 1200);
    } catch (err) {
      setSubmitError(err?.message ?? "Failed to create booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal — full-screen bottom sheet on mobile, centered dialog on desktop */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        className="relative z-10 flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl"
      >
        {/* Mobile drag handle */}
        <div className="flex flex-shrink-0 justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1 w-12 rounded-full bg-slate-200" />
        </div>
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-4 sm:px-8 sm:py-6">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-600">
              {eyebrow ?? (initialValues ? "Return Journey" : "New Booking")}
            </p>
            <h2 id="booking-modal-title" className="mt-1 text-2xl font-semibold text-[#0F1B33]">
              {heading ?? (initialValues ? "Create Return" : "Create Transfer")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-[#0F1B33]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
        {submitted ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xl font-semibold text-[#0F1B33]">Booking Created</p>
            <p className="text-sm text-slate-500">Transfer added to dispatch board</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-5 px-4 py-4 sm:gap-6 sm:px-8 sm:py-6">
            {/* Customer */}
            <div>
              <p className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-600">
                Customer Details
              </p>
              <CustomerPicker
                customers={customers}
                onPick={(c) => {
                  setForm((f) => ({ ...f, customer: c.name, phone: c.phone || "", email: c.email || "" }));
                  setSavedAddresses(Array.isArray(c.addresses) ? c.addresses : []);
                }}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Full Name" icon={User} error={errors.customer}>
                  <Input value={form.customer} onChange={set("customer")} placeholder="James Whitmore" />
                </Field>
                <Field label="Phone" error={errors.phone}>
                  <Input value={form.phone} onChange={set("phone")} placeholder="+44 7700 900000" />
                </Field>
                <Field label="Email (optional)">
                  <Input value={form.email} onChange={set("email")} placeholder="passenger@example.com" type="email" />
                </Field>
                <Field label="Flight Number">
                  <Input value={form.flight} onChange={set("flight")} placeholder="EK017" />
                </Field>
              </div>
            </div>

            {/* Route — just where from, where to. Type an address or pick a
                suggestion; either side can be the airport. */}
            <div>
              <p className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-600">
                Route
              </p>
              <datalist id="location-suggestions">
                {[...savedAddresses, ...LOCATIONS].map((l) => <option key={l} value={l} />)}
              </datalist>
              <div className="grid gap-4">
                <Field label="Pickup" icon={MapPin} error={errors.pickup}>
                  <Input value={form.pickup} onChange={set("pickup")} onFocus={() => setLastRouteField("pickup")} placeholder="Manchester Airport (MAN), or a full address" list="location-suggestions" />
                </Field>
                <Field label="Drop-off" icon={MapPin} error={errors.dropoff}>
                  <Input value={form.dropoff} onChange={set("dropoff")} onFocus={() => setLastRouteField("dropoff")} placeholder="18 Lowther Rd, Fleetwood — or an airport" list="location-suggestions" />
                </Field>

                {/* One-tap saved addresses for the picked customer */}
                {savedAddresses.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      Saved addresses — tap to use
                    </span>
                    {savedAddresses.map((a) => (
                      <button
                        type="button"
                        key={a}
                        onClick={() => fillAddress(a)}
                        title={`Use ${a} for the ${lastRouteField || "empty"} field`}
                        className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-700 transition hover:bg-amber-400/20"
                      >
                        <MapPin className="h-3 w-3" />
                        {a}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <p className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-600">
                Schedule
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Date" error={errors.date}>
                  <Input value={form.date} onChange={set("date")} type="date" />
                </Field>
                <Field label="Pickup Time" icon={Clock} error={errors.time}>
                  <Input value={form.time} onChange={set("time")} type="time" />
                </Field>
              </div>
            </div>

            {/* Return journey */}
            <div>
              <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-medium text-[#0F1B33]">
                  <ArrowLeftRight className="h-4 w-4 text-amber-600" />
                  Add return journey
                </span>
                <input
                  type="checkbox"
                  checked={form.returnJourney}
                  onChange={(e) => set("returnJourney")(e.target.checked)}
                  className="h-5 w-5 accent-amber-500"
                />
              </label>

              {form.returnJourney && (
                <div className="mt-4 grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Return Date" error={errors.returnDate}>
                      <Input value={form.returnDate} onChange={set("returnDate")} type="date" />
                    </Field>
                    <Field label="Return Pickup Time" icon={Clock} error={errors.returnTime}>
                      <Input value={form.returnTime} onChange={set("returnTime")} type="time" />
                    </Field>
                  </div>
                  <Field label="Return Flight Number (optional)" icon={Plane}>
                    <Input value={form.returnFlight} onChange={set("returnFlight")} placeholder="EK018" />
                  </Field>
                  {form.pickup && form.dropoff && (
                    <p className="text-xs text-slate-500">
                      Return runs {form.dropoff} → {form.pickup}, booked as its own job on the board. The customer pays once, for both ways.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Driver + Price */}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Assign Driver" icon={Car}>
                <Select value={form.driver} onChange={set("driver")} options={vehicles} placeholder="Leave unassigned" />
              </Field>
              <Field label={form.returnJourney ? "Fixed Price (return, both ways)" : "Fixed Price"} icon={PoundSterling}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">£</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.price}
                    onChange={(e) => { setPriceAuto(false); set("price")(e.target.value); }}
                    placeholder="0"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-4 text-sm text-amber-600 outline-none placeholder:text-slate-400 focus:border-amber-400/40 transition"
                  />
                </div>
              </Field>
            </div>

            {/* Notes */}
            <Field label="Notes (optional)">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
                placeholder="Child seat required, meet & greet at arrivals..."
                rows={3}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[#0F1B33] outline-none placeholder:text-slate-400 focus:border-amber-400/40 transition"
              />
            </Field>

            {/* Submit */}
            {submitError && (
              <p className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-600">
                {submitError}
              </p>
            )}
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm text-slate-500 transition hover:border-slate-300 hover:text-[#0F1B33]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-2xl bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Creating…" : `Create Booking${form.price ? ` — £${form.price}` : ""}`}
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}