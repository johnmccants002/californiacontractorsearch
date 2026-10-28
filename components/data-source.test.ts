import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DatasetNotice, LicenseVerification } from "./data-source";
import { demoContractors } from "@/lib/contractors/demo-data";

describe("source disclosure", () => {
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
