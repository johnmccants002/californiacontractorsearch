import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { downloads, selectedDataset } from "../../scripts/download-cslb-data.mjs";

export type ReleaseDates = Record<string, string>;
export function releaseDate(html: string, now = new Date()) {
  const matches = [...html.matchAll(/<span\b[^>]*id=["']MainContent_lblMasterFile["'][^>]*>\s*Updated as of (\d{1,2})\/(\d{1,2})\/(\d{4})\s*<\/span>/gi)];
  if (matches.length !== 1) throw new Error("CSLB release-date label changed; manual review required.");
  const [, month, day, year] = matches[0];
  const value = `${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value || date.getTime() > now.getTime()+86400000) throw new Error("Invalid CSLB release date.");
  return value;
}
export async function inspectRelease(): Promise<ReleaseDates> {
  const dates: ReleaseDates = {};
  // Check all three independently: CSLB does not publish them on the same date.
  for (const dataset of downloads) dates[dataset.filename] = releaseDate((await selectedDataset(dataset)).html);
  return dates;
}
export const sameRelease = (a: ReleaseDates, b: ReleaseDates) => downloads.every(d => a[d.filename] && a[d.filename] === b[d.filename]);
export function assertNotOlder(next: ReleaseDates, previous: ReleaseDates) {
  if (downloads.some(d => previous[d.filename] && next[d.filename] < previous[d.filename])) throw new Error("CSLB release date regressed; review before importing.");
}
export async function fileHash(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
// Policy 3 also retains absent source licenses with explicit receipts/warnings.
// Older manifests require re-preparation; never upgrade an in-flight plan silently.
export const releaseKey = (hashes: Record<string,string>, dates: ReleaseDates = {}) => createHash("sha256").update(JSON.stringify({ mapper: 1, membershipPolicy: 3, files: downloads.map(d => [d.filename,hashes[d.filename],dates[d.filename] ?? null]) })).digest("hex");
