import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BrandMark } from "@/components/brand";

export const alt = "California Contractor Search — Find the right contractor. Know who you're hiring.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const font = await readFile(join(process.cwd(), "app/fonts/barlow-condensed-social.ttf"));
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", background: "#F2EFE6", color: "#1D292D", width: "100%", height: "100%", padding: "48px 64px", fontFamily: "Barlow" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, borderBottom: "1px solid #C7C1B2", paddingBottom: 28 }}>
        <BrandMark size={58} /><span style={{ fontSize: 38 }}>CA / CONTRACTOR</span><span style={{ marginLeft: "auto", fontSize: 24 }}>SEARCH INDEX</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
        <span style={{ fontSize: 106, lineHeight: .92 }}>FIND THE RIGHT CONTRACTOR.</span>
        <span style={{ fontSize: 64, lineHeight: 1.2, marginTop: 14 }}>Know who you’re hiring.</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", borderTop: "1px solid #C7C1B2", paddingTop: 24, fontSize: 25 }}>
        <span>CALIFORNIA CONTRACTOR SEARCH</span><span style={{ color: "#9D3C1B" }}>PUBLIC RECORDS. CLEARER DECISIONS.</span>
      </div>
    </div>,
    { ...size, fonts: [{ name: "Barlow", data: font, style: "normal", weight: 600 }] },
  );
}
