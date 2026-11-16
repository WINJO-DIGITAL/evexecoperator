"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchLatestVerification,
  runFlightVerification,
  type FlightVerification,
  type VerifyOptions,
} from "@/lib/operator/flightVerification";

/** Shared by both the Dispatch drawer and the Calendar edit modal -- one
 * verification record per booking, fetched/refreshed the same way from
 * either surface. */
export function useFlightVerification(bookingId: string | null | undefined) {
  const [verification, setVerification] = useState<FlightVerification | null>(null);
  const [loading, setLoading] = useState(Boolean(bookingId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const latest = await fetchLatestVerification(bookingId);
      setVerification(latest);
    } catch {
      // Non-fatal -- the panel just shows "not yet verified".
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  // Showing a different booking: forget the last one's verification straight
  // away (while rendering, not in an effect) and show the loading state.
  const [shownFor, setShownFor] = useState(bookingId);
  if (shownFor !== bookingId) {
    setShownFor(bookingId);
    setVerification(null);
    setLoading(Boolean(bookingId));
  }

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    fetchLatestVerification(bookingId)
      .then((latest) => {
        if (!cancelled) setVerification(latest);
      })
      .catch(() => {
        // Non-fatal -- the panel just shows "not yet verified".
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const verify = useCallback(
    async (opts: VerifyOptions = {}) => {
      if (!bookingId) return null;
      setBusy(true);
      setError(null);
      try {
        const result = await runFlightVerification(bookingId, opts);
        setVerification(result);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [bookingId]
  );

  return { verification, loading, busy, error, verify, reload };
}
