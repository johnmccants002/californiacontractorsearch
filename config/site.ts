export const siteConfig = {
  name: "California Contractor Search",
  shortName: "Contractor Search",
  description:
    "Search California contractor licenses by name, license number, trade, classification, or location.",
  url: "https://californiacontractorsearch.com",
  cisUrl:
    process.env.NEXT_PUBLIC_CIS_URL ??
    "https://www.contractorsischool.com/",
  cslbLookupUrl: "https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx",
  disclaimer:
    "California Contractor Search is an independent service and is not affiliated with the California Contractors State License Board (CSLB).",
} as const;

export const featuredClassifications = [
  { code: "B", name: "General Building", slug: "b" },
  { code: "C-10", name: "Electrical", slug: "c10" },
  { code: "C-27", name: "Landscaping", slug: "c27" },
  { code: "C-33", name: "Painting and Decorating", slug: "c33" },
  { code: "C-36", name: "Plumbing", slug: "c36" },
  { code: "C-39", name: "Roofing", slug: "c39" },
  { code: "C-46", name: "Solar", slug: "c46" },
] as const;
