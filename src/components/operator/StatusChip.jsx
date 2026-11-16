// Light status pill for booking lists (Today, Bookings board).
const STATUS_CHIP = {
  Dispatched: "bg-amber-50 text-amber-700 border-amber-200",
  "En Route": "bg-blue-50 text-blue-700 border-blue-200",
  Arrived: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Passenger On Board": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Completed: "bg-slate-50 text-slate-600 border-slate-200",
  Cancelled: "bg-slate-50 text-slate-400 border-slate-200",
};

export default function StatusChip({ status }) {
  const cls = STATUS_CHIP[status] || "bg-red-50 text-red-700 border-red-200";
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>;
}
