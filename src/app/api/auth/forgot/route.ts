// "Forgot password?" on the operator sign-in screen. Emails a one-time link to
// /set-password, but only to people who are staff of a business; anyone else
// (unknown email, customers, drivers) gets the same reply and no email, so
// the form can't be used to find out who has an account.
import { passwordReset } from "@/lib/email/staff.js";
import { loadBrand } from "@/lib/server/brands";
import { adminClient, appOrigin, isEmail, json, sendEmail, setPasswordUrl, STAFF_ROLES } from "@/lib/server/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DONE = { ok: true, message: "If that email belongs to a team member, a reset link is on its way." };

export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) return json({ error: "Password reset isn't set up yet. Ask your admin." }, 503);
  let email = "";
  try { email = String((await req.json())?.email ?? "").trim().toLowerCase(); } catch { /* fall through */ }
  if (!isEmail(email) || email.length > 254) return json({ error: "Enter a valid email address." }, 422);

  try {
    const rec = await admin.auth.admin.generateLink({ type: "recovery", email });
    const user = rec.data?.user;
    const token = rec.data?.properties?.hashed_token;
    if (rec.error || !user || !token) return json(DONE);
    const { data: roles } = await admin.from("tenant_users").select("tenant_id, role").eq("user_id", user.id);
    const staff = (roles ?? []).find((r) => r.role === "super_admin" || (STAFF_ROLES as readonly string[]).includes(r.role));
    if (!staff) return json(DONE);
    const { data: tenant } = staff.tenant_id
      ? await admin.from("tenants").select("name").eq("id", staff.tenant_id).maybeSingle()
      : { data: null };
    await loadBrand(admin, staff.tenant_id);
    await sendEmail(email, passwordReset({ tenant_id: staff.tenant_id, businessName: tenant?.name || "your", url: setPasswordUrl(appOrigin(req), token, "recovery") }), staff.tenant_id);
  } catch (e) {
    console.error("[forgot-password]", (e as Error).message);
  }
  return json(DONE);
}
