"use client";

import { useEffect, useState } from "react";
import { Check, X, Hourglass, Clock3 } from "lucide-react";
import type { DbBooking } from "@/lib/database.types";

function countdown(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "0:00";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Surfaces the driver's offer/acceptance state (P0 #2) on a booking.
 * - pending: amber "Awaiting accept" with a live countdown to offer_expires_at
 *   (turns to "Offer expired" once elapsed, prompting the operator to reassign).
 * - accepted / declined: emerald / red chip.
 * - no offer recorded: renders nothing.
 */
export default function JobOfferBadge({ booking }: { booking: DbBooking }) {
  const [now, setNow] = useState(() => Date.now());
  const status = booking.offer_status;
  const isPending = status === "pending";

  useEffect(() => {
    if (!isPending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isPending]);

  if (!status) return null;

  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
        <Check size={10} /> Accepted
      </span>
    );
  }

  if (status === "declined") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
        <X size={10} /> Declined
      </span>
    );
  }

  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
        <Clock3 size={10} /> Offer expired
      </span>
    );
  }

  // pending
  const expired = booking.offer_expires_at
    ? new Date(booking.offer_expires_at).getTime() - now <= 0
    : false;

  if (expired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
        <Clock3 size={10} /> Offer expired
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
      <Hourglass size={10} /> Awaiting accept
      {booking.offer_expires_at && (
        <span className="tabular-nums">· {countdown(booking.offer_expires_at, now)}</span>
      )}
    </span>
  );
}
