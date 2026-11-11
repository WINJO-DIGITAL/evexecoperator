"use client";

import { useCallback, useMemo, useState } from "react";
import BookingDetailDrawer from "@/components/operator/BookingDetailDrawer";
import { useOperatorToast } from "@/components/operator/Toast";
import { useOperator } from "@/components/operator/OperatorContext";
import { supabase } from "@/lib/supabase";

// The booking detail drawer and every action in it (accept/reject, status,
// driver, notes, priority, payment, edit, return journey, delete), shared by
// every screen that lists bookings (Today, Bookings list and board).
//
//   const api = useBookings();
//   const { drivers } = useDrivers();
//   const drawer = useBookingDrawer(api, drivers);
//   ... onClick={() => drawer.open(booking)} ...
//   {drawer.element}
export function useBookingDrawer(api, drivers) {
  const {
    bookings: transfers,
    updateStatus,
    assignDriver,
    respondToBooking,
    updateNotes,
    togglePriority,
    updatePaymentStatus,
    updatePaymentMethod,
    updateBooking,
    deleteBooking,
  } = api;
  const toast = useOperatorToast();
  const { openNewBooking } = useOperator();
  const [selectedBooking, setSelectedBooking] = useState(null);

  const handleStatusUpdate = useCallback(async (id, status) => {
    try {
      await updateStatus(id, status);
      toast({ message: `Status → ${status}`, type: "success" });
      setSelectedBooking((prev) => (prev?.id === id ? { ...prev, status } : prev));
    } catch (err) {
      toast({ message: err?.message ?? "Failed to update status", type: "error" });
    }
  }, [updateStatus, toast]);

  const handleRespond = useCallback(async (id, decision) => {
    // respondToBooking throws only on a DB failure (which it rolls back) — let
    // that propagate so the drawer panel can show it. Notification issues come
    // back as { warning } instead.
    const out = await respondToBooking(id, decision);
    const verb = decision === "accepted" ? "Accepted" : "Rejected";
    if (out?.warning) {
      toast({ message: `${verb}, but ${out.warning}`, type: "error" });
    } else if (out?.channel === "text") {
      toast({ message: `${verb}. No email on file: send the text from Today → Texts to send.`, type: "success" });
    } else {
      toast({
        message: `${verb} — customer notified${out?.channel ? ` by ${out.channel}` : ""}`,
        type: "success",
      });
    }
    setSelectedBooking((prev) =>
      prev?.id === id
        ? { ...prev, operatorResponse: decision, ...(decision === "rejected" ? { status: "Cancelled" } : {}) }
        : prev
    );
  }, [respondToBooking, toast]);

  const handleDeleteBooking = useCallback(async (id, password) => {
    // Throws on bad password / failure so the drawer's modal can show the error
    // and keep itself open; on success we close the drawer.
    await deleteBooking(id, password);
    toast({ message: `Booking ${id} deleted`, type: "success" });
    setSelectedBooking(null);
  }, [deleteBooking, toast]);

  const handleAssignDriver = useCallback(async (id, driverId) => {
    const driver = drivers.find((d) => d.id === driverId);
    try {
      await assignDriver(id, driverId, driver?.name ?? null);
      toast({ message: driver ? `Assigned to ${driver.name}` : "Driver unassigned", type: "success" });
      setSelectedBooking((prev) => {
        if (prev?.id !== id) return prev;
        return { ...prev, driverId, driver: driver?.name ?? "Unassigned" };
      });
    } catch (err) {
      toast({ message: err?.message ?? "Failed to assign driver", type: "error" });
    }
  }, [assignDriver, drivers, toast]);

  const handleUpdateNotes = useCallback(async (id, notes) => {
    await updateNotes(id, notes);
    setSelectedBooking((prev) => (prev?.id === id ? { ...prev, notes } : prev));
  }, [updateNotes]);

  const handleTogglePriority = useCallback(async (id) => {
    try {
      await togglePriority(id);
      setSelectedBooking((prev) => {
        if (prev?.id !== id) return prev;
        return { ...prev, priority: !prev.priority };
      });
    } catch (err) {
      toast({ message: err?.message ?? "Failed to update priority", type: "error" });
    }
  }, [togglePriority, toast]);

  const handleUpdatePaymentStatus = useCallback(async (id, ps) => {
    try {
      await updatePaymentStatus(id, ps);
      setSelectedBooking((prev) => (prev?.id === id ? { ...prev, paymentStatus: ps } : prev));
    } catch (err) {
      toast({ message: err?.message ?? "Failed to update payment status", type: "error" });
    }
  }, [updatePaymentStatus, toast]);

  const handleUpdatePaymentMethod = useCallback(async (id, method) => {
    try {
      await updatePaymentMethod(id, method);
      setSelectedBooking((prev) => (prev?.id === id ? { ...prev, paymentMethod: method } : prev));
      toast({ message: method ? `Payment method: ${method}` : "Payment method cleared", type: "success" });
    } catch (err) {
      toast({ message: err?.message ?? "Failed to update payment method", type: "error" });
    }
  }, [updatePaymentMethod, toast]);

  const handleUpdateBooking = useCallback(async (id, fields) => {
    try {
      await updateBooking(id, fields);
      setSelectedBooking((prev) => (prev?.id === id ? { ...prev, ...fields } : prev));
      toast({ message: "Booking updated", type: "success" });
    } catch (err) {
      toast({ message: err?.message ?? "Failed to update booking", type: "error" });
      throw err;
    }
  }, [updateBooking, toast]);

  const handleSendPaymentLink = useCallback(async (id) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast({ message: "Please sign in again to send a payment link.", type: "error" });
        return;
      }
      const res = await fetch("/api/payment-link", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ ref: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ message: data?.error ?? "Could not create payment link.", type: "error" });
        return;
      }
      // Reflect the method locally so the badge/chip update immediately.
      await updatePaymentMethod(id, "Payment link").catch(() => {});
      setSelectedBooking((prev) => (prev?.id === id ? { ...prev, paymentMethod: "Payment link" } : prev));
      toast({
        message: data?.emailed
          ? `Payment link emailed to ${data.emailTo}.`
          : data?.smsHref
            ? "Payment link ready. Tap \"Text link to customer\" to send it."
            : `Payment link created${data?.emailError ? `, but the email failed: ${data.emailError}` : "."}`,
        type: data?.emailed || data?.smsHref ? "success" : "error",
      });
      return data;
    } catch (err) {
      toast({ message: err?.message ?? "Could not create payment link.", type: "error" });
    }
  }, [updatePaymentMethod, toast]);

  const handleCreateReturn = useCallback((booking) => {
    const rawPrice = booking.price !== "TBC" ? booking.price.replace(/[^0-9.]/g, "") : "";
    // Return leg = the reverse trip: original drop-off becomes the new pickup.
    const origPickup = booking.pickupLocation || booking.airport || "";
    const origDropoff = booking.dropoffAddress || booking.destination || booking.airport || "";
    openNewBooking({
      customer: booking.customer ?? "",
      phone:    booking.phone ?? "",
      email:    booking.email ?? "",
      flight:   "",
      pickup:   origDropoff,
      dropoff:  origPickup,
      date:     "",
      time:     "",
      driver:   "",
      price:    rawPrice,
      notes:    "",
    }, { eyebrow: "Return Journey", heading: "Create Return" });
    setSelectedBooking(null);
  }, [openNewBooking]);

  // Keep the open drawer in step with live updates to the same booking.
  const liveSelectedBooking = useMemo(() => {
    if (!selectedBooking) return null;
    return transfers.find((t) => t.id === selectedBooking.id) ?? selectedBooking;
  }, [selectedBooking, transfers]);

  const element = liveSelectedBooking ? (
    <BookingDetailDrawer
      booking={liveSelectedBooking}
      drivers={drivers}
      onClose={() => setSelectedBooking(null)}
      onRespond={handleRespond}
      onUpdateStatus={handleStatusUpdate}
      onAssignDriver={handleAssignDriver}
      onUpdateNotes={handleUpdateNotes}
      onTogglePriority={handleTogglePriority}
      onUpdatePaymentStatus={handleUpdatePaymentStatus}
      onUpdatePaymentMethod={handleUpdatePaymentMethod}
      onSendPaymentLink={handleSendPaymentLink}
      onUpdateBooking={handleUpdateBooking}
      onCreateReturn={handleCreateReturn}
      onDelete={handleDeleteBooking}
    />
  ) : null;

  return {
    open: setSelectedBooking,
    selectedId: selectedBooking?.id ?? null,
    close: () => setSelectedBooking(null),
    element,
    // Row-level actions the lists use directly (inline driver pick, accept).
    assign: handleAssignDriver,
    respond: handleRespond,
    setStatus: handleStatusUpdate,
  };
}
