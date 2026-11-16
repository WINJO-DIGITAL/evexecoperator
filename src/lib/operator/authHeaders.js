import { supabase } from "@/lib/supabase";

/** Authorization header for this app's own staff API routes (/api/team, /api/drivers). */
export async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { authorization: `Bearer ${session?.access_token ?? ""}` };
}
