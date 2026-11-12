"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";

/**
 * The signed-in staff member's operator business (their public.tenants row):
 * name, contact details, the invoice letterhead in brand.invoice and its
 * fixed prices in pricing. Details are saved via
 * the update_tenant_profile RPC, which only lets an operator_admin (or
 * super_admin) change it, so every staff device sees the same details.
 *
 * A super_admin has no tenant of their own; they edit the first (today, the
 * only) tenant.
 */
export function useTenantProfile() {
  const [tenant, setTenant] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [user, setUser] = useState(null); // { email, name, role }
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState(null);

  // Looks up the signed-in user's business. Sets no state; null means nobody is signed in.
  const queryTenant = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    const meta = auth?.user?.user_metadata || {};
    if (!userId) return null;
    const { data: roles } = await supabase
        .from("tenant_users")
        .select("tenant_id, role")
        .eq("user_id", userId);
    const own = (roles || []).find((r) => r.tenant_id);
    const isSuper = (roles || []).some((r) => r.role === "super_admin");
    let q = supabase.from("tenants").select("id, name, contact_email, contact_phone, brand, pricing");
    q = own ? q.eq("id", own.tenant_id) : q.order("created_at", { ascending: true }).limit(1);
    const { data, error: tErr } = await q.maybeSingle();
    if (tErr) throw tErr;
    const roleOrder = ["super_admin", "operator_admin", "dispatcher", "driver"];
    const role = roleOrder.find((r) => (roles || []).some((x) => x.role === r)) || null;
    return {
      tenant: data || null,
      canEdit: isSuper || (roles || []).some((r) => r.role === "operator_admin" && data && r.tenant_id === data.id),
      user: { email: auth.user.email || "", name: meta.full_name || meta.name || "", role },
    };
  }, []);

  const applyTenant = useCallback((found) => {
    if (!found) return;
    setTenant(found.tenant);
    setCanEdit(found.canEdit);
    setUser(found.user);
  }, []);

  const load = useCallback(async () => {
    if (!isConfigured) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      applyTenant(await queryTenant());
    } catch (e) {
      setError(e?.message || "Could not load business details.");
    } finally {
      setLoading(false);
    }
  }, [queryTenant, applyTenant]);

  // First load. `loading` already starts true, so nothing is set until the answer arrives.
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    queryTenant().then(
      (found) => { if (!cancelled) { applyTenant(found); setLoading(false); } },
      (e) => { if (!cancelled) { setError(e?.message || "Could not load business details."); setLoading(false); } }
    );
    return () => { cancelled = true; };
  }, [queryTenant, applyTenant]);

  const save = useCallback(async ({ name, contactEmail, contactPhone, invoice }) => {
    if (!tenant) throw new Error("No business to update.");
    const { data, error: rpcErr } = await supabase.rpc("update_tenant_profile", {
      p_tenant_id: tenant.id,
      p_name: name,
      p_contact_email: contactEmail,
      p_contact_phone: contactPhone,
      p_invoice: invoice,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    setTenant(data);
    return data;
  }, [tenant]);

  // Prices (tenants.pricing) through update_tenant_pricing: admins only,
  // checked again in the database. `pricing` is the stored (snake_case) shape.
  const savePricing = useCallback(async (pricing) => {
    if (!tenant) throw new Error("No business to update.");
    const { data, error: rpcErr } = await supabase.rpc("update_tenant_pricing", {
      p_tenant_id: tenant.id,
      p_pricing: pricing,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    setTenant((t) => (t ? { ...t, pricing: data } : t));
    return data;
  }, [tenant]);

  // Logo and colours (brand.logo_url, brand.colors) through
  // update_tenant_branding: admins only, checked again in the database.
  // Logos go in the business's own folder of the public brand-assets bucket.
  const uploadLogo = useCallback(async (file) => {
    if (!tenant) throw new Error("No business to update.");
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.type] || "png";
    const path = `${tenant.id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("brand-assets").upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);
    return supabase.storage.from("brand-assets").getPublicUrl(path).data.publicUrl;
  }, [tenant]);

  const saveBranding = useCallback(async ({ logoUrl, primary, accent }) => {
    if (!tenant) throw new Error("No business to update.");
    const previous = tenant.brand?.logo_url || null;
    const { data, error: rpcErr } = await supabase.rpc("update_tenant_branding", {
      p_tenant_id: tenant.id,
      p_logo_url: logoUrl || null,
      p_primary: primary || null,
      p_accent: accent || null,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    setTenant(data);
    // Tidy up the replaced logo file (best effort; the new one is already saved).
    const marker = `/brand-assets/${tenant.id}/`;
    if (previous && previous !== (logoUrl || null) && previous.includes(marker)) {
      const oldPath = previous.slice(previous.indexOf(marker) + "/brand-assets/".length);
      supabase.storage.from("brand-assets").remove([oldPath]).catch(() => {});
    }
    return data;
  }, [tenant]);

  // Legal details (brand.legal) through update_tenant_legal: admins only, checked
  // again in the database. Only the fields in lib/operator/legal.js are sent.
  const saveLegal = useCallback(async (payload) => {
    if (!tenant) throw new Error("No business to update.");
    const { data, error: rpcErr } = await supabase.rpc("update_tenant_legal", {
      p_tenant_id: tenant.id,
      p_legal: payload,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    setTenant(data);
    return data;
  }, [tenant]);

  return { tenant, canEdit, user, loading, error, save, savePricing, uploadLogo, saveBranding, saveLegal, reload: load };
}
