"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { DbContactMessage } from "@/lib/database.types";
import type { QueryResult } from "@/lib/queryResult";

export function useContactMessages() {
  const [contactMessages, setContactMessages] = useState<DbContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const prevRef               = useRef<DbContactMessage[]>([]);

  const query = useCallback(
    () => supabase.from("contact_messages").select("*").order("created_at", { ascending: false }),
    []
  );

  const apply = useCallback(({ data, error: err }: QueryResult) => {
    if (err) {
      setError(err.message);
    } else {
      const rows = (data as DbContactMessage[]) ?? [];
      prevRef.current = rows;
      setContactMessages(rows);
      setError(null);
    }
    setLoading(false);
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    apply(await query());
  }, [query, apply]);

  useEffect(() => {
    prevRef.current = contactMessages;
  }, [contactMessages]);

  useEffect(() => {
    let cancelled = false;
    query().then((res) => {
      if (!cancelled) apply(res);
    });

    // Real-time — new "Contact us" submissions from the public site appear instantly
    const channel = supabase
      .channel("contact-messages-calendar")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contact_messages" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setContactMessages((prev) => [payload.new as DbContactMessage, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setContactMessages((prev) =>
              prev.map((m) =>
                m.id === (payload.new as DbContactMessage).id
                  ? (payload.new as DbContactMessage)
                  : m
              )
            );
          } else if (payload.eventType === "DELETE") {
            setContactMessages((prev) =>
              prev.filter((m) => m.id !== (payload.old as DbContactMessage).id)
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
    setContactMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status } : m))
    );
    const { error: err } = await supabase
      .from("contact_messages")
      .update({ status })
      .eq("id", id);
    if (err) {
      setError(err.message);
      setContactMessages(prevRef.current);
      return false;
    }
    return true;
  }, []);

  return { contactMessages, loading, error, setStatus, refetch: fetch };
}