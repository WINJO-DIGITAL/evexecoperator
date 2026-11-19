"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

// Partner drivers (kind "partner") have no Driver App, so the office completes
// their jobs. Only these statuses can move to Completed for a partner (the
// database rule, migration 20261115090000).
export const PARTNER_COMPLETABLE = ["Dispatched", "Passenger On Board"];

export function isPartnerOpenJob(booking, drivers = []) {
  if (!booking?.driverId) return false;
  const driver = drivers.find((d) => d.id === booking.driverId);
  return driver?.kind === "partner" && PARTNER_COMPLETABLE.includes(booking.status);
}

// One-tap "Mark completed" for a partner's job. The first tap asks for a
// confirmation; the second writes it. Clicks don't reach the row behind.
export default function PartnerCompleteButton({ onComplete, compact = false }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const stop = (e) => e.stopPropagation();

  const finish = async (e) => {
    stop(e);
    setBusy(true);
    try {
      await onComplete();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1" onClick={stop} onKeyDown={stop}>
        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-lg bg-emerald-600 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60 ${compact ? "h-7 px-2 text-[11px]" : "h-8 px-3 text-xs"}`}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Confirm
        </button>
        <button
          type="button"
          onClick={(e) => { stop(e); setConfirming(false); }}
          disabled={busy}
          className={`rounded-lg border border-slate-200 px-2 font-medium text-slate-600 transition hover:bg-white disabled:opacity-60 ${compact ? "h-7 text-[11px]" : "h-8 text-xs"}`}
        >
          Not yet
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { stop(e); setConfirming(true); }}
      onKeyDown={stop}
      className={`inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 font-semibold text-emerald-700 transition hover:bg-emerald-100 ${compact ? "h-7 px-2 text-[11px]" : "h-8 px-3 text-xs"}`}
    >
      <Check className="h-3 w-3" /> Mark completed
    </button>
  );
}
