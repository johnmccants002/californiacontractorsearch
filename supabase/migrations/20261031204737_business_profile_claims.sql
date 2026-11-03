-- Additive, disabled by default. Never grants users write access to CSLB tables.
create schema if not exists claim_private;
revoke all on schema claim_private from public, anon, authenticated;
grant usage on schema claim_private to anon, authenticated, service_role;

create table claim_private.settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into claim_private.settings(singleton) values(true);
create table claim_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table claim_private.settings enable row level security;
alter table claim_private.admins enable row level security;
revoke all on claim_private.settings, claim_private.admins from public,anon,authenticated,service_role;

create function claim_private.signed_in() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=auth.uid() and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
      and s.id::text=auth.jwt()->>'session_id'
  );
$$;
create function claim_private.admin_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select claim_private.signed_in() and exists(select 1 from claim_private.admins where user_id=auth.uid());
$$;
create function claim_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select claim_private.admin_member() and coalesce(auth.jwt()->>'aal'='aal2',false);
$$;
create function claim_private.enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from claim_private.settings where singleton),false);
$$;
revoke all on function claim_private.signed_in(),claim_private.admin_member(),claim_private.is_admin(),claim_private.enabled() from public,anon,authenticated,service_role;
grant execute on function claim_private.signed_in(),claim_private.admin_member(),claim_private.is_admin(),claim_private.enabled() to authenticated;

-- Used only to decide whether to show MFA enrollment, never to authorize reviews.
create function public.business_claim_admin_access() returns boolean
language sql stable security invoker set search_path = '' as $$ select claim_private.admin_member(); $$;
revoke all on function public.business_claim_admin_access() from public,anon,authenticated,service_role;
grant execute on function public.business_claim_admin_access() to authenticated;

