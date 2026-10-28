import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoContractors } from "@/lib/contractors/demo-data";
import { getTradeCityDirectory } from "@/lib/seo/trade-city-data";
import { tradeCityPages, type DirectorySearchParams } from "@/lib/seo/directory-pages";
import DirectoryPage, { generateMetadata } from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/seo/trade-city-data", () => ({ getTradeCityDirectory: vi.fn() }));
const props = (query: DirectorySearchParams = {}) => ({ params: Promise.resolve({ trade: "plumbing", city: "sacramento" }), searchParams: Promise.resolve(query) });
const directory = { page: tradeCityPages[0], contractors: [{ ...demoContractors[0], dataSource: "cslb" as const, businessName: "A REAL PLUMBER", city: "SACRAMENTO" }] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getTradeCityDirectory).mockResolvedValue(directory); });

describe("server-rendered trade and city pages", () => {
  it("uses unique clean-URL metadata and indexes only unparameterized pages", async () => {
    const metadata = await generateMetadata(props());
    expect(metadata.title).toEqual({ absolute: "Plumbing Contractors in Sacramento, CA | Contractor Search" });
    expect(metadata.alternates?.canonical).toBe("/contractors/plumbing/sacramento");
    expect(metadata.robots).toEqual({ index: true, follow: true });
    for (const query of [{ q: "builder" }, { city: "Fresno" }, { page: "2" }, { sort: "name" }, { utm_source: "email" }]) {
      expect((await generateMetadata(props(query))).robots).toEqual({ index: false, follow: true });
    }
  });
  it("renders visible license links, location caveats, and accurate list schema in HTML", async () => {
    const html = renderToStaticMarkup(await DirectoryPage(props()));
    expect(html).toContain("Plumbing contractors in Sacramento");
    expect(html).toContain("A REAL PLUMBER");
    expect(html).toContain('href="/license/1056730"');
    expect(html).toContain("does not establish a contractor’s service area");
    expect(html).toContain("not a live CSLB status check");
    expect(html).toContain('"numberOfItems":1');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain("classification=c36&amp;city=sacramento&amp;sort=name");
    expect(html).not.toMatch(/Loading|aria-busy|<div hidden/);
  });
  it("escapes record data in JSON-LD", async () => {
    vi.mocked(getTradeCityDirectory).mockResolvedValue({ ...directory, contractors: [{ ...directory.contractors[0], businessName: "</script><script>alert(1)</script>" }] });
    const html = renderToStaticMarkup(await DirectoryPage(props()));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("\\u003c/script>");
  });
  it("returns a not-found response for unsupported, empty, or demo directories", async () => {
    vi.mocked(getTradeCityDirectory).mockResolvedValue(null);
    await expect(DirectoryPage(props())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    await expect(generateMetadata(props())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
  it("does not turn an outage into a successful landing page", async () => {
    vi.mocked(getTradeCityDirectory).mockRejectedValue(new Error("Unavailable"));
    await expect(DirectoryPage(props())).rejects.toThrow("Unavailable");
    await expect(generateMetadata(props())).rejects.toThrow("Unavailable");
  });
});
