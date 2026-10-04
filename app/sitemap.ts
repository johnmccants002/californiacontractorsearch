import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { demoContractors, classifications } from "@/lib/contractors/demo-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = ["", "/search"].map((path) => ({
    url: `${siteConfig.url}${path}`,
    lastModified: new Date("2026-09-28"),
    changeFrequency: path ? "weekly" : "daily",
    priority: path ? 0.7 : 1,
  }));
  const classificationPages: MetadataRoute.Sitemap = classifications.map((item) => ({
    url: `${siteConfig.url}/classification/${item.slug}`,
    lastModified: new Date("2026-09-28"),
    changeFrequency: "weekly",
    priority: 0.8,
  }));
  const licensePages: MetadataRoute.Sitemap = demoContractors.map((contractor) => ({
    url: `${siteConfig.url}/license/${contractor.licenseNumber}`,
    lastModified: new Date(contractor.sourceUpdatedAt),
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  return [...staticPages, ...classificationPages, ...licensePages];
}
