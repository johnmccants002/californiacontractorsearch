import type { SupabaseClient } from "@supabase/supabase-js";
import { mkdir, chmod } from "node:fs/promises";
import { resolve, parse } from "node:path";
import { homedir } from "node:os";
import { GeocodingStore } from "@/lib/geocoding/store";
import { runGeocodingJob, type SourceAddress } from "@/lib/geocoding/pipeline";
import { geocodeBatch } from "@/lib/geocoding/census";
import { GEO_COLUMNS, addressSnapshot, prepareAddress, acceptedLocation, BENCHMARK, SOURCE, type GeocodeResult } from "@/lib/geocoding/address";
import { readIndexSource } from "@/lib/typesense/indexing";
export function matchesSavedGeocode(row: SourceAddress, hash: string, snapshot: string, expected: GeocodeResult) {
  return JSON.stringify(addressSnapshot(row)) === snapshot && prepareAddress(row).hash === hash &&
    row.geocode_address_hash === hash && row.geocode_benchmark === BENCHMARK && row.geocode_source === SOURCE &&
    row.geocode_status === expected.status && row.geocode_quality === expected.quality &&
    row.geocode_matched_address === expected.matchedAddress && row.latitude === expected.latitude && row.longitude === expected.longitude &&
    Date.parse(row.geocoded_at ?? "") === Date.parse(expected.geocodedAt) &&
    (row.geocode_status === "accepted") === Boolean(acceptedLocation(row)) &&
    (row.geocode_status === "accepted" || (row.latitude === null && row.longitude === null));
}
export async function refreshGeocoding(db: SupabaseClient, source: string, jobId: string | undefined, saveJob: (id:string)=>Promise<void>, run: string) {
  const directory = resolve(process.env.CENSUS_STATE_DIR ?? ".data/census");
  if ([parse(directory).root,process.cwd(),homedir()].includes(directory)) throw new Error("Choose a dedicated private Census state subdirectory.");
  await mkdir(directory,{recursive:true,mode:0o700});
  const store = new GeocodingStore(`${directory}/jobs.sqlite`); await chmod(`${directory}/jobs.sqlite`,0o600);
  const columns = `id,license_number,business_name,source_status,address_line_1,address_line_2,city,state,zip,${GEO_COLUMNS}`;
  try {
    if (!jobId) {
      const last = await readIndexSource(() => db.from("licenses").select("id").order("id",{ascending:false}).limit(1),"geocoding high water");
      if (!last.data?.length) throw new Error("No source records for geocoding.");
      jobId = store.createJob(source,Number(last.data[0].id),false).id;
      await saveJob(jobId);
    }
    if (store.job(jobId).source !== source) throw new Error("Geocoding job source mismatch.");
    await runGeocodingJob(store,jobId,{
      read: async (after,high,limit) => {
        const result = await readIndexSource(() => db.from("licenses").select(columns).gt("id",after).lte("id",high).order("id").limit(limit).abortSignal(AbortSignal.timeout(30_000)),"refresh geocoding source");
        return result.data as unknown as SourceAddress[];
      },
      submit: geocodeBatch,
      apply: async items => (await readIndexSource(() => db.rpc("apply_census_geocodes",{items}).abortSignal(AbortSignal.timeout(30_000)),"refresh geocoding write")).data,
      log: console.log,
    });
    if (store.job(jobId).phase !== "complete" || store.counts(jobId).some(r => r.state !== "applied")) throw new Error("Stale geocoding acknowledgements require review; no freshness publication.");
    const ids = store.syncIds(jobId);
    const cached = store.db.prepare("SELECT i.hash,i.snapshot,a.result FROM items i JOIN addresses a ON a.hash=i.hash WHERE i.job_id=? AND i.license_id=?");
    for (let offset=0;offset<ids.length;offset+=200) {
      const batch = ids.slice(offset,offset+200);
      const result = await readIndexSource(() => db.from("licenses").select(columns).in("id",batch).abortSignal(AbortSignal.timeout(30_000)),"geocoding audit");
      if (result.data?.length !== batch.length) throw new Error("Geocoded source records disappeared.");
      for (const row of result.data as unknown as SourceAddress[]) {
        const saved = cached.get(jobId,row.id);
        if (!saved || !matchesSavedGeocode(row,String(saved.hash),String(saved.snapshot),JSON.parse(String(saved.result)))) throw new Error("Geocoding audit failed; no index synchronization.");
      }
      // Include old pending addresses too, not only licenses changed by this release.
      await readIndexSource(() => db.from("cslb_refresh_changes").upsert(batch.map(id=>({run_id:run,license_id:id,indexed:false})),{onConflict:"run_id,license_id"}).abortSignal(AbortSignal.timeout(30_000)),"geocoding outbox");
    }
  } finally { store.close(); }
}
