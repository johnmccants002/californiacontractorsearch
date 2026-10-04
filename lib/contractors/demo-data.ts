import type { Classification, Contractor, LicenseStatus } from "./types";
import { normalizeBusinessName, normalizePersonName } from "@/lib/search/normalize";

export const classifications: Classification[] = [
  {
    id: 1,
    code: "b",
    name: "General Building Contractor",
    slug: "b",
    description:
      "A General Building contractor works on structures involving at least two unrelated building trades or crafts.",
    aliases: ["general building", "general contractor", "builder", "construction"],
  },
  {
    id: 2,
    code: "c10",
    name: "Electrical Contractor",
    slug: "c10",
    description:
      "An Electrical contractor installs, connects, and repairs electrical wires, fixtures, appliances, and related systems.",
    aliases: ["electrical", "electrician", "electricians"],
  },
  {
    id: 3,
    code: "c27",
    name: "Landscaping Contractor",
    slug: "c27",
    description:
      "A Landscaping contractor constructs and maintains landscapes, including planting, irrigation, and related features.",
    aliases: ["landscaping", "landscape", "landscaper", "landscapers"],
  },
  {
    id: 4,
    code: "c33",
    name: "Painting and Decorating Contractor",
    slug: "c33",
    description:
      "A Painting and Decorating contractor prepares surfaces and applies paint, coatings, and decorative treatments.",
    aliases: ["painting", "painter", "painters", "decorating"],
  },
  {
    id: 5,
    code: "c36",
    name: "Plumbing Contractor",
    slug: "c36",
    description:
      "A Plumbing contractor installs and repairs water, gas, drainage, waste, and vent piping systems.",
    aliases: ["plumbing", "plumber", "plumbers"],
  },
  {
    id: 6,
    code: "c39",
    name: "Roofing Contractor",
    slug: "c39",
    description:
      "A Roofing contractor installs and repairs materials that make structures weatherproof from the top.",
    aliases: ["roofing", "roofer", "roofers"],
  },
  {
    id: 7,
    code: "c46",
    name: "Solar Contractor",
    slug: "c46",
    description:
      "A Solar contractor installs, modifies, maintains, and repairs thermal and photovoltaic solar energy systems.",
    aliases: ["solar", "photovoltaic", "renewable energy"],
  },
];

type DemoRow = [
  licenseNumber: string,
  businessName: string,
  status: LicenseStatus,
  city: string,
  zip: string,
  classificationCodes: string[],
  personName: string,
  role: string,
];

const rows: DemoRow[] = [
  ["1056730", "ABC Plumbing Inc.", "ACTIVE", "Sacramento", "95826", ["c36"], "John A. Smith", "Responsible Managing Officer"],
  ["1082401", "Golden State Electric Co.", "ACTIVE", "Roseville", "95678", ["c10"], "Elena Marquez", "Sole Owner"],
  ["1041198", "Sierra Crest Builders LLC", "ACTIVE", "Folsom", "95630", ["b"], "Daniel Kim", "Responsible Managing Employee"],
  ["992614", "Pacific Ridge Roofing", "EXPIRED", "Los Angeles", "90012", ["c39"], "Maya Thompson", "Sole Owner"],
  ["1102743", "Sunward Solar Works", "ACTIVE", "San Diego", "92101", ["c46", "c10"], "Luis Hernandez", "Responsible Managing Officer"],
  ["1038820", "Valley Oak Landscapes", "ACTIVE", "San Jose", "95112", ["c27"], "Priya Patel", "Sole Owner"],
  ["987451", "Fresno Finish Painting", "INACTIVE", "Fresno", "93721", ["c33"], "Marcus Reed", "Responsible Managing Employee"],
  ["1093327", "River City Pipe & Drain", "ACTIVE", "Sacramento", "95814", ["c36"], "Alicia Nguyen", "Sole Owner"],
  ["1068259", "Placer County Homecraft", "ACTIVE", "Roseville", "95747", ["b"], "Robert Ellis", "Responsible Managing Officer"],
  ["1014762", "Folsom Current Electric", "ACTIVE", "Folsom", "95630", ["c10"], "Sofia Ramirez", "Sole Owner"],
  ["978305", "Angeleno Color Studio", "EXPIRED", "Los Angeles", "90026", ["c33"], "David Okafor", "Sole Owner"],
  ["1110284", "Harborview Plumbing Company", "ACTIVE", "San Diego", "92109", ["c36"], "Grace Lee", "Responsible Managing Employee"],
  ["1077451", "Silicon Valley Solar Craft", "ACTIVE", "San Jose", "95113", ["c46"], "Noah Williams", "Responsible Managing Officer"],
  ["1023968", "Central Valley Roofline", "SUSPENDED", "Fresno", "93710", ["c39"], "Isabel Torres", "Sole Owner"],
  ["1098164", "Capital City Construction Group", "ACTIVE", "Sacramento", "95818", ["b", "c33"], "Ethan Brown", "Responsible Managing Officer"],
  ["1005729", "Roseville Garden & Stone", "ACTIVE", "Roseville", "95661", ["c27"], "Chloe Martin", "Sole Owner"],
  ["1089632", "Lake Natoma Builders", "ACTIVE", "Folsom", "95630", ["b"], "Andrew Wilson", "Responsible Managing Employee"],
  ["995140", "Metro LA Electrical Services", "EXPIRED", "Los Angeles", "90017", ["c10"], "Natalie Chen", "Sole Owner"],
  ["1106915", "Coastal Sun Energy", "ACTIVE", "San Diego", "92121", ["c46"], "Mateo Garcia", "Responsible Managing Officer"],
  ["1047306", "Orchard City Plumbing", "ACTIVE", "San Jose", "95126", ["c36"], "Hannah Johnson", "Sole Owner"],
  ["1061843", "San Joaquin Landscape Studio", "ACTIVE", "Fresno", "93704", ["c27"], "Owen Davis", "Responsible Managing Employee"],
  ["1032947", "American River Electric", "ACTIVE", "Sacramento", "95819", ["c10"], "Camila Martinez", "Sole Owner"],
  ["1084160", "Westpark Painting Collective", "ACTIVE", "Roseville", "95747", ["c33"], "James Anderson", "Responsible Managing Officer"],
  ["999263", "Historic Folsom Roof Works", "EXPIRED", "Folsom", "95630", ["c39"], "Fatima Hassan", "Sole Owner"],
  ["1113098", "Echo Park Build & Design", "ACTIVE", "Los Angeles", "90026", ["b"], "Benjamin Moore", "Responsible Managing Employee"],
  ["1071625", "Mission Bay Painting", "ACTIVE", "San Diego", "92110", ["c33"], "Zoe Carter", "Sole Owner"],
  ["1059041", "Evergreen City Landscapes", "ACTIVE", "San Jose", "95118", ["c27"], "Samuel Park", "Responsible Managing Officer"],
  ["1018394", "Tower District Electric", "INACTIVE", "Fresno", "93728", ["c10"], "Lily Robinson", "Sole Owner"],
  ["1095478", "NorCal Roof & Solar", "ACTIVE", "Sacramento", "95834", ["c39", "c46"], "Jack Taylor", "Responsible Managing Employee"],
  ["1100836", "Foothill Plumbing & Heating", "ACTIVE", "Roseville", "95678", ["c36"], "Emma Clark", "Sole Owner"],
  ["1065502", "Sac Valley General Builders", "ACTIVE", "Sacramento", "95816", ["b"], "John Smith", "Responsible Managing Officer"],
  ["1027749", "Peninsula Power Systems", "ACTIVE", "San Jose", "95131", ["c10", "c46"], "Ava Lewis", "Responsible Managing Employee"],
];

