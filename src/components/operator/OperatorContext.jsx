"use client";

import { createContext, useContext } from "react";
import { DEFAULT_PRICING } from "@/lib/prices";

// Shared state for every operator screen, provided once by the operator shell
// (Layout.jsx) so screens don't each load their own copy:
// - openNewBooking(initialValues?, { eyebrow, heading, onCreated }) opens the
//   one New Booking form (also used for returns and converted quotes);
// - inbox: quote requests, missed calls and website messages, with actions
//   and the unread count shown on the nav badge;
// - profile: the signed-in user, their role, the operator business and its
//   prices (pricing: { airports, extraStop }, see lib/prices.ts).
const OperatorContext = createContext(null);

export const OperatorProvider = OperatorContext.Provider;

const FALLBACK = {
  openNewBooking: () => {},
  inbox: {
    quoteRequests: [], missedCalls: [], contactMessages: [], count: 0, loading: false,
    setQuoteStatus: async () => false, setMissedCallResolved: async () => false, setContactMessageStatus: async () => false,
  },
  profile: { tenant: null, user: null, pricing: DEFAULT_PRICING, reload: () => {} },
};

export function useOperator() {
  return useContext(OperatorContext) ?? FALLBACK;
}

export const ROLE_LABELS = {
  super_admin: "Platform admin",
  operator_admin: "Admin",
  dispatcher: "Dispatcher",
  driver: "Driver",
};

/** Up to two initials from a name or email, for the avatar. */
export function initialsOf(text) {
  const t = String(text || "").trim();
  if (!t) return "?";
  const base = t.includes("@") ? t.split("@")[0].replace(/[._-]+/g, " ") : t;
  return base.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}
