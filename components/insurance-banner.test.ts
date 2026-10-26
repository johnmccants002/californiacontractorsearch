import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsuranceBanner } from "./insurance-banner";

describe("insurance advertisement", () => {
  it("clearly identifies the advertiser without implying free insurance", () => {
    const html = renderToStaticMarkup(createElement(InsuranceBanner));
    expect(html).toContain('aria-label="Advertisement: Pro-Builders Insurance Agency"');
    expect(html).toContain(">Advertisement</p>");
    expect(html).toContain("Pro-Builders Insurance Agency");
    expect(html).toContain("General Liability, Workers’ Comp &amp; Contractor Bonds");
    expect(html).not.toMatch(/free insurance|official|recommended|endorsed/i);
  });

  it("links directly to the requested site and protects the current search tab", () => {
    const html = renderToStaticMarkup(createElement(InsuranceBanner));
    expect(html).toContain('href="https://insureprobuilders.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="sponsored noopener noreferrer"');
    expect(html).toContain("opens in a new tab");
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("renders without third-party scripts, tracking pixels, or embedded forms", () => {
    expect(renderToStaticMarkup(createElement(InsuranceBanner))).not.toMatch(/<(script|iframe|img)\b/);
  });
});
