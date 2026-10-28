import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDatasetSource } from "@/lib/contractors/repository";
import { generateMetadata } from "./page";
import type { DirectorySearchParams } from "@/lib/seo/directory-pages";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/contractors/repository", () => ({ getDatasetSource: vi.fn() }));
const props = (query: DirectorySearchParams = {}, slug = "c36") => ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(query) });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getDatasetSource).mockResolvedValue("cslb"); });

describe("classification indexing policy", () => {
  it("keeps the unfiltered imported trade page indexable", async () => {
    const metadata = await generateMetadata(props());
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates?.canonical).toBe("/classification/c36");
    expect(metadata.title).toEqual({ absolute: "C-36 Plumbing Contractors in California | Contractor Search" });
  });
  it.each([{ q: "plumber" }, { city: "Sacramento" }, { zip: "95814" }, { status: "ACTIVE" }, { q: "" }, { status: ["ACTIVE", "EXPIRED"] }, { page: "2" }])("noindexes a parameterized trade page: %j", async (query) => {
    const metadata = await generateMetadata(props(query));
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe("/classification/c36");
  });
  it.each(["demo", "unknown", "empty", "unavailable"] as const)("does not index %s data", async (source) => {
    vi.mocked(getDatasetSource).mockResolvedValue(source);
    expect((await generateMetadata(props())).robots).toEqual({ index: false, follow: true });
  });
  it("does not index unknown classifications", async () => {
    expect((await generateMetadata(props({}, "not-a-trade"))).robots).toEqual({ index: false, follow: true });
  });
});
