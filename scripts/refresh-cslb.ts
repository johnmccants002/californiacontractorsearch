import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, access } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { Client } from "typesense";
import { downloads, downloadDataset } from "./download-cslb-data.mjs";
import { loadTypesenseEnvironment } from "./typesense-env";
import { inspectRelease, sameRelease, assertNotOlder, fileHash, releaseKey, type ReleaseDates } from "../lib/refresh/source";
import { RefreshSnapshot, type Table, type MembershipReview } from "../lib/refresh/snapshot";
import { acquireMaintenanceLock } from "../lib/refresh/lock.mjs";
import { runRefresh, type RefreshRun, type RefreshPhase } from "../lib/refresh/pipeline";
import { retentionPlan, reconcileRetained } from "../lib/refresh/retention";
import { refreshGeocoding } from "../lib/refresh/geocode";
import { syncRefreshIndex } from "../lib/refresh/index-sync";
import { readIndexSource } from "../lib/typesense/indexing";
import { typesenseConfig } from "../lib/typesense/config";
import { GEO_SCHEMA_VERSION, type IndexMarker } from "../lib/typesense/schema";

type Manifest = { id:string; source:string; dates:ReleaseDates; hashes:Record<string,string>; key:string; snapshotHash:string; counts:Record<Table,number>; membership:MembershipReview; retainedIds?:number[]; geoJob?:string; indexVersion?:string };
const args = process.argv.slice(2);
const value = (flag:string) => args.includes(flag) ? args[args.indexOf(flag)+1] : undefined;
async function exists(path:string) { try { await access(path); return true; } catch { return false; } }
async function main() {
  if (args.includes("--help")) {
    console.log("Read-only release dates: npm run data:refresh -- --check\nDownload, validate, and plan only: npm run data:refresh -- --prepare\nApply new release or resume: npm run data:refresh -- --run [--resume UUID] [--credentials-file PATH]\nRequires the reviewed refresh migration, CSLB_REFRESH_ENABLED=true, and one persistent Node worker/volume. Not a Vercel request. Missing licenses require review; no automatic deletion. State: .data/refresh (preserve it and .data/census)."); return;
  }
  const modes = ["--check","--prepare","--run"].filter(flag=>args.includes(flag));
  const seen = new Set<string>();
  for(let i=0;i<args.length;i++) {
    const flag=args[i];
    if(seen.has(flag) || !["--check","--prepare","--run","--resume","--credentials-file"].includes(flag)) throw new Error("Unknown/repeated refresh option; use --help.");
    seen.add(flag);
    if(["--resume","--credentials-file"].includes(flag) && (!args[++i] || args[i].startsWith("--"))) throw new Error("Missing refresh option value.");
  }
  if(modes.length!==1 || (value("--resume") && modes[0]!=="--run")) throw new Error("Choose exactly one of --check, --prepare, or --run.");
  await loadTypesenseEnvironment(args);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url || !anon) throw new Error("Public Supabase configuration is required.");
  const source=new URL(url).origin;
  const publicDb=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const latest=await publicDb.from("cslb_refresh_runs").select("id,phase,source_dates,source_counts,completed_at").eq("phase","complete").order("completed_at",{ascending:false}).limit(1).abortSignal(AbortSignal.timeout(15000));
  if(modes[0]==="--check") {
    const dates=await inspectRelease();
    console.log(JSON.stringify({sourceDates:dates,trackingAvailable:!latest.error,lastCompleted:latest.data?.[0]?.completed_at ?? null,newRelease:latest.error || !latest.data?.length ? null : !sameRelease(dates,latest.data[0].source_dates),databaseWrites:0})); return;
  }
  if(modes[0]==="--run" && (process.env.CSLB_REFRESH_ENABLED!=="true" || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error("Refresh writes are disabled. Review/install the migration, then set worker-only CSLB_REFRESH_ENABLED=true and the service-role key.");
  if(modes[0]==="--run" && latest.error) throw new Error("Refresh metadata is unavailable; verify the migration and connectivity before writing.");
  const releaseLock=await acquireMaintenanceLock();
  let snapshot:RefreshSnapshot|undefined;
  try {
    // Honor locks from pre-upgrade workers too; never remove them automatically.
    for(const path of [resolve(process.env.CENSUS_STATE_DIR ?? ".data/census","worker.lock"),`.data/typesense/${process.env.TYPESENSE_COLLECTION ?? "contractors"}.lock`]) {
      if(await exists(path)) throw new Error("An existing geocoder/indexer lock needs inspection before refreshing.");
    }
    const db=modes[0]==="--run" ? createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}) : publicDb;
    // Fail before source writes if the additive retention migration is missing.
    if(modes[0]==="--run") {
      await readIndexSource(()=>db.from("cslb_refresh_runs").select("retained_expected").limit(1),"retention migration");
      await readIndexSource(()=>db.from("cslb_refresh_retained").select("run_id").limit(1),"retention receipts");
    }
    let id=value("--resume");
    if(modes[0]==="--run" && !id) {
      const active=await readIndexSource(()=>db.from("cslb_refresh_runs").select("id").neq("phase","complete").limit(1),"active refresh");
      id=active.data?.[0]?.id;
    }
    if(id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error("Invalid refresh UUID.");
    let manifest:Manifest;
    const existing=Boolean(id); id ||= randomUUID();
    const directory=resolve(".data/refresh",id);
    const manifestPath=`${directory}/manifest.json`;
    const save=async()=>{await writeFile(`${manifestPath}.tmp`,JSON.stringify(manifest,null,2),{mode:0o600});await rename(`${manifestPath}.tmp`,manifestPath);};
    if(existing) {
      manifest=JSON.parse(await readFile(manifestPath,"utf8"));
      if(manifest.source!==source || manifest.id!==id || releaseKey(manifest.hashes,manifest.dates)!==manifest.key) throw new Error("Saved refresh source or manifest mismatch.");
      for(const d of downloads) if(await fileHash(`${directory}/${d.filename}`)!==manifest.hashes[d.filename]) throw new Error("Saved source files changed; do not resume this snapshot.");
      snapshot=new RefreshSnapshot(`${directory}/snapshot.sqlite`,true);
      if(JSON.stringify(snapshot.validate())!==JSON.stringify(manifest.counts)) throw new Error("Saved snapshot counts changed.");
      if(snapshot.digest()!==manifest.snapshotHash) throw new Error("Saved normalized snapshot changed; do not resume.");
      if(JSON.stringify(snapshot.membership())!==JSON.stringify(manifest.membership)) throw new Error("Saved detail-file reconciliation changed; review before resuming.");
    } else {
      const dates=await inspectRelease();
      if(latest.data?.[0]) {
        assertNotOlder(dates,latest.data[0].source_dates);
        if(modes[0]==="--run" && sameRelease(dates,latest.data[0].source_dates)) { console.log(JSON.stringify({unchanged:true,sourceDates:dates,databaseWrites:0})); return; }
      }
      await mkdir(directory,{recursive:true,mode:0o700});
      const hashes:Record<string,string>={};
      for(const d of downloads) { await downloadDataset(d,directory); hashes[d.filename]=await fileHash(`${directory}/${d.filename}`); }
      if(!sameRelease(dates,await inspectRelease())) throw new Error("CSLB release changed while downloading; no source updates performed. Prepare a new snapshot.");
      snapshot=new RefreshSnapshot(`${directory}/snapshot.sqlite`);
      for(const [table,filename] of [["licenses","license-master.csv"],["personnel","personnel.csv"],["workers_comp","workers-comp.csv"]] as const) await snapshot.stage(table,`${directory}/${filename}`);
      const counts=snapshot.validate();
      if(latest.data?.[0] && (Object.keys(counts) as Table[]).some(t=>counts[t]<Number(latest.data![0].source_counts[t])*0.9)) throw new Error("CSLB row counts dropped by more than 10%; review before importing.");
      manifest={id,source,dates,hashes,key:releaseKey(hashes,dates),snapshotHash:snapshot.digest(),counts,membership:snapshot.membership()}; await save();
    }
    console.log(JSON.stringify({snapshot:id,detailMembership:manifest.membership,quarantine:"Unmatched rows are retained in the original CSVs and SQLite snapshot; they are excluded from contractor payloads."}));
    // Read-only membership check occurs before any source writes, also on resume.
    let cursor=0,existingCount=0;
    const missingIds:number[]=[];
    for(;;) {
      const current=await readIndexSource(()=>publicDb.from("licenses").select("id,license_number").not("source_status","is",null).neq("source_status","").gt("id",cursor).order("id").limit(1000).abortSignal(AbortSignal.timeout(30000)),"snapshot membership");
      if(!current.data?.length) break;
      existingCount+=current.data.length;
      for(const row of current.data) if(!snapshot.has(row.license_number)) missingIds.push(Number(row.id));
      cursor=Number(current.data.at(-1)!.id);
    }
    if(existing && !Array.isArray(manifest.retainedIds)) throw new Error("Saved snapshot has no sealed retention plan; prepare and review a new snapshot.");
    const retainedIds=retentionPlan(missingIds,existing ? manifest.retainedIds : undefined);
    // A large disappearance still requires review, rather than hiding a bad file.
    if(retainedIds.length>existingCount*0.1) throw new Error("More than 10% of existing source licenses are absent; review the download before importing.");
    if(!existing) { manifest.retainedIds=retainedIds;await save(); }
    const expectedIndexCount=manifest.counts.licenses+retainedIds.length;
    const review={snapshot:id,sourceDates:manifest.dates,counts:manifest.counts,detailMembership:manifest.membership,missingExistingLicenses:retainedIds.length,expectedIndexCount,status:"prepared",retentionPolicy:"Keep last-known facts and show a missing-from-download warning; never infer a new status or delete.",databaseWrites:0};
    await writeFile(`${directory}/preparation-review.json`,JSON.stringify(review,null,2),{mode:0o600});
    if(modes[0]==="--prepare") { console.log(JSON.stringify({...review,prepared:id,next:"Review, then use --run --resume UUID"}));return; }
    if(process.env.TYPESENSE_FETCH_ADAPTER==="true") { const require=createRequire(import.meta.url);createRequire(require.resolve("typesense"))("axios").defaults.adapter="fetch"; }
    const config=typesenseConfig(process.env,"index");
    const client=new Client({nodes:[{host:config.host,port:config.port,protocol:config.protocol}],apiKey:config.key,timeoutSeconds:15,numRetries:0,logLevel:"silent"});
    const alias=await client.aliases(config.collection).retrieve();
    if(manifest.indexVersion && manifest.indexVersion!==alias.collection_name) throw new Error("The live index changed since this refresh began. Review before resuming; do not discard the checkpoint.");
    if(!manifest.indexVersion) { manifest.indexVersion=alias.collection_name; await save(); }
    const marker=await client.collections<IndexMarker>(alias.collection_name).documents("__ccs_ready__").retrieve();
    if(!(await client.health.retrieve()).ok || !marker.ready || marker.schema_version!==GEO_SCHEMA_VERSION) throw new Error("A healthy, ready schema-v2 geographic index is required before source writes.");
    const saved=await readIndexSource(()=>db.from("cslb_refresh_runs").select("*").eq("id",id).maybeSingle(),"refresh checkpoint");
    if(saved.data && (saved.data.release_key!==manifest.key || saved.data.expected!==manifest.counts.licenses || saved.data.index_version!==manifest.indexVersion || saved.data.retained_expected!==retainedIds.length)) throw new Error("Database checkpoint does not match the saved snapshot/index/retention plan.");
    if(!saved.data) await readIndexSource(()=>db.from("cslb_refresh_runs").insert({id,release_key:manifest.key,index_version:manifest.indexVersion,source_dates:manifest.dates,source_counts:manifest.counts,expected:manifest.counts.licenses,retained_expected:retainedIds.length}),"start refresh");
    await runRefresh({
      read:async()=>(await readIndexSource(()=>db.from("cslb_refresh_runs").select("id,phase,cursor,processed,expected").eq("id",id).single(),"refresh checkpoint")).data as RefreshRun,
      batch:after=>snapshot!.batch(after),
      apply:async(after,items)=>(await readIndexSource(()=>db.rpc("apply_cslb_refresh_batch",{refresh_id:id,after_license:after,items}).abortSignal(AbortSignal.timeout(35000)),"atomic refresh batch")).data,
      reconcile:()=>reconcileRetained(retainedIds,async licenseIds=>(await readIndexSource(()=>db.rpc("retain_missing_cslb_batch",{refresh_id:id,license_ids:licenseIds}).abortSignal(AbortSignal.timeout(35000)),"retained source batch")).data),
      advance:async(phase:RefreshPhase)=>{await readIndexSource(()=>db.rpc("advance_cslb_refresh",{refresh_id:id,next_phase:phase}).abortSignal(AbortSignal.timeout(35000)),"refresh phase");},
      geocode:()=>refreshGeocoding(db,source,manifest.geoJob,async job=>{manifest.geoJob=job;await save();},id!),
      index:()=>syncRefreshIndex(db,id!,expectedIndexCount,manifest.indexVersion!),
      log:state=>console.log(JSON.stringify({phase:state.phase,processed:state.processed,expected:state.expected})),
    });
    console.log(JSON.stringify({completed:id,counts:manifest.counts,retainedLicenses:retainedIds.length,expectedIndexCount,sourceDates:manifest.dates,sourceRecordsDeleted:0,aliasChanged:false}));
  } finally { snapshot?.close();await releaseLock(); }
}
main().catch(error=>{console.error(error instanceof Error && error.constructor===Error ? error.message : "Refresh stopped; checkpoints retained. Raw errors suppressed to protect credentials and records.");process.exitCode=1;});
