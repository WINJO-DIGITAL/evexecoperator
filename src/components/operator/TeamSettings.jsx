"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/dates";

// Settings → Team: who can use the operator app for this business, and their
// role. Talks to /api/team, which re-checks every change server-side (only an
// admin can invite, change roles or remove; the team always keeps an admin).

const ROLES = [
  { value: "operator_admin", label: "Admin", help: "Everything, including the team, business details and prices." },
  { value: "dispatcher", label: "Dispatcher", help: "Bookings, drivers, customers and invoices. Can't change the team or business details." },
];
const roleLabel = (r) => ROLES.find((x) => x.value === r)?.label ?? r;

async function api(method, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/team", {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong.");
  return data;
}

export default function TeamSettings({ toast }) {
  const [state, setState] = useState({ loading: true, error: null, members: [], canManage: false, me: null });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("dispatcher");
  const [busy, setBusy] = useState(null); // "invite" | userId

  const load = useCallback(async () => {
    try {
      const d = await api("GET");
      setState({ loading: false, error: null, members: d.members, canManage: d.canManage, me: d.me });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn, ok) => {
    setBusy(key);
    try {
      const out = await fn();
      if (ok) toast(typeof ok === "function" ? ok(out) : { message: ok, type: "success" });
      await load();
      return true;
    } catch (e) {
      toast({ message: e.message, type: "error" });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const invite = async (e) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    const done = await run("invite", () => api("POST", { email: addr, role }), (out) =>
      out.emailed
        ? { message: `Invite sent to ${out.email}`, type: "success" }
        : { message: `Added ${out.email}, but the email failed: ${out.emailError}. Use Resend.`, type: "error" });
    if (done) setEmail("");
  };

  if (state.loading) return <p className="text-sm text-slate-500">Loading team…</p>;
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        {state.members.map((m) => {
          const isMe = m.userId === state.me;
          const editable = state.canManage && !isMe;
          return (
            <div key={m.userId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#0F1B33]">
                  {m.name || m.email}{isMe && <span className="ml-1.5 text-xs font-normal text-slate-500">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {m.name ? `${m.email} · ` : ""}
                  {m.pending ? "Invite not accepted yet" : m.lastSignIn ? `Last signed in ${fmtDate(m.lastSignIn)}` : ""}
                </p>
              </div>
              {editable ? (
                <select
                  value={m.role}
                  disabled={busy === m.userId}
                  aria-label={`Role for ${m.email}`}
                  onChange={(e) => run(m.userId, () => api("PATCH", { userId: m.userId, role: e.target.value }), `${m.email} is now ${roleLabel(e.target.value)}`)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F1B33]"
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              ) : (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">{roleLabel(m.role)}</span>
              )}
              {editable && m.pending && (
                <button
                  onClick={() => run(m.userId, () => api("POST", { action: "resend", userId: m.userId }), `Invite resent to ${m.email}`)}
                  disabled={busy === m.userId}
                  className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 hover:text-amber-600 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Resend
                </button>
              )}
              {editable && (
                <button
                  onClick={() => { if (window.confirm(`Remove ${m.email} from the team? They'll lose access to the operator app.`)) run(m.userId, () => api("DELETE", { userId: m.userId }), `${m.email} removed`); }}
                  disabled={busy === m.userId}
                  aria-label={`Remove ${m.email}`}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {state.canManage ? (
        <form onSubmit={invite} className="space-y-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#0F1B33]"><UserPlus className="h-4 w-4 text-amber-600" /> Invite someone</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
              <Mail className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Email" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" />
            </label>
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button type="submit" disabled={busy === "invite" || !email.trim()} className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50">
              {busy === "invite" ? "Sending…" : "Send invite"}
            </button>
          </div>
          <ul className="space-y-1 text-xs text-slate-500">
            {ROLES.map((r) => <li key={r.value}><strong className="text-slate-700">{r.label}:</strong> {r.help}</li>)}
          </ul>
          <p className="text-xs text-slate-500">They get an email with a link to set their password. Drivers are added on the Drivers screen.</p>
        </form>
      ) : (
        <p className="text-xs text-slate-500">Only an admin can invite people or change roles.</p>
      )}
    </div>
  );
}
