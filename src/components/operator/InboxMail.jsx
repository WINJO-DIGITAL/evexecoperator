"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ArrowLeft, CheckCircle2, Mail, MapPin, Phone, PhoneMissed, RotateCcw, Inbox as InboxIcon } from "lucide-react";
import { fmtDayDate, fmtDate } from "@/lib/dates";

// The Inbox as an email list: everything waiting on the office (quote requests,
// missed calls, website messages) on the left, the chosen item on the right.
// On phones the item opens full screen. The actions are the ones the old cards
// had; nothing here saves on its own.

const TYPES = [
  { key: "all", label: "All" },
  { key: "quote", label: "Quotes" },
  { key: "call", label: "Missed Calls" },
  { key: "message", label: "Messages" },
];

const ago = (iso) => (iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true }) : "");
const first = (s, n) => (s && s.length > n ? `${s.slice(0, n).trimEnd()}…` : s ?? "");
const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// Turn each record into one shape the list and the detail both read.
function toItem(type, raw) {
  if (type === "quote") {
    const from = (raw.airport ?? raw.pickup_location ?? "—").split(",")[0];
    const to = (raw.destination ?? "—").split(",")[0];
    return {
      key: `q:${raw.id}`, type, raw, at: raw.created_at, name: raw.customer_name,
      open: !raw.status || raw.status === "new",
      subject: `Quote request · ${from} → ${to}`,
      preview: [raw.pickup_date && fmtDayDate(raw.pickup_date), raw.pickup_time?.slice(0, 5), raw.passengers != null && `${raw.passengers} passengers`].filter(Boolean).join(" · "),
    };
  }
  if (type === "call") {
    return {
      key: `c:${raw.id}`, type, raw, at: raw.created_at, name: raw.caller ?? "Unknown number",
      open: !raw.resolved,
      subject: "Missed call",
      preview: [raw.attempts != null && `${raw.attempts} attempt${raw.attempts === 1 ? "" : "s"}`, raw.notes].filter(Boolean).join(" · "),
    };
  }
  return {
    key: `m:${raw.id}`, type: "message", raw, at: raw.created_at, name: raw.name,
    open: raw.status !== "read",
    subject: "Website message",
    preview: first(raw.message, 90),
  };
}

const TYPE_ICON = { quote: MapPin, call: PhoneMissed, message: Mail };
const TYPE_LABEL = { quote: "Quote request", call: "Missed call", message: "Website message" };

