"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Mail, Phone, Plus, Search, X } from "lucide-react";
import { useBookings, ukDateDaysAgo } from "@/hooks/operator/useBookings";
import { useDrivers } from "@/hooks/operator/useDrivers";
import { useBookingDrawer } from "@/components/operator/useBookingDrawer";
import { useOperator } from "@/components/operator/OperatorContext";
import StatusChip from "@/components/operator/StatusChip";
import { groupCustomers } from "@/lib/operator/customers";
import { fmtDate } from "@/lib/dates";

// Everyone who has booked, built from bookings (grouped by phone or email),
// with their history. Opening a booking uses the shared booking drawer.

const money = (n) => `£${Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

function CustomerPanel({ customer, onClose, onOpenBooking, onNewBooking }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={customer.name}>
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Customer</p>
            <h2 className="mt-1 truncate text-xl font-semibold text-[#0F1B33]">{customer.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {customer.phone && (
                <a href={`tel:${customer.phone.replace(/\s+/g, "")}`} className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-slate-700 hover:border-amber-300">
                  <Phone className="h-3 w-3" /> {customer.phone}
                </a>
              )}
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-slate-700 hover:border-amber-300">
                  <Mail className="h-3 w-3" /> {customer.email}
                </a>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:text-[#0F1B33]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 border-b border-slate-100 px-5 py-4 text-center">
          <div><p className="text-lg font-semibold text-[#0F1B33]">{customer.trips}</p><p className="text-[11px] text-slate-500">Trips</p></div>
          <div><p className="text-lg font-semibold text-[#0F1B33]">{money(customer.spend)}</p><p className="text-[11px] text-slate-500">Paid</p></div>
          <div><p className={`text-lg font-semibold ${customer.unpaid ? "text-red-600" : "text-[#0F1B33]"}`}>{money(customer.unpaid)}</p><p className="text-[11px] text-slate-500">Unpaid</p></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <p className="px-5 pb-1 pt-4 text-[10px] uppercase tracking-[0.2em] text-slate-500">Bookings</p>
          <ul className="divide-y divide-slate-100">
            {customer.bookings.map((b) => (
              <li key={b.id}>
                <button onClick={() => onOpenBooking(b)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                  <div className="w-20 flex-shrink-0">
                    <p className="text-sm font-medium text-[#0F1B33]">{b.travelDate ? fmtDate(b.travelDate) : "No date"}</p>
                    <p className="text-[11px] text-slate-500">{b.time}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[#0F1B33]">{b.route}</p>
                    <p className="text-[11px] text-slate-500">{b.id} · {b.price}</p>
                  </div>
                  <StatusChip status={b.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-slate-100 p-4">
          <button onClick={onNewBooking} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black hover:bg-amber-400">
            <Plus className="h-4 w-4" /> New booking for {customer.name.split(" ")[0]}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const api = useBookings({ scope: "all" });
  const { bookings, loading, error } = api;
  const { drivers } = useDrivers();
  const drawer = useBookingDrawer(api, drivers);
  const { openNewBooking } = useOperator();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);

  const today = ukDateDaysAgo(0);
  const customers = useMemo(() => groupCustomers(bookings, today), [bookings, today]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    const digits = s.replace(/\D/g, "");
    return customers.filter((c) =>
      c.name.toLowerCase().includes(s) ||
      (c.email || "").toLowerCase().includes(s) ||
      (digits.length >= 3 && (c.phone || "").replace(/\D/g, "").includes(digits)) ||
      c.bookings.some((b) => String(b.id).toLowerCase().includes(s)));
  }, [customers, q]);
  const open = customers.find((c) => c.id === openId) || null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
      {drawer.element}
      {open && !drawer.selectedId && (
        <CustomerPanel
          customer={open}
          onClose={() => setOpenId(null)}
          onOpenBooking={drawer.open}
          onNewBooking={() => { setOpenId(null); openNewBooking({ customer: open.name, phone: open.phone, email: open.email }, { eyebrow: "Customer", heading: "New Booking" }); }}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 sm:max-w-md">
          <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, email or booking ref"
            aria-label="Search customers"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#0F1B33] outline-none placeholder:text-slate-400"
          />
        </div>
        <p className="text-xs text-slate-500">{filtered.length} of {customers.length} customers</p>
      </div>

      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Couldn&apos;t load bookings: {error}</div>}

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_80px_110px_140px_100px_24px] gap-3 border-b border-slate-100 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-slate-500 lg:grid">
          <span>Customer</span><span>Contact</span><span className="text-right">Trips</span><span>Last trip</span><span>Next trip</span><span className="text-right">Unpaid</span><span />
        </div>
        {loading && customers.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{q ? `No customers match "${q}".` : "No customers yet. They appear here after their first booking."}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setOpenId(c.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_80px_110px_140px_100px_24px]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#0F1B33]">{c.name}</p>
                    <p className="truncate text-xs text-slate-500 lg:hidden">
                      {c.trips} trip{c.trips === 1 ? "" : "s"}{c.nextTrip ? ` · next ${fmtDate(c.nextTrip.travelDate)}` : c.lastTrip ? ` · last ${fmtDate(c.lastTrip)}` : ""}
                    </p>
                  </div>
                  <div className="hidden min-w-0 lg:block">
                    <p className="truncate text-sm text-slate-700">{c.phone || "—"}</p>
                    <p className="truncate text-xs text-slate-500">{c.email || ""}</p>
                  </div>
                  <span className="hidden text-right text-sm text-[#0F1B33] lg:block">{c.trips}</span>
                  <span className="hidden text-sm text-slate-600 lg:block">{c.lastTrip ? fmtDate(c.lastTrip) : "—"}</span>
                  <span className="hidden text-sm text-slate-600 lg:block">{c.nextTrip ? `${fmtDate(c.nextTrip.travelDate)} ${c.nextTrip.time}` : "—"}</span>
                  <span className={`text-right text-sm ${c.unpaid ? "font-medium text-red-600" : "text-slate-400"}`}>{c.unpaid ? money(c.unpaid) : <span className="hidden lg:inline">—</span>}</span>
                  <ChevronRight className="hidden h-4 w-4 text-slate-300 lg:block" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
