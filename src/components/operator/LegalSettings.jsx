"use client";

import { useState } from "react";
import { useTenantProfile } from "@/hooks/operator/useTenantProfile";
import {
  LEGAL_JURISDICTIONS,
  LEGAL_STATUSES,
  legalFormFromTenant,
  legalGaps,
  legalPayload,
} from "@/lib/operator/legal";

// Settings → Legal. The details the business's terms and privacy policy are
// built from. Insurance and DBS checks are the operator's own responsibility,
// so the operator confirms them here. Only an operator admin can save.
// Cancellation charges and custom terms are not on this screen yet.

const LABEL = "mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500";
const INPUT = "mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm normal-case tracking-normal text-[#0F1B33] outline-none placeholder:text-slate-400 transition focus:border-amber-400/40 disabled:opacity-60";

function Field({ label, hint, children }) {
  return (
    <div>
      <label className={LABEL}>
        {label}
        {children}
      </label>
      {hint && <p className="-mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export default function LegalSettings({ toast }) {
  const { tenant, canEdit, loading, error, saveLegal } = useTenantProfile();
  const [form, setForm] = useState(() => legalFormFromTenant(tenant));
  const [formFor, setFormFor] = useState(tenant);
  const [busy, setBusy] = useState(false);

  // Start the form again whenever the saved business changes (while rendering).
  if (formFor !== tenant) {
    setFormFor(tenant);
    setForm(legalFormFromTenant(tenant));
  }

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const off = !canEdit;
  const gaps = legalGaps(form);

  async function handleSave() {
    setBusy(true);
    try {
      await saveLegal(legalPayload(form));
      toast({ message: "Legal details saved", type: "success" });
    } catch (e) {
      toast({ message: e?.message || "Could not save the legal details", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading legal details…</p>;
  if (error || !tenant) {
    return <p className="text-sm text-red-600">{error || "No business is linked to this account."}</p>;
  }

  const input = (field, props = {}) => (
    <input
      className={INPUT}
      value={form[field]}
      onChange={(e) => set(field)(e.target.value)}
      disabled={off || props.readOnly}
      readOnly={props.readOnly}
      {...props.extra}
    />
  );

  return (
    <div className="space-y-8">
      {off && (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Only an operator admin can change these details.
        </p>
      )}

      {gaps.length > 0 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">Still to add before your terms can be published</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
            {gaps.map((g) => <li key={g.key}>{g.label}</li>)}
          </ul>
        </div>
      ) : (
        <p className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Your legal details are complete.
        </p>
      )}

      <div className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Your business</p>
        <Field label="Legal name" hint="The name that appears in your terms, if different from your trading name.">
          {input("legalName")}
        </Field>
        <Field label="Trading status">
          <select className={INPUT} value={form.status} onChange={(e) => set("status")(e.target.value)} disabled={off}>
            <option value="">Choose…</option>
            {LEGAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        {form.status === "limited company" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Company number">{input("companyNumber")}</Field>
            <Field label="Registered office address">{input("registeredAddress")}</Field>
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Where you are based" hint="Town and county, e.g. Southport, Merseyside.">{input("base")}</Field>
          <Field label="Area you serve">{input("area")}</Field>
        </div>
        <Field label="Services">{input("service")}</Field>
        <Field label="Fleet" hint="e.g. a fleet of three electric saloon cars.">{input("fleet")}</Field>
        <Field label="Luggage included" hint="What your standard fare covers for luggage.">{input("luggage")}</Field>
        <Field label="Which law applies">
          <select className={INPUT} value={form.jurisdiction} onChange={(e) => set("jurisdiction")(e.target.value)} disabled={off}>
            {LEGAL_JURISDICTIONS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Licence and data protection</p>
        <Field label="Private hire operator licence" hint="Set by the platform owner for now. Change it there if it's wrong.">
          <input className={INPUT} value={form.licence} readOnly disabled />
        </Field>
        <Field label="Loyalty points name" hint="Leave blank if you have no points scheme.">{input("pointsName")}</Field>
        <Field label="ICO registration number" hint="Your data protection fee registration, or “exempt” if the ICO says so.">{input("icoRegistration")}</Field>
      </div>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Insurance and DBS</p>
        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[#0F1B33]">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={form.insuranceConfirmed}
            onChange={(e) => set("insuranceConfirmed")(e.target.checked)}
            disabled={off}
          />
          <span>
            I confirm that my business holds hire &amp; reward and public liability insurance covering passengers during transit, and that my drivers are DBS checked. I am responsible for keeping this true.
          </span>
        </label>
      </div>

      {canEdit && (
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSave}
            disabled={busy}
            className="rounded-2xl bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save legal details"}
          </button>
        </div>
      )}
    </div>
  );
}
