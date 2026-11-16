/**
 * Supabase Edge Function: manage-tenants
 *
 * Super-admin-only tenant management: list tenants, create a tenant, list a
 * tenant's members, and invite a new operator_admin for a tenant. Every
 * action independently verifies the caller is a super_admin (via
 * public.tenant_users, looked up with the service-role key) before doing
 * anything -- unlike the other edge functions in this project, this one
 * guards real cross-tenant admin actions, so the check can't be skipped.
 *
 * Required Supabase secrets (already set for this project):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 *   (SUPABASE_* secrets are provided automatically to edge functions)
 *
 * Request body (JSON): { action: string, ...params }
 *   action: "list_tenants"          -> {}
 *   action: "create_tenant"         -> { slug, name, contactEmail?, contactPhone? }
 *   action: "list_tenant_users"     -> { tenantId }
 *   action: "invite_operator_admin" -> { tenantId, email, redirectTo? }
 *
 * Response: { ok: boolean, ...data } or { ok: false, reason: string }
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Resolves the calling user's id from their JWT, or null if invalid. */
async function getCallerId(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: authHeader },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ?? null;
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_users?user_id=eq.${userId}&role=eq.super_admin&select=id&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listTenants() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?select=*&order=created_at.desc`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) throw new Error(`Failed to list tenants: ${await res.text()}`);
  return await res.json();
}

async function createTenant(params: { slug?: string; name?: string; contactEmail?: string; contactPhone?: string }) {
  const slug = (params.slug || "").trim().toLowerCase();
  const name = (params.name || "").trim();
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error("slug is required and must be lowercase letters/numbers/hyphens only");
  }
  if (!name) throw new Error("name is required");

  const res = await fetch(`${SUPABASE_URL}/rest/v1/tenants`, {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({
      slug,
      name,
      contact_email: params.contactEmail || null,
      contact_phone: params.contactPhone || null,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create tenant: ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}

async function listTenantUsers(tenantId: string) {
  if (!tenantId || !UUID_RE.test(tenantId)) throw new Error("a valid tenantId is required");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tenant_users?tenant_id=eq.${tenantId}&select=id,role,user_id,created_at&order=created_at.asc`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) throw new Error(`Failed to list tenant users: ${await res.text()}`);
  const rows: Array<{ id: string; role: string; user_id: string; created_at: string }> = await res.json();

  // Look up emails for display -- the admin users endpoint is per-id, so
  // fetch them in parallel rather than listing every auth user.
  const withEmail = await Promise.all(
    rows.map(async (row) => {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${row.user_id}`, {
        headers: serviceHeaders(),
      });
      const email = userRes.ok ? (await userRes.json())?.email ?? null : null;
      return { ...row, email };
    })
  );
  return withEmail;
}

async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const users = data?.users ?? data; // GoTrue has returned either shape historically
  const match = Array.isArray(users) ? users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()) : null;
  return match ? { id: match.id } : null;
}

async function inviteOperatorAdmin(params: { tenantId?: string; email?: string; redirectTo?: string }) {
  const tenantId = params.tenantId;
  const email = (params.email || "").trim().toLowerCase();
  if (!tenantId) throw new Error("tenantId is required");
  if (!email || !email.includes("@")) throw new Error("a valid email is required");

  // Invite (creates the auth user and emails them a set-password link). If
  // they already have an account, GoTrue errors -- fall back to looking
  // them up so re-inviting an existing person to a new tenant still works.
  let userId: string | null = null;
  const inviteRes = await fetch(
    `${SUPABASE_URL}/auth/v1/invite${params.redirectTo ? `?redirect_to=${encodeURIComponent(params.redirectTo)}` : ""}`,
    {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({ email }),
    }
  );

  if (inviteRes.ok) {
    const invited = await inviteRes.json();
    userId = invited?.id ?? null;
  } else {
    const existing = await findAuthUserByEmail(email);
    if (!existing) {
      throw new Error(`Failed to invite ${email}: ${await inviteRes.text()}`);
    }
    userId = existing.id;
  }

  if (!userId) throw new Error("Could not resolve an auth user id for this invite");

  const linkRes = await fetch(`${SUPABASE_URL}/rest/v1/tenant_users`, {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, role: "operator_admin" }),
  });
  if (!linkRes.ok) {
    const text = await linkRes.text();
    // Already linked with this exact role -- treat as success, not an error.
    if (!text.includes("duplicate key")) {
      throw new Error(`Invited ${email} but failed to grant operator_admin: ${text}`);
    }
  }

  return { email, userId, tenantId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const callerId = await getCallerId(req.headers.get("authorization"));
    if (!callerId) return json({ ok: false, reason: "Not authenticated" }, 401);
    if (!(await isSuperAdmin(callerId))) {
      return json({ ok: false, reason: "Forbidden: super_admin only" }, 403);
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case "list_tenants":
        return json({ ok: true, tenants: await listTenants() });
      case "create_tenant":
        return json({ ok: true, tenant: await createTenant(params) });
      case "list_tenant_users":
        return json({ ok: true, users: await listTenantUsers(params.tenantId) });
      case "invite_operator_admin":
        return json({ ok: true, invite: await inviteOperatorAdmin(params) });
      default:
        return json({ ok: false, reason: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[manage-tenants] error:", err);
    return json({ ok: false, reason: err instanceof Error ? err.message : String(err) }, 500);
  }
});
