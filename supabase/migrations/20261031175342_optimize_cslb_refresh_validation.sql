-- A successful membership audit must examine the complete source set. EXISTS
-- favors low-startup index/merge plans that time out while proving no mismatch
-- on the production dataset. Counting the same predicate plans for the full
-- scan instead. No acceptance rules, timeouts, privileges, or data change here.
-- CREATE OR REPLACE preserves this existing function's owner and execute ACL.
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
  if (
    select count(*) from public.licenses l
    left join public.cslb_refresh_fingerprints f on f.license_id=l.id
    left join public.cslb_refresh_retained r on r.license_id=l.id and r.run_id=refresh_id
    where nullif(btrim(l.source_status),'') is not null
      and ((f.last_seen_run is distinct from refresh_id and (r.license_id is null or l.source_missing_since is null))
        or (f.last_seen_run=refresh_id and (r.license_id is not null or l.source_missing_since is not null)))
  ) > 0 then raise exception 'Unreconciled source records: retention receipt or presence marker mismatch'; end if;
  if exists (
    select 1 from public.cslb_refresh_retained r join public.licenses l on l.id=r.license_id
    where r.run_id=refresh_id and nullif(btrim(l.source_status),'') is null
  ) then raise exception 'Retained record source changed'; end if;
  if next_phase='complete' and exists(select 1 from public.cslb_refresh_changes where run_id=refresh_id and not indexed)
    then raise exception 'Unverified index changes remain'; end if;
  update public.cslb_refresh_runs set phase=next_phase,completed_at=case when next_phase='complete' then clock_timestamp() else null end where id=refresh_id;
end;
$$;
