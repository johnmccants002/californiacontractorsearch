-- Finalize the statewide CSLB import in bounded, resumable phases so the
-- Supabase Data API does not have to hold one very large transaction open.

create or replace function public.finalize_cslb_import_phase(
  phase text,
  after_cursor text default null,
  batch_limit integer default 10000
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
set statement_timeout = '110s'
as $$
declare
  bounded_limit integer := least(greatest(batch_limit, 100), 20000);
  staged_license_count bigint;
  staged_personnel_count bigint;
  staged_workers_comp_count bigint;
  next_cursor text;
  affected bigint := 0;
  phase_done boolean := false;
begin
  if phase = 'prepare' then
    select count(*) into staged_license_count from public.cslb_import_licenses;
    select count(*) into staged_personnel_count from public.cslb_import_personnel;
    select count(*) into staged_workers_comp_count from public.cslb_import_workers_comp;

    if staged_license_count < 200000
      or staged_personnel_count < 300000
      or staged_workers_comp_count < 150000 then
      raise exception 'CSLB import is incomplete: licenses %, personnel %, workers comp %',
        staged_license_count, staged_personnel_count, staged_workers_comp_count;
    end if;

    insert into public.classifications (code, name, slug, description, aliases)
    select distinct
      class_code.value,
      upper(class_code.value) || ' Contractor',
      class_code.value,
      '',
      '{}'::text[]
    from public.cslb_import_licenses source
    cross join lateral unnest(source.classifications) as class_code(value)
    where class_code.value <> ''
    on conflict (code) do nothing;

    return jsonb_build_object(
      'phase', phase,
      'done', true,
      'licenses', staged_license_count,
      'personnel', staged_personnel_count,
      'workers_comp', staged_workers_comp_count
    );
  elsif phase = 'licenses' then
    select max(batch.license_number) into next_cursor
    from (
      select source.license_number
      from public.cslb_import_licenses source
      where after_cursor is null or source.license_number > after_cursor
      order by source.license_number
      limit bounded_limit
    ) batch;

    if next_cursor is null then
      return jsonb_build_object('phase', phase, 'done', true, 'cursor', after_cursor, 'processed', 0);
    end if;
    select not exists (
      select 1 from public.cslb_import_licenses source
      where source.license_number > next_cursor
    ) into phase_done;

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
      source.license_number,
      source.business_name,
      source.license_status,
      'Contractor',
      source.issue_date,
      source.expiration_date,
      source.address_line_1,
      source.city,
      coalesce(nullif(source.state, ''), 'CA'),
      source.county,
      source.zip,
      source.phone,
      source.entity_type,
      source.source_status,
      source.source_updated_at
    from public.cslb_import_licenses source
    where (after_cursor is null or source.license_number > after_cursor)
      and source.license_number <= next_cursor
    order by source.license_number
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

    get diagnostics affected = row_count;
  elsif phase = 'delete_stale' then
    delete from public.licenses target
    where not exists (
      select 1
      from public.cslb_import_licenses source
      where source.license_number = target.license_number
    );
    get diagnostics affected = row_count;
    return jsonb_build_object('phase', phase, 'done', true, 'processed', affected);
  elsif phase = 'reset_details' then
    delete from public.license_classifications where id is not null;
    delete from public.personnel where id is not null;
    delete from public.bonds where id is not null;
    delete from public.workers_comp where id is not null;
    return jsonb_build_object('phase', phase, 'done', true);
  elsif phase = 'classifications' then
    select max(batch.license_number) into next_cursor
    from (
      select source.license_number
      from public.cslb_import_licenses source
      where after_cursor is null or source.license_number > after_cursor
      order by source.license_number
      limit bounded_limit
    ) batch;

    if next_cursor is null then
      return jsonb_build_object('phase', phase, 'done', true, 'cursor', after_cursor, 'processed', 0);
    end if;
    select not exists (
      select 1 from public.cslb_import_licenses source
      where source.license_number > next_cursor
    ) into phase_done;

    insert into public.license_classifications (license_id, classification_id)
    select distinct license.id, classification.id
    from public.cslb_import_licenses source
    join public.licenses license on license.license_number = source.license_number
    cross join lateral unnest(source.classifications) as class_code(value)
    join public.classifications classification on classification.code = class_code.value
    where (after_cursor is null or source.license_number > after_cursor)
      and source.license_number <= next_cursor
    on conflict do nothing;
    get diagnostics affected = row_count;
  elsif phase = 'personnel' then
    select max(batch.id)::text into next_cursor
    from (
      select source.id
      from public.cslb_import_personnel source
      where after_cursor is null or source.id > after_cursor::bigint
      order by source.id
      limit bounded_limit
    ) batch;

    if next_cursor is null then
      return jsonb_build_object('phase', phase, 'done', true, 'cursor', after_cursor, 'processed', 0);
    end if;
    select not exists (
      select 1 from public.cslb_import_personnel source
      where source.id > next_cursor::bigint
    ) into phase_done;

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
      license.id,
      source.first_name,
      source.middle_name,
      source.last_name,
      source.full_name,
      source.role,
      source.association_date,
      source.disassociation_date
    from public.cslb_import_personnel source
    join public.licenses license on license.license_number = source.license_number
    where (after_cursor is null or source.id > after_cursor::bigint)
      and source.id <= next_cursor::bigint
      and source.full_name <> '';
    get diagnostics affected = row_count;
  elsif phase = 'bonds' then
    select max(batch.license_number) into next_cursor
    from (
      select source.license_number
      from public.cslb_import_licenses source
      where after_cursor is null or source.license_number > after_cursor
      order by source.license_number
      limit bounded_limit
    ) batch;

    if next_cursor is null then
      return jsonb_build_object('phase', phase, 'done', true, 'cursor', after_cursor, 'processed', 0);
    end if;
    select not exists (
      select 1 from public.cslb_import_licenses source
      where source.license_number > next_cursor
    ) into phase_done;

    insert into public.bonds (
      license_id,
      bond_type,
      bond_company,
      bond_number,
      bond_amount,
      effective_date,
      cancellation_date
    )
    select
      license.id,
      bond.bond_type,
      bond.company,
      bond.number,
      bond.amount,
      bond.effective_date,
      bond.cancellation_date
    from public.cslb_import_licenses source
    join public.licenses license on license.license_number = source.license_number
    cross join lateral (
      values
        ('Contractor Bond'::text, source.cb_company, source.cb_number, source.cb_amount, source.cb_effective_date, source.cb_cancellation_date),
        ('Workers Bond'::text, source.wb_company, source.wb_number, source.wb_amount, source.wb_effective_date, source.wb_cancellation_date),
        ('Disciplinary Bond'::text, source.db_company, source.db_number, source.db_amount, source.db_effective_date, source.db_cancellation_date)
    ) as bond(bond_type, company, number, amount, effective_date, cancellation_date)
    where (after_cursor is null or source.license_number > after_cursor)
      and source.license_number <= next_cursor
      and nullif(trim(bond.number), '') is not null
    on conflict do nothing;
    get diagnostics affected = row_count;
  elsif phase = 'workers_comp' then
    select max(batch.id)::text into next_cursor
    from (
      select source.id
      from public.cslb_import_workers_comp source
      where after_cursor is null or source.id > after_cursor::bigint
      order by source.id
      limit bounded_limit
    ) batch;

    if next_cursor is null then
      return jsonb_build_object('phase', phase, 'done', true, 'cursor', after_cursor, 'processed', 0);
    end if;
    select not exists (
      select 1 from public.cslb_import_workers_comp source
      where source.id > next_cursor::bigint
    ) into phase_done;

    insert into public.workers_comp (
      license_id,
      carrier,
      policy_number,
      effective_date,
      expiration_date,
      exemption
    )
    select
      license.id,
      nullif(trim(source.carrier), ''),
      nullif(trim(source.policy_number), ''),
      source.effective_date,
      source.expiration_date,
      lower(coalesce(source.coverage_type, '')) like '%exempt%'
    from public.cslb_import_workers_comp source
    join public.licenses license on license.license_number = source.license_number
    where (after_cursor is null or source.id > after_cursor::bigint)
      and source.id <= next_cursor::bigint
    on conflict do nothing;
    get diagnostics affected = row_count;
  elsif phase = 'workers_comp_fallback' then
    select max(batch.license_number) into next_cursor
    from (
      select source.license_number
      from public.cslb_import_licenses source
      where (after_cursor is null or source.license_number > after_cursor)
        and nullif(trim(source.wc_coverage_type), '') is not null
      order by source.license_number
      limit bounded_limit
    ) batch;

    if next_cursor is null then
      return jsonb_build_object('phase', phase, 'done', true, 'cursor', after_cursor, 'processed', 0);
    end if;
    select not exists (
      select 1
      from public.cslb_import_licenses source
      where source.license_number > next_cursor
        and nullif(trim(source.wc_coverage_type), '') is not null
    ) into phase_done;

    insert into public.workers_comp (
      license_id,
      carrier,
      policy_number,
      effective_date,
      expiration_date,
      exemption
    )
    select
      license.id,
      nullif(trim(source.wc_carrier), ''),
      nullif(trim(source.wc_policy_number), ''),
      source.wc_effective_date,
      source.wc_expiration_date,
      lower(coalesce(source.wc_coverage_type, '')) like '%exempt%'
    from public.cslb_import_licenses source
    join public.licenses license on license.license_number = source.license_number
    where (after_cursor is null or source.license_number > after_cursor)
      and source.license_number <= next_cursor
      and nullif(trim(source.wc_coverage_type), '') is not null
      and not exists (
        select 1
        from public.cslb_import_workers_comp wc
        where wc.license_number = source.license_number
      )
    on conflict do nothing;
    get diagnostics affected = row_count;
  elsif phase = 'search' then
    select max(batch.license_number) into next_cursor
    from (
      select source.license_number
      from public.cslb_import_licenses source
      where after_cursor is null or source.license_number > after_cursor
      order by source.license_number
      limit bounded_limit
    ) batch;

    if next_cursor is null then
      return jsonb_build_object('phase', phase, 'done', true, 'cursor', after_cursor, 'processed', 0);
    end if;
    select not exists (
      select 1 from public.cslb_import_licenses source
      where source.license_number > next_cursor
    ) into phase_done;

    with selected as (
      select license.id
      from public.cslb_import_licenses source
      join public.licenses license on license.license_number = source.license_number
      where (after_cursor is null or source.license_number > after_cursor)
        and source.license_number <= next_cursor
    ),
    personnel_search as (
      select personnel.license_id, string_agg(personnel.full_name, ' ') as names
      from public.personnel personnel
      join selected on selected.id = personnel.license_id
      group by personnel.license_id
    ),
    classification_search as (
      select
        link.license_id,
        string_agg(
          classification.code || ' ' || classification.name || ' ' || array_to_string(classification.aliases, ' '),
          ' '
        ) as classifications
      from public.license_classifications link
      join selected on selected.id = link.license_id
      join public.classifications classification on classification.id = link.classification_id
      group by link.license_id
    )
    update public.licenses license
    set search_text = concat_ws(
      ' ',
      license.license_number,
      license.business_name,
      license.city,
      license.county,
      license.zip,
      personnel_search.names,
      classification_search.classifications
    )
    from selected
    left join personnel_search on personnel_search.license_id = selected.id
    left join classification_search on classification_search.license_id = selected.id
    where license.id = selected.id;
    get diagnostics affected = row_count;
  elsif phase = 'complete' then
    analyze public.licenses;
    analyze public.license_classifications;
    analyze public.personnel;
    analyze public.bonds;
    analyze public.workers_comp;

    return jsonb_build_object(
      'phase', phase,
      'done', true,
      'licenses', (select count(*) from public.licenses),
      'classifications', (select count(*) from public.classifications),
      'license_classifications', (select count(*) from public.license_classifications),
      'personnel', (select count(*) from public.personnel),
      'bonds', (select count(*) from public.bonds),
      'workers_comp', (select count(*) from public.workers_comp),
      'source_updated_at', (select max(source_updated_at) from public.licenses)
    );
  elsif phase = 'cleanup' then
    truncate table
      public.cslb_import_licenses,
      public.cslb_import_personnel,
      public.cslb_import_workers_comp;
    return jsonb_build_object('phase', phase, 'done', true);
  else
    raise exception 'Unknown CSLB finalization phase: %', phase;
  end if;

  return jsonb_build_object(
    'phase', phase,
    'done', phase_done,
    'cursor', next_cursor,
    'processed', affected
  );
end;
$$;

revoke execute on function public.finalize_cslb_import_phase(text, text, integer)
from public, anon, authenticated;

grant execute on function public.finalize_cslb_import_phase(text, text, integer)
to service_role;
