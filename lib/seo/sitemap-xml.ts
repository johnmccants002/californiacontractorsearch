import { siteConfig } from "@/config/site";
import { classifications } from "@/lib/contractors/demo-data";
import type { LicenseSitemapEntry, SitemapBounds } from "./sitemap-data";

const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
const namespace = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

export function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export function sitemapIndexXml(bounds: SitemapBounds | null): string {
  const urls = [`${siteConfig.url}/sitemaps/pages.xml`];
  if (bounds) {
    for (let shard = bounds.first; shard <= bounds.last; shard++) urls.push(`${siteConfig.url}/sitemaps/licenses-${shard}.xml`);
  }
  return `${declaration}<sitemapindex ${namespace}>${urls.map((url) => `<sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join("")}</sitemapindex>`;
}

export function pageSitemapXml(includeDirectory: boolean): string {
  // These are the real editorial classification pages supported by the route,
  // not the broader database catalog (which would include nonexistent pages).
  const paths = includeDirectory ? ["", ...classifications.map((item) => `/classification/${item.slug}`)] : [];
  return `${declaration}<urlset ${namespace}>${paths.map((path) => `<url><loc>${escapeXml(`${siteConfig.url}${path}`)}</loc></url>`).join("")}</urlset>`;
}

export function licenseSitemapXml(entries: LicenseSitemapEntry[]): string {
  return `${declaration}<urlset ${namespace}>${entries.map((entry) => `<url><loc>${escapeXml(`${siteConfig.url}/license/${entry.licenseNumber}`)}</loc>${entry.lastModified ? `<lastmod>${escapeXml(entry.lastModified)}</lastmod>` : ""}</url>`).join("")}</urlset>`;
}

export function xmlResponse(xml: string): Response {
  return new Response(xml, { headers: {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=3600",
    "X-Content-Type-Options": "nosniff",
  } });
}

export function sitemapUnavailable(): Response {
  // An outage must not publish an empty or demo sitemap as a healthy result.
  return new Response("Sitemap temporarily unavailable. Please retry later.", {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "300", "X-Robots-Tag": "noindex" },
  });
}
