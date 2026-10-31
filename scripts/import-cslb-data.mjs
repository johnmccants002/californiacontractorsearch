import { mapLicense, mapPersonnel, mapWorkersComp } from "../lib/refresh/mapping.mjs";
import { acquireMaintenanceLock } from "../lib/refresh/lock.mjs";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const dataDirectory = path.resolve(process.env.CSLB_DATA_DIR ?? ".data/cslb");
const batchSize = Math.min(1000, Math.max(100, Number(process.env.CSLB_IMPORT_BATCH_SIZE ?? 750)));
const concurrency = Math.min(8, Math.max(1, Number(process.env.CSLB_IMPORT_CONCURRENCY ?? 4)));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const finalizeOnly = process.argv.includes("--finalize-only");

if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
if (!serviceKey && !publishableKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
}

let importToken = process.env.CSLB_IMPORT_TOKEN;
if (!serviceKey && !importToken) {
  importToken = (await readFile(path.join(dataDirectory, "import-token"), "utf8")).trim();
}

const client = createClient(url, serviceKey ?? publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: importToken ? { headers: { "x-cslb-import-token": importToken } } : undefined,
});


async function insertBatch(table, rows) {
  const { error } = await client.from(table).insert(rows);
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
}

async function importCsv({ filename, table, transform, minimumRows }) {
  const parser = createReadStream(path.join(dataDirectory, filename)).pipe(parse({
    bom: true,
    columns: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
  }));

  let batch = [];
  let rowCount = 0;
  const pending = new Set();

  async function queue(rows) {
    const task = insertBatch(table, rows).finally(() => pending.delete(task));
    pending.add(task);
    if (pending.size >= concurrency) await Promise.race(pending);
  }

  for await (const row of parser) {
    const transformed = transform(row);
    if (!transformed.license_number) continue;
    batch.push(transformed);
    rowCount += 1;
    if (batch.length >= batchSize) {
      await queue(batch);
      batch = [];
    }
    if (rowCount % 25000 === 0) console.log(`${filename}: staged ${rowCount.toLocaleString()} rows`);
  }

  if (batch.length) await queue(batch);
  await Promise.all(pending);
  if (rowCount < minimumRows) throw new Error(`${filename} contained only ${rowCount} usable rows`);
  console.log(`${filename}: staged ${rowCount.toLocaleString()} rows total`);
  return rowCount;
}

const releaseMaintenance = await acquireMaintenanceLock();
try {
if (!finalizeOnly) {
  await importCsv({
    filename: "license-master.csv",
    table: "cslb_import_licenses",
    transform: mapLicense,
    minimumRows: 200000,
  });
  await importCsv({
    filename: "personnel.csv",
    table: "cslb_import_personnel",
    transform: mapPersonnel,
    minimumRows: 300000,
  });
  await importCsv({
    filename: "workers-comp.csv",
    table: "cslb_import_workers_comp",
    transform: mapWorkersComp,
    minimumRows: 150000,
  });
}

async function runPhase(phase, { batched = false } = {}) {
  let cursor = null;
  let total = 0;

  do {
    const { data, error } = await client.rpc("finalize_cslb_import_phase", {
      phase,
      after_cursor: cursor,
      batch_limit: 10000,
    });
    if (error) throw new Error(`CSLB ${phase} phase failed: ${error.message}`);
    cursor = data.cursor ?? null;
    total += Number(data.processed ?? 0);
    console.log(`${phase}: ${total.toLocaleString()} rows processed`);
    if (!batched || data.done) return data;
  } while (cursor);
}

if (serviceKey) {
  await runPhase("prepare");
  await runPhase("licenses", { batched: true });
  await runPhase("delete_stale");
  await runPhase("reset_details");
  await runPhase("classifications", { batched: true });
  await runPhase("personnel", { batched: true });
  await runPhase("bonds", { batched: true });
  await runPhase("workers_comp", { batched: true });
  await runPhase("workers_comp_fallback", { batched: true });
  await runPhase("search", { batched: true });
  const result = await runPhase("complete");
  await runPhase("cleanup");
  console.log("Finalized CSLB import:", result);
} else {
  console.log("Staging complete. Run public.finalize_cslb_import() with an administrative database connection.");
}
} finally { await releaseMaintenance(); }
