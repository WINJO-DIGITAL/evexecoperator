"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  Contact,
  Users,
  BarChart3,
  Settings,
  Car,
  BookOpen,
  CalendarDays,
  FileText,
  Inbox,
  MoreHorizontal,
  LogOut,
  X,
  ExternalLink,
} from "lucide-react";
import { PORTALS } from "@/lib/operator/portals";
import { initialsOf } from "./OperatorContext";
import { DEPLOYMENT_BRAND } from "@/lib/deploymentBrand";

// Main sections, in order. `mobile: true` puts it on the phone tab bar; the
// rest live under "More" there.
const navItems = [
  { label: "Today", icon: Sun, href: "/operator/today", mobile: true },
  { label: "Bookings", icon: CalendarDays, href: "/operator/bookings", mobile: true },
  { label: "Inbox", icon: Inbox, href: "/operator/inbox", mobile: true, badge: "inbox" },
  { label: "Customers", icon: Contact, href: "/operator/customers" },
  { label: "Drivers", icon: Users, href: "/operator/drivers", mobile: true },
  { label: "Invoices", icon: FileText, href: "/operator/invoices" },
  { label: "Analytics", icon: BarChart3, href: "/operator/analytics" },
  { label: "Settings", icon: Settings, href: "/operator/settings" },
];

const portalLinks = [
  { label: "Driver app", icon: Car, href: PORTALS.driverApp.url },
  { label: "Booking page", icon: BookOpen, href: PORTALS.bookingForm.url },
];

const isActive = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);

function Badge({ count, className = "" }) {
  if (!count) return null;
  return (
    <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ${className}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function Sidebar({ inboxCount = 0, businessName = DEPLOYMENT_BRAND.name, logoUrl = null, onSignOut }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const badgeFor = (item) => (item.badge === "inbox" ? inboxCount : 0);
  const moreItems = navItems.filter((i) => !i.mobile);
  const moreActive = moreItems.some((i) => isActive(pathname, i.href));

  // Close the "More" sheet on navigation (while rendering, as React recommends
  // for state that follows a value) and with Escape.
  const [sheetPath, setSheetPath] = useState(pathname);
  if (sheetPath !== pathname) {
    setSheetPath(pathname);
    setMoreOpen(false);
  }
  useEffect(() => {
    if (!moreOpen) return;
    const k = (e) => { if (e.key === "Escape") setMoreOpen(false); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [moreOpen]);

  return (
    <>
      {/* Tablet & desktop: left sidebar. Icon rail with small labels on
          tablets, full labelled sidebar from lg. */}
      <aside
        aria-label="Main navigation"
        className="fixed left-0 top-0 z-50 hidden h-screen w-20 flex-col border-r border-white/5 bg-[#050B17] py-5 sm:flex lg:w-60 lg:px-4"
      >
        <Link href="/operator/today" className="mb-8 flex items-center justify-center gap-3 lg:justify-start lg:px-2" title={businessName}>
          {logoUrl ? (
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-1">
              {/* The business's own logo (Settings → Branding) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
            </span>
          ) : (
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-sm font-bold text-amber-300">
              {initialsOf(businessName)}
            </span>
          )}
          <span className="hidden min-w-0 lg:block">
            <span className="block truncate text-sm font-semibold text-white">{businessName}</span>
            <span className="block text-[11px] text-slate-500">Operator</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 px-2 lg:px-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            const count = badgeFor(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[10px] font-medium transition lg:flex-row lg:gap-3 lg:px-3 lg:py-2.5 lg:text-sm ${
                  active
                    ? "bg-amber-400/10 text-amber-300"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="lg:flex-1">{item.label}</span>
                <Badge count={count} className="absolute right-2 top-1.5 lg:static" />
                {active && <span className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-amber-400 lg:-left-4" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 flex flex-col gap-1 border-t border-white/5 px-2 pt-4 lg:px-0">
          <p className="hidden px-3 pb-1 text-[10px] uppercase tracking-[0.2em] text-slate-600 lg:block">Open</p>
          {portalLinks.map((p) => {
            const Icon = p.icon;
            return (
              <a
                key={p.label}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                title={p.label}
                className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] text-slate-500 transition hover:bg-white/5 hover:text-amber-300 lg:flex-row lg:gap-3 lg:px-3 lg:text-xs"
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="lg:flex-1">{p.label}</span>
                <ExternalLink className="hidden h-3 w-3 lg:block" />
              </a>
            );
          })}
        </div>
      </aside>

      {/* Phone: four main tabs + More */}
      <nav
        aria-label="Main navigation"
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-white/5 bg-[#050B17]/95 px-1 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-1 backdrop-blur-xl sm:hidden"
      >
        {navItems.filter((i) => i.mobile).map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          const count = badgeFor(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 ${active ? "text-amber-300" : "text-slate-500"}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              <Badge count={count} className="absolute right-[calc(50%-1.25rem)] top-1" />
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 ${moreActive ? "text-amber-300" : "text-slate-500"}`}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] sm:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button aria-label="Close" className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-sm font-semibold text-[#0F1B33]">{businessName}</p>
              <button onClick={() => setMoreOpen(false)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            {moreItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[48px] items-center gap-3 rounded-2xl px-3 text-sm ${active ? "bg-amber-400/10 text-amber-700" : "text-slate-700"}`}
                >
                  <Icon className="h-5 w-5 text-slate-500" /> {item.label}
                </Link>
              );
            })}
            <div className="my-2 border-t border-slate-100" />
            {portalLinks.map((p) => {
              const Icon = p.icon;
              return (
                <a key={p.label} href={p.href} target="_blank" rel="noopener noreferrer" className="flex min-h-[48px] items-center gap-3 rounded-2xl px-3 text-sm text-slate-700">
                  <Icon className="h-5 w-5 text-slate-500" /> {p.label}
                  <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-400" />
                </a>
              );
            })}
            {onSignOut && (
              <button onClick={onSignOut} className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3 text-left text-sm text-red-600">
                <LogOut className="h-5 w-5" /> Sign out
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
