import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { releaseDate, sameRelease, assertNotOlder, releaseKey } from "./source";
import { RefreshSnapshot, requiredHeaders, validateSourceRow, type Payload } from "./snapshot";
import { runRefresh, type RefreshRun, type RefreshIO } from "./pipeline";
import { sameDocument } from "./index-sync";
import type { ContractorDocument } from "@/lib/typesense/schema";
import { freshnessState } from "./freshness-state";
import { matchesSavedGeocode } from "./geocode";
import { addressSnapshot, prepareAddress, emptyGeocode } from "@/lib/geocoding/address";
import type { SourceAddress } from "@/lib/geocoding/pipeline";
vi.mock("server-only",()=>({}));

describe("release detection",()=>{
  it("uses the exact dated label, not an unrelated date on the page",()=>{
    expect(releaseDate('Other date 1/1/2000 <span id="MainContent_lblMasterFile">Updated as of 10/28/2026</span>',new Date('2026-10-30'))).toBe('2026-10-28');
  });
  it.each(['no label','<span id="MainContent_lblMasterFile">Updated as of 2/30/2026</span>','<span id="MainContent_lblMasterFile">Updated as of 1/1/2100</span>'])("rejects changed/invalid date labels",html=>expect(()=>releaseDate(html)).toThrow());
  it("tracks personnel and insurance releases independently",()=>{
    const first={'license-master.csv':'2026-10-28','personnel.csv':'2026-10-29','workers-comp.csv':'2026-10-29'};
    expect(sameRelease(first,first)).toBe(true);
    expect(sameRelease(first,{...first,'personnel.csv':'2026-10-30'})).toBe(false);
    expect(()=>assertNotOlder({...first,'workers-comp.csv':'2026-10-20'},first)).toThrow('regressed');
    expect(releaseKey(first)).not.toBe(releaseKey({...first,'personnel.csv':'different content'}));
    expect(releaseKey(first,first)).not.toBe(releaseKey(first,{...first,'personnel.csv':'2026-10-30'}));
  });
});

