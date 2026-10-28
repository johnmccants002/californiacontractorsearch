import Link from "next/link";
import { clearFiltersHref, LICENSE_STATUSES, removeFilterHref, type SearchState, type FilterInput } from "@/lib/search/filters";
import { displayClassificationCode } from "@/lib/search/normalize";
import type { SearchClassification } from "@/lib/search/trade-location";
import { FilterDisclosure } from "./filter-disclosure";
import { Arrow, SearchIcon } from "@/components/brand";
import { AutocompleteInput } from "./autocomplete-input";
import { typesenseEnabled } from "@/lib/typesense/config";
import { geoEnabled, hasGeoInput } from "@/lib/search/geo";

const fieldClass = "field-input";

export function SearchControls({ state, catalog, error, geoInput = {} }: { state: SearchState; catalog: SearchClassification[]; error?: string; geoInput?: FilterInput }) {
  const f = state.filters;
  const showGeo = (typesenseEnabled() && geoEnabled()) || Boolean(f.geo) || hasGeoInput(geoInput);
  const classification = catalog.find((c) => c.code === f.classification);
  const chips = [
    { key: "classification" as const, label: f.classification ? `${displayClassificationCode(f.classification)}${classification ? ` · ${classification.name.replace(/ Contractor$/, "")}` : ""}` : "" },
    { key: "city" as const, label: f.city ? `City: ${f.city}` : "" },
    { key: "county" as const, label: f.county ? `County: ${f.county}` : "" },
    { key: "zip" as const, label: f.zip ? `ZIP: ${f.zip}` : "" },
    { key: "status" as const, label: f.status ? `Status: ${f.status.toLowerCase()}` : "" },
    { key: "geo" as const, label: f.geo ? `${f.geo.radiusMiles ? `Within ${f.geo.radiusMiles} miles` : "Located records"} of ${f.geo.latitude}, ${f.geo.longitude}` : "" },
    { key: "sort" as const, label: f.sort === "name" ? "Sort: name A–Z" : f.sort === "distance" ? "Sort: nearest registered address" : "" },
  ].filter((chip) => chip.label);

  return (
    <div className={`search-controls${typesenseEnabled() || f.county ? " search-controls--typesense" : ""}`}>
      <form action="/search" role="search" aria-label="Search and filter contractor licenses">
        <label htmlFor="search-query" className="search-label">Search contractor licenses</label>
        <div className="search-bar search-bar-compact">
          <div className="search-input-wrap"><SearchIcon />
          <AutocompleteInput id="search-query" defaultValue={state.query} enabled={typesenseEnabled()} /></div>
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
          {typesenseEnabled() || f.county ? <label className="filter-label">Registered county
            <input name="county" defaultValue={f.county} placeholder="Any county" maxLength={80} className={fieldClass} />
          </label> : null}
          <label className="filter-label">License status
            <select name="status" defaultValue={f.status} className={fieldClass}><option value="">Any status</option>{LICENSE_STATUSES.map((status) => <option key={status} value={status}>{status[0] + status.slice(1).toLowerCase()}</option>)}</select>
          </label>
          <label className="filter-label">Sort by
            <select name="sort" defaultValue={f.sort} className={fieldClass}><option value="relevance">Relevance</option><option value="name">Name A–Z</option>{showGeo ? <option value="distance">Nearest registered address</option> : null}</select>
          </label>
          <button className="button-secondary self-end">Apply filters</button>
        </FilterDisclosure>
        {showGeo ? <details className="geo-controls" open={Boolean(f.geo) || hasGeoInput(geoInput)}>
          <summary>Search by distance from a location</summary>
          <p className="filter-help">Approximate straight-line distance to Census-matched registered mailing addresses—not confirmed service areas. Records without accepted coordinates are excluded.</p>
          <div className="geo-filter-fields">
            <label className="filter-label">Center latitude<input name="lat" type="number" min="-90" max="90" step="any" defaultValue={f.geo?.latitude ?? geoInput.lat ?? ""} placeholder="38.58" className={fieldClass} /></label>
            <label className="filter-label">Center longitude<input name="lng" type="number" min="-180" max="180" step="any" defaultValue={f.geo?.longitude ?? geoInput.lng ?? ""} placeholder="-121.49" className={fieldClass} /></label>
            <label className="filter-label">Radius (miles)<input name="radius" type="number" min="0.1" max="250" step="any" defaultValue={f.geo?.radiusMiles ?? geoInput.radius ?? ""} placeholder="Optional · up to 250" className={fieldClass} /></label>
            <button className="button-secondary self-end">Apply location</button>
          </div>
        </details> : null}
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
      <p className="filter-help">City, county, and ZIP refer to the registered business address, not service area. Filters apply across all matching records.</p>
    </div>
  );
}
