// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// A tiny fake of the Supabase query builder that records what was asked and
// answers from per-test tables.
const { state, supabase } = vi.hoisted(() => {
  const state = { calls: [], settings: null, perBusinessWorks: true, upsertError: null, updateError: null };
  function builder(table) {
    const q = { table, filters: {}, op: "select" };
    const api = {
      select: () => api,
      eq: (k, v) => { q.filters[k] = v; return api; },
      order: () => api, limit: () => api,
      maybeSingle: async () => {
        state.calls.push({ ...q, filters: { ...q.filters } });
        if (table !== "notification_channel_settings") return { data: null, error: null };
        if ("tenant_id" in q.filters && !state.perBusinessWorks) return { data: null, error: { message: "column tenant_id does not exist" } };
        return { data: state.settings, error: null };
      },
      upsert: async (row, opts) => { state.calls.push({ table, op: "upsert", row, opts }); return { error: state.upsertError }; },
      update: (row) => { q.op = "update"; q.row = row; return { eq: async (k, v) => { state.calls.push({ table, op: "update", row, filters: { [k]: v } }); return { error: state.updateError }; } }; },
      then: (res) => res({ data: [], error: null }),
    };
    return api;
  }
  return { state, supabase: { from: (t) => builder(t) } };
});

vi.mock("@/lib/supabase", () => ({ supabase, isConfigured: true }));

import { useNotificationCenter } from "./useNotificationCenter";

const T1 = "11111111-1111-4111-8111-111111111111";
const settingsCalls = () => state.calls.filter((c) => c.table === "notification_channel_settings");

beforeEach(() => {
  state.calls = []; state.settings = { email_enabled: false }; state.perBusinessWorks = true; state.upsertError = null; state.updateError = null;
});

describe("useNotificationCenter", () => {
  it("reads the business's own settings row", async () => {
    const { result } = renderHook(() => useNotificationCenter(T1));
    await act(async () => {});
    expect(settingsCalls()[0].filters).toEqual({ tenant_id: T1 });
    expect(result.current.settings.email_enabled).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("saves to the business's own row with an upsert", async () => {
    const { result } = renderHook(() => useNotificationCenter(T1));
    await act(async () => {});
    await act(async () => { await result.current.update({ sms_enabled: false }); });
    const up = settingsCalls().find((c) => c.op === "upsert");
    expect(up.row).toMatchObject({ tenant_id: T1, sms_enabled: false });
    expect(up.opts).toEqual({ onConflict: "tenant_id" });
    expect(result.current.settings.sms_enabled).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("before the database has a row per business it reads and writes the one global row", async () => {
    state.perBusinessWorks = false; state.upsertError = { message: "column tenant_id does not exist" };
    const { result } = renderHook(() => useNotificationCenter(T1));
    await act(async () => {});
    expect(settingsCalls().map((c) => c.filters)).toEqual([{ tenant_id: T1 }, { id: true }]);
    expect(result.current.settings.email_enabled).toBe(false);
    await act(async () => { await result.current.update({ push_enabled: true }); });
    const up = settingsCalls().find((c) => c.op === "update");
    expect(up.filters).toEqual({ id: true });
    expect(result.current.error).toBeNull();
  });

  it("reports a failed save and goes back to what the server holds", async () => {
    state.upsertError = { message: "nope" }; state.updateError = { message: "still nope" };
    const { result } = renderHook(() => useNotificationCenter(T1));
    await act(async () => {});
    await act(async () => { await result.current.update({ email_enabled: true }); });
    expect(result.current.error).toBe("still nope");
    expect(result.current.settings.email_enabled).toBe(false); // reloaded from the server
  });
});
