"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { DbDriverUnavailableDate } from "@/lib/database.types";
import type { QueryResult } from "@/lib/queryResult";

export function useDriverAvailability() {
  const [unavailableDates, setUnavailableDates] = useState<DbDriverUnavailableDate[]>([]);
  const [loading, setLoading] = useState(true);

  const query = useCallback(() => supabase.from("driver_unavailable_dates").select("*"), []);

  const apply = useCallback(({ data }: QueryResult) => {
    setUnavailableDates((data as DbDriverUnavailableDate[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    query().then((res) => {
      if (!cancelled) apply(res);
    });

    // Real-time — drivers marking days off in the driver app reflect instantly
    const channel = supabase
      .channel("driver-unavailability-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_unavailable_dates" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setUnavailableDates((prev) => [...prev, payload.new as DbDriverUnavailableDate]);
          } else if (payload.eventType === "DELETE") {
            setUnavailableDates((prev) =>
              prev.filter((d) => d.id !== (payload.old as DbDriverUnavailableDate).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [query, apply]);

  // Returns the set of driver IDs who have marked themselves unavailable on the given date.
  const unavailableDriverIds = useCallback(
    (date: string | null) => {
      if (!date) return new Set<string>();
      return new Set(unavailableDates.filter((d) => d.date === date).map((d) => d.driver_id));
    },
    [unavailableDates]
  );

  return { unavailableDates, unavailableDriverIds, loading };
}