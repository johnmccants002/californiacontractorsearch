import Link from "next/link";
import { clearFiltersHref, LICENSE_STATUSES, removeFilterHref, type SearchState } from "@/lib/search/filters";
import { displayClassificationCode } from "@/lib/search/normalize";
import type { SearchClassification } from "@/lib/search/trade-location";
import { FilterDisclosure } from "./filter-disclosure";

const fieldClass = "mt-2 h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base font-normal text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100";

export function SearchControls({ state, catalog, error }: { state: SearchState; catalog: SearchClassification[]; error?: string }) {
  const f = state.filters;
  const classification = catalog.find((c) => c.code === f.classification);
  const chips = [
    { key: "classification" as const, label: f.classification ? `${displayClassificationCode(f.classification)}${classification ? ` · ${classification.name.replace(/ Contractor$/, "")}` : ""}` : "" },
    { key: "city" as const, label: f.city ? `City: ${f.city}` : "" },
    { key: "zip" as const, label: f.zip ? `ZIP: ${f.zip}` : "" },
    { key: "status" as const, label: f.status ? `Status: ${f.status.toLowerCase()}` : "" },
    { key: "sort" as const, label: f.sort === "name" ? "Sort: name A–Z" : "" },
  ].filter((chip) => chip.label);

  return (
    <div>
      <form action="/search" role="search" aria-label="Search and filter contractor licenses">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="search-query" className="sr-only">Search contractor licenses</label>
          <input id="search-query" name="q" type="search" defaultValue={state.query} maxLength={200}
            placeholder="Name, license number, or a phrase like plumbers in Sacramento"
            className="h-12 min-w-0 rounded-xl border border-slate-300 bg-white px-4 text-base shadow-sm outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100 sm:flex-1" />
          <button className="button-primary h-12 shrink-0">Search</button>
        </div>
        <FilterDisclosure count={chips.filter((c) => c.key !== "sort").length}>
          <label className="min-w-0 text-sm font-semibold text-slate-700">Trade / classification
            <input name="classification" list="classification-options" defaultValue={displayClassificationCode(f.classification)}
              placeholder="Any trade · type to find" autoComplete="off" className={fieldClass} aria-describedby="classification-help" />
            <datalist id="classification-options">{catalog.map((c) => <option key={c.code} value={displayClassificationCode(c.code)}>{c.name} {c.aliases.join(", ")}</option>)}</datalist>
            <span id="classification-help" className="sr-only">Type a trade name or choose a classification code from the suggestions.</span>
          </label>
          <label className="min-w-0 text-sm font-semibold text-slate-700">Registered city
            <input name="city" defaultValue={f.city} placeholder="Any city" maxLength={80} className={fieldClass} />
          </label>
          <label className="min-w-0 text-sm font-semibold text-slate-700">ZIP code
            <input name="zip" defaultValue={f.zip} placeholder="Any ZIP" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} title="Enter a five-digit ZIP code" className={fieldClass} />
          </label>
          <label className="min-w-0 text-sm font-semibold text-slate-700">License status
            <select name="status" defaultValue={f.status} className={fieldClass}><option value="">Any status</option>{LICENSE_STATUSES.map((status) => <option key={status} value={status}>{status[0] + status.slice(1).toLowerCase()}</option>)}</select>
          </label>
          <label className="min-w-0 text-sm font-semibold text-slate-700">Sort by
            <select name="sort" defaultValue={f.sort} className={fieldClass}><option value="relevance">Relevance</option><option value="name">Name A–Z</option></select>
          </label>
          <button className="button-secondary h-11 self-end">Apply filters</button>
        </FilterDisclosure>
        {error ? <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
      </form>
      {chips.length ? (
        <nav aria-label="Applied filters" className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => <Link key={chip.key} href={removeFilterHref(state, chip.key)} aria-label={`Remove ${chip.label}`}
            className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 hover:bg-blue-100">
            <span className="break-words">{chip.label}</span><span aria-hidden="true">×</span>
          </Link>)}
          <Link href={clearFiltersHref(state)} className="px-2 py-3 text-sm font-medium text-slate-600 underline underline-offset-4">Clear filters</Link>
        </nav>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-slate-500">City and ZIP refer to the registered business address, not service area. Filters apply across all matching records.</p>
    </div>
  );
}
