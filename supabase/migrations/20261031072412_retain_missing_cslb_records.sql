-- Absence from a master download is not evidence of a particular license status.
-- Additive installation: no existing license values are changed here.
alter table public.licenses add column source_missing_since date;
comment on column public.licenses.source_missing_since is
  'First master-file date missing in the current absence streak. Null after reappearance. All source facts remain last-known, not verified current.';
alter table public.cslb_refresh_runs add column retained_expected integer not null default 0 check (retained_expected >= 0);

-- Private, durable receipts: every missing source ID must be explicitly reconciled.
create table public.cslb_refresh_retained (
  run_id uuid not null references public.cslb_refresh_runs(id),
  license_id bigint not null references public.licenses(id),
  primary key (run_id, license_id)
);
create index cslb_refresh_retained_license_idx on public.cslb_refresh_retained(license_id);
alter table public.cslb_refresh_retained enable row level security;
revoke all on public.cslb_refresh_retained from public, anon, authenticated;
grant select, insert on public.cslb_refresh_retained to service_role;

create function public.retain_missing_cslb_batch(refresh_id uuid, license_ids bigint[])
returns integer language plpgsql security invoker set search_path = pg_catalog set statement_timeout = '30s'
as $$
declare
  job public.cslb_refresh_runs;
  master_date date;
  retained_count integer;
begin
  select * into strict job from public.cslb_refresh_runs where id=refresh_id for update;
  if job.phase <> 'applying' or job.processed <> job.expected then
    raise exception 'Finish the source snapshot before reconciling missing records';
  end if;
  if coalesce(cardinality(license_ids),0) not between 1 and 200
    or cardinality(license_ids) <> (select count(distinct n) from unnest(license_ids) n) then
    raise exception 'Expected 1 to 200 distinct non-null license IDs';
  end if;
  master_date := (job.source_dates->>'license-master.csv')::date;
  if master_date is null then raise exception 'Master-file date required'; end if;
  -- Lock only this bounded batch. No detail/address/status values are changed.
  perform 1 from public.licenses where id=any(license_ids) order by id for update;
  if exists (
    select 1 from unnest(license_ids) n
    left join public.licenses l on l.id=n
    left join public.cslb_refresh_fingerprints f on f.license_id=l.id
    where l.id is null or nullif(btrim(l.source_status),'') is null or f.last_seen_run=refresh_id
  ) then raise exception 'Retention IDs must be imported records absent from this completed snapshot'; end if;
  insert into public.cslb_refresh_retained(run_id,license_id)
    select refresh_id,n from unnest(license_ids) n on conflict do nothing;
  select count(*) into retained_count from public.cslb_refresh_retained where run_id=refresh_id;
  if retained_count > job.retained_expected then raise exception 'Retention plan count exceeded'; end if;
  update public.licenses set source_missing_since=master_date
    where id=any(license_ids) and source_missing_since is null;
  -- Retained documents stay in the index and receive the same readback validation.
  insert into public.cslb_refresh_changes(run_id,license_id)
    select refresh_id,n from unnest(license_ids) n on conflict do nothing;
  return retained_count;
end;
$$;

-- Fingerprints are acknowledged for EVERY master record, even unchanged payloads.
-- Clearing on this acknowledgement avoids rewriting unchanged personnel/details.
create function public.clear_cslb_missing_on_seen()
returns trigger language plpgsql security invoker set search_path = pg_catalog set statement_timeout = '30s'
as $$
begin
  update public.licenses set source_missing_since=null
    where id=new.license_id and source_missing_since is not null;
  if found then
    insert into public.cslb_refresh_changes(run_id,license_id)
      values(new.last_seen_run,new.license_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger cslb_clear_missing_on_seen after insert or update of last_seen_run
  on public.cslb_refresh_fingerprints for each row execute function public.clear_cslb_missing_on_seen();

create or replace function public.advance_cslb_refresh(refresh_id uuid, next_phase text)
returns void language plpgsql security invoker set search_path = pg_catalog set statement_timeout = '30s'
as $$
declare job public.cslb_refresh_runs;
begin
  select * into strict job from public.cslb_refresh_runs where id=refresh_id for update;
  if job.phase=next_phase then return; end if;
  if not ((job.phase='applying' and next_phase='geocoding') or (job.phase='geocoding' and next_phase='indexing') or (job.phase='indexing' and next_phase='complete')) then raise exception 'Invalid refresh transition'; end if;
  if job.processed <> job.expected then raise exception 'Source snapshot incomplete'; end if;
  if (select count(*) from public.cslb_refresh_fingerprints where last_seen_run=refresh_id) <> job.expected
    then raise exception 'Source membership count mismatch'; end if;
  if (select count(*) from public.cslb_refresh_retained where run_id=refresh_id) <> job.retained_expected
    then raise exception 'Retention plan incomplete'; end if;
  if exists (
    select 1 from public.licenses l
    left join public.cslb_refresh_fingerprints f on f.license_id=l.id
    left join public.cslb_refresh_retained r on r.license_id=l.id and r.run_id=refresh_id
    where nullif(btrim(l.source_status),'') is not null
      and ((f.last_seen_run is distinct from refresh_id and (r.license_id is null or l.source_missing_since is null))
        or (f.last_seen_run=refresh_id and (r.license_id is not null or l.source_missing_since is not null)))
  ) then raise exception 'Unreconciled source records: retention receipt or presence marker mismatch'; end if;
  if exists (
    select 1 from public.cslb_refresh_retained r join public.licenses l on l.id=r.license_id
    where r.run_id=refresh_id and nullif(btrim(l.source_status),'') is null
  ) then raise exception 'Retained record source changed'; end if;
  if next_phase='complete' and exists(select 1 from public.cslb_refresh_changes where run_id=refresh_id and not indexed)
    then raise exception 'Unverified index changes remain'; end if;
  update public.cslb_refresh_runs set phase=next_phase,completed_at=case when next_phase='complete' then clock_timestamp() else null end where id=refresh_id;
end;
$$;
revoke execute on function public.retain_missing_cslb_batch(uuid,bigint[]),public.clear_cslb_missing_on_seen(),public.advance_cslb_refresh(uuid,text) from public,anon,authenticated;
grant execute on function public.retain_missing_cslb_batch(uuid,bigint[]),public.clear_cslb_missing_on_seen(),public.advance_cslb_refresh(uuid,text) to service_role;
