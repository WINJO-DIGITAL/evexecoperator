"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import type { DbDriverLocation } from "@/lib/database.types";
import { isLocationLive } from "@/hooks/useDriverLocations";

function agoLabel(updatedAt: string | null | undefined, now: number): string {
  if (!updatedAt) return "no signal";
  const secs = Math.max(0, Math.round((now - new Date(updatedAt).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

/**
 * Compact live-presence indicator for a driver, driven by `driver_locations`.
 * - Green pulsing "Live" when a fix has arrived within LIVE_LOCATION_FRESH_MS.
 * - Muted "Last seen …" when stale.
 * - Renders nothing when the driver has never reported a position.
 */
export default function DriverLiveBadge({
  location,
}: {
  location: DbDriverLocation | undefined;
}) {
  // Re-render on a timer so the "Xs ago" label and live/stale state stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!location) return null;

  const live = isLocationLive(location, now);
  const mapsUrl = `https://www.google.com/maps?q=${location.lat},${location.lng}`;

  if (live) {
    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 transition hover:bg-emerald-100"
        title={`Live location · ${agoLabel(location.updated_at, now)} · tap to locate`}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        Live
      </a>
    );
  }

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:text-slate-600"
      title={`Last position ${agoLabel(location.updated_at, now)} · tap to locate`}
    >
      <MapPin size={9} />
      {agoLabel(location.updated_at, now)}
    </a>
  );
}
