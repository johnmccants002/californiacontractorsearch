import Link from "next/link";

export default function NotFound() {
  return <section className="page-shell inner-page"><div className="empty-state">
    <p className="eyebrow">404 / OUTSIDE THE INDEX</p><h1>This page isn’t on the plans.</h1>
    <p>The page may have moved, or the address may be incorrect. Start with a contractor name, license number, or trade.</p>
    <Link href="/search" className="button-primary">Search licenses →</Link>
  </div></section>;
}
