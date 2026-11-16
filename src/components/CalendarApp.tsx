"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO, isSameDay, isSameMonth } from "date-fns";
import { AlertTriangle, LayoutList, ShieldCheck, WifiOff } from "lucide-react";
import type { DbBooking, BookingStatus } from "@/lib/database.types";
import { useBookings } from "@/hooks/useBookings";
import { useDrivers } from "@/hooks/useDrivers";
import { useNotifications } from "@/hooks/useNotifications";
import { useDriverAvailability } from "@/hooks/useDriverAvailability";
import { useToast } from "@/hooks/useToast";
import { CLASH_BUFFER_MINUTES, timeToMinutes } from "@/lib/bookingUtils";
import { fmtDate } from "@/lib/dates";

import CalendarView from "@/components/CalendarView";
import DailyView from "@/components/DailyView";
import StatsBar from "@/components/StatsBar";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import { useJobProofs } from "@/hooks/useJobProofs";

// The operator Calendar screen (rendered inside the operator shell, which
// handles sign-in, the header, new-booking alerts and the New Booking form).
// Lists, the inbox, drivers and the activity log each have their own screen;
// this one is the month view plus the selected day's jobs.
export function CalendarApp() {
  const { bookings, loading, error, updateStatus, assignDriver, deleteBooking } = useBookings();
  const { drivers } = useDrivers();
  const { locations: driverLocations } = useDriverLocations();
  const { proofs: jobProofs } = useJobProofs();
  const { notifications } = useNotifications();
  const { unavailableDriverIds } = useDriverAvailability();
  const { showToast } = useToast();

  const [currentMonth, setMonth] = useState<Date>(new Date());
  const [selectedDate, setDate] = useState<Date | null>(new Date());
  const dailyRef = useRef<HTMLDivElement>(null);

  // Tapping a day selects it; on phones the job list sits below the month
  // grid, so scroll it into view (on desktop it's already beside the grid).
  const selectDay = (d: Date) => {
    setDate(d);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setTimeout(() => dailyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  };

  // The return leg is booked as its own job on the return date — jump the
  // calendar to that date so the return job's card is shown.
  const viewReturn = (b: DbBooking) => {
    if (!b.return_date) return;
    const d = parseISO(b.return_date);
    if (!isNaN(d.getTime())) selectDay(d);
  };

  const [dangerTarget, setDangerTarget] = useState<DbBooking | null>(null);
  const [dangerPassword, setDangerPassword] = useState("");
  const [dangerBusy, setDangerBusy] = useState(false);

  const dayBookings = useMemo(() => {
    if (!selectedDate) return [];
    return bookings.filter((b) => b.travel_date && isSameDay(parseISO(b.travel_date), selectedDate));
  }, [bookings, selectedDate]);

  const monthStats = useMemo(() => {
    const month = bookings.filter((b) => {
      if (!b.travel_date) return false;
      return isSameMonth(parseISO(b.travel_date), currentMonth) && b.status !== "Cancelled";
    });
    const revenue = month.reduce((s, b) => s + (b.quoted_price ?? 0), 0);
    const destinations = new Set(month.map((b) => b.dropoff_address).filter(Boolean)).size;
    const unassigned = month.filter((b) => b.status === "Unassigned" || b.status === "Unassigned / Missed Call Recovery").length;
    return { bookingCount: month.length, unassignedCount: unassigned, destinationCount: destinations, revenue };
  }, [bookings, currentMonth]);

  const handleStatusChange = async (ref: string, status: BookingStatus) => {
    const ok = await updateStatus(ref, status);
    if (!ok) showToast("Couldn't update status — check connection and try again", "error");
  };

  const handleDriverAssign = async (ref: string, driverId: string | null) => {
    if (driverId) {
      const booking = bookings.find((b) => b.ref === ref);
      if (booking?.travel_date) {
        if (unavailableDriverIds(booking.travel_date).has(driverId)) {
          const driverName = drivers.find((d) => d.id === driverId)?.name ?? "This driver";
          showToast(`${driverName} has marked ${fmtDate(booking.travel_date)} as unavailable`, "warning");
          return;
        }
        const bookingMinutes = timeToMinutes(booking.travel_time);
        const clash = bookings.find((b) => {
          if (b.ref === ref) return false;
          if (b.driver_id !== driverId) return false;
          if (b.travel_date !== booking.travel_date) return false;
          if (["Completed", "Cancelled"].includes(b.status)) return false;
          const otherMinutes = timeToMinutes(b.travel_time);
          if (bookingMinutes == null || otherMinutes == null) return true;
          return Math.abs(otherMinutes - bookingMinutes) < CLASH_BUFFER_MINUTES;
        });
        if (clash) {
          const clashTime = clash.travel_time?.slice(0, 5) ?? "an unscheduled time";
          showToast(`Clash: driver already has a job at ${clashTime} on ${fmtDate(clash.travel_date)} (within ${CLASH_BUFFER_MINUTES}-min buffer)`, "warning");
          return;
        }
      }
    }
    const ok = await assignDriver(ref, driverId);
    if (!ok) showToast("Couldn't update driver assignment — check connection and try again", "error");
  };

  const openDangerFlow = (booking: DbBooking) => {
    setDangerTarget(booking);
    setDangerPassword("");
  };

  const closeDangerFlow = () => {
    if (dangerBusy) return;
    setDangerTarget(null);
    setDangerPassword("");
  };

  const confirmDangerAction = async () => {
    if (!dangerTarget) return;
    setDangerBusy(true);
    try {
      await deleteBooking(dangerTarget.ref, dangerPassword);
      showToast(`Booking ${dangerTarget.ref} removed`, "success");
      setDangerTarget(null);
      setDangerPassword("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not remove booking", "error");
    } finally {
      setDangerBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-600">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
        Loading live data…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
      {error && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          <WifiOff size={13} /> Offline — showing the last data loaded. Changes may not save until you're back online.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="space-y-4 lg:sticky lg:top-32">
          <CalendarView currentMonth={currentMonth} bookings={bookings} selectedDate={selectedDate} onDateSelect={selectDay} onMonthChange={setMonth} />
          <StatsBar stats={monthStats} />
          <Link
            href="/operator/bookings"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/20 bg-white py-4 text-sm font-semibold text-amber-600 shadow-card transition-all hover:border-gold/40 hover:bg-gold/10 active:scale-[0.99]"
          >
            <LayoutList size={15} />Show as list
          </Link>
        </div>
        <div ref={dailyRef} className="scroll-mt-4">
          {selectedDate && (
            <DailyView
              date={selectedDate}
              bookings={dayBookings}
              drivers={drivers}
              notifications={notifications}
              unavailableDriverIds={unavailableDriverIds(format(selectedDate, "yyyy-MM-dd"))}
              driverLocations={driverLocations}
              jobProofs={jobProofs}
              onStatusChange={handleStatusChange}
              onDriverAssign={handleDriverAssign}
              onDangerAction={openDangerFlow}
              onViewReturn={viewReturn}
            />
          )}
        </div>
      </div>
      {dangerTarget && <PasswordConfirmModal booking={dangerTarget} password={dangerPassword} busy={dangerBusy} onPasswordChange={setDangerPassword} onCancel={closeDangerFlow} onConfirm={confirmDangerAction} />}
    </div>
  );
}

function PasswordConfirmModal({ booking, password, busy, onPasswordChange, onCancel, onConfirm }: { booking: DbBooking; password: string; busy: boolean; onPasswordChange: (value: string) => void; onCancel: () => void; onConfirm: () => void; }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-red-400/20 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-600"><ShieldCheck size={20} /></div>
          <div><h2 className="text-lg font-bold text-[#0F1B33]">Confirm job removal</h2><p className="mt-1 text-sm text-slate-500">For security, re-enter your operator password before removing this booking.</p></div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-sm"><p className="font-semibold text-slate-800">{booking.customer_name}</p><p className="mt-1 text-xs text-slate-500">{booking.ref} · {booking.travel_date ? fmtDate(booking.travel_date) : "No date"} {booking.travel_time?.slice(0, 5) ?? ""}</p></div>
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-700 flex gap-2"><AlertTriangle size={15} className="shrink-0" />This action permanently removes the job from the operator calendar and driver view.</div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500">Operator password</label>
        <input type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} autoFocus className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#0F1B33] outline-none focus:border-gold/50" placeholder="Enter password" />
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy || !password.trim()} className="flex-1 rounded-2xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-500/25 disabled:opacity-50">{busy ? "Verifying…" : "Remove job"}</button>
        </div>
      </div>
    </div>
  );
}
