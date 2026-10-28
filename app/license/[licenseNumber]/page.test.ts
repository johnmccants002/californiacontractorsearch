import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LicensePage, { generateMetadata } from "./page";
import { getContractorByLicense } from "@/lib/contractors/repository";
import { demoContractors } from "@/lib/contractors/demo-data";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/contractors/repository", () => ({ getContractorByLicense: vi.fn() }));
const props = { params: Promise.resolve({ licenseNumber: "1056730" }) };
beforeEach(() => vi.resetAllMocks());

describe("profile indexing and source presentation", () => {
  it.each(["demo", "unknown"] as const)("does not index or add business schema to %s records", async (dataSource) => {
    vi.mocked(getContractorByLicense).mockResolvedValue({ ...demoContractors[0], dataSource });
    expect((await generateMetadata(props)).robots).toEqual({ index: false, follow: true });
    const html = renderToStaticMarkup(await LicensePage(props));
    expect(html).not.toContain("application/ld+json");
    expect(html).not.toContain("Source: CSLB public records");
    expect(html).toContain(dataSource === "demo" ? "Fictional demonstration record" : "Record source unconfirmed");
    expect(html.match(/href="https:\/\/www\.cslb\.ca\.gov\/OnlineServices\/CheckLicenseII\/CheckLicense\.aspx"/g)).toHaveLength(2);
    expect(html).not.toContain('href="https://www.cslb.ca.gov/1056730"');
  });
  it("indexes imported records and puts verification before the details", async () => {
    vi.mocked(getContractorByLicense).mockResolvedValue({ ...demoContractors[0], dataSource: "cslb" });
    expect((await generateMetadata(props)).robots).toEqual({ index: true, follow: true });
    const html = renderToStaticMarkup(await LicensePage(props));
    expect(html).toContain("application/ld+json");
    expect(html).not.toMatch(/fictional|MVP|demonstration records/i);
    expect(html.indexOf("Record source and verification")).toBeLessThan(html.indexOf(">License Information<"));
    expect(html.match(/href="https:\/\/www\.cslb\.ca\.gov\/1056730"/g)).toHaveLength(2);
    expect(html).not.toContain("CheckLicense.aspx");
  });
  it("does not index missing records", async () => {
    vi.mocked(getContractorByLicense).mockResolvedValue(undefined);
    expect((await generateMetadata(props)).robots).toEqual({ index: false, follow: true });
  });
  it("keeps all dossier sections and source dates in the server-rendered record", async () => {
    vi.mocked(getContractorByLicense).mockResolvedValue({ ...demoContractors[0], dataSource: "cslb", sourceUpdatedAt: "2026-10-03T00:00:00Z" });
    const html = renderToStaticMarkup(await LicensePage(props));
    for (const section of ["License Information", "Classifications", "Business Information", "Personnel", "Bond Information", "Workers’ Compensation", "Source and verification", "Frequently asked questions"]) {
      expect(html).toContain(section);
    }
    expect(html).toContain("<time");
    expect(html).toContain("Oct 3, 2026");
    expect(html).toContain("not a live status check");
  });
  it("routes non-editorial classifications to the existing filtered search", async () => {
    const record = demoContractors[0];
    vi.mocked(getContractorByLicense).mockResolvedValue({
      ...record,
      classifications: [...record.classifications, { ...record.classifications[0], id: 999, code: "d06", slug: "d06", name: "Concrete Related Services Contractor" }],
    });
    const html = renderToStaticMarkup(await LicensePage(props));
    expect(html).toContain('href="/search?classification=d06"');
    expect(html).not.toContain('href="/classification/d06"');
    expect(html).toContain(`href="/classification/${record.classifications[0].slug}"`);
  });
});
