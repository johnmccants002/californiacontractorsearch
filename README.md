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

Location means **registered business location**, not service area or proximity. Radius/“near me” search, city misspelling correction, location-first phrases, and additional trade aliases are not part of this release. Alias coverage is driven by `classifications.aliases`; imported codes without aliases still work as classification-code searches.

### Search verification

`npm test` is offline and checks parsing, routing, strict filters, name protection, ranking, and pagination. `npm run test:integration` is opt-in: it loads `.env.local` (or environment variables) and runs read-only queries against the real imported CSLB database with `NEXT_PUBLIC_SUPABASE_ANON_KEY`, never the service-role key. It fails if those public credentials are missing. Use a database with the official statewide import, not the fictional seed records.

The integration suite exercises the exact helper used in production, checks returned license classifications/cities/ZIPs/statuses, verifies `1 Demolition`/`1082303`, and tests explicit overrides, name sorting, deterministic pagination, empty searches, and non-active license discovery. It avoids hard-coding statewide counts so data refreshes do not require rewriting assertions.

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

### Live sitemap

`/sitemap.xml` is a sitemap index, still advertised in `robots.txt`. It references `/sitemaps/pages.xml` (the homepage and supported classification pages) and `/sitemaps/licenses-N.xml` files containing imported contractor profiles. License files use stable, half-open 10,000-ID windows and ordered keyset pagination in at most 1,000-row requests. This avoids the API row cap and deep offsets, keeps every file below 50,000 URLs, and allows sparse ID windows without shifting other files. Only the small sitemap fields are selected; profile joins are not loaded. No database migration or elevated database permissions are needed.

Successful XML responses are eligible for one hour of shared-cache reuse. API failures return an uncached `503` with `Retry-After`, never a successful demo/partial sitemap. Demo mode publishes no contractor URLs; unknown or empty datasets do not advertise directory pages. License `lastmod` uses a valid source-record timestamp; no dates are fabricated for static pages. Tests cover short API pages, adjacent windows, source exclusions, failure responses, and read-only public-key access.

After deployment, submit `https://californiacontractorsearch.com/sitemap.xml` to Google Search Console. Submission and indexing are separate external steps; a sitemap does not guarantee indexing.

## CSLB data refresh design

The production source is CSLB's public datasets—not scraped CSLB search result pages.

The importer:

1. Downloads the official license, personnel, and workers-compensation exports.
2. Validates minimum row counts before changing live records.
3. Stages normalized source values, then upserts licenses in resumable batches.
4. Rebuilds classifications, personnel, bonds, workers compensation, and search text.
5. Records the source release timestamp and clears staging only after verification succeeds.

No scraping, user accounts, reviews, claims, lead generation, or paid placement is implemented in this MVP.