create table public.business_claims (
  id uuid primary key default gen_random_uuid(),
  license_id bigint not null references public.licenses(id),
  user_id uuid not null default auth.uid() references auth.users(id),
  applicant_name text not null check(length(trim(applicant_name)) between 2 and 120),
  applicant_role text not null check(applicant_role in ('owner','authorized_representative')),
  applicant_email text not null,
  website text not null default '' check(length(website)<=500 and (website='' or website ~ '^https://[^[:space:]<>]+$')),
  attested boolean not null check(attested),
  terms_version text not null default '2026-10-31',
  status text not null default 'pending' check(status in ('pending','approved','denied','revoked')),
  verification_method text check(verification_method in ('cslb_phone','independent_business_contact')),
  review_note text not null default '' check(length(review_note)<=2000),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_business_name text,
  approved_entity_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index business_claim_one_owner on public.business_claims(license_id) where status='approved';
create unique index business_claim_one_open_request on public.business_claims(license_id,user_id) where status in ('pending','approved');
create index business_claim_user_created on public.business_claims(user_id,created_at desc);
create index business_claim_review_queue on public.business_claims(status,created_at,id);
create index business_claim_reviewer on public.business_claims(reviewed_by);

-- Public profile fields only. Login emails, evidence and manager IDs never live here.
create table public.business_profiles (
  license_id bigint primary key references public.licenses(id),
  description text not null default '' check(length(description)<=2000),
  website text not null default '' check(length(website)<=500 and (website='' or website ~ '^https://[^[:space:]<>]+$')),
  contact_phone text not null default '' check(length(contact_phone)<=40 and contact_phone ~ '^[0-9+(). x-]*$'),
  contact_email text not null default '' check(length(contact_email)<=254 and (contact_email='' or contact_email ~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$')),
  hours text not null default '' check(length(hours)<=500),
  service_areas text not null default '' check(length(service_areas)<=1000),
  updated_at timestamptz not null default now()
);
create table public.business_claim_events (
  id bigint generated always as identity primary key,
  license_id bigint not null references public.licenses(id),
  actor_id uuid not null references auth.users(id),
  event text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index business_claim_events_license on public.business_claim_events(license_id,created_at desc);
create index business_claim_events_actor on public.business_claim_events(actor_id);

-- Durable mail queue; only the server delivery worker can reserve/acknowledge.
create table public.business_claim_notices (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.business_claims(id),
  kind text not null check(kind in ('submitted_admin','submitted_user','access_requested','approved','denied','revoked')),
  recipient text,
  state text not null default 'pending' check(state in ('pending','sending','sent','review')),
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index business_claim_notices_queue on public.business_claim_notices(state,created_at);
create index business_claim_notices_claim on public.business_claim_notices(claim_id);

-- Public boolean only; explicit public read projection, not an identity lookup.
-- Material business-identity changes suspend claimed display/editing until review.
create function claim_private.claim_current(target bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.business_claims c join public.licenses l on l.id=c.license_id
    where c.license_id=target and c.status='approved'
    and c.approved_business_name=l.business_name_normalized
    and c.approved_entity_type=coalesce(l.entity_type,''));
$$;
create function claim_private.manages(target bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select claim_private.signed_in() and claim_private.claim_current(target) and exists(
    select 1 from public.business_claims where license_id=target and user_id=auth.uid() and status='approved');
$$;
revoke all on function claim_private.claim_current(bigint),claim_private.manages(bigint) from public,anon,authenticated,service_role;
grant execute on function claim_private.claim_current(bigint) to anon,authenticated;
grant execute on function claim_private.manages(bigint) to authenticated;

alter table public.business_claims enable row level security;
alter table public.business_profiles enable row level security;
alter table public.business_claim_events enable row level security;
alter table public.business_claim_notices enable row level security;
revoke all on public.business_claims,public.business_profiles,public.business_claim_events,public.business_claim_notices from public,anon,authenticated,service_role;
grant select(id,license_id,user_id,applicant_name,applicant_role,applicant_email,website,attested,terms_version,status,verification_method,reviewed_at,created_at,updated_at) on public.business_claims to authenticated;
grant insert(license_id,applicant_name,applicant_role,website,attested) on public.business_claims to authenticated;
grant update(status,verification_method,review_note) on public.business_claims to authenticated;
grant select on public.business_profiles to anon,authenticated;
grant update(description,website,contact_phone,contact_email,hours,service_areas) on public.business_profiles to authenticated;
grant select on public.business_claim_events to authenticated;
grant select,update on public.business_claim_notices to service_role;

create policy claims_read_own_or_admin on public.business_claims for select to authenticated
  using ((select claim_private.signed_in()) and (user_id=(select auth.uid()) or (select claim_private.is_admin())));
create policy claims_submit_own on public.business_claims for insert to authenticated
  with check ((select claim_private.enabled()) and (select claim_private.signed_in()) and user_id=(select auth.uid()) and status='pending');
create policy claims_review_admin on public.business_claims for update to authenticated
  using ((select claim_private.enabled()) and (select claim_private.is_admin()))
  with check ((select claim_private.enabled()) and (select claim_private.is_admin()));
create policy profiles_read_claimed on public.business_profiles for select to anon,authenticated
  using (claim_private.claim_current(license_id));
create policy profiles_edit_own on public.business_profiles for update to authenticated
  using ((select claim_private.enabled()) and claim_private.manages(license_id))
  with check ((select claim_private.enabled()) and claim_private.manages(license_id));
create policy claim_events_admin on public.business_claim_events for select to authenticated
  using ((select claim_private.is_admin()));

create function claim_private.guard_claim() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); source public.licenses%rowtype;
begin
  if actor is null or not claim_private.signed_in() or not claim_private.enabled() then raise exception 'Claims unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('claim-license:'||new.license_id,0));
  select * into strict source from public.licenses where id=new.license_id;
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('claim-user:'||actor,0));
    if new.user_id<>actor or new.status<>'pending' or new.reviewed_by is not null or new.verification_method is not null or new.review_note<>'' then raise exception 'Invalid claim request'; end if;
    if source.source_status is null or trim(source.source_status)='' or source.source_missing_since is not null then raise exception 'Source record needs review'; end if;
    if (select count(*) from public.business_claims where user_id=actor and created_at>now()-interval '24 hours')>=5
      or (select count(*) from public.business_claims where user_id=actor and status='pending')>=3 then raise exception 'Claim request limit reached'; end if;
    select email into new.applicant_email from auth.users where id=actor;
    new.terms_version:='2026-10-31'; new.created_at:=now();
  else
    if not claim_private.is_admin() or actor=old.user_id then raise exception 'Independent MFA reviewer required'; end if;
    if new.license_id<>old.license_id or new.user_id<>old.user_id then raise exception 'Claim identity is immutable'; end if;
    if not ((old.status='pending' and new.status in ('approved','denied')) or (old.status='approved' and new.status='revoked')) then raise exception 'Invalid claim transition'; end if;
    if length(trim(new.review_note))<20 then raise exception 'Record verification evidence or review reason'; end if;
    if new.status='approved' then
      if new.verification_method is null or source.source_missing_since is not null or coalesce(trim(source.source_status),'')='' then raise exception 'Verification required'; end if;
      if new.verification_method='cslb_phone' and coalesce(trim(source.phone),'')='' then raise exception 'No CSLB phone available'; end if;
      if exists(select 1 from public.business_claims where license_id=new.license_id and status='approved' and id<>new.id) then raise exception 'Profile already managed; review access dispute first'; end if;
      new.approved_business_name:=source.business_name_normalized;new.approved_entity_type:=coalesce(source.entity_type,'');
    end if;
    new.reviewed_by:=actor;new.reviewed_at:=now();
  end if;
  new.updated_at:=now();return new;
end;
$$;
create function claim_private.record_claim() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not claim_private.signed_in() then raise exception 'Authentication required'; end if;
  insert into public.business_claim_events(license_id,actor_id,event,before_data,after_data)
    values(new.license_id,auth.uid(),'claim_'||new.status,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  if tg_op='INSERT' then
    insert into public.business_claim_notices(claim_id,kind,recipient) values(new.id,'submitted_admin',null),(new.id,'submitted_user',new.applicant_email);
    insert into public.business_claim_notices(claim_id,kind,recipient)
      select new.id,'access_requested',u.email from public.business_claims c join auth.users u on u.id=c.user_id
      where c.license_id=new.license_id and c.status='approved';
  else
    insert into public.business_claim_notices(claim_id,kind,recipient) values(new.id,new.status,new.applicant_email);
    if new.status='approved' then
      -- A transfer never silently publishes a prior manager's promotional content.
      insert into public.business_profiles(license_id) values(new.license_id)
      on conflict(license_id) do update set description='',website='',contact_phone='',contact_email='',hours='',service_areas='',updated_at=now();
    end if;
  end if;
  return new;
end;
$$;
create function claim_private.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not claim_private.signed_in() or not claim_private.enabled() then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('claim-license:'||new.license_id,0));
  -- Nested profile initialization runs only after an independently reviewed approval.
  if pg_trigger_depth()<2 and not claim_private.manages(new.license_id) then raise exception 'Approved manager required'; end if;
  if tg_op='UPDATE' and new.license_id<>old.license_id then raise exception 'Profile identity is immutable'; end if;
  new.updated_at:=now();return new;
end;
$$;
create function claim_private.record_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not claim_private.signed_in() then raise exception 'Authentication required'; end if;
  insert into public.business_claim_events(license_id,actor_id,event,before_data,after_data)
    values(new.license_id,auth.uid(),'profile_saved',case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end;
$$;
revoke all on function claim_private.guard_claim(),claim_private.record_claim(),claim_private.guard_profile(),claim_private.record_profile() from public,anon,authenticated,service_role;
create trigger business_claim_guard before insert or update on public.business_claims for each row execute function claim_private.guard_claim();
create trigger business_claim_audit after insert or update on public.business_claims for each row execute function claim_private.record_claim();
create trigger business_profile_guard before insert or update on public.business_profiles for each row execute function claim_private.guard_profile();
create trigger business_profile_audit after insert or update on public.business_profiles for each row execute function claim_private.record_profile();

create function public.reserve_business_claim_notice(target uuid) returns setof public.business_claim_notices
language sql security invoker set search_path = '' as $$
  update public.business_claim_notices set state='sending',attempted_at=now()
  where id=target and state='pending' returning *;
$$;
revoke all on function public.reserve_business_claim_notice(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_business_claim_notice(uuid) to service_role;
