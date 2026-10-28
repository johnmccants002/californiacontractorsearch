"use client";

import Link from "next/link";
import { useRef } from "react";
import { siteConfig } from "@/config/site";

export function MobileNav() {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => { if (ref.current) ref.current.open = false; };
  return <details ref={ref} className="mobile-nav" onKeyDown={(event) => {
    if (event.key === "Escape") {
      close();
      ref.current?.querySelector("summary")?.focus();
    }
  }}><summary>Menu <span aria-hidden="true">+</span></summary><nav aria-label="Mobile navigation">
    <Link href="/search" onClick={close}>Search licenses</Link>
    <Link href="/#trades" onClick={close}>Explore trades</Link>
    <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noopener noreferrer" onClick={close}>Official CSLB ↗<span className="sr-only"> (opens in a new tab)</span></a>
  </nav></details>;
}
