export default function SearchLoading() {
  return <div className="page-shell loading-shell" aria-live="polite" aria-busy="true">
    <p className="loading-label">SEARCH INDEX / RETRIEVING RECORDS</p>
    <div aria-hidden="true" className="space-y-5"><div className="skeleton h-16" /><div className="skeleton h-8 w-1/2" />
      {[1, 2, 3].map((item) => <div key={item} className="skeleton h-48" />)}
    </div><span className="sr-only">Loading search results</span>
  </div>;
}
