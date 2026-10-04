export default function SearchLoading() {
  return (
    <div className="page-shell py-12" aria-live="polite" aria-busy="true">
      <div className="mx-auto max-w-4xl animate-pulse space-y-5">
        <div className="h-12 rounded-xl bg-slate-200" />
        <div className="h-8 w-1/2 rounded bg-slate-200" />
        {[1, 2, 3].map((item) => <div key={item} className="h-48 rounded-2xl border border-slate-200 bg-white" />)}
        <span className="sr-only">Loading search results</span>
      </div>
    </div>
  );
}
