"use client";

import { siteConfig } from "@/config/site";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <section className="page-shell inner-page"><div className="empty-state">
    <p className="eyebrow">INDEX TEMPORARILY UNAVAILABLE</p><h1>A brief interruption.</h1>
    <p>We couldn’t load this page. Please try again. You can also verify license information directly with CSLB.</p>
    <div className="flex flex-wrap gap-3"><button onClick={retry} className="button-primary">Try again</button>
      <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noopener noreferrer" className="button-secondary">Official CSLB lookup ↗<span className="sr-only"> (opens in a new tab)</span></a>
    </div>
  </div></section>;
}
