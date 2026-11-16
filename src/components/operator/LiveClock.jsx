"use client";

import React, { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

export default function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
      <Clock3 className="h-4 w-4 text-amber-600" />
      <span className="text-sm font-medium text-[#0F1B33] tracking-wide">
        {time.toLocaleTimeString("en-GB")}
      </span>
    </div>
  );
}
