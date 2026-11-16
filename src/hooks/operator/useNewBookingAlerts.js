"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import { wasBookingJustCreated } from "@/lib/operator/recentBookingRefs";

const SEEN_KEY = "evexec:newBookingsSeenAt";

function compact(v) {
  return v ? String(v).split(",")[0] : null;
}

function shape(row) {
  const pickup = row.pickup_location || row.airport || row.direction || null;
  const dropoff = row.dropoff_address || row.destination || row.airport || null;
  const route = [compact(pickup), compact(dropoff)].filter(Boolean).join(" → ") || "New booking";
  return {
    id: row.ref,
    ref: row.ref,
    customer: row.customer_name || "New customer",
    route,
    time: row.travel_time ? String(row.travel_time).slice(0, 5) : null,
    date: row.travel_date || null,
    source: row.source || "website",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function readSeenAt() {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
function writeSeenAt(iso) {
  try {
    localStorage.setItem(SEEN_KEY, iso);
  } catch {
    /* ignore */
  }
}

// Surfaces bookings created since the operator last cleared the bell, plus any
// that arrive live while the app is open. `onNew` fires for each live arrival
// (used for the toast + chime). Self-created bookings are ignored.
export function useNewBookingAlerts({ onNew } = {}) {
  const [newBookings, setNewBookings] = useState([]);
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  });

  const add = useCallback((item, isLive) => {
    if (wasBookingJustCreated(item.ref)) return;
    setNewBookings((prev) => {
      if (prev.some((b) => b.id === item.id)) return prev;
      return [item, ...prev].slice(0, 25);
    });
    if (isLive) onNewRef.current?.(item);
  }, []);

  // Seed with bookings that arrived while the operator was away.
  useEffect(() => {
    if (!isConfigured || !supabase) return;
    let seenAt = readSeenAt();
    if (!seenAt) {
      // First run on this device — start the clock now, don't backfill history.
      seenAt = new Date().toISOString();
      writeSeenAt(seenAt);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("ref, customer_name, pickup_location, airport, direction, dropoff_address, destination, travel_time, travel_date, source, created_at")
        .gt("created_at", seenAt)
        .order("created_at", { ascending: false })
        .limit(25);
      if (cancelled || error || !data) return;
      for (const row of [...data].reverse()) add(shape(row), false);
    })();
    return () => {
      cancelled = true;
    };
  }, [add]);

  // Live inserts.
  useEffect(() => {
    if (!isConfigured || !supabase) return;
    const channel = supabase
      .channel(`new-booking-alerts-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload) => {
          if (payload?.new) add(shape(payload.new), true);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [add]);

  const clear = useCallback(() => {
    setNewBookings([]);
    writeSeenAt(new Date().toISOString());
  }, []);

  const dismiss = useCallback((id) => {
    setNewBookings((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return { newBookings, count: newBookings.length, clear, dismiss };
}
