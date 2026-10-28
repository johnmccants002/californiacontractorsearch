export function CaliforniaDrawing() {
  return <div className="california-drawing" aria-hidden="true">
    <div className="drawing-caption"><span>FIG. 01 / THE GOLDEN STATE</span><span>CA</span></div>
    <svg viewBox="0 0 320 400" fill="none" focusable="false">
      <defs><pattern id="draft-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0v32" stroke="currentColor" strokeWidth=".5" opacity=".16" /></pattern></defs>
      <path fill="url(#draft-grid)" d="M0 0h320v400H0z" />
      <path d="M0 12V0h12m296 0h12v12M0 388v12h12m296 0h12v-12" stroke="currentColor" />
      <path d="M72 43h108v91l87 143-16 26 5 27-24 19-49-5-18-29-33-19-19-32-19-24-18-30-9-36-21-26 6-29-10-25 18-27Z" fill="#E7E3D7" stroke="currentColor" strokeWidth="1.4" />
      <path d="m82 58 83 2v77l82 141m-183-99 52 84 30 28 26 15" stroke="currentColor" opacity=".35" />
      <path d="M128 139h96m-17 144h65M65 39v313m-5-309h10m-10 306h10" stroke="currentColor" strokeWidth=".7" strokeDasharray="3 4" />
      <path d="M125 135h7v7h-7zM202 279h7v7h-7zM235 330h7v7h-7z" fill="#D85C32" />
      <g fill="currentColor" fontSize="9" fontFamily="var(--font-technical), monospace"><text x="177" y="130">SACRAMENTO</text><text x="115" y="278">LOS ANGELES</text><text x="171" y="364">SAN DIEGO</text><text x="281" y="55">N</text></g>
      <path d="M285 65v35m-5-26 5-9 5 9M18 377h50m-50-4v8m25-8v8m25-8v8" stroke="currentColor" />
    </svg>
    <div className="drawing-caption"><span>PUBLIC RECORDS / STATEWIDE</span><span>01—CA</span></div>
  </div>;
}
