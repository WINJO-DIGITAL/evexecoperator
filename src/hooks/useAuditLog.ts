"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { DbAuditLogEntry } from "@/lib/database.types";
import type { QueryResult } from "@/lib/queryResult";

const AUDIT_LOG_LIMIT = 100;

export function useAuditLog() {
  const [entries, setEntries] = useState<DbAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    () =>
      supabase
        .from("booking_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(AUDIT_LOG_LIMIT),
    []
  );

  const apply = useCallback(({ data, error: err }: QueryResult) => {
    if (err) {
      setError(err.message);
    } else {
      setEntries((data as DbAuditLogEntry[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    apply(await query());
  }, [query, apply]);

  useEffect(() => {
    let cancelled = false;
    query().then((res) => {
      if (!cancelled) apply(res);
    });

    // Real-time — new activity appears instantly as operators make changes
    const channel = supabase
      .channel("booking-audit-log-calendar")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "booking_audit_log" },
        (payload) => {
          setEntries((prev) => [payload.new as DbAuditLogEntry, ...prev].slice(0, AUDIT_LOG_LIMIT));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [query, apply]);

  return { entries, loading, error, refetch: fetch };
}