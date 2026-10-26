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

function clean(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function parseDate(value) {
  const input = clean(value);
  if (!input) return null;
  const match = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function parseTimestamp(value) {
  const date = parseDate(value);
  return date ? `${date}T00:00:00Z` : null;
}

function parseAmount(value) {
  const input = clean(value)?.replaceAll(/[$,]/g, "");
  if (!input) return null;
  const amount = Number(input);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeClassification(value) {
  return String(value ?? "").toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function splitPipe(value) {
  return String(value ?? "").split("|").map((item) => item.trim());
}

function mappedStatus(primaryStatus, expirationDate) {
  const source = String(primaryStatus ?? "").toLowerCase();
  if (source !== "clear") return "SUSPENDED";
  if (expirationDate && expirationDate < new Date().toISOString().slice(0, 10)) return "EXPIRED";
  return "ACTIVE";
}

function mapLicense(row) {
  const expirationDate = parseDate(row.ExpirationDate);
  return {
    license_number: String(row.LicenseNo).trim(),
    business_name: clean(row.BusinessName) ?? clean(row.FullBusinessName) ?? "Unknown business",
    license_status: mappedStatus(row.PrimaryStatus, expirationDate),
    source_status: clean([row.PrimaryStatus, row.SecondaryStatus].filter(clean).join(" — ")),
    issue_date: parseDate(row.IssueDate),
    expiration_date: expirationDate,
    address_line_1: clean(row.MailingAddress),
    city: clean(row.City),
    state: clean(row.State),
    county: clean(row.County),
    zip: clean(row.ZIPCode),
    phone: clean(row.BusinessPhone),
    entity_type: clean(row.BusinessType),
    source_updated_at: parseTimestamp(row.LastUpdate),
    classifications: [...new Set(splitPipe(row["Classifications(s)"]).map(normalizeClassification).filter(Boolean))],
    wc_coverage_type: clean(row.WorkersCompCoverageType),
    wc_carrier: clean(row.WCInsuranceCompany),
    wc_policy_number: clean(row.WCPolicyNumber),
    wc_effective_date: parseDate(row.WCEffectiveDate),
    wc_expiration_date: parseDate(row.WCExpirationDate),
    cb_company: clean(row.CBSuretyCompany),
    cb_number: clean(row.CBNumber),
    cb_amount: parseAmount(row.CBAmount),
    cb_effective_date: parseDate(row.CBEffectiveDate),
    cb_cancellation_date: parseDate(row.CBCancellationDate),
    wb_company: clean(row.WBSuretyCompany),
    wb_number: clean(row.WBNumber),
    wb_amount: parseAmount(row.WBAmount),
    wb_effective_date: parseDate(row.WBEffectiveDate),
    wb_cancellation_date: parseDate(row.WBCancellationDate),
    db_company: clean(row.DBSuretyCompany),
    db_number: clean(row.DBNumber),
    db_amount: parseAmount(row.DBAmount),
    db_effective_date: parseDate(row.DBEffectiveDate),
    db_cancellation_date: parseDate(row.DBCancellationDate),
  };
}

function mapPersonnel(row) {
  const parts = String(row.Name ?? "").trim().split(/\s{2,}/).map((item) => item.trim()).filter(Boolean);
  const lastName = parts[0] ?? "Unknown";
  const firstName = parts[1] ?? "Unknown";
  const middleName = clean(parts.slice(2).join(" "));
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const roles = [...new Set(splitPipe(row["EMP-Titl-CDE"]).filter(Boolean))];
  const associationDates = splitPipe(row["ASSN-DT"]).map(parseDate).filter(Boolean).sort();
  const rawDisassociationDates = splitPipe(row["DIS-ASSN-DT"]);
  const disassociationDates = rawDisassociationDates.map(parseDate).filter(Boolean).sort();
  const hasCurrentAssociation = rawDisassociationDates.some((item) => !clean(item));

  return {
    license_number: String(row["LIC-NO"]).trim(),
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    full_name: fullName,
    role: clean(roles.join(", ")),
    association_date: associationDates[0] ?? null,
    disassociation_date: hasCurrentAssociation ? null : (disassociationDates.at(-1) ?? null),
    source_updated_at: parseTimestamp(row.LastUpdated),
  };
}

function mapWorkersComp(row) {
  return {
    license_number: String(row.LicenseNo).trim(),
    coverage_type: clean(row.WorkersCompCoverageType),
    carrier: clean(row.WCInsuranceCompany),
    policy_number: clean(row.WCPolicyNo),
    effective_date: parseDate(row.EffectiveDate),
    expiration_date: parseDate(row.ExpirationDate),
    cancellation_date: parseDate(row.CancellationDate),
    source_updated_at: parseTimestamp(row.LastUpdate),
  };
}

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
