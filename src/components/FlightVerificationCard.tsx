"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Plane, RefreshCw } from "lucide-react";
import { useFlightVerification } from "@/hooks/useFlightVerification";
import { formatFlightDateTime, type Direction } from "@/lib/operator/flightVerification";

const SEVERITY_STYLES: Record<string, { border: string; bg: string; text: string; icon: JSX.Element }> = {
  green: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-amber-50",
    text: "text-amber-700",
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  },
  red: {
    border: "border-red-300",
    bg: "bg-red-50",
    text: "text-red-700",
    icon: <XCircle className="h-4 w-4 text-red-600" />,
  },
};

interface FlightVerificationCardProps {
  bookingId: string;
  flightNumberInput: string | null;
  airportInput: string | null;
  journeyType?: string | null;
}

function defaultDirection(journeyType?: string | null): Direction {
  const jt = (journeyType ?? "").toLowerCase();
  if (jt.includes("to airport")) return "departure";
  return "arrival";
}

export default function FlightVerificationCard({
  bookingId,
  flightNumberInput,
  journeyType,
}: FlightVerificationCardProps) {
  const { verification, loading, busy, error, verify } = useFlightVerification(bookingId);
  const [direction, setDirection] = useState<Direction>(defaultDirection(journeyType));

  if (!flightNumberInput || !flightNumberInput.trim()) return null;

  const styles = verification ? SEVERITY_STYLES[verification.severity] : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.28em] text-amber-600">Flight verification</p>
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setDirection("arrival")}
            className={`rounded-md px-2 py-1 font-medium transition ${
              direction === "arrival" ? "bg-white text-[#0F1B33] shadow-sm" : "text-slate-500"
            }`}
          >
            Arrival
          </button>
          <button
            type="button"
            onClick={() => setDirection("departure")}
            className={`rounded-md px-2 py-1 font-medium transition ${
              direction === "departure" ? "bg-white text-[#0F1B33] shadow-sm" : "text-slate-500"
            }`}
          >
            Departure
          </button>
        </div>
      </div>

      {verification && (
        <div className="mb-3 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
          <div className="flex items-center gap-2 text-[#0F1B33]">
            <Plane className="h-4 w-4 flex-shrink-0 text-slate-500" />
            <span className="font-semibold">{verification.flight_number}</span>
            {(verification.departure_iata || verification.arrival_iata) && (
              <span className="text-slate-500">
                {verification.departure_iata ?? "—"} → {verification.arrival_iata ?? "—"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
            {verification.scheduled_departure && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Scheduled departure</p>
                <p className="mt-0.5 font-medium text-[#0F1B33]">{formatFlightDateTime(verification.scheduled_departure)}</p>
              </div>
            )}
            {verification.scheduled_arrival && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Scheduled arrival</p>
                <p className="mt-0.5 font-medium text-[#0F1B33]">{formatFlightDateTime(verification.scheduled_arrival)}</p>
              </div>
            )}
            {verification.recommended_pickup && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Estimated arrival</p>
                <p className="mt-0.5 font-medium text-[#0F1B33]">{formatFlightDateTime(verification.recommended_pickup)}</p>
              </div>
            )}
            {verification.flight_status && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Flight status</p>
                <p className="mt-0.5 font-medium text-[#0F1B33]">{verification.flight_status}</p>
              </div>
            )}
          </div>

          {styles && (
            <div className={`mt-2 flex items-start gap-2 rounded-xl border ${styles.border} ${styles.bg} px-3 py-2`}>
              {styles.icon}
              <div className="min-w-0">
                {verification.issues.map((issue, i) => (
                  <p key={i} className={`text-xs font-medium ${styles.text}`}>
                    {issue}
                  </p>
                ))}
              </div>
            </div>
          )}

          <p className="pt-1 text-[10px] text-slate-400">
            Last checked {formatFlightDateTime(verification.verified_at)}
            {verification.verified_by_name ? ` by ${verification.verified_by_name}` : ""}
          </p>
        </div>
      )}

      {error && (
        <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}

      <button
        type="button"
        onClick={() => verify({ direction })}
        disabled={busy || loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20 disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Verifying…
          </>
        ) : (
          <>
            <RefreshCw className="h-3.5 w-3.5" />
            {verification ? "Re-verify flight" : "Verify flight"}
          </>
        )}
      </button>
    </div>
  );
}
