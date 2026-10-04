import type { Metadata } from "next";
import { SearchForm } from "@/components/search/search-form";
import { ResultCard } from "@/components/search/result-card";
import { Pagination } from "@/components/pagination";
import { searchContractors } from "@/lib/search/search-contractors";

export const metadata: Metadata = {
  title: "Search California Contractor Licenses",
  description: "Search demonstration California contractor license records by name, license number, trade, city, ZIP, or classification.",
  alternates: { canonical: "/search" },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = Number(params.page ?? "1");
  const data = await searchContractors(query, page);

  return (
    <div className="page-shell py-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <SearchForm defaultValue={query} compact />

        {!query ? (
          <section className="mt-14 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-950">Search California contractor licenses</h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">Enter a license number, business or personnel name, trade, classification, city, or ZIP code.</p>
          </section>
        ) : (
          <>
            <header className="mt-10 border-b border-slate-200 pb-5">
              <p className="text-sm font-semibold text-blue-800">{data.total} {data.total === 1 ? "result" : "results"}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Search results for “{query}”</h1>
              {data.source === "demo" ? <p className="mt-3 text-sm text-amber-800">Showing fictional demonstration records. Connect Supabase and load current public data before production use.</p> : null}
            </header>

            {data.results.length ? (
              <div className="mt-6 space-y-4">
                {data.results.map((result) => <ResultCard key={result.contractor.id} contractor={result.contractor} matchedBy={result.matchedBy} />)}
                <Pagination page={data.page} totalPages={data.totalPages} query={query} />
              </div>
            ) : (
              <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
                <h2 className="text-xl font-bold text-slate-950">No contractors matched your search.</h2>
                <p className="mt-3 text-slate-600">Try fewer words, a license number, a business name, a city, or a classification such as C-36.</p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