describe("validated local snapshots",()=>{
  it("stages all three files and quarantines details outside the master without losing them",async()=>{
    const dir=await mkdtemp(join(tmpdir(),'ccs-refresh-test-'));const store=new RefreshSnapshot(join(dir,'test.sqlite'));
    try {
      for(const table of ['licenses','personnel','workers_comp'] as const) {
        const values:Record<string,string>={LicenseNo:'1082303','LIC-NO':'1082303',BusinessName:'Fixture Contractor',PrimaryStatus:'Clear',Name:'DOE  JANE','EMP-Titl-CDE':'OWNER','Classifications(s)':'C-36',WorkersCompCoverageType:'Exempt'};
        const headers=requiredHeaders[table];const file=join(dir,`${table}.csv`);
        await writeFile(file,`${headers.join(',')}\n${headers.map(h=>values[h]??'').join(',')}\n`);
        expect(await store.stage(table,file)).toBe(1);
      }
      expect(store.validate({licenses:1,personnel:1,workers_comp:1})).toEqual({licenses:1,personnel:1,workers_comp:1});
      expect(store.has('999')).toBe(false);
      const batch=store.batch('');expect(batch).toHaveLength(1);expect(batch[0].license.classifications).toEqual(['c36']);expect(batch[0].personnel[0].full_name).toBe('JANE DOE');
      expect(store.batch('1082303')).toEqual([]);
      const digest=store.digest();store.db.prepare("UPDATE licenses SET payload=replace(payload,'Fixture Contractor','Changed Contractor')").run();expect(store.digest()).not.toBe(digest);
      store.db.prepare('INSERT INTO personnel VALUES(?,?)').run('999','{}');
      expect(store.validate({licenses:1,personnel:1,workers_comp:1})).toEqual({licenses:1,personnel:2,workers_comp:1});
      const before=store.digest();
      expect(store.membership()).toEqual({
        personnel:{matchedRows:1,matchedLicenses:1,quarantinedRows:1,quarantinedLicenses:1},
        workers_comp:{matchedRows:1,matchedLicenses:1,quarantinedRows:0,quarantinedLicenses:0},
      });
      expect(store.digest()).toBe(before);
      expect(store.has('999')).toBe(false);
      expect(store.batch('')).toHaveLength(1);
      expect(store.batch('')[0].personnel).toHaveLength(1);
      expect(store.db.prepare('SELECT count(*) AS n FROM personnel WHERE number=?').get('999')!.n).toBe(1);
    } finally {store.close();await rm(dir,{recursive:true});}
  });
  it("rejects unknown dates, empty names and malformed amounts rather than clearing source facts",()=>{
    expect(()=>validateSourceRow('licenses',{BusinessName:'Fixture',PrimaryStatus:'Clear',IssueDate:'2/30/2026'})).toThrow('date');
    expect(()=>validateSourceRow('personnel',{Name:'',LastUpdated:''})).toThrow('name');
    expect(()=>validateSourceRow('licenses',{BusinessName:'Fixture',PrimaryStatus:'Clear',CBAmount:'unknown'})).toThrow('amount');
    expect(()=>validateSourceRow('personnel',{Name:'DOE  JANE','ASSN-DT':'1/2/2020|3/4/2021','DIS-ASSN-DT':'|'})).not.toThrow();
  });
  it("rolls back malformed CSV instead of accepting a partial snapshot",async()=>{
    const dir=await mkdtemp(join(tmpdir(),'ccs-refresh-test-'));const store=new RefreshSnapshot(join(dir,'test.sqlite'));
    try {await writeFile(join(dir,'bad.csv'),'LicenseNo,BusinessName\n123,Fixture\n');await expect(store.stage('licenses',join(dir,'bad.csv'))).rejects.toThrow('Invalid licenses snapshot');expect(()=>store.validate()).toThrow('incomplete');}
    finally {store.close();await rm(dir,{recursive:true});}
  });
  it("never joins historical, newer or zero-padded IDs to another license",async()=>{
    const dir=await mkdtemp(join(tmpdir(),'ccs-membership-test-'));const store=new RefreshSnapshot(join(dir,'test.sqlite'));
    try {
      store.db.prepare('INSERT INTO licenses VALUES(?,?)').run('123',JSON.stringify({license_number:'123'}));
      for(const number of ['123','00123','999','999']) store.db.prepare('INSERT INTO personnel VALUES(?,?)').run(number,JSON.stringify({license_number:number}));
      for(const number of ['123','12','999']) store.db.prepare('INSERT INTO workers_comp VALUES(?,?)').run(number,JSON.stringify({license_number:number}));
      expect(store.validate({licenses:1,personnel:1,workers_comp:1})).toEqual({licenses:1,personnel:4,workers_comp:3});
      expect(store.membership()).toEqual({
        personnel:{matchedRows:1,matchedLicenses:1,quarantinedRows:3,quarantinedLicenses:2},
        workers_comp:{matchedRows:1,matchedLicenses:1,quarantinedRows:2,quarantinedLicenses:2},
      });
      expect(store.batch('')).toEqual([{license:{license_number:'123'},personnel:[{license_number:'123'}],workers_comp:[{license_number:'123'}]}]);
      expect(store.batch('123')).toEqual([]);
    } finally {store.close();await rm(dir,{recursive:true});}
  });
  it.each(['personnel','workers_comp'] as const)("still rejects an entirely unrelated %s file",async table=>{
    const dir=await mkdtemp(join(tmpdir(),'ccs-membership-test-'));const store=new RefreshSnapshot(join(dir,'test.sqlite'));
    try {
      store.db.prepare('INSERT INTO licenses VALUES(?,?)').run('123','{}');
      for(const related of ['personnel','workers_comp'] as const) store.db.prepare(`INSERT INTO ${related} VALUES(?,?)`).run(related===table?'999':'123','{}');
      expect(()=>store.validate({licenses:1,personnel:1,workers_comp:1})).toThrow('no matching master licenses');
    } finally {store.close();await rm(dir,{recursive:true});}
  });
});

