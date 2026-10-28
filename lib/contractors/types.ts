import type { SearchState } from "@/lib/search/filters";

export type LicenseStatus = "ACTIVE" | "EXPIRED" | "SUSPENDED" | "INACTIVE";
export type RecordSource = "cslb" | "demo" | "unknown";

export interface Classification {
  id: number;
  code: string;
  name: string;
  slug: string;
  description: string;
  aliases: string[];
}

export interface PersonnelRecord {
  id: number;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  fullNameNormalized: string;
  role: string;
  associationDate?: string;
  disassociationDate?: string;
}

export interface BondRecord {
  id: number;
  bondType: string;
  bondCompany: string;
  bondNumber: string;
  bondAmount: number;
  effectiveDate: string;
  cancellationDate?: string;
}

export interface WorkersCompRecord {
  id: number;
  carrier?: string;
  policyNumber?: string;
  effectiveDate?: string;
  expirationDate?: string;
  exemption: boolean;
}

export interface Contractor {
  dataSource: RecordSource;
  id: number;
  licenseNumber: string;
  businessName: string;
  businessNameNormalized: string;
  licenseStatus: LicenseStatus;
  licenseType: string;
  issueDate: string;
  expirationDate: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  county?: string;
  registeredLocation?: [number, number];
  state: string;
  zip: string;
  phone: string;
  entityType: string;
  createdAt: string;
  updatedAt: string;
  sourceUpdatedAt: string;
  classifications: Classification[];
  personnel: PersonnelRecord[];
  bonds: BondRecord[];
  workersComp: WorkersCompRecord[];
}

export interface SearchResult {
  contractor: Contractor;
  score: number;
  matchedBy: string[];
  highlightTokens?: string[];
  distanceMiles?: number;
}

export interface PaginatedResults {
  engine?: "typesense" | "database";
  state: SearchState;
  interpretation?: string;
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  source: "demo" | "supabase";
}
