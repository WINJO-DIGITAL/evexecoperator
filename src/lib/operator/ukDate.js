// UK calendar-date helpers with no data dependencies (so pure UI, tests and
// previews can use them without loading the Supabase client).

// Live screens load bookings from this many days ago onwards (see useBookings).
export const OPERATIONAL_DAYS_BACK = 14;

/** UK calendar date `daysBack` days before today, as YYYY-MM-DD. */
export function ukDateDaysAgo(daysBack, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now); // YYYY-MM-DD
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}
