import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getLicenseSitemapEntries, getSitemapBounds } from "./sitemap-data";
import { escapeXml, licenseSitemapXml, pageSitemapXml, sitemapIndexXml } from "./sitemap-xml";

vi.mock("server-only", () => ({}));

function database(responses: { data: unknown; status?: number }[]) {
  const requests: URL[] = [];
  const client = createClient("https://sitemap.test", "test-public-key", {
    auth: { persistSession: false },
    global: { fetch: async (input) => {
      requests.push(new URL(String(input)));
      const response = responses.shift();
      if (!response) throw new Error("Unexpected query");
      return new Response(JSON.stringify(response.data), { status: response.status ?? 200, headers: { "content-type": "application/json" } });
    } },
  });
  return { client, requests };
}

const row = (id: number, extra: Record<string, unknown> = {}) => ({ id, license_number: String(id), business_name: "Imported business", source_status: "CLEAR", source_updated_at: "2025-12-11T00:00:00+00:00", ...extra });

describe("live sitemap pagination", () => {
  it("finds stable ID windows without full counts or profile joins", async () => {
    const { client, requests } = database([{ data: [{ id: 2 }] }, { data: [{ id: 1218817 }] }]);
    expect(await getSitemapBounds(client)).toEqual({ first: 0, last: 121 });
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.searchParams.get("select")).toBe("id");
      expect(request.searchParams.get("limit")).toBe("1");
      expect(request.searchParams.getAll("source_status")).toEqual(["not.is.null", "neq."]);
    }
  });

  it("continues past short API pages and never skips to the next ID window", async () => {
    const { client, requests } = database([{ data: [row(10001), row(10040)] }, { data: [row(19999)] }]);
    expect((await getLicenseSitemapEntries(client, 1)).map((item) => item.licenseNumber)).toEqual(["10001", "10040", "19999"]);
    expect(requests[0].searchParams.getAll("id")).toEqual(["gt.9999", "lt.20000"]);
    expect(requests[1].searchParams.getAll("id")).toEqual(["gt.10040", "lt.20000"]);
    expect(requests[0].searchParams.get("order")).toBe("id.asc");
    expect(requests[0].searchParams.get("limit")).toBe("1000");
  });

  it("exports more than the default API cap", async () => {
    const { client } = database([
      { data: Array.from({ length: 1000 }, (_, index) => row(index + 1)) },
      { data: [row(1001)] }, { data: [] },
    ]);
    expect(await getLicenseSitemapEntries(client, 0)).toHaveLength(1001);
  });

  it("keeps adjacent windows disjoint", async () => {
    const left = database([{ data: [row(9999)] }]);
    const right = database([{ data: [row(10000)] }, { data: [] }]);
    expect((await getLicenseSitemapEntries(left.client, 0))[0].licenseNumber).toBe("9999");
    expect((await getLicenseSitemapEntries(right.client, 1))[0].licenseNumber).toBe("10000");
  });

  it("excludes seeds and unconfirmed records, not real records sharing a demo number", async () => {
    const { client } = database([{ data: [
      row(1, { license_number: "1056730", business_name: "ABC Plumbing Inc." }),
      row(2, { source_status: null }), row(3, { source_status: " " }),
      row(4, { license_number: "1056730", business_name: "Real imported business", source_updated_at: null }),
      row(5, { license_number: "<invalid>" }),
    ] }, { data: [] }]);
    expect(await getLicenseSitemapEntries(client, 0)).toEqual([{ licenseNumber: "1056730", lastModified: undefined }]);
  });

  it("does not return partial results after an API failure", async () => {
    const { client } = database([{ data: [row(1)] }, { data: { message: "Unavailable" }, status: 400 }]);
    await expect(getLicenseSitemapEntries(client, 0)).rejects.toThrow("Could not read");
  });

  it("handles empty imports and rejects invalid cursors and shard IDs", async () => {
    expect(await getSitemapBounds(database([{ data: [] }, { data: [] }]).client)).toBeNull();
    await expect(getLicenseSitemapEntries(database([]).client, -1)).rejects.toThrow("Invalid");
    await expect(getLicenseSitemapEntries(database([{ data: [row(2), row(1)] }]).client, 0)).rejects.toThrow("cursor");
  });
});

describe("sitemap XML", () => {
  it("includes canonical real profile URLs and valid source dates", () => {
    const xml = licenseSitemapXml([{ licenseNumber: "1082303", lastModified: "2025-12-11T00:00:00.000Z" }, { licenseNumber: "1082304" }]);
    expect(xml).toContain("https://californiacontractorsearch.com/license/1082303");
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml).toContain("2025-12-11T00:00:00.000Z");
  });

  it("links every stable window from the root index", () => {
    const xml = sitemapIndexXml({ first: 100, last: 102 });
    expect(xml.match(/<sitemap>/g)).toHaveLength(4);
    expect(xml).toContain("/sitemaps/licenses-102.xml");
    expect(xml).not.toContain("licenses-103");
    expect(sitemapIndexXml(null)).not.toContain("licenses-");
  });

  it("excludes search, demo profiles, and fabricated static timestamps", () => {
    const xml = pageSitemapXml(true);
    expect(xml).toContain("/classification/c36");
    expect(xml).not.toMatch(/\/search|\/license\/|lastmod/);
    expect(pageSitemapXml(false)).not.toContain("<url>");
  });

  it("escapes XML special characters", () => {
    expect(escapeXml('<a href="x&y">\'')).toBe("&lt;a href=&quot;x&amp;y&quot;&gt;&apos;");
  });
});
