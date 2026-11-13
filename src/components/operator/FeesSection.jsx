"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { checkFees, formatFee, penceToPounds } from "@/lib/operator/fees";

// Settings → Platform → Fees: what the platform charges operators. A default
// monthly and set-up rate, and an optional rate for a single business (blank = use
// the default; 0 = free). These rates are a record only: nothing is billed from them.
// The database re-checks everything and only lets the platform owner read or change it.

const INPUT = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F1B33] outline-none focus:border-amber-400/40 disabled:opacity-60";

function TenantRow({ row, defaults, toast, onSaved }) {
  const [monthly, setMonthly] = useState(row.custom ? penceToPounds(row.monthly_pence) : "");
  const [setup, setSetup] = useState(row.custom ? penceToPounds(row.setup_pence) : "");
  const [busy, setBusy] = useState(false);

  async function save(useDefault) {
    const parsed = useDefault ? { error: null, monthly: null, setup: null } : checkFees({ monthly, setup, allowBlank: true });
    if (parsed.error) { toast({ message: parsed.error, type: "error" }); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_tenant_fees", { p_tenant_id: row.tenant_id, p_monthly_pence: parsed.monthly, p_setup_pence: parsed.setup });
    setBusy(false);
    if (error) { toast({ message: error.message, type: "error" }); return; }
    if (useDefault) { setMonthly(""); setSetup(""); }
    toast({ message: `${row.name}: fees saved`, type: "success" });
    onSaved();
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[#0F1B33]">{row.name}</p>
          <p className="text-xs text-slate-500">
            {formatFee(row.monthly_pence)} a month · {formatFee(row.setup_pence)} set-up · {row.custom ? "own rate" : "default rate"}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input className={INPUT} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder={`Monthly £ (default ${formatFee(defaults.monthly)})`} />
        <input className={INPUT} inputMode="decimal" value={setup} onChange={(e) => setSetup(e.target.value)} placeholder={`Set-up £ (default ${formatFee(defaults.setup)})`} />
        <button disabled={busy} onClick={() => save(false)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50">Save</button>
        <button disabled={busy || !row.custom} onClick={() => save(true)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-white disabled:opacity-40">Use default</button>
      </div>
    </div>
  );
}

export default function FeesSection({ toast }) {
  const [defaults, setDefaults] = useState(null); // { monthly, setup } in pence
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [monthly, setMonthly] = useState("");
  const [setup, setSetup] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, r] = await Promise.all([supabase.rpc("get_platform_fees"), supabase.rpc("list_tenant_fees")]);
    if (d.error || r.error) { setError((d.error || r.error).message); return; }
    setError(null);
    setDefaults({ monthly: d.data.default_monthly_pence, setup: d.data.default_setup_pence });
    setMonthly(penceToPounds(d.data.default_monthly_pence));
    setSetup(penceToPounds(d.data.default_setup_pence));
    setRows(r.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveDefaults() {
    const parsed = checkFees({ monthly, setup, allowBlank: false });
    if (parsed.error) { toast({ message: parsed.error, type: "error" }); return; }
    setBusy(true);
    const { error: e } = await supabase.rpc("set_default_fees", { p_monthly_pence: parsed.monthly, p_setup_pence: parsed.setup });
    setBusy(false);
    if (e) { toast({ message: e.message, type: "error" }); return; }
    toast({ message: "Default fees saved", type: "success" });
    load();
  }

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!defaults) return <p className="text-sm text-slate-500">Loading fees…</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        These rates are a record of what each business pays. Nothing is billed automatically from them. A business with no own rate pays the default; an own rate of £0 means free.
      </p>
      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-sm font-medium text-[#0F1B33]">Default rates</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs text-slate-500">Monthly (£)<input className={`${INPUT} mt-1`} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></label>
          <label className="text-xs text-slate-500">Set-up (£)<input className={`${INPUT} mt-1`} inputMode="decimal" value={setup} onChange={(e) => setSetup(e.target.value)} /></label>
          <button disabled={busy} onClick={saveDefaults} className="self-end rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50">Save defaults</button>
        </div>
      </div>
      {rows.map((r) => <TenantRow key={r.tenant_id} row={r} defaults={defaults} toast={toast} onSaved={load} />)}
    </div>
  );
}
