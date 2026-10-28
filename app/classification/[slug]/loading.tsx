export default function ClassificationLoading() {
  return <div className="page-shell loading-shell" aria-live="polite" aria-busy="true">
    <p className="loading-label">TRADE INDEX / LOADING CONTRACTORS</p>
    <div aria-hidden="true" className="space-y-5">
      <div className="skeleton h-8 w-1/3" />
      <div className="skeleton h-24" />
      <div className="skeleton h-16" />
      {[1, 2, 3].map((item) => <div key={item} className="skeleton h-48" />)}
    </div>
    <span className="sr-only">Loading contractors for this classification</span>
  </div>;
}
