import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFile } from "node:fs/promises";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { mapLicense, mapPersonnel } from "./mapping.mjs";
let db:PGlite;
const id='00000000-0000-4000-8000-000000000001';
const payload=()=>({license:mapLicense({LicenseNo:'123',BusinessName:'New Fixture',PrimaryStatus:'Clear',MailingAddress:'123 New St',City:'Sacramento',State:'CA',ZIPCode:'95814','Classifications(s)':'C-36',WorkersCompCoverageType:'Exempt'}),personnel:[mapPersonnel({'LIC-NO':'123',Name:'DOE  JANE','EMP-Titl-CDE':'OWNER'})],workers_comp:[]});
const apply=(items=[payload()],after='')=>db.query<{apply_cslb_refresh_batch:{cursor:string;processed:number;replayed?:boolean}}>('select public.apply_cslb_refresh_batch($1,$2,$3::jsonb)',[id,after,JSON.stringify(items)]);
const advance=(phase:string)=>db.query('select public.advance_cslb_refresh($1,$2)',[id,phase]);
beforeAll(async()=>{
  db=await PGlite.create({extensions:{pg_trgm}});
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
  for(const name of ['20261004033808_initial_schema','20261004033849_lock_down_public_writes','20261004042323_import_cslb_dataset','20261028045933_census_geocoding_enrichment','20261031054112_resumable_cslb_refresh']) await db.exec(await readFile(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
  // Supabase provisions these service-role privileges outside the app migrations.
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;');
},30000);
beforeEach(async()=>{
  await db.exec(`RESET ROLE;TRUNCATE public.cslb_refresh_runs,public.licenses CASCADE;
    INSERT INTO public.licenses(id,license_number,business_name,license_status,source_status,address_line_1,city,state,zip) VALUES(10,'123','Old Fixture','ACTIVE','Clear','Old Address','Sacramento','CA','95814');
    INSERT INTO public.personnel(license_id,first_name,last_name,full_name) VALUES(10,'Old','Person','Old Person');
    INSERT INTO public.cslb_refresh_runs(id,release_key,index_version,source_dates,source_counts,expected) VALUES('${id}',repeat('a',64),'contractors_v1','{}','{}',1);`);
});
afterAll(async()=>{await db?.close();});
describe('refresh SQL in isolated Postgres',()=>{
  it('denies public writes, worker checkpoints, and RPC execution while allowing aggregate dates',async()=>{
    for(const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      expect((await db.query('select phase,completed_at from public.cslb_refresh_runs')).rows).toHaveLength(1);
      await expect(db.query('select cursor from public.cslb_refresh_runs')).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from public.cslb_refresh_fingerprints')).rejects.toThrow(/permission denied/);
      await expect(apply()).rejects.toThrow(/permission denied/);
      await expect(db.exec("update public.cslb_refresh_runs set phase='geocoding'")).rejects.toThrow(/permission denied/);
      await db.exec('RESET ROLE');
    }
    expect((await db.query("select prosecdef from pg_proc where proname in ('apply_cslb_refresh_batch','advance_cslb_refresh')")).rows).toEqual([{prosecdef:false},{prosecdef:false}]);
  });
  it('updates the license, details, fallback search text, and outbox atomically, preserving its ID',async()=>{
    await db.exec('SET ROLE service_role');await apply();
    expect((await db.query('select id,business_name from public.licenses')).rows).toEqual([{id:10,business_name:'New Fixture'}]);
    expect((await db.query('select full_name from public.personnel')).rows).toEqual([{full_name:'JANE DOE'}]);
    expect((await db.query('select exemption from public.workers_comp')).rows).toEqual([{exemption:true}]);
    expect((await db.query<{search_text:string}>('select search_text from public.licenses')).rows[0].search_text).toContain('JANE DOE');
    expect((await db.query('select license_id,indexed from public.cslb_refresh_changes')).rows).toEqual([{license_id:10,indexed:false}]);
  });
  it('replays only the identical last batch after a lost response, without duplicate details',async()=>{
    await apply();expect((await apply()).rows[0].apply_cslb_refresh_batch.replayed).toBe(true);
    expect((await db.query('select * from public.personnel')).rows).toHaveLength(1);
    const changed=payload();changed.license.business_name='Different';await expect(apply([changed])).rejects.toThrow('cursor mismatch');
  });
  it('rolls back an entire batch when any related record is invalid',async()=>{
    const invalid=payload();invalid.personnel[0].first_name=null;
    await expect(apply([invalid])).rejects.toThrow(/not-null/);
    expect((await db.query('select business_name from public.licenses')).rows).toEqual([{business_name:'Old Fixture'}]);
    expect((await db.query('select full_name from public.personnel')).rows).toEqual([{full_name:'Old Person'}]);
    expect((await db.query('select processed from public.cslb_refresh_runs')).rows).toEqual([{processed:0}]);
  });
  it('invalidates old coordinates when the registered address changes',async()=>{
    await db.exec("update public.licenses set latitude=38,longitude=-121,geocode_source='us_census',geocode_matched_address='OLD ADDRESS',geocode_status='accepted',geocode_quality='exact',geocode_benchmark='Public_AR_Current',geocode_address_hash=repeat('a',64),geocoded_at=now() where id=10");
    await apply();expect((await db.query('select latitude,longitude,geocode_address_hash from public.licenses')).rows).toEqual([{latitude:null,longitude:null,geocode_address_hash:null}]);
  });
  it('blocks premature completion and missing source licenses rather than deleting them',async()=>{
    await expect(advance('geocoding')).rejects.toThrow('incomplete');await apply();
    await db.exec("insert into public.licenses(license_number,business_name,license_status,source_status) values('999','Retained Fixture','ACTIVE','Clear')");
    await expect(advance('geocoding')).rejects.toThrow('Unreconciled');expect((await db.query('select * from public.licenses')).rows).toHaveLength(2);
  });
  it('marks a run complete only after all source and index acknowledgements',async()=>{
    await apply();await advance('geocoding');await advance('indexing');await expect(advance('complete')).rejects.toThrow('Unverified');
    await db.exec('update public.cslb_refresh_changes set indexed=true');await advance('complete');
    expect((await db.query<{completed_at:string}>('select completed_at from public.cslb_refresh_runs')).rows[0].completed_at).toBeTruthy();
  });
  it('does not touch unchanged license/detail rows on subsequent releases',async()=>{
    await apply();const before=(await db.query('select id from public.personnel')).rows;
    await db.exec(`update public.cslb_refresh_runs set phase='complete',completed_at=now();insert into public.cslb_refresh_runs(id,release_key,index_version,source_dates,source_counts,expected) values('00000000-0000-4000-8000-000000000002',repeat('b',64),'contractors_v1','{}','{}',1)`);
    await db.query('select public.apply_cslb_refresh_batch($1,$2,$3::jsonb)',['00000000-0000-4000-8000-000000000002','',JSON.stringify([payload()])]);
    expect((await db.query('select id from public.personnel')).rows).toEqual(before);
    expect((await db.query("select * from public.cslb_refresh_changes where run_id='00000000-0000-4000-8000-000000000002'")).rows).toEqual([]);
  });
  it('permits only one unfinished release and rejects cross-license details',async()=>{
    await expect(db.exec("insert into public.cslb_refresh_runs(id,release_key,index_version,source_dates,source_counts,expected) values('00000000-0000-4000-8000-000000000002',repeat('b',64),'contractors_v1','{}','{}',1)")).rejects.toThrow(/unique/);
    const invalid=payload();invalid.personnel[0].license_number='999';await expect(apply([invalid])).rejects.toThrow('another license');
  });
});
