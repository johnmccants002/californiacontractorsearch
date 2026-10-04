import Link from "next/link";

export function Pagination({ page, totalPages, query }: { page: number; totalPages: number; query: string }) {
  if (totalPages <= 1) return null;
  const makeHref = (nextPage: number) => `/search?q=${encodeURIComponent(query)}&page=${nextPage}`;

  return (
    <nav aria-label="Search results pages" className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5">
      {page > 1 ? <Link href={makeHref(page - 1)} className="button-secondary">← Previous</Link> : <span />}
      <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
      {page < totalPages ? <Link href={makeHref(page + 1)} className="button-secondary">Next →</Link> : <span />}
    </nav>
  );
}
