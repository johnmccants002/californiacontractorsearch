import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultCard } from "@/components/search/result-card";
import { Sponsorship } from "@/components/sponsorship";
import { findClassification } from "@/lib/contractors/demo-data";
import { getContractorsForClassification } from "@/lib/search/search-contractors";
import { displayClassificationCode } from "@/lib/search/normalize";
import { getDatasetSource } from "@/lib/contractors/repository";
import { hasDirectoryQuery, type DirectorySearchParams } from "@/lib/seo/directory-pages";
import { TradeCityLinks } from "@/components/trade-city-links";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<DirectorySearchParams>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const classification = findClassification(slug);
  if (!classification) return { title: "Classification not found", robots: { index: false, follow: true } };
  const code = displayClassificationCode(classification.code);
  return {
    title: { absolute: `${code} ${classification.name.replace(" Contractor", "")} Contractors in California | Contractor Search` },
    description: `Search ${code} ${classification.name.toLowerCase()} license records across California. Filter by business name, city, ZIP, and license status.`,
    alternates: { canonical: `/classification/${classification.slug}` },
    robots: { index: !hasDirectoryQuery(await searchParams) && await getDatasetSource() === "cslb", follow: true },
  };
}

export default async function ClassificationPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const filters = Object.fromEntries(["q", "city", "zip", "status"].flatMap((key) => typeof query[key] === "string" ? [[key, query[key]]] : []));
  const classification = findClassification(slug);
  if (!classification) notFound();
  const { contractors, source } = await getContractorsForClassification(classification.slug, filters);
  const code = displayClassificationCode(classification.code);

  return <div className="page-shell inner-page">
    <nav aria-label="Breadcrumb" className="breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/#trades">Trade index</Link><span aria-hidden="true">/</span><span>{code}</span></nav>
    <header className="classification-header"><span className="classification-code" aria-hidden="true">{code}</span><div>
      <p className="eyebrow">CALIFORNIA LICENSE CLASSIFICATION / {code}</p>
      <h1 className="page-title">{classification.name.replace(" Contractor", "")} contractors in California</h1>
      <p className="page-intro">{classification.description}</p>
      {source === "demo" ? <p className="record-warning">Results below are fictional demonstration records.</p> : null}
    </div></header>

    <form className="classification-form" aria-label="Filter classification results">
      <label className="filter-label">Business name<input type="search" name="q" defaultValue={filters.q} className="field-input" /></label>
      <label className="filter-label">City<input type="text" name="city" defaultValue={filters.city} className="field-input" /></label>
      <label className="filter-label">ZIP<input type="text" inputMode="numeric" name="zip" defaultValue={filters.zip} className="field-input" /></label>
      <label className="filter-label">Status<select name="status" defaultValue={filters.status ?? ""} className="field-input"><option value="">Any</option><option>ACTIVE</option><option>EXPIRED</option><option>INACTIVE</option><option>SUSPENDED</option></select></label>
      <button className="button-primary self-end">Filter →</button>
    </form>
    <div className="results-heading"><h2>{contractors.length} contractor{contractors.length === 1 ? "" : "s"}</h2><p>Registered addresses, not service areas.<br />Verify current information with CSLB.</p></div>
    {contractors.length ? <div className="results-list">{contractors.map((contractor) => <ResultCard key={contractor.id} contractor={contractor} />)}</div> :
      <div className="empty-state"><p className="eyebrow">NO RECORDS TO DISPLAY</p><h2>No contractors match these filters.</h2><p>Try a broader location or remove a filter.</p><Link href={`/classification/${classification.slug}`} className="button-secondary">Clear filters</Link></div>
    }
    {source === "supabase" ? <TradeCityLinks classification={classification.code} /> : null}
    <div className="mt-12"><Sponsorship classification={code} /></div>
  </div>;
}
