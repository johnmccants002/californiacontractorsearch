import Link from "next/link";
import { searchHref, type SearchState } from "@/lib/search/filters";

export function Pagination({ page, totalPages, state }: { page: number; totalPages: number; state: SearchState }) {
  if (totalPages <= 1) return null;
  const makeHref = (nextPage: number) => searchHref(state, nextPage);

  return (
    <nav aria-label="Search results pages" className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5">
      {page > 1 ? <Link href={makeHref(page - 1)} className="button-secondary">← Previous</Link> : <span />}
      <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
      {page < totalPages ? <Link href={makeHref(page + 1)} className="button-secondary">Next →</Link> : <span />}
    </nav>
  );
}
