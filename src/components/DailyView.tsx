"use client";

import { Calendar } from "lucide-react";
import type { DbBooking, DbDriver, BookingStatus } from "@/lib/database.types";
import type { BookingNotificationStatus } from "@/hooks/useNotifications";
import type { DriverLocationMap } from "@/hooks/useDriverLocations";
import type { JobProofMap } from "@/hooks/useJobProofs";
import BookingCard from "./BookingCard";
import { fmtDayDate } from "@/lib/dates";

interface Props {
  date: Date;
  bookings: DbBooking[];
  drivers: DbDriver[];
  notifications: Record<string, BookingNotificationStatus>;
  unavailableDriverIds: Set<string>;
  driverLocations?: DriverLocationMap;
  jobProofs?: JobProofMap;
  onStatusChange: (ref: string, status: BookingStatus) => void;
  onDriverAssign: (ref: string, driverId: string | null) => void;
  onDangerAction?: (booking: DbBooking) => void;
  onViewReturn?: (booking: DbBooking) => void;
}

export default function DailyView({
  date,
  bookings,
  drivers,
  notifications,
  unavailableDriverIds,
  driverLocations,
  jobProofs,
  onStatusChange,
  onDriverAssign,
  onDangerAction,
  onViewReturn,
}: Props) {
  const sorted = [...bookings].sort((a, b) =>
    (a.travel_time ?? "").localeCompare(b.travel_time ?? "")
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 py-1">
        <Calendar size={14} className="text-amber-600/80" />
        <h3 className="text-sm font-semibold text-slate-600">
          {fmtDayDate(date)}
        </h3>
        <span className="ml-auto text-xs text-slate-500">
          {bookings.length} transfer{bookings.length !== 1 ? "s" : ""}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-slate-200 text-slate-600">
          <Calendar size={28} className="mb-2 text-slate-700" />
          <p className="text-sm">No transfers scheduled</p>
          <p className="text-xs mt-1">Tap + to add a booking</p>
        </div>
      ) : (
        sorted.map((booking) => (
          <BookingCard
            key={booking.ref}
            booking={booking}
            drivers={drivers}
            notification={notifications[booking.id]}
            unavailableDriverIds={unavailableDriverIds}
            driverLocation={booking.driver_id ? driverLocations?.[booking.driver_id] : undefined}
            proofs={jobProofs?.[booking.id]}
            onStatusChange={onStatusChange}
            onDriverAssign={onDriverAssign}
            onDangerAction={onDangerAction}
            onViewReturn={onViewReturn}
          />
        ))
      )}
    </div>
  );
}
