// Settings → Payments: connect this business's own Stripe account.
//   GET  -> { configured, canManage, connected, ready, detailsSubmitted, requirementsDue }
//   POST -> { url }  a Stripe-hosted onboarding link (admins only)
// Design: evexec/docs/payments/stripe-connect-design.md. Server only; the
// platform key (STRIPE_PLATFORM_SECRET_KEY) never reaches the browser.
import { connectState, startOnboarding } from "@/lib/server/connectFlow";
import { ConnectError } from "@/lib/server/stripeConnect";
import { adminClient, appOrigin, getCaller, json } from "@/lib/server/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof ConnectError) return json({ error: e.message }, e.status);
  console.error("stripe-connect:", e);
  return json({ error: "Something went wrong." }, 500);
}

export async function GET(req: Request) {
  const admin = adminClient();
  if (!admin) return json({ error: "not configured" }, 503);
  const caller = await getCaller(req, admin);
  if (!caller) return json({ error: "Not authorised." }, 401);
  try { return json(await connectState(admin, caller)); } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) return json({ error: "not configured" }, 503);
  const caller = await getCaller(req, admin);
  if (!caller) return json({ error: "Not authorised." }, 401);
  const back = `${appOrigin(req)}/operator/settings?section=payments`;
  try { return json(await startOnboarding(admin, caller, { returnUrl: back, refreshUrl: back })); } catch (e) { return fail(e); }
}
