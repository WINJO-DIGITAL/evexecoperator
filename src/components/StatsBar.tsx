"use client";

import { CalendarDays, UserX, Navigation, PoundSterling } from "lucide-react";
import type { MonthStats } from "@/lib/types";

interface Props {
  stats: MonthStats;
}

export default function StatsBar({ stats }: Props) {
  const items = [
    {
      icon: CalendarDays,
      value: stats.bookingCount.toString(),
      label: "Bookings\nThis Month",
    },
    {
      icon: UserX,
      value: stats.unassignedCount.toString(),
      label: "Unassigned\nBookings",
    },
    {
      icon: Navigation,
      value: stats.destinationCount.toString(),
      label: "Destinations\nServed",
    },
    {
      icon: PoundSterling,
      value: `£${(stats.revenue / 1000).toFixed(1)}K`,
      label: "Revenue\nThis Month",
    },
  ];

  return (
    <div className="grid grid-cols-4 divide-x divide-white/8 bg-white rounded-2xl border border-slate-200 shadow-card">
      {items.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="flex flex-col items-center justify-center py-4 px-2 gap-1.5"
        >
          <Icon size={16} className="text-amber-600/80" />
          <span className="text-sm font-bold text-slate-800">{value}</span>
          <span className="text-[10px] text-slate-500 text-center leading-tight whitespace-pre">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}