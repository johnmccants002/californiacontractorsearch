-- Filter/count/sort the complete result set before pagination. Keep v2 intact
-- for clients deployed before this migration. No contractor data is modified.
-- For an already-live database, build these two indexes CONCURRENTLY as
-- separate statements before applying the function (avoids blocking writers).
create index if not exists licenses_filter_relevance_idx on public.licenses
  ((license_status = 'ACTIVE') desc, business_name_normalized, id) include (license_status);
create index if not exists licenses_filter_name_idx on public.licenses
  (business_name_normalized, id) include (license_status);

create or replace function public.search_license_ids_v3(
  search_query text default '', classification_filter text default '',
  city_filter text default '', zip_filter text default '',
  status_filter text default '', sort_order text default 'relevance',
  result_offset integer default 0, result_limit integer default 10
)
returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog
set statement_timeout = '15s'
as $function$
declare
  predicates text := '';
  candidates text := '';
  score_expression text;
  labels_expression text;
  statement text;
  answer jsonb;
  normalized_query text := public.normalize_search_text(coalesce(search_query, ''));
  class_code text := regexp_replace(lower(coalesce(classification_filter, '')), '[^a-z0-9]', '', 'g');
  city_value text := lower(trim(coalesce(city_filter, '')));
  zip_value text := trim(coalesce(zip_filter, ''));
  status_value text := upper(trim(coalesce(status_filter, '')));
  filter_terms tsquery;
