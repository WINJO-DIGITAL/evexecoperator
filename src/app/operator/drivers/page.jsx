"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Car, Phone, CheckCircle2, Clock, UserX, MoreVertical, Plus, X,
  User, Hash, Truck, MapPin, ExternalLink, Edit2, Trash2, Mail, Send, Handshake,
} from "lucide-react";
import { useDrivers } from "@/hooks/operator/useDrivers";
import { useBookings, ukDateDaysAgo } from "@/hooks/operator/useBookings";
import { ukDateOf } from "@/lib/dates";
import { useOperatorToast } from "@/components/operator/Toast";
import { bookingStatusColor } from "@/lib/operator/statusColor";
import { PORTALS } from "@/lib/operator/portals";

function statusBadge(status) {
  if (status === "Available") return "text-emerald-600 bg-emerald-400/10 border-emerald-400/20";
  if (status === "En route" || status === "Passenger onboard")
    return "text-blue-600 bg-blue-400/10 border-blue-400/20";
  if (status === "Available soon")
    return "text-amber-600 bg-amber-400/10 border-amber-400/20";
  return "text-slate-500 bg-slate-500/10 border-slate-500/20";
}

// ── Shared driver form fields ─────────────────────────────────────────────────
const DRIVER_FIELDS = [
  { key: "name",    label: "Full Name",    placeholder: "James Whitmore",        icon: User,  type: "text"  },
  { key: "phone",   label: "Phone",        placeholder: "+44 7700 900000",       icon: Phone, type: "tel"   },
  { key: "email",   label: "Email",        placeholder: "driver@example.com",    icon: Mail,  type: "email" },
  { key: "vehicle", label: "Vehicle",      placeholder: "Tesla Model Y",         icon: Truck, type: "text"  },
  { key: "plate",   label: "Plate Number", placeholder: "EV21 XYZ",              icon: Hash,  type: "text"  },
];

const KINDS = [
  { value: "driver", label: "Driver", hint: "Uses the Driver App. Gets an email invite to set a password." },
  { value: "partner", label: "Trusted partner", hint: "An outside operator you pass jobs to. No app and no invite: job details are emailed, and you send the customer texts for their jobs." },
];

