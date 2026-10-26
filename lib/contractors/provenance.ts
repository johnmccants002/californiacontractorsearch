import { findDemoContractor } from "./demo-data";
import type { RecordSource } from "./types";

export type DatasetSource = RecordSource | "empty" | "unavailable";

// The CSLB importer writes source_status; seed records do not. Compare both
// number and name because a real imported license can reuse a demo number.
export function recordSource(row: { license_number: unknown; business_name: unknown; source_status?: unknown }): RecordSource {
  const demo = findDemoContractor(String(row.license_number));
  if (demo?.businessName === row.business_name) return "demo";
  return typeof row.source_status === "string" && row.source_status.trim() ? "cslb" : "unknown";
}

export function sourceDate(value?: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
