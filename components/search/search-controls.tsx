import Link from "next/link";
import { clearFiltersHref, LICENSE_STATUSES, removeFilterHref, type SearchState } from "@/lib/search/filters";
import { displayClassificationCode } from "@/lib/search/normalize";
import type { SearchClassification } from "@/lib/search/trade-location";
import { FilterDisclosure } from "./filter-disclosure";
import { Arrow, SearchIcon } from "@/components/brand";

const fieldClass = "field-input";

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
    <div className="search-controls">
      <form action="/search" role="search" aria-label="Search and filter contractor licenses">
        <label htmlFor="search-query" className="search-label">Search contractor licenses</label>
        <div className="search-bar search-bar-compact">
          <span className="search-input-wrap"><SearchIcon />
          <input id="search-query" name="q" type="search" defaultValue={state.query} maxLength={200}
            placeholder="Name, license #, trade, or city" /></span>
          <button className="button-primary">Search <Arrow /></button>
        </div>
        <FilterDisclosure count={chips.filter((c) => c.key !== "sort").length}>
          <label className="filter-label">Trade / classification
            <input name="classification" list="classification-options" defaultValue={displayClassificationCode(f.classification)}
              placeholder="Any trade · type to find" autoComplete="off" className={fieldClass} aria-describedby="classification-help" />
            <datalist id="classification-options">{catalog.map((c) => <option key={c.code} value={displayClassificationCode(c.code)}>{c.name} {c.aliases.join(", ")}</option>)}</datalist>
            <span id="classification-help" className="sr-only">Type a trade name or choose a classification code from the suggestions.</span>
          </label>
          <label className="filter-label">Registered city
            <input name="city" defaultValue={f.city} placeholder="Any city" maxLength={80} className={fieldClass} />
          </label>
          <label className="filter-label">ZIP code
            <input name="zip" defaultValue={f.zip} placeholder="Any ZIP" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} title="Enter a five-digit ZIP code" className={fieldClass} />
          </label>
          <label className="filter-label">License status
            <select name="status" defaultValue={f.status} className={fieldClass}><option value="">Any status</option>{LICENSE_STATUSES.map((status) => <option key={status} value={status}>{status[0] + status.slice(1).toLowerCase()}</option>)}</select>
          </label>
          <label className="filter-label">Sort by
            <select name="sort" defaultValue={f.sort} className={fieldClass}><option value="relevance">Relevance</option><option value="name">Name A–Z</option></select>
          </label>
          <button className="button-secondary self-end">Apply filters</button>
        </FilterDisclosure>
        {error ? <p role="alert" className="form-error">{error}</p> : null}
      </form>
      {chips.length ? (
        <nav aria-label="Applied filters" className="filter-chips">
          {chips.map((chip) => <Link key={chip.key} href={removeFilterHref(state, chip.key)} aria-label={`Remove ${chip.label}`}
            className="filter-chip">
            <span className="break-words">{chip.label}</span><span aria-hidden="true">×</span>
          </Link>)}
          <Link href={clearFiltersHref(state)} className="filter-clear">Clear filters</Link>
        </nav>
      ) : null}
      <p className="filter-help">City and ZIP refer to the registered business address, not service area. Filters apply across all matching records.</p>
    </div>
  );
}
