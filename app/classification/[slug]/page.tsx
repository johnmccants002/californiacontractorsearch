import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultCard } from "@/components/search/result-card";
import { Sponsorship } from "@/components/sponsorship";
import { findClassification } from "@/lib/contractors/demo-data";
import { getContractorsForClassification } from "@/lib/search/search-contractors";
import { displayClassificationCode } from "@/lib/search/normalize";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; city?: string; zip?: string; status?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const classification = findClassification(slug);
  if (!classification) return { title: "Classification not found" };
  const code = displayClassificationCode(classification.code);
  return {
    title: { absolute: `${code} ${classification.name.replace(" Contractor", "")}s in California | Contractor Search` },
    description: `Search ${code} ${classification.name.toLowerCase()} license records across California. Filter by business name, city, ZIP, and license status.`,
    alternates: { canonical: `/classification/${classification.slug}` },
  };
}

export default async function ClassificationPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const filters = await searchParams;
  const classification = findClassification(slug);
  if (!classification) notFound();
  const { contractors, source } = await getContractorsForClassification(classification.slug, filters);
  const code = displayClassificationCode(classification.code);

  return (
    <div className="page-shell py-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link href="/" className="hover:text-blue-900">Home</Link> <span aria-hidden="true">/</span> <span>{code}</span></nav>
        <header className="mt-6 max-w-3xl">
          <p className="font-mono text-sm font-bold text-blue-800">Classification {code}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{code} {classification.name.replace(" Contractor", "")}s in California</h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">{classification.description}</p>
          {source === "demo" ? <p className="mt-3 text-sm text-amber-800">Results below are fictional demonstration records.</p> : null}
        </header>

        <form className="mt-9 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" aria-label="Filter classification results">
          <label className="text-sm font-semibold text-slate-700">Business name<input type="search" name="q" defaultValue={filters.q} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100" /></label>
          <label className="text-sm font-semibold text-slate-700">City<input type="text" name="city" defaultValue={filters.city} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100" /></label>
          <label className="text-sm font-semibold text-slate-700">ZIP<input type="text" inputMode="numeric" name="zip" defaultValue={filters.zip} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100" /></label>
          <label className="text-sm font-semibold text-slate-700">Status<select name="status" defaultValue={filters.status ?? ""} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"><option value="">Any</option><option>ACTIVE</option><option>EXPIRED</option><option>INACTIVE</option><option>SUSPENDED</option></select></label>
          <button className="button-primary h-11 self-end">Filter</button>
        </form>

        <div className="mt-8 flex items-center justify-between"><h2 className="text-xl font-bold text-slate-950">{contractors.length} contractor{contractors.length === 1 ? "" : "s"}</h2></div>
        <div className="mt-5 space-y-4">
          {contractors.map((contractor) => <ResultCard key={contractor.id} contractor={contractor} />)}
          {!contractors.length ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">No contractors match these filters.</div> : null}
        </div>

        <div className="mt-12"><Sponsorship classification={code} /></div>
      </div>
    </div>
  );
}
