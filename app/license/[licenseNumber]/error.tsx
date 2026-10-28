"use client";

import { siteConfig } from "@/config/site";

export default function LicenseError({ retry }: { retry: () => void }) {
  return <section className="page-shell inner-page"><div className="empty-state">
    <p className="eyebrow">RECORD TEMPORARILY UNAVAILABLE</p>
    <h1>Let’s try that again.</h1>
    <p>We couldn’t load this license record. No demonstration data has been substituted. Try again, or check the official CSLB lookup.</p>
    <div className="flex flex-wrap gap-3">
      <button onClick={retry} className="button-primary">Try again</button>
      <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noopener noreferrer" className="button-secondary">Official CSLB lookup ↗<span className="sr-only"> (opens in a new tab)</span></a>
    </div>
  </div></section>;
}
