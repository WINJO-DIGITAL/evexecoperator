"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Columns3, List } from "lucide-react";
import BookingsList from "@/components/operator/BookingsList";
import BookingsBoard from "@/components/operator/BookingsBoard";
import OperatorCalendar from "@/components/operator/calendar/OperatorCalendar";

// One Bookings screen with three views of the same bookings (was Dispatch and
// Calendar). The view is in the URL (?view=list|calendar|board) so links and
// the old /operator/dispatch and /operator/calendar addresses land on the
// right one.
const VIEWS = [
  { key: "list", label: "List", icon: List },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "board", label: "Board", icon: Columns3 },
];

function BookingsPageContent() {
  const params = useSearchParams();
  const view = VIEWS.some((v) => v.key === params.get("view")) ? params.get("view") : "list";
  const q = params.get("q");

  return (
    <div>
      <div className="px-4 pt-4 sm:px-6 lg:px-10 lg:pt-6">
        <div role="tablist" aria-label="Bookings view" className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1">
          {VIEWS.map((v) => {
            const active = v.key === view;
            const href = `/operator/bookings${v.key === "list" ? "" : `?view=${v.key}`}`;
            return (
              <Link
                key={v.key}
                href={href}
                role="tab"
                aria-selected={active}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4 ${
                  active ? "bg-amber-400/10 text-amber-700" : "text-slate-500 hover:text-[#0F1B33]"
                }`}
              >
                <v.icon className="h-4 w-4" /> {v.label}
              </Link>
            );
          })}
        </div>
      </div>
      {view === "list" && <BookingsList key={q ?? ""} />}
      {view === "board" && <BookingsBoard />}
      {view === "calendar" && <OperatorCalendar />}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsPageContent />
    </Suspense>
  );
}
