import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "typesense";
import { describe, expect, it, vi } from "vitest";
import { retainedHash, assertRetainedFacts, assertCensusRecord, auditCoordinates, auditIndex, prepareRetainedBaseline } from "./audit";
import { addressSnapshot, prepareAddress, emptyGeocode } from "../geocoding/address";
import { GeocodingStore } from "../geocoding/store";
import type { SourceAddress } from "../geocoding/pipeline";

const source="https://example.supabase.co";
function fixture() {
  const address={address_line_1:"PO BOX 1",address_line_2:null,city:"Sacramento",state:"CA",zip:"95814"};
  const result=emptyGeocode("skipped_po_box","skipped_po_box","2026-10-31T12:00:00Z");
  const prepared=prepareAddress(address);
  const row:SourceAddress={...address,id:1,license_number:"123",business_name:"Fixture",source_status:"Clear",latitude:null,longitude:null,geocode_status:result.status,geocode_source:result.source,geocode_quality:result.quality,geocode_matched_address:null,geocoded_at:result.geocodedAt,geocode_benchmark:result.benchmark,geocode_address_hash:prepared.hash};
  return {address,result,prepared,row,cached:{hash:prepared.hash,snapshot:JSON.stringify(addressSnapshot(address)),result}};
}
function sourceDb(row:Record<string,unknown>) {
  let cursor=0;
  const builder={select:()=>builder,not:()=>builder,neq:()=>builder,gt:(_field:string,n:number)=>{cursor=n;return builder;},order:()=>builder,limit:()=>builder,in:()=>builder,
    abortSignal:()=>Promise.resolve({error:null,status:200,data:cursor ? []:[row]})};
  return {from:()=>builder} as unknown as SupabaseClient;
}
describe("reusable refresh audits",()=>{
  it("ignores only operational timestamps/warning and preserves all contractor facts",()=>{
    const row={id:1,license_number:"123",business_name:"Fixture",source_missing_since:null,updated_at:"old",personnel:[{id:1},{id:2}]};
    const before=retainedHash(row),after=retainedHash({...row,updated_at:"new",source_missing_since:"2026-10-30",personnel:[{id:2},{id:1}]});
    expect(()=>assertRetainedFacts([before],[after],"2026-10-30")).not.toThrow();
    expect(()=>assertRetainedFacts([before],[retainedHash({...row,business_name:"Changed",source_missing_since:"2026-10-30"})],"2026-10-30")).toThrow("facts");
    const existing=retainedHash({...row,source_missing_since:"2026-10-01"});
    expect(()=>assertRetainedFacts([existing],[existing],"2026-10-30")).not.toThrow();
    expect(()=>assertRetainedFacts([existing],[after],"2026-10-30")).toThrow("first-missing");
  });
  it("does not recreate a lost baseline after a run started or change membership",async()=>{
    const dir=await mkdtemp(join(tmpdir(),"ccs-audit-test-"));
    try {
      const db=sourceDb({id:1,license_number:"123",source_missing_since:null});
      await expect(prepareRetainedBaseline(db,[1],dir,false)).rejects.toThrow("missing");
      const before=await prepareRetainedBaseline(db,[1],dir,true);
      expect(await prepareRetainedBaseline(db,[1],dir,false)).toEqual(before);
      await expect(prepareRetainedBaseline(db,[2],dir,true)).rejects.toThrow("membership");
    }finally{await rm(dir,{recursive:true});}
  });
  it("rejects changed addresses, stale hashes, invented PO box coordinates and current-job timestamps",()=>{
    const {row,cached}=fixture();expect(()=>assertCensusRecord(row,cached,true)).not.toThrow();
    for(const change of [{address_line_1:"1 Main St"},{geocode_address_hash:"stale"},{latitude:38,longitude:-121},{geocoded_at:"2026-10-30T00:00:00Z"}]) {
      expect(()=>assertCensusRecord({...row,...change},cached,true)).toThrow("coordinates");
    }
  });
  it("audits the entire source against read-only saved Census state",async()=>{
    const dir=await mkdtemp(join(tmpdir(),"ccs-coordinate-test-"));vi.stubEnv("CENSUS_STATE_DIR",dir);
    const f=fixture(),store=new GeocodingStore(join(dir,"jobs.sqlite"));const job=store.createJob(source,1,false);
    store.enqueue(job.id,[{id:1,hash:f.prepared.hash,address:f.prepared.address,snapshot:addressSnapshot(f.address),result:f.result}],1,1);
    store.applied(job.id,[{license_id:1,applied:true}]);store.phase(job.id,"complete");store.close();
    try {
      const report=await auditCoordinates(sourceDb({...f.row}),job.id,source,1);
      expect(report).toMatchObject({scanned:1,accepted:0,outcomes:{skipped_po_box:1}});
      await expect(auditCoordinates(sourceDb({...f.row}),job.id,source,2)).rejects.toThrow("count");
      await expect(auditCoordinates(sourceDb({...f.row,latitude:38}),job.id,source,1)).rejects.toThrow("coordinates");
      expect(JSON.stringify(report)).not.toContain("PO BOX");
    }finally{vi.unstubAllEnvs();await rm(dir,{recursive:true});}
  });
  it("requires matching index total/geographic counts, alias and ready marker",async()=>{
    let alias="version",ready=true,geo=1;
    const client={health:{retrieve:async()=>({ok:true})},aliases:()=>({retrieve:async()=>({collection_name:alias})}),collections:()=>({documents:(id?:string)=>id ? {retrieve:async()=>({ready,schema_version:2})}:{search:async({filter_by}:{filter_by:string})=>({found:filter_by.endsWith("true")?geo:filter_by.endsWith("false")?1:2})}})} as unknown as Client;
    expect(await auditIndex(client,"contractors","version",2,1)).toMatchObject({contractors:2,withLocation:1});
    geo=2;await expect(auditIndex(client,"contractors","version",2,1)).rejects.toThrow("counts");geo=1;
    ready=false;await expect(auditIndex(client,"contractors","version",2,1)).rejects.toThrow("ready");ready=true;
    alias="changed";await expect(auditIndex(client,"contractors","version",2,1)).rejects.toThrow("alias");
  });
  it("places final audits inside the guarded index phase before completion",async()=>{
    const text=await readFile("scripts/refresh-cslb.ts","utf8");
    const guarded=text.slice(text.indexOf("index:async()=>"),text.indexOf("log:state=>"));
    for(const fn of ["syncRefreshIndex","auditRetained","auditCoordinates","auditIndex"])expect(guarded).toContain(fn);
    expect(text).toContain("!allowUntrackedResume");
  });
});
