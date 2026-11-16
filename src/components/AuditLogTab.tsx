"use client";

import { formatDistanceToNow, parseISO } from "date-fns";
import { History, ArrowRight, UserCog, CreditCard, Tag, type LucideIcon } from "lucide-react";
import type { DbAuditLogEntry, BookingStatus } from "@/lib/database.types";
import StatusBadge from "@/components/StatusBadge";

interface Props {
  entries: DbAuditLogEntry[];
  /** Section heading; pass null where the page already shows one. */
  heading?: string | null;
}

const FIELD_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  status: { label: "Status changed", icon: Tag },
  driver: { label: "Driver assignment", icon: UserCog },
  payment_status: { label: "Payment status", icon: CreditCard },
};

export default function AuditLogTab({ entries, heading = "Activity Log" }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        {heading ? <h2 className="text-lg font-bold text-slate-800">{heading}</h2> : <span />}
        <span className="text-xs text-slate-500">{entries.length} recent</span>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-slate-600">
          <History size={32} className="mb-2 text-slate-700" />
          <p className="text-sm">No activity yet</p>
        </div>
      ) : (
        entries.map((entry) => <AuditLogEntryCard key={entry.id} entry={entry} />)
      )}
    </div>
  );
}

function AuditLogEntryCard({ entry }: { entry: DbAuditLogEntry }) {
  const config = FIELD_CONFIG[entry.field] ?? { label: entry.field, icon: History };
  const Icon = config.icon;
  const when = entry.created_at
    ? formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true })
    : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon size={12} className="text-amber-600/80 shrink-0" />
          <p className="text-sm font-semibold text-slate-700 truncate">{config.label}</p>
        </div>
        {when && <span className="text-[10px] text-slate-600 shrink-0 whitespace-nowrap">{when}</span>}
      </div>

      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <ValueLabel field={entry.field} value={entry.old_value} />
        <ArrowRight size={11} className="text-slate-600 shrink-0" />
        <ValueLabel field={entry.field} value={entry.new_value} />
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <span className="text-xs text-slate-500 font-mono">{entry.booking_ref}</span>
        {entry.changed_by_email && (
          <span className="text-[10px] text-slate-600 truncate ml-2">{entry.changed_by_email}</span>
        )}
      </div>
    </div>
  );
}

function ValueLabel({ field, value }: { field: string; value: string | null }) {
  if (field === "status" && value) {
    return <StatusBadge status={value as BookingStatus} compact />;
  }
  return <span className="text-xs text-slate-600">{value ?? "Unassigned"}</span>;
}