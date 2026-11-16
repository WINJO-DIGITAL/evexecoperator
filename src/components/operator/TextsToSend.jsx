"use client";

import { useState } from "react";
import { Check, MessageSquareText, Send } from "lucide-react";
import { useTextTasks } from "@/hooks/operator/useTextTasks";
import { smsHref } from "@/lib/operator/textTasks";
import { fmtDate } from "@/lib/dates";
import { useOperatorToast } from "@/components/operator/Toast";

// Customer texts for the office to send from its own phone: tap "Open
// Messages" (the text is written for you), press Send, then "Mark as sent".
// Shows only when there is something to send.
export default function TextsToSend() {
  const { tasks, error, markOpened, markSent } = useTextTasks();
  const toast = useOperatorToast();
  const [busy, setBusy] = useState(null);

  if (!tasks.length && !error) return null;

  const done = async (t) => {
    setBusy(t.key);
    try {
      await markSent(t);
      toast({ message: `Marked as sent to ${t.customer}`, type: "success" });
    } catch (e) {
      toast({ message: e?.message ?? "Couldn't update it", type: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#0F1B33]">
          <MessageSquareText className="h-4 w-4 text-amber-600" /> Texts to send
        </h2>
        <span className="text-xs text-slate-500">{tasks.length}</span>
      </div>
      {error && <p className="px-5 py-3 text-xs text-red-600">Couldn&apos;t load texts: {error}</p>}
      <ul className="divide-y divide-slate-100">
        {tasks.map((t) => (
          <li key={t.key} className="space-y-2 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[#0F1B33]">{t.customer}</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{t.label}</span>
              {t.partner && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Partner job · {t.partner}</span>
              )}
              {t.travelDate && (
                <span className="text-xs text-slate-500">
                  Job {[t.travelTime ? String(t.travelTime).slice(0, 5) : "", fmtDate(t.travelDate)].filter(Boolean).join(" ")}{t.ref ? ` · ${t.ref}` : ""}
                </span>
              )}
            </div>
            <p className="whitespace-pre-line rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{t.message}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={smsHref(t.phone, t.message)}
                onClick={() => { if (t.status === "pending") markOpened(t).catch(() => {}); }}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-black transition hover:bg-amber-400"
              >
                <Send className="h-3.5 w-3.5" /> Open Messages
              </a>
              <button
                onClick={() => done(t)}
                disabled={busy === t.key}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> {busy === t.key ? "Saving…" : "Mark as sent"}
              </button>
              <span className="self-center text-xs text-slate-400">{t.phone}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
