import Link from "next/link";

export default function LicenseNotFound() {
  return <div className="page-shell py-20 text-center"><p className="text-sm font-bold uppercase tracking-widest text-blue-800">404</p><h1 className="mt-3 text-3xl font-bold text-slate-950">License record not found</h1><p className="mt-3 text-slate-600">We could not find that contractor license in the current dataset.</p><Link href="/search" className="button-primary mt-7 h-12">Search licenses</Link></div>;
}
