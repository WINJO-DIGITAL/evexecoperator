// Auto-typed to match the live evexec.co.uk Supabase schema

export type BookingStatus =
  | "Unassigned"
  | "Dispatched"
  | "En Route"
  | "Passenger On Board"
  | "Completed"
  | "Cancelled"
  | "Unassigned / Missed Call Recovery";

export type PaymentStatus = "Unpaid" | "Paid" | "Invoiced";

export interface DbBooking {
  id: string;
  ref: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  flight_number: string | null;
  direction: string | null;
  airport: string | null;
  dropoff_address: string | null;
  travel_date: string | null;
  travel_time: string | null;
  pickup_time: string | null;
  driver_id: string | null;
  quoted_price: number | null;
  status: BookingStatus;
  payment_status: PaymentStatus | null;
  priority: boolean | null;
  notes: string | null;
  updated_at: string | null;
  created_at: string | null;
  drivers?: { name: string } | null;

  // Optional extended journey fields from the live public booking schema.
  // These are optional because some internal/operator-created bookings do not
  // populate them, and create/update payloads should not be forced to include
  // every public website field.
  journey_type?: string | null;
  pickup_location?: string | null;
  flight?: string | null;
  destination?: string | null;
  passengers?: number | null;
  luggage?: string | null;
  return_journey?: boolean | null;
  return_pickup?: string | null;
  return_airport?: string | null;
  return_flight?: string | null;
  return_date?: string | null;
  return_time?: string | null;
  return_destination?: string | null;
  contact_method?: string | null;
  assigned_driver_id?: string | null;
  price?: number | null;
  payment_method?: string | null;
  operator_note?: string | null;
  driver_notes?: string | null;
  vehicle_type?: string | null;
  source?: string | null;

  // Proof-of-job (P0 #4) — actual clock times the driver app records.
  pob_at?: string | null;
  completed_at?: string | null;

  // Job offer / acceptance loop (P0 #2) — orthogonal to `status`.
  offer_status?: JobOfferStatus | null;
  offered_at?: string | null;
  offer_responded_at?: string | null;
  offer_expires_at?: string | null;
}

export type JobOfferStatus = "pending" | "accepted" | "declined" | "expired";

export type JobProofKind =
  | "pob_photo"
  | "signature"
  | "completion_photo"
  | "no_show_photo";

export interface DbJobProof {
  id: string;
  booking_id: string;
  kind: JobProofKind;
  url: string;
  created_at: string | null;
}

export interface DbDriver {
  id: string;
  name: string;
  status: string | null;
  vehicle: string | null;
  plate: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
}

export interface DbMissedCall {
  id: string;
  ref: string;
  caller: string | null;
  created_at: string | null;
  attempts: number | null;
  notes: string | null;
  resolved: boolean;
}

export interface DbQuoteRequest {
  id: string;
  customer_name: string;
  phone: string;
  email: string | null;
  pickup_location: string | null;
  destination: string | null;
  pickup_date: string | null;
  pickup_time: string | null;
  passengers: number | null;
  luggage: string | null;
  return_required: boolean | null;
  return_date: string | null;
  return_time: string | null;
  return_pickup: string | null;
  return_destination: string | null;
  return_airport: string | null;
  return_flight_number: string | null;
  journey_type: string | null;
  airport: string | null;
  flight_number: string | null;
  contact_method: string | null;
  notes: string | null;
  status: string | null;
  created_at: string | null;
  quoted_price?: number | null;
  quoted_at?: string | null;
  quote_token?: string;
  customer_response?: "yes" | "no" | null;
  responded_at?: string | null;
}

export const QUOTE_REQUEST_STATUS = {
  NEW: "new",
  CONVERTED: "converted",
  DISMISSED: "dismissed",
} as const;

export interface DbContactMessage {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
  status: string | null;
  created_at: string | null;
}

export const CONTACT_MESSAGE_STATUS = {
  NEW: "new",
  READ: "read",
} as const;

export interface DbDriverLocation {
  driver_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  booking_ref: string | null;
  updated_at: string | null;
}

export interface DbDriverUnavailableDate {
  id: string;
  driver_id: string;
  date: string;
  created_at: string | null;
}

export interface DbNotificationLog {
  id: number;
  booking_id: string;
  type: string;
  channel: string;
  sent_at: string | null;
}

export interface DbNotificationQueueItem {
  id: string;
  booking_id: string | null;
  type: string | null;
  channel: string;
  status: string | null;
  delivery_status: string | null;
  attempts: number | null;
  next_attempt_at: string | null;
  sent_at: string | null;
  created_at: string | null;
  has_error: boolean;
}

