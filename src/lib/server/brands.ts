import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeBrands } from "@/lib/email/brand.js";

/**
 * Read one business's details (name, phone, licence, colours) so the emails and
 * texts built next carry ITS details, not EV Exec's. Safe to call with any
 * client that can see the row; if it cannot, the email gets blank details
 * (never another business's).
 */
export async function loadBrand(client: SupabaseClient, tenantId: string | null | undefined): Promise<void> {
  if (!tenantId) return;
  try {
    const { data } = await client
      .from("tenants")
      .select("id, name, contact_email, contact_phone, brand")
      .eq("id", tenantId)
      .maybeSingle();
    if (data) mergeBrands([data]);
  } catch { /* keep going with what we have */ }
}
