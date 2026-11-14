"use client";

import { useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  Inbox,
  PhoneMissed,
  Phone,
  Mail,
  MapPin,
  Plane,
  Calendar,
  Clock,
  Users,
  MessageSquare,
  CheckCircle2,
  RotateCcw,
  ArrowLeftRight,
} from "lucide-react";
import type { DbQuoteRequest, DbMissedCall, DbContactMessage } from "@/lib/database.types";
import { fmtDate, fmtDayDate } from "@/lib/dates";

interface Props {
  quoteRequests: DbQuoteRequest[];
  missedCalls: DbMissedCall[];
  contactMessages: DbContactMessage[];
  onDismissQuote: (id: string) => void;
  onConvertQuote: (quote: DbQuoteRequest) => void;
  onOpenQuote?: (quote: DbQuoteRequest) => void;
  onToggleMissedCall: (id: string, resolved: boolean) => void;
  onToggleContactMessage: (id: string, read: boolean) => void;
}

export default function InboxTab({
  quoteRequests,
  missedCalls,
  contactMessages,
  onDismissQuote,
  onConvertQuote,
  onOpenQuote,
  onToggleMissedCall,
  onToggleContactMessage,
}: Props) {
  const [showResolved, setShowResolved] = useState(false);
  const [showRead, setShowRead] = useState(false);

  const newQuotes = quoteRequests.filter((q) => !q.status || q.status === "new");
  const visibleCalls = showResolved ? missedCalls : missedCalls.filter((c) => !c.resolved);
  const visibleMessages = showRead ? contactMessages : contactMessages.filter((m) => m.status !== "read");

  return (
    <div className="space-y-5">
      {/* Quote Requests */}
      <section className="space-y-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Inbox size={16} className="text-amber-600/80" />
            Quote Requests
          </h2>
          <span className="text-xs text-slate-500">{newQuotes.length} new</span>
        </div>

        {newQuotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed border-slate-200 text-slate-600">
            <Inbox size={24} className="mb-2 text-slate-700" />
            <p className="text-sm">No new quote requests</p>
          </div>
        ) : (
          newQuotes.map((quote) => (
            <QuoteRequestCard
              key={quote.id}
              quote={quote}
              onDismiss={() => onDismissQuote(quote.id)}
              onConvert={() => onConvertQuote(quote)}
              onOpen={() => onOpenQuote?.(quote)}
            />
          ))
        )}
      </section>

      {/* Missed Calls */}
      <section className="space-y-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <PhoneMissed size={16} className="text-amber-600/80" />
            Missed Calls
          </h2>
          <button
            onClick={() => setShowResolved((s) => !s)}
            className="text-xs text-slate-500 hover:text-slate-600 transition-colors"
          >
            {showResolved ? "Hide resolved" : "Show resolved"}
          </button>
        </div>

        {visibleCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed border-slate-200 text-slate-600">
            <PhoneMissed size={24} className="mb-2 text-slate-700" />
            <p className="text-sm">{showResolved ? "No missed calls" : "No unresolved missed calls"}</p>
          </div>
        ) : (
          visibleCalls.map((call) => (
            <MissedCallCard
              key={call.id}
              call={call}
              onToggleResolved={() => onToggleMissedCall(call.id, !call.resolved)}
            />
          ))
        )}
      </section>

      {/* Contact Messages */}
      <section className="space-y-2">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Mail size={16} className="text-amber-600/80" />
            Messages
          </h2>
          <button
            onClick={() => setShowRead((s) => !s)}
            className="text-xs text-slate-500 hover:text-slate-600 transition-colors"
          >
            {showRead ? "Hide read" : "Show read"}
          </button>
        </div>

        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed border-slate-200 text-slate-600">
            <Mail size={24} className="mb-2 text-slate-700" />
            <p className="text-sm">{showRead ? "No messages" : "No new messages"}</p>
          </div>
        ) : (
          visibleMessages.map((message) => (
            <ContactMessageCard
              key={message.id}
              message={message}
              onToggleRead={() => onToggleContactMessage(message.id, message.status !== "read")}
            />
          ))
        )}
      </section>
    </div>
  );
}

