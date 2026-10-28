import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections";
import { normalizeBusinessName, normalizeClassificationCode, normalizeText } from "@/lib/search/normalize";
import { recordSource } from "@/lib/contractors/provenance";
import { acceptedLocation, GEO_COLUMNS, type AddressInput, type GeoColumns } from "@/lib/geocoding/address";

export const SCHEMA_VERSION = 1;
export const GEO_SCHEMA_VERSION = 2;
export const schemaVersion = (geo: boolean) => geo ? GEO_SCHEMA_VERSION : SCHEMA_VERSION;
export interface IndexMarker { id: string; record_kind: "manifest"; ready: boolean; schema_version: number }
export const INDEX_SELECT = "id,license_number,business_name,license_status,city,county,state,zip,issue_date,updated_at,source_updated_at,source_status,personnel(full_name),license_classifications(classifications(code,name,description,aliases))";
export const indexSelect = (geo: boolean) => geo ? `${INDEX_SELECT},address_line_1,address_line_2,${GEO_COLUMNS}` : INDEX_SELECT;
export interface IndexRow extends Partial<AddressInput>, GeoColumns {
  id: number; license_number: string; business_name: string; license_status: string;
  city: string | null; county: string | null; state: string | null; zip: string | null;
  issue_date: string | null; updated_at: string; source_updated_at: string | null; source_status: string | null;
  personnel: { full_name: string }[] | null;
  license_classifications: { classifications: { code: string; name: string; description?: string; aliases?: string[] } | null }[] | null;
}
export interface ContractorDocument {
  id: string; record_kind: "contractor"; license_id: number; license_number: string;
  business_name: string; business_name_normalized: string; personnel_names: string[];
  classification_codes: string[]; classification_terms: string[]; classification_descriptions: string[];
  city: string; county: string; state: string; zip: string; license_status: string;
  issue_date?: number; source_updated_at: string; indexed_at: number;
  location?: [number, number] | null; has_location?: boolean;
}
export function contractorSchema(name: string, geo = false): CollectionCreateSchema {
  return {
    name, metadata: { ccs_schema_version: schemaVersion(geo) },
    fields: [
      { name: "record_kind", type: "string", facet: true },
      // Optional at schema level because the same collection holds one readiness
      // marker. All contractor fields are validated by the mapper below.
      { name: "license_id", type: "int64", sort: true, optional: true },
      { name: "license_number", type: "string", facet: true, optional: true },
      { name: "business_name", type: "string", optional: true },
      { name: "business_name_normalized", type: "string", facet: true, sort: true, optional: true },
      { name: "personnel_names", type: "string[]", optional: true },
      { name: "classification_codes", type: "string[]", facet: true, optional: true },
      { name: "classification_terms", type: "string[]", optional: true },
      { name: "classification_descriptions", type: "string[]", optional: true },
      ...["city", "county", "state", "zip", "license_status"].map((name) => ({ name, type: "string" as const, facet: true, optional: true })),
      { name: "issue_date", type: "int64", optional: true, sort: true },
      { name: "source_updated_at", type: "string", optional: true, index: false },
      { name: "indexed_at", type: "int64", optional: true },
      { name: "schema_version", type: "int32", optional: true },
      { name: "ready", type: "bool", optional: true },
      ...(geo ? [{ name: "location", type: "geopoint" as const, optional: true }, { name: "has_location", type: "bool" as const, facet: true, optional: true }] : []),
    ],
  };
}

export function mapIndexDocument(row: IndexRow, now = Date.now(), geo = false): ContractorDocument | null {
  if (recordSource(row) !== "cslb") return null;
  if (!Number.isSafeInteger(Number(row.id)) || Number(row.id) < 1 || !/^\d+$/.test(row.license_number) || !row.business_name?.trim()) {
    throw new Error("Invalid public contractor identity in indexing batch.");
  }
  const classes = (row.license_classifications ?? []).flatMap((join) => join.classifications ? [join.classifications] : []);
  const issued = row.issue_date ? Date.parse(row.issue_date) : NaN;
  const location = geo ? acceptedLocation({ ...row, address_line_1: row.address_line_1 ?? null }) : undefined;
  return {
    id: String(row.id), record_kind: "contractor", license_id: Number(row.id), license_number: row.license_number,
    business_name: row.business_name, business_name_normalized: normalizeBusinessName(row.business_name),
    personnel_names: [...new Set((row.personnel ?? []).map((person) => person.full_name).filter(Boolean))],
    classification_codes: [...new Set(classes.map((c) => normalizeClassificationCode(c.code)))],
    classification_terms: [...new Set(classes.flatMap((c) => [c.code, c.name, ...(c.aliases ?? [])]).map(normalizeText))],
    classification_descriptions: classes.map((c) => c.description ?? "").filter(Boolean),
    city: normalizeText(row.city ?? ""), county: normalizeText(row.county ?? ""), state: row.state?.toUpperCase() ?? "",
    zip: (row.zip ?? "").replace(/\D/g, "").slice(0, 5), license_status: row.license_status,
    ...(Number.isFinite(issued) ? { issue_date: Math.floor(issued / 1000) } : {}),
    source_updated_at: row.source_updated_at ?? "", indexed_at: Math.floor(now / 1000),
    ...(geo ? { has_location: Boolean(location), location: location ?? null } : {}),
  };
}

export const tradeSynonyms = { items: [
  { id: "plumbing", synonyms: ["plumber", "plumbers", "plumbing", "c36", "c-36"] },
  { id: "electrical", synonyms: ["electrician", "electricians", "electrical", "c10", "c-10"] },
  // Do not make the ordinary letter "b" a global synonym: the parser handles B.
  { id: "general-building", synonyms: ["general contractor", "general contractors", "general building"] },
] };
