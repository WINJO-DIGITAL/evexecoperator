import type { DbBooking } from "@/lib/database.types";

export function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

const BOOKING_CSV_HEADERS = [
  "Ref", "Date", "Time", "Customer", "Phone", "Email",
  "Pickup", "Dropoff", "Flight", "Driver", "Price", "Status", "Payment Status",
];

export function bookingsToCsv(bookings: DbBooking[]): string {
  const rows = bookings.map((b) => [
    b.ref,
    b.travel_date,
    b.travel_time?.slice(0, 5) ?? "",
    b.customer_name,
    b.customer_phone,
    b.customer_email,
    b.airport,
    b.dropoff_address,
    b.flight_number,
    b.drivers?.name ?? "",
    b.quoted_price,
    b.status,
    b.payment_status,
  ]);
  return toCsv([BOOKING_CSV_HEADERS, ...rows]);
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}