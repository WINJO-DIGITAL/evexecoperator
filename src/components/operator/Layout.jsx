"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Bell, X, LogOut, Plus, CalendarPlus, Settings as SettingsIcon, KeyRound, ChevronDown } from "lucide-react";
import Sidebar from "./Sidebar";
import LiveClock from "./LiveClock";
import RealtimeDot from "./RealtimeDot";
import ErrorBoundary from "./ErrorBoundary";
import BookingModal, { customersFromBookings } from "./BookingModal";
import { useOperatorToast } from "./Toast";
import { useNewBookingAlerts } from "@/hooks/operator/useNewBookingAlerts";
import { useBookings } from "@/hooks/operator/useBookings";
import { playNewBookingChime } from "@/lib/operator/notificationSound";
import { useTenantProfile } from "@/hooks/operator/useTenantProfile";
import { pricingFromTenant } from "@/lib/prices";
import { brandFrom } from "@/lib/brand";
import { useQuoteRequests } from "@/hooks/useQuoteRequests";
import { useMissedCalls as useInboxMissedCalls } from "@/hooks/useMissedCalls";
import { useContactMessages } from "@/hooks/useContactMessages";
import { OperatorProvider, ROLE_LABELS, initialsOf } from "./OperatorContext";
import { DEPLOYMENT_BRAND } from "@/lib/deploymentBrand";

const pageMeta = {
  "/operator/today": { label: "Overview", title: "Today" },
  "/operator/bookings": { label: "Operations", title: "Bookings" },
  "/operator/inbox": { label: "Requests", title: "Inbox" },
  "/operator/customers": { label: "People", title: "Customers" },
  "/operator/drivers": { label: "Fleet", title: "Driver Management" },
  "/operator/invoices": { label: "Billing", title: "Invoices" },
  "/operator/analytics": { label: "Insights", title: "Analytics" },
  "/operator/settings": { label: "System", title: "Settings" },
};

