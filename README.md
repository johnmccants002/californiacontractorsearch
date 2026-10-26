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

The app includes canonical metadata, Open Graph defaults, dynamic license/classification titles, `robots.txt`, `sitemap.xml`, semantic fact sections, deterministic summaries, source dates, and `Organization`/`LocalBusiness` JSON-LD using only stored facts.

## CSLB data refresh design

The production source is CSLB's public datasets—not scraped CSLB search result pages.

The importer:

1. Downloads the official license, personnel, and workers-compensation exports.
2. Validates minimum row counts before changing live records.
3. Stages normalized source values, then upserts licenses in resumable batches.
4. Rebuilds classifications, personnel, bonds, workers compensation, and search text.
5. Records the source release timestamp and clears staging only after verification succeeds.

No scraping, user accounts, reviews, claims, lead generation, or paid placement is implemented in this MVP.
