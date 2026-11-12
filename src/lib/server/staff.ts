// Server-only helpers for routes that act on operator staff accounts
// (team management, password emails). Uses the service-role key, so never
// import this from client code.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.INVOICE_FROM ?? "EV Exec <book@evexec.co.uk>";
const REPLY_TO = process.env.INVOICE_REPLY_TO ?? "book@evexec.co.uk";

export const STAFF_ROLES = ["operator_admin", "dispatcher"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function adminClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export type Caller = {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  tenantName: string;
  isAdmin: boolean; // operator_admin of this tenant, or super_admin
};

/**
 * The signed-in staff member making the request (Bearer token), with their
 * business. Null when the token is missing/invalid or they aren't staff.
 * A super_admin (no tenant of their own) acts on the first tenant, like the
 * Operator app does.
 */
export async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;

  const { data: roles } = await admin.from("tenant_users").select("tenant_id, role").eq("user_id", user.id);
  const rows = roles ?? [];
  const isSuper = rows.some((r) => r.role === "super_admin");
  const staff = rows.find((r) => r.tenant_id && (STAFF_ROLES as readonly string[]).includes(r.role));
  let tenantId = staff?.tenant_id as string | undefined;
  if (!tenantId && isSuper) {
    const { data: t } = await admin.from("tenants").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    tenantId = t?.id;
  }
  if (!tenantId) return null;
  const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  return {
    userId: user.id,
    email: user.email ?? "",
    name: meta.full_name || meta.name || "",
    tenantId,
    tenantName: tenant?.name || "your business",
    isAdmin: isSuper || rows.some((r) => r.tenant_id === tenantId && r.role === "operator_admin"),
  };
}

/** Where emailed sign-in links point: this Operator app. */
export function appOrigin(req: Request) {
  const configured = process.env.NEXT_PUBLIC_OPERATOR_URL;
  return (configured || new URL(req.url).origin).replace(/\/$/, "");
}

/**
 * A one-time sign-in link to this app's /set-password page. Built from the
 * hashed token (verified in the browser with verifyOtp), so it doesn't depend
 * on Supabase's redirect allow-list.
 */
export function setPasswordUrl(origin: string, hashedToken: string, type: "invite" | "recovery" | "magiclink") {
  return `${origin}/set-password?token_hash=${encodeURIComponent(hashedToken)}&type=${type}`;
}

export async function sendEmail(to: string, mail: { subject: string; html: string; text: string }) {
  if (!RESEND_API_KEY) throw new Error("Email isn't set up (RESEND_API_KEY is missing in Vercel).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j?.message || j?.error || ""; } catch { /* ignore */ }
    throw new Error(`The email provider rejected the send${detail ? `: ${detail}` : "."}`);
  }
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export type PlatformCaller = { userId: string; email: string; name: string };

/**
 * The signed-in platform owner (a super_admin), or null. Unlike getCaller this
 * does not need a business of their own: it is for actions on any business.
 */
export async function getSuperAdmin(req: Request, admin: SupabaseClient): Promise<PlatformCaller | null> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;
  const { data: roles } = await admin.from("tenant_users").select("role").eq("user_id", user.id).eq("role", "super_admin");
  if (!(roles ?? []).length) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  return { userId: user.id, email: user.email ?? "", name: meta.full_name || meta.name || "" };
}

/** A person has one staff role per business: replace any other. */
export async function setRole(admin: SupabaseClient, tenantId: string, userId: string, role: StaffRole) {
  const others = STAFF_ROLES.filter((r) => r !== role) as unknown as string[];
  const del = await admin.from("tenant_users").delete().eq("tenant_id", tenantId).eq("user_id", userId).in("role", others);
  if (del.error) throw new Error(del.error.message);
  const ins = await admin.from("tenant_users").upsert(
    { tenant_id: tenantId, user_id: userId, role },
    { onConflict: "tenant_id,user_id,role", ignoreDuplicates: true },
  );
  if (ins.error) throw new Error(ins.error.message);
}

/** A one-time link: invite for brand-new accounts, otherwise sign-in or reset. */
export async function linkFor(admin: SupabaseClient, email: string, origin: string, prefer: "invite" | "recovery") {
  if (prefer === "invite") {
    const inv = await admin.auth.admin.generateLink({ type: "invite", email });
    if (!inv.error && inv.data?.properties?.hashed_token) {
      return { userId: inv.data.user.id, url: setPasswordUrl(origin, inv.data.properties.hashed_token, "invite"), newAccount: true };
    }
  }
  // Already has an account (or resending): a reset link lets them set a password.
  const rec = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (rec.error || !rec.data?.properties?.hashed_token) throw new Error(rec.error?.message || "Couldn't create a sign-in link.");
  const neverSignedIn = !rec.data.user.last_sign_in_at;
  return {
    userId: rec.data.user.id,
    url: setPasswordUrl(origin, rec.data.properties.hashed_token, "recovery"),
    newAccount: neverSignedIn,
  };
}
