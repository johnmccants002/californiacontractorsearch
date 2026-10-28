import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./brand";
import { SearchForm } from "./search/search-form";
import { SearchControls } from "./search/search-controls";
import { ResultCard } from "./search/result-card";
import { StatusBadge } from "./license/status-badge";
import { demoContractors } from "@/lib/contractors/demo-data";
import { normalizeFilters } from "@/lib/search/filters";
import SearchLoading from "@/app/search/loading";

describe("architectural UI contracts", () => {
  it("keeps primary-action and muted-text contrast above AA for normal text", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const token = (name: string) => css.match(new RegExp(`--${name}: #(\\w{6})`))![1];
    const luminance = (hex: string) => hex.match(/../g)!.map((part) => parseInt(part, 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    for (const [foreground, background] of [["action-ink", "orange"], ["muted", "paper"], ["iron", "paper"]]) {
      const values = [luminance(token(foreground)), luminance(token(background))].sort((a, b) => a - b);
      expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).toContain("color: var(--action-ink)");
  });
  it("disables animation and smooth scrolling for reduced motion", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*scroll-behavior: auto/);
    expect(css).toContain("animation: none !important");
  });
  it("uses an accessible decorative SVG mark, not an external asset", () => {
    const html = renderToStaticMarkup(createElement(BrandMark));
    expect(html).toContain('viewBox="0 0 48 48"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<img|<script/);
  });
  it("keeps search as a labeled native GET form", () => {
    const html = renderToStaticMarkup(createElement(SearchForm, { defaultValue: "1 Demolition", showExamples: true }));
    expect(html).toContain('action="/search"');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="1 Demolition"');
    expect(html).toContain('for="search-main"');
    expect(html).toContain('href="/search?q=1082303"');
    expect(html).not.toContain('method="post"');
  });
  it("preserves filter names, values, validation, and the no-JavaScript fallback", () => {
    const html = renderToStaticMarkup(createElement(SearchControls, {
      state: { query: "builder", filters: normalizeFilters({ classification: "c36", city: "Sacramento", zip: "95814", status: "ACTIVE", sort: "name" }) },
      catalog: [],
    }));
    for (const name of ["q", "classification", "city", "zip", "status", "sort"]) expect(html).toContain(`name="${name}"`);
    expect(html).toContain('pattern="[0-9]{5}"');
    expect(html).toContain('value="sacramento"');
    expect(html).toContain('aria-controls="search-filter-fields"');
    expect(html).toContain("<noscript>");
    expect(html).toContain("display: grid !important");
    expect(html).toContain('aria-label="Applied filters"');
  });
  it.each(["ACTIVE", "EXPIRED", "SUSPENDED", "INACTIVE"] as const)("states %s in text, not only color", (status) => {
    const html = renderToStaticMarkup(createElement(StatusBadge, { status }));
    expect(html).toContain(`>${status}</span>`);
    expect(html).toContain(`status-${status.toLowerCase()}`);
  });
  it("preserves result URLs and warns about demo provenance without a verification claim", () => {
    const record = demoContractors[0];
    const html = renderToStaticMarkup(createElement(ResultCard, { contractor: record, matchedBy: ["exact business name"] }));
    expect(html).toContain(`href="/license/${record.licenseNumber}"`);
    expect(html).toContain("Fictional demonstration record");
    expect(html).toContain("Matched by exact business name");
    expect(html).toContain("Registered location");
    expect(html).not.toContain("Verified");
  });
  it("announces loading while excluding placeholder blocks from the accessibility tree", () => {
    const html = renderToStaticMarkup(createElement(SearchLoading));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Loading search results");
  });
});
