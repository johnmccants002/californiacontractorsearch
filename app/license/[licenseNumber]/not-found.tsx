import Link from "next/link";

export default function LicenseNotFound() {
  return <div className="page-shell inner-page"><div className="empty-state">
    <p className="eyebrow">404 / RECORD NOT FOUND</p><h1>License record not found</h1>
    <p>We could not find that contractor license in the current dataset. Try a business name or check the license number.</p>
    <Link href="/search" className="button-primary">Search licenses →</Link>
  </div></div>;
}
