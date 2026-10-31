-- Aggregate public freshness metadata; private fingerprints and durable index outbox.
-- No existing records are changed by this migration.
create table public.cslb_refresh_runs (
  id uuid primary key,
  release_key text not null unique check (release_key ~ '^[a-f0-9]{64}$'),
  index_version text not null check (length(index_version) > 0),
  source_dates jsonb not null,
  source_counts jsonb not null,
  expected integer not null check (expected > 0),
  processed integer not null default 0,
  cursor text not null default '',
  last_batch_hash text,
  phase text not null default 'applying' check (phase in ('applying','geocoding','indexing','complete')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (processed between 0 and expected),
  check ((phase = 'complete') = (completed_at is not null))
);
create unique index cslb_one_active_refresh on public.cslb_refresh_runs ((true)) where phase <> 'complete';
create index cslb_refresh_completed_idx on public.cslb_refresh_runs(completed_at desc) where phase = 'complete';
create table public.cslb_refresh_fingerprints (
  license_number text primary key,
  license_id bigint not null unique references public.licenses(id) on delete cascade,
  payload_hash text not null,
  last_seen_run uuid not null references public.cslb_refresh_runs(id)
);
create table public.cslb_refresh_changes (
  run_id uuid not null references public.cslb_refresh_runs(id),
  license_id bigint not null references public.licenses(id),
  indexed boolean not null default false,
  primary key (run_id,license_id)
);
create index cslb_refresh_fingerprints_run_idx on public.cslb_refresh_fingerprints(last_seen_run);
create index cslb_refresh_changes_license_idx on public.cslb_refresh_changes(license_id);
create index cslb_refresh_pending_idx on public.cslb_refresh_changes(run_id,license_id) where not indexed;
alter table public.cslb_refresh_runs enable row level security;
alter table public.cslb_refresh_fingerprints enable row level security;
alter table public.cslb_refresh_changes enable row level security;
revoke all on public.cslb_refresh_runs, public.cslb_refresh_fingerprints, public.cslb_refresh_changes from public, anon, authenticated;
-- Column grants intentionally exclude worker checkpoints. No public write policy.
grant select(id,source_dates,source_counts,phase,started_at,completed_at) on public.cslb_refresh_runs to anon, authenticated;
create policy "Public refresh summaries" on public.cslb_refresh_runs for select to anon,authenticated using (true);
grant select,insert,update on public.cslb_refresh_runs,public.cslb_refresh_fingerprints,public.cslb_refresh_changes to service_role;
-- Invoker-mode writes fire existing normalization triggers. These pure helpers
-- were originally granted to read roles only; do not elevate the worker RPCs.
grant execute on function public.normalize_business_name(text),public.normalize_search_text(text) to service_role;

create function public.apply_cslb_refresh_batch(refresh_id uuid, after_license text, items jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog set statement_timeout = '30s'
as $$
declare
  job public.cslb_refresh_runs;
  item jsonb;
  src public.cslb_import_licenses;
  target_id bigint;
  digest text;
  old_digest text;
  previous text := after_license;
  changed integer := 0;
  amount integer;
begin
  select * into strict job from public.cslb_refresh_runs where id=refresh_id for update;
  if job.phase <> 'applying' then raise exception 'Refresh is not accepting source updates'; end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 200 then raise exception 'Expected 1 to 200 records'; end if;
  amount := jsonb_array_length(items);
  -- A lost response can be replayed only if it is the exact last acknowledged batch.
  if job.cursor <> after_license then
    if job.last_batch_hash = md5(items::text) and job.cursor = items->(amount-1)->'license'->>'license_number' then
      return jsonb_build_object('cursor',job.cursor,'processed',job.processed,'replayed',true);
    end if;
    raise exception 'Refresh cursor mismatch';
  end if;
  if job.processed + amount > job.expected then raise exception 'Snapshot count exceeded'; end if;
  for item in select value from jsonb_array_elements(items) loop
    src := jsonb_populate_record(null::public.cslb_import_licenses,item->'license');
    if src.license_number is null or src.license_number !~ '^[0-9]{1,10}$' or src.license_number <= previous
      or nullif(btrim(src.business_name),'') is null or nullif(btrim(src.source_status),'') is null
      or jsonb_typeof(item->'personnel') is distinct from 'array' or jsonb_typeof(item->'workers_comp') is distinct from 'array'
      then raise exception 'Invalid or unordered contractor payload'; end if;
    if exists(select 1 from jsonb_array_elements(item->'personnel') p where p->>'license_number' is distinct from src.license_number)
      or exists(select 1 from jsonb_array_elements(item->'workers_comp') p where p->>'license_number' is distinct from src.license_number)
      then raise exception 'Related record belongs to another license'; end if;
    previous := src.license_number;
    digest := md5(item::text);
    select payload_hash,license_id into old_digest,target_id from public.cslb_refresh_fingerprints where license_number=src.license_number;
    if old_digest is distinct from digest then
      insert into public.licenses (license_number,business_name,license_status,license_type,issue_date,expiration_date,address_line_1,city,state,county,zip,phone,entity_type,source_status,source_updated_at)
      values (src.license_number,src.business_name,src.license_status,'Contractor',src.issue_date,src.expiration_date,src.address_line_1,src.city,coalesce(nullif(src.state,''),'CA'),src.county,src.zip,src.phone,src.entity_type,src.source_status,src.source_updated_at)
      on conflict (license_number) do update set business_name=excluded.business_name,license_status=excluded.license_status,
        issue_date=excluded.issue_date,expiration_date=excluded.expiration_date,address_line_1=excluded.address_line_1,
        city=excluded.city,state=excluded.state,county=excluded.county,zip=excluded.zip,phone=excluded.phone,
        entity_type=excluded.entity_type,source_status=excluded.source_status,source_updated_at=excluded.source_updated_at
      returning id into target_id;
      -- Only this contractor's details are replaced, in the same transaction as its license.
      delete from public.license_classifications where license_id=target_id;
      delete from public.personnel where license_id=target_id;
      delete from public.bonds where license_id=target_id;
      delete from public.workers_comp where license_id=target_id;
      insert into public.classifications(code,name,slug,description,aliases)
        select distinct code,upper(code)||' Contractor',code,'','{}'::text[] from unnest(src.classifications) code
        where code <> '' on conflict(code) do nothing;
      insert into public.license_classifications(license_id,classification_id)
        select target_id,id from public.classifications where code=any(src.classifications) on conflict do nothing;
      insert into public.personnel(license_id,first_name,middle_name,last_name,full_name,role,association_date,disassociation_date)
        select target_id,p.first_name,p.middle_name,p.last_name,p.full_name,p.role,p.association_date,p.disassociation_date
        from jsonb_populate_recordset(null::public.cslb_import_personnel,item->'personnel') p;
      insert into public.bonds(license_id,bond_type,bond_company,bond_number,bond_amount,effective_date,cancellation_date)
        select target_id,b.kind,b.company,b.number,b.amount,b.effective,b.cancelled
        from (values
          ('Contractor Bond',src.cb_company,src.cb_number,src.cb_amount,src.cb_effective_date,src.cb_cancellation_date),
          ('Workers Bond',src.wb_company,src.wb_number,src.wb_amount,src.wb_effective_date,src.wb_cancellation_date),
          ('Disciplinary Bond',src.db_company,src.db_number,src.db_amount,src.db_effective_date,src.db_cancellation_date)
        ) b(kind,company,number,amount,effective,cancelled) where nullif(btrim(b.number),'') is not null;
      insert into public.workers_comp(license_id,carrier,policy_number,effective_date,expiration_date,exemption)
        select target_id,p.carrier,p.policy_number,p.effective_date,p.expiration_date,lower(coalesce(p.coverage_type,'')) like '%exempt%'
        from jsonb_populate_recordset(null::public.cslb_import_workers_comp,item->'workers_comp') p on conflict do nothing;
      if jsonb_array_length(item->'workers_comp')=0 and nullif(btrim(src.wc_coverage_type),'') is not null then
        insert into public.workers_comp(license_id,carrier,policy_number,effective_date,expiration_date,exemption)
        values(target_id,src.wc_carrier,src.wc_policy_number,src.wc_effective_date,src.wc_expiration_date,lower(src.wc_coverage_type) like '%exempt%');
      end if;
      update public.licenses l set search_text=concat_ws(' ',l.license_number,l.business_name,l.city,l.county,l.zip,
        (select string_agg(p.full_name,' ') from public.personnel p where p.license_id=target_id),
        (select string_agg(c.code||' '||c.name||' '||array_to_string(c.aliases,' '),' ') from public.license_classifications lc join public.classifications c on c.id=lc.classification_id where lc.license_id=target_id))
        where l.id=target_id;
      insert into public.cslb_refresh_changes(run_id,license_id) values(refresh_id,target_id) on conflict do nothing;
      changed := changed+1;
    end if;
    insert into public.cslb_refresh_fingerprints(license_number,license_id,payload_hash,last_seen_run)
      values(src.license_number,target_id,digest,refresh_id) on conflict(license_number) do update
      set license_id=excluded.license_id,payload_hash=excluded.payload_hash,last_seen_run=excluded.last_seen_run;
  end loop;
  update public.cslb_refresh_runs set cursor=previous,processed=processed+amount,last_batch_hash=md5(items::text) where id=refresh_id;
  return jsonb_build_object('cursor',previous,'processed',job.processed+amount,'changed',changed);
end;
$$;

create function public.advance_cslb_refresh(refresh_id uuid, next_phase text)
returns void language plpgsql security invoker set search_path = pg_catalog set statement_timeout = '30s'
as $$
declare job public.cslb_refresh_runs;
begin
  select * into strict job from public.cslb_refresh_runs where id=refresh_id for update;
  if job.phase=next_phase then return; end if;
  if not ((job.phase='applying' and next_phase='geocoding') or (job.phase='geocoding' and next_phase='indexing') or (job.phase='indexing' and next_phase='complete')) then raise exception 'Invalid refresh transition'; end if;
  if job.processed <> job.expected then raise exception 'Source snapshot incomplete'; end if;
  if exists(select 1 from public.licenses l left join public.cslb_refresh_fingerprints f on f.license_id=l.id
    where nullif(btrim(l.source_status),'') is not null and f.last_seen_run is distinct from refresh_id)
    then raise exception 'Unreconciled source records: review missing licenses; no automatic deletion'; end if;
  if next_phase='complete' and exists(select 1 from public.cslb_refresh_changes where run_id=refresh_id and not indexed)
    then raise exception 'Unverified index changes remain'; end if;
  update public.cslb_refresh_runs set phase=next_phase,completed_at=case when next_phase='complete' then clock_timestamp() else null end where id=refresh_id;
end;
$$;
revoke execute on function public.apply_cslb_refresh_batch(uuid,text,jsonb),public.advance_cslb_refresh(uuid,text) from public,anon,authenticated;
grant execute on function public.apply_cslb_refresh_batch(uuid,text,jsonb),public.advance_cslb_refresh(uuid,text) to service_role;
