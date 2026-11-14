"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { parsePrice, quoteText, ddmmyyyy, hhmm, quotePrice, ukStamp } from "@/lib/operator/quoteText";

// One website quote request: its details, the office's price, and the two-tap text
// the customer gets. Confirm saves the price and queues the text (Today → Texts to
// send). The office opens Messages from there and presses Send.
export default function QuoteDetailModal({ quote, businessName, onClose, onSaved, onConvert, onDismiss, toast }) {
  const [price, setPrice] = useState(quote.quoted_price != null ? String(Number(quote.quoted_price)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const parsed = parsePrice(price);
  const preview = useMemo(() => {
    if (!("value" in parsed)) return null;
    return quoteText({
      businessName,
      customerName: quote.customer_name,
      from: quote.airport ?? quote.pickup_location,
      to: quote.destination,
      date: quote.pickup_date,
      time: quote.pickup_time,
      returnDate: quote.return_required ? quote.return_date : null,
      returnTime: quote.return_required ? quote.return_time : null,
      price: parsed.value,
      yesUrl: "[yes link added when sent]",
      noUrl: "[no link added when sent]",
    });
  }, [parsed.value, quote, businessName]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async () => {
    if ("error" in parsed) { setError(parsed.error); return; }
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/quote-price", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ quoteId: quote.id, price: parsed.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || "Couldn't send the price. Try again."); return; }
      onSaved?.({ ...quote, quoted_price: data.price, quoted_at: new Date().toISOString() });
      if (data.smsHref) {
        toast?.({ message: `Price ${quotePrice(data.price)} saved. Opening Messages…`, type: "success" });
        window.location.href = data.smsHref;
      } else {
        toast?.({ message: data.noPhone ? "Price saved. This customer has no phone number, so no text was queued." : "Price saved.", type: "success" });
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const sent = ukStamp(quote.quoted_at);
  const sentAt = sent ? `${sent.date} at ${sent.time}` : null;
  const replied = ukStamp(quote.responded_at);
  const rows = [
    ["Pickup", quote.airport ?? quote.pickup_location],
    ["Drop-off", quote.destination],
    ["Date", quote.pickup_date ? `${ddmmyyyy(quote.pickup_date)}${quote.pickup_time ? ` at ${hhmm(quote.pickup_time)}` : ""}` : null],
    ["Passengers", quote.passengers],
    ["Luggage", quote.luggage],
    ["Flight", quote.flight_number],
    ["Return", quote.return_required ? `${quote.return_date ? ddmmyyyy(quote.return_date) : "date to confirm"}${quote.return_time ? ` at ${hhmm(quote.return_time)}` : ""}${quote.return_destination ? ` to ${quote.return_destination}` : ""}` : null],
    ["Phone", quote.phone],
    ["Email", quote.email],
    ["Notes", quote.notes],
  ].filter(([, v]) => v != null && v !== "");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Quote request" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Quote request</p>
            <h2 className="text-lg font-semibold text-slate-900">{quote.customer_name || "Customer"}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <dl className="mx-5 mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2.5 text-sm">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-800 break-words">{String(v)}</dd>
            </div>
          ))}
        </dl>

        {quote.customer_response && (
          <p className={`mx-5 mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${quote.customer_response === "yes" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
            Customer said {quote.customer_response === "yes" ? "YES, go ahead" : "NO, not going ahead"}
            {replied ? ` (${replied.date} at ${replied.time})` : ""}
          </p>
        )}

        <div className="mx-5 mt-4">
          <label htmlFor="quote-price" className="text-sm font-semibold text-slate-800">Your price for this journey</label>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-lg text-slate-500">£</span>
            <input id="quote-price" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setError(null); }}
              placeholder="0" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-lg focus:border-amber-500 focus:outline-none" />
          </div>
          {sentAt && <p className="mt-1.5 text-xs text-slate-500">Last sent {quotePrice(quote.quoted_price)} on {sentAt}.</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {preview && (
          <div className="mx-5 mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">The text the customer gets</p>
            <pre className="mt-1.5 whitespace-pre-wrap rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 font-sans">{preview}</pre>
          </div>
        )}

        <div className="flex flex-col gap-2 px-5 py-5">
          <button onClick={confirm} disabled={busy || !("value" in parsed)}
            className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50">
            {busy ? "Saving…" : "Confirm price and open Messages"}
          </button>
          <div className="flex gap-2">
            <button onClick={onConvert} className="flex-1 rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-800">Create booking</button>
            <button onClick={onDismiss} className="flex-1 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-semibold text-slate-600">Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  );
}
