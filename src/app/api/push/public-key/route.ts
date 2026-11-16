import { createClient } from "@supabase/supabase-js";

// Returns the VAPID public key the browser needs to subscribe to push.
// The key isn't secret, but it lives in the locked push_config table, so we read
// it server-side with the service role.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return Response.json({ error: "Push isn't configured.", configured: false }, { status: 503 });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin
    .from("push_config")
    .select("vapid_public")
    .eq("id", true)
    .maybeSingle();
  if (error || !data?.vapid_public) {
    return Response.json({ error: "Push key not set.", configured: false }, { status: 503 });
  }
  return Response.json({ publicKey: data.vapid_public });
}
