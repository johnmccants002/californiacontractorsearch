"use client";

import { useState, type ReactNode } from "react";

export function FilterDisclosure({ children, count }: { children: ReactNode; count: number }) {
  const [expanded, setExpanded] = useState(false);
  return <div className="filter-panel">
    <button type="button" aria-expanded={expanded} aria-controls="search-filter-fields"
      onClick={() => setExpanded(!expanded)} className="filter-toggle">
      <span>Filters and sort{count ? ` (${count})` : ""}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span>
    </button>
    <div id="search-filter-fields" className={`search-filter-fields gap-4 md:grid md:grid-cols-3 xl:grid-cols-[1.6fr_1.2fr_.8fr_1fr_1.1fr_auto] ${expanded ? "mt-4 grid sm:grid-cols-2 md:mt-0" : "hidden"}`}>
      {children}
    </div>
    <noscript><style>{".search-filter-fields { display: grid !important; } .filter-toggle { display: none !important; }"}</style></noscript>
  </div>;
}
