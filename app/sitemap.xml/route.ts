import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSitemapBounds } from "@/lib/seo/sitemap-data";
import { sitemapIndexXml, sitemapUnavailable, xmlResponse } from "@/lib/seo/sitemap-xml";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = createServerSupabaseClient();
    const bounds = client ? await getSitemapBounds(client) : null;
    return xmlResponse(sitemapIndexXml(bounds));
  } catch {
    return sitemapUnavailable();
  }
}
