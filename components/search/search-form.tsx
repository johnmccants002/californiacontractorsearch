import Link from "next/link";

const examples = ["ABC Plumbing", "1056730", "C-36 Sacramento", "John Smith", "Electricians Roseville"];

interface SearchFormProps {
  defaultValue?: string;
  compact?: boolean;
  showExamples?: boolean;
}

export function SearchForm({ defaultValue = "", compact = false, showExamples = false }: SearchFormProps) {
  return (
    <div>
      <form action="/search" role="search" className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={compact ? "search-compact" : "search-main"} className="sr-only">
          Search contractor licenses
        </label>
        <input
          id={compact ? "search-compact" : "search-main"}
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search contractor, license number, trade, city, or ZIP"
          autoComplete="off"
          className={`min-w-0 flex-1 rounded-xl border border-slate-300 bg-white text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-100 ${compact ? "h-12 px-4 text-base" : "h-14 px-5 text-base sm:text-lg"}`}
        />
        <button type="submit" className={`button-primary shrink-0 ${compact ? "h-12" : "h-14"}`}>
          Search
        </button>
      </form>
      {showExamples ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
          <span>Try:</span>
          {examples.map((example) => (
            <Link key={example} href={`/search?q=${encodeURIComponent(example)}`} className="font-medium text-blue-800 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-700">
              {example}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
