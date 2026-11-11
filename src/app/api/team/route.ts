// Team & roles for an operator business: list staff, invite (admin or
// dispatcher), change a role, resend an invite, remove. Every action checks
// the caller server-side; only an operator_admin (or super_admin) can change
// anything. Drivers are managed on the Drivers screen, not here.
//
//   GET                                   -> { members, canManage, me }
//   POST   { email, role }                -> invite / add
//   POST   { action: "resend", userId }   -> new set-password email
//   PATCH  { userId, role }               -> change role
//   DELETE { userId }                     -> remove from the team
import type { SupabaseClient } from "@supabase/supabase-js";
import { teamInvite } from "@/lib/email/staff.js";
import { loadBrand } from "@/lib/server/brands";
import {
  adminClient, appOrigin, getCaller, isEmail, json, sendEmail, setPasswordUrl, STAFF_ROLES, type Caller, type StaffRole,
} from "@/lib/server/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Member = { userId: string; email: string; name: string; role: StaffRole; joined: string | null; lastSignIn: string | null; pending: boolean };

async function listMembers(admin: SupabaseClient, tenantId: string): Promise<Member[]> {
  const { data, error } = await admin
    .from("tenant_users").select("user_id, role, created_at")
    .eq("tenant_id", tenantId).in("role", STAFF_ROLES as unknown as string[]);
  if (error) throw new Error(error.message);
  // One row per person (operator_admin wins if both are somehow present).
  const byUser = new Map<string, { role: StaffRole; created_at: string | null }>();
  for (const r of data ?? []) {
    const prev = byUser.get(r.user_id);
    if (!prev || r.role === "operator_admin") byUser.set(r.user_id, { role: r.role as StaffRole, created_at: r.created_at });
  }
  const members = await Promise.all([...byUser.entries()].map(async ([userId, r]) => {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const user = u?.user;
    const meta = (user?.user_metadata ?? {}) as Record<string, string>;
    return {
      userId, role: r.role, joined: r.created_at,
      email: user?.email ?? "",
      name: meta.full_name || meta.name || "",
      lastSignIn: user?.last_sign_in_at ?? null,
      pending: !user?.last_sign_in_at,
    };
  }));
  return members.sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "operator_admin" ? -1 : 1));
}

async function setRole(admin: SupabaseClient, tenantId: string, userId: string, role: StaffRole) {
  // A person has one staff role per business: replace any other.
  const others = STAFF_ROLES.filter((r) => r !== role) as unknown as string[];
  const del = await admin.from("tenant_users").delete().eq("tenant_id", tenantId).eq("user_id", userId).in("role", others);
  if (del.error) throw new Error(del.error.message);
  const ins = await admin.from("tenant_users").upsert(
    { tenant_id: tenantId, user_id: userId, role },
    { onConflict: "tenant_id,user_id,role", ignoreDuplicates: true },
  );
  if (ins.error) throw new Error(ins.error.message);
}

const adminCount = (members: Member[]) => members.filter((m) => m.role === "operator_admin").length;

async function guard(req: Request) {
  const admin = adminClient();
  if (!admin) return { error: json({ error: "Team management isn't set up (SUPABASE_SERVICE_ROLE_KEY is missing in Vercel)." }, 503) };
  const caller = await getCaller(req, admin);
  if (!caller) return { error: json({ error: "Not authorised." }, 401) };
  return { admin, caller };
}

const needAdmin = (caller: Caller) => (caller.isAdmin ? null : json({ error: "Only an admin can manage the team." }, 403));

export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  try {
    const members = await listMembers(g.admin, g.caller.tenantId);
    return json({ members, canManage: g.caller.isAdmin, me: g.caller.userId, business: g.caller.tenantName });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

/** A one-time link: invite for brand-new accounts, otherwise sign-in or reset. */
async function linkFor(admin: SupabaseClient, email: string, origin: string, prefer: "invite" | "recovery") {
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

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const denied = needAdmin(g.caller);
  if (denied) return denied;
  const { admin, caller } = g;
  let body: { action?: string; email?: string; role?: string; userId?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const origin = appOrigin(req);

  try {
    if (body.action === "resend") {
      const members = await listMembers(admin, caller.tenantId);
      const m = members.find((x) => x.userId === body.userId);
      if (!m) return json({ error: "That person isn't on your team." }, 404);
      await loadBrand(admin, caller.tenantId);
      const link = await linkFor(admin, m.email, origin, "recovery");
      await sendEmail(m.email, teamInvite({ tenant_id: caller.tenantId, businessName: caller.tenantName, inviterName: caller.name, role: m.role, url: link.url, newAccount: true }));
      return json({ ok: true, email: m.email });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const role = body.role as StaffRole;
    if (!isEmail(email) || email.length > 254) return json({ error: "Enter a valid email address." }, 422);
    if (!(STAFF_ROLES as readonly string[]).includes(role)) return json({ error: "Choose Admin or Dispatcher." }, 422);

    await loadBrand(admin, caller.tenantId);
    const link = await linkFor(admin, email, origin, "invite");
    if (link.userId === caller.userId) return json({ error: "You're already on the team." }, 422);
    await setRole(admin, caller.tenantId, link.userId, role);
    let emailed = true;
    let emailError: string | null = null;
    try {
      await sendEmail(email, teamInvite({ tenant_id: caller.tenantId, businessName: caller.tenantName, inviterName: caller.name, role, url: link.url, newAccount: link.newAccount }));
    } catch (e) {
      emailed = false;
      emailError = (e as Error).message;
    }
    return json({ ok: true, email, emailed, emailError });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export async function PATCH(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const denied = needAdmin(g.caller);
  if (denied) return denied;
  const { admin, caller } = g;
  let body: { userId?: string; role?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const role = body.role as StaffRole;
  if (!(STAFF_ROLES as readonly string[]).includes(role)) return json({ error: "Choose Admin or Dispatcher." }, 422);
  if (body.userId === caller.userId) return json({ error: "You can't change your own role." }, 422);
  try {
    const members = await listMembers(admin, caller.tenantId);
    const m = members.find((x) => x.userId === body.userId);
    if (!m) return json({ error: "That person isn't on your team." }, 404);
    if (m.role === "operator_admin" && role !== "operator_admin" && adminCount(members) <= 1) {
      return json({ error: "The team needs at least one admin." }, 422);
    }
    await setRole(admin, caller.tenantId, m.userId, role);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const denied = needAdmin(g.caller);
  if (denied) return denied;
  const { admin, caller } = g;
  let body: { userId?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (body.userId === caller.userId) return json({ error: "You can't remove yourself." }, 422);
  try {
    const members = await listMembers(admin, caller.tenantId);
    const m = members.find((x) => x.userId === body.userId);
    if (!m) return json({ error: "That person isn't on your team." }, 404);
    if (m.role === "operator_admin" && adminCount(members) <= 1) return json({ error: "The team needs at least one admin." }, 422);
    // Removes their office access only; their login (and any driver role) stays.
    const del = await admin.from("tenant_users").delete()
      .eq("tenant_id", caller.tenantId).eq("user_id", m.userId).in("role", STAFF_ROLES as unknown as string[]);
    if (del.error) throw new Error(del.error.message);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
