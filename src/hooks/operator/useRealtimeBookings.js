"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";

function useRealtimeTable(table, onUpdate) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  // Incrementing this value causes the effect to re-run, recreating the channel.
  // Used for exponential-backoff reconnect on CHANNEL_ERROR / TIMED_OUT.
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!isConfigured || !supabase) return;

    let retryTimeout;

    const channelName = `${table}-realtime-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => onUpdateRef.current()
      )
      .subscribe((status) => {
        // On channel failure, schedule a reconnect. Using retryVersion as a
        // dependency causes the effect to tear down and recreate the subscription.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          retryTimeout = setTimeout(
            () => setRetryVersion((v) => v + 1),
            5_000
          );
        }
      });

    return () => {
      clearTimeout(retryTimeout);
      supabase.removeChannel(channel);
    };
  }, [table, retryVersion]);
}

export function useRealtimeBookings(onUpdate) {
  useRealtimeTable("bookings", onUpdate);
}

export function useRealtimeDrivers(onUpdate) {
  useRealtimeTable("drivers", onUpdate);
}