import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getClassificationLicenseIds } from "./classification-query";

vi.mock("server-only", () => ({}));

function fixture(respond: (url: URL) => { data: unknown; status?: number }) {
  const requests: { url: URL; init?: RequestInit }[] = [];
  const client = createClient("https://records.test", "test-public-key", {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      const response = respond(url);
      return new Response(JSON.stringify(response.data), {
        status: response.status ?? 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  return { client, requests };
}

describe("bounded classification reads", () => {
  it("filters through both inner joins before limiting IDs, without an unused count", async () => {
    const { client, requests } = fixture(() => ({ data: [{ id: 9 }, { id: 2 }] }));
    expect(await getClassificationLicenseIds(client, "b", {})).toEqual([2, 9]);
    expect(requests).toHaveLength(1);
    const { url, init } = requests[0];
    expect(url.pathname).toBe("/rest/v1/licenses");
    expect(url.searchParams.get("select")).toBe("id,license_classifications!inner(classifications!inner(slug))");
    expect(url.searchParams.get("license_classifications.classifications.slug")).toBe("eq.b");
    expect(url.searchParams.has("order")).toBe(false);
    expect(url.searchParams.get("limit")).toBe("100");
    expect(new Headers(init?.headers).get("prefer") ?? "").not.toContain("count=");
    expect(url.searchParams.get("select")).not.toContain("*");
  });

  it("preserves the database business normalizer and applies all filters server-side", async () => {
    const { client, requests } = fixture((url) => ({
      data: url.pathname.includes("/rpc/") ? "1 demolition" : [{ id: 42 }],
    }));
    expect(await getClassificationLicenseIds(client, "c21", {
      q: "The 1 Demolition Inc.", city: " El Cerrito ", zip: "94530", status: " active ",
    })).toEqual([42]);
    expect(requests[0].url.pathname).toBe("/rest/v1/rpc/normalize_business_name");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ input: "The 1 Demolition Inc." });
    const params = requests[1].url.searchParams;
    expect(params.get("business_name_normalized")).toBe("like.%1 demolition%");
    expect(params.get("city")).toBe("ilike.El Cerrito");
    expect(params.get("zip")).toBe("like.94530%");
    expect(params.get("license_status")).toBe("eq.ACTIVE");
    expect(params.getAll("search_vector")).toEqual(["plfts(simple).El Cerrito", "fts(simple).94530:*"]);
  });

  it("does not let city or ZIP wildcard characters broaden the filter", async () => {
    const { client, requests } = fixture(() => ({ data: [] }));
    await getClassificationLicenseIds(client, "c36", { city: "San_%", zip: "95_" });
    expect(requests[0].url.searchParams.get("city")).toBe("ilike.San\\_\\%");
    expect(requests[0].url.searchParams.get("zip")).toBe("like.95\\_%");
    expect(requests[0].url.searchParams.getAll("search_vector")).toEqual(["plfts(simple).San_%"]);
  });

  it("uses the existing search index for numeric ZIP prefixes without needing a city", async () => {
    const { client, requests } = fixture(() => ({ data: [] }));
    await getClassificationLicenseIds(client, "b", { zip: " 958 " });
    expect(requests[0].url.searchParams.get("search_vector")).toBe("fts(simple).958:*");
    expect(requests[0].url.searchParams.get("zip")).toBe("like.958%");
  });

  it("skips blank filters and keeps an empty match set empty", async () => {
    const { client, requests } = fixture(() => ({ data: [] }));
    expect(await getClassificationLicenseIds(client, "c46", { q: " ", city: " ", zip: " ", status: " " })).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0].url.searchParams.has("city")).toBe(false);
  });

  it("does not hide query or normalization failures", async () => {
    const { client } = fixture(() => ({ data: { message: "Unavailable" }, status: 400 }));
    await expect(getClassificationLicenseIds(client, "b", {})).rejects.toThrow("classification query failed");
    await expect(getClassificationLicenseIds(client, "b", { q: "Builder" })).rejects.toThrow("business normalization failed");
  });
});
