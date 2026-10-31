# California Contractor Search

A fast, accessible search interface for publicly available California contractor license information. The MVP provides one search box for license numbers, business names, personnel, classifications, trades, cities, ZIP codes, and combined queries.

> California Contractor Search is an independent service and is not affiliated with the California Contractors State License Board (CSLB).

The repository ships with 32 fictional fallback contractors for offline development. The hosted Supabase project uses official CSLB public-data files.

## Project status

The initial application MVP and statewide CSLB import pipeline are complete. The hosted project currently contains 243,757 licenses from the CSLB release updated October 3, 2026.

## Stack

- Next.js 16 App Router and React 19
- TypeScript
- Tailwind CSS 4
- Supabase/PostgreSQL
- PostgreSQL `pg_trgm` fuzzy search
- Vitest and ESLint

## Brand and interface

The interface combines architectural editorial typography with a technical public-record index. It is a license directory, not a contractor marketplace. The custom drafting-mark SVG is shared by the header and social image, with a matching SVG favicon.

- Tokens in `app/globals.css`: Blueprint Paper `#F2EFE6`, Iron `#1D292D`, Safety Orange `#D85C32`, Sage `#77867A`, and Concrete `#C7C1B2`. Primary actions use a deeper iron text token (`#10191C`) on orange for 4.67:1 contrast.
- Self-hosted Barlow Condensed (display), Manrope (interface), and IBM Plex Mono (record metadata), loaded with `next/font/local`. Browser font assets total about 49 KB; a separate server-only TTF renders the Open Graph image. OFL licenses are retained in `app/fonts`.
- Reusable brand, section-heading, search, record, filter, status, and sponsorship components; shared semantic CSS classes for dossier sections and fallback states.
- Native GET forms and server-rendered records remain the default. Only the mobile menu and filter disclosure need client interaction; both retain no-JavaScript access. There are no added runtime dependencies, tracking scripts, or external font requests.
- A skip link, visible keyboard focus, text-based status stamps, 44px primary controls, native mobile menu, and reduced-motion styles support accessible use.
- Indexed routes, canonical metadata, JSON-LD, sitemap generation, search ranking, pagination parameters, database access, and ad destinations are preserved. Less-common classifications without an editorial landing page link to the existing filtered search.

Redesign verification covered 360px/390px phones, a 768px tablet, 1280px laptop, and 1440px desktop; homepage name/license search, combined filters, removable chips, pagination, classification filters, dossier rendering, and keyboard navigation. Run the commands below for repeatable unit, type, lint, build, and read-only database checks. Field Core Web Vitals and cross-browser/device testing still require a deployed release.

## Local setup

Requirements: Node.js 22 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase variables, the app intentionally falls back to the in-repository fictional dataset.

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_CIS_URL=https://www.contractorsischool.com/
```

`SUPABASE_SERVICE_ROLE_KEY` is read only by server-side modules and must never be prefixed with `NEXT_PUBLIC_` or referenced from a client component. The server can use the anon key for public read-only access when the service role key is omitted.

## Supabase setup

The initial migration creates the relational schema, normalization triggers, public read policies, indexes, `pg_trgm`, and the `search_license_ids` ranking function.

With the Supabase CLI authenticated and the project linked:

```bash
npx supabase link --project-ref rymkuumshptqopwhwyrn
npx supabase db push
npx supabase db reset
```

`db reset` applies the migration and `supabase/seed.sql` to a local Supabase stack. For a hosted project, apply migrations first and run the seed SQL only when demonstration data is appropriate.

### Refresh official CSLB data

The importer downloads CSLB's three statewide CSV exports into the ignored `.data/cslb` directory, stages them, and finalizes the live tables in bounded batches. It requires `SUPABASE_SERVICE_ROLE_KEY` and must be run only by a project administrator.

```bash
npm run data:download
npm run data:import
```

If staging finished but finalization was interrupted, resume without uploading the CSV files again:

```bash
npm run data:finalize
```

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:integration
npm run data:download
npm run data:import
npm run data:finalize
```

## Architecture

```text
app/
  page.tsx                       homepage
  search/                        universal results and loading UI
  license/[licenseNumber]/       indexable license profile
  classification/[slug]/        classification landing page and filters
components/
  search/ license/               reusable search and record UI
config/site.ts                   URLs, brand text, sponsorship config
lib/
  contractors/                   data model, repository, demo adapter
  search/                        parsing, normalization, ranking, search service
  supabase/                      server-only Supabase client
supabase/
  migrations/                    schema, indexes, RLS, database search function
  seed.sql                       32 fictional records
```

Server Components are the default. Search and filters use URL query parameters and server rendering, so the core product does not require browser JavaScript.

Classification landing pages use a bounded public-read query to select at most 100 matching license IDs, then hydrate only those records. Filters are applied before the limit; city and numeric ZIP-prefix filters also use the existing search-vector index to narrow candidates. The returned selection is sorted by ID in the app, without requesting a global ID sort that can trigger slow primary-key scans for large cities. These non-paginated pages do not promise the lowest 100 IDs or calculate a statewide total. Database business-name normalization is preserved, and full record hydration retains every classification on each license. The legacy `classification_license_ids` RPC remains in the database for compatibility but is no longer called by the app: its unused window count can time out on broad trades. A route-level loading state provides immediate navigation feedback. No migration is required for this fix.

