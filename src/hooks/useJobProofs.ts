"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { DbJobProof } from "@/lib/database.types";
import type { QueryResult } from "@/lib/queryResult";

export type JobProofMap = Record<string, DbJobProof[]>;

/**
 * Loads job proofs (P0 #4) and keys them by booking_id, updating in real time.
 * The driver app inserts proofs (pickup photo, signature, completion / no-show);
 * the operator dashboard reads them. Capped to recent rows to stay bounded.
 */
export function useJobProofs() {
  const [proofs, setProofs] = useState<JobProofMap>({});
  const [loading, setLoading] = useState(true);

  const query = useCallback(
    () =>
      supabase
        .from("job_proofs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
    []
  );

  const apply = useCallback(({ data }: QueryResult) => {
    const map: JobProofMap = {};
    for (const row of (data as DbJobProof[]) ?? []) {
      (map[row.booking_id] ??= []).push(row);
    }
    setProofs(map);
    setLoading(false);
  }, []);

  const fetch = useCallback(async () => {
    apply(await query());
  }, [query, apply]);

  useEffect(() => {
    let cancelled = false;
    query().then((res) => {
      if (!cancelled) apply(res);
    });

    const channel = supabase
      .channel("job-proofs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_proofs" },
        () => fetch()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [query, apply, fetch]);

  return { proofs, loading };
}
