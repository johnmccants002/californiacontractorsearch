import { mkdir, open, unlink, chmod, writeFile } from "node:fs/promises";
import { resolve, parse } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { GEO_COLUMNS, prepareAddress } from "../lib/geocoding/address";
import { geocodeBatch } from "../lib/geocoding/census";
import { GeocodingStore } from "../lib/geocoding/store";
import { runGeocodingJob, type SourceAddress } from "../lib/geocoding/pipeline";
import { recordSource } from "../lib/contractors/provenance";

const args = process.argv.slice(2);
const argument = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const BASE_SELECT = "id,license_number,business_name,source_status,address_line_1,address_line_2,city,state,zip";
async function main() {
  if (args.includes("--help")) {
    console.log("Usage: npm run geo:import -- --dry-run [--limit 100]\nWrite: npm run geo:import -- --run [--limit 100] [--batch-size 1000] [--refresh]\nResume: npm run geo:import -- --run --resume JOB_UUID\nState: CENSUS_STATE_DIR (default .data/census). Requires Node >=22.13 and a persistent volume. No Vercel request or automatic Typesense publication.");
    return;
  }
  const valueOptions = new Set(["--limit", "--batch-size", "--resume"]);
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag) || (!valueOptions.has(flag) && !["--dry-run", "--run", "--refresh"].includes(flag))) throw new Error("Unknown or repeated option; use --help.");
    seen.add(flag);
    if (valueOptions.has(flag) && (!args[++i] || args[i].startsWith("--"))) throw new Error("Missing option value; use --help.");
  }
  if (seen.has("--resume") && ["--limit", "--refresh", "--dry-run"].some((flag) => seen.has(flag))) throw new Error("Resume uses the saved job scope; omit --limit, --refresh and --dry-run.");
  const { loadEnvConfig } = createRequire(`${process.cwd()}/package.json`)("@next/env"); loadEnvConfig(process.cwd());
  const dry = args.includes("--dry-run");
  if (dry === args.includes("--run")) throw new Error("Choose exactly one of --dry-run or --run.");
  const limit = argument("--limit") === undefined ? 0 : Number(argument("--limit"));
  const batchSize = Number(argument("--batch-size") ?? 1000);
  if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) throw new Error("Invalid record or batch limit.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = dry ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(dry ? "Public Supabase configuration required." : "A server-only Supabase service-role key is required for enrichment writes.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const source = new URL(url).origin;
  const read = async (cursor: number, highWater: number, size: number): Promise<SourceAddress[]> => {
    const { data, error } = await db.from("licenses").select(dry ? BASE_SELECT : `${BASE_SELECT},${GEO_COLUMNS}`)
      .gt("id", cursor).lte("id", highWater).order("id").limit(size).abortSignal(AbortSignal.timeout(30_000));
    if (error) throw new Error("Source read failed. Check connectivity and whether the reviewed Census migration is installed.");
    return data as unknown as SourceAddress[];
  };
  const latest = await db.from("licenses").select("id").order("id", { ascending: false }).limit(1);
  if (latest.error || !latest.data?.length) throw new Error("Cannot determine source high-water ID.");
  const highWater = Number(latest.data[0].id);
  if (dry) {
    let cursor = 0, scanned = 0; const unique = new Set<string>(); const counts: Record<string, number> = {};
    while (!limit || scanned < limit) {
      const rows = await read(cursor, highWater, limit ? Math.min(500, limit - scanned) : 500); if (!rows.length) break;
      for (const row of rows) { const item = prepareAddress(row); const status = recordSource(row) !== "cslb" ? "skipped_unconfirmed_source" : item.skip ?? "eligible"; counts[status] = (counts[status] ?? 0) + 1; if (status === "eligible") unique.add(item.hash); }
      scanned += rows.length; cursor = rows[rows.length - 1].id;
    }
    console.log(JSON.stringify({ dryRun: true, scanned, distinctEligibleAddresses: unique.size, counts, censusRequests: 0, databaseWrites: 0 })); return;
  }
  const directory = resolve(process.env.CENSUS_STATE_DIR ?? ".data/census");
  if ([parse(directory).root, process.cwd(), homedir()].includes(directory)) throw new Error("Choose a dedicated private Census state subdirectory, not a home or project root.");
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  const lockPath = `${directory}/worker.lock`;
  const lock = await open(lockPath, "wx", 0o600).catch(() => { throw new Error("Geocoding worker lock exists. Inspect its PID; remove only a confirmed stale lock."); });
  await lock.writeFile(String(process.pid));
  let store: GeocodingStore | undefined;
  try {
    store = new GeocodingStore(`${directory}/jobs.sqlite`); await chmod(`${directory}/jobs.sqlite`, 0o600);
    const resume = argument("--resume");
    const job = resume ? store.job(resume) : store.createJob(source, highWater, args.includes("--refresh"), limit);
    if (job.source !== source) throw new Error("Job belongs to a different source project.");
    console.log(`Geocoding job ${job.id}. Only original-address-matched enrichment will be written; CSLB fields stay unchanged.`);
    await runGeocodingJob(store, job.id, { read, submit: geocodeBatch, log: console.log, apply: async (items) => {
      const { data, error } = await db.rpc("apply_census_geocodes", { items }).abortSignal(AbortSignal.timeout(30_000));
      if (error) throw new Error("Geocode database write failed; resume safely from the saved job.");
      return data;
    } }, batchSize);
    const syncIds = store.syncIds(job.id);
    await writeFile(`${directory}/${job.id}-typesense-ids.json`, JSON.stringify(syncIds), { mode: 0o600 });
    console.log(JSON.stringify({ job: job.id, phase: store.job(job.id).phase, counts: store.counts(job.id), typesenseSyncIds: syncIds.length, note: "Index sync is a separate command; no alias or application flag changed." }));
  } finally { store?.close(); await lock.close(); await unlink(lockPath); }
}
main().catch((error: unknown) => { console.error(error instanceof Error && error.constructor === Error ? error.message : "Geocoding worker stopped. Check migration/configuration, service availability, and the saved job. Raw errors are suppressed to protect addresses and credentials. Use --help for recovery commands."); process.exitCode = 1; });
