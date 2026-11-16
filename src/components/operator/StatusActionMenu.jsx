"use client";

import React, { useRef, useState, useEffect } from "react";
import { ChevronDown, Loader2, XCircle, RotateCcw } from "lucide-react";
import { bookingStatusColor } from "@/lib/operator/statusColor";
import { reverseTarget, reverseLabel } from "@/lib/operator/statusFlow";

// Operators no longer advance a job's status — the driver does that live in the
// driver app. This control only lets the operator REVERSE a job one step to
// correct a mistake, or cancel it.
export default function StatusActionMenu({ bookingId, currentStatus, onUpdate, dropUp = false }) {
  const [open, setOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setConfirmCancel(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  const isUpdating = pendingStatus !== null;
  const reverse = reverseTarget(currentStatus);
  const canCancel = currentStatus !== "Cancelled";

  const applyStatus = async (value) => {
    setOpen(false);
    setConfirmCancel(false);
    setPendingStatus(value);
    try {
      await onUpdate?.(bookingId, value);
    } finally {
      setPendingStatus(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { if (!isUpdating) setOpen(!open); }}
        disabled={isUpdating}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition hover:opacity-80 disabled:cursor-wait ${bookingStatusColor(currentStatus)}`}
      >
        {isUpdating ? (
          <><Loader2 className="h-3 w-3 animate-spin" />Updating…</>
        ) : (
          <>
            {currentStatus === "Unassigned / Missed Call Recovery" ? "Missed Call" : currentStatus}
            <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>

      {open && !isUpdating && (
        <div
          role="menu"
          className={`absolute z-50 w-56 rounded-2xl border border-slate-200 bg-white py-1 shadow-2xl ${
            dropUp ? "bottom-full left-0 mb-2" : "left-0 top-full mt-1"
          }`}
        >
          {confirmCancel ? (
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-[#0F1B33]">Cancel this booking?</p>
              <p className="mt-0.5 text-[10px] text-slate-500">The customer will be texted that it's cancelled.</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => applyStatus("Cancelled")}
                  className="flex-1 rounded-xl bg-red-500/20 px-3 py-2.5 text-xs font-medium text-red-600 transition hover:bg-red-500/30"
                >
                  Yes, Cancel
                </button>
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-500 transition hover:text-[#0F1B33]"
                >
                  Keep Job
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-[0.2em] text-slate-600">
                Correct status
              </p>
              <p className="px-4 pb-2 text-[10px] leading-snug text-slate-600">
                Drivers advance the job in the driver app. You can only step it back or cancel.
              </p>
              {reverse && (
                <button
                  role="menuitem"
                  onClick={() => applyStatus(reverse)}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-xs text-slate-700 transition hover:bg-slate-100"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                  {reverseLabel(currentStatus)}
                </button>
              )}
              {canCancel && (
                <button
                  role="menuitem"
                  onClick={() => setConfirmCancel(true)}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-xs text-red-600 transition hover:bg-slate-100"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel job
                </button>
              )}
              {!reverse && !canCancel && (
                <p className="px-4 py-3 text-xs text-slate-500">Nothing to change.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