### Complimentary advertising

A compact, clearly labeled Pro-Builders Insurance Agency advertisement appears beneath the site header on every page. Its button opens [insureprobuilders.com](https://insureprobuilders.com/) in a new tab, preserving the current search. The destination is configured by `insuranceAdvertiserUrl` in `config/site.ts`; the banner is in `components/insurance-banner.tsx` and mounted once in the root layout.

This is complimentary placement, not an offer of free insurance. It does not affect search rankings, imply that listed contractors are insured by the advertiser, or replace the existing Contractors Intelligence School promotion. It adds no tracking scripts, pixels, remote assets, forms, cookies, or new dependencies.

## Search architecture

Search logic is kept out of page components:

1. `parse-query.ts` detects license number, ZIP, classification, or general text.
2. `normalize.ts` lowercases, removes punctuation, collapses whitespace, normalizes classification codes and initials, and removes common business prefixes/suffixes for comparison.
3. `rank-results.ts` assigns centralized weights: exact license, exact/prefix business name, exact personnel, classification, ZIP/city, trigram-like fuzzy similarity, term coverage, trade names, then active status.
4. `search-contractors.ts` performs pagination and supports explicit search filters.
5. `trade-location.ts` recognizes trade/classification + city/ZIP phrases using the database classification catalog.
6. `filters.ts` normalizes and validates explicit filters, resolves inferred filters, and builds shareable URLs. `database-search.ts` protects exact business-name matches, resolves implicit cities, and passes the resolved state to `search_license_ids_v3`.
7. `repository.ts` hydrates only the current results page. `demo-search.ts` applies the same intent rules to offline data.

PostgreSQL mirrors the important normalization rules and uses full-text and trigram GIN indexes. The repository hydrates only the current page of IDs, so searches do not load the statewide dataset into the application process. Structured searches use the GIN index as a candidate prefilter, then verify classification membership and exact city/ZIP fields.

### Search filters

The main search page supports trade/classification (searchable suggestions), registered city, five-digit ZIP, license status, and relevance or name A–Z sorting. Any status is the default; inactive records remain discoverable. Filters work with or without search text and apply before counting, sorting, and pagination. ZIP filters include ZIP+4 source values. City matching is case-insensitive and exact, not a service-area search.

Natural-language searches populate editable filters. Explicit selections take precedence. Removable chips and **Clear filters** reset pagination; removing an inferred chip does not infer it again from the original phrase. URLs preserve filters and sorting across pages. Mobile controls are collapsible; without JavaScript they remain visible.

Apply `20261026053344_add_filtered_contractor_search.sql` before deploying this UI. It adds two covering sort indexes and the read-only `search_license_ids_v3` function, leaves previous search functions intact, uses `SECURITY INVOKER` with a pinned search path, and grants execution to the existing public API roles. On a live database, build the two indexes with `CONCURRENTLY` in separate statements first, as noted in the migration. Contractor records and RLS policies are unchanged. If a migration was applied manually in the dashboard, reconcile the CLI migration history before a future `db push`.

Examples: `plumbers in Sacramento`, `C-36 Sacramento`, `demolition in El Cerrito`, `plumbers in 95814`. Optional `CA`/`California` suffixes and city + ZIP are supported. Explicit location searches stay empty when there are no matches; they never silently broaden into statewide fuzzy matches. Trade-first phrases without `in` require a known city, and exact contractor names retain precedence. `1 Demolition` and license `1082303` still use name/license search.

Location means **registered business location**, not service area. The baseline database search has no proximity search; opt-in Census/Typesense radius support is documented below. The nearby controls support city/ZIP reference points and permission-based device location. City misspelling correction, location-first phrases, and additional trade aliases are not included. Alias coverage is driven by `classifications.aliases`; imported codes without aliases still work as classification-code searches.

### User-friendly nearby search

With both `TYPESENSE_ENABLED=true` and `CENSUS_GEOCODING_ENABLED=true`, the search page offers a separate **Search near** section:

- Enter a California city/place or a mapped U.S. five-digit ZIP area, choose 10/25/50 miles or a custom radius (0.1–250 miles), and select **Find nearby**. This defaults to 25 miles and nearest-first sorting. The existing registered city/county/ZIP filters remain strict, additional constraints; choosing a center does not clear them.
- **Use my location** requests one browser location fix only after a click. Permission denial, unsupported browsers, unavailable positions, and timeouts leave city/ZIP entry available. An in-flight request cannot overwrite a subsequently edited or cleared center. The position is rounded to three decimal places and is not applied until the user submits. Coordinates appear in the search URL, which should not be shared if private. No location tracking, local storage, or application location logging is added.
- City/ZIP resolution uses the checked-in, server-only `data/locations/census-2025.json`: 1,619 California Census places and 33,791 U.S. ZIP Code Tabulation Areas (ZCTAs). These are **approximate area reference points**, not street addresses, USPS delivery boundaries, or contractor locations. Not every postal ZIP has a ZCTA. Unknown locations and duplicate place names require correction or a ZIP; the app never guesses or broadens the search. No runtime geocoding API, paid provider, new environment variable, migration, or index rebuild is required.
- City/ZIP and manual-coordinate controls use native GET form submissions. JavaScript adds device location and preset buttons. Existing latitude/longitude URLs remain valid through the optional coordinate controls. Friendly centers, radius, and sorting survive pagination, filter chips, and autocomplete. Search and autocomplete remain non-indexable; index outages fail closed for location constraints.

Examples: `/search?classification=c36&near=Sacramento&radius=25&sort=distance` and `/search?classification=c36&near=95814&radius=10&sort=distance`.

Reference data comes from the [2025 Census Gazetteer files](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/) using their `INTPTLAT` / `INTPTLONG` fields ([record layouts](https://www.census.gov/programs-surveys/geography/technical-documentation/records-layout/gaz-record-layouts/gaz25-record-layouts.html)). The generated file retains source URLs and SHA-256 hashes. To reproduce it, download `2025_gaz_place_06.txt` and `2025_Gaz_zcta_national.zip` from that directory into `.data/location-reference/`, then run `node scripts/build-location-reference.mjs` (requires `unzip`). These public reference points **never fill in missing or rejected contractor coordinates**. Contractor inclusion still requires the existing accepted Census address match and current address hash.

### Search verification

`npm test` is offline and checks parsing, routing, strict filters, name protection, ranking, and pagination. `npm run test:integration` is opt-in: it loads `.env.local` (or environment variables) and runs read-only queries against the real imported CSLB database with `NEXT_PUBLIC_SUPABASE_ANON_KEY`, never the service-role key. It fails if those public credentials are missing. Use a database with the official statewide import, not the fictional seed records.

The integration suite exercises the exact helper used in production, checks returned license classifications/cities/ZIPs/statuses, verifies `1 Demolition`/`1082303`, and tests explicit overrides, name sorting, deterministic pagination, empty searches, and non-active license discovery. It avoids hard-coding statewide counts so data refreshes do not require rewriting assertions.

## Optional Typesense search

Supabase remains the authoritative public-record store. Typesense 30.x holds a rebuildable search projection; profiles, classification pages, curated SEO directories, and sitemaps keep their database-backed rendering. `/search` and autocomplete responses remain non-indexable. The integration is **off by default** and does not deploy itself.

### Configuration and permissions

Use the server-only variables in `.env.example`: `TYPESENSE_ENABLED`, `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`, `TYPESENSE_COLLECTION`, and `TYPESENSE_SEARCH_API_KEY`. The host is a hostname without `https://` or a path. Remote connections require HTTPS. `TYPESENSE_COLLECTION` should be the stable `contractors` alias in production.

The Next.js application uses a collection-scoped key granting only `documents:search`. It never falls back to an admin key. Use `TYPESENSE_ADMIN_API_KEY` only in the indexing job, not in the Vercel web application's environment. No Typesense key should have a `NEXT_PUBLIC_` prefix. Keep the downloaded key export outside Git; do not paste keys into logs, command-line arguments, screenshots, or issue/PR descriptions.

The indexer deliberately reads Supabase with `NEXT_PUBLIC_SUPABASE_ANON_KEY`, never the service-role key. Only imported CSLB records are copied. Its explicit projection includes license identity, business/personnel names, classification terms/descriptions, registered city/county/state/ZIP, status, issue date, and source timestamp. It does not copy policy numbers, phone numbers, street addresses, bonds, or arbitrary future database columns into Typesense. The opt-in Census enrichment below adds accepted registered-address coordinates; it never infers service areas.

### Build, validate, then publish an index

Use a trusted long-running local/CI worker with access to the cluster and public Supabase API. Do not run the full import inside a Vercel request. Pause CSLB imports and ad-hoc record edits during a full build; this is an application-level consistency check, not a transactional database snapshot.

```sh
# Creates a versioned collection; does NOT change the search alias.
npm run search:index

# Resume the exact version printed by the first run.
npm run search:index -- --resume contractors_vTIMESTAMP

# Compare the completed version with the existing database search.
npm run search:benchmark -- --collection contractors_vTIMESTAMP

# Explicit publication, only after validation and benchmark review.
npm run search:index -- --resume contractors_vTIMESTAMP --publish
```

For local commands, a Typesense Cloud key export can instead be loaded into process memory with `--credentials-file /absolute/path/to/export.txt`. This does not save keys into the project or print their values. Environment variables are preferred for CI. The official Typesense client is pinned in the lockfile; Typesense 30 introduced synonym sets, so this indexer intentionally rejects incompatible server major versions.

Full builds read by primary-key cursor in bounded batches. The source checks avoid unindexed full-table timestamp sorts. Every bulk-import acknowledgement is validated, including failures returned inside an HTTP 200 response. Checkpoints advance only after a whole batch succeeds; replay uses stable database IDs and upserts. Checkpoints live in ignored `.data/typesense/` files and contain no credentials. A local lock prevents overlapping jobs from the same checkout; use a single CI writer as well. After an interrupted process, inspect the recorded PID before removing a stale lock.

Before a readiness marker is written, source/count checks must agree and the Typesense contractor count must equal the imported source count. The search adapter refuses an index without the matching readiness marker. Only `--publish` switches the alias. Retain the previous physical collection for rollback; the script never automatically deletes whole collections. Full rebuilds reconcile removed records by constructing the new collection only from current public records. Allow cluster memory for both old and new collections and check capacity before large rebuilds.

If Typesense rejects writes with `OUT_OF_MEMORY` (HTTP 422), stop and review cluster capacity. Do not raise memory-pressure thresholds or publish a partial index. Once capacity is available, resume the same version; a partly acknowledged batch is safely replayed. The checkpoint can be behind the cluster's actual document count after a failed or diagnostic batch, which is expected for idempotent upserts. Cluster plan changes and old-collection deletion require a separate operator decision.

### Incremental changes and refreshes

```sh
# Database IDs, NOT license numbers; up to 500 IDs per invocation.
npm run search:index -- --ids 123,456
```

This command resolves the current alias, re-reads the complete public projection for each supplied ID, and upserts it. A missing or no-longer-imported ID is removed from that search collection only. The command is idempotent and can be retried after a failed partial batch.

This is an explicit changed-ID synchronization strategy, not automatic change-data capture. Callers must include affected license IDs for personnel/classification edits, join removals, and license deletions. Polling only `licenses.updated_at` would miss related-table changes. After the existing bulk CSLB importer finishes **all** finalization phases, run a full Typesense build, benchmark, and explicit publication; never publish midway through its `reset_details`/repopulation phases. No webhook, scheduled job, or database trigger is installed by this change.

### Search behavior and fallback

License numbers use exact digit matching, never typo correction. Exact normalized business names receive an explicit ranking boost and retain precedence over trade/location interpretation. The existing deterministic parser handles classification codes, trade aliases, five-digit ZIPs, and trade/city phrases. Structured city, county, ZIP, classification and status constraints remain exact. Name/personnel search supports prefixes and controlled typo tolerance; query-token dropping is disabled to avoid unrelated fallback matches. Other text ranking is weighted relevance, not a guaranteed six-tier sort—evaluate the benchmark cases before tuning weights.

Typesense returns ranked IDs, then Supabase supplies the visible contractor records in that order. Highlights use only matched tokens and React-escaped text, never raw response HTML. Autocomplete is debounced, cancels stale requests, returns at most five minimal records, supports keyboard selection, and disappears quietly if unavailable. Native GET forms still work without JavaScript. Add Vercel Firewall/rate-limit protection for `/api/search/suggestions` before public rollout; browser debouncing is not an abuse-control mechanism.

`TYPESENSE_ENABLED=false` immediately selects the existing database backend (redeploy/restart when changing environment variables). With the flag on, configuration failures, timeouts, missing readiness markers, cutoff results, or missing hydrated records fall back to database search. Valid zero-result searches do not trigger broader fallback. The current database RPC has **no county filter**: a county-constrained search fails with an explicit retry/remove-filter message during an outage or while disabled, rather than silently dropping the constraint. Other existing filters retain the database fallback. A future county-aware database migration can remove this limitation; none is applied here.

### Verification and deployment

`npm test` covers query construction, exact-match protection, strict filters, failover, schema projection, import acknowledgements/count checks, safe highlighting, and the suggestion endpoint. `npm run test:integration` continues to verify the existing public Supabase search and SEO paths. `npm run search:benchmark -- --collection VERSION` runs live exact/prefix/typo/personnel/classification/location/status/empty-result cases, checks deterministic pagination and source counts, and writes `.data/typesense/benchmark.json`. It measures both implementations including profile hydration, alternates execution order, excludes warm-up, and reports p50/p95. These are local sequential measurements, not a production load test or a promise of speed/accuracy gains.

The October 27, 2026 local run validated all 243,757 imported licenses in `contractors_v1793162598266` (schema v1, not published). All 13 relevance cases and pagination checks passed. Across 36 comparable timed samples per backend, Typesense measured 225 ms p50 / 358 ms p95 versus database search at 401 ms p50 / 2,163 ms p95. Both ranked the reference contractor first for the tested license, name, prefix, typo and personnel cases; this small suite does not establish statewide relevance or production-load performance. The report is in the ignored `.data/typesense/benchmark.json`. Geographic coverage is not measured by this v1 benchmark.

For Vercel: validate the full index, review the benchmark, explicitly publish the alias, provision a collection-scoped search-only key (covering the alias and its managed versioned collections), then configure only the search variables in the intended deployment environment. Deploy initially with the flag off, check normal search, enable it in a preview, verify autocomplete/filtering and an outage, then explicitly enable production. The full-index admin key stays in the indexing worker. Search integration does not require purchasing the custom domain; the separate SEO/domain rollout remains a distinct deployment decision.

## Census registered-address geocoding (opt-in)

The Census service is used server-side at `https://geocoding.geo.census.gov/geocoder` with benchmark `Public_AR_Current`; no Census API key is needed. This is **enrichment**, not a replacement for CSLB. CSLB's imported address is a registered **mailing address**. Census coordinates are interpolated along address ranges, not verified rooftops, operational premises, or confirmed contractor service areas. See the [Census API](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html), [match-quality guide](https://www2.census.gov/geo/pdfs/maps-data/data/Census_Geocoder_User_Guide.pdf), and [Typesense geo-search documentation](https://typesense.org/docs/30.2/api/geosearch.html).

### Data and acceptance policy

Review `supabase/migrations/20261028045933_census_geocoding_enrichment.sql` and apply it through the project's normal reviewed migration process before running writes. It adds latitude/longitude, matched address, source, status, quality, benchmark, timestamp, and a versioned original-address SHA-256 hash to `licenses`. It does not replace the CSLB street/city/county/ZIP fields, alter public-read RLS, or expose a public write endpoint. The bounded `apply_census_geocodes` RPC is security-invoker and executable only by `service_role`.

The migration invalidates enrichment whenever any original address component changes (including CSLB imports). Each worker update also performs an atomic compare-and-set against its original address snapshot. Changed or deleted licenses are marked stale, not overwritten. Re-running the normal job finds changed hashes. Application/index mapping independently rechecks the hash, so stale coordinates cannot be trusted just because they remain in an index.

Batch `Match` + `Exact` results with valid coordinates are accepted automatically. `Non_Exact` matches are retained for review without searchable coordinates; `Tie` is ambiguous; `No_Match` is unmatched. Missing/invalid coordinate responses are rejected. PO boxes/private mailboxes, missing streets, non-structure addresses and unsupported regions are recorded as skipped without submitting them. No city/ZIP centroid or guessed point is substituted. The single-address JSON service is supported, but it does not report Exact/Non_Exact quality: its sole candidate is review-only, not silently treated as an Exact batch result.

### Initial import and recovery

Run on Node **22.13+** (tested on Node 24) in a trusted, long-lived worker. The worker uses Node's built-in SQLite API, which currently prints an experimental-feature notice. `CENSUS_STATE_DIR` defaults to the Git-ignored `.data/census/`. Keep this private directory on a durable local/CI volume; it contains address snapshots, the cross-job cache, batches, response CSVs and per-license progress. Protect/back up the whole directory, including SQLite WAL files, and do not upload it to Git or public logs. Only one worker should use it; the PID lock prevents same-directory overlap. Inspect the process before removing a stale lock.

```sh
# Before migration: public read only. No Census submissions or DB changes.
npm run geo:import -- --dry-run --limit 100

# AFTER migration approval: a small pilot (requires SUPABASE_SERVICE_ROLE_KEY).
npm run geo:import -- --run --limit 100

# Full initial job. Default 1,000 distinct addresses/request; maximum is 10,000.
npm run geo:import -- --run --batch-size 1000

# Interrupted network/request/database write: use the saved job UUID.
npm run geo:import -- --run --resume JOB_UUID

# After a completed CSLB import: skip unchanged processed addresses automatically.
npm run geo:import -- --run

# Explicitly reprocess unchanged/unmatched addresses against today's Current data.
npm run geo:import -- --run --refresh
```

Running `--run` submits public registered street/city/state/ZIP values to the U.S. Census Bureau; these may include home-based businesses. License/personnel names, keys, phone and insurance details are not sent. Census receives a hash ID; the durable item mapping retains each stable database license ID. Normalization is deliberately conservative (casing/spacing/punctuation); unit information is retained. The worker scans source IDs with a high-water cursor and deduplicates across the whole job, not just within each source page. Cache reuse is keyed by address, benchmark and acceptance-policy version. `--refresh` bypasses older cache entries because `Current` changes over time.

Census calls have timeouts and bounded retries for network errors, 408/429 and 5xx responses. Unexpected, duplicate or missing response IDs stop the batch; no partial CSV is accepted. Saved batches are replayable and writes are idempotent. A transient database failure stops cleanly for `--resume`. Addresses changed during a job are counted as stale; run a new normal job after source edits finish. Batches are not a transactional source snapshot, so do not overlap with the bulk CSLB importer. Never run the full pipeline inside a Vercel request, server action, or short-lived function.

### Typesense synchronization and location search

Keep `CENSUS_GEOCODING_ENABLED=false` until the migration, pilot and full geocoding import are validated. Existing ordinary searches work without this migration. With this flag true, the indexer reads accepted enrichment and builds **schema v2** with an optional `[latitude, longitude]` `location` geopoint and `has_location` facet. It never copies the source street address into Typesense. Existing schema-v1 collections remain valid for non-geographic search; radius/distance requests require a validated v2 index.

```sh
# Build a NEW geo-enabled version; do not resume an incompatible v1 checkpoint.
CENSUS_GEOCODING_ENABLED=true npm run search:index
# Benchmark/review, then explicitly publish the printed version when approved.
CENSUS_GEOCODING_ENABLED=true npm run search:index -- --resume contractors_vTIMESTAMP --publish

# Later jobs emit a JSON list of successfully updated DB IDs.
# Requires an already-published, ready v2 alias; processed in 500-ID chunks.
CENSUS_GEOCODING_ENABLED=true npm run search:index -- --ids-file .data/census/JOB_UUID-typesense-ids.json
```

Sync re-reads current source records, explicitly clears obsolete points, and removes deleted/unconfirmed IDs. After a bulk CSLB import, prefer a full rebuild: the geocoding job's changed-ID file does not include deletions performed by that importer. No automatic scheduled job, Typesense alias switch, plan change, or deployment is installed here. Reserve memory for current and replacement collections during rebuilds; never publish an incomplete index. Do not run geocoding writes during Typesense full-index validation.

Enable **both** `TYPESENSE_ENABLED=true` and `CENSUS_GEOCODING_ENABLED=true` in a preview only after a complete v2 index is ready. The existing design gains center-latitude/longitude and optional radius inputs (0.1–250 miles), plus nearest-registered-address sorting. Example: `/search?classification=c36&lat=38.58&lng=-121.49&radius=25&sort=distance`. City/county/ZIP remain exact CSLB registered-address filters and can be combined with radius. Radius uses straight-line distance, not driving distance. Unlocated records are excluded, and every visible location is rechecked against current Supabase data. The database backend cannot do radius/distance search: it returns an explicit unavailable/remove-filter message during an index outage rather than silently dropping geographic constraints.

Contractor profiles, curated SEO pages, metadata, canonicals and sitemaps retain their database-backed behavior. Arbitrary search query combinations remain non-indexable. Tests include CSV parsing/coordinate order, PO boxes, retries, deduplication, resumed jobs, changed addresses, geographic query constraints, and actual SQL execution/permissions in an isolated PGlite Postgres engine. This does not replace a reviewed staging/production migration and real-data coverage assessment.

## Database model

- `licenses`: one unique CSLB license number and preserved source facts
- `classifications`: normalized codes such as `c36`, metadata, and search aliases
- `license_classifications`: many-to-many relationship
- `personnel`: associated people and normalized names
- `bonds`: public bond facts
- `workers_comp`: policies or exemptions

Stable natural keys and unique constraints allow future imports to upsert records. `source_updated_at` records the source dataset timestamp separately from application timestamps.

## SEO and machine readability

The app includes canonical metadata, Open Graph defaults, dynamic license/classification titles, `robots.txt`, semantic fact sections, and `Organization`/`LocalBusiness` JSON-LD for imported records only.

### Source disclosure and verification

The homepage checks the connected dataset before describing its source. Imported profiles display **Source: CSLB public records**, a **Source record updated** date, and official verification links that open the matching license directly at `https://www.cslb.ca.gov/{licenseNumber}`. General navigation, demo or unconfirmed profiles, and missing or malformed license numbers retain the general CSLB lookup. The date comes from the export's `LastUpdate` field, not the import run or a live verification. Missing source dates remain explicitly unavailable.

Offline demo records and recognizable SQL seed records are labeled fictional, excluded from indexing, and never receive business JSON-LD. Rows without the importer's `source_status` provenance are marked unconfirmed and excluded from indexing. Imported records that reuse a demo license number are not excluded just because of that number. Database failures throw instead of substituting fictional profiles; license pages offer a retry and the official lookup. Search results are `noindex, follow` so filtered result URLs do not compete with canonical profiles.

### Curated trade and city directories

Five deliberately selected directories live at `/contractors/{trade}/{city}`: plumbing in Sacramento, electrical in Los Angeles, roofing in San Diego, general building in San Jose, and landscaping in Fresno. The allowlist and trade-specific comparison guidance are in `lib/seo/directory-pages.ts`; unsupported combinations return a 404, not automatically generated city pages.

Each page awaits a bounded public-data search on the server before rendering its body, without a loading/Suspense shell around its records. It shows up to 20 imported CSLB records with matching classifications and registered California city addresses, links to license profiles and the full filtered search, and explicitly distinguishes registered address from service area. Counts describe only the displayed selection, not the total number of contractors in the city. Demo, unconfirmed, and empty selections return a 404; database errors propagate instead of becoming successful empty pages. Metadata and page rendering share a request-scoped read. Collection and breadcrumb JSON-LD describe only visible content.

Only clean directory URLs are eligible for indexing. Any query parameters on classification or trade/city pages—including empty, repeated, tracking, and unknown parameters—produce `noindex, follow` with the clean page as canonical. `/search` remains `noindex, follow`. These paths stay crawlable so crawlers can read that instruction. Homepage and classification links expose the selected directories; the sitemap additionally checks each directory has matching imported records before listing it.

### Live sitemap

`/sitemap.xml` is a sitemap index, still advertised in `robots.txt`. It references `/sitemaps/pages.xml` (the homepage, supported classification pages, and populated curated trade/city directories) and `/sitemaps/licenses-N.xml` files containing imported contractor profiles. License files use stable, half-open 10,000-ID windows and ordered keyset pagination in at most 1,000-row requests. This avoids the API row cap and deep offsets, keeps every file below 50,000 URLs, and allows sparse ID windows without shifting other files. License sitemaps select only small sitemap fields; checking curated page availability reuses the bounded directory search. No database migration or elevated database permissions are needed.

Successful XML responses are eligible for one hour of shared-cache reuse. API failures return an uncached `503` with `Retry-After`, never a successful demo/partial sitemap. Demo mode publishes no contractor URLs; unknown or empty datasets do not advertise directory pages. License `lastmod` uses a valid source-record timestamp; no dates are fabricated for static pages. Tests cover short API pages, adjacent windows, source exclusions, failure responses, and read-only public-key access.

Before deployment, confirm the primary HTTPS hostname resolves and is connected to the deployment, and set `siteConfig.url` to that origin. Canonicals, structured data, robots, and sitemap URLs must all use that same reachable origin. After deployment, verify that property in Google Search Console, inspect a curated page's live rendered content and indexing eligibility, and submit `{primary-origin}/sitemap.xml`. Submission and indexing are separate external steps; a sitemap does not guarantee indexing.

## Repeatable CSLB refresh worker (activation required)

The source is the [official CSLB public downloads](https://www.cslb.ca.gov/OnlineServices/DataPortal/ContractorList), not scraped license-result pages. The three files have independent publication dates. `data:refresh` checks each date, downloads a stable release, validates headers, dates, row counts and exact cross-file joins, and saves immutable CSV hashes plus a normalized SQLite snapshot. A date-label change, malformed/incomplete file, entirely unrelated detail file, more than 10% row-count drop, or disappearance of more than 10% of existing source licenses stops processing for review **before source writes**. There is deliberately no bypass flag for those checks.

**Unmatched detail rows are quarantined, not imported or deleted.** The master is the only source of contractor identities. The downloaded personnel/insurance files can contain IDs outside that master (for example a newer personnel release or historical insurance record). These rows remain intact in the original CSVs and normalized SQLite tables, but `batch()` selects parent licenses only from the master and attaches details by exact license number. No approximate/zero-stripped joins or synthetic parent records are used. `manifest.json` seals the matched/quarantined row and distinct-license counts; `preparation-review.json` records those counts and any existing database licenses absent from the master. Console output contains aggregate counts, not names, addresses or policy numbers. Review these reports before activation. The reconciliation policy is part of the release key, so pre-policy manifests must be re-prepared rather than silently resumed under different rules.

### Review and activate

1. Review/apply `supabase/migrations/20261031054112_resumable_cslb_refresh.sql` and then `supabase/migrations/20261031072412_retain_missing_cslb_records.sql` through the normal migration process, first on staging. The original migration is unchanged. These add refresh metadata, private fingerprints/retention receipts, a private pending-index queue and bounded service-role-only security-invoker functions. Installation changes no existing contractor facts. Check Supabase security/performance advisors afterward. Public roles can read only aggregate freshness columns and the license warning date; they cannot read worker checkpoints/receipts or execute writers. **Deploy the warning-capable web code before enabling the worker**, so retained records are never presented without their warning. The web code tolerates the new nullable column being absent before migration; the worker requires the new migration before writing.
2. Use a trusted **Node 22.13+ long-lived worker with persistent private storage**, not a Vercel request/function. Keep `.data/refresh`, `.data/census` (including SQLite WAL files/cache), and `.data/maintenance.lock` on the same protected volume. Configure the existing Supabase URL/anon key, worker service-role key and Typesense host/port/protocol/admin key/alias. A healthy, already-published schema-v2 index is required. Preserve the Census cache so unchanged addresses are not unnecessarily resubmitted.
3. Run the read-only check, prepare a snapshot, review its counts and absence checks, then explicitly enable the worker and run that saved UUID. The first successful run establishes fingerprints for existing licenses; subsequent releases write only changed payloads. Stable license IDs are preserved. Test the visible profile, ordinary/nearby search and autocomplete after the first run before scheduling unattended writes.

```sh
# Public CSLB and public metadata reads only; no downloads or record writes.
npm run data:refresh -- --check

# Local downloads/SQLite only, plus public Supabase reads. No DB/index writes.
npm run data:refresh -- --prepare

# AFTER migration/snapshot review. Secrets stay on this worker, never NEXT_PUBLIC.
CSLB_REFRESH_ENABLED=true npm run data:refresh -- --run --resume PREPARED_UUID

# Later scheduled runs: detect a new release, or resume an unfinished saved run.
CSLB_REFRESH_ENABLED=true npm run data:refresh -- --run

# Explicit retry after an interruption: uses the same durable DB/local checkpoints.
CSLB_REFRESH_ENABLED=true npm run data:refresh -- --run --resume RUN_UUID
```

The existing `--credentials-file /absolute/path/to/typesense-export.txt` option loads keys only into the process. `TYPESENSE_FETCH_ADAPTER=true` optionally enables the local Typesense SDK fetch-adapter workaround. Neither flag nor the admin/service-role keys belongs in the Vercel web app for this feature. The website needs only its existing public Supabase read configuration to display freshness; failed/unavailable metadata reads do not break search.

### What completes a refresh

**Absent licenses are retained, not deleted or assigned a guessed status.** The prepared manifest pins the exact missing database IDs, and resume checks that membership has not changed. After all master records have been acknowledged, bounded batches record private retention receipts, set `licenses.source_missing_since` to the first missing master-file date, and queue those documents for index readback. All last-known details, IDs, dates, and coordinates are preserved. Search cards and profiles show “Not in latest CSLB download—verify with CSLB” and a neutral “Last known” status. Status filters still match that last-known value. Profile URLs/canonicals remain unchanged; retained profiles do not show a dataset-wide refresh date as if their record had been refreshed. Both search engines hydrate the warning from Supabase, so this needs no Typesense schema change or rebuild. Autocomplete has no status assertion and still opens the annotated profile.

When a license reappears, its normal source acknowledgement clears the warning—even when the payload fingerprint is identical to its last appearance—and queues verification without needlessly rewriting unchanged detail rows. SQL phase guards require exact current/retained counts and a receipt for every missing record. Final index count must equal **master licenses + retained licenses** (the audited October snapshot: 245,927 + 677 = 246,604, if source membership remains unchanged). An interrupted retention batch is safe to replay. Earlier manifests cannot be resumed under this new policy; preserve their CSVs/SQLite for audit and prepare a new reviewed snapshot instead of editing their key or fabricating a manifest.

Each batch atomically updates a license and its classifications/personnel/bonds/workers-compensation records, rebuilds database fallback search text, and records changed IDs. It never globally clears detail tables. The old `data:import`/`data:finalize` commands retain their initial-import behavior and are **not** this scheduled workflow. Those commands, the Census writer and the Typesense indexer now share a maintenance lock; do not run older code versions, external imports, or other writer hosts concurrently. This is a single-host coordinator, not a distributed lease.

Address changes invalidate old coordinates via the existing database trigger. The normal Census pipeline reuses unchanged address hashes/cache, processes new/changed addresses, and verifies saved source snapshots, hashes, exact coordinates/statuses and acknowledgements before indexing. PO boxes/unmatched/ambiguous records remain without coordinates. These are registered mailing locations, never confirmed service areas. Census receives only the already-documented public address fields.

The index phase drains a durable changed-ID queue into the **existing** ready geographic collection. Full-document upserts clear obsolete optional fields/points. Every document-level import result is checked; each batch is read back and compared to current Supabase projections before acknowledgment. The target physical index is pinned across retries: an alias change stops the job. Final contractor count and alias checks must pass before `completed_at` advances. No collection deletion, alias swap or hosting-plan change occurs.

Updates become visible per contractor as batches commit; this is not an all-records atomic release. During a failed/in-progress run, the UI says a refresh is pending validation and retains the last completed date. Index-dependent searches can temporarily lag database updates until synchronization; geographic results still revalidate coordinates during hydration. The “Data updated” date means the **last fully verified refresh**, not that CSLB verified every license that day. Separate source-file dates and the existing per-record `LastUpdate` remain visible. Before the first completed refresh, the label explicitly says “Date not yet verified.” Search URLs remain `noindex`.

### Scheduling and recovery

No recurring writer is enabled by committing/deploying this code. After the first reviewed end-to-end run, schedule `--run` daily on the same persistent worker (or use an approved Codex heartbeat tied to this chat). The command skips unchanged releases; unfinished jobs resume automatically from their saved UUID. Notify on a completed new release, failure, or needed decision; stay quiet on unchanged checks. A sleeping/offline desktop cannot run scheduled checks, so use an always-on worker if that guarantee is needed. Changing the worker host requires moving its protected state, not starting a second importer.

On failure, preserve all state. Network retries are bounded; rerun the same UUID after resolving the cause. Source batches have exact-replay protection for lost acknowledgements; retention receipts are idempotent; geocodes use compare-and-set; full-document index upserts are idempotent. Never manually mark a job complete, clear its queue, edit a saved snapshot or advance its cursor. Inspect a lock's recorded PID and actual process before removing only a confirmed stale lock; do not remove the state directories. Changed retention membership, excessive disappearances/inconsistent releases, stale geocoding acknowledgements, or an index alias change require a reviewed reconciliation rather than an automatic retry loop. To disable new scheduled writes, stop the schedule and leave `CSLB_REFRESH_ENABLED=false`; this does not undo already-committed source updates.

`npm test` covers release parsing, snapshot integrity, exact-join quarantine without data loss, malformed/unrelated data, retry/order behavior, index readback/outages, geocoding audits, worker exclusion and actual SQL transactions/permissions in isolated PGlite Postgres. Local fixture tests do not replace applying the migration on staging and reviewing a real prepared release. Running tests or deploying the web app does not apply migrations, refresh production records, or enable a recurring writer.

No scraping, user accounts, reviews, claims, lead generation, or paid placement is implemented in this MVP.