const UPDATED_AT = "2026-09-28";

function splitName(fullName: string) {
  const parts = fullName.replace(".", "").split(" ");
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined,
    lastName: parts.at(-1) ?? "",
  };
}

export const demoContractors: Contractor[] = rows.map((row, index) => {
  const [licenseNumber, businessName, licenseStatus, city, zip, codes, personName, role] = row;
  const person = splitName(personName);
  const active = licenseStatus === "ACTIVE";
  const recordId = index + 1;

  return {
    id: recordId,
    licenseNumber,
    businessName,
    businessNameNormalized: normalizeBusinessName(businessName),
    licenseStatus,
    licenseType: "Contractor",
    issueDate: `${2010 + (index % 13)}-${String((index % 9) + 1).padStart(2, "0")}-15`,
    expirationDate: active ? `202${7 + (index % 2)}-${String((index % 12) + 1).padStart(2, "0")}-28` : "2024-06-30",
    addressLine1: `${120 + index * 37} Demo Avenue`,
    city,
    state: "CA",
    zip,
    phone: `(555) ${String(210 + index).padStart(3, "0")}-${String(4100 + index * 19).slice(-4)}`,
    entityType: index % 3 === 0 ? "Corporation" : index % 3 === 1 ? "Sole Ownership" : "LLC",
    createdAt: "2026-09-01",
    updatedAt: UPDATED_AT,
    sourceUpdatedAt: UPDATED_AT,
    classifications: codes.map((code) => classifications.find((item) => item.code === code)!).filter(Boolean),
    personnel: [
      {
        id: recordId,
        ...person,
        fullName: personName,
        fullNameNormalized: normalizePersonName(personName),
        role,
        associationDate: `${2018 + (index % 6)}-01-01`,
      },
    ],
    bonds:
      index % 4 === 3
        ? []
        : [
            {
              id: recordId,
              bondType: "Contractor's Bond",
              bondCompany: ["Pacific Surety Demo Co.", "Golden Bear Bonding Demo", "West Coast Indemnity Demo"][index % 3],
              bondNumber: `DEMO-${licenseNumber}`,
              bondAmount: 25000,
              effectiveDate: "2025-01-01",
            },
          ],
    workersComp:
      index % 5 === 4
        ? [{ id: recordId, exemption: true }]
        : [
            {
              id: recordId,
              carrier: ["California Trade Insurance Demo", "Builders Mutual Demo", "Western WorkSafe Demo"][index % 3],
              policyNumber: `WC-DEMO-${licenseNumber}`,
              effectiveDate: "2026-01-01",
              expirationDate: "2027-01-01",
              exemption: false,
            },
          ],
  };
});

export function findDemoContractor(licenseNumber: string) {
  return demoContractors.find((contractor) => contractor.licenseNumber === licenseNumber);
}

export function findClassification(slug: string) {
  return classifications.find((classification) => classification.slug === slug.toLowerCase());
}
