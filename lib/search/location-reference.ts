import "server-only";
import reference from "@/data/locations/census-2025.json";
import { SearchInputError, type FilterInput } from "./filters";

const key = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const places = new Map<string, { name: string; latitude: number; longitude: number }[]>();
for (const [name, latitude, longitude] of reference.places) {
  const normalized = key(String(name));
  places.set(normalized, [...(places.get(normalized) ?? []), { name: String(name), latitude: Number(latitude), longitude: Number(longitude) }]);
}
const zips: Record<string, number[]> = reference.zips;

/** Reference points center a search only; never enrich a contractor's record. */
export function resolveLocationInput(input: FilterInput): FilterInput {
  const near = input.near?.trim();
  if (!near) {
    if (!input.lat?.trim() && !input.lng?.trim() && (input.radius?.trim() || input.sort === "distance")) {
      throw new SearchInputError("Choose a city or ZIP, use your location, or enter coordinates before searching by distance.");
    }
    return input;
  }
  if (near.length > 100) throw new SearchInputError("Enter a California city or a five-digit ZIP code, not a street address.");
  let latitude: number, longitude: number, label: string;
  if (/^\d{5}$/.test(near)) {
    const point = Object.hasOwn(zips, near) ? zips[near] : undefined;
    if (!point) throw new SearchInputError("That ZIP has no mapped Census area. Try a nearby California city or another ZIP code.");
    [latitude, longitude] = point;
    label = near;
  } else {
    const normalized = key(near.replace(/(?:,\s*|\s+)(?:CA|California)$/i, "").replace(/\s+(?:city|town|CDP)$/i, ""));
    const matches = places.get(normalized);
    if (!matches?.length) throw new SearchInputError("We couldn't find that location. Enter a California city, such as Sacramento, or a five-digit ZIP code.");
    if (matches.length !== 1) throw new SearchInputError("More than one California place has that name. Use a five-digit ZIP code to choose the search center.");
    ({ latitude, longitude } = matches[0]);
    label = `${matches[0].name}, CA`;
  }
  // The typed place takes precedence over coordinates from an earlier search.
  return { ...input, near: label, lat: String(latitude), lng: String(longitude), radius: input.radius?.trim() || "25", sort: input.sort || "distance" };
}
