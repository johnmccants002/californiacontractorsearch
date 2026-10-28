export function BrandMark({ size = 48 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
    <path d="M4 4h34v8H12v24H4V4Z" fill="currentColor" />
    <path d="M18 18h26v26H18v-8h18V26H18v-8Z" fill="#D85C32" />
    <path d="M4 44h8M44 4v8" stroke="currentColor" strokeWidth="2" />
  </svg>;
}

export function BrandLogo() {
  return <span className="brand-logo"><BrandMark /><span className="brand-wordmark">
    <span>CA <i>/</i> CONTRACTOR</span>
    <span className="brand-descriptor">SEARCH INDEX <b>·</b> CALIFORNIA</span>
  </span></span>;
}

export function SearchIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>;
}

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h16m-6-6 6 6-6 6"} /></svg>;
}
