import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DatasetNotice, LicenseVerification } from "./data-source";
import { demoContractors } from "@/lib/contractors/demo-data";
import { ResultCard } from "./search/result-card";

describe("source disclosure", () => {
  it("warns about absent imported records without inventing a new license status", () => {
    const contractor = { ...demoContractors[0], dataSource: "cslb" as const, sourceMissingSince: "2026-10-28" };
    const profile = renderToStaticMarkup(createElement(LicenseVerification, { contractor }));
    expect(profile).toContain("Not in latest CSLB download—verify with CSLB");
    expect(profile).toContain("does not establish whether");
    expect(profile).toContain('dateTime="2026-10-28"');
    expect(profile).toContain('href="https://www.cslb.ca.gov/1056730"');
    const card = renderToStaticMarkup(createElement(ResultCard, { contractor }));
    expect(card).toContain("Last known: ACTIVE");
    expect(card).toContain("status-last-known");
    expect(card).not.toContain("status-active");
    expect(card).toContain('href="/license/1056730"');
    expect(card.match(/<a\b/g)).toHaveLength(1);
  });
  it("removes the warning when a source record returns, without affecting ordinary cards", () => {
    const contractor = { ...demoContractors[0], dataSource: "cslb" as const, sourceMissingSince: undefined };
    const html = renderToStaticMarkup(createElement(ResultCard, { contractor }));
    expect(html).toContain("status-active");
    expect(html).not.toContain("Last known:");
    expect(html).not.toContain("Not in latest");
  });
  it("describes imported data without claiming live verification", () => {
    const html = renderToStaticMarkup(createElement(DatasetNotice, { source: "cslb" }));
    expect(html).toContain("imported public CSLB");
    expect(html).toContain("not a live CSLB status check");
    expect(html).not.toMatch(/fictional|MVP|demonstration/);
  });
  it("keeps demo and unavailable states distinct", () => {
    expect(renderToStaticMarkup(createElement(DatasetNotice, { source: "demo" }))).toContain("fictional demonstration records");
    expect(renderToStaticMarkup(createElement(DatasetNotice, { source: "unavailable" }))).toContain("No demonstration records have been substituted");
  });
  it("shows a source date and accessible official verification near the profile summary", () => {
    const html = renderToStaticMarkup(createElement(LicenseVerification, { contractor: { ...demoContractors[0], dataSource: "cslb", sourceUpdatedAt: "2025-12-11" } }));
    expect(html).toContain("Source: CSLB public records");
    expect(html).toContain("Source record updated:");
    expect(html).toContain('dateTime="2025-12-11T00:00:00.000Z"');
    expect(html).toContain("Dec 11, 2025");
    expect(html).toContain('href="https://www.cslb.ca.gov/1056730"');
    expect(html).toContain("Open license #1056730 directly on CSLB");
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("opens in a new tab");
  });
  it("does not dress demo timestamps up as CSLB freshness", () => {
    const html = renderToStaticMarkup(createElement(LicenseVerification, { contractor: demoContractors[0] }));
    expect(html).toContain("Fictional demonstration record");
    expect(html).not.toContain("Source: CSLB");
    expect(html).not.toContain("<time");
    expect(html).toContain('href="https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx"');
    expect(html).not.toContain('href="https://www.cslb.ca.gov/1056730"');
  });
  it("labels missing dates honestly", () => {
    const html = renderToStaticMarkup(createElement(LicenseVerification, { contractor: { ...demoContractors[0], dataSource: "cslb", sourceUpdatedAt: "" } }));
    expect(html).toContain("Date unavailable");
    expect(html).not.toContain("<time");
  });
});
