import { mkdir, open, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Client } from "typesense";
import { createClient } from "@supabase/supabase-js";
import { typesenseConfig } from "../lib/typesense/config";
import { indexSelect, schemaVersion, contractorSchema, mapIndexDocument, tradeSynonyms, type IndexRow, type IndexMarker } from "../lib/typesense/schema";
import { assertCompleteIndex, assertImportSuccess, incrementalRemovals, parseIds, readIndexSource } from "../lib/typesense/indexing";
import { loadTypesenseEnvironment } from "./typesense-env";
import { safeTypesenseError } from "../lib/typesense/errors";
import { geoEnabled } from "../lib/search/geo";

const args = process.argv.slice(2);
const argument = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const batchSize = 500;
type Checkpoint = { version: string; alias: string; host: string; schema: number; fingerprint: string; expected: number; afterId: number; imported: number; complete: boolean };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main() {
  if (args.includes("--help")) {
    console.log("Usage: npm run search:index -- [--resume VERSION] [--publish] [--credentials-file PATH]\nIncremental: npm run search:index -- --ids DB_ID,DB_ID [--credentials-file PATH]\nSaved geocoding IDs: npm run search:index -- --ids-file PATH\nFull indexing builds a new version; --publish explicitly switches the alias only after validation. Pause CSLB imports/edits/geocoding while building. No database writes.");
    return;
  }
  await loadTypesenseEnvironment(args);
  const geo = geoEnabled();
  const versionNumber = schemaVersion(geo);
  const select = indexSelect(geo);
  const config = typesenseConfig(process.env, "index");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Public Supabase URL and anon key are required. The indexer does not use the service-role key.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const client = new Client({ nodes: [{ host: config.host, protocol: config.protocol, port: config.port }], apiKey: config.key,
    connectionTimeoutSeconds: 10, timeoutSeconds: 30, numRetries: 2, retryIntervalSeconds: 1, logLevel: "silent" });
  const versionInfo = await client.debug.retrieve();
  if (!/^30\./.test(String(versionInfo.version))) throw new Error("This indexer requires Typesense 30.x (synonym-set API).");
  const directory = ".data/typesense";
  await mkdir(directory, { recursive: true });
  const lockPath = `${directory}/${config.collection}.lock`;
  const lock = await open(lockPath, "wx").catch(() => { throw new Error(`Another indexer may be running. Inspect ${lockPath}; remove only a confirmed stale lock before resuming.`); });
  await lock.writeFile(String(process.pid));
  try {
    const idsArgument = argument("--ids");
    const idsFile = argument("--ids-file");
    if (idsArgument || idsFile) {
      if (args.includes("--resume") || args.includes("--publish")) throw new Error("Incremental sync cannot be combined with full-index options.");
      if (idsArgument && idsFile) throw new Error("Choose --ids or --ids-file, not both.");
      const loaded: unknown = idsFile ? JSON.parse(await readFile(idsFile, "utf8")) : parseIds(idsArgument!);
      if (!Array.isArray(loaded) || loaded.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error("IDs file must contain a JSON array of positive database IDs.");
      const allIds = [...new Set(loaded as number[])];
      const alias = await client.aliases(config.collection).retrieve();
      const version = alias.collection_name;
      if (!version.startsWith(`${config.collection}_v`)) throw new Error("Alias does not point to a managed index.");
      const marker = await client.collections<IndexMarker>(version).documents("__ccs_ready__").retrieve();
      if (marker.ready !== true || marker.schema_version !== versionNumber) throw new Error("Target index is not ready or has a different geo schema. Build and validate a new version first.");
      for (let offset = 0; offset < allIds.length; offset += batchSize) {
      const ids = allIds.slice(offset, offset + batchSize);
      const { data, error } = await db.from("licenses").select(select).in("id", ids);
      if (error) throw new Error("Supabase incremental read failed.");
      const docs = (data as unknown as IndexRow[]).flatMap((row) => { const doc = mapIndexDocument(row, Date.now(), geo); return doc ? [doc] : []; });
      if (docs.length) assertImportSuccess(await client.collections(version).documents().import(docs, { action: "upsert", dirty_values: "reject", throwOnFail: false }), docs.length);
      const removed = incrementalRemovals(ids, docs);
      if (removed.length) await client.collections(version).documents().delete({ filter_by: `record_kind:=contractor && license_id:=[${removed.join(",")}]` });
      console.log(`Incremental sync complete: ${docs.length} upserted; ${removed.length} absent/unconfirmed IDs removed from the search copy. Supabase unchanged.`);
      }
      return;
    }
    async function fingerprint() {
      let importedCount = 0;
      // Includes related tables because a license-only updated_at misses edits to
      // personnel and classifications. Still require one writer/no concurrent import.
      // Run exact counts sequentially to avoid concurrent full-table scans on
      // the source project. Keep summary order stable across saved checkpoints.
      const summary = [];
      for (const table of ["licenses", "personnel", "classifications", "license_classifications"]) {
        const response = await readIndexSource(() => db.from(table).select("id", { count: "exact" }).order("id", { ascending: false }).limit(1)
          .abortSignal(AbortSignal.timeout(30_000)), `${table} count validation`);
        let updated = "";
        if (table === "licenses") {
          // There is no updated_at index on the existing wide license table.
          // Bounded primary-key reads avoid a full-table sort/API timeout and
          // do not require altering the production database just for indexing.
          let cursor = 0;
          while (true) {
            const page = await readIndexSource(() => db.from("licenses").select("id,updated_at,source_status").gt("id", cursor).order("id").limit(1000)
              .abortSignal(AbortSignal.timeout(30_000)), "licenses timestamp validation");
            if (!page.data?.length) break;
            for (const row of page.data) {
              if (String(row.updated_at) > updated) updated = String(row.updated_at);
              if (typeof row.source_status === "string" && row.source_status.trim()) importedCount++;
            }
            cursor = Number(page.data[page.data.length - 1].id);
            if (importedCount % 25000 < page.data.length) console.log(`Source validation: ${importedCount} imported records checked`);
          }
        } else if (table !== "license_classifications") {
          const latest = await readIndexSource(() => db.from(table).select("updated_at").order("updated_at", { ascending: false }).limit(1)
            .abortSignal(AbortSignal.timeout(30_000)), `${table} timestamp validation`);
          updated = String(latest.data?.[0]?.updated_at ?? "");
        }
        summary.push({ table, count: response.count, maxId: response.data?.[0]?.id, updated });
      }
      if (!importedCount) throw new Error("No imported CSLB records are available to index.");
      return { value: hash(summary), count: importedCount };
    }
    const initial = await fingerprint();
    const resume = argument("--resume");
    const version = resume ?? `${config.collection}_v${Date.now()}`;
    if (!new RegExp(`^${config.collection}_v[0-9]+$`).test(version)) throw new Error("Invalid version name.");
    const checkpointPath = `${directory}/${version}.json`;
    let checkpoint: Checkpoint;
    if (resume) {
      checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
      if (checkpoint.version !== version || checkpoint.alias !== config.collection || checkpoint.host !== config.host ||
          checkpoint.schema !== versionNumber || checkpoint.fingerprint !== initial.value || checkpoint.expected !== initial.count) throw new Error("Checkpoint does not match the current schema, cluster, or source data. Start a new full index.");
    } else {
      await client.synonymSets(`${version}_trades`).upsert(tradeSynonyms);
      await client.collections().create({ ...contractorSchema(version, geo), synonym_sets: [`${version}_trades`] });
      checkpoint = { version, alias: config.collection, host: config.host, schema: versionNumber, fingerprint: initial.value,
        expected: initial.count, afterId: 0, imported: 0, complete: false };
    }
    async function save() {
      await writeFile(`${checkpointPath}.tmp`, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
      await rename(`${checkpointPath}.tmp`, checkpointPath);
    }
    await save();
    console.log(`Building ${version}; expected ${checkpoint.expected} imported records. Alias unchanged.`);
    while (!checkpoint.complete) {
      const { data, error } = await db.from("licenses").select(select).not("source_status", "is", null).neq("source_status", "")
        .gt("id", checkpoint.afterId).order("id").limit(batchSize);
      if (error) throw new Error("Supabase batch read failed. The last acknowledged cursor is saved; resume this version.");
      const rows = data as unknown as IndexRow[];
      if (!rows.length) break;
      const docs = rows.flatMap((row) => { const doc = mapIndexDocument(row, Date.now(), geo); return doc ? [doc] : []; });
      if (docs.length) assertImportSuccess(await client.collections(version).documents().import(docs, { action: "upsert", dirty_values: "reject", throwOnFail: false }), docs.length);
      checkpoint.afterId = Number(rows[rows.length - 1].id);
      checkpoint.imported += docs.length;
      await save(); // Cursor advances only after every document is acknowledged.
      console.log(`Indexed ${checkpoint.imported}/${checkpoint.expected}; cursor ${checkpoint.afterId}`);
      // Do not assume a short page means EOF: the database API can cap pages.
    }
    const final = await fingerprint();
    const actual = await client.collections(version).documents().search({ q: "*", query_by: "business_name", filter_by: "record_kind:=contractor", per_page: 0 });
    assertCompleteIndex(checkpoint.imported, final.count, actual.found, checkpoint.fingerprint, final.value);
    await client.collections(version).documents().upsert({ id: "__ccs_ready__", record_kind: "manifest", ready: true, schema_version: versionNumber });
    checkpoint.complete = true;
    await save();
    if (args.includes("--publish")) {
      await client.aliases().upsert(config.collection, { collection_name: version });
      console.log(`Validated and published alias ${config.collection} → ${version}. Old collections retained for rollback.`);
    } else console.log(`Validated ${version}. Not published. Benchmark this version, then run with --resume ${version} --publish when approved.`);
  } finally { await lock.close(); await unlink(lockPath); }
}

main().catch((error: unknown) => {
  // SDK/Axios errors can embed authentication headers. Only our own plain Errors
  // are printable; suppress payloads, stacks, and non-local exception subclasses.
  console.error(error instanceof Error && error.constructor === Error ? error.message : safeTypesenseError(error));
  process.exitCode = 1;
});
