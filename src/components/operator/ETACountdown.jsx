"use client";

import React, { useState, useEffect } from "react";

function compute(pickupTime, now) {
  if (!pickupTime) return null;
  const diff = new Date(pickupTime) - now;
  const mins = Math.round(diff / 60_000);

  if (mins > 120) {
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    return { label: `${hrs}h ${m}m`, color: "text-slate-500" };
  }
  if (mins > 30) return { label: `in ${mins}m`, color: "text-emerald-600" };
  if (mins > 10) return { label: `in ${mins}m`, color: "text-amber-600" };
  if (mins > 0)  return { label: `in ${mins}m`, color: "text-red-600 font-semibold", urgent: true };
  if (mins > -60) return { label: `${Math.abs(mins)}m ago`, color: "text-red-600" };
  return { label: `${Math.abs(Math.floor(Math.abs(mins) / 60))}h ago`, color: "text-slate-600" };
}

export default function ETACountdown({ pickupTime, className = "" }) {
  // The clock ticks every 30 s; the label is worked out from it while rendering.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pickupTime) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [pickupTime]);
  const state = compute(pickupTime, now);

  if (!state) return <span className="text-slate-600">—</span>;

  return (
    <span className={`${state.color} ${className} text-xs tabular-nums`}>
      {state.urgent && <span className="mr-1">⚡</span>}
      {state.label}
    </span>
  );
}