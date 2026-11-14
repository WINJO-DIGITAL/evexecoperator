"use client";

import { useCallback, useState } from "react";
import QuoteDetailModal from "@/components/operator/QuoteDetailModal";
import InboxTab from "@/components/InboxTab";
import { useOperator } from "@/components/operator/OperatorContext";
import { useOperatorToast } from "@/components/operator/Toast";
import { quoteToBookingForm } from "@/lib/bookingUtils";
import { QUOTE_REQUEST_STATUS, CONTACT_MESSAGE_STATUS } from "@/lib/database.types";

// Everything waiting on the office that isn't a booking yet: website quote
// requests, missed calls and contact messages. "Convert" opens the one New
// Booking form pre-filled from the quote and marks the quote converted once
// the booking is created.
export default function InboxPage() {
  const { inbox, openNewBooking, profile } = useOperator();
  const toast = useOperatorToast();

  const [openQuote, setOpenQuote] = useState(null);
  const fail = useCallback((what) => toast({ message: `Couldn't ${what} — check connection and try again`, type: "error" }), [toast]);

  const convertQuote = useCallback((quote) => {
    openNewBooking(quoteToBookingForm(quote), {
      eyebrow: "Quote request",
      heading: "Create Booking",
      onCreated: async () => {
        const ok = await inbox.setQuoteStatus(quote.id, QUOTE_REQUEST_STATUS.CONVERTED);
        if (!ok) fail("mark the quote as converted");
      },
    });
  }, [openNewBooking, inbox, fail]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
      {inbox.loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
          Loading…
        </div>
      ) : (
        <InboxTab
          quoteRequests={inbox.quoteRequests}
          missedCalls={inbox.missedCalls}
          contactMessages={inbox.contactMessages}
          onDismissQuote={async (id) => { if (!(await inbox.setQuoteStatus(id, QUOTE_REQUEST_STATUS.DISMISSED))) fail("dismiss the quote"); }}
          onConvertQuote={convertQuote}
          onOpenQuote={(q) => setOpenQuote(q)}
          onToggleMissedCall={async (id, resolved) => { if (!(await inbox.setMissedCallResolved(id, resolved))) fail("update the missed call"); }}
          onToggleContactMessage={async (id, read) => {
            if (!(await inbox.setContactMessageStatus(id, read ? CONTACT_MESSAGE_STATUS.READ : CONTACT_MESSAGE_STATUS.NEW))) fail("update the message");
          }}
        />
      )}
      {openQuote && (
        <QuoteDetailModal
          quote={inbox.quoteRequests.find((q) => q.id === openQuote.id) ?? openQuote}
          businessName={profile?.tenant?.name ?? ""}
          toast={toast}
          onClose={() => setOpenQuote(null)}
          onSaved={() => inbox.refetch?.()}
          onConvert={() => { const q = openQuote; setOpenQuote(null); convertQuote(q); }}
          onDismiss={async () => { const id = openQuote.id; setOpenQuote(null); if (!(await inbox.setQuoteStatus(id, QUOTE_REQUEST_STATUS.DISMISSED))) fail("dismiss the quote"); }}
        />
      )}
    </div>
  );
}
