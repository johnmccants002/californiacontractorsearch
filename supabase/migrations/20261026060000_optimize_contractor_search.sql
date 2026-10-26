-- Build the candidate set with indexable predicates. A single OR containing a
-- raw similarity() threshold forced PostgreSQL to scan every statewide row.

create or replace function public.search_license_ids_v2(
  search_query text,
  result_offset integer default 0,
  result_limit integer default 10
)
returns table (
  license_id bigint,
  relevance_score double precision,
  total_count bigint,
  matched_by text[]
)
language sql
stable
set search_path = pg_catalog
set statement_timeout = '15s'
as $$
  with query as (
    select
      public.normalize_search_text(search_query) as normalized,
      regexp_replace(public.normalize_search_text(search_query), '\s', '', 'g') as compact,
      public.normalize_business_name(search_query) as business,
      websearch_to_tsquery('simple'::regconfig, public.normalize_search_text(search_query)) as terms
  ),
  direct_candidate_ids as materialized (
    select license.id as license_id
    from public.licenses license
    cross join query
    where query.normalized <> ''
      and license.license_number = query.compact

    union

    select license.id
    from public.licenses license
    cross join query
    where query.normalized <> ''
      and license.search_vector @@ query.terms

    union

    select license.id
    from public.licenses license
    cross join query
    where query.business <> ''
      and license.business_name_normalized = query.business

    union

    select license.id
    from public.licenses license
    cross join query
    where query.business <> ''
      and license.business_name_normalized like query.business || '%'
  ),
  fuzzy_candidate_ids as materialized (
    select license.id as license_id
    from public.licenses license
    cross join query
    where query.business <> ''
      and not exists (select 1 from direct_candidate_ids)
      and license.business_name_normalized OPERATOR(extensions.%) query.business
  ),
  candidate_ids as materialized (
    select direct_candidate_ids.license_id from direct_candidate_ids
    union
    select fuzzy_candidate_ids.license_id from fuzzy_candidate_ids
  ),
  ranked as (
    select
      license.id as license_id,
      (
        case when license.license_number = query.compact then 1000 else 0 end +
        case when license.business_name_normalized = query.business then 800
             when license.business_name_normalized like query.business || '%' then 650 else 0 end +
        coalesce(extensions.similarity(license.business_name_normalized, query.business) * 400, 0) +
        coalesce(ts_rank_cd(license.search_vector, query.terms) * 500, 0) +
        case when lower(license.city) = query.normalized then 450 else 0 end +
        case when license.zip = query.compact then 500 else 0 end +
        case when license.license_status = 'ACTIVE' then 10 else 0 end
      )::double precision as relevance_score,
      array_remove(array[
        case when license.license_number = query.compact then 'exact license number' end,
        case when license.business_name_normalized = query.business then 'exact business name'
             when license.business_name_normalized like query.business || '%' then 'business name prefix'
             when license.business_name_normalized OPERATOR(extensions.%) query.business then 'similar business name' end,
        case when lower(license.city) = query.normalized then 'city' end,
        case when license.zip = query.compact then 'ZIP code' end,
        case when license.search_vector @@ query.terms then 'search terms' end
      ], null)::text[] as matched_by
    from candidate_ids
    join public.licenses license on license.id = candidate_ids.license_id
    cross join query
  )
  select
    ranked.license_id,
    ranked.relevance_score,
    count(*) over () as total_count,
    ranked.matched_by
  from ranked
  order by ranked.relevance_score desc, ranked.license_id
  offset greatest(result_offset, 0)
  limit least(greatest(result_limit, 1), 50);
$$;

revoke execute on function public.search_license_ids_v2(text, integer, integer) from public;
grant execute on function public.search_license_ids_v2(text, integer, integer) to anon, authenticated;
