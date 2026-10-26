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

revoke execute on function public.finalize_cslb_import() from public, anon, authenticated;
grant execute on function public.finalize_cslb_import() to service_role;