begin
  if status_value not in ('', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'INACTIVE')
    or (zip_value <> '' and zip_value !~ '^[0-9]{5}$')
    or coalesce(sort_order, 'relevance') not in ('relevance', 'name') then
    raise exception 'Invalid search filter' using errcode = '22023';
  end if;
  if normalized_query = '' and class_code = '' and city_value = '' and zip_value = '' and status_value = '' then
    return jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  end if;

  -- Only fixed SQL fragments are concatenated. Every user value is bound using
  -- EXECUTE ... USING. Custom plans avoid unindexable optional-filter ORs and
  -- generic plans that scan the statewide table even for an exact license.
  if class_code <> '' then predicates := predicates || $sql$ and exists (
    select 1 from public.license_classifications lc join public.classifications c on c.id = lc.classification_id
    where lc.license_id = l.id and c.code = $2
  )$sql$; end if;
  if city_value <> '' then predicates := predicates || ' and lower(l.city) = $3'; end if;
  if zip_value <> '' then predicates := predicates || ' and l.zip like $4 || ''%'''; end if;
  if status_value <> '' then predicates := predicates || ' and l.license_status = $5'; end if;
  -- Narrow trade/location joins with the maintained GIN search index. The
  -- relational predicates above remain authoritative. ZIP prefix matches
  -- include both five-digit and ZIP+4 source values.
  if city_value <> '' then
    filter_terms := plainto_tsquery('simple'::regconfig, trim(class_code || ' ' || public.normalize_search_text(city_value)));
  end if;
  if zip_value <> '' then
    if filter_terms is null then filter_terms := to_tsquery('simple'::regconfig, zip_value || ':*');
    else filter_terms := filter_terms && to_tsquery('simple'::regconfig, zip_value || ':*'); end if;
  end if;
  if filter_terms is not null then predicates := predicates || ' and l.search_vector @@ $9'; end if;

  if normalized_query = '' then
    -- Count separately so a broad filter does not materialize labels/scores for
    -- hundreds of thousands of rows. Only the requested page is serialized.
    statement := $sql$
      select jsonb_build_object('total', (select count(*) from public.licenses l where true $sql$ || predicates || $sql$),
        'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'license_id', id, 'relevance_score', case when license_status = 'ACTIVE' then 10 else 0 end,
          'matched_by', array_remove(array[
            case when $2 <> '' then upper($2) || ' classification' end,
            case when $3 <> '' then 'city: ' || $3 end,
            case when $4 <> '' then 'ZIP: ' || $4 end,
            case when $5 <> '' then lower($5) || ' license' end
          ], null)
        ) order by case when $6 = 'relevance' then (license_status = 'ACTIVE') end desc, business_name_normalized, id)
        from (select l.id, l.license_status, l.business_name_normalized from public.licenses l where true $sql$ || predicates || $sql$
          order by case when $6 = 'relevance' then (l.license_status = 'ACTIVE') end desc,
            l.business_name_normalized, l.id offset $7 limit $8
        ) page), '[]'::jsonb))
    $sql$;
    execute statement into answer using normalized_query, class_code, city_value, zip_value, status_value,
      coalesce(sort_order, 'relevance'), greatest(coalesce(result_offset, 0), 0), least(greatest(coalesce(result_limit, 10), 1), 50), filter_terms;
    return answer;
  else
    candidates := $sql$
      with query as not materialized (
        select $1::text as normalized,
          regexp_replace($1, '\s', '', 'g') as compact,
          public.normalize_business_name($1) as business,
          websearch_to_tsquery('simple'::regconfig, $1) as terms
      ), direct_ids as materialized (
        select l.id from public.licenses l cross join query q where l.license_number = q.compact
        union
        select l.id from public.licenses l cross join query q where l.search_vector @@ q.terms
        union
        select l.id from public.licenses l cross join query q where l.business_name_normalized = q.business
        union
        select l.id from public.licenses l cross join query q where l.business_name_normalized like q.business || '%'
      ), candidate_ids as materialized (
        select id from direct_ids
        union
        select l.id from public.licenses l cross join query q
        where not exists (select 1 from direct_ids) and l.business_name_normalized OPERATOR(extensions.%) q.business
      ),
    $sql$;
    predicates := predicates || ' and l.id in (select id from candidate_ids)';
    score_expression := $sql$(
      case when l.license_number = q.compact then 1000 else 0 end +
      case when l.business_name_normalized = q.business then 800
           when l.business_name_normalized like q.business || '%' then 650 else 0 end +
      coalesce(extensions.similarity(l.business_name_normalized, q.business) * 400, 0) +
      coalesce(ts_rank_cd(l.search_vector, q.terms) * 500, 0) +
      case when lower(l.city) = q.normalized then 450 else 0 end +
      case when l.zip = q.compact then 500 else 0 end +
      case when l.license_status = 'ACTIVE' then 10 else 0 end
    )::double precision$sql$;
    labels_expression := $sql$array_remove(array[
      case when l.license_number = q.compact then 'exact license number' end,
      case when l.business_name_normalized = q.business then 'exact business name'
           when l.business_name_normalized like q.business || '%' then 'business name prefix'
           when l.business_name_normalized OPERATOR(extensions.%) q.business then 'similar business name' end,
      case when lower(l.city) = q.normalized then 'city' end,
      case when l.zip = q.compact then 'ZIP code' end,
      case when l.search_vector @@ q.terms then 'search terms' end
    ], null)::text[]$sql$;
  end if;

  statement := candidates || ' ranked as materialized (select l.id as license_id,
    l.business_name_normalized as business_name, ' || score_expression || ' as relevance_score, ' || labels_expression || $sql$ ||
    array_remove(array[
      case when $2 <> '' then upper($2) || ' classification' end,
      case when $3 <> '' then 'city: ' || $3 end,
      case when $4 <> '' then 'ZIP: ' || $4 end,
      case when $5 <> '' then lower($5) || ' license' end
    ], null)::text[] as matched_by from public.licenses l $sql$ ||
    case when normalized_query <> '' then ' cross join query q ' else '' end ||
    ' where true ' || predicates || $sql$
    ), page as (
      select * from ranked
      order by case when $6 = 'name' then business_name end asc,
        case when $6 = 'relevance' then relevance_score end desc,
        business_name asc, license_id asc
      offset $7 limit $8
    )
    select jsonb_build_object('total', (select count(*) from ranked),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'license_id', license_id, 'relevance_score', relevance_score, 'matched_by', matched_by
      ) order by case when $6 = 'name' then business_name end asc,
        case when $6 = 'relevance' then relevance_score end desc,
        business_name asc, license_id asc) from page), '[]'::jsonb)
    )
  $sql$;
  execute statement into answer using normalized_query, class_code, city_value, zip_value, status_value,
    coalesce(sort_order, 'relevance'), greatest(coalesce(result_offset, 0), 0), least(greatest(coalesce(result_limit, 10), 1), 50), filter_terms;
  return answer;
end;
$function$;

revoke execute on function public.search_license_ids_v3(text, text, text, text, text, text, integer, integer) from public;
grant execute on function public.search_license_ids_v3(text, text, text, text, text, text, integer, integer) to anon, authenticated, service_role;
