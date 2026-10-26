-- Staging and search support for CSLB's official statewide public-data files.

alter table public.licenses add column if not exists source_status text;
alter table public.licenses add column if not exists county text;
alter table public.licenses add column if not exists search_text text not null default '';
alter table public.licenses add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple'::regconfig, search_text)) stored;

create index if not exists licenses_search_vector_idx
  on public.licenses using gin (search_vector);

create table public.cslb_import_licenses (
  license_number text primary key,
  business_name text not null,
  license_status text not null check (license_status in ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'INACTIVE')),
  source_status text,
  issue_date date,
  expiration_date date,
  address_line_1 text,
  city text,
  state text,
  county text,
  zip text,
  phone text,
  entity_type text,
  source_updated_at timestamptz,
  classifications text[] not null default '{}',
  wc_coverage_type text,
  wc_carrier text,
  wc_policy_number text,
  wc_effective_date date,
  wc_expiration_date date,
  cb_company text,
  cb_number text,
  cb_amount numeric(12, 2),
  cb_effective_date date,
  cb_cancellation_date date,
  wb_company text,
  wb_number text,
  wb_amount numeric(12, 2),
  wb_effective_date date,
  wb_cancellation_date date,
  db_company text,
  db_number text,
  db_amount numeric(12, 2),
  db_effective_date date,
  db_cancellation_date date
);

create table public.cslb_import_personnel (
  license_number text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  full_name text not null,
  role text,
  association_date date,
  disassociation_date date,
  source_updated_at timestamptz
);

create index cslb_import_personnel_license_idx
  on public.cslb_import_personnel (license_number);

create table public.cslb_import_workers_comp (
  license_number text not null,
  coverage_type text,
  carrier text,
  policy_number text,
  effective_date date,
  expiration_date date,
  cancellation_date date,
  source_updated_at timestamptz
);

create index cslb_import_workers_comp_license_idx
  on public.cslb_import_workers_comp (license_number);

alter table public.cslb_import_licenses enable row level security;
alter table public.cslb_import_personnel enable row level security;
alter table public.cslb_import_workers_comp enable row level security;

revoke all on table
  public.cslb_import_licenses,
  public.cslb_import_personnel,
  public.cslb_import_workers_comp
from anon, authenticated;

grant select, insert, update, delete, truncate on table
  public.cslb_import_licenses,
  public.cslb_import_personnel,
  public.cslb_import_workers_comp
to service_role;

insert into public.classifications (code, name, slug, description, aliases) values
  ('c21', 'Building Moving/Demolition Contractor', 'c21', 'A Building Moving/Demolition contractor moves or demolishes structures and related improvements.', array['demolition', 'building moving', 'demolition contractor']),
  ('d06', 'Concrete Related Services Contractor', 'd06', 'A limited specialty classification for concrete-related services.', array['concrete related services', 'concrete']),
  ('d56', 'Trenching Only Contractor', 'd56', 'A limited specialty classification for trenching work.', array['trenching', 'trencher'])
