"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getPushEnabled, isPushSupported } from "@/lib/operator/push";
import { useOperator } from "@/components/operator/OperatorContext";

// "Get set up" card on Today for a business admin: the steps that make the
// operator app work for a new business. Hidden once every step is done, or
// when the admin hides it (remembered in this browser only).

const HIDE_KEY = (tenantId) => `evx_setup_hidden_${tenantId}`;

// Whether the checklist was hidden is kept in the browser (per business). It is
// read as an external store, so it is correct on the first client render and
// follows other tabs. A hide that storage refuses (private window) lasts for
// the session.
const hiddenThisSession = new Set();
const hideListeners = new Set();
function subscribeHidden(onChange) {
  hideListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => { hideListeners.delete(onChange); window.removeEventListener("storage", onChange); };
}
function isHidden(tenantId) {
  if (!tenantId) return true;
  if (hiddenThisSession.has(tenantId)) return true;
  try { return localStorage.getItem(HIDE_KEY(tenantId)) === "1"; } catch { return false; }
}
function hideChecklist(tenantId) {
  hiddenThisSession.add(tenantId);
  try { localStorage.setItem(HIDE_KEY(tenantId), "1"); } catch { /* fine */ }
  hideListeners.forEach((f) => f());
}

export default function SetupChecklist({ drivers, hasBookings }) {
  const { profile } = useOperator();
  const tenant = profile.tenant;
  const isAdmin = ["operator_admin", "super_admin"].includes(profile.user?.role);
  const hidden = useSyncExternalStore(subscribeHidden, () => isHidden(tenant?.id), () => true);
  const [teamSize, setTeamSize] = useState(null);
  const [push, setPush] = useState(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (!isAdmin || hidden) return;
    let cancelled = false;
    (async () => {
      setPush(isPushSupported() ? await getPushEnabled().catch(() => false) : null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/team", { headers: { authorization: `Bearer ${session?.access_token ?? ""}` } });
        const d = await res.json();
        if (!cancelled && res.ok) setTeamSize(d.members?.length ?? 0);
      } catch { /* leave unknown */ }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, hidden]);

  const steps = useMemo(() => {
    const inv = tenant?.brand?.invoice || {};
    const list = [
      { key: "business", label: "Add your business contact details", done: Boolean(tenant?.contact_email && tenant?.contact_phone), href: "/operator/settings?section=business" },
      { key: "letterhead", label: "Set up your invoice letterhead", done: Array.isArray(inv.address_lines) && inv.address_lines.length > 0, href: "/operator/settings?section=business" },
      { key: "driver", label: "Add your first driver", done: drivers.length > 0, href: "/operator/drivers" },
      { key: "team", label: "Invite your team", done: teamSize != null && teamSize > 1, href: "/operator/settings?section=team", optional: true },
      { key: "booking", label: "Take your first booking", done: hasBookings, href: "/operator/bookings" },
    ];
    // Only when the browser can do push; a desktop without it shouldn't block "done".
    if (push !== null) list.splice(4, 0, { key: "push", label: "Turn on new-booking alerts on this device", done: push, href: "/operator/settings?section=notifications" });
    return list;
  }, [tenant, drivers.length, teamSize, push, hasBookings]);

  const required = steps.filter((s) => !s.optional);
  const doneCount = steps.filter((s) => s.done).length;
  if (!isAdmin || !tenant || hidden || required.every((s) => s.done)) return null;

  const hide = () => hideChecklist(tenant.id);

  return (
    <section className="card overflow-hidden" aria-label="Get set up">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-[#0F1B33]">Get {tenant.name} set up</h2>
          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
        </div>
        <span className="text-xs text-slate-500">{doneCount} of {steps.length} done</span>
        <button onClick={hide} aria-label="Hide setup checklist" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="divide-y divide-slate-100">
        {(showDone ? steps : steps.filter((s) => !s.done)).map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-5">
              {s.done ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" /> : <Circle className="h-5 w-5 flex-shrink-0 text-slate-300" />}
              <span className={`flex-1 text-sm ${s.done ? "text-slate-400 line-through" : "text-[#0F1B33]"}`}>
                {s.label}{s.optional && !s.done && <span className="ml-1.5 text-xs text-slate-400">(optional)</span>}
              </span>
              {!s.done && <ChevronRight className="h-4 w-4 text-slate-300" />}
            </Link>
          </li>
        ))}
      </ul>
      {doneCount > 0 && (
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          aria-expanded={showDone}
          className="w-full border-t border-slate-100 px-4 py-2.5 text-left text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 sm:px-5"
        >
          {showDone ? "Hide completed steps" : `Show ${doneCount} completed step${doneCount === 1 ? "" : "s"}`}
        </button>
      )}
    </section>
  );
}
