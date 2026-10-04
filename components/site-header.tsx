import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="page-shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="group flex items-center gap-3 font-semibold tracking-tight text-slate-950">
          <span className="grid size-9 place-items-center rounded-lg bg-blue-900 text-sm font-bold text-white shadow-sm group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-blue-700">
            CA
          </span>
          <span className="hidden sm:inline">California Contractor Search</span>
          <span className="sm:hidden">Contractor Search</span>
        </Link>
        <Link href="/search" className="text-sm font-medium text-slate-600 hover:text-blue-900">
          Search licenses
        </Link>
      </div>
    </header>
  );
}
