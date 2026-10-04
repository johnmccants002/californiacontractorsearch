# California Contractor Search

A fast, accessible search interface for publicly available California contractor license information. The MVP provides one search box for license numbers, business names, personnel, classifications, trades, cities, ZIP codes, and combined queries.

> California Contractor Search is an independent service and is not affiliated with the California Contractors State License Board (CSLB).

The repository ships with 32 fictional demonstration contractors. Do not treat demo records as verified license data.

## Project status

The initial application MVP is complete. Hosted Supabase deployment and verification are tracked in [issue #1](https://github.com/johnmccants002/californiacontractorsearch/issues/1).

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

`db reset` applies the migration and `supabase/seed.sql` to a local Supabase stack. For a hosted project, apply the migration first and run the seed SQL through the SQL editor only when demonstration data is appropriate.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
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
5. `repository.ts` selects Supabase when configured and otherwise uses demo data.

PostgreSQL mirrors the important normalization rules and includes GIN trigram indexes plus `search_license_ids`. For large production datasets, the repository adapter should call that function first and hydrate only the returned page of IDs rather than loading all rows for in-process ranking.

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

## Future CSLB Data Integration

The intended production source is CSLB public datasets or supported API access—not scraping CSLB search result pages.

A future importer should:

1. Download or read an authorized CSLB public data release.
2. Validate and normalize records while retaining all source values.
3. Upsert `licenses` by `license_number`.
4. Upsert classifications and associate personnel, bond, and workers-compensation records transactionally.
5. Set `source_updated_at` to the source release timestamp.
6. Record import counts, rejected rows, source checksums, and freshness monitoring.
7. Switch the search repository to page through `search_license_ids` for production-scale queries.

No scraping, user accounts, reviews, claims, lead generation, or paid placement is implemented in this MVP.