// A person gets their initials; an unknown caller (a bare number) gets a phone icon.
function Avatar({ name, type }) {
  const tone = type === "call" ? "bg-orange-50 text-orange-700" : type === "message" ? "bg-sky-50 text-sky-700" : "bg-[#F5EFE0] text-[#7A5C14]";
  const isNumber = type === "call" && /^[+\d\s()-]+$/.test(name ?? "");
  return (
    <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`} aria-hidden="true">
      {isNumber ? <PhoneMissed className="h-4 w-4" /> : initials(name)}
    </span>
  );
}

function Detail({ item, onBack, onOpenQuote, onDismissQuote, onConvertQuote, onToggleMissedCall, onToggleContactMessage }) {
  const r = item.raw;
  const Icon = TYPE_ICON[item.type];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        {onBack && (
          <button onClick={onBack} aria-label="Back To Inbox" className="-ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 lg:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <Avatar name={item.name} type={item.type} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[#0F1B33]">{item.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <Icon className="h-3.5 w-3.5 text-[#A07D32]" aria-hidden="true" /> {TYPE_LABEL[item.type]} · {ago(item.at)}
          </p>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${item.open ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          {item.open ? "Open" : "Done"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {item.type === "quote" && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-slate-500">From</dt><dd className="text-[#0F1B33]">{r.airport ?? r.pickup_location ?? "—"}</dd>
            <dt className="text-slate-500">To</dt><dd className="text-[#0F1B33]">{r.destination ?? "—"}</dd>
            {r.pickup_date && <><dt className="text-slate-500">Date</dt><dd className="text-[#0F1B33]">{fmtDayDate(r.pickup_date)}{r.pickup_time ? ` at ${r.pickup_time.slice(0, 5)}` : ""}</dd></>}
            {r.passengers != null && <><dt className="text-slate-500">Passengers</dt><dd className="text-[#0F1B33]">{r.passengers}{r.luggage ? ` · ${r.luggage}` : ""}</dd></>}
            {r.flight_number && <><dt className="text-slate-500">Flight</dt><dd className="font-medium text-[#0F1B33]">{r.flight_number}</dd></>}
            {r.return_required && <><dt className="text-slate-500">Return</dt><dd className="text-[#0F1B33]">{r.return_date ? fmtDate(r.return_date) : "Yes"}{r.return_time ? ` at ${r.return_time.slice(0, 5)}` : ""}</dd></>}
            {r.phone && <><dt className="text-slate-500">Phone</dt><dd><a className="text-[#0F1B33] underline-offset-2 hover:underline" href={`tel:${r.phone}`}>{r.phone}</a>{r.contact_method ? <span className="text-slate-500"> · prefers {r.contact_method}</span> : null}</dd></>}
            {r.email && <><dt className="text-slate-500">Email</dt><dd><a className="text-[#0F1B33] underline-offset-2 hover:underline" href={`mailto:${r.email}`}>{r.email}</a></dd></>}
            {r.notes && <><dt className="text-slate-500">Notes</dt><dd className="italic text-slate-600">{r.notes}</dd></>}
            {r.quoted_price != null && <><dt className="text-slate-500">Price</dt><dd className="font-medium text-emerald-700">£{Number(r.quoted_price)}{r.customer_response ? ` · customer said ${r.customer_response === "yes" ? "yes" : "no"}` : " · waiting for reply"}</dd></>}
          </dl>
        )}

        {item.type === "call" && (
          <div className="space-y-4 text-sm">
            <p className="text-[#0F1B33]"><span className="text-slate-500">Number</span> <a className="font-medium underline-offset-2 hover:underline" href={r.caller ? `tel:${r.caller}` : undefined}>{r.caller ?? "Unknown"}</a></p>
            {r.notes && <p className="italic text-slate-600">{r.notes}</p>}
          </div>
        )}

        {item.type === "message" && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[#0F1B33]">
              {r.phone && <a className="flex items-center gap-1.5 underline-offset-2 hover:underline" href={`tel:${r.phone}`}><Phone className="h-3.5 w-3.5 text-[#A07D32]" />{r.phone}</a>}
              {r.email && <a className="flex items-center gap-1.5 underline-offset-2 hover:underline" href={`mailto:${r.email}`}><Mail className="h-3.5 w-3.5 text-[#A07D32]" />{r.email}</a>}
            </div>
            <p className="whitespace-pre-wrap rounded-2xl bg-slate-50 px-4 py-3 leading-relaxed text-[#0F1B33]">{r.message}</p>
          </div>
        )}
      </div>

      {/* Actions: the same ones the cards had */}
      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 sm:px-6">
        {item.type === "quote" && (
          <>
            <button onClick={() => onConvertQuote(r)} disabled={!item.open} className="inline-flex min-h-[40px] items-center rounded-xl bg-amber-500 px-4 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-40">Create Booking</button>
            <button onClick={() => onOpenQuote?.(r)} className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 px-4 text-sm font-medium text-[#0F1B33] transition hover:bg-slate-50">{r.quoted_price != null ? "Edit price" : "Add price"}</button>
            {item.open && <button onClick={() => onDismissQuote(r.id)} className="inline-flex min-h-[40px] items-center rounded-xl px-3 text-sm font-medium text-slate-500 transition hover:text-[#0F1B33]">Dismiss</button>}
          </>
        )}
        {item.type === "call" && (
          <>
            {r.caller && <a href={`tel:${r.caller}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-medium text-[#0F1B33] transition hover:bg-slate-50"><Phone className="h-4 w-4" />Call Back</a>}
            <button onClick={() => onToggleMissedCall(r.id, !r.resolved)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-black transition hover:bg-amber-400">
              {r.resolved ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{r.resolved ? "Reopen" : "Mark resolved"}
            </button>
          </>
        )}
        {item.type === "message" && (
          <>
            {r.email && <a href={`mailto:${r.email}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-medium text-[#0F1B33] transition hover:bg-slate-50"><Mail className="h-4 w-4" />Reply</a>}
            <button onClick={() => onToggleContactMessage(r.id, r.status !== "read")} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-black transition hover:bg-amber-400">
              {r.status === "read" ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{r.status === "read" ? "Reopen" : "Mark read"}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

export default function InboxMail({
  quoteRequests,
  missedCalls,
  contactMessages,
  onDismissQuote,
  onConvertQuote,
  onOpenQuote,
  onToggleMissedCall,
  onToggleContactMessage,
}) {
  const [type, setType] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);

  const items = useMemo(() => [
    ...quoteRequests.map((q) => toItem("quote", q)),
    ...missedCalls.map((c) => toItem("call", c)),
    ...contactMessages.map((m) => toItem("message", m)),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")), [quoteRequests, missedCalls, contactMessages]);

  const counts = useMemo(() => {
    const open = (t) => items.filter((i) => i.open && (t === "all" || i.type === t)).length;
    return { all: open("all"), quote: open("quote"), call: open("call"), message: open("message") };
  }, [items]);

  const visible = items.filter((i) => (type === "all" || i.type === type) && (showDone || i.open));
  const selected = visible.find((i) => i.key === selectedKey) ?? null;
  // On a wide screen the first item is shown, so the pane is never empty.
  const shown = selected ?? (selectedKey === null ? visible[0] ?? null : null);

  const detailProps = {
    onOpenQuote, onDismissQuote, onConvertQuote, onToggleMissedCall, onToggleContactMessage,
  };

  return (
    <div className="flex min-h-[calc(100vh-190px)] overflow-hidden rounded-2xl border border-slate-200 bg-white lg:min-h-[calc(100vh-200px)]">
      {/* List */}
      <section className={`flex min-w-0 flex-col border-slate-200 lg:w-[340px] lg:flex-shrink-0 lg:border-r ${shown && selectedKey ? "hidden lg:flex" : "flex flex-1"}`} aria-label="Inbox">
        <div className="border-b border-slate-200 px-3 pb-2 pt-3">
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {TYPES.map((t) => {
              const n = counts[t.key];
              const active = type === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setType(t.key); setSelectedKey(null); }}
                  aria-pressed={active}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${active ? "bg-[#F5EFE0] text-[#7A5C14]" : "text-slate-500 hover:bg-slate-100 hover:text-[#0F1B33]"}`}
                >
                  {t.label}
                  {n > 0 && <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${active ? "bg-white text-[#7A5C14]" : "bg-slate-100 text-slate-600"}`}>{n}</span>}
                </button>
              );
            })}
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-3.5 w-3.5 accent-[#A07D32]" />
            Show done
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <InboxIcon className="h-6 w-6 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-medium text-[#0F1B33]">Nothing Waiting</p>
            <p className="text-xs text-slate-500">New quote requests, missed calls and website messages appear here.</p>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {visible.map((i) => {
              const active = shown?.key === i.key;
              return (
                <li key={i.key}>
                  <button
                    onClick={() => setSelectedKey(i.key)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition ${active ? "bg-[#FBF7EE]" : "hover:bg-slate-50"}`}
                  >
                    <span className="relative mt-0.5">
                      <Avatar name={i.name} type={i.type} />
                      {i.open && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500" aria-label="Open" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm ${i.open ? "font-semibold text-[#0F1B33]" : "font-medium text-slate-600"}`}>{i.name}</span>
                        <span className="flex-shrink-0 text-[11px] text-slate-500">{ago(i.at).replace(" ago", "").replace("about ", "")}</span>
                      </span>
                      <span className={`mt-0.5 block truncate text-xs ${i.open ? "text-[#0F1B33]" : "text-slate-500"}`}>{i.subject}</span>
                      {i.preview && <span className="mt-0.5 block truncate text-xs text-slate-500">{i.preview}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Detail: a full-screen view on phones and tablets portrait; a pane beside the list on wide screens. */}
      <section className={`min-w-0 flex-1 flex-col ${shown ? (selectedKey ? "fixed inset-0 z-50 flex bg-white lg:static lg:z-auto" : "hidden lg:flex") : "hidden lg:flex"}`} aria-label="Selected Item">
        {shown ? (
          <Detail item={shown} onBack={selectedKey ? () => setSelectedKey(null) : null} {...detailProps} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Select an item to see its details.</div>
        )}
      </section>
    </div>
  );
}
