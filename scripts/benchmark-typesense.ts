import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { loadTypesenseEnvironment } from "./typesense-env";
import { searchTypesenseContractors } from "../lib/typesense/search";
import { searchDatabaseContractors } from "../lib/search/search-contractors";
import { getContractorByLicense, getSearchClassifications } from "../lib/contractors/repository";
import type { FilterInput } from "../lib/search/filters";
import type { PaginatedResults } from "../lib/contractors/types";
import { normalizeText } from "../lib/search/normalize";
import { safeTypesenseError } from "../lib/typesense/errors";

async function main() {
  const args = process.argv.slice(2);
  await loadTypesenseEnvironment(args);
  const collection = args[args.indexOf("--collection") + 1];
  if (!args.includes("--collection") || !collection) throw new Error("Supply --collection VALIDATED_VERSION_OR_ALIAS.");
  process.env.TYPESENSE_COLLECTION = collection;
  // Both implementations use identical public database permissions for fair tests.
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.TYPESENSE_ADMIN_API_KEY;
  const catalog = await getSearchClassifications();
  const known = await getContractorByLicense("1082303");
  assert.ok(known?.dataSource === "cslb");
  const person = known.personnel.find((p) => p.fullName.trim().length > 4)?.fullName;
  assert.ok(person, "Reference contractor must include public personnel for this test.");
  type Case = { name: string; q: string; filters?: FilterInput; expected?: string; first?: boolean; city?: string; zip?: string; classification?: string; empty?: boolean; countyOnly?: boolean };
  const cases: Case[] = [
    { name: "exact license", q: "1082303", expected: "1082303", first: true },
    { name: "formatted license", q: "#1082303", expected: "1082303", first: true },
    { name: "exact business", q: "1 Demolition", expected: "1082303", first: true },
    { name: "business prefix", q: "1 Demo", expected: "1082303" },
    { name: "business typo", q: "1 Demoltion", expected: "1082303" },
    { name: "personnel", q: person, expected: "1082303" },
    { name: "classification", q: "C-36", classification: "c36" },
    { name: "trade and city", q: "plumbers in Sacramento", city: "sacramento", classification: "c36" },
    { name: "ZIP", q: "plumbers in 95814", zip: "95814", classification: "c36" },
    { name: "status", q: "", filters: { city: "Sacramento", status: "ACTIVE", sort: "name" }, city: "sacramento" },
    { name: "county", q: "", filters: { county: "Contra Costa", classification: "c21" }, classification: "c21", countyOnly: true },
    { name: "no matches", q: "plumbers in Zzz Nonexistent City", empty: true },
    { name: "empty query", q: "", empty: true },
  ];
  const samples: { case: string; engine: string; ms: number; count: number; expectedRank?: number }[] = [];
  function check(result: PaginatedResults, item: Case) {
    if (item.empty) { assert.equal(result.total, 0); assert.equal(result.results.length, 0); return; }
    assert.ok(result.results.length > 0, `${item.name}: no records`);
    if (item.expected) {
      const index = result.results.findIndex((r) => r.contractor.licenseNumber === item.expected);
      assert.ok(index >= 0, `${item.name}: expected license not in first page`);
      if (item.first) assert.equal(index, 0, `${item.name}: exact match should rank first`);
    }
    for (const { contractor } of result.results) {
      assert.equal(contractor.dataSource, "cslb");
      if (item.city) assert.equal(contractor.city.toLowerCase(), item.city);
      if (item.zip) assert.ok(contractor.zip.startsWith(item.zip));
      if (item.classification) assert.ok(contractor.classifications.some((c) => c.code === item.classification));
      if (item.filters?.status) assert.equal(contractor.licenseStatus, item.filters.status);
      if (item.filters?.county) assert.equal(normalizeText(contractor.county ?? ""), normalizeText(item.filters.county));
    }
  }
  for (let round = 0; round < 4; round++) {
    for (const item of cases) {
      for (const engine of round % 2 ? ["database", "typesense"] : ["typesense", "database"]) {
        if (engine === "database" && item.countyOnly) continue;
        const start = performance.now();
        const fn = engine === "typesense" ? searchTypesenseContractors : searchDatabaseContractors;
        const result = await fn(item.q, 1, 10, item.filters ?? {}, catalog);
        const elapsed = performance.now() - start;
        // Current database behavior is the baseline, not an assertion that it
        // already supports every new fuzzy query. Report ranks for comparison.
        if (engine === "typesense") check(result, item);
        const rank = item.expected ? result.results.findIndex((r) => r.contractor.licenseNumber === item.expected) + 1 : undefined;
        if (round > 0) samples.push({ case: item.name, engine, ms: Math.round(elapsed), count: result.total, ...(rank !== undefined ? { expectedRank: rank || -1 } : {}) });
      }
    }
    console.log(`Relevance/latency round ${round + 1}/4 passed${round === 0 ? " (warm-up, excluded from timings)" : ""}.`);
  }
  const first = await searchTypesenseContractors("plumbers in Sacramento", 1, 10, {}, catalog);
  const second = await searchTypesenseContractors("plumbers in Sacramento", 2, 10, {}, catalog);
  const repeat = await searchTypesenseContractors("plumbers in Sacramento", 2, 10, {}, catalog);
  assert.equal(first.total, second.total);
  assert.equal(new Set([...first.results, ...second.results].map((r) => r.contractor.id)).size, 20);
  assert.deepEqual(second.results.map((r) => r.contractor.id), repeat.results.map((r) => r.contractor.id));
  const baseline = await searchDatabaseContractors("plumbers in Sacramento", 1, 10, {}, catalog);
  assert.equal(first.total, baseline.total, "Strict trade/city counts must agree with the source database.");
  const summary = ["typesense", "database"].map((engine) => {
    const times = samples.filter((s) => s.engine === engine && s.case !== "county").map((s) => s.ms).sort((a, b) => a - b);
    return { engine, samples: times.length, p50Ms: times[Math.ceil(times.length * .5) - 1], p95Ms: times[Math.ceil(times.length * .95) - 1] };
  });
  const report = { collection, measuredAt: new Date().toISOString(), scope: "Local sequential server calls, including Supabase hydration; warm-up excluded; county excluded from aggregate comparison; not production-load measurements.", summary, samples };
  await mkdir(".data/typesense", { recursive: true });
  await writeFile(".data/typesense/benchmark.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary, relevanceCases: cases.length, pagination: "passed", report: ".data/typesense/benchmark.json" }, null, 2));
}
main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError || (error instanceof Error && error.constructor === Error) ? error.message : safeTypesenseError(error));
  process.exitCode = 1;
});
