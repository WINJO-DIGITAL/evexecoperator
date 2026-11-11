"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, isConfigured } from "@/lib/supabase";

export function shapedInvoice(row) {
  return {
    id: row.id,
    number: row.invoice_number,
    bookingRef: row.booking_ref ?? null,
    bookingId: row.booking_id ?? null,
    customer: row.customer_name ?? "",
    email: row.customer_email ?? null,
    phone: row.customer_phone ?? null,
    address: row.customer_address ?? null,
    lineItems: Array.isArray(row.line_items) ? row.line_items : [],
    journey: row.journey && typeof row.journey === "object" ? row.journey : {},
    subtotal: Number(row.subtotal ?? 0),
    vatRate: Number(row.vat_rate ?? 0),
    vatAmount: Number(row.vat_amount ?? 0),
    total: Number(row.total ?? 0),
    status: row.status ?? "Draft",
    issueDate: row.issue_date ?? null,
    dueDate: row.due_date ?? null,
    notes: row.notes ?? "",
    createdAt: row.created_at ?? null,
  };
}

// Computes subtotal / VAT / total from line items and a VAT rate.
export function computeTotals(lineItems, vatRate) {
  const subtotal = (lineItems || []).reduce(
    (acc, li) => acc + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0),
    0
  );
  const rate = Number(vatRate) || 0;
  const vatAmount = Math.round(subtotal * rate * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, vatAmount, total };
}

export function useInvoices() {
  const [invoices, setInvoices] = useState([]);
  // Starts true when there is a database to ask: the first load begins on mount.
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState(null);
  const invoicesRef = useRef(invoices);
  useEffect(() => { invoicesRef.current = invoices; }, [invoices]);

  const queryInvoices = useCallback(
    () => supabase.from("invoices").select("*").order("created_at", { ascending: false }),
    []
  );

  const applyInvoices = useCallback(({ data, error: err }) => {
    if (err) {
      setError(err.message);
    } else {
      setInvoices((data || []).map(shapedInvoice));
      setError(null);
    }
    setLoading(false);
  }, []);

  const fetchInvoices = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    try {
      applyInvoices(await queryInvoices());
    } catch (e) {
      setLoading(false);
      throw e;
    }
  }, [queryInvoices, applyInvoices]);

  // First load. `loading` already starts true, so nothing is set until the answer arrives.
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    queryInvoices().then(
      (res) => { if (!cancelled) applyInvoices(res); },
      () => { if (!cancelled) setLoading(false); }
    );
    return () => { cancelled = true; };
  }, [queryInvoices, applyInvoices]);

  const createInvoice = useCallback(async (form) => {
    const { subtotal, vatAmount, total } = computeTotals(form.lineItems, form.vatRate);
    if (!isConfigured) throw new Error("Database not configured.");
    const { data, error: err } = await supabase
      .from("invoices")
      .insert({
        booking_ref:      form.bookingRef || null,
        // Links the invoice to the job (one invoice per job is enforced by the
        // invoices_one_per_booking index; it's also how customers see it).
        booking_id:       form.bookingId || null,
        customer_name:    (form.customer || "").trim(),
        customer_email:   form.email?.trim() || null,
        customer_phone:   form.phone?.trim() || null,
        customer_address: form.address?.trim() || null,
        line_items:       form.lineItems || [],
        journey:          form.journey || {},
        subtotal,
        vat_rate:         Number(form.vatRate) || 0,
        vat_amount:       vatAmount,
        total,
        status:           form.status || "Draft",
        issue_date:       form.issueDate || null,
        due_date:         form.dueDate || null,
        notes:            form.notes?.trim() || null,
      })
      .select()
      .single();
    if (err) {
      if (/invoices_one_per_booking/.test(err.message)) throw new Error("This job already has an invoice. Open it from the list instead.");
      throw new Error(err.message);
    }
    const shaped = shapedInvoice(data);
    setInvoices((prev) => [shaped, ...prev]);
    return shaped;
  }, []);

  const updateStatus = useCallback(async (id, status) => {
    const snapshot = invoicesRef.current;
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    if (!isConfigured) return;
    try {
      const { error: err } = await supabase.from("invoices").update({ status }).eq("id", id);
      if (err) throw new Error(err.message);
    } catch (e) {
      setInvoices(snapshot);
      throw e;
    }
  }, []);

  const deleteInvoice = useCallback(async (id) => {
    const snapshot = invoicesRef.current;
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    if (!isConfigured) return;
    try {
      const { error: err } = await supabase.from("invoices").delete().eq("id", id);
      if (err) throw new Error(err.message);
    } catch (e) {
      setInvoices(snapshot);
      throw e;
    }
  }, []);

  return { invoices, loading, error, createInvoice, updateStatus, deleteInvoice, refetch: fetchInvoices };
}
