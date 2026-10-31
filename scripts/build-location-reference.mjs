// Reproducible transformation of public Census Gazetteer files. No app secrets.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const directory = ".data/location-reference";
const placesSource = await readFile(`${directory}/2025_gaz_place_06.txt`, "utf8");
const zipArchive = await readFile(`${directory}/2025_Gaz_zcta_national.zip`);
const zipSource = execFileSync("unzip", ["-p", `${directory}/2025_Gaz_zcta_national.zip`, "2025_Gaz_zcta_national.txt"], { encoding: "utf8", maxBuffer: 10_000_000 });
function rows(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split("|").map(value => value.trim());
  return lines.map(line => Object.fromEntries(line.split("|").map((value, i) => [keys[i], value.trim()])));
}
function point(row) {
  const lat = Number(row.INTPTLAT), lng = Number(row.INTPTLONG);
  assert.ok(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180);
  return [lat, lng];
}
const places = rows(placesSource).map(row => {
  assert.equal(row.USPS, "CA");
  assert.match(row.GEOID, /^06\d{5}$/);
  return [row.NAME.replace(/ (?:city|town|CDP)$/, ""), ...point(row)];
});
const zips = {};
for (const row of rows(zipSource)) {
  assert.match(row.GEOID, /^\d{5}$/);
  assert.ok(!Object.hasOwn(zips, row.GEOID));
  zips[row.GEOID] = point(row);
}
assert.ok(places.length > 1000 && Object.keys(zips).length > 30000);
const sourceRoot = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/";
const data = { source: "U.S. Census Bureau 2025 Gazetteer", sources: [sourceRoot + "2025_gaz_place_06.txt", sourceRoot + "2025_Gaz_zcta_national.zip"],
  sourceSha256: [placesSource, zipArchive].map(value => createHash("sha256").update(value).digest("hex")), places, zips };
await mkdir("data/locations", { recursive: true });
await writeFile("data/locations/census-2025.json", JSON.stringify(data) + "\n");
console.log(`Built ${places.length} California places and ${Object.keys(zips).length} U.S. ZIP tabulation-area reference points.`);