// ── Driver form modal (used for both Add and Edit) ────────────────────────────
function DriverFormModal({ title, initial, submitLabel, onClose, onSubmit, isNew = false }) {
  const [form, setForm] = useState(
    initial ?? { kind: "driver", name: "", phone: "", email: "", vehicle: "", plate: "", invite: true }
  );
  const partner = form.kind === "partner";
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email?.trim() ?? "");
  const canSubmit = form.name.trim() && emailOk;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!emailOk) {
      setSubmitError("A valid email address is required — job details are emailed to it.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setSubmitError(err?.message ?? "An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-slate-200 bg-white shadow-2xl sm:max-w-md sm:rounded-3xl">
        {/* Mobile drag handle */}
        <div className="flex flex-shrink-0 justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1 w-12 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Fleet</p>
            <h2 className="mt-1 text-xl font-semibold text-[#0F1B33]">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-[#0F1B33]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <form onSubmit={handleSubmit} className="grid gap-4 p-6">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Type</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={form.kind === k.value}
                    onClick={() => setForm((f) => ({ ...f, kind: k.value }))}
                    className={`rounded-2xl border px-3 py-2.5 text-sm font-medium transition ${
                      form.kind === k.value ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">{KINDS.find((k) => k.value === form.kind)?.hint}</p>
            </div>

            {DRIVER_FIELDS.map(({ key, label, placeholder, icon: Icon, type }) => (
              <div key={key}>
                <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                  <Icon className="h-3.5 w-3.5" />
                  {label}{(key === "name" || key === "email") && <span className="text-red-600">*</span>}
                </label>
                <input
                  type={type}
                  value={form[key] ?? ""}
                  onChange={set(key)}
                  placeholder={partner && key === "name" ? "Marks Taxi" : partner && key === "email" ? "bookings@partner.co.uk" : placeholder}
                  required={key === "name" || key === "email"}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[#0F1B33] outline-none placeholder:text-slate-400 transition focus:border-amber-400/40"
                />
              </div>
            ))}

            {isNew && !partner && (
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.invite !== false}
                  onChange={(e) => setForm((f) => ({ ...f, invite: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-amber-500"
                />
                <span>Email them a Driver App invite now</span>
              </label>
            )}

            {submitError && (
              <p className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-600">
                {submitError}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm text-slate-500 transition hover:text-[#0F1B33]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Saving…" : submitLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteDriverModal({ driver, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onConfirm();
    } catch (err) {
      setDeleteError(err?.message ?? "Failed to remove driver.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10">
          <Trash2 className="h-5 w-5 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-[#0F1B33]">Remove {driver.name}?</h2>
        <p className="mt-2 text-sm text-slate-500">
          This will permanently remove them from the fleet. Any bookings currently assigned to them will become unassigned.
        </p>
        {deleteError && (
          <p className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-600">
            {deleteError}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm text-slate-500 transition hover:text-[#0F1B33] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 rounded-2xl border border-red-400/20 bg-red-400/10 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-400/20 disabled:opacity-50"
          >
            {deleting ? "Removing…" : "Remove Driver"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign Job Modal ──────────────────────────────────────────────────────────
function AssignJobModal({ driver, bookings, onAssign, onClose }) {
  const assignable = useMemo(
    () =>
      bookings.filter(
        (b) =>
          !["Completed", "Cancelled"].includes(b.status) &&
          b.driverId !== driver.id
      ),
    [bookings, driver.id]
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Fleet</p>
            <h2 className="mt-1 text-xl font-semibold text-[#0F1B33]">
              Assign job to {driver.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-[#0F1B33]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-4">
          {assignable.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">
              No available bookings to assign.
            </p>
          ) : (
            <div className="space-y-2">
              {assignable.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onAssign(b)}
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-amber-400/30 hover:bg-amber-400/[0.05]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500">{b.id}</span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${bookingStatusColor(b.status)}`}
                        >
                          {b.status}
                        </span>
                      </div>
                      <p className="mt-1 font-medium text-[#0F1B33]">{b.customer}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{b.route}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-semibold text-amber-600">{b.price}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{b.time}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            onClick={onClose}
            className="w-full rounded-2xl border border-slate-200 py-3 text-sm text-slate-500 transition hover:text-[#0F1B33]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Driver context menu (MoreVertical) ────────────────────────────────────────
function DriverMenu({ driver, access, onClose, onUpdateStatus, onAssignJob, onEdit, onDelete, onInvite }) {
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [onClose]);

  const statusOptions = ["Available", "Available soon", "Off duty"];

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 w-48 rounded-2xl border border-slate-200 bg-white py-1 shadow-2xl"
    >
      <a
        href={`tel:${driver.phone}`}
        onClick={onClose}
        className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-slate-600 transition hover:bg-slate-100"
      >
        <Phone className="h-3.5 w-3.5 text-slate-500" />
        Call
      </a>
      {driver.email && (
        <a
          href={`mailto:${driver.email}`}
          onClick={onClose}
          className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-slate-600 transition hover:bg-slate-100"
        >
          <Mail className="h-3.5 w-3.5 text-slate-500" />
          Email
        </a>
      )}
      <button
        onClick={() => { onAssignJob(driver); onClose(); }}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs text-slate-600 transition hover:bg-slate-100"
      >
        <Car className="h-3.5 w-3.5 text-slate-500" />
        Assign Job
      </button>
      {driver.kind !== "partner" && (
        <button
          onClick={() => { onInvite(driver); onClose(); }}
          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs text-slate-600 transition hover:bg-slate-100"
        >
          <Send className="h-3.5 w-3.5 text-slate-500" />
          {access?.status === "active" ? "Send password link" : access?.status === "invited" ? "Resend invite" : "Invite to Driver App"}
        </button>
      )}

      {driver.kind !== "partner" && <div className="my-1 border-t border-slate-100" />}

      {driver.kind !== "partner" && statusOptions.map((s) => (
        <button
          key={s}
          onClick={() => { onUpdateStatus(driver.id, s); onClose(); }}
          className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-xs transition hover:bg-slate-100 ${
            driver.status === s ? "text-amber-600" : "text-slate-500"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              s === "Available"
                ? "bg-emerald-400"
                : s === "Available soon"
                ? "bg-amber-400"
                : "bg-slate-500"
            }`}
          />
          {s}
        </button>
      ))}

      <div className="my-1 border-t border-slate-100" />

      <button
        onClick={() => { onEdit(driver); onClose(); }}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs text-slate-600 transition hover:bg-slate-100"
      >
        <Edit2 className="h-3.5 w-3.5 text-slate-500" />
        Edit Details
      </button>
      <button
        onClick={() => { onDelete(driver); onClose(); }}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs text-red-600 transition hover:bg-red-400/[0.06]"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Remove
      </button>
    </div>
  );
}

// ── Driver Card ───────────────────────────────────────────────────────────────
const ACCESS_CHIP = {
  partner: { label: "Trusted partner · no app", cls: "border-violet-200 bg-violet-50 text-violet-700" },
  none: { label: "Not invited to the app", cls: "border-red-200 bg-red-50 text-red-700" },
  invited: { label: "Invited · not signed in yet", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  active: { label: "Using the Driver App", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

function DriverCard({ driver, access, inviting, onAssignJob, onUpdateStatus, onEdit, onDelete, onInvite }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const partner = driver.kind === "partner";
  const chip = ACCESS_CHIP[partner ? "partner" : access?.status];

  return (
    <div className="card relative flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-semibold ${partner ? "bg-violet-50 text-violet-600" : "bg-amber-400/10 text-amber-600"}`}>
            {partner ? <Handshake className="h-6 w-6" /> : driver.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
          </div>
          <div>
            <h3 className="font-semibold text-[#0F1B33]">{driver.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{driver.plate}</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-500"
            title="Driver options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <DriverMenu
              driver={driver}
              access={access}
              onInvite={onInvite}
              onClose={() => setMenuOpen(false)}
              onUpdateStatus={onUpdateStatus}
              onAssignJob={onAssignJob}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!partner && (
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(driver.status)}`}>
            {driver.status}
          </span>
        )}
        {chip && <span className={`rounded-full border px-3 py-1 text-xs font-medium ${chip.cls}`}>{chip.label}</span>}
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <Car className="h-4 w-4 text-slate-600" />
          {driver.vehicle}
        </div>
        <a
          href={`tel:${driver.phone}`}
          className="flex items-center gap-2 text-slate-500 transition hover:text-[#0F1B33]"
        >
          <Phone className="h-4 w-4 text-slate-600" />
          {driver.phone}
        </a>
        {driver.email && (
          <a
            href={`mailto:${driver.email}`}
            className="flex items-center gap-2 truncate text-slate-500 transition hover:text-[#0F1B33]"
          >
            <Mail className="h-4 w-4 flex-shrink-0 text-slate-600" />
            {driver.email}
          </a>
        )}
        <div className="flex items-center gap-2 text-slate-500">
          <Clock className="h-4 w-4 text-slate-600" />
          {driver.job}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-[#0F1B33]">{driver.completedToday}</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Today</p>
        </div>
        <div className="flex gap-2">
          {!partner && access && access.status !== "active" && (
            <button
              onClick={() => onInvite(driver)}
              disabled={inviting}
              className="min-h-[44px] rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
            >
              {inviting ? "Sending…" : access.status === "invited" ? "Resend invite" : "Invite to app"}
            </button>
          )}
          <button
            onClick={() => onEdit(driver)}
            className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-600 transition hover:border-amber-400/20 hover:text-amber-600"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DriversPage() {
  const router = useRouter();
  const toast = useOperatorToast();
  const { drivers: fleet, access, updateStatus, createDriver, updateDriver, deleteDriver, inviteDriver } = useDrivers();
  const drivers = useMemo(() => fleet.filter((d) => d.kind !== "partner"), [fleet]);
  const partners = useMemo(() => fleet.filter((d) => d.kind === "partner"), [fleet]);
  const [invitingId, setInvitingId] = useState(null);
  const { bookings, assignDriver } = useBookings();
  const [assignModal, setAssignModal] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);   // driver object to edit
  const [deleteModal, setDeleteModal] = useState(null); // driver object to delete

  const available = drivers.filter((d) => ["Available", "Available soon"].includes(d.status)).length;
  const active = drivers.filter((d) => ["En route", "Passenger onboard"].includes(d.status)).length;
  const offDuty = drivers.length - active - available;

  const todayJobs = useMemo(() => {
    const today = ukDateDaysAgo(0);
    return bookings
      .filter((b) => (b.travelDate || ukDateOf(b.pickupTime)) === today && b.pickupTime && b.driver !== "Unassigned")
      .sort((a, b) => new Date(a.pickupTime) - new Date(b.pickupTime));
  }, [bookings]);

  const handleAssign = async (booking) => {
    if (!assignModal) return;
    try {
      await assignDriver(booking.id, assignModal.id);
      toast({ message: `${booking.customer} → ${assignModal.name}`, type: "success" });
      setAssignModal(null);
    } catch (err) {
      toast({ message: err?.message ?? "Failed to assign driver", type: "error" });
    }
  };

  const handleInvite = async (driver) => {
    setInvitingId(driver.id);
    try {
      const r = await inviteDriver(driver.id);
      toast({ message: `Invite emailed to ${r.email}`, type: "success" });
    } catch (err) {
      toast({ message: err?.message ?? "Couldn't send the invite", type: "error" });
    } finally {
      setInvitingId(null);
    }
  };

  const handleAddDriver = async (form) => {
    const id = await createDriver(form);
    setAddModal(false);
    if (form.kind === "partner") {
      toast({ message: `${form.name} added as a trusted partner`, type: "success" });
      return;
    }
    toast({ message: `${form.name} added to the fleet`, type: "success" });
    if (id && form.invite !== false) await handleInvite({ id, name: form.name });
  };

  const handleEditDriver = async (form) => {
    await updateDriver(editModal.id, form);
    toast({ message: `${form.name} updated`, type: "success" });
    setEditModal(null);
  };

  const handleDeleteDriver = async () => {
    await deleteDriver(deleteModal.id);
    toast({ message: `${deleteModal.name} removed from fleet`, type: "success" });
    setDeleteModal(null);
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await updateStatus(id, status);
      toast({ message: `Status updated to ${status}`, type: "success" });
    } catch (err) {
      toast({ message: err?.message ?? "Failed to update status", type: "error" });
    }
  };

  return (
    <>
      {assignModal && (
        <AssignJobModal
          driver={assignModal}
          bookings={bookings}
          onAssign={handleAssign}
          onClose={() => setAssignModal(null)}
        />
      )}
      {addModal && (
        <DriverFormModal
          title="Add Driver or Partner"
          submitLabel="Add"
          isNew
          onClose={() => setAddModal(false)}
          onSubmit={handleAddDriver}
        />
      )}
      {editModal && (
        <DriverFormModal
          title={editModal.kind === "partner" ? "Edit Partner" : "Edit Driver"}
          submitLabel="Save Changes"
          initial={{ kind: editModal.kind, name: editModal.name, phone: editModal.phone === "—" ? "" : editModal.phone, email: editModal.email ?? "", vehicle: editModal.vehicle === "—" ? "" : editModal.vehicle, plate: editModal.plate === "—" ? "" : editModal.plate }}
          onClose={() => setEditModal(null)}
          onSubmit={handleEditDriver}
        />
      )}
      {deleteModal && (
        <DeleteDriverModal
          driver={deleteModal}
          onClose={() => setDeleteModal(null)}
          onConfirm={handleDeleteDriver}
        />
      )}

      <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 lg:p-10">
        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[
            { label: "Total Drivers", value: drivers.length, icon: CheckCircle2, color: "text-[#0F1B33]" },
            { label: "On Job", value: active, icon: Car, color: "text-blue-600" },
            { label: "Available", value: available, icon: CheckCircle2, color: "text-emerald-600" },
            { label: "Off Duty", value: offDuty < 0 ? 0 : offDuty, icon: UserX, color: "text-slate-500" },
          ].map((s) => (
            <div key={s.label} className="card p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between sm:mb-3">
                <s.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-semibold sm:text-3xl ${s.color}`}>{s.value}</p>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Section header + Add Driver */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Fleet</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#0F1B33]">Drivers</h2>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={PORTALS.driverApp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition hover:border-amber-400/20 hover:text-amber-600"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Driver Portal</span>
            </a>
            <button
              onClick={() => setAddModal(true)}
              className="flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400 sm:px-5 sm:py-3"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Driver or Partner</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>

        {/* Driver cards grid */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {drivers.map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              access={access[driver.id]}
              inviting={invitingId === driver.id}
              onInvite={handleInvite}
              onAssignJob={setAssignModal}
              onUpdateStatus={handleUpdateStatus}
              onEdit={setEditModal}
              onDelete={setDeleteModal}
            />
          ))}
          {drivers.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 py-16">
              <Car className="mb-3 h-8 w-8 text-slate-700" />
              <p className="text-sm text-slate-600">No drivers in the fleet yet.</p>
              <button
                onClick={() => setAddModal(true)}
                className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-500 transition hover:text-amber-600"
              >
                + Add your first driver
              </button>
            </div>
          )}
        </div>

        {/* Trusted partners: outside operators, no Driver App */}
        {partners.length > 0 && (
          <div>
            <div className="mb-4">
              <h2 className="text-2xl font-semibold text-[#0F1B33]">Trusted Partners</h2>
              <p className="mt-1 text-sm text-slate-500">
                Outside operators you pass jobs to. They get job details by email and don&apos;t use the Driver App;
                customer texts for their jobs appear on Today under &ldquo;Texts to send&rdquo;.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {partners.map((p) => (
                <DriverCard
                  key={p.id}
                  driver={p}
                  access={access[p.id]}
                  onInvite={handleInvite}
                  onAssignJob={setAssignModal}
                  onUpdateStatus={handleUpdateStatus}
                  onEdit={setEditModal}
                  onDelete={setDeleteModal}
                />
              ))}
            </div>
          </div>
        )}

        {/* Today's scheduled jobs */}
        <div className="card p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-600">Schedule</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#0F1B33]">Today's Jobs</h2>
              <p className="mt-1 text-sm text-slate-500">
                {todayJobs.length === 0
                  ? "No scheduled jobs for today"
                  : `${todayJobs.length} job${todayJobs.length > 1 ? "s" : ""} scheduled`}
              </p>
            </div>
            <button
              onClick={() => router.push("/operator/bookings")}
              className="min-h-[36px] px-2 text-xs text-slate-500 transition hover:text-amber-600"
            >
              Full dispatch board →
            </button>
          </div>

          {todayJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 py-12">
              <MapPin className="mb-3 h-8 w-8 text-slate-700" />
              <p className="text-sm text-slate-600">No pickups with a scheduled time for today.</p>
              <button
                onClick={() => router.push("/operator/bookings")}
                className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-500 transition hover:text-amber-600"
              >
                Go to Dispatch Board
              </button>
            </div>
          ) : (
            /* Responsive list — no horizontal scroll on mobile */
            <div className="space-y-2">
              {todayJobs.map((b) => (
                <button
                  key={b.id}
                  onClick={() => router.push("/operator/bookings")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-amber-400/20 hover:bg-slate-50"
                >
                  <div className="w-12 flex-shrink-0 text-center">
                    <p className="text-sm font-semibold text-[#0F1B33]">{b.time}</p>
                  </div>
                  <div className="h-8 w-px flex-shrink-0 bg-slate-100" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#0F1B33]">{b.customer}</p>
                    <p className="truncate text-xs text-slate-500">{b.route}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-600">{b.driver}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold text-amber-600">{b.price}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${bookingStatusColor(b.status)}`}
                    >
                      {b.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
