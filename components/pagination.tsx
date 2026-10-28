import Link from "next/link";
import { searchHref, type SearchState } from "@/lib/search/filters";

export function Pagination({ page, totalPages, state }: { page: number; totalPages: number; state: SearchState }) {
  if (totalPages <= 1) return null;
  const makeHref = (nextPage: number) => searchHref(state, nextPage);
  return <nav aria-label="Search results pages" className="pagination">
    {page > 1 ? <Link href={makeHref(page - 1)} className="button-secondary">← Previous</Link> : <span />}
    <span>Page {page} of {totalPages}</span>
    {page < totalPages ? <Link href={makeHref(page + 1)} className="button-secondary">Next →</Link> : <span />}
  </nav>;
}
