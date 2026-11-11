"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";

const DEFAULTS = {
  email_enabled: true,
  sms_enabled: true,
  whatsapp_enabled: false,
  push_enabled: false,
  sms_only_when_necessary: true,
};

// Central notification control: the channel-routing settings the DB triggers
// read, plus recent delivery activity (which channel was used, and whether it
// was delivered) from the queue dashboard view.
export function useNotificationCenter() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(isConfigured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const queryCenter = useCallback(() => Promise.all([
    supabase.from("notification_channel_settings").select("*").eq("id", true).maybeSingle(),
    supabase
      .from("notification_queue_dashboard")
      .select("id,type,channel,status,delivery_status,has_error,attempts,sent_at,created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]), []);

  const applyCenter = useCallback(([{ data: s }, { data: a }]) => {
    if (s) setSettings({ ...DEFAULTS, ...s });
    setActivity(Array.isArray(a) ? a : []);
    setError(null);
  }, []);

  const failCenter = (e) => setError(e?.message ?? "Failed to load notification settings.");

  const load = useCallback(async () => {
    if (!isConfigured) { setLoading(false); return; }
    setLoading(true);
    try {
      applyCenter(await queryCenter());
    } catch (e) {
      failCenter(e);
    } finally {
      setLoading(false);
    }
  }, [queryCenter, applyCenter]);

  // First load. `loading` already starts true, so nothing is set until the answer arrives.
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    queryCenter().then(
      (res) => { if (!cancelled) { applyCenter(res); setLoading(false); } },
      (e) => { if (!cancelled) { failCenter(e); setLoading(false); } }
    );
    return () => { cancelled = true; };
  }, [queryCenter, applyCenter]);

  const update = useCallback(async (patch) => {
    setSettings((prev) => ({ ...prev, ...patch })); // optimistic
    if (!isConfigured) return;
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from("notification_channel_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (err) throw err;
    } catch (e) {
      setError(e?.message ?? "Couldn't save — check connection.");
      await load(); // roll back to server truth
    } finally {
      setSaving(false);
    }
  }, [load]);

  return { settings, activity, loading, saving, error, update, refresh: load };
}
