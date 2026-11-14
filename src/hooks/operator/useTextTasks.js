"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import { ukDateDaysAgo } from "@/hooks/operator/useBookings";
import { textTasksFrom } from "@/lib/operator/textTasks";

const BOOKING = "bookings(ref, travel_date, travel_time, status)";

/** Customer texts waiting for the office to send (see lib/operator/textTasks.js). */
export function useTextTasks() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

  const queryTasks = useCallback(() => Promise.all([
      supabase.from("operator_sms_tasks")
        .select(`id, kind, customer_name, customer_phone, message, status, created_at, booking_id, quote_request_id, ${BOOKING}, quote_requests(status, pickup_date)`)
        .in("status", ["pending", "opened"]),
      supabase.from("driver_sms_reminders")
        .select(`id, reminder_type, customer_name, customer_phone, message, status, created_at, booking_id, travel_date, travel_time, drivers!inner(name, kind), ${BOOKING}`)
        .in("status", ["pending", "opened"])
        .eq("drivers.kind", "partner"),
  ]), []);

  const applyTasks = useCallback(([ops, partner]) => {
    const err = ops.error || partner.error;
    if (err) { setError(err.message); return; }
    setError(null);
    setTasks(textTasksFrom(ops.data, partner.data, ukDateDaysAgo(0)));
  }, []);

  const refresh = useCallback(async () => {
    if (!isConfigured) return;
    applyTasks(await queryTasks());
  }, [queryTasks, applyTasks]);

  // Loads now, every minute, and when the tab is focused again.
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    const run = () => { queryTasks().then((res) => { if (!cancelled) applyTasks(res); }); };
    run();
    const t = setInterval(run, 60_000);
    window.addEventListener("focus", run);
    return () => { cancelled = true; clearInterval(t); window.removeEventListener("focus", run); };
  }, [queryTasks, applyTasks]);

  const mark = useCallback(async (task, status) => {
    const stamp = status === "sent" ? { sent_at: new Date().toISOString() } : { opened_at: new Date().toISOString() };
    const { error: err } = await supabase.from(task.table).update({ status, ...stamp }).eq("id", task.id);
    if (err) throw new Error(err.message);
    await refresh();
  }, [refresh]);

  return { tasks, error, refresh, markOpened: (t) => mark(t, "opened"), markSent: (t) => mark(t, "sent") };
}