on conflict (code) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  aliases = excluded.aliases;

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
as $$
  with query as (
    select
      public.normalize_search_text(search_query) as normalized,
      regexp_replace(public.normalize_search_text(search_query), '\s', '', 'g') as compact,
      public.normalize_business_name(search_query) as business,
      websearch_to_tsquery('simple'::regconfig, public.normalize_search_text(search_query)) as terms
  ),
  ranked as (
    select
      l.id as license_id,
      (
        case when l.license_number = q.compact then 1000 else 0 end +
        case when l.business_name_normalized = q.business then 800
             when l.business_name_normalized like q.business || '%' then 650 else 0 end +
        coalesce(extensions.similarity(l.business_name_normalized, q.business) * 400, 0) +
        coalesce(ts_rank_cd(l.search_vector, q.terms) * 500, 0) +
        case when lower(l.city) = q.normalized then 450 else 0 end +
        case when l.zip = q.compact then 500 else 0 end +
        case when l.license_status = 'ACTIVE' then 10 else 0 end
      )::double precision as relevance_score,
      array_remove(array[
        case when l.license_number = q.compact then 'exact license number' end,
        case when l.business_name_normalized = q.business then 'exact business name'
             when l.business_name_normalized like q.business || '%' then 'business name prefix'
             when extensions.similarity(l.business_name_normalized, q.business) >= 0.25 then 'similar business name' end,
        case when lower(l.city) = q.normalized then 'city' end,
        case when l.zip = q.compact then 'ZIP code' end,
        case when l.search_vector @@ q.terms then 'search terms' end
      ], null)::text[] as matched_by
    from public.licenses l
    cross join query q
    where q.normalized <> '' and (
      l.license_number = q.compact
      or l.search_vector @@ q.terms
      or extensions.similarity(l.business_name_normalized, q.business) >= 0.25
    )
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

create or replace function public.classification_license_ids(
  classification_slug text,
  business_query text default null,
  city_filter text default null,
  zip_filter text default null,
  status_filter text default null,
  result_limit integer default 100
)
returns table (license_id bigint, total_count bigint)
language sql
stable
set search_path = pg_catalog
as $$
  with filtered as (
    select distinct l.id as license_id
    from public.licenses l
    join public.license_classifications lc on lc.license_id = l.id
    join public.classifications c on c.id = lc.classification_id
    where c.slug = classification_slug
      and (nullif(trim(business_query), '') is null or l.business_name_normalized like '%' || public.normalize_business_name(business_query) || '%')
      and (nullif(trim(city_filter), '') is null or lower(l.city) = lower(trim(city_filter)))
      and (nullif(trim(zip_filter), '') is null or l.zip like trim(zip_filter) || '%')
      and (nullif(trim(status_filter), '') is null or l.license_status = upper(trim(status_filter)))
  )
  select filtered.license_id, count(*) over () as total_count
  from filtered
  order by filtered.license_id
  limit least(greatest(result_limit, 1), 100);
$$;

create or replace function public.finalize_cslb_import()
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
set statement_timeout = '15min'
as $$
declare
  staged_license_count bigint;
  staged_personnel_count bigint;
  staged_workers_comp_count bigint;
  result jsonb;
begin
  select count(*) into staged_license_count from public.cslb_import_licenses;
  select count(*) into staged_personnel_count from public.cslb_import_personnel;
  select count(*) into staged_workers_comp_count from public.cslb_import_workers_comp;

  if staged_license_count < 200000 or staged_personnel_count < 300000 or staged_workers_comp_count < 150000 then
    raise exception 'CSLB import is incomplete: licenses %, personnel %, workers comp %',
      staged_license_count, staged_personnel_count, staged_workers_comp_count;
  end if;

  insert into public.classifications (code, name, slug, description, aliases)
  select distinct class_code.value, upper(class_code.value) || ' Contractor', class_code.value, '', '{}'::text[]
  from public.cslb_import_licenses source
  cross join lateral unnest(source.classifications) as class_code(value)
  where class_code.value <> ''
  on conflict (code) do nothing;

  insert into public.licenses (
    license_number,
    business_name,
    license_status,
    license_type,
    issue_date,
    expiration_date,
    address_line_1,
    city,
    state,
    county,
    zip,
    phone,
    entity_type,
    source_status,
    source_updated_at
  )
  select
    license_number,
    business_name,
    license_status,
    'Contractor',
    issue_date,
    expiration_date,
    address_line_1,
    city,
    coalesce(nullif(state, ''), 'CA'),
    county,
    zip,
    phone,
    entity_type,
    source_status,
    source_updated_at
  from public.cslb_import_licenses
  on conflict (license_number) do update set
    business_name = excluded.business_name,
    license_status = excluded.license_status,
    issue_date = excluded.issue_date,
    expiration_date = excluded.expiration_date,
    address_line_1 = excluded.address_line_1,
    city = excluded.city,
    state = excluded.state,
    county = excluded.county,
    zip = excluded.zip,
    phone = excluded.phone,
    entity_type = excluded.entity_type,
    source_status = excluded.source_status,
    source_updated_at = excluded.source_updated_at;

  delete from public.licenses target
  where not exists (
    select 1 from public.cslb_import_licenses source
    where source.license_number = target.license_number
  );

  delete from public.license_classifications where id is not null;
  insert into public.license_classifications (license_id, classification_id)
  select distinct l.id, c.id
  from public.cslb_import_licenses source
  join public.licenses l on l.license_number = source.license_number
  cross join lateral unnest(source.classifications) as class_code(value)
  join public.classifications c on c.code = class_code.value
  on conflict do nothing;

  delete from public.personnel where id is not null;
  insert into public.personnel (
    license_id,
    first_name,
    middle_name,
    last_name,
    full_name,
    role,
    association_date,
    disassociation_date
  )
  select
    l.id,
    source.first_name,
    source.middle_name,
    source.last_name,
    source.full_name,
    source.role,
    source.association_date,
    source.disassociation_date
  from public.cslb_import_personnel source
  join public.licenses l on l.license_number = source.license_number
  where source.full_name <> '';

  delete from public.bonds where id is not null;
  insert into public.bonds (
    license_id,
    bond_type,
    bond_company,
    bond_number,
    bond_amount,
    effective_date,
    cancellation_date
  )
  select l.id, bond.bond_type, bond.company, bond.number, bond.amount, bond.effective_date, bond.cancellation_date
  from public.cslb_import_licenses source
  join public.licenses l on l.license_number = source.license_number
  cross join lateral (
    values
      ('Contractor Bond'::text, source.cb_company, source.cb_number, source.cb_amount, source.cb_effective_date, source.cb_cancellation_date),
      ('Workers Bond'::text, source.wb_company, source.wb_number, source.wb_amount, source.wb_effective_date, source.wb_cancellation_date),
      ('Disciplinary Bond'::text, source.db_company, source.db_number, source.db_amount, source.db_effective_date, source.db_cancellation_date)
  ) as bond(bond_type, company, number, amount, effective_date, cancellation_date)
  where nullif(trim(bond.number), '') is not null
  on conflict do nothing;

  delete from public.workers_comp where id is not null;
  insert into public.workers_comp (
    license_id,
    carrier,
    policy_number,
    effective_date,
    expiration_date,
    exemption
  )
  select
    l.id,
    nullif(trim(source.carrier), ''),
    nullif(trim(source.policy_number), ''),
    source.effective_date,
    source.expiration_date,
    lower(coalesce(source.coverage_type, '')) like '%exempt%'
  from public.cslb_import_workers_comp source
  join public.licenses l on l.license_number = source.license_number
  union all
  select
    l.id,
    nullif(trim(source.wc_carrier), ''),
    nullif(trim(source.wc_policy_number), ''),
    source.wc_effective_date,
    source.wc_expiration_date,
    lower(coalesce(source.wc_coverage_type, '')) like '%exempt%'
  from public.cslb_import_licenses source
  join public.licenses l on l.license_number = source.license_number
  where nullif(trim(source.wc_coverage_type), '') is not null
    and not exists (
      select 1 from public.cslb_import_workers_comp wc
      where wc.license_number = source.license_number
    );

  with personnel_search as (
    select license_id, string_agg(full_name, ' ') as names
    from public.personnel
    group by license_id
  ),
  classification_search as (
    select
      lc.license_id,
      string_agg(c.code || ' ' || c.name || ' ' || array_to_string(c.aliases, ' '), ' ') as classifications
    from public.license_classifications lc
    join public.classifications c on c.id = lc.classification_id
    group by lc.license_id
  )
  update public.licenses l
  set search_text = concat_ws(
    ' ',
    l.license_number,
    l.business_name,
    l.city,
    l.county,
    l.zip,
    personnel_search.names,
    classification_search.classifications
  )
  from personnel_search
  full join classification_search using (license_id)
  where l.id = coalesce(personnel_search.license_id, classification_search.license_id);

  update public.licenses
  set search_text = concat_ws(' ', license_number, business_name, city, county, zip)
  where search_text = '';

  analyze public.licenses;
  analyze public.license_classifications;
  analyze public.personnel;
  analyze public.bonds;
  analyze public.workers_comp;

  result := jsonb_build_object(
    'licenses', (select count(*) from public.licenses),
    'classifications', (select count(*) from public.classifications),
    'license_classifications', (select count(*) from public.license_classifications),
    'personnel', (select count(*) from public.personnel),
    'bonds', (select count(*) from public.bonds),
    'workers_comp', (select count(*) from public.workers_comp),
    'source_updated_at', (select max(source_updated_at) from public.licenses)
  );

  truncate table
    public.cslb_import_licenses,
    public.cslb_import_personnel,
    public.cslb_import_workers_comp;

  return result;
end;
$$;

revoke execute on function public.search_license_ids_v2(text, integer, integer) from public;
revoke execute on function public.classification_license_ids(text, text, text, text, text, integer) from public;
revoke execute on function public.finalize_cslb_import() from public, anon, authenticated;

grant execute on function public.search_license_ids_v2(text, integer, integer) to anon, authenticated;
grant execute on function public.classification_license_ids(text, text, text, text, text, integer) to anon, authenticated;
grant execute on function public.finalize_cslb_import() to service_role;
