import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapIndexDocument, type IndexRow, type ContractorDocument } from "@/lib/typesense/schema";
import { syncRefreshIndex } from "./index-sync";

const remote = vi.hoisted(()=>({alias:'contractors_v2',ready:true,healthy:true,importOk:true,acknowledged:false,stale:false,found:1,document:null as ContractorDocument|null,imports:vi.fn()}));
vi.mock("@/lib/typesense/config",()=>({typesenseConfig:()=>({host:'fixture.invalid',port:443,protocol:'https',key:'fixture',collection:'contractors'})}));
vi.mock("typesense",()=>({Client:class {
  health={retrieve:async()=>({ok:remote.healthy})};
  aliases(){return {retrieve:async()=>({collection_name:remote.alias})};}
  collections(){return {documents:()=>({
    retrieve:async()=>({ready:remote.ready,schema_version:2}),
    import:async(docs:ContractorDocument[])=>{remote.imports(docs);remote.document=docs[0];return [{success:remote.importOk}];},
    search:async(params:{per_page:number})=>params.per_page===0 ? {found:remote.found} : {found:1,hits:[{document:remote.stale ? {...remote.document,business_name:'Stale name'} : remote.document}]},
  })};}
}}));
const row:IndexRow={id:1,license_number:'123',business_name:'Fixture Contractor',source_status:'Clear',license_status:'ACTIVE',city:'Sacramento',county:'Sacramento',state:'CA',zip:'95814',issue_date:null,updated_at:'2026-10-28',source_updated_at:'2026-10-28',personnel:[],license_classifications:[],address_line_1:'PO BOX 123',latitude:null,longitude:null};
function database() {
  return {from(table:string){
    let update=false;
    const chain={select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,in:()=>chain,abortSignal:()=>chain,update:()=>{update=true;return chain;},then(resolve:(value:unknown)=>void){
      if(update) remote.acknowledged=true;
      resolve({status:200,error:null,data:table==='licenses' ? [row] : update || remote.acknowledged ? [] : [{license_id:1}]});
    }};return chain;
  }} as unknown as SupabaseClient;
}
beforeEach(()=>{Object.assign(remote,{alias:'contractors_v2',ready:true,healthy:true,importOk:true,acknowledged:false,stale:false,found:1,document:null});remote.imports.mockClear();});
describe('verified refresh outbox synchronization',()=>{
  it('validates the combined master-plus-retained count, without deleting retained documents',async()=>{
    remote.found=246604; // 245927 master + 677 retained, not master count alone.
    await syncRefreshIndex(database(),'run',245927+677,'contractors_v2');
    expect(remote.acknowledged).toBe(true);
    await expect(syncRefreshIndex(database(),'run',245927,'contractors_v2')).rejects.toThrow('count/alias');
  });
  it('upserts the full document and acknowledges only after source/index readback',async()=>{
    await syncRefreshIndex(database(),'run',1,'contractors_v2');
    expect(remote.acknowledged).toBe(true);
    expect(remote.document).toMatchObject({...mapIndexDocument(row,Date.now(),true),indexed_at:expect.any(Number),has_location:false,location:null});
  });
  it.each(['unavailable','unready','alias changed','rejected','stale readback'] as const)('retains pending changes on %s',async failure=>{
    if(failure==='unavailable') remote.healthy=false;
    if(failure==='unready') remote.ready=false;
    if(failure==='alias changed') remote.alias='replacement_v3';
    if(failure==='rejected') remote.importOk=false;
    if(failure==='stale readback') remote.stale=true;
    await expect(syncRefreshIndex(database(),'run',1,'contractors_v2')).rejects.toThrow();
    expect(remote.acknowledged).toBe(false);
  });
  it('blocks completion on a wrong final count and rechecks it on resume',async()=>{
    remote.found=2;
    await expect(syncRefreshIndex(database(),'run',1,'contractors_v2')).rejects.toThrow('count/alias');
    expect(remote.acknowledged).toBe(true);
    remote.found=1;await syncRefreshIndex(database(),'run',1,'contractors_v2');
    expect(remote.imports).toHaveBeenCalledTimes(1);
  });
});
