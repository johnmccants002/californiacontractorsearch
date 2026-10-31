"use client";

import { useEffect, useRef, useState } from "react";
import type { FilterInput, SearchFilters } from "@/lib/search/filters";
import { getBrowserLocation } from "@/lib/search/browser-location";

export function LocationControls({ filters, input }: { filters: SearchFilters; input: FilterInput }) {
  const initialNear = filters.near ?? input.near ?? "";
  const [near, setNear] = useState(initialNear);
  const [lat, setLat] = useState(initialNear ? "" : String(filters.geo?.latitude ?? input.lat ?? ""));
  const [lng, setLng] = useState(initialNear ? "" : String(filters.geo?.longitude ?? input.lng ?? ""));
  const [radius, setRadius] = useState(String(filters.geo?.radiusMiles ?? input.radius ?? ""));
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const request = useRef(0);
  const nearInput = useRef<HTMLInputElement>(null);
  const applyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (notice && !pending) applyButton.current?.focus(); }, [notice, pending]);
  const cancelPending = () => { request.current++; setPending(false); setError(""); setNotice(""); };
  const clear = () => {
    cancelPending(); setNear(""); setLat(""); setLng(""); setRadius("");
    const sort = nearInput.current?.form?.elements.namedItem("sort");
    if (sort instanceof HTMLSelectElement && sort.value === "distance") sort.value = "relevance";
    nearInput.current?.focus();
  };
  const locate = async () => {
    const current = ++request.current;
    setPending(true); setNotice(""); setError("");
    try {
      const position = await getBrowserLocation(navigator.geolocation, window.isSecureContext);
      if (request.current !== current) return;
      setNear(""); setLat(position.lat); setLng(position.lng); setRadius(value => value || "25");
      setNotice("Approximate device location ready. Choose a radius, then select Find nearby.");
    } catch (cause) {
      if (request.current === current) setError(cause instanceof Error ? cause.message : "Enter a city or ZIP instead.");
    } finally { if (request.current === current) setPending(false); }
  };
  const submitNearby = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(applyButton.current ?? undefined); }
  };
  const hasCenter = Boolean(near.trim() || lat || lng);
  return <section className="geo-controls" aria-labelledby="nearby-heading">
    <div className="geo-heading"><div><p className="eyebrow">SEARCH NEAR</p><h2 id="nearby-heading">Find contractors nearby.</h2></div>
      {(hasCenter || radius || pending || error) ? <button type="button" className="filter-clear location-browser-only" onClick={clear}>Clear location</button> : null}
    </div>
    <p id="nearby-help" className="filter-help">Choose a California city or a U.S. ZIP area as your search center. This includes nearby places, not just addresses inside that city or ZIP.</p>
    <div className="geo-search-grid">
      <label className="filter-label">City or ZIP to search near
        <input ref={nearInput} name="near" value={near} maxLength={100} placeholder="Sacramento or 95814" autoComplete="off" className="field-input"
          aria-describedby="nearby-help" onKeyDown={submitNearby} onChange={event => { cancelPending(); setNear(event.target.value); setLat(""); setLng(""); }} />
      </label>
      <label className="filter-label">Radius in miles
        <input name="radius" type="number" min="0.1" max="250" step="any" value={radius} placeholder="25 by default" className="field-input"
          onKeyDown={submitNearby} onChange={event => setRadius(event.target.value)} />
      </label>
      <button ref={applyButton} name="nearby" value="1" className="button-primary geo-apply" disabled={pending}>Find nearby <span aria-hidden="true">→</span></button>
    </div>
    <div className="geo-actions">
      <button type="button" className="button-secondary location-browser-only" onClick={locate} disabled={pending} aria-describedby="location-privacy">
        {pending ? "Finding your location…" : "Use my location"}
      </button>
      <div className="geo-presets location-browser-only" role="group" aria-label="Distance presets">
        {[10, 25, 50].map(miles => <button key={miles} type="button" aria-pressed={radius === String(miles) || (miles === 25 && !radius && hasCenter)} onClick={() => setRadius(String(miles))}>{miles} mi</button>)}
      </div>
    </div>
    <p className="geo-notice" role="status" aria-live="polite">{pending ? "Waiting for your browser to share a location…" : notice}</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <details className="geo-advanced" open={Boolean(lat || lng) && !near}>
      <summary>Use coordinates instead</summary>
      <p className="filter-help">Leave the city / ZIP field blank when using coordinates. Existing coordinate-based search links still work.</p>
      <div className="geo-coordinate-fields">
        <label className="filter-label">Center latitude<input name="lat" type="number" min="-90" max="90" step="any" value={lat} placeholder="38.58" className="field-input" onChange={event => { cancelPending(); setNear(""); setLat(event.target.value); }} /></label>
        <label className="filter-label">Center longitude<input name="lng" type="number" min="-180" max="180" step="any" value={lng} placeholder="-121.49" className="field-input" onChange={event => { cancelPending(); setNear(""); setLng(event.target.value); }} /></label>
      </div>
    </details>
    <p className="filter-help">Approximate straight-line distance to Census-matched registered mailing addresses—not confirmed service areas. Records without accepted coordinates are excluded. City / ZIP reference points are approximate.</p>
    <p id="location-privacy" className="filter-help">Device location is requested only when you click. Approximate coordinates appear in your search URL; avoid sharing that link if you want to keep your location private.</p>
    <noscript><style>{".location-browser-only { display: none !important; }"}</style><p className="filter-help">Device location and quick radius buttons require JavaScript.</p></noscript>
  </section>;
}
