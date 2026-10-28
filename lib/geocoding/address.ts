import { createHash } from "node:crypto";

export const ADDRESS_VERSION = 1;
export const BENCHMARK = "Public_AR_Current";
export const SOURCE = "us_census";
export interface AddressInput { address_line_1: string | null; address_line_2?: string | null; city: string | null; state: string | null; zip: string | null }
export interface NormalizedAddress { street: string; city: string; state: string; zip: string }
export type GeoStatus = "accepted" | "unmatched" | "ambiguous" | "review" | "invalid_response" | "skipped_po_box" | "skipped_missing_address" | "skipped_non_street" | "skipped_unsupported_region";
export interface GeocodeResult { status: GeoStatus; quality: string; latitude: number | null; longitude: number | null; matchedAddress: string | null; source: typeof SOURCE; benchmark: typeof BENCHMARK; geocodedAt: string }
const states = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP".split(" "));
const normalize = (text: string | null | undefined) => (text ?? "").normalize("NFKC").toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

export function addressSnapshot(input: AddressInput): Required<AddressInput> {
  return { address_line_1: input.address_line_1 ?? null, address_line_2: input.address_line_2 ?? null,
    city: input.city ?? null, state: input.state ?? null, zip: input.zip ?? null };
}

export function prepareAddress(input: AddressInput) {
  const line1 = normalize(input.address_line_1);
  const line2 = normalize(input.address_line_2);
  const address: NormalizedAddress = { street: [line1, line2].filter(Boolean).join(" "), city: normalize(input.city),
    state: normalize(input.state), zip: (input.zip ?? "").trim().match(/^\d{5}(?:-?\d{4})?$/)?.[0].slice(0, 5) ?? "" };
  // Preserve the unit/second line and original ZIP in identity. Only harmless
  // casing/spacing/punctuation are folded; no guessed address corrections.
  const hash = createHash("sha256").update(JSON.stringify([ADDRESS_VERSION, line1, line2, address.city, address.state, normalize(input.zip)])).digest("hex");
  let skip: GeoStatus | undefined;
  if (!line1 || (!address.zip && (!address.city || !address.state))) skip = "skipped_missing_address";
  else if (/\b(?:P\s*O\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX|GENERAL DELIVERY|RURAL ROUTE|RR\s*\d)\b/.test(address.street)) skip = "skipped_po_box";
  else if (!states.has(address.state)) skip = "skipped_unsupported_region";
  else if (!/^\d+[A-Z]?(?:[-/]\d+)?\s+\S/.test(line1)) skip = "skipped_non_street";
  return { address, hash, skip };
}

export function emptyGeocode(status: GeoStatus, quality: string = status, now = new Date().toISOString()): GeocodeResult {
  return { status, quality, latitude: null, longitude: null, matchedAddress: null, source: SOURCE, benchmark: BENCHMARK, geocodedAt: now };
}

export function validCoordinates(latitude: unknown, longitude: unknown): latitude is number {
  return typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && !(latitude === 0 && longitude === 0);
}

export interface GeoColumns {
  latitude?: number | null; longitude?: number | null; geocode_address_hash?: string | null;
  geocode_status?: string | null; geocode_source?: string | null; geocode_quality?: string | null;
  geocode_matched_address?: string | null; geocoded_at?: string | null; geocode_benchmark?: string | null;
}
export function acceptedLocation(row: AddressInput & GeoColumns): [number, number] | undefined {
  if (row.geocode_status !== "accepted" || row.geocode_source !== SOURCE || row.geocode_benchmark !== BENCHMARK ||
      row.geocode_quality !== "exact" || !row.geocode_matched_address?.trim() ||
      !validCoordinates(row.latitude, row.longitude) || !row.geocoded_at || !Number.isFinite(Date.parse(row.geocoded_at))) return;
  const prepared = prepareAddress(row);
  if (prepared.skip || prepared.hash !== row.geocode_address_hash) return;
  return [row.latitude as number, row.longitude as number];
}

export const GEO_COLUMNS = "latitude,longitude,geocode_address_hash,geocode_status,geocode_source,geocode_quality,geocode_matched_address,geocoded_at,geocode_benchmark";
