import Link from "next/link";
import { tradeCityPages, tradeCityPath } from "@/lib/seo/directory-pages";

export function TradeCityLinks({ classification, excludePath }: { classification?: string; excludePath?: string }) {
  const pages = tradeCityPages.filter((page) => (!classification || page.classification === classification) && tradeCityPath(page) !== excludePath);
  if (!pages.length) return null;
  return <nav className="city-directory" aria-label="Selected trade and city directories">
    <p className="eyebrow">EXPLORE LOCAL LICENSE RECORDS</p>
    <div className="city-directory-links">{pages.map((page) => <Link key={tradeCityPath(page)} href={tradeCityPath(page)} className="button-secondary">
      {page.tradeName} in {page.cityName}<span aria-hidden="true">↗</span>
    </Link>)}</div>
  </nav>;
}
