"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useBookings } from "@/hooks/operator/useBookings";
import { useDrivers } from "@/hooks/operator/useDrivers";
import { useDriverAvailability } from "@/hooks/useDriverAvailability";
import { useBookingDrawer } from "@/components/operator/useBookingDrawer";
import { useOperator } from "@/components/operator/OperatorContext";
import CalendarScreen from "./CalendarScreen";

/**
 * Bookings → Calendar, wired to live data: the same bookings the List and
 * Board use (hooks/operator/useBookings, realtime), drivers, drivers' days
 * off, the shared booking drawer for every change, and the shell's New
 * Booking form. View and date come from the URL
 * (?view=calendar&cv=week&d=2026-10-15) so a link opens the same screen.
 */
export default function OperatorCalendar() {
  const params = useSearchParams();
  const api = useBookings();
  const { drivers } = useDrivers();
  const { unavailableDriverIds } = useDriverAvailability();
  const drawer = useBookingDrawer(api, drivers);
  const { openNewBooking } = useOperator();

  const newBookingOn = useCallback((date) => {
    openNewBooking({ date }, { eyebrow: "New Booking", heading: "Create Transfer" });
  }, [openNewBooking]);

  return (
    <>
      {drawer.element}
      <CalendarScreen
        bookings={api.bookings}
        drivers={drivers}
        loading={api.loading}
        error={api.error}
        hasEarlier={api.hasEarlier}
        totalCount={api.totalCount}
        loadingMore={api.loadingMore}
        onLoadEarlier={api.loadEarlier}
        onLoadMore={api.loadMore}
        onRetry={api.refetch}
        unavailableDriverIds={unavailableDriverIds}
        onOpenBooking={drawer.open}
        onAssign={drawer.assign}
        onNewBooking={newBookingOn}
        initialView={params.get("cv")}
        initialDate={params.get("d")}
      />
    </>
  );
}
