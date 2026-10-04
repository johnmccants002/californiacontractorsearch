import "server-only";
import { demoContractors, findDemoContractor } from "./demo-data";
import type { Classification, Contractor, LicenseStatus } from "./types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CONTRACTOR_SELECT = `
  *,
  license_classifications(classifications(*)),
  personnel(*),
  bonds(*),
  workers_comp(*)
`;

type DbRow = Record<string, unknown>;

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
    issueDate: String(row.issue_date),
    expirationDate: String(row.expiration_date),
    addressLine1: String(row.address_line_1),
    addressLine2: row.address_line_2 ? String(row.address_line_2) : undefined,
    city: String(row.city),
    state: String(row.state ?? "CA"),
    zip: String(row.zip),
    phone: String(row.phone ?? ""),
    entityType: String(row.entity_type ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    sourceUpdatedAt: String(row.source_updated_at),
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
