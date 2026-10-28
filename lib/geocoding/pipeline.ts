import { BENCHMARK, addressSnapshot, emptyGeocode, prepareAddress, type AddressInput, type GeoColumns, type GeocodeResult } from "./address";
import { parseCensusCsv, MAX_BATCH_SIZE, type CensusItem } from "./census";
import { GeocodingStore } from "./store";
import { recordSource } from "@/lib/contractors/provenance";

export type SourceAddress = AddressInput & GeoColumns & { id: number; license_number: string; business_name: string; source_status: string | null };
export type GeoUpdate = { id: number; hash: string; snapshot: Required<AddressInput>; result: GeocodeResult };
export interface PipelineIO {
  read: (after: number, highWater: number, limit: number) => Promise<SourceAddress[]>;
  apply: (items: GeoUpdate[]) => Promise<{ license_id: number; applied: boolean }[]>;
  submit: (items: CensusItem[]) => Promise<{ csv: string; results: Map<string, GeocodeResult> }>;
  log?: (message: string) => void;
}

export async function runGeocodingJob(store: GeocodingStore, id: string, io: PipelineIO, batchSize = 1000) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) throw new Error("Census batch size must be 1–10,000.");
  let job = store.job(id);
  if (job.phase === "complete") return;
  while (job.phase === "scan") {
    const limit = job.max_records ? Math.min(500, job.max_records - job.scanned) : 500;
    if (limit <= 0) { store.phase(id, "geocode"); break; }
    const rows = await io.read(job.cursor, job.high_water, limit);
    if (!rows.length) { store.phase(id, "geocode"); break; }
    if (rows.some((row, i) => !Number.isSafeInteger(row.id) || row.id <= (i ? rows[i - 1].id : job.cursor) || row.id > job.high_water)) throw new Error("Invalid source cursor; job stopped.");
    const records = rows.flatMap((row) => {
      if (recordSource(row) !== "cslb") return [];
      const prepared = prepareAddress(row);
      if (!job.refresh && row.geocode_address_hash === prepared.hash && row.geocode_status && row.geocode_benchmark === BENCHMARK) return [];
      return [{ id: row.id, ...prepared, snapshot: addressSnapshot(row), ...(prepared.skip ? { result: emptyGeocode(prepared.skip) } : {}) }];
    });
    store.enqueue(id, records, rows[rows.length - 1].id, rows.length);
    job = store.job(id);
    io.log?.(`Scanned ${job.scanned} source records; cursor ${job.cursor}.`);
  }
  job = store.job(id);
  while (true) {
    const batch = store.batch(job, batchSize);
    if (!batch) break;
    store.attempt(batch.id);
    try {
      const response = batch.csv ? { csv: batch.csv, results: parseCensusCsv(batch.csv, batch.items) } : await io.submit(batch.items);
      store.response(batch.id, response.csv);
      // Revalidate persisted CSV, not an unchecked caller-provided result map.
      store.completeBatch(batch.id, parseCensusCsv(response.csv, batch.items));
      io.log?.(`Census batch ${batch.id}: ${batch.items.length} distinct addresses resolved.`);
    } catch { store.fail(batch.id); throw new Error(`Census batch ${batch.id} failed; progress retained. Resume job ${id}.`); }
  }
  store.phase(id, "apply");
  while (true) {
    const pending = store.pending(job);
    if (!pending.length) break;
    const updates: GeoUpdate[] = pending.map((row) => ({ id: row.license_id, hash: row.hash, snapshot: JSON.parse(row.snapshot), result: JSON.parse(row.result) }));
    const result = await io.apply(updates);
    if (result.length !== updates.length || new Set(result.map((r) => r.license_id)).size !== updates.length || result.some((r) => !updates.some((u) => u.id === r.license_id) || typeof r.applied !== "boolean")) throw new Error("Invalid database acknowledgement; checkpoint unchanged.");
    store.applied(id, result);
    io.log?.(`Saved ${result.filter((r) => r.applied).length} geocodes; ${result.filter((r) => !r.applied).length} changed/deleted addresses skipped.`);
  }
  if (store.counts(id).some((row) => row.state === "pending")) throw new Error("Unresolved geocoding items remain; job is not complete.");
  store.phase(id, "complete");
}
