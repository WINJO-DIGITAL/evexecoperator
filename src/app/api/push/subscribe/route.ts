import { adminClient, getCaller, json } from "@/lib/server/staff";

// Stores (or removes) an office staff member's browser push subscription.
// POST   { subscription, label } → upsert by endpoint (staff only)
// DELETE { endpoint }            → remove the caller's own device only
//
// The Operator app registers devices through the register_operator_push RPC
// (src/lib/operator/push.js); nothing calls this route today. It is kept, but
// limited to the same people as the RPC: before 15/10/2026 any signed-in
// account (including website customers) could add a device here and receive
// every office booking/payment alert, and DELETE removed anyone's device.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireStaff(req: Request) {
  const admin = adminClient();
  if (!admin) return null;
  const caller = await getCaller(req, admin);
  if (!caller) return null;
  return { admin, userId: caller.userId };
}

export async function POST(req: Request) {
  if (!adminClient()) return json({ error: "Push isn't configured." }, 503);
  const ctx = await requireStaff(req);
  if (!ctx) return json({ error: "Not authorised." }, 401);

  let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; label?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid body." }, 400); }

  const sub = body.subscription;
  const endpoint = sub?.endpoint?.trim();
  const p256dh = sub?.keys?.p256dh?.trim();
  const auth = sub?.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) return json({ error: "Invalid subscription." }, 422);

  const { error } = await ctx.admin
    .from("operator_push_subscriptions")
    .upsert(
      { endpoint, p256dh, auth, label: body.label ?? null, user_id: ctx.userId },
      { onConflict: "endpoint" }
    );
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!adminClient()) return json({ error: "Push isn't configured." }, 503);
  const ctx = await requireStaff(req);
  if (!ctx) return json({ error: "Not authorised." }, 401);
  let body: { endpoint?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid body." }, 400); }
  const endpoint = body.endpoint?.trim();
  if (!endpoint) return json({ error: "Missing endpoint." }, 400);
  await ctx.admin.from("operator_push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", ctx.userId);
  return json({ ok: true });
}
