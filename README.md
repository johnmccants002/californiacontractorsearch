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

Requirements: Node.js 20.9 or newer and npm.

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
4. `search-contractors.ts` performs pagination and offers classification filtering.
5. `repository.ts` calls the paginated Supabase search RPC when configured and otherwise uses demo data.

PostgreSQL mirrors the important normalization rules and uses full-text and trigram GIN indexes. The repository hydrates only the page of license IDs returned by `search_license_ids_v2`, so searches do not load the statewide dataset into the application process.

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
