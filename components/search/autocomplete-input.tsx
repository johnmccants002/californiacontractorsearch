"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Suggestion = { licenseNumber: string; businessName: string; city: string };
export function AutocompleteInput({ id, defaultValue = "", enabled = false }: { id: string; defaultValue?: string; enabled?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const visible = enabled && open && suggestions.length > 0;
  const select = (suggestion: Suggestion) => {
    setOpen(false);
    router.push(`/license/${encodeURIComponent(suggestion.licenseNumber)}`);
  };
  useEffect(() => {
    if (!enabled || !open || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query });
        if (input.current?.form) {
          const form = new FormData(input.current.form);
          for (const field of ["classification", "city", "county", "zip", "status", "near", "lat", "lng", "radius", "sort"]) {
            const value = form.get(field);
            if (typeof value === "string" && value.trim()) params.set(field, value);
          }
        }
        const response = await fetch(`/api/search/suggestions?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Suggestions unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) { setSuggestions(Array.isArray(data.suggestions) ? data.suggestions.slice(0, 5) : []); setActive(-1); }
      } catch { if (!controller.signal.aborted) setSuggestions([]); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, enabled, open]);
  return <>
    <input ref={input} id={id} name="q" type="search" value={query} maxLength={200} autoComplete="off"
      placeholder="Name, license #, trade, or city" role={enabled ? "combobox" : undefined}
      aria-autocomplete={enabled ? "list" : undefined} aria-expanded={enabled ? visible : undefined}
      aria-controls={visible ? `${id}-suggestions` : undefined} aria-activedescendant={visible && active >= 0 ? `${id}-suggestion-${active}` : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onChange={(event) => { setQuery(event.target.value); setSuggestions([]); setActive(-1); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); setActive(-1); }
        if (!visible) return;
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => (value + 1) % suggestions.length); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => (value <= 0 ? suggestions.length : value) - 1); }
        if (event.key === "Enter" && active >= 0) { event.preventDefault(); select(suggestions[active]); }
      }} />
    {visible ? <ul id={`${id}-suggestions`} role="listbox" aria-label="Suggested contractor records" className="search-suggestions">
      {suggestions.map((suggestion, index) => <li key={suggestion.licenseNumber} id={`${id}-suggestion-${index}`}
        role="option" aria-selected={active === index} onMouseDown={(event) => event.preventDefault()} onClick={() => select(suggestion)}>
        <span>{suggestion.businessName}</span><small>#{suggestion.licenseNumber} · {suggestion.city}</small>
      </li>)}
    </ul> : null}
  </>;
}
