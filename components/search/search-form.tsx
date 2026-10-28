import Link from "next/link";
import { Arrow, SearchIcon } from "@/components/brand";
import { AutocompleteInput } from "./autocomplete-input";
import { typesenseEnabled } from "@/lib/typesense/config";

const examples = ["1 Demolition", "1082303", "Plumbers in Sacramento", "C-36 Sacramento"];

interface SearchFormProps {
  defaultValue?: string;
  compact?: boolean;
  showExamples?: boolean;
}

export function SearchForm({ defaultValue = "", compact = false, showExamples = false }: SearchFormProps) {
  const id = compact ? "search-compact" : "search-main";
  return <div>
    <form action="/search" role="search">
      <label htmlFor={id} className="search-label">Search California contractor licenses</label>
      <div className={`search-bar${compact ? " search-bar-compact" : ""}`}>
        <div className="search-input-wrap"><SearchIcon /><AutocompleteInput id={id} defaultValue={defaultValue} enabled={typesenseEnabled()} /></div>
        <button type="submit" className="button-primary">Search <Arrow /></button>
      </div>
    </form>
    {showExamples ? <div className="search-examples"><span className="technical">TRY</span>{examples.map((example) =>
      <Link key={example} href={`/search?q=${encodeURIComponent(example)}`}>{example} <span aria-hidden="true">↗</span></Link>
    )}</div> : null}
  </div>;
}
