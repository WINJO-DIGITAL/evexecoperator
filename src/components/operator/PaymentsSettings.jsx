"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Settings → Payments: connect this business's OWN Stripe account so its
// customers' card payments go straight to it (the platform never holds the
// money and takes no percentage). Talks to /api/stripe-connect, which checks
// the caller on the server. Only an admin can connect.

async function api(method) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/stripe-connect", {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token ?? ""}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong.");
  return data;
}

export function paymentsStatus(v) {
  if (!v) return { tone: "neutral", title: "Checking…", body: "" };
  if (!v.configured) return { tone: "neutral", title: "Card payments are not available yet", body: "Online card payments for your business are being set up on the platform. Until then your customers pay cash or by bank transfer." };
  if (v.ready) return { tone: "good", title: "Card payments are on", body: "Your customers' card payments go straight to your own Stripe account. You pay Stripe's normal fees, and refunds and disputes come from your Stripe balance." };
  if (v.connected && v.detailsSubmitted) return { tone: "wait", title: "Stripe is checking your details", body: "You have sent your details. Card payments switch on as soon as Stripe has finished checking them." };
  if (v.connected) return { tone: "wait", title: "Finish setting up Stripe", body: "Your Stripe account is started but not finished. Continue to complete it." };
  return { tone: "neutral", title: "Connect your Stripe account", body: "Connect your own Stripe account so customers can pay you by card. It is free to set up; you pay Stripe's normal fees on each payment." };
}

const TONE = {
  good: "border-emerald-300 bg-emerald-50 text-emerald-900",
  wait: "border-amber-300 bg-amber-50 text-amber-900",
  neutral: "border-slate-200 bg-slate-50 text-[#0F1B33]",
};

export default function PaymentsSettings({ toast }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Initial load: the effect only starts the request and sets state after it resolves.
  useEffect(() => {
    let active = true;
    (async () => {
      try { const v = await api("GET"); if (active) { setView(v); setError(null); } }
      catch (e) { if (active) setError(e.message); }
    })();
    return () => { active = false; };
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await api("POST");
      window.location.href = url; // Stripe's own onboarding page
    } catch (e) {
      toast?.({ message: e?.message || "Could not start Stripe set-up", type: "error" });
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  const s = paymentsStatus(view);
  const canConnect = view?.configured && view?.canManage && !view?.ready;

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border px-4 py-3 ${TONE[s.tone]}`}>
        <p className="text-sm font-semibold">{s.title}</p>
        {s.body && <p className="mt-1 text-xs">{s.body}</p>}
        {view?.requirementsDue?.length > 0 && !view.ready && (
          <p className="mt-2 text-xs">Stripe still needs: {view.requirementsDue.map((r) => r.replace(/[._]/g, " ")).join(", ")}.</p>
        )}
      </div>

      {view && !view.canManage && (
        <p className="text-xs text-slate-500">Only an admin of your business can connect or change the Stripe account.</p>
      )}

      {canConnect && (
        <button
          onClick={connect}
          disabled={busy}
          className="rounded-2xl bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Opening Stripe…" : view.connected ? "Continue Stripe set-up" : "Connect Stripe"}
        </button>
      )}

      <p className="text-xs text-slate-500">
        Stripe holds your payments, pays them out to your bank and sends you your own payment reports. You are responsible for your Stripe account, its terms, refunds, chargebacks and tax.
      </p>
    </div>
  );
}
