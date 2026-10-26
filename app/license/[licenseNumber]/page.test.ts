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
  });
  it("indexes imported records and puts verification before the details", async () => {
    vi.mocked(getContractorByLicense).mockResolvedValue({ ...demoContractors[0], dataSource: "cslb" });
    expect((await generateMetadata(props)).robots).toEqual({ index: true, follow: true });
    const html = renderToStaticMarkup(await LicensePage(props));
    expect(html).toContain("application/ld+json");
    expect(html).not.toMatch(/fictional|MVP|demonstration records/i);
    expect(html.indexOf("Record source and verification")).toBeLessThan(html.indexOf(">License Information<"));
  });
  it("does not index missing records", async () => {
    vi.mocked(getContractorByLicense).mockResolvedValue(undefined);
    expect((await generateMetadata(props)).robots).toEqual({ index: false, follow: true });
  });
});
