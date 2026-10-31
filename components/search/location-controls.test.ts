import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LocationControls } from "./location-controls";
import { normalizeFilters } from "@/lib/search/filters";
import { getBrowserLocation } from "@/lib/search/browser-location";

vi.mock("@/lib/search/browser-location", () => ({ getBrowserLocation: vi.fn() }));
describe("nearby controls", () => {
  it("renders accessible native GET fields, presets, and fallback without requesting location", () => {
    const html = renderToStaticMarkup(createElement(LocationControls, { filters: normalizeFilters(), input: {} }));
    for (const name of ["near", "radius", "lat", "lng"]) expect(html).toContain(`name="${name}"`);
    expect(html.match(/<button[^>]*name="nearby"[^>]*>/)?.[0]).toContain('value="1"');
    expect(html).toContain('aria-label="Distance presets"');
    for (const miles of [10, 25, 50]) expect(html).toContain(`${miles} mi`);
    expect(html).toContain("<noscript>");
    expect(html).toContain("Use my location");
    expect(html).toContain("not confirmed service areas");
    expect(html).toContain("search URL");
    expect(getBrowserLocation).not.toHaveBeenCalled();
  });
  it("shows a friendly place without carrying hidden coordinates from that place", () => {
    const filters = normalizeFilters({ near: "Sacramento, CA", lat: "38.567694", lng: "-121.468161", radius: "25" });
    const html = renderToStaticMarkup(createElement(LocationControls, { filters, input: {} }));
    expect(html).toContain('value="Sacramento, CA"');
    expect(html).not.toContain('value="38.567694"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Clear location");
  });
  it("preserves legacy or invalid coordinate inputs for correction", () => {
    const html = renderToStaticMarkup(createElement(LocationControls, { filters: normalizeFilters(), input: { lat: "999", lng: "-121" } }));
    expect(html).toContain('value="999"');
    expect(html).toContain('value="-121"');
    expect(html).toContain('class="geo-advanced" open=""');
  });
});
