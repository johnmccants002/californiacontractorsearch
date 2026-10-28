import Link from "next/link";
import { Arrow, SearchIcon } from "@/components/brand";

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
        <span className="search-input-wrap"><SearchIcon /><input id={id} type="search" name="q" defaultValue={defaultValue} maxLength={200}
          placeholder="Name, license #, trade, or city" autoComplete="off" /></span>
        <button type="submit" className="button-primary">Search <Arrow /></button>
      </div>
    </form>
    {showExamples ? <div className="search-examples"><span className="technical">TRY</span>{examples.map((example) =>
      <Link key={example} href={`/search?q=${encodeURIComponent(example)}`}>{example} <span aria-hidden="true">↗</span></Link>
    )}</div> : null}
  </div>;
}