function harness() {
  let run:RefreshRun={id:'fixture',phase:'applying',cursor:'',processed:0,expected:1};
  const record:Payload={license:{license_number:'123'},personnel:[],workers_comp:[]};
  const io:RefreshIO={read:async()=>({...run}),batch:after=>after ? [] : [record],apply:vi.fn(async()=>{run={...run,cursor:'123',processed:1};return {cursor:'123',processed:1};}),reconcile:vi.fn(async()=>{}),advance:vi.fn(async phase=>{run.phase=phase;}),geocode:vi.fn(async()=>{}),index:vi.fn(async()=>{})};
  return {io,run};
}
describe("resumable refresh orchestration",()=>{
  it("does not advance until retention is acknowledged, and resumes without rewriting source",async()=>{
    const {io}=harness();vi.mocked(io.reconcile).mockRejectedValueOnce(new Error('lost retention response'));
    await expect(runRefresh(io)).rejects.toThrow('lost retention');
    expect(io.geocode).not.toHaveBeenCalled();expect(io.advance).not.toHaveBeenCalled();
    await runRefresh(io);expect(io.apply).toHaveBeenCalledTimes(1);expect(io.reconcile).toHaveBeenCalledTimes(2);
    expect((await io.read()).phase).toBe('complete');
  });
  it("advances the freshness date only after geocoding and verified indexing",async()=>{
    const {io}=harness();await runRefresh(io);expect(vi.mocked(io.advance).mock.calls.map(c=>c[0])).toEqual(['geocoding','indexing','complete']);
  });
  it("resumes after an index outage without repeating source writes or geocoding",async()=>{
    const {io}=harness();vi.mocked(io.index).mockRejectedValueOnce(new Error('offline'));
    await expect(runRefresh(io)).rejects.toThrow('offline');expect((await io.read()).phase).toBe('indexing');
    await runRefresh(io);expect(io.apply).toHaveBeenCalledTimes(1);expect(io.geocode).toHaveBeenCalledTimes(1);expect((await io.read()).phase).toBe('complete');
  });
  it("recovers an acknowledged source write after its network response was lost",async()=>{
    const {io}=harness();const apply=io.apply;io.apply=vi.fn(async(after:string,items:Payload[])=>{await apply(after,items);throw new Error('lost response');});
    await expect(runRefresh(io)).rejects.toThrow('lost response');await runRefresh(io);expect(io.apply).toHaveBeenCalledTimes(1);expect((await io.read()).phase).toBe('complete');
  });
  it("does not index on geocoding failure or incomplete source counts",async()=>{
    const {io}=harness();vi.mocked(io.geocode).mockRejectedValue(new Error('stale acknowledgement'));
    await expect(runRefresh(io)).rejects.toThrow('stale');expect(io.index).not.toHaveBeenCalled();
    const second=harness();second.io.batch=()=>[];await expect(runRefresh(second.io)).rejects.toThrow('count mismatch');expect(second.io.advance).not.toHaveBeenCalled();
  });
  it("rejects invalid acknowledgements",async()=>{
    const {io}=harness();io.apply=async()=>({cursor:'999',processed:1});await expect(runRefresh(io)).rejects.toThrow('Invalid refresh acknowledgement');expect(io.advance).not.toHaveBeenCalled();
  });
  it("does nothing for completed runs",async()=>{
    const {io,run}=harness();run.phase='complete';await runRefresh(io);expect(io.apply).not.toHaveBeenCalled();expect(io.index).not.toHaveBeenCalled();
  });
});
describe("index and freshness validation",()=>{
  it("audits source hash, snapshot, status, timestamp and absence of nonaccepted coordinates",()=>{
    const result=emptyGeocode('skipped_po_box','skipped_po_box','2026-10-28T00:00:00Z');
    const address={address_line_1:'PO BOX 123',address_line_2:null,city:'Sacramento',state:'CA',zip:'95814'};
    const hash=prepareAddress(address).hash;
    const row:SourceAddress={...address,id:1,license_number:'123',business_name:'Fixture',source_status:'Clear',latitude:null,longitude:null,geocode_status:result.status,geocode_quality:result.quality,geocode_source:result.source,geocode_benchmark:result.benchmark,geocode_matched_address:null,geocode_address_hash:hash,geocoded_at:result.geocodedAt};
    const check=(value:SourceAddress)=>matchesSavedGeocode(value,hash,JSON.stringify(addressSnapshot(address)),result);
    expect(check(row)).toBe(true);
    expect(check({...row,latitude:38,longitude:-121})).toBe(false);
    expect(check({...row,address_line_1:'New address'})).toBe(false);
    expect(check({...row,geocode_source:'different'})).toBe(false);
    expect(check({...row,geocoded_at:'2026-10-29'})).toBe(false);
  });
  it("compares actual documents, including removal of coordinates and optional fields",()=>{
    const doc={id:'1',business_name:'Fixture',personnel_names:['B','A'],indexed_at:1,has_location:false,location:null} as ContractorDocument;
    expect(sameDocument(doc,{...doc,indexed_at:2,personnel_names:['A','B']})).toBe(true);
    expect(sameDocument(doc,{...doc,location:[38,-121]})).toBe(false);
    expect(sameDocument(doc,{...doc,business_name:'Stale'})).toBe(false);
    expect(sameDocument(doc,{...doc,issue_date:100})).toBe(false);
    expect(sameDocument({...doc,location:[38,-121]},{...doc,location:[-121,38]})).toBe(false);
  });
  it("never uses geocoding/update timestamps or unfinished imports as a fresh date",()=>{
    const rows=[{phase:'indexing',completed_at:null,source_dates:{}},{phase:'complete',completed_at:'2026-10-28T01:00:00Z',source_dates:{master:'2026-10-27'}}];
    expect(freshnessState(rows,Date.parse('2026-10-30'))).toEqual({pending:true,updatedAt:'2026-10-28T01:00:00Z',sourceDates:['2026-10-27']});
    expect(freshnessState([{phase:'complete',completed_at:'2099-01-01',source_dates:{}}])).toEqual({pending:false});
  });
});
