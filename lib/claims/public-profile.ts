import "server-only";
import { createClient } from "@supabase/supabase-js";
import { claimsEnabled, userSupabaseConfig } from "./config";
import { PROFILE_FIELDS, type BusinessProfile } from "./validation";
export async function publicBusinessProfile(
  licenseId: number,
): Promise<BusinessProfile | null> {
  if (!claimsEnabled()) return null;
  try {
    const { url, key } = userSupabaseConfig();
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db
      .from("business_profiles")
      .select(PROFILE_FIELDS)
      .eq("license_id", licenseId)
      .abortSignal(AbortSignal.timeout(3000))
      .maybeSingle();
    return error ? null : (data as BusinessProfile | null);
  } catch {
    return null;
  } // Enrichment outages must not hide authoritative CSLB pages.
}
