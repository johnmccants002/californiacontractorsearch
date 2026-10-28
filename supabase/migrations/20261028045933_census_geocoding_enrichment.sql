-- Additive enrichment only. Original CSLB address/status/source timestamps stay intact.
alter table public.licenses
  add column latitude double precision,
  add column longitude double precision,
  add column geocode_matched_address text,
  add column geocode_source text,
  add column geocode_status text,
  add column geocode_quality text,
  add column geocoded_at timestamptz,
  add column geocode_address_hash text,
  add column geocode_benchmark text,
  add constraint licenses_geocode_status_check check (geocode_status is null or geocode_status in
    ('accepted','unmatched','ambiguous','review','invalid_response','skipped_po_box','skipped_missing_address','skipped_non_street','skipped_unsupported_region')),
  add constraint licenses_geocode_source_check check (geocode_source is null or geocode_source = 'us_census'),
  add constraint licenses_geocode_hash_check check (geocode_address_hash is null or geocode_address_hash ~ '^[0-9a-f]{64}$'),
  add constraint licenses_geocode_coordinates_check check ((
    (geocode_status = 'accepted' and latitude is not null and longitude is not null
      and latitude between -90 and 90 and longitude between -180 and 180
      and not (latitude = 0 and longitude = 0)
      and geocode_source = 'us_census' and geocode_quality = 'exact'
      and geocode_benchmark = 'Public_AR_Current' and geocoded_at is not null
      and geocode_address_hash is not null and geocode_matched_address is not null)
    or (geocode_status is distinct from 'accepted' and latitude is null and longitude is null)
  ) is true);

comment on column public.licenses.latitude is 'Census address-range interpolation of CSLB registered mailing address; not a verified service area or job site.';
comment on column public.licenses.geocode_address_hash is 'SHA-256 of versioned normalized original address; never a hash of the Census replacement address.';

-- Any source-address change invalidates old enrichment, including changes made
-- by the existing bulk importer. This does not add a privileged trigger function.
create function public.invalidate_license_geocode() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.address_line_1,new.address_line_2,new.city,new.state,new.zip)
    is distinct from row(old.address_line_1,old.address_line_2,old.city,old.state,old.zip) then
    new.latitude := null; new.longitude := null; new.geocode_matched_address := null;
    new.geocode_source := null; new.geocode_status := null; new.geocode_quality := null;
    new.geocoded_at := null; new.geocode_address_hash := null; new.geocode_benchmark := null;
  end if;
  return new;
end;
$$;
revoke all on function public.invalidate_license_geocode() from public, anon, authenticated;
create trigger licenses_invalidate_geocode before update of address_line_1,address_line_2,city,state,zip
  on public.licenses for each row execute function public.invalidate_license_geocode();

-- Bounded, atomic compare-and-set. A source address changed/deleted while Census
-- was working must never receive coordinates from the stale batch snapshot.
create function public.apply_census_geocodes(items jsonb)
returns table(license_id bigint, applied boolean)
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; changed bigint;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 200 then
    raise exception 'Supply 1 to 200 geocoding updates';
  end if;
  for item in select value from jsonb_array_elements(items) loop
    license_id := (item->>'id')::bigint;
    update public.licenses l set
      latitude = (item->'result'->>'latitude')::double precision,
      longitude = (item->'result'->>'longitude')::double precision,
      geocode_matched_address = item->'result'->>'matchedAddress',
      geocode_source = 'us_census', geocode_benchmark = 'Public_AR_Current',
      geocode_status = item->'result'->>'status', geocode_quality = item->'result'->>'quality',
      geocoded_at = (item->'result'->>'geocodedAt')::timestamptz,
      geocode_address_hash = item->>'hash'
    where l.id = license_id and nullif(trim(l.source_status),'') is not null
      and jsonb_build_object('address_line_1',l.address_line_1,'address_line_2',l.address_line_2,
        'city',l.city,'state',l.state,'zip',l.zip) = item->'snapshot';
    get diagnostics changed = row_count;
    applied := changed = 1;
    return next;
  end loop;
end;
$$;
revoke all on function public.apply_census_geocodes(jsonb) from public, anon, authenticated;
grant execute on function public.apply_census_geocodes(jsonb) to service_role;
-- Existing licenses RLS/public-read policies and table grants remain unchanged.
