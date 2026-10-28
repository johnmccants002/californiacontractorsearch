import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultCard } from "@/components/search/result-card";
import { DatasetNotice } from "@/components/data-source";
import { TradeCityLinks } from "@/components/trade-city-links";
import { siteConfig } from "@/config/site";
import { displayClassificationCode } from "@/lib/search/normalize";
import { getTradeCityDirectory } from "@/lib/seo/trade-city-data";
import { hasDirectoryQuery, tradeCityPath, tradeCitySearchHref, type DirectorySearchParams } from "@/lib/seo/directory-pages";

// No loading.tsx or Suspense shell on these SEO landing pages: await records
// before rendering the body so their primary content is visible without JS.
export const dynamic = "force-dynamic";
type PageProps = {
  params: Promise<{ trade: string; city: string }>;
  searchParams: Promise<DirectorySearchParams>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { trade, city } = await params;
  const directory = await getTradeCityDirectory(trade, city);
  if (!directory) notFound();
  const { page } = directory;
  const title = `${page.tradeName} Contractors in ${page.cityName}, CA | Contractor Search`;
  const description = `Browse ${displayClassificationCode(page.classification)} ${page.tradeName.toLowerCase()} license records with registered addresses in ${page.cityName}, California. Compare records and verify current details with CSLB.`;
  return {
    title: { absolute: title }, description,
    alternates: { canonical: tradeCityPath(page) },
    robots: { index: !hasDirectoryQuery(await searchParams), follow: true },
    openGraph: { title, description, url: tradeCityPath(page), type: "website" },
  };
}

export default async function TradeCityDirectoryPage({ params }: PageProps) {
  const { trade, city } = await params;
  const directory = await getTradeCityDirectory(trade, city);
  if (!directory) notFound();
  const { page, contractors } = directory;
  const code = displayClassificationCode(page.classification);
  const title = `${page.tradeName} contractors in ${page.cityName}`;
  const canonical = `${siteConfig.url}${tradeCityPath(page)}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
        { "@type": "ListItem", position: 2, name: page.tradeName, item: `${siteConfig.url}/classification/${page.classification}` },
        { "@type": "ListItem", position: 3, name: page.cityName, item: canonical },
      ] },
      { "@type": "CollectionPage", "@id": canonical, url: canonical, name: title,
        mainEntity: { "@type": "ItemList", numberOfItems: contractors.length, itemListElement: contractors.map((contractor, index) => ({
          "@type": "ListItem", position: index + 1, name: contractor.businessName, url: `${siteConfig.url}/license/${contractor.licenseNumber}`,
        })) },
      },
    ],
  };
  return <div className="page-shell inner-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <nav aria-label="Breadcrumb" className="breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href={`/classification/${page.classification}`}>{page.tradeName}</Link><span aria-hidden="true">/</span><span>{page.cityName}</span></nav>
    <header className="classification-header trade-city-header"><span className="classification-code" aria-hidden="true">{code}</span><div>
      <p className="eyebrow">CALIFORNIA LICENSE RECORDS / {page.cityName}</p>
      <h1 className="page-title">{title}</h1>
      <p className="page-intro">Explore imported CSLB records carrying the {code} classification with registered business addresses in {page.cityName}, California. A registered address does not establish a contractor’s service area or availability.</p>
    </div></header>
    <DatasetNotice source="cslb" />
    <section className="directory-guide" aria-labelledby="directory-guide-heading">
      <h2 id="directory-guide-heading">Compare the record. Confirm the fit.</h2>
      <p>{page.comparisonTip}</p>
      <p>Open a license profile to review its classifications, recorded status, personnel, bond, and workers’ compensation information. Use its direct CSLB link to confirm current details before deciding whom to hire.</p>
    </section>
    <div className="results-heading"><div><p className="eyebrow">REGISTERED IN {page.cityName}, CA</p><h2>{contractors.length} license records shown</h2></div><p>A selection ordered by business name.<br />Includes recorded statuses other than active.</p></div>
    <div className="results-list">{contractors.map((contractor) => <ResultCard key={contractor.id} contractor={contractor} />)}</div>
    <div className="directory-actions"><Link href={tradeCitySearchHref(page)} className="button-primary">Search more {page.cityName} records →</Link><p>Use the full search to filter by status, ZIP, or business name and browse additional results. Search results use the registered city, which may also match addresses outside California.</p></div>
    <TradeCityLinks excludePath={tradeCityPath(page)} />
  </div>;
}
