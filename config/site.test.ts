import { describe, expect, it } from "vitest";
import { getCslbLicenseUrl, siteConfig } from "./site";

describe("official CSLB license links", () => {
  it.each(["1088605", "1082303", "0123456"])("links directly to license %s", (number) => {
    expect(getCslbLicenseUrl(number)).toBe(`https://www.cslb.ca.gov/${number}`);
  });
  it("trims surrounding whitespace without changing the license number", () => {
    expect(getCslbLicenseUrl(" 1088605 ")).toBe("https://www.cslb.ca.gov/1088605");
  });
  it.each([undefined, "", " ", "../1088605", "1088605?other=1", "not-a-license"])("uses the general lookup for an absent or malformed number: %s", (number) => {
    expect(getCslbLicenseUrl(number)).toBe(siteConfig.cslbLookupUrl);
  });
});