function QuoteRequestCard({
  quote,
  onDismiss,
  onConvert,
  onOpen,
}: {
  quote: DbQuoteRequest;
  onDismiss: () => void;
  onConvert: () => void;
  onOpen: () => void;
}) {
  const from  = quote.airport ?? quote.pickup_location ?? "—";
  const to    = quote.destination ?? "—";
  const route = `${from.split(",")[0]} → ${to.split(",")[0]}`;

  const dateLabel = quote.pickup_date ? fmtDayDate(quote.pickup_date) : null;
  const timeLabel = quote.pickup_time?.slice(0, 5);

  const created = quote.created_at
    ? formatDistanceToNow(parseISO(quote.created_at), { addSuffix: true })
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="rounded-2xl border border-slate-200 bg-white shadow-card overflow-hidden cursor-pointer hover:border-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      <div className="px-4 pt-3 pb-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-800 text-sm leading-tight">{quote.customer_name}</p>
            <div className="flex items-start gap-1.5 mt-1">
              <MapPin size={12} className="text-amber-600/70 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500 leading-relaxed">{route}</p>
            </div>
          </div>
          {created && <span className="text-[10px] text-slate-600 shrink-0 whitespace-nowrap">{created}</span>}
        </div>

        {/* Date / time / passengers */}
        <div className="flex items-center gap-3 flex-wrap">
          {dateLabel && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Calendar size={11} className="text-amber-600/70" /> {dateLabel}
            </span>
          )}
          {timeLabel && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Clock size={11} className="text-amber-600/70" /> {timeLabel}
            </span>
          )}
          {quote.passengers != null && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Users size={11} className="text-amber-600/70" /> {quote.passengers}
            </span>
          )}
        </div>

        {/* Flight info */}
        {quote.flight_number && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-100 border border-slate-100">
            <Plane size={12} className="text-blue-600 shrink-0 -rotate-45" />
            <span className="text-xs font-bold text-blue-600 tracking-wide">{quote.flight_number}</span>
          </div>
        )}

        {/* Return trip */}
        {quote.return_required && (
          <div className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-100 px-3 py-1.5 rounded-lg">
            <ArrowLeftRight size={11} className="shrink-0" />
            Return{quote.return_date ? ` on ${fmtDate(quote.return_date)}` : ""}
            {quote.return_time ? ` at ${quote.return_time.slice(0, 5)}` : ""}
          </div>
        )}

        {/* Phone */}
        <div className="flex items-center gap-1.5">
          <Phone size={11} className="text-amber-600/70 shrink-0" />
          <span className="text-xs text-slate-500">{quote.phone}</span>
          {quote.contact_method && (
            <span className="text-[10px] text-slate-600 ml-1">via {quote.contact_method}</span>
          )}
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="flex items-start gap-1.5">
            <MessageSquare size={11} className="text-amber-600/70 shrink-0 mt-0.5" />
            <span className="text-xs text-slate-500 italic">{quote.notes}</span>
          </div>
        )}

        {/* Price state */}
        {quote.quoted_price != null && (
          <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5">
            Priced at £{Number(quote.quoted_price)}{quote.customer_response ? ` · customer said ${quote.customer_response === "yes" ? "YES" : "NO"}` : " · waiting for reply"}
          </p>
        )}
        <p className="text-xs font-semibold text-amber-700">Tap to view and price</p>

        {/* Actions */}
        <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDismiss}
            className="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 hover:text-slate-700 active:scale-[0.98] transition-all"
          >
            Dismiss
          </button>
          <button
            onClick={onConvert}
            className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gold/10 text-amber-600 border border-gold/25 hover:bg-gold/20 hover:border-gold/40 active:scale-[0.98] transition-all"
          >
            Create Booking
          </button>
        </div>
      </div>
    </div>
  );
}

function MissedCallCard({
  call,
  onToggleResolved,
}: {
  call: DbMissedCall;
  onToggleResolved: () => void;
}) {
  const created = call.created_at
    ? formatDistanceToNow(parseISO(call.created_at), { addSuffix: true })
    : null;

  return (
    <div
      className={`rounded-2xl border bg-white shadow-card overflow-hidden px-4 py-3 ${
        call.resolved ? "border-slate-200 opacity-60" : "border-orange-500/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Phone size={12} className="text-orange-600 shrink-0" />
            <p className="font-semibold text-slate-800 text-sm">{call.caller ?? "Unknown number"}</p>
          </div>
          {call.notes && <p className="text-xs text-slate-500 italic mt-1">{call.notes}</p>}
          <div className="flex items-center gap-3 mt-1.5">
            {call.attempts != null && (
              <span className="text-[10px] text-slate-500">
                {call.attempts} attempt{call.attempts !== 1 ? "s" : ""}
              </span>
            )}
            {created && <span className="text-[10px] text-slate-600">{created}</span>}
          </div>
        </div>
        <button
          onClick={onToggleResolved}
          className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
            call.resolved
              ? "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
              : "bg-orange-100 text-orange-600 border border-orange-500/25 hover:bg-orange-100"
          }`}
        >
          {call.resolved ? <RotateCcw size={11} /> : <CheckCircle2 size={11} />}
          {call.resolved ? "Reopen" : "Resolve"}
        </button>
      </div>
    </div>
  );
}

function ContactMessageCard({
  message,
  onToggleRead,
}: {
  message: DbContactMessage;
  onToggleRead: () => void;
}) {
  const isRead = message.status === "read";
  const created = message.created_at
    ? formatDistanceToNow(parseISO(message.created_at), { addSuffix: true })
    : null;

  return (
    <div
      className={`rounded-2xl border bg-white shadow-card overflow-hidden px-4 py-3 ${
        isRead ? "border-slate-200 opacity-60" : "border-blue-500/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-800 text-sm">{message.name}</p>
            {created && <span className="text-[10px] text-slate-600 shrink-0 whitespace-nowrap">{created}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {message.phone && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Phone size={11} className="text-amber-600/70" /> {message.phone}
              </span>
            )}
            {message.email && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Mail size={11} className="text-amber-600/70" /> {message.email}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 italic mt-1.5 leading-relaxed">{message.message}</p>
        </div>
        <button
          onClick={onToggleRead}
          className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
            isRead
              ? "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
              : "bg-blue-100 text-blue-600 border border-blue-500/25 hover:bg-blue-100"
          }`}
        >
          {isRead ? <RotateCcw size={11} /> : <CheckCircle2 size={11} />}
          {isRead ? "Reopen" : "Mark read"}
        </button>
      </div>
    </div>
  );
}