// New bookings as they arrive. Quotes, missed calls and messages live in the
// Inbox (its own badge), linked at the foot so nothing is counted twice.
function NotificationPopover({
  newBookings,
  inboxCount,
  onClose,
  onOpenBooking,
  onDismissBooking,
  onClearBookings,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [onClose]);

  const total = newBookings.length;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-80"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Notifications</p>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <button
              onClick={onClearBookings}
              className="text-[10px] text-slate-500 hover:text-amber-600 transition"
              title="Mark all as read"
            >
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="text-slate-500 hover:text-[#0F1B33] transition">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {total === 0 && (
          <p className="py-6 text-center text-sm text-slate-600">No new bookings</p>
        )}

        {/* New bookings */}
        {newBookings.length > 0 && (
          <>
            <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-600/80">
              New bookings
            </p>
            {newBookings.map((b) => (
              <div key={`b-${b.id}`} className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-400/10">
                  <CalendarPlus className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <button onClick={() => onOpenBooking(b)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-[#0F1B33]">{b.customer}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{b.route}</p>
                  <p className="mt-0.5 text-[10px] text-slate-600">
                    {b.source === "website" ? "Online booking" : "New booking"}
                    {b.time ? ` · ${b.time}` : ""} · {b.ref}
                  </p>
                </button>
                <button
                  onClick={() => onDismissBooking(b.id)}
                  className="mt-0.5 flex-shrink-0 text-slate-600 hover:text-[#0F1B33] transition"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </>
        )}

      </div>
      <Link
        href="/operator/inbox"
        onClick={onClose}
        className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-amber-600"
      >
        <span>Quotes, missed calls &amp; messages</span>
        <span className="flex items-center gap-2">
          {inboxCount > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{inboxCount}</span>}
          Inbox →
        </span>
      </Link>
    </div>
  );
}

// The signed-in person: name/email, role and business, with Settings,
// password and sign-out in one place (replaces the old fixed "Operator" chip).
function AccountMenu({ user, tenant, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("pointerdown", h); document.removeEventListener("keydown", k); };
  }, [open]);

  const display = user?.name || user?.email || "Signed in";
  const role = ROLE_LABELS[user?.role] || "Staff";
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${display}`}
        className="glass flex h-10 items-center gap-2 rounded-2xl pl-1 pr-1 transition hover:bg-slate-100 sm:h-12 lg:pr-3"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/15 text-xs font-semibold text-amber-700 sm:h-10 sm:w-10 sm:text-sm">
          {initialsOf(user?.name || user?.email)}
        </span>
        <span className="hidden min-w-0 text-left lg:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-[#0F1B33]">{display}</span>
          <span className="block text-xs text-slate-500">{role}</span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 lg:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-[#0F1B33]">{display}</p>
            {user?.name && user?.email && <p className="truncate text-xs text-slate-500">{user.email}</p>}
            <p className="mt-1 text-xs text-slate-500">{role}{tenant?.name ? ` · ${tenant.name}` : ""}</p>
          </div>
          <Link role="menuitem" href="/operator/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50">
            <SettingsIcon className="h-4 w-4 text-slate-500" /> Settings
          </Link>
          <Link role="menuitem" href="/operator/settings?section=security" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50">
            <KeyRound className="h-4 w-4 text-slate-500" /> Change password
          </Link>
          <button role="menuitem" onClick={() => { setOpen(false); onSignOut?.(); }} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm text-red-600 transition hover:bg-red-50">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children, onSignOut }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = pageMeta[pathname] ?? pageMeta["/operator/today"];
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  // The one New Booking form: opened from the header +, a quote in the Inbox,
  // etc. `opts` carries the form's heading and an onCreated callback.
  const [newBooking, setNewBooking] = useState({ open: false, initialValues: undefined, opts: {} });
  const openNewBooking = useCallback((initialValues, opts = {}) => {
    setNewBooking({ open: true, initialValues, opts });
  }, []);
  const profile = useTenantProfile();
  const quotes = useQuoteRequests();
  const inboxCalls = useInboxMissedCalls();
  const messages = useContactMessages();

  // The header search jumps to the Bookings list filtered by the term — that
  // list already does the actual customer/flight/ref/driver matching.
  const submitSearch = useCallback(
    (e) => {
      e.preventDefault();
      const q = searchTerm.trim();
      setSearchOpen(false);
      router.push(q ? `/operator/bookings?q=${encodeURIComponent(q)}` : "/operator/bookings");
    },
    [searchTerm, router]
  );
  // All bookings, so New Booking can suggest any past customer.
  const { createBooking, bookings } = useBookings({ scope: "all" });
  const customers = useMemo(() => customersFromBookings(bookings), [bookings]);
  const toast = useOperatorToast();

  // Real-time new-booking alerts: toast + chime on arrival, and a running list
  // in the bell. Ignores bookings this operator just created themselves.
  const handleNewBooking = useCallback((b) => {
    toast({
      message: `New booking — ${b.customer}${b.route && b.route !== "New booking" ? ` (${b.route})` : ""}`,
      type: "success",
    });
    playNewBookingChime();
  }, [toast]);
  const { newBookings, clear: clearNewBookings, dismiss: dismissNewBooking } =
    useNewBookingAlerts({ onNew: handleNewBooking });

  const alertCount = newBookings.length;

  const openBooking = useCallback((b) => {
    setBellOpen(false);
    dismissNewBooking(b.id);
    router.push(`/operator/bookings?q=${encodeURIComponent(b.ref)}`);
  }, [router, dismissNewBooking]);

  const handleCreateBooking = useCallback(async (form) => {
    const result = await createBooking(form);
    await newBooking.opts?.onCreated?.(result);
    toast({
      message: result.returnRef
        ? `Booking ${result.ref} + return ${result.returnRef} created`
        : `Booking ${result.ref} created successfully`,
      type: "success",
    });
    return result;
  }, [createBooking, toast, newBooking.opts]);

  const inboxCount = useMemo(() => {
    const newQuotes = quotes.quoteRequests.filter((q) => !q.status || q.status === "new").length;
    const unresolvedCalls = inboxCalls.missedCalls.filter((c) => !c.resolved).length;
    const unreadMessages = messages.contactMessages.filter((m) => m.status !== "read").length;
    return newQuotes + unresolvedCalls + unreadMessages;
  }, [quotes.quoteRequests, inboxCalls.missedCalls, messages.contactMessages]);

  const operatorValue = useMemo(() => ({
    openNewBooking,
    inbox: {
      quoteRequests: quotes.quoteRequests,
      missedCalls: inboxCalls.missedCalls,
      contactMessages: messages.contactMessages,
      loading: quotes.loading || inboxCalls.loading || messages.loading,
      count: inboxCount,
      setQuoteStatus: quotes.setStatus,
      setMissedCallResolved: inboxCalls.setResolved,
      setContactMessageStatus: messages.setStatus,
    },
    profile: { tenant: profile.tenant, user: profile.user, pricing: pricingFromTenant(profile.tenant?.pricing), brand: brandFrom(profile.tenant), reload: profile.reload },
  }), [
    openNewBooking, inboxCount, profile.tenant, profile.user, profile.reload,
    quotes.quoteRequests, quotes.loading, quotes.setStatus,
    inboxCalls.missedCalls, inboxCalls.loading, inboxCalls.setResolved,
    messages.contactMessages, messages.loading, messages.setStatus,
  ]);

  const businessName = profile.tenant?.name || DEPLOYMENT_BRAND.name;

  // Keep browser tab title in sync with the active page
  useEffect(() => {
    document.title = `${meta.title} — ${businessName}`;
  }, [meta.title, businessName]);

  return (
    <OperatorProvider value={operatorValue}>
    <div className="min-h-screen bg-white text-[#0F1B33]">
      <Sidebar inboxCount={inboxCount} businessName={businessName} logoUrl={brandFrom(profile.tenant).logoUrl} onSignOut={onSignOut} />
      <main className="ml-0 min-h-screen w-full max-w-full overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] sm:ml-20 sm:w-auto lg:ml-60 sm:pb-0 bg-[linear-gradient(180deg,#F5F6F9_0%,#EEF0F4_100%)]">
        <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-10 sm:pb-6 sm:pt-6 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">

            {/* Page title — hidden when mobile search is open */}
            <div className={`min-w-0 flex-1 sm:flex-none ${searchOpen ? "hidden sm:block" : ""}`}>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-600">{meta.label}</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#0F1B33] sm:text-3xl">
                {meta.title}
              </h1>
            </div>

            {/* Mobile search — expanded inline */}
            {searchOpen && (
              <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2 sm:hidden">
                <div className="glass flex flex-1 items-center gap-3 rounded-2xl px-4 py-3">
                  <Search className="h-4 w-4 flex-shrink-0 text-slate-500" />
                  <input
                    autoFocus
                    type="search"
                    enterKeyHint="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search bookings and drivers"
                    placeholder="Search bookings, drivers…"
                    className="w-full bg-transparent text-sm text-[#0F1B33] outline-none placeholder:text-slate-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:text-[#0F1B33]"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            )}

            {/* Desktop centre search */}
            <form onSubmit={submitSearch} className="hidden flex-1 justify-center xl:flex">
              <div className="glass flex w-full max-w-lg items-center gap-3 rounded-2xl px-4 py-3">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  type="search"
                  enterKeyHint="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search bookings, flights and drivers"
                  placeholder="Search bookings, flights, drivers…"
                  className="w-full bg-transparent text-sm text-[#0F1B33] outline-none placeholder:text-slate-400"
                />
              </div>
            </form>

            {/* Right actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              <RealtimeDot />

              {/* New booking — one consistent gold action, top-right on every screen */}
              <button
                onClick={() => openNewBooking()}
                title="New Booking"
                aria-label="New Booking"
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold-gradient text-navy-900 shadow-gold-sm transition hover:shadow-gold-md active:scale-95 sm:h-12 sm:w-12"
              >
                <Plus className="h-5 w-5" strokeWidth={2.75} />
              </button>

              {/* Mobile search toggle */}
              {!searchOpen && (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="glass flex h-10 w-10 items-center justify-center rounded-2xl xl:hidden"
                  title="Search"
                >
                  <Search className="h-4 w-4 text-slate-600" />
                </button>
              )}

              {/* Bell with missed-call badge */}
              <div className="relative">
                <button
                  onClick={() => setBellOpen(!bellOpen)}
                  className="glass relative flex h-10 w-10 items-center justify-center rounded-2xl transition hover:bg-slate-100 sm:h-12 sm:w-12"
                  aria-label={alertCount > 0 ? `New bookings — ${alertCount}` : "New bookings"}
                  title="Notifications"
                >
                  <Bell className="h-4 w-4 text-slate-600 sm:h-5 sm:w-5" />
                  {alertCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {alertCount > 9 ? "9+" : alertCount}
                    </span>
                  )}
                </button>
                {bellOpen && (
                  <NotificationPopover
                    newBookings={newBookings}
                    inboxCount={inboxCount}
                    onClose={() => setBellOpen(false)}
                    onOpenBooking={openBooking}
                    onDismissBooking={dismissNewBooking}
                    onClearBookings={clearNewBookings}
                  />
                )}
              </div>

              <div className="hidden sm:block">
                <LiveClock />
              </div>

              <AccountMenu user={profile.user} tenant={profile.tenant} onSignOut={onSignOut} />
            </div>
          </div>
        </header>
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      <BookingModal
        open={newBooking.open}
        onClose={() => setNewBooking((n) => ({ ...n, open: false }))}
        onSubmit={handleCreateBooking}
        customers={customers}
        initialValues={newBooking.initialValues}
        eyebrow={newBooking.opts?.eyebrow}
        heading={newBooking.opts?.heading}
      />
    </div>
    </OperatorProvider>
  );
}
