import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "typesense";
import { readIndexSource } from "../typesense/indexing";
import { GEO_COLUMNS, BENCHMARK, addressSnapshot, prepareAddress, acceptedLocation, type GeocodeResult } from "../geocoding/address";
import type { SourceAddress } from "../geocoding/pipeline";
import { GEO_SCHEMA_VERSION, type IndexMarker } from "../typesense/schema";

type RetainedHash = { id: number; licenseNumber: string; hash: string; missingSince: string | null };
export type RetainedBaseline = { version: 1; records: RetainedHash[] };
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
  return value;
}
export function retainedHash(row: Record<string, unknown>): RetainedHash {
  const { updated_at, source_missing_since, ...facts } = row;
  void updated_at;
  return { id: Number(row.id), licenseNumber: String(row.license_number), missingSince: source_missing_since as string | null,
    hash: createHash("sha256").update(JSON.stringify(canonical(facts))).digest("hex") };
}
async function retainedRows(db: SupabaseClient, ids: number[]) {
  const records: RetainedHash[] = [];
  for (let i=0;i<ids.length;i+=100) {
    const batch=ids.slice(i,i+100);
    const result=await readIndexSource(()=>db.from("licenses").select("*,license_classifications(classifications(*)),personnel(*),bonds(*),workers_comp(*)").in("id",batch).abortSignal(AbortSignal.timeout(30000)),"retained audit");
    if (result.data?.length!==batch.length) throw new Error("Retained records disappeared.");
    records.push(...result.data.map(retainedHash));
  }
  return records.sort((a,b)=>a.id-b.id);
}
/** Seal once, before the first source write. Never reconstruct a missing baseline mid-run. */
export async function prepareRetainedBaseline(db: SupabaseClient, ids: number[], directory: string, allowCreate: boolean): Promise<RetainedBaseline> {
  const path=resolve(directory,"retained-audit-v1.json");
  let baseline: RetainedBaseline;
  try { baseline=JSON.parse(await readFile(path,"utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code!=="ENOENT" || !allowCreate) throw new Error("Retained baseline missing or invalid; review required.",{cause:error});
    baseline={version:1,records:await retainedRows(db,ids)};
    await writeFile(path,JSON.stringify(baseline),{mode:0o600,flag:"wx"});
  }
  if (baseline.version!==1 || !Array.isArray(baseline.records) || JSON.stringify(baseline.records.map(r=>r.id))!==JSON.stringify([...ids].sort((a,b)=>a-b))) throw new Error("Retained baseline membership changed.");
  return baseline;
}
export function assertRetainedFacts(before: RetainedHash[], after: RetainedHash[], sourceDate: string) {
  if (after.length!==before.length || after.some((r,i)=>r.id!==before[i].id || r.hash!==before[i].hash || r.licenseNumber!==before[i].licenseNumber || r.missingSince!==(before[i].missingSince ?? sourceDate))) throw new Error("Retained facts or first-missing dates changed.");
}
export async function auditRetained(db: SupabaseClient, baseline: RetainedBaseline, sourceDate: string) {
  assertRetainedFacts(baseline.records,await retainedRows(db,baseline.records.map(r=>r.id)),sourceDate);
  return baseline.records.length;
}
export function assertCensusRecord(row: SourceAddress, cached: {hash: string; snapshot: string; result: GeocodeResult}, exactTimestamp: boolean) {
  const result=cached.result;
  if (JSON.stringify(addressSnapshot(row))!==cached.snapshot || prepareAddress(row).hash!==cached.hash || row.geocode_address_hash!==cached.hash ||
      row.geocode_benchmark!==BENCHMARK || row.geocode_source!==result.source || row.geocode_status!==result.status || row.geocode_quality!==result.quality ||
      row.geocode_matched_address!==result.matchedAddress || row.latitude!==result.latitude || row.longitude!==result.longitude ||
      !Number.isFinite(Date.parse(row.geocoded_at ?? "")) || (exactTimestamp && Date.parse(row.geocoded_at!)!==Date.parse(result.geocodedAt)) ||
      (row.geocode_status==="accepted")!==Boolean(acceptedLocation(row)) || (row.geocode_status!=="accepted" && (row.latitude!==null || row.longitude!==null))) {
    throw new Error("Source address or coordinates differ from acknowledged Census results.");
  }
}
/** Public reads + read-only SQLite. No source facts, keys or addresses in the report. */
export async function auditCoordinates(db: SupabaseClient, jobId: string, source: string, expected: number) {
  const local=new DatabaseSync(resolve(process.env.CENSUS_STATE_DIR ?? ".data/census","jobs.sqlite"),{readOnly:true});
  try {
    const job=local.prepare("SELECT phase,source FROM jobs WHERE id=?").get(jobId);
    if (job?.phase!=="complete" || job.source!==source || local.prepare("SELECT count(*) AS n FROM items WHERE job_id=? AND state!='applied'").get(jobId)!.n!==0 ||
        local.prepare("SELECT count(*) AS n FROM batches WHERE job_id=? AND state!='complete'").get(jobId)!.n!==0) throw new Error("Unfinished or stale geocoding acknowledgments.");
    const jobs=local.prepare("SELECT id FROM jobs WHERE source=? ORDER BY created_at DESC,id DESC").all(source);
    const item=local.prepare("SELECT i.hash,i.snapshot,a.result FROM items i JOIN addresses a ON a.hash=i.hash WHERE i.job_id=? AND i.license_id=? AND i.state='applied'");
    const digest=createHash("sha256");const outcomes: Record<string,number>={};
    let cursor=0,scanned=0,accepted=0;
    for (;;) {
      const response=await readIndexSource(()=>db.from("licenses").select(`id,license_number,business_name,source_status,address_line_1,address_line_2,city,state,zip,${GEO_COLUMNS}`).not("source_status","is",null).neq("source_status","").gt("id",cursor).order("id").limit(1000).abortSignal(AbortSignal.timeout(30000)),"coordinate audit");
      const rows=response.data as unknown as SourceAddress[];
      if (!rows.length) break;
      for (const row of rows) {
        let found=false;
        for (const j of jobs) {
          const saved=item.get(String(j.id),row.id);
          if (!saved) continue;
          assertCensusRecord(row,{hash:String(saved.hash),snapshot:String(saved.snapshot),result:JSON.parse(String(saved.result))},j.id===jobId);
          found=true;break;
        }
        if (!found) throw new Error("Source record has no acknowledged geocoding outcome.");
        outcomes[row.geocode_status!]=(outcomes[row.geocode_status!] ?? 0)+1;
        const point=acceptedLocation(row);
        if (point) { accepted++;digest.update(JSON.stringify([row.id,...point])+"\n"); }
        scanned++;
      }
      cursor=rows.at(-1)!.id;
    }
    if (scanned!==expected) throw new Error("Source count differs from sealed refresh membership.");
    return {scanned,accepted,outcomes,acceptedCoordinatesSha256:digest.digest("hex")};
  } finally { local.close(); }
}
export async function auditIndex(client: Client, alias: string, version: string, sourceCount: number, accepted: number) {
  if (!(await client.health.retrieve()).ok || (await client.aliases(alias).retrieve()).collection_name!==version) throw new Error("Index health or alias changed.");
  const marker=await client.collections<IndexMarker>(version).documents("__ccs_ready__").retrieve();
  if (!marker.ready || marker.schema_version!==GEO_SCHEMA_VERSION) throw new Error("Geographic index is not ready.");
  const counts=await Promise.all(["record_kind:=contractor","record_kind:=contractor && has_location:=true","record_kind:=contractor && has_location:=false"].map(filter_by=>client.collections(version).documents().search({q:"*",query_by:"business_name",filter_by,per_page:0})));
  if (counts[0].found!==sourceCount || counts[1].found!==accepted || counts[2].found!==sourceCount-accepted) throw new Error("Geographic index counts differ from audited source.");
  return {contractors:counts[0].found,withLocation:counts[1].found,withoutLocation:counts[2].found,aliasUnchanged:true,schemaVersion:GEO_SCHEMA_VERSION};
}
