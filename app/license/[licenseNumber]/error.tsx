"use client";

import { siteConfig } from "@/config/site";

export default function LicenseError({ reset }: { reset: () => void }) {
  return <section className="page-shell py-16">
    <h1 className="text-2xl font-bold text-slate-950">License information is temporarily unavailable</h1>
    <p className="mt-4 max-w-2xl leading-7 text-slate-600">We couldn’t load this record. No demonstration data has been substituted. Try again, or check the official CSLB lookup.</p>
    <div className="mt-6 flex flex-wrap gap-3">
      <button onClick={reset} className="button-primary">Try again</button>
      <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noopener noreferrer" className="button-secondary">Official CSLB lookup ↗<span className="sr-only"> (opens in a new tab)</span></a>
    </div>
  </section>;
}
