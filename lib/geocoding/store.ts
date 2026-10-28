import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { BENCHMARK, ADDRESS_VERSION, type AddressInput, type GeocodeResult, type NormalizedAddress } from "./address";
import type { CensusItem } from "./census";

export type Job = { id: string; source: string; cursor: number; high_water: number; scanned: number; max_records: number; phase: string; refresh: number; created_at: string };
export type PendingItem = { license_id: number; hash: string; snapshot: string; result: string };
const CACHE_VERSION = `${BENCHMARK}:${ADDRESS_VERSION}:exact-only-v1`;

/** Local durable worker state. Keep the SQLite file + WAL on the same persistent volume. */
export class GeocodingStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, source TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0,
        high_water INTEGER NOT NULL, scanned INTEGER NOT NULL DEFAULT 0, max_records INTEGER NOT NULL, phase TEXT NOT NULL DEFAULT 'scan', refresh INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS addresses (hash TEXT PRIMARY KEY, address TEXT NOT NULL, result TEXT, cache_version TEXT, resolved_at TEXT);
      CREATE TABLE IF NOT EXISTS items (job_id TEXT NOT NULL, license_id INTEGER NOT NULL, hash TEXT NOT NULL, snapshot TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY(job_id,license_id));
      CREATE INDEX IF NOT EXISTS items_state_idx ON items(job_id,state,hash);
      CREATE TABLE IF NOT EXISTS batches (id INTEGER PRIMARY KEY, job_id TEXT NOT NULL, addresses TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'prepared', attempts INTEGER NOT NULL DEFAULT 0, response_csv TEXT, error_code TEXT);
      CREATE INDEX IF NOT EXISTS batches_pending_idx ON batches(job_id,state,id);`);
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = work(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  createJob(source: string, highWater: number, refresh: boolean, maxRecords = 0) {
    const id = randomUUID();
    this.db.prepare("INSERT INTO jobs(id,source,high_water,refresh,max_records,created_at) VALUES(?,?,?,?,?,?)")
      .run(id, source, highWater, Number(refresh), maxRecords, new Date().toISOString());
    return this.job(id);
  }
  job(id: string): Job {
    const job = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(id) as Job | undefined;
    if (!job) throw new Error("Unknown geocoding job.");
    return job;
  }
  enqueue(jobId: string, records: { id: number; hash: string; address: NormalizedAddress; snapshot: Required<AddressInput>; result?: GeocodeResult }[], cursor: number, scanned: number) {
    this.transaction(() => {
      for (const row of records) {
        this.db.prepare("INSERT INTO addresses(hash,address) VALUES(?,?) ON CONFLICT(hash) DO NOTHING").run(row.hash, JSON.stringify(row.address));
        if (row.result) this.cache(row.hash, row.result);
        this.db.prepare("INSERT INTO items(job_id,license_id,hash,snapshot) VALUES(?,?,?,?) ON CONFLICT(job_id,license_id) DO NOTHING")
          .run(jobId, row.id, row.hash, JSON.stringify(row.snapshot));
      }
      this.db.prepare("UPDATE jobs SET cursor=?,scanned=scanned+? WHERE id=?").run(cursor, scanned, jobId);
    });
  }
  cache(hash: string, result: GeocodeResult) {
    this.db.prepare("UPDATE addresses SET result=?,cache_version=?,resolved_at=? WHERE hash=?")
      .run(JSON.stringify(result), CACHE_VERSION, new Date().toISOString(), hash);
  }
  phase(jobId: string, phase: string) { this.db.prepare("UPDATE jobs SET phase=? WHERE id=?").run(phase, jobId); }
  batch(job: Job, limit: number): { id: number; items: CensusItem[]; csv?: string } | undefined {
    const previous = this.db.prepare("SELECT * FROM batches WHERE job_id=? AND state!='complete' ORDER BY id LIMIT 1").get(job.id);
    if (previous) return { id: Number(previous.id), items: JSON.parse(String(previous.addresses)), csv: previous.response_csv ? String(previous.response_csv) : undefined };
    const rows = this.db.prepare(`SELECT DISTINCT a.hash,a.address FROM items i JOIN addresses a ON a.hash=i.hash
      WHERE i.job_id=? AND i.state='pending' AND (a.result IS NULL OR a.cache_version!=? OR (?=1 AND a.resolved_at<?))
      ORDER BY a.hash LIMIT ?`).all(job.id, CACHE_VERSION, job.refresh, job.created_at, limit);
    if (!rows.length) return;
    const items = rows.map((row) => ({ id: String(row.hash), address: JSON.parse(String(row.address)) as NormalizedAddress }));
    const id = Number(this.db.prepare("INSERT INTO batches(job_id,addresses) VALUES(?,?)").run(job.id, JSON.stringify(items)).lastInsertRowid);
    return { id, items };
  }
  attempt(id: number) { this.db.prepare("UPDATE batches SET attempts=attempts+1,error_code=NULL WHERE id=?").run(id); }
  response(id: number, csv: string) { this.db.prepare("UPDATE batches SET response_csv=?,state='received' WHERE id=?").run(csv, id); }
  fail(id: number) { this.db.prepare("UPDATE batches SET error_code='request_or_parse_failed',response_csv=NULL,state='prepared' WHERE id=?").run(id); }
  completeBatch(id: number, results: Map<string, GeocodeResult>) {
    this.transaction(() => { for (const [hash, result] of results) this.cache(hash, result); this.db.prepare("UPDATE batches SET state='complete' WHERE id=?").run(id); });
  }
  pending(job: Job, limit = 200) {
    return this.db.prepare(`SELECT i.license_id,i.hash,i.snapshot,a.result FROM items i JOIN addresses a ON a.hash=i.hash
      WHERE i.job_id=? AND i.state='pending' AND a.result IS NOT NULL AND a.cache_version=? AND (?=0 OR a.resolved_at>=?)
      ORDER BY i.license_id LIMIT ?`).all(job.id, CACHE_VERSION, job.refresh, job.created_at, limit) as PendingItem[];
  }
  applied(jobId: string, updates: { license_id: number; applied: boolean }[]) {
    this.transaction(() => { for (const row of updates) this.db.prepare("UPDATE items SET state=? WHERE job_id=? AND license_id=?")
      .run(row.applied ? "applied" : "stale", jobId, row.license_id); });
  }
  counts(jobId: string) { return this.db.prepare("SELECT state,count(*) AS count FROM items WHERE job_id=? GROUP BY state").all(jobId); }
  syncIds(jobId: string) { return this.db.prepare("SELECT license_id FROM items WHERE job_id=? AND state='applied' ORDER BY license_id").all(jobId).map((r) => Number(r.license_id)); }
  close() { this.db.close(); }
}
