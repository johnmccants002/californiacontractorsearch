import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFile } from "node:fs/promises";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { mapLicense, mapPersonnel } from "./mapping.mjs";
let db:PGlite;
const first='00000000-0000-4000-8000-000000000001';
const second='00000000-0000-4000-8000-000000000002';
const payload=(number='123')=>({license:mapLicense({LicenseNo:number,BusinessName:'Fixture',PrimaryStatus:'Clear',MailingAddress:'123 Fixture St',City:'Sacramento',State:'CA',ZIPCode:'95814','Classifications(s)':'C-36'}),personnel:[mapPersonnel({'LIC-NO':number,Name:'DOE  JANE','EMP-Titl-CDE':'OWNER'})],workers_comp:[]});
const apply=(run=first,items=[payload()])=>db.query('select public.apply_cslb_refresh_batch($1,$2,$3::jsonb)',[run,'',JSON.stringify(items)]);
const retain=(ids:(number|null)[]=[20],run=first)=>db.query<{count:number}>('select public.retain_missing_cslb_batch($1,$2) as count',[run,ids]);
const advance=(phase:string,run=first)=>db.query('select public.advance_cslb_refresh($1,$2)',[run,phase]);
async function complete(run=first) {
  await advance('geocoding',run);await advance('indexing',run);
  await db.exec('update public.cslb_refresh_changes set indexed=true');await advance('complete',run);
}
beforeAll(async()=>{
  db=await PGlite.create({extensions:{pg_trgm}});
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
  for(const name of ['20261004033808_initial_schema','20261004033849_lock_down_public_writes','20261004042323_import_cslb_dataset','20261028045933_census_geocoding_enrichment','20261031054112_resumable_cslb_refresh']) await db.exec(await readFile(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
  // Emulate Supabase's pre-existing service grants, before testing the new grants.
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;');
  await db.exec(await readFile(new URL('../../supabase/migrations/20261031072412_retain_missing_cslb_records.sql',import.meta.url),'utf8'));
},30000);
beforeEach(async()=>{
  await db.exec(`RESET ROLE;TRUNCATE public.cslb_refresh_runs,public.licenses CASCADE;
    INSERT INTO public.licenses(id,license_number,business_name,license_status,source_status,address_line_1,city,state,zip,source_updated_at)
      VALUES(10,'123','Current Fixture','ACTIVE','Clear','123 Fixture St','Sacramento','CA','95814','2026-10-03'),
      (20,'999','Missing Fixture','SUSPENDED','Suspended','999 Fixture St','Sacramento','CA','95814','2026-10-03');
    INSERT INTO public.personnel(license_id,first_name,last_name,full_name) VALUES(20,'Retained','Person','Retained Person');
    INSERT INTO public.cslb_refresh_runs(id,release_key,index_version,source_dates,source_counts,expected,retained_expected)
      VALUES('${first}',repeat('a',64),'contractors_v2','{"license-master.csv":"2026-10-28"}','{}',1,1);`);
});
afterAll(async()=>{await db?.close();});

describe('missing-master retention in isolated Postgres',()=>{
  it('preserves every source fact, stable ID, child record, and accepted coordinate',async()=>{
    await db.exec("update public.licenses set latitude=38,longitude=-121,geocode_source='us_census',geocode_matched_address='999 FIXTURE ST',geocode_status='accepted',geocode_quality='exact',geocode_benchmark='Public_AR_Current',geocode_address_hash=repeat('a',64),geocoded_at=now() where id=20");
    const before=(await db.query("select to_jsonb(l)-'updated_at'-'source_missing_since' as record from public.licenses l where id=20")).rows;
    const people=(await db.query('select * from public.personnel where license_id=20')).rows;
    await db.exec('SET ROLE service_role');await apply();await retain();
    expect((await db.query("select to_jsonb(l)-'updated_at'-'source_missing_since' as record from public.licenses l where id=20")).rows).toEqual(before);
    expect((await db.query('select * from public.personnel where license_id=20')).rows).toEqual(people);
    expect((await db.query('select source_missing_since::text as date from public.licenses where id=20')).rows).toEqual([{date:'2026-10-28'}]);
    await complete();expect((await db.query('select id from public.licenses order by id')).rows).toEqual([{id:10},{id:20}]);
  });
  it('replays lost acknowledgements without duplicate receipts or changing first-absence date',async()=>{
    await apply();expect((await retain()).rows).toEqual([{count:1}]);expect((await retain()).rows).toEqual([{count:1}]);
    await complete();
    await db.exec(`insert into public.cslb_refresh_runs(id,release_key,index_version,source_dates,source_counts,expected,retained_expected) values('${second}',repeat('b',64),'contractors_v2','{"license-master.csv":"2026-10-30"}','{}',1,1)`);
    await apply(second);await retain([20],second);await complete(second);
    expect((await db.query('select source_missing_since::text as date from public.licenses where id=20')).rows).toEqual([{date:'2026-10-28'}]);
  });
  it('clears absence and queues a returning license even when its payload fingerprint is unchanged',async()=>{
    // An earlier import supplied the exact payload now returning.
    await db.exec('update public.cslb_refresh_runs set expected=2,retained_expected=0');
    await apply(first,[payload(),payload('999')]);await complete();
    const people=(await db.query('select * from public.personnel where license_id=20')).rows;
    await db.exec(`insert into public.cslb_refresh_runs(id,release_key,index_version,source_dates,source_counts,expected,retained_expected) values('${second}',repeat('b',64),'contractors_v2','{"license-master.csv":"2026-10-29"}','{}',1,1)`);
    await apply(second);await retain([20],second);await complete(second);
    const third='00000000-0000-4000-8000-000000000003';
    await db.exec(`insert into public.cslb_refresh_runs(id,release_key,index_version,source_dates,source_counts,expected) values('${third}',repeat('c',64),'contractors_v2','{"license-master.csv":"2026-10-30"}','{}',2)`);
    await apply(third,[payload(),payload('999')]);
    expect((await db.query('select source_missing_since from public.licenses where id=20')).rows).toEqual([{source_missing_since:null}]);
    expect((await db.query('select * from public.personnel where license_id=20')).rows).toEqual(people);
    expect((await db.query('select license_id from public.cslb_refresh_changes where run_id=$1',[third])).rows).toEqual([{license_id:20}]);
    await complete(third);
  });
  it('requires source completion, exact retention counts, and index acknowledgements',async()=>{
    await expect(retain()).rejects.toThrow('Finish the source');await apply();
    await expect(advance('geocoding')).rejects.toThrow('Retention plan incomplete');
    await retain();await advance('geocoding');await advance('indexing');
    await expect(advance('complete')).rejects.toThrow('Unverified');
    await db.exec('update public.cslb_refresh_changes set indexed=true');await advance('complete');
  });
  it.each([[],[20,20],[null],[10],[12345],Array.from({length:201},(_,i)=>i+1)].map(ids=>({ids})))('rejects invalid, current or unknown IDs without partial markers: $ids',async ({ids})=>{
    await apply();await expect(retain(ids)).rejects.toThrow();
    expect((await db.query('select * from public.cslb_refresh_retained')).rows).toEqual([]);
    expect((await db.query('select source_missing_since from public.licenses where id=20')).rows).toEqual([{source_missing_since:null}]);
  });
  it('rolls back receipts and warnings when the pinned missing count is exceeded',async()=>{
    await apply();await db.exec('update public.cslb_refresh_runs set retained_expected=0');
    await expect(retain()).rejects.toThrow('count exceeded');
    expect((await db.query('select * from public.cslb_refresh_retained')).rows).toEqual([]);
    await expect(advance('geocoding')).rejects.toThrow('Unreconciled');
  });
  it('rejects an unplanned source ID or cleared warning before completion',async()=>{
    await apply();await retain();
    await db.exec("insert into public.licenses(id,license_number,business_name,license_status,source_status) values(30,'888','Unexpected','ACTIVE','Clear')");
    await expect(advance('geocoding')).rejects.toThrow('Unreconciled');
    await db.exec("delete from public.licenses where id=30;update public.licenses set source_missing_since=null where id=20");
    await expect(advance('geocoding')).rejects.toThrow('Unreconciled');
  });
  it('keeps receipts and writer functions private, with invoker security and RLS',async()=>{
    await apply();
    for(const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      expect((await db.query('select source_missing_since from public.licenses')).rows).toHaveLength(2);
      await expect(retain()).rejects.toThrow('permission denied');
      await expect(db.query('select * from public.cslb_refresh_retained')).rejects.toThrow('permission denied');
      await expect(db.query('select retained_expected from public.cslb_refresh_runs')).rejects.toThrow('permission denied');
      await expect(db.exec("update public.licenses set source_missing_since='2026-10-28'")).rejects.toThrow('permission denied');
      await db.exec('RESET ROLE');
    }
    expect((await db.query("select relrowsecurity from pg_class where oid='public.cslb_refresh_retained'::regclass")).rows).toEqual([{relrowsecurity:true}]);
    expect((await db.query("select bool_and(not prosecdef and proconfig @> array['search_path=pg_catalog','statement_timeout=30s']) as safe from pg_proc where proname in ('retain_missing_cslb_batch','clear_cslb_missing_on_seen','advance_cslb_refresh')")).rows).toEqual([{safe:true}]);
  });
});
