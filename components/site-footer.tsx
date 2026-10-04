import Link from "next/link";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white">
      <div className="page-shell grid gap-6 py-10 text-sm text-slate-600 md:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <p className="font-semibold text-slate-900">California Contractor Search</p>
          <p className="mt-2 leading-6">{siteConfig.disclaimer}</p>
          <p className="mt-2">License information should be verified with CSLB before making important decisions.</p>
        </div>
        <nav aria-label="Footer navigation" className="flex items-start gap-5">
          <Link href="/" className="hover:text-blue-900">Home</Link>
          <Link href="/search" className="hover:text-blue-900">Search</Link>
          <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noreferrer" className="hover:text-blue-900">Official CSLB lookup</a>
        </nav>
      </div>
    </footer>
  );
}
