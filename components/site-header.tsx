import Link from "next/link";
import { BrandLogo, Arrow } from "@/components/brand";
import { MobileNav } from "@/components/mobile-nav";
import { siteConfig } from "@/config/site";

export function SiteHeader() {
  return <header className="site-header"><div className="page-shell header-inner">
    <Link href="/" className="brand-link" aria-label="California Contractor Search home"><BrandLogo /></Link>
    <nav className="desktop-nav" aria-label="Main navigation">
      <Link href="/search">Search licenses</Link>
      <Link href="/#trades">Explore trades</Link>
      <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noopener noreferrer">Official CSLB <Arrow diagonal /><span className="sr-only"> (opens in a new tab)</span></a>
    </nav>
    <MobileNav />
  </div></header>;
}
