"use client";

import React, { useState, useEffect, useRef, Suspense, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Bell,
  Car,
  Plug,
  Shield,
  ChevronRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  Copy,
  Globe,
  BookOpen,
  UserCircle,
  Mail,
  Smartphone,
  BellRing,
  Building,
  History,
  UsersRound,
  Plus,
  Trash2,
  Palette,
  ImageUp,
  FileText,
  CreditCard,
} from "lucide-react";
import { useOperatorToast } from "@/components/operator/Toast";
import { isConfigured, supabase } from "@/lib/supabase";
import { useNotificationCenter } from "@/hooks/operator/useNotificationCenter";
import { isPushSupported, getPushEnabled, enableOperatorPush, disableOperatorPush } from "@/lib/operator/push";
import { PORTALS } from "@/lib/operator/portals";
import { useIsSuperAdmin } from "@/hooks/operator/useIsSuperAdmin";
import PlatformSettings from "@/components/operator/PlatformSettings";
import { fmtDateTime } from "@/lib/dates";
import { useTenantProfile } from "@/hooks/operator/useTenantProfile";
import { pricingForSave, pricingFromTenant, pricingProblem } from "@/lib/prices";
import { BUILT_IN_LOGO_SRC, DEFAULT_ACCENT, DEFAULT_PRIMARY, EV_EXEC_TENANT_ID, brandFrom, brandWarning, isHexColour, logoFileProblem } from "@/lib/brand";
import { useOperator } from "@/components/operator/OperatorContext";
import AuditLogTab from "@/components/AuditLogTab";
import TeamSettings from "@/components/operator/TeamSettings";
import LegalSettings from "@/components/operator/LegalSettings";
import PaymentsSettings from "@/components/operator/PaymentsSettings";
import { useAuditLog } from "@/hooks/useAuditLog";

const SECTIONS = [
  { key: "business", label: "Business", icon: Building2 },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "team", label: "Team", icon: UsersRound },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "prices", label: "Prices", icon: Car },
  { key: "legal", label: "Legal", icon: FileText },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "integrations", label: "Integrations", icon: Plug },
  { key: "security", label: "Security", icon: Shield },
  { key: "activity", label: "Activity log", icon: History },
];

// Who changed what on bookings (status, driver, payment), newest first.
function ActivitySettings() {
  const { entries, loading, error } = useAuditLog();
  if (loading) return <p className="text-sm text-slate-500">Loading activity…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return <AuditLogTab entries={entries} heading={null} />;
}

