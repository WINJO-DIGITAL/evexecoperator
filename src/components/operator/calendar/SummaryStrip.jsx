"use client";

import { AlertTriangle, Check } from "lucide-react";
import { StatusMark } from "./BookingRow";

// The period in two quiet lines: volume and revenue, then only the problems
// that need someone (as filters). Every number comes from the bookings in the
// period; when the loaded data doesn't cover it, numbers are withheld (—).

const money = (n) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function CountLink({ value, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group inline-flex items-baseline gap-1 rounded-sm py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cal-brass ${active ? "text-cal-ink" : "text-cal-muted hover:text-cal-ink"}`}
    >
      <span className="font-semibold tabular-nums text-cal-ink">{value}</span>
      <span className={active ? "underline decoration-cal-brass decoration-2 underline-offset-[5px]" : ""}>{label}</span>
    </button>
  );
}

function Exception({ value, label, labelShort, icon, tone, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-cal border px-2.5 text-cal-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cal-brass ${
        active ? "border-cal-ink bg-cal-well text-cal-ink" : `border-cal-line bg-cal-sheet hover:border-cal-rule ${tone}`
      }`}
    >
      {icon}
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="sm:hidden">{labelShort}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function SummaryStrip({ metrics, status, onStatus, complete }) {
  const toggle = (key) => onStatus(status === key ? "all" : key);
  const v = (n) => (complete ? n : "—");
  const exceptions = [
    metrics.driver > 0 && { key: "driver", value: metrics.driver, label: "need driver", labelShort: "need driver", tone: "text-cal-alert", icon: <StatusMark state="driver" /> },
    metrics.reply > 0 && { key: "reply", value: metrics.reply, label: "awaiting reply", labelShort: "to reply", tone: "text-cal-brass-ink", icon: <StatusMark state="reply" /> },
    metrics.attention > 0 && { key: "attention", value: metrics.attention, label: "need attention", labelShort: "to check", tone: "text-cal-alert", icon: <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> },
  ].filter(Boolean);

  return (
    <div className="border-b border-cal-line py-2">
      <div className="flex items-center justify-between gap-3 text-cal-sm">
        <div role="group" aria-label="Transfers in this period" className="flex min-w-0 items-baseline gap-3">
          <CountLink value={v(metrics.total)} label="transfers" active={status === "all"} onClick={() => onStatus("all")} />
          <CountLink value={v(metrics.confirmed)} label="confirmed" active={status === "confirmed"} onClick={() => toggle("confirmed")} />
        </div>
        <p className="shrink-0 text-right text-cal-muted">
          <span className="font-semibold tabular-nums text-cal-ink">{complete ? money(metrics.revenue) : "—"}</span>
          {complete && metrics.unpriced > 0 && <span className="text-cal-xs"> + {metrics.unpriced} TBC</span>}
        </p>
      </div>

      {complete && (
        <div role="group" aria-label="Needs attention" className="mt-1.5 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {exceptions.length ? (
            exceptions.map((e) => <Exception key={e.key} {...e} active={status === e.key} onClick={() => toggle(e.key)} />)
          ) : (
            <p className="inline-flex h-8 items-center gap-1.5 text-cal-xs text-cal-ok">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Nothing needs attention in this period
            </p>
          )}
        </div>
      )}
    </div>
  );
}
