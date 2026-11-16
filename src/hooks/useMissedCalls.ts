"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { DbMissedCall } from "@/lib/database.types";
import type { QueryResult } from "@/lib/queryResult";

export function useMissedCalls() {
  const [missedCalls, setMissedCalls] = useState<DbMissedCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const prevRef               = useRef<DbMissedCall[]>([]);

  const query = useCallback(
    () => supabase.from("missed_calls").select("*").order("created_at", { ascending: false }),
    []
  );

  const apply = useCallback(({ data, error: err }: QueryResult) => {
    if (err) {
      setError(err.message);
    } else {
      const rows = (data as DbMissedCall[]) ?? [];
      prevRef.current = rows;
      setMissedCalls(rows);
      setError(null);
    }
    setLoading(false);
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    apply(await query());
  }, [query, apply]);

  useEffect(() => {
    prevRef.current = missedCalls;
  }, [missedCalls]);

  useEffect(() => {
    let cancelled = false;
    query().then((res) => {
      if (!cancelled) apply(res);
    });

    // Real-time — missed calls logged by the phone system appear instantly
    const channel = supabase
      .channel("missed-calls-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "missed_calls" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMissedCalls((prev) => [payload.new as DbMissedCall, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setMissedCalls((prev) =>
              prev.map((c) =>
                c.id === (payload.new as DbMissedCall).id
                  ? (payload.new as DbMissedCall)
                  : c
              )
            );
          } else if (payload.eventType === "DELETE") {
            setMissedCalls((prev) =>
              prev.filter((c) => c.id !== (payload.old as DbMissedCall).id)
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

  const setResolved = useCallback(async (id: string, resolved: boolean) => {
    setMissedCalls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, resolved } : c))
    );
    const { error: err } = await supabase
      .from("missed_calls")
      .update({ resolved })
      .eq("id", id);
    if (err) {
      setError(err.message);
      setMissedCalls(prevRef.current);
      return false;
    }
    return true;
  }, []);

  return { missedCalls, loading, error, setResolved, refetch: fetch };
}