function Toggle({ value, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-checked={!!value}
      aria-label={label}
      role="switch"
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
        value ? "bg-amber-500" : "bg-slate-100"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function TextInput({ label, value, onChange, type = "text", placeholder = "", disabled = false, autoComplete }) {
  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
        {label}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm normal-case tracking-normal text-[#0F1B33] outline-none placeholder:text-slate-400 transition focus:border-amber-400/40 focus:bg-slate-50 disabled:opacity-60"
        />
      </label>
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3, placeholder = "", disabled = false, hint }) {
  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
        {label}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm normal-case tracking-normal text-[#0F1B33] outline-none placeholder:text-slate-400 transition focus:border-amber-400/40 disabled:opacity-60"
        />
      </label>
      {hint && <p className="-mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function SaveButton({ onClick, busy, label = "Save Changes", disabled = false }) {
  return (
    <div className="mt-8 flex justify-end">
      <button
        onClick={onClick}
        disabled={busy || disabled}
        className="rounded-2xl bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}

// Saved to the operator's own tenants row (update_tenant_profile), so every
// staff device sees the same details. The invoice letterhead lives in
// brand.invoice, which customer invoices on the website already read.
function profileForm(tenant) {
  const inv = tenant?.brand?.invoice || {};
  return {
    name: tenant?.name || "",
    contactEmail: tenant?.contact_email || "",
    contactPhone: tenant?.contact_phone || "",
    addressLines: Array.isArray(inv.address_lines) ? inv.address_lines.join("\n") : "",
    invoicePhone: inv.phone || "",
    invoiceEmail: inv.email || "",
    web: inv.web || "",
    paymentTerms: inv.payment_terms || "",
  };
}

function BusinessSettings({ toast }) {
  const { tenant, canEdit, loading, error, save } = useTenantProfile();
  const { profile } = useOperator();
  const [form, setForm] = useState(() => profileForm(tenant));
  const [busy, setBusy] = useState(false);

  // Start the form again whenever the saved business changes (while rendering).
  const [formFor, setFormFor] = useState(tenant);
  if (formFor !== tenant) {
    setFormFor(tenant);
    setForm(profileForm(tenant));
  }

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function handleSave() {
    setBusy(true);
    try {
      await save({
        name: form.name,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        invoice: {
          // One business name everywhere: invoices use the name above.
          business_name: form.name.trim(),
          address_lines: form.addressLines.split("\n").map((l) => l.trim()).filter(Boolean),
          phone: form.invoicePhone.trim(),
          email: form.invoiceEmail.trim(),
          web: form.web.trim(),
          payment_terms: form.paymentTerms.trim(),
        },
      });
      profile.reload?.();
      toast({ message: "Business details saved for everyone on your team", type: "success" });
    } catch (e) {
      toast({ message: e?.message || "Could not save business details", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading business details…</p>;
  if (error || !tenant) {
    return <p className="text-sm text-red-600">{error || "No business is linked to this account."}</p>;
  }

  const off = !canEdit;
  return (
    <div className="space-y-8">
      {off && (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Only an operator admin can change these details.
        </p>
      )}
      <div className="space-y-5">
        <TextInput label="Business Name" value={form.name} onChange={set("name")} disabled={off} />
        <TextInput label="Contact Email" value={form.contactEmail} onChange={set("contactEmail")} type="email" disabled={off} />
        <TextInput label="Phone Number" value={form.contactPhone} onChange={set("contactPhone")} type="tel" disabled={off} />
      </div>
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Invoice letterhead</p>
          <p className="mt-1 text-xs text-slate-500">Shown on the invoices customers download from their account.</p>
        </div>
        <TextArea label="Address" value={form.addressLines} onChange={set("addressLines")} rows={4} disabled={off} hint="One line per row." />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput label="Invoice Phone" value={form.invoicePhone} onChange={set("invoicePhone")} type="tel" disabled={off} />
          <TextInput label="Invoice Email" value={form.invoiceEmail} onChange={set("invoiceEmail")} type="email" disabled={off} />
        </div>
        <TextInput label="Website" value={form.web} onChange={set("web")} disabled={off} />
        <TextArea label="Payment Terms" value={form.paymentTerms} onChange={set("paymentTerms")} rows={3} disabled={off} />
      </div>
      {canEdit && <SaveButton onClick={handleSave} busy={busy} />}
    </div>
  );
}

const NOTIF_TYPE_LABELS = {
  received: "Customer confirmation",
  reminder_24h: "Customer 24h reminder",
  status_update: "Customer live update",
  driver_allocated: "Driver — new job",
  driver_reminder_24h: "Driver 24h reminder",
};

function channelChipCls(ch) {
  return {
    email: "border-blue-400/30 bg-blue-400/10 text-blue-600",
    sms: "border-violet-400/30 bg-violet-400/10 text-violet-300",
    whatsapp: "border-emerald-400/30 bg-emerald-400/10 text-emerald-600",
    push: "border-amber-400/30 bg-amber-400/10 text-amber-600",
  }[ch] || "border-slate-200 text-slate-500";
}

function deliveryState(row) {
  if (row.has_error) return { label: "Failed", cls: "text-red-600" };
  if (row.status === "sent") return { label: "Delivered", cls: "text-emerald-600" };
  if (row.delivery_status === "retrying") return { label: "Retrying", cls: "text-amber-600" };
  return { label: "Queued", cls: "text-slate-500" };
}

function notifWhen(x) {
  if (!x) return "";
  const d = new Date(x);
  if (isNaN(d)) return "";
  return fmtDateTime(d);
}

// Enable/disable Web Push on the current device (operator gets pinged when a
// website booking comes in, even with the app closed).
function PushDeviceRow() {
  // A property of this browser: read as an external value ("supported" on the server).
  const supported = useSyncExternalStore(() => () => {}, isPushSupported, () => true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getPushEnabled().then(setEnabled).catch(() => {});
  }, []);

  const toggle = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (enabled) { await disableOperatorPush(); setEnabled(false); }
      else { await enableOperatorPush(); setEnabled(true); }
    } catch (e) {
      setErr(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <BellRing className="h-4 w-4 flex-shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#0F1B33]">Push notifications on this device</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            {supported
              ? "Get an alert on this device when a booking comes in from the website — even with the app closed."
              : "This browser can't do push. On iPhone, add the app to your Home Screen first, then open it and try again."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy || !supported}
          className={`flex-shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
            enabled ? "border border-slate-200 text-slate-600 hover:text-[#0F1B33]" : "bg-amber-500 text-black hover:bg-amber-400"
          }`}
        >
          {busy ? "…" : enabled ? "Turn off" : "Enable"}
        </button>
      </div>
      {err && <p className="mt-2 text-[11px] text-red-600">{err}</p>}
      {enabled && !err && <p className="mt-2 text-[11px] text-emerald-600">This device is set up for push alerts.</p>}
    </div>
  );
}

// Central notification control — channel priority, the "SMS only when necessary"
// switch, and a live delivery log (channel used + whether delivered).
function NotificationCenter() {
  const { profile } = useOperator();
  const { settings, activity, loading, saving, error, update } = useNotificationCenter(profile.tenant?.id);

  // Push is set up per device (row above). Automated SMS is dormant: texts to
  // customers are sent from the driver's or operator's own phone instead.
  const channels = [
    { key: "push", icon: BellRing, label: "Push / in-app", note: "Set up on each device above", status: "On" },
    { key: "email", icon: Mail, label: "Email", toggle: "email_enabled", enabled: settings.email_enabled },
    { key: "sms", icon: Smartphone, label: "Text messages", note: "Sent from your own phone with one tap, never automatically", status: "From your phone" },
  ];

  return (
    <div className="space-y-6">
      <PushDeviceRow />

      <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4 text-xs leading-relaxed text-slate-600">
        <p className="mb-1 font-semibold text-amber-600">How messages are sent</p>
        <strong>Operators</strong> are alerted by push &amp; in-app. <strong>Drivers</strong> get their jobs
        by push and <strong>email</strong>. <strong>Customers</strong> get <strong>email</strong>; when there&apos;s
        no email on file, the driver or office is prompted to send a pre-written text from their own phone.
      </div>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Channels</p>
        <div className="space-y-2">
          {channels.map((c) => (
            <div key={c.key} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <c.icon className="h-4 w-4 flex-shrink-0 text-slate-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#0F1B33]">{c.label}</p>
                {c.note && <p className="text-[11px] text-slate-600">{c.note}</p>}
              </div>
              {c.toggle ? (
                <Toggle value={!!c.enabled} onChange={(v) => update({ [c.toggle]: v })} label={c.label} />
              ) : (
                <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-medium text-slate-500">{c.status}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {saving && <p className="text-[11px] text-slate-500">Saving…</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Recent notifications</p>
        <div className="divide-y divide-white/5 rounded-2xl border border-slate-100 bg-slate-50">
          {loading ? (
            <p className="px-4 py-6 text-center text-xs text-slate-600">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-600">No notifications sent yet.</p>
          ) : (
            activity.map((row) => {
              const d = deliveryState(row);
              return (
                <div key={row.id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-700">{NOTIF_TYPE_LABELS[row.type] || row.type}</p>
                    <p className="text-[10px] text-slate-600">{notifWhen(row.sent_at || row.created_at)}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${channelChipCls(row.channel)}`}>{row.channel}</span>
                  <span className={`w-16 flex-shrink-0 text-right text-[11px] font-medium ${d.cls}`}>{d.label}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Logo and colours (tenants.brand), saved through update_tenant_branding
// (admins only, checked again in the database). Shown in the sidebar and on
// invoices, including the PDFs customers download from their account.
function ColourField({ label, hint, value, onChange, disabled }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[#0F1B33]">{label}</p>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={isHexColour(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          aria-label={`${label} picker`}
          className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 disabled:cursor-not-allowed"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase().slice(0, 7))}
          disabled={disabled}
          aria-label={label}
          spellCheck={false}
          className={`w-28 rounded-xl border bg-white px-3 py-2.5 font-mono text-sm uppercase text-[#0F1B33] outline-none focus:border-amber-400 disabled:bg-slate-50 ${isHexColour(value) ? "border-slate-200" : "border-red-300"}`}
        />
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function BrandPreview({ name, logoSrc, primary, accent }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Preview">
      <div className="flex items-center justify-between gap-4 px-5 py-5" style={{ background: primary }}>
        <div className="flex min-w-0 items-center gap-3">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt="" className="h-12 w-auto max-w-[160px] object-contain" />
          ) : (
            <span className="truncate text-lg font-semibold tracking-[0.18em]" style={{ color: accent }}>{name.toUpperCase()}</span>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-light tracking-[0.3em]" style={{ color: accent }}>INVOICE</p>
          <div className="ml-auto mt-1 h-0.5 w-14" style={{ background: accent }} />
        </div>
      </div>
      <div className="flex items-center justify-between px-5 py-4 text-sm">
        <span className="text-slate-500">Airport transfer</span>
        <span className="font-semibold text-[#0F1B33]">£90.00</span>
      </div>
      <div className="flex items-center justify-between px-5 py-3 text-sm font-bold uppercase tracking-wider" style={{ background: primary, color: accent }}>
        <span>Total</span><span>£90.00</span>
      </div>
    </div>
  );
}

function BrandingSettings({ toast }) {
  const { tenant, canEdit, loading, error, uploadLogo, saveBranding } = useTenantProfile();
  const { profile } = useOperator();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // Fill the form from the saved business as soon as it has loaded (while rendering).
  if (tenant && !form) {
    const b = brandFrom(tenant);
    setForm({ logoUrl: b.logoUrl, primary: b.primary, accent: b.accent });
  }

  if (loading && !form) return <p className="text-sm text-slate-500">Loading branding…</p>;
  if (!tenant || !form) return <p className="text-sm text-red-600">{error || "No business is linked to this account."}</p>;

  const off = !canEdit || busy || uploading;
  const builtIn = !form.logoUrl && tenant.id === EV_EXEC_TENANT_ID;
  const logoSrc = form.logoUrl || (builtIn ? BUILT_IN_LOGO_SRC : null);
  const warning = brandWarning(form.primary, form.accent);

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const problem = logoFileProblem(file);
    if (problem) { toast({ message: problem, type: "error" }); return; }
    setUploading(true);
    try {
      const url = await uploadLogo(file);
      setForm((f) => ({ ...f, logoUrl: url }));
    } catch (err) {
      toast({ message: err?.message || "Could not upload the logo", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!isHexColour(form.primary) || !isHexColour(form.accent)) {
      toast({ message: "Colours must be hex codes like #0B132B.", type: "error" });
      return;
    }
    setBusy(true);
    try {
      const saved = await saveBranding(form);
      const b = brandFrom(saved);
      setForm({ logoUrl: b.logoUrl, primary: b.primary, accent: b.accent });
      profile.reload?.(); // sidebar and invoices pick it up
      toast({ message: "Branding saved for everyone on your team", type: "success" });
    } catch (err) {
      toast({ message: err?.message || "Could not save branding", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {!canEdit && (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Only an admin can change the logo and colours.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-7">
          <div>
            <p className="mb-1.5 text-xs font-medium text-[#0F1B33]">Logo</p>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              PNG, JPEG or WebP, up to 1 MB. A logo with a transparent background looks best on the main colour.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 p-2" style={{ background: form.primary }}>
                {logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoSrc} alt="Current logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: form.accent }}>No logo</span>
                )}
              </span>
              {canEdit && (
                <>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickFile} />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={off}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-[#0F1B33] transition hover:border-amber-300 disabled:opacity-50"
                  >
                    <ImageUp className="h-4 w-4" /> {uploading ? "Uploading…" : form.logoUrl ? "Replace logo" : "Upload logo"}
                  </button>
                  {form.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, logoUrl: null }))}
                      disabled={off}
                      className="rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:text-red-600 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
            {builtIn && <p className="mt-2 text-[11px] text-slate-500">Showing the built-in EV Exec badge.</p>}
          </div>

          <ColourField
            label="Main colour"
            hint="Behind your logo on invoice headers and footers."
            value={form.primary}
            onChange={(v) => setForm((f) => ({ ...f, primary: v }))}
            disabled={off}
          />
          <ColourField
            label="Accent colour"
            hint="Headings, lines and icons on the main colour."
            value={form.accent}
            onChange={(v) => setForm((f) => ({ ...f, accent: v }))}
            disabled={off}
          />
          {warning && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{warning}</p>}
          {canEdit && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT }))}
              disabled={off}
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-[#0F1B33] hover:underline disabled:opacity-50"
            >
              Use the standard navy and gold
            </button>
          )}
        </div>

        <div>
          <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Invoice preview</p>
          <BrandPreview name={tenant.name || "Your business"} logoSrc={logoSrc} primary={isHexColour(form.primary) ? form.primary : DEFAULT_PRIMARY} accent={isHexColour(form.accent) ? form.accent : DEFAULT_ACCENT} />
        </div>
      </div>

      {canEdit && <SaveButton onClick={handleSave} busy={busy} disabled={uploading} label="Save Branding" />}
    </div>
  );
}

// The business's own fixed prices (tenants.pricing), saved through
// update_tenant_pricing (admins only, checked again in the database). The
// website charges these and the New Booking form suggests them.
const toForm = (p) => ({
  airports: p.airports.map((a, i) => ({ key: `row-${i}`, name: a.name, code: a.code || "", oneWay: String(a.oneWay), ret: String(a.ret) })),
  extraStop: String(p.extraStop),
});
const fromForm = (f) => ({
  airports: f.airports.map((a) => ({ name: a.name.trim(), code: a.code.trim() || null, oneWay: Number(a.oneWay), ret: Number(a.ret) })),
  extraStop: f.extraStop === "" ? 0 : Number(f.extraStop),
});

function MoneyInput({ value, onChange, label, disabled, hideLabel = false }) {
  return (
    <label className="block min-w-0">
      <span className={`mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:sr-only ${hideLabel ? "sr-only" : ""}`}>{label}</span>
      <span className="flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-amber-400 has-[:disabled]:bg-slate-50">
        <span className="pl-3 text-sm text-slate-400">£</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={label}
          className="w-full min-w-0 bg-transparent px-2 py-2.5 text-right text-sm text-[#0F1B33] outline-none disabled:text-slate-600"
        />
      </span>
    </label>
  );
}

function PriceSettings({ toast }) {
  const { tenant, canEdit, loading, error, savePricing } = useTenantProfile();
  const { profile } = useOperator();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(0);

  // Fill the form from the saved prices as soon as they have loaded (while rendering).
  if (tenant && !form) setForm(toForm(pricingFromTenant(tenant.pricing)));

  if (loading && !form) return <p className="text-sm text-slate-500">Loading prices…</p>;
  if (!tenant || !form) return <p className="text-sm text-red-600">{error || "No business is linked to this account."}</p>;

  const off = !canEdit || busy;
  const setRow = (key, field) => (v) =>
    setForm((f) => ({ ...f, airports: f.airports.map((a) => (a.key === key ? { ...a, [field]: v } : a)) }));
  const removeRow = (key) => setForm((f) => ({ ...f, airports: f.airports.filter((a) => a.key !== key) }));
  const addRow = () =>
    setForm((f) => ({ ...f, airports: [...f.airports, { key: `new-${nextKey.current++}`, name: "", code: "", oneWay: "", ret: "" }] }));

  const handleSave = async () => {
    const next = fromForm(form);
    const problem = next.airports.length === 0 ? "Add at least one price." : pricingProblem(next);
    if (problem) { toast({ message: problem, type: "error" }); return; }
    setBusy(true);
    try {
      const saved = await savePricing(pricingForSave(next));
      setForm(toForm(pricingFromTenant(saved)));
      profile.reload?.(); // the New Booking form picks up the new prices
      toast({ message: "Prices saved. New bookings use them straight away.", type: "success" });
    } catch (e) {
      toast({ message: e?.message || "Could not save prices", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-slate-500">
        Fixed prices for airports and other regular destinations. Your online booking form charges these, and the New
        Booking form fills them in for you (a return booked here is two journeys, each at half the return price).
        Anything not listed is priced by quote.
      </p>
      {!canEdit && (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Only an admin can change prices.
        </p>
      )}

      <div className="hidden grid-cols-[minmax(0,1fr)_84px_112px_112px_40px] gap-3 px-1 text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:grid">
        <span>Destination</span><span>Code</span><span className="text-right">One way</span><span className="text-right">Return</span><span />
      </div>
      <ul className="space-y-3 sm:space-y-2">
        {form.airports.map((a) => (
          <li key={a.key} className="grid grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)] gap-3 rounded-2xl border border-slate-100 p-3 sm:grid-cols-[minmax(0,1fr)_84px_112px_112px_40px] sm:items-center sm:rounded-none sm:border-0 sm:p-0">
            <label className="col-span-3 block min-w-0 sm:col-span-1">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:sr-only">Destination</span>
              <input
                value={a.name}
                onChange={(e) => setRow(a.key, "name")(e.target.value)}
                disabled={off}
                maxLength={80}
                placeholder="e.g. Manchester Airport"
                aria-label="Destination"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0F1B33] outline-none focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:sr-only">Code</span>
              <input
                value={a.code}
                onChange={(e) => setRow(a.key, "code")(e.target.value.toUpperCase().slice(0, 4))}
                disabled={off}
                placeholder="Optional"
                aria-label="Airport code (optional)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm uppercase text-[#0F1B33] outline-none focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-600"
              />
            </label>
            <MoneyInput label="One way" value={a.oneWay} onChange={setRow(a.key, "oneWay")} disabled={off} />
            <MoneyInput label="Return" value={a.ret} onChange={setRow(a.key, "ret")} disabled={off} />
            {canEdit ? (
              <button
                type="button"
                onClick={() => removeRow(a.key)}
                disabled={busy}
                aria-label={`Remove ${a.name || "this row"}`}
                className="col-span-3 flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-xs text-slate-500 transition hover:border-red-200 hover:text-red-600 sm:col-span-1 sm:w-10"
              >
                <Trash2 className="h-4 w-4" /><span className="sm:hidden">Remove</span>
              </button>
            ) : <span className="hidden sm:block" />}
          </li>
        ))}
      </ul>
      {canEdit && (
        <button
          type="button"
          onClick={addRow}
          disabled={busy || form.airports.length >= 30}
          className="flex items-center gap-2 rounded-xl border border-dashed border-amber-400 px-4 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add a destination
        </button>
      )}

      <div className="max-w-xs border-t border-slate-100 pt-5">
        <p className="mb-2 text-xs font-medium text-[#0F1B33]">Each extra stop adds</p>
        <MoneyInput label="Extra stop charge" hideLabel value={form.extraStop} onChange={(v) => setForm((f) => ({ ...f, extraStop: v }))} disabled={off} />
      </div>

      {canEdit && <SaveButton onClick={handleSave} busy={busy} label="Save Prices" />}
    </div>
  );
}

const PORTAL_ICONS = {
  driverApp: Car,
  bookingForm: BookOpen,
  customerAccount: UserCircle,
  website: Globe,
};

function PortalRow({ portalKey, toast }) {
  const portal = PORTALS[portalKey];
  const Icon = PORTAL_ICONS[portalKey] ?? Globe;
  const [copied, setCopied] = useState(false);

  const handleOpen = () => {
    window.open(portal.url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portal.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ message: "URL copied to clipboard", type: "success" });
    } catch {
      toast({ message: "Copy failed — please copy manually", type: "error" });
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
          <Icon className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[#0F1B33]">{portal.label}</p>
          <p className="mt-0.5 text-xs text-slate-500">{portal.description}</p>
          <p className="mt-2 truncate font-mono text-[11px] text-slate-600">{portal.url}</p>
          <p className="mt-1 text-[10px] text-slate-700">env: {portal.envKey}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={handleOpen}
          className="flex items-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs font-medium text-amber-600 transition hover:bg-amber-400/10"
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 transition hover:border-slate-300 hover:text-[#0F1B33]"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied!" : "Copy URL"}
        </button>
      </div>
    </div>
  );
}

function IntegrationItem({ name, description, connected, onAction, actionLabel }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {connected ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <Circle className="h-4 w-4 text-slate-600" />
          )}
        </div>
        <div>
          <p className="font-medium text-[#0F1B33]">{name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <button
        onClick={onAction}
        className={`flex-shrink-0 rounded-xl border px-4 py-2 text-xs font-medium transition ${
          connected
            ? "border-emerald-400/20 text-emerald-600 hover:bg-emerald-400/10"
            : "border-amber-400/20 text-amber-600 hover:bg-amber-400/10"
        }`}
      >
        {actionLabel ?? (connected ? "Connected" : "Connect")}
      </button>
    </div>
  );
}

function FlightVerificationSettings({ toast }) {
  const [aeroConfigured, setAeroConfigured] = useState(null); // null = checking

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("integration-status")
      .then(({ data }) => {
        if (!cancelled) setAeroConfigured(Boolean(data?.integrations?.aerodatabox));
      })
      .catch(() => {
        if (!cancelled) setAeroConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <p className="mb-4 text-xs uppercase tracking-[0.28em] text-amber-600">Flight Verification</p>
      <div className="space-y-4">
        <IntegrationItem
          name="AeroDataBox"
          description="Verifies flight number, schedule and airports for airport bookings. Recommended pickup is the flight's own landing time."
          connected={aeroConfigured === true}
          actionLabel={aeroConfigured === null ? "Checking…" : aeroConfigured ? "Live" : "Not configured"}
          onAction={() =>
            toast({
              message: aeroConfigured
                ? "AeroDataBox is live -- flight verification is checking real schedule data"
                : "Add AERODATABOX_API_KEY as a Supabase Edge Function secret to enable live verification",
              type: aeroConfigured ? "success" : "info",
            })
          }
        />
      </div>
    </div>
  );
}

function IntegrationSettings({ toast }) {
  return (
    <div className="space-y-8">
      {/* Portals & Website */}
      <div>
        <p className="mb-1 text-xs uppercase tracking-[0.28em] text-amber-600">Portals & Website</p>
        <p className="mb-4 text-xs text-slate-500">
          Quick-launch links for the driver portal and customer-facing website pages. Override any URL
          by setting the corresponding environment variable.
        </p>
        <div className="space-y-3">
          {(["driverApp", "bookingForm", "customerAccount", "website"]).map((key) => (
            <PortalRow key={key} portalKey={key} toast={toast} />
          ))}
        </div>
      </div>

      {/* Backend services */}
      <div>
        <p className="mb-4 text-xs uppercase tracking-[0.28em] text-amber-600">Backend Services</p>
        <div className="space-y-4">
          <IntegrationItem
            name="Supabase"
            description="Database & realtime backend"
            connected={isConfigured}
            onAction={() =>
              toast({
                message: isConfigured
                  ? "Supabase is connected and live"
                  : "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment",
                type: isConfigured ? "success" : "info",
              })
            }
            actionLabel={isConfigured ? "Connected" : "Configure"}
          />
          <IntegrationItem
            name="Driver App"
            description={`Real-time job dispatch to ${PORTALS.driverApp.url}`}
            connected={isConfigured}
            onAction={() => {
              window.open(PORTALS.driverApp.url, "_blank", "noopener,noreferrer");
            }}
            actionLabel={isConfigured ? "Open Portal" : "Requires Supabase"}
          />
          <IntegrationItem
            name="Twilio"
            description="Automated SMS is dormant: customer texts are sent manually from your own phone"
            connected={false}
            actionLabel="Dormant"
            onAction={() => toast({ message: "Twilio is dormant, so no automated texts are sent or billed. Set the SMS_ENABLED=true secret to switch it back on.", type: "info" })}
          />
          <IntegrationItem
            name="Stripe"
            description="Payment links + auto-reconcile webhook (mark Paid on payment)"
            connected={true}
            actionLabel="Live"
            onAction={() => toast({ message: "Stripe payment links are live. Manage keys in the Vercel environment settings.", type: "success" })}
          />
        </div>
      </div>

      <FlightVerificationSettings toast={toast} />
    </div>
  );
}

// Changes the signed-in user's own password. The current password is checked
// first by signing in with it, so a device left signed in can't be used to
// take over the account.
function SecuritySettings({ toast }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  async function handleChange() {
    setError(null);
    if (!form.current || !form.next) return setError("Enter your current and new password.");
    if (form.next.length < 8 || !/[A-Za-z]/.test(form.next) || !/[0-9]/.test(form.next)) return setError("Use at least 8 characters for the new password, with a letter and a number.");
    if (form.next !== form.confirm) return setError("The new passwords don't match.");
    if (form.next === form.current) return setError("The new password must be different.");
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const email = auth?.user?.email;
      if (!email) throw new Error("You're signed out. Sign in again and retry.");
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: form.current });
      if (signInErr) throw new Error("Your current password is incorrect.");
      const { error: updErr } = await supabase.auth.updateUser({ password: form.next });
      if (updErr) throw new Error(updErr.message);
      setForm({ current: "", next: "", confirm: "" });
      toast({ message: "Password changed", type: "success" });
    } catch (e) {
      setError(e?.message || "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Change password</p>
      <TextInput label="Current Password" value={form.current} onChange={set("current")} type="password" autoComplete="current-password" />
      <TextInput label="New Password" value={form.next} onChange={set("next")} type="password" autoComplete="new-password" placeholder="At least 8 characters, a letter and a number" />
      <TextInput label="Confirm New Password" value={form.confirm} onChange={set("confirm")} type="password" autoComplete="new-password" />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <SaveButton onClick={handleChange} busy={busy} label="Change Password" />
    </div>
  );
}

// Deep links such as /operator/settings?section=security (account menu). In
// its own Suspense boundary, as useSearchParams needs one; reacts to the query
// changing while Settings is already open.
function SectionFromUrl({ onSection }) {
  const want = useSearchParams().get("section");
  useEffect(() => {
    if (want && (SECTIONS.some((x) => x.key === want) || want === "platform")) onSection(want);
  }, [want, onSection]);
  return null;
}

export default function Settings() {
  const [active, setActive] = useState("business");
  const toast = useOperatorToast();
  const { isSuperAdmin } = useIsSuperAdmin();

  const sections = isSuperAdmin
    ? [...SECTIONS, { key: "platform", label: "Platform", icon: Building }]
    : SECTIONS;

  const sectionContent = {
    business: <BusinessSettings toast={toast} />,
    branding: <BrandingSettings toast={toast} />,
    team: <TeamSettings toast={toast} />,
    notifications: <NotificationCenter />,
    prices: <PriceSettings toast={toast} />,
    legal: <LegalSettings toast={toast} />,
    payments: <PaymentsSettings toast={toast} />,
    integrations: <IntegrationSettings toast={toast} />,
    security: <SecuritySettings toast={toast} />,
    activity: <ActivitySettings />,
    platform: <PlatformSettings />,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10">
      <Suspense fallback={null}><SectionFromUrl onSection={setActive} /></Suspense>
      {/* Mobile: horizontal scrollable tab strip */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition ${
                active === s.key
                  ? "bg-amber-400/10 text-amber-600"
                  : "text-slate-500 hover:text-[#0F1B33]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Desktop sidebar nav */}
        <div className="hidden h-fit lg:block">
          <div className="card p-2">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-sm transition ${
                    active === s.key
                      ? "bg-amber-400/10 text-amber-600"
                      : "text-slate-500 hover:bg-slate-100 hover:text-[#0F1B33]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {s.label}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Content panel */}
        <div className="card p-6 sm:p-8">
          <div className="mb-6 sm:mb-8">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Settings</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#0F1B33]">
              {sections.find((s) => s.key === active)?.label}
            </h2>
          </div>
          {sectionContent[active]}
        </div>
      </div>
    </div>
  );
}