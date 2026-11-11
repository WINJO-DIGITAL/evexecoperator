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

// Central notification control: the channel-routing settings for ONE business
// (its notification_channel_settings row), plus recent delivery activity (which
// channel was used, and whether it was delivered) from the queue dashboard view.
//
// Until the database has a row per business (draft migration
// 20261111120000_tenant_scoping), the one global row is used instead, so this
// works before and after the change.
export function useNotificationCenter(tenantId) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(isConfigured);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const querySettings = useCallback(async () => {
    if (tenantId) {
      const own = await supabase.from("notification_channel_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
      if (!own.error) return own;
    }
    return supabase.from("notification_channel_settings").select("*").eq("id", true).maybeSingle();
  }, [tenantId]);

  const queryCenter = useCallback(() => Promise.all([
    querySettings(),
    supabase
      .from("notification_queue_dashboard")
      .select("id,type,channel,status,delivery_status,has_error,attempts,sent_at,created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]), [querySettings]);

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
      const row = { ...patch, updated_at: new Date().toISOString() };
      let res = tenantId
        ? await supabase.from("notification_channel_settings").upsert({ tenant_id: tenantId, ...row }, { onConflict: "tenant_id" })
        : { error: { message: "no business" } };
      // No row per business yet in the database: use the one global row.
      if (res.error) res = await supabase.from("notification_channel_settings").update(row).eq("id", true);
      if (res.error) throw res.error;
    } catch (e) {
      const message = e?.message ?? "Couldn't save — check connection.";
      await load(); // roll back to server truth (this clears any old error)
      setError(message); // so the message is set after it, and stays on screen
    } finally {
      setSaving(false);
    }
  }, [load, tenantId]);

  return { settings, activity, loading, saving, error, update, refresh: load };
}
