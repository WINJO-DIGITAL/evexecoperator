"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { DbBooking, BookingStatus } from "@/lib/database.types";
import { generateBookingRef } from "@/lib/operator/validation";
import type { QueryResult } from "@/lib/queryResult";

export function useBookings() {
  const [bookings, setBookings] = useState<DbBooking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const prevRef                 = useRef<DbBooking[]>([]);

  const query = useCallback(
    () =>
      supabase
        .from("bookings")
        .select("*, drivers!driver_id(name)")
        .order("travel_date", { ascending: true })
        .order("travel_time", { ascending: true }),
    []
  );

  const apply = useCallback(({ data, error: err }: QueryResult) => {
    if (err) {
      setError(err.message);
    } else {
      const rows = (data as DbBooking[]) ?? [];
      prevRef.current = rows;
      setBookings(rows);
      setError(null);
    }
    setLoading(false);
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    apply(await query());
  }, [query, apply]);

  // Keep the revert snapshot in sync with the latest known-good state,
  // so a failed update doesn't roll back past an earlier successful one.
  useEffect(() => {
    prevRef.current = bookings;
  }, [bookings]);

  useEffect(() => {
    let cancelled = false;
    query().then((res) => {
      if (!cancelled) apply(res);
    });

    // Real-time subscription — mirrors operator/driver apps
    const channel = supabase
      .channel("bookings-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setBookings((prev) => [...prev, payload.new as DbBooking]);
          } else if (payload.eventType === "UPDATE") {
            setBookings((prev) =>
              prev.map((b) =>
                b.ref === (payload.new as DbBooking).ref
                  ? (payload.new as DbBooking)
                  : b
              )
            );
          } else if (payload.eventType === "DELETE") {
            setBookings((prev) =>
              prev.filter((b) => b.ref !== (payload.old as DbBooking).ref)
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

  const updateStatus = useCallback(
    async (ref: string, status: BookingStatus) => {
      // Optimistic update
      setBookings((prev) =>
        prev.map((b) => (b.ref === ref ? { ...b, status } : b))
      );
      const { error: err } = await supabase
        .from("bookings")
        .update({ status })
        .eq("ref", ref);
      if (err) {
        setError(err.message);
        // Revert on failure
        setBookings(prevRef.current);
        return false;
      }
      return true;
    },
    []
  );

  const assignDriver = useCallback(
    async (ref: string, driver_id: string | null) => {
      setBookings((prev) =>
        prev.map((b) =>
          b.ref === ref
            ? {
                ...b,
                driver_id,
                status:
                  driver_id && b.status === "Unassigned"
                    ? "Dispatched"
                    : b.status,
              }
            : b
        )
      );
      const { error: err } = await supabase
        .from("bookings")
        .update({
          driver_id,
          assigned_driver_id: driver_id,
          ...(driver_id ? { status: "Dispatched" as BookingStatus } : {}),
        })
        .eq("ref", ref);
      if (err) {
        setError(err.message);
        setBookings(prevRef.current);
        return false;
      }
      return true;
    },
    []
  );

  const createBooking = useCallback(
    async (data: Omit<DbBooking, "id" | "ref" | "created_at" | "updated_at" | "drivers">) => {
      const ref = generateBookingRef();
      const { error: err } = await supabase
        .from("bookings")
        // source:'operator' lets the DB enqueue the customer confirmation + 24h
        // reminder texts for manually-entered bookings. Website bookings keep
        // the default 'website' (notified by the site) so there are no duplicates.
        // Made by the operator, so accepted from the start (only website
        // requests wait for Accept/Decline).
        .insert({ ...data, ref, source: "operator", operator_response: "accepted", operator_responded_at: new Date().toISOString() });
      if (err) throw new Error(err.message);
      return ref;
    },
    []
  );

  const deleteBooking = useCallback(
    async (ref: string, password: string) => {
      if (!password.trim()) throw new Error("Enter your password to confirm deletion.");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.email) {
        throw new Error("You must be signed in to delete a booking.");
      }

      // Second-factor style confirmation: require the operator to re-enter
      // their Supabase password immediately before the destructive action.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password,
      });
      if (authError) throw new Error("Password verification failed.");

      const snapshot = prevRef.current;
      setBookings((prev) => prev.filter((b) => b.ref !== ref));

      const { error: deleteError } = await supabase
        .from("bookings")
        .delete()
        .eq("ref", ref);

      if (deleteError) {
        setBookings(snapshot);
        throw new Error(deleteError.message);
      }

      await fetch();
      return true;
    },
    [fetch]
  );

  return { bookings, loading, error, updateStatus, assignDriver, createBooking, deleteBooking, refetch: fetch };
}
