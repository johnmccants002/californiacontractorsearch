import Link from "next/link";
import { SearchForm } from "@/components/search/search-form";
import { Sponsorship } from "@/components/sponsorship";
import { featuredClassifications, siteConfig } from "@/config/site";

export default function HomePage() {
  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="page-shell py-16 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-800">Public license record search</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-6xl">California Contractor Search</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Search California contractor licenses by name, license number, trade, or location.
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6">
            <SearchForm showExamples />
          </div>
          <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-slate-500">{siteConfig.disclaimer}</p>
        </div>
      </section>

      <div className="page-shell space-y-16 py-16">
        <section className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-blue-800">One search box</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Search California Contractors</h2>
          </div>
          <div className="space-y-4 text-base leading-7 text-slate-600">
            <p>
              Search license information using a business name, license number, associated individual, classification, city, or ZIP code. You can also combine terms, such as <span className="font-medium text-slate-900">plumbers Sacramento</span>.
            </p>
            <p>
              This initial release uses clearly labeled demonstration records while the CSLB public-data import is prepared.
            </p>
          </div>
        </section>

        <section aria-labelledby="browse-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-blue-800">California license types</p>
              <h2 id="browse-heading" className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Browse by classification</h2>
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featuredClassifications.map((classification) => (
              <Link key={classification.slug} href={`/classification/${classification.slug}`} className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md">
                <span>
                  <span className="block font-mono text-sm font-bold text-blue-800">{classification.code}</span>
                  <span className="mt-1 block font-semibold text-slate-900">{classification.name}</span>
                </span>
                <span aria-hidden="true" className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-blue-800">→</span>
              </Link>
            ))}
          </div>
        </section>

        <Sponsorship />
      </div>
    </>
  );
}
