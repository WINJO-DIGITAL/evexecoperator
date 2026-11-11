"use client";

import React, { useEffect, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";

export default function RealtimeDot() {
  const [state, setState] = useState(isConfigured ? "connecting" : "mock");

  useEffect(() => {
    if (!isConfigured || !supabase) return;
    const channelName = `heartbeat-${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase.channel(channelName).subscribe((s) => {
      if (s === "SUBSCRIBED") setState("live");
      else if (s === "CLOSED" || s === "CHANNEL_ERROR") setState("error");
    });
    return () => supabase.removeChannel(ch);
  }, []);

  const map = {
    live: { color: "bg-emerald-400", label: "Live" },
    connecting: { color: "bg-amber-400 animate-pulse", label: "Connecting" },
    error: { color: "bg-red-400", label: "Disconnected" },
    mock: { color: "bg-slate-500", label: "Not connected" },
  };
  const { color, label } = map[state];

  return (
    <div className="hidden items-center gap-2 lg:flex" title={label}>
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}