import type { Metadata } from "next";
import Link from "next/link";
import { SearchControls } from "@/components/search/search-controls";
import { ResultCard } from "@/components/search/result-card";
import { Pagination } from "@/components/pagination";
import { searchContractors } from "@/lib/search/search-contractors";
import { getSearchClassifications } from "@/lib/contractors/repository";
import { clearFiltersHref, hasSearchFilters, LICENSE_STATUSES, normalizeFilters, readFilterParams, searchHref, SearchInputError, type SearchState } from "@/lib/search/filters";
import type { PaginatedResults, LicenseStatus } from "@/lib/contractors/types";

export const metadata: Metadata = {
  title: "Search California Contractor Licenses",
  description: "Search California contractor license records by name, license number, trade, city, ZIP, or classification.",
  alternates: { canonical: "/search" },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (name: string) => typeof params[name] === "string" ? params[name] as string : undefined;
  const query = one("q")?.trim() ?? "";
  const page = Number(one("page") ?? "1");
  const filters = readFilterParams(params);
  const catalog = await getSearchClassifications();
  let data: PaginatedResults | undefined;
  let error: string | undefined;
  let state: SearchState = { query, filters: { ...normalizeFilters(), ...filters,
    status: LICENSE_STATUSES.includes(filters.status as LicenseStatus) ? filters.status as LicenseStatus : "",
    sort: filters.sort === "name" ? "name" : "relevance",
  } };
  try {
    data = await searchContractors(query, page, 10, filters, catalog);
    state = data.state;
  } catch (cause) {
    if (!(cause instanceof SearchInputError)) throw cause;
    error = cause.message;
  }
  const hasSearch = Boolean(state.query || hasSearchFilters(state.filters));

  return (
    <div className="page-shell py-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <SearchControls key={`${searchHref(state)}:${error ?? ""}`} state={state} catalog={catalog} error={error} />

        {!hasSearch && !error ? (
          <section className="mt-14 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-950">Search California contractor licenses</h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">Enter a license number, business or personnel name, trade, classification, city, or ZIP code.</p>
          </section>
        ) : data ? (
          <>
            <header className="mt-10 border-b border-slate-200 pb-5">
              <p className="text-sm font-semibold text-blue-800">{data.total} {data.total === 1 ? "result" : "results"}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{state.query ? `Search results for “${state.query}”` : "Contractors matching your filters"}</h1>
              {data.interpretation ? <p className="mt-3 text-sm text-slate-600">Your search was converted into the editable filters above.</p> : null}
              {data.source === "demo" ? <p className="mt-3 text-sm text-amber-800">Showing fictional demonstration records. Connect Supabase and load current public data before production use.</p> : null}
            </header>

            {data.results.length ? (
              <div className="mt-6 space-y-4">
                {data.results.map((result) => <ResultCard key={result.contractor.id} contractor={result.contractor} matchedBy={result.matchedBy} />)}
                <Pagination page={data.page} totalPages={data.totalPages} state={state} />
              </div>
            ) : (
              <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
                <h2 className="text-xl font-bold text-slate-950">{data.total ? "This page is beyond the last result." : "No contractors matched your search."}</h2>
                <p className="mt-3 text-slate-600">{data.total ? "Return to the first page with your filters intact." : "Try fewer words or remove a filter to broaden your search."}</p>
                <Link href={data.total ? searchHref(state) : clearFiltersHref(state)} className="button-secondary mt-5">{data.total ? "Back to first page" : "Clear filters"}</Link>
              </section>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
