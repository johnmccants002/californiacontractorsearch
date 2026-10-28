export interface GeoFilter { latitude: number; longitude: number; radiusMiles?: number }
export const hasGeoInput = (input: { lat?: string; lng?: string; radius?: string; sort?: string }) => Boolean(input.lat?.trim() || input.lng?.trim() || input.radius?.trim() || input.sort === "distance");
export function geoEnabled() { return process.env.CENSUS_GEOCODING_ENABLED === "true"; }
export function distanceMiles(from: GeoFilter, to: [number, number]) {
  const radians = (n: number) => n * Math.PI / 180;
  const a = Math.sin(radians(to[0] - from.latitude) / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to[0])) * Math.sin(radians(to[1] - from.longitude) / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}
