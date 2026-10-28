import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return <footer className="site-footer"><div className="page-shell">
    <div className="footer-top"><Link href="/" aria-label="California Contractor Search home"><BrandLogo /></Link><p>Public records.<br />Clearer decisions.</p></div>
    <div className="footer-bottom"><div>
      <p className="font-semibold">California Contractor Search</p>
      <p>{siteConfig.disclaimer}</p>
      <p>License information should be verified with CSLB before making important decisions.</p>
    </div><nav aria-label="Footer navigation">
      <Link href="/">Home</Link><Link href="/search">Search licenses</Link>
      <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noopener noreferrer">Official CSLB lookup ↗<span className="sr-only"> (opens in a new tab)</span></a>
    </nav></div>
    <div className="footer-colophon technical"><span>CA / CONTRACTOR SEARCH INDEX</span><span>INDEPENDENT BY DESIGN.</span></div>
  </div></footer>;
}
