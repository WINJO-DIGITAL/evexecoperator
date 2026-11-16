// Platform owner only (a super_admin): set up a new business and invite its
// first admin. Replaces the old `manage-tenants` Supabase function, which was in
// no repository, created a bare row (no settings, no price list) and sent the
// invite through Supabase's built-in mailer.
//
//   GET                                          -> { tenants: [{ ..., admins }] }
//   POST { action: "create", slug, name, contactEmail?, contactPhone? }
//                                                -> { tenant }  (public.provision_tenant:
//                                                   own settings, empty price list, SMS off)
//   POST { action: "invite", tenantId, email }   -> { email, emailed, emailError }
//                                                   (first admin; same branded
//                                                   set-password email as team invites;
//                                                   run again to resend)
//   POST { action: "members", tenantId }         -> { members: [{ email, role, pending }] }
//
// Every request is checked server-side: the caller must be a super_admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { teamInvite } from "@/lib/email/staff.js";
import { loadBrand } from "@/lib/server/brands";
import {
  adminClient, appOrigin, getSuperAdmin, isEmail, isUuid, json, linkFor, sendEmail, setRole, STAFF_ROLES,
} from "@/lib/server/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(req: Request) {
  const admin = adminClient();
  if (!admin) return { error: json({ error: "Platform management isn't set up (SUPABASE_SERVICE_ROLE_KEY is missing in Vercel)." }, 503) };
  const caller = await getSuperAdmin(req, admin);
  if (!caller) return { error: json({ error: "Only the platform owner can do this." }, 403) };
  return { admin, caller };
}

async function tenantById(admin: SupabaseClient, id: string) {
  const { data } = await admin.from("tenants").select("id, name, slug").eq("id", id).maybeSingle();
  return data as { id: string; name: string; slug: string } | null;
}

export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  try {
    const { data, error } = await g.admin
      .from("tenants")
      .select("id, slug, name, status, contact_email, contact_phone, created_at, brand")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: roles } = await g.admin.from("tenant_users").select("tenant_id").eq("role", "operator_admin");
    const admins = new Map<string, number>();
    for (const r of roles ?? []) if (r.tenant_id) admins.set(r.tenant_id, (admins.get(r.tenant_id) ?? 0) + 1);
    return json({
      tenants: (data ?? []).map(({ brand, ...t }) => ({
        ...t,
        // Only the website address, not the whole brand record.
        site_url: typeof brand?.site_url === "string" ? brand.site_url : "",
        admins: admins.get(t.id) ?? 0,
      })),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const { admin, caller } = g;
  let body: { action?: string; slug?: string; name?: string; contactEmail?: string; contactPhone?: string; tenantId?: string; email?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  try {
    if (body.action === "create") {
      const { data, error } = await admin.rpc("provision_tenant", {
        p_slug: String(body.slug ?? ""),
        p_name: String(body.name ?? ""),
        p_contact_email: body.contactEmail ? String(body.contactEmail) : null,
        p_contact_phone: body.contactPhone ? String(body.contactPhone) : null,
      });
      if (error) {
        if (error.code === "23505") return json({ error: "That short name is already taken. Choose another." }, 409);
        if (error.code === "22023") return json({ error: error.message }, 422);
        throw new Error(error.message);
      }
      return json({ ok: true, tenant: data });
    }

    if (body.action === "invite") {
      if (!isUuid(body.tenantId)) return json({ error: "Choose a business." }, 422);
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!isEmail(email) || email.length > 254) return json({ error: "Enter a valid email address." }, 422);
      const tenant = await tenantById(admin, body.tenantId);
      if (!tenant) return json({ error: "That business doesn't exist." }, 404);

      await loadBrand(admin, tenant.id);
      const link = await linkFor(admin, email, appOrigin(req), "invite");
      await setRole(admin, tenant.id, link.userId, "operator_admin");
      let emailed = true;
      let emailError: string | null = null;
      try {
        await sendEmail(email, teamInvite({
          tenant_id: tenant.id, businessName: tenant.name, inviterName: caller.name,
          role: "operator_admin", url: link.url, newAccount: link.newAccount,
        }), tenant.id);
      } catch (e) {
        emailed = false;
        emailError = (e as Error).message;
      }
      return json({ ok: true, email, emailed, emailError });
    }

    if (body.action === "members") {
      if (!isUuid(body.tenantId)) return json({ error: "Choose a business." }, 422);
      const { data, error } = await admin.from("tenant_users").select("user_id, role")
        .eq("tenant_id", body.tenantId).in("role", STAFF_ROLES as unknown as string[]);
      if (error) throw new Error(error.message);
      const members = await Promise.all((data ?? []).map(async (r) => {
        const { data: u } = await admin.auth.admin.getUserById(r.user_id);
        return { email: u?.user?.email ?? "", role: r.role as string, pending: !u?.user?.last_sign_in_at };
      }));
      return json({ ok: true, members });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
