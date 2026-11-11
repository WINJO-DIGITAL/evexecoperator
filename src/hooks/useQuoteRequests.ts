"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { DbQuoteRequest } from "@/lib/database.types";
import type { QueryResult } from "@/lib/queryResult";

export function useQuoteRequests() {
  const [quoteRequests, setQuoteRequests] = useState<DbQuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const prevRef               = useRef<DbQuoteRequest[]>([]);

  const query = useCallback(
    () => supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
    []
  );

  const apply = useCallback(({ data, error: err }: QueryResult) => {
    if (err) {
      setError(err.message);
    } else {
      const rows = (data as DbQuoteRequest[]) ?? [];
      prevRef.current = rows;
      setQuoteRequests(rows);
      setError(null);
    }
    setLoading(false);
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    apply(await query());
  }, [query, apply]);

  useEffect(() => {
    prevRef.current = quoteRequests;
  }, [quoteRequests]);

  useEffect(() => {
    let cancelled = false;
    query().then((res) => {
      if (!cancelled) apply(res);
    });

    // Real-time — new quote requests from the public site appear instantly
    const channel = supabase
      .channel("quote-requests-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quote_requests" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setQuoteRequests((prev) => [payload.new as DbQuoteRequest, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setQuoteRequests((prev) =>
              prev.map((q) =>
                q.id === (payload.new as DbQuoteRequest).id
                  ? (payload.new as DbQuoteRequest)
                  : q
              )
            );
          } else if (payload.eventType === "DELETE") {
            setQuoteRequests((prev) =>
              prev.filter((q) => q.id !== (payload.old as DbQuoteRequest).id)
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

  const setStatus = useCallback(async (id: string, status: string) => {
    setQuoteRequests((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status } : q))
    );
    const { error: err } = await supabase
      .from("quote_requests")
      .update({ status })
      .eq("id", id);
    if (err) {
      setError(err.message);
      setQuoteRequests(prevRef.current);
      return false;
    }
    return true;
  }, []);

  return { quoteRequests, loading, error, setStatus, refetch: fetch };
}