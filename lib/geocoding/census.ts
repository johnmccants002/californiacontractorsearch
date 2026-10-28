import "server-only";
import { parse } from "csv-parse/sync";
import { BENCHMARK, emptyGeocode, prepareAddress, validCoordinates, type AddressInput, type GeocodeResult, type NormalizedAddress } from "./address";

export const CENSUS_BASE_URL = "https://geocoding.geo.census.gov/geocoder";
export const MAX_BATCH_SIZE = 10_000;
export type CensusItem = { id: string; address: NormalizedAddress };
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
export function censusCsv(items: CensusItem[]) {
  if (!items.length || items.length > MAX_BATCH_SIZE || new Set(items.map((i) => i.id)).size !== items.length || items.some((i) => !/^[a-zA-Z0-9_-]{1,80}$/.test(i.id))) throw new Error("Invalid Census batch size or IDs.");
  return items.map(({ id, address }) => [id, address.street, address.city, address.state, address.zip].map(quote).join(",")).join("\r\n");
}

export function parseCensusCsv(csv: string, items: CensusItem[], now = new Date().toISOString()): Map<string, GeocodeResult> {
  let rows: string[][];
  try { rows = parse(csv, { bom: true, skip_empty_lines: true, relax_column_count: true, max_record_size: 16_384 }); }
  catch { throw new Error("Invalid Census response CSV; no results accepted."); }
  const expected = new Map(items.map((item) => [item.id, item]));
  const results = new Map<string, GeocodeResult>();
  for (const row of rows) {
    const id = row[0]?.trim();
    if (!expected.has(id) || results.has(id)) throw new Error("Census returned unknown or duplicate IDs; no results accepted.");
    const indicator = row[2]?.trim().toLowerCase().replace(/[ _-]/g, "");
    const quality = row[3]?.trim() ?? "";
    let result: GeocodeResult;
    if (indicator === "nomatch") result = emptyGeocode("unmatched", "no_match", now);
    else if (indicator === "tie") result = emptyGeocode("ambiguous", "tie", now);
    else if (indicator === "match") {
      const parts = (row[5] ?? "").split(",");
      const [longitude, latitude] = parts.map((part) => part.trim() ? Number(part) : NaN);
      const matched = row[4]?.trim();
      if (parts.length !== 2 || !validCoordinates(latitude, longitude) || !matched) result = emptyGeocode("invalid_response", "invalid_coordinates", now);
      else if (quality.toLowerCase() !== "exact") result = { ...emptyGeocode("review", quality || "unknown_match_quality", now), matchedAddress: matched };
      else result = { ...emptyGeocode("accepted", "exact", now), matchedAddress: matched, latitude, longitude };
    } else throw new Error("Unrecognized Census match status; no results accepted.");
    results.set(id, result);
  }
  if (results.size !== expected.size) throw new Error("Census response is missing IDs; no results accepted.");
  return results;
}

type Fetcher = typeof fetch;
type Options = { fetcher?: Fetcher; sleep?: (ms: number) => Promise<void>; timeoutMs?: number; attempts?: number };
class RequestFailure extends Error { constructor(readonly retry: boolean) { super("Census request failed; address and response details are suppressed."); } }

export async function censusRequest(path: "locations/address" | "locations/addressbatch", init: RequestInit, query: URLSearchParams, options: Options = {}) {
  const attempts = Math.min(4, Math.max(1, options.attempts ?? 3));
  const pause = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < attempts; attempt++) {
    let wait = Math.min(30_000, 1000 * 2 ** attempt);
    try {
      const response = await (options.fetcher ?? fetch)(`${CENSUS_BASE_URL}/${path}?${query}`, { ...init, redirect: "error", signal: AbortSignal.timeout(options.timeoutMs ?? 120_000) });
      if (!response.ok) {
        const seconds = Number(response.headers.get("retry-after"));
        if (seconds > 0 && Number.isFinite(seconds)) wait = Math.min(30_000, seconds * 1000);
        await response.body?.cancel();
        throw new RequestFailure(response.status === 408 || response.status === 429 || response.status >= 500);
      }
      // Bound both network time and response memory; Census can return HTML errors.
      const reader = response.body?.getReader();
      if (!reader) throw new RequestFailure(true);
      const parts: Uint8Array[] = []; let size = 0;
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > 32 * 1024 * 1024) { await reader.cancel(); throw new RequestFailure(false); }
        parts.push(part.value);
      }
      return Buffer.concat(parts).toString("utf8");
    } catch (error) {
      // Deliberately omit transport causes: they can include address-bearing URLs.
      // eslint-disable-next-line preserve-caught-error
      if ((error instanceof RequestFailure && !error.retry) || attempt === attempts - 1) throw new Error("Census request failed after bounded retries; resume this saved batch later.");
      await pause(wait);
    }
  }
  throw new Error("Census request failed.");
}

export async function geocodeBatch(items: CensusItem[], options: Options = {}) {
  const form = new FormData();
  form.set("benchmark", BENCHMARK);
  form.set("addressFile", new Blob([censusCsv(items)], { type: "text/csv" }), "addresses.csv");
  const csv = await censusRequest("locations/addressbatch", { method: "POST", body: form }, new URLSearchParams(), options);
  return { csv, results: parseCensusCsv(csv, items) };
}

export async function geocodeSingle(input: AddressInput, options: Options = {}): Promise<GeocodeResult> {
  const prepared = prepareAddress(input);
  if (prepared.skip) return emptyGeocode(prepared.skip);
  const query = new URLSearchParams({ ...prepared.address, benchmark: BENCHMARK, format: "json" });
  const text = await censusRequest("locations/address", { method: "GET" }, query, { timeoutMs: 15_000, ...options });
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Invalid Census single-address response."); }
  const matches = data?.result?.addressMatches;
  if (!Array.isArray(matches)) throw new Error("Invalid Census single-address response.");
  if (!matches.length) return emptyGeocode("unmatched");
  if (matches.length !== 1) return emptyGeocode("ambiguous");
  const match = matches[0];
  if (!validCoordinates(match.coordinates?.y, match.coordinates?.x) || typeof match.matchedAddress !== "string") return emptyGeocode("invalid_response");
  // JSON has no Exact/Non_Exact quality field. Do not label it an exact match.
  // Single candidates are review-only; batch Exact matches are auto-accepted.
  return { ...emptyGeocode("review", "single_candidate"), matchedAddress: match.matchedAddress };
}
