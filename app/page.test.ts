import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HomePage, { generateMetadata } from "./page";
import { getDatasetSource } from "@/lib/contractors/repository";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/contractors/repository", () => ({ getDatasetSource: vi.fn() }));

describe("homepage data-source mode", () => {
  it("describes imported records without leftover demo disclaimers", async () => {
    vi.mocked(getDatasetSource).mockResolvedValue("cslb");
    expect((await generateMetadata()).robots).toEqual({ index: true, follow: true });
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain("Search imported public CSLB license records");
    expect(html).toContain('href="/contractors/plumbing/sacramento"');
    expect(html).not.toMatch(/fictional|demonstration records|MVP/i);
  });
  it.each(["demo", "empty", "unknown", "unavailable"] as const)("does not promote %s mode as a live directory", async (source) => {
    vi.mocked(getDatasetSource).mockResolvedValue(source);
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: true });
    const html = renderToStaticMarkup(await HomePage());
    expect(html).not.toContain("Search imported public CSLB license records");
    expect(html).not.toContain('href="/contractors/');
  });
});