export interface DbAuditLogEntry {
  id: number;
  booking_id: string;
  booking_ref: string;
  field: "status" | "driver" | "payment_status" | string;
  old_value: string | null;
  new_value: string | null;
  changed_by_email: string | null;
  created_at: string | null;
}

export interface Database {
  public: {
    Tables: {
      bookings: {
        Row: DbBooking;
        Insert: Omit<DbBooking, "id" | "created_at" | "updated_at" | "drivers">;
        Update: Partial<Omit<DbBooking, "ref" | "created_at" | "drivers">>;
      };
      drivers: {
        Row: DbDriver;
        Insert: Omit<DbDriver, "id">;
        Update: Partial<DbDriver>;
      };
      missed_calls: {
        Row: DbMissedCall;
        Insert: Omit<DbMissedCall, "id" | "created_at">;
        Update: Partial<DbMissedCall>;
      };
      quote_requests: {
        Row: DbQuoteRequest;
        Insert: Omit<DbQuoteRequest, "id" | "created_at">;
        Update: Partial<DbQuoteRequest>;
      };
      driver_unavailable_dates: {
        Row: DbDriverUnavailableDate;
        Insert: Omit<DbDriverUnavailableDate, "id" | "created_at">;
        Update: Partial<DbDriverUnavailableDate>;
      };
      driver_locations: {
        Row: DbDriverLocation;
        Insert: Omit<DbDriverLocation, "updated_at">;
        Update: Partial<DbDriverLocation>;
      };
      job_proofs: {
        Row: DbJobProof;
        Insert: Omit<DbJobProof, "id" | "created_at">;
        Update: Partial<DbJobProof>;
      };
      contact_messages: {
        Row: DbContactMessage;
        Insert: Omit<DbContactMessage, "id" | "created_at">;
        Update: Partial<DbContactMessage>;
      };
    };
    Views: {
      notification_log_dashboard: { Row: DbNotificationLog };
      notification_queue_dashboard: { Row: DbNotificationQueueItem };
      booking_audit_log: { Row: DbAuditLogEntry };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Forward edges are the driver's live progression; the extra trailing edges are
// the operator's one-step REVERSE (correction) plus reinstating a cancelled job.
// Mirrors the database guard (enforce_booking_status_transition).
export const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  "Unassigned": ["Dispatched", "Cancelled", "Unassigned / Missed Call Recovery"],
  "Unassigned / Missed Call Recovery": ["Dispatched", "Cancelled", "Unassigned"],
  "Dispatched": ["En Route", "Cancelled", "Unassigned"],
  "En Route": ["Passenger On Board", "Cancelled", "Dispatched"],
  "Passenger On Board": ["Completed", "Cancelled", "En Route"],
  // Operators may cancel/void a completed job, or reverse it back a step.
  "Completed": ["Cancelled", "Passenger On Board"],
  // Reinstate a cancelled job.
  "Cancelled": ["Unassigned"],
};

export const STATUS_NEXT_PRIMARY: Record<BookingStatus, BookingStatus | null> = {
  "Unassigned": "Dispatched",
  "Unassigned / Missed Call Recovery": "Dispatched",
  "Dispatched": "En Route",
  "En Route": "Passenger On Board",
  "Passenger On Board": "Completed",
  "Completed": null,
  "Cancelled": null,
};

export const STATUS_NEXT_LABEL: Record<BookingStatus, string | null> = {
  "Unassigned": "Dispatch",
  "Unassigned / Missed Call Recovery": "Dispatch",
  "Dispatched": "Mark En Route",
  "En Route": "Passenger On Board",
  "Passenger On Board": "Complete",
  "Completed": null,
  "Cancelled": null,
};

// Operator-only correction: reverse a job one step, e.g. an accidental tap of
// "Mark En Route". The driver app has no equivalent control -- forward
// progression there is the driver's job. These edges are already permitted
// by the database's enforce_booking_status_transition trigger (see
// STATUS_TRANSITIONS above), this just exposes them as a one-step undo.
const STATUS_REVERSE: Partial<Record<BookingStatus, BookingStatus>> = {
  "Dispatched": "Unassigned",
  "En Route": "Dispatched",
  "Passenger On Board": "En Route",
  "Completed": "Passenger On Board",
  "Cancelled": "Unassigned",
};

export function reverseTarget(status: BookingStatus): BookingStatus | null {
  return STATUS_REVERSE[status] ?? null;
}

export function reverseLabel(status: BookingStatus): string | null {
  const to = reverseTarget(status);
  if (!to) return null;
  if (status === "Cancelled") return "Reinstate job";
  return `Undo → ${to}`;
}
