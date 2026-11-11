"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { DbDriverLocation } from "@/lib/database.types";
import type { QueryResult } from "@/lib/queryResult";

// A driver is considered "live" if we've had a position fix within this window.
export const LIVE_LOCATION_FRESH_MS = 60_000;

export type DriverLocationMap = Record<string, DbDriverLocation>;

/**
 * Subscribes to live driver positions (P0 #1 of the driver-app audit).
 *
 * The driver app upserts into `driver_locations` (~every 10s on an active job);
 * this hook keeps an in-memory map keyed by driver_id and updates it in real
 * time via Supabase `postgres_changes`, mirroring the convention in useDrivers.
 */
export function useDriverLocations() {
  const [locations, setLocations] = useState<DriverLocationMap>({});
  const [loading, setLoading] = useState(true);

  const query = useCallback(() => supabase.from("driver_locations").select("*"), []);

  const apply = useCallback(({ data }: QueryResult) => {
    const map: DriverLocationMap = {};
    for (const row of (data as DbDriverLocation[]) ?? []) {
      map[row.driver_id] = row;
    }
    setLocations(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    query().then((res) => {
      if (!cancelled) apply(res);
    });

    const channel = supabase
      .channel("driver-locations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as DbDriverLocation;
            setLocations((prev) => {
              const next = { ...prev };
              delete next[old.driver_id];
              return next;
            });
          } else {
            const row = payload.new as DbDriverLocation;
            setLocations((prev) => ({ ...prev, [row.driver_id]: row }));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [query, apply]);

  return { locations, loading };
}

/** True when a location fix is recent enough to treat the driver as live. */
export function isLocationLive(
  location: DbDriverLocation | undefined,
  now: number = Date.now()
): boolean {
  if (!location?.updated_at) return false;
  return now - new Date(location.updated_at).getTime() < LIVE_LOCATION_FRESH_MS;
}
