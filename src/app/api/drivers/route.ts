// Driver App access for the business's drivers. Every action checks the
// caller is staff of the driver's business (service role, server-side).
//
//   GET                    -> { access: { [driverId]: { status, lastSignIn } } }
//                             status: "partner" | "none" | "invited" | "active"
//   POST { driverId }      -> create the driver's login (if needed) and email
//                             them a link to set their password in the Driver App
//
// The Driver App identifies a driver by drivers.id = their auth user id, so a
// new login is created with the driver row's own id. Trusted partners
// (drivers.kind = 'partner') never get a login or an invite.
import type { SupabaseClient } from "@supabase/supabase-js";
import { driverInvite } from "@/lib/email/staff.js";
import { loadBrand } from "@/lib/server/brands";
import { adminClient, getCaller, isEmail, json, sendEmail } from "@/lib/server/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Access = { status: "partner" | "none" | "invited" | "active"; lastSignIn: string | null };

/** Where the emailed link points: the Driver App's set-password screen. */
function driverAppOrigin() {
  return (process.env.DRIVER_APP_URL || process.env.NEXT_PUBLIC_DRIVER_APP_URL || "https://evexecdriverapp.vercel.app").replace(/\/$/, "");
}

function driverSetPasswordUrl(origin: string, hashedToken: string) {
  return `${origin}/reset-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&invite=1`;
}

async function guard(req: Request) {
  const admin = adminClient();
  if (!admin) return { error: json({ error: "Driver invites aren't set up (SUPABASE_SERVICE_ROLE_KEY is missing in Vercel)." }, 503) };
  const caller = await getCaller(req, admin);
  if (!caller) return { error: json({ error: "Not authorised." }, 401) };
  return { admin, caller };
}

async function accessFor(admin: SupabaseClient, d: { id: string; kind: string | null }): Promise<Access> {
  if (d.kind === "partner") return { status: "partner", lastSignIn: null };
  const { data } = await admin.auth.admin.getUserById(d.id);
  const user = data?.user;
  if (!user) return { status: "none", lastSignIn: null };
  return { status: user.last_sign_in_at ? "active" : "invited", lastSignIn: user.last_sign_in_at ?? null };
}

export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { data, error } = await g.admin.from("drivers").select("id, kind").eq("tenant_id", g.caller.tenantId);
  if (error) return json({ error: error.message }, 500);
  const entries = await Promise.all((data ?? []).map(async (d) => [d.id, await accessFor(g.admin, d)] as const));
  return json({ access: Object.fromEntries(entries) });
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, caller } = g;
  let body: { driverId?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const driverId = String(body.driverId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(driverId)) return json({ error: "Bad request." }, 400);

  const { data: d, error: dErr } = await admin
    .from("drivers").select("id, name, full_name, email, kind")
    .eq("id", driverId).eq("tenant_id", caller.tenantId).maybeSingle();
  if (dErr) return json({ error: dErr.message }, 500);
  if (!d) return json({ error: "That driver isn't in your fleet." }, 404);
  if (d.kind === "partner") return json({ error: "Trusted partners don't use the Driver App, so they aren't invited." }, 422);

  const email = String(d.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) return json({ error: "Add a valid email address for this driver first." }, 422);
  const name = String(d.name || d.full_name || "").trim();

  try {
    const { data: found } = await admin.auth.admin.getUserById(d.id);
    let user = found?.user ?? null;
    if (!user) {
      const { data: created, error } = await admin.auth.admin.createUser({
        id: d.id, email, email_confirm: true, user_metadata: name ? { full_name: name } : {},
      });
      if (error || !created?.user) {
        if (/already|registered|exists/i.test(error?.message ?? "")) {
          return json({ error: `${email} already has a login for something else (for example a customer account), so it can't be used for this driver. Use a different email address for them.` }, 409);
        }
        throw new Error(error?.message || "Couldn't create the login.");
      }
      user = created.user;
    } else if ((user.email ?? "").toLowerCase() !== email) {
      // The driver's email was changed on the Drivers screen: move their login too.
      const { error } = await admin.auth.admin.updateUserById(d.id, { email, email_confirm: true });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          return json({ error: `${email} already has a login for something else, so it can't be used for this driver.` }, 409);
        }
        throw new Error(error.message);
      }
    }

    const role = await admin.from("tenant_users").upsert(
      { tenant_id: caller.tenantId, user_id: d.id, role: "driver" },
      { onConflict: "tenant_id,user_id,role", ignoreDuplicates: true },
    );
    if (role.error) throw new Error(role.error.message);
    // The Driver App and customer emails read full_name; the Drivers screen writes name.
    if (!d.full_name && name) await admin.from("drivers").update({ full_name: name }).eq("id", d.id);

    const link = await admin.auth.admin.generateLink({ type: "recovery", email });
    const hashed = link.data?.properties?.hashed_token;
    if (link.error || !hashed) throw new Error(link.error?.message || "Couldn't create the sign-in link.");
    const url = driverSetPasswordUrl(driverAppOrigin(), hashed);

    await loadBrand(admin, caller.tenantId);
    let emailed = true;
    let emailError: string | null = null;
    try {
      await sendEmail(email, driverInvite({
        tenant_id: caller.tenantId, businessName: caller.tenantName, driverName: name, inviterName: caller.name, url, newAccount: !user.last_sign_in_at,
      }));
    } catch (e) {
      emailed = false;
      emailError = (e as Error).message;
    }
    return json({ ok: true, email, emailed, emailError });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
