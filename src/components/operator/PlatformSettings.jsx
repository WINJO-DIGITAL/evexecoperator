"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, RefreshCw, UserPlus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOperatorToast } from "./Toast";
import FeesSection from "./FeesSection";

// Platform actions go through the Operator app's own server route (/api/platform/tenants),
// which checks on the server that the caller is the platform owner.
async function platformCall(method, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/platform/tenants", {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

function CreateTenantForm({ onCreated, toast }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast({ message: "Name and slug are required", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const { tenant } = await platformCall("POST", {
        action: "create",
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      toast({ message: `"${tenant.name}" created. Now invite its first admin below.`, type: "success" });
      setName("");
      setSlug("");
      setContactEmail("");
      setContactPhone("");
      onCreated();
    } catch (err) {
      toast({ message: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Business name"
        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
      />
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
        placeholder="slug-like-this"
        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
      />
      <input
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
        placeholder="Contact email (optional)"
        type="email"
        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
      />
      <input
        value={contactPhone}
        onChange={(e) => setContactPhone(e.target.value)}
        placeholder="Phone (optional)"
        type="tel"
        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
      />
      <button
        type="submit"
        disabled={saving}
        className="sm:col-span-4 flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {saving ? "Creating…" : "Create business"}
      </button>
    </form>
  );
}

function InviteForm({ tenants, toast }) {
  const [tenantId, setTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!tenantId || !email.trim()) {
      toast({ message: "Pick a business and enter an email", type: "error" });
      return;
    }
    setSending(true);
    try {
      const r = await platformCall("POST", { action: "invite", tenantId, email: email.trim() });
      if (r.emailed) {
        toast({ message: `Invited ${r.email} as the business's admin. They'll get an email to set a password.`, type: "success" });
      } else {
        toast({ message: `${r.email} is set up as admin, but the email didn't send (${r.emailError}). Press invite again to retry.`, type: "error" });
      }
      setEmail("");
    } catch (err) {
      toast({ message: err.message, type: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-3">
      <select
        value={tenantId}
        onChange={(e) => setTenantId(e.target.value)}
        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
      >
        <option value="">Select business…</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="person@example.com"
        type="email"
        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400"
      />
      <button
        type="submit"
        disabled={sending}
        className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-400/20 disabled:opacity-50"
      >
        <UserPlus className="h-4 w-4" />
        {sending ? "Inviting…" : "Invite as admin"}
      </button>
    </form>
  );
}

export default function PlatformSettings() {
  const toast = useOperatorToast();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { tenants: rows } = await platformCall("GET");
      setTenants(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // First load. `loading` already starts true, so nothing is set until the answer arrives.
  useEffect(() => {
    let cancelled = false;
    platformCall("GET").then(
      ({ tenants: rows }) => { if (!cancelled) { setTenants(rows); setLoading(false); } },
      (err) => { if (!cancelled) { setError(err.message); setLoading(false); } }
    );
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Businesses</p>
          <button
            onClick={loadTenants}
            className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-amber-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="space-y-2">
          {tenants.length === 0 && !loading && !error && (
            <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No businesses yet.
            </p>
          )}
          {tenants.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-600">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0F1B33]">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.slug}</p>
                </div>
              </div>
              <div className="text-right">
                {t.contact_email && <p className="text-xs text-slate-400">{t.contact_email}</p>}
                <p className={`text-xs ${t.admins ? "text-slate-400" : "font-medium text-amber-700"}`}>
                  {t.admins ? `${t.admins} admin${t.admins === 1 ? "" : "s"}` : "No admin yet"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Fees</p>
        <FeesSection toast={toast} />
      </div>

      <div>
        <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Set up a business</p>
        <CreateTenantForm onCreated={loadTenants} toast={toast} />
      </div>

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">
          <Users className="h-3 w-3" />
          Invite a business's first admin
        </p>
        <InviteForm tenants={tenants} toast={toast} />
      </div>
    </div>
  );
}
