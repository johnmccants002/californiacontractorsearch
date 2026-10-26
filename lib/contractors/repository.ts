import "server-only";
import { classifications, demoContractors, findDemoContractor } from "./demo-data";
import type { Classification, Contractor, LicenseStatus } from "./types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { searchLicenseIds } from "@/lib/search/database-search";
import type { FilterInput, SearchState } from "@/lib/search/filters";
import type { SearchClassification } from "@/lib/search/trade-location";

const CONTRACTOR_SELECT = `
  *,
  license_classifications(classifications(*)),
  personnel(*),
  bonds(*),
  workers_comp(*)
`;

type DbRow = Record<string, unknown>;

type ClassificationRpcRow = {
  license_id: number;
  total_count: number;
};

function mapClassification(row: DbRow): Classification {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description ?? ""),
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
  };
}

function mapContractor(row: DbRow): Contractor {
  const joins = (row.license_classifications as DbRow[] | null) ?? [];
  const people = (row.personnel as DbRow[] | null) ?? [];
  const bonds = (row.bonds as DbRow[] | null) ?? [];
  const workersComp = (row.workers_comp as DbRow[] | null) ?? [];

  return {
    id: Number(row.id),
    licenseNumber: String(row.license_number),
    businessName: String(row.business_name),
    businessNameNormalized: String(row.business_name_normalized),
    licenseStatus: String(row.license_status) as LicenseStatus,
    licenseType: String(row.license_type ?? "Contractor"),
    issueDate: row.issue_date ? String(row.issue_date) : "",
    expirationDate: row.expiration_date ? String(row.expiration_date) : "",
    addressLine1: row.address_line_1 ? String(row.address_line_1) : "",
    addressLine2: row.address_line_2 ? String(row.address_line_2) : undefined,
    city: row.city ? String(row.city) : "",
    state: String(row.state ?? "CA"),
    zip: row.zip ? String(row.zip) : "",
    phone: String(row.phone ?? ""),
    entityType: String(row.entity_type ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : "",
    classifications: joins
      .map((join) => join.classifications as DbRow | null)
      .filter((item): item is DbRow => Boolean(item))
      .map(mapClassification),
    personnel: people.map((person) => ({
      id: Number(person.id),
      firstName: String(person.first_name),
      middleName: person.middle_name ? String(person.middle_name) : undefined,
      lastName: String(person.last_name),
      fullName: String(person.full_name),
      fullNameNormalized: String(person.full_name_normalized),
      role: String(person.role ?? "Associated person"),
      associationDate: person.association_date ? String(person.association_date) : undefined,
      disassociationDate: person.disassociation_date ? String(person.disassociation_date) : undefined,
    })),
    bonds: bonds.map((bond) => ({
      id: Number(bond.id),
      bondType: String(bond.bond_type),
      bondCompany: String(bond.bond_company),
      bondNumber: String(bond.bond_number),
      bondAmount: Number(bond.bond_amount),
      effectiveDate: String(bond.effective_date),
      cancellationDate: bond.cancellation_date ? String(bond.cancellation_date) : undefined,
    })),
    workersComp: workersComp.map((item) => ({
      id: Number(item.id),
      carrier: item.carrier ? String(item.carrier) : undefined,
      policyNumber: item.policy_number ? String(item.policy_number) : undefined,
      effectiveDate: item.effective_date ? String(item.effective_date) : undefined,
      expirationDate: item.expiration_date ? String(item.expiration_date) : undefined,
      exemption: Boolean(item.exemption),
    })),
  };
}

async function hydrateContractors(
  client: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  licenseIds: number[],
): Promise<Contractor[]> {
  if (!licenseIds.length) return [];
  const { data, error } = await client.from("licenses").select(CONTRACTOR_SELECT).in("id", licenseIds);
  if (error) throw new Error(`Supabase contractor hydration failed: ${error.message}`);

  const byId = new Map((data as DbRow[]).map((row) => [Number(row.id), mapContractor(row)]));
  return licenseIds.map((id) => byId.get(id)).filter((item): item is Contractor => Boolean(item));
}

export async function searchContractorsFromDatabase(
  rawQuery: string,
  offset: number,
  limit: number,
  filters: FilterInput = {},
  catalog?: SearchClassification[],
): Promise<{
  results: { contractor: Contractor; score: number; matchedBy: string[] }[];
  total: number;
  interpretation?: string;
  state: SearchState;
} | null> {
  const client = createServerSupabaseClient();
  if (!client) return null;

  const { rows, total, interpretation, state } = await searchLicenseIds(client, rawQuery, offset, limit, filters, catalog);
  const contractors = await hydrateContractors(client, rows.map((row) => Number(row.license_id)));
  const ranks = new Map(rows.map((row) => [Number(row.license_id), row]));
  return {
    total,
    interpretation,
    state,
    results: contractors.map((contractor) => ({
      contractor,
      score: Number(ranks.get(contractor.id)?.relevance_score ?? 0),
      matchedBy: ranks.get(contractor.id)?.matched_by?.map(String) ?? [],
    })),
  };
}

export async function getSearchClassifications(): Promise<SearchClassification[]> {
  const client = createServerSupabaseClient();
  if (!client) return classifications;
  const { data, error } = await client.from("classifications").select("id, code, name, aliases").order("code");
  if (error) throw new Error(`Supabase classification lookup failed: ${error.message}`);
  return (data ?? []) as SearchClassification[];
}

export async function getContractorsForClassificationFromDatabase(
  classificationSlug: string,
  filters: { q?: string; city?: string; zip?: string; status?: string },
): Promise<Contractor[] | null> {
  const client = createServerSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.rpc("classification_license_ids", {
    classification_slug: classificationSlug,
    business_query: filters.q ?? null,
    city_filter: filters.city ?? null,
    zip_filter: filters.zip ?? null,
    status_filter: filters.status ?? null,
    result_limit: 100,
  });
  if (error) throw new Error(`Supabase classification query failed: ${error.message}`);

  const rows = (data ?? []) as ClassificationRpcRow[];
  return hydrateContractors(client, rows.map((row) => Number(row.license_id)));
}

export async function getAllContractors(): Promise<{ contractors: Contractor[]; source: "demo" | "supabase" }> {
  const client = createServerSupabaseClient();
  if (!client) return { contractors: demoContractors, source: "demo" };

  const { data, error } = await client.from("licenses").select(CONTRACTOR_SELECT);
  if (error) {
    console.error("Supabase contractor query failed; using demo data:", error.message);
    return { contractors: demoContractors, source: "demo" };
  }

  return { contractors: (data as DbRow[]).map(mapContractor), source: "supabase" };
}

export async function getContractorByLicense(licenseNumber: string): Promise<Contractor | undefined> {
  const client = createServerSupabaseClient();
  if (!client) return findDemoContractor(licenseNumber);

  const { data, error } = await client
    .from("licenses")
    .select(CONTRACTOR_SELECT)
    .eq("license_number", licenseNumber)
    .maybeSingle();

  if (error) {
    console.error("Supabase license query failed; using demo data:", error.message);
    return findDemoContractor(licenseNumber);
  }
  return data ? mapContractor(data as DbRow) : undefined;
}
