import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDatasetSource } from "@/lib/contractors/repository";
import { getLicenseSitemapEntries, getSitemapBounds } from "@/lib/seo/sitemap-data";
import { licenseSitemapXml, pageSitemapXml, sitemapUnavailable, xmlResponse } from "@/lib/seo/sitemap-xml";
import { getAvailableTradeCityPages } from "@/lib/seo/trade-city-data";
import { tradeCityPath } from "@/lib/seo/directory-pages";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const match = /^licenses-(0|[1-9]\d{0,8})\.xml$/.exec(name);
  if (name !== "pages.xml" && !match) return new Response("Not found", { status: 404 });
  try {
    if (name === "pages.xml") {
      const source = await getDatasetSource();
      if (source === "unavailable") return sitemapUnavailable();
      const pages = source === "cslb" ? await getAvailableTradeCityPages() : [];
      return xmlResponse(pageSitemapXml(source === "cslb", pages.map(tradeCityPath)));
    }
    const client = createServerSupabaseClient();
    if (!client) return new Response("Not found", { status: 404 });
    const shard = Number(match![1]);
    const bounds = await getSitemapBounds(client);
    if (!bounds || shard < bounds.first || shard > bounds.last) return new Response("Not found", { status: 404 });
    return xmlResponse(licenseSitemapXml(await getLicenseSitemapEntries(client, shard)));
  } catch {
    return sitemapUnavailable();
  }
}
