import Link from "next/link";
import type { Contractor } from "@/lib/contractors/types";
import { displayClassificationCode } from "@/lib/search/normalize";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/license/status-badge";
import { Arrow } from "@/components/brand";
import { HighlightedName } from "./highlighted-name";

export function ResultCard({ contractor, matchedBy, highlightTokens, distanceMiles }: { contractor: Contractor; matchedBy?: string[]; highlightTokens?: string[]; distanceMiles?: number }) {
  const retained = contractor.dataSource === "cslb" && Boolean(contractor.sourceMissingSince);
  return <Link href={`/license/${contractor.licenseNumber}`} className="record-card">
    <div className="record-rail"><span>LICENSE NO.</span><strong>#{contractor.licenseNumber}</strong><span className="record-rail-bottom">CA / CONTRACTOR<br className="hidden sm:block" /> LICENSE RECORD</span></div>
    <div className="record-main">
      <div className="record-title-row"><div><h2><HighlightedName text={contractor.businessName} tokens={highlightTokens} /></h2>
        {contractor.dataSource !== "cslb" ? <p className="record-warning">{contractor.dataSource === "demo" ? "Fictional demonstration record" : "Record source unconfirmed"}</p> : null}
        {retained ? <p className="record-warning">Not in latest CSLB download—verify with CSLB. Details below are last known.</p> : null}
      </div><StatusBadge status={contractor.licenseStatus} lastKnown={retained} /></div>
      <dl className="record-facts">
        <div><dt>Classification</dt><dd>{contractor.classifications.map((item) => `${displayClassificationCode(item.code)} · ${item.name.replace(" Contractor", "")}`).join(", ") || "Not available"}</dd></div>
        <div><dt>Registered location</dt><dd>{contractor.city}, California {contractor.zip}</dd></div>
        <div><dt>Expiration</dt><dd>{formatDate(contractor.expirationDate)}</dd></div>
      </dl>
      <div className="record-bottom"><div className="record-context">
        <p>{[contractor.bonds.length ? "Bond record on file" : "", contractor.workersComp.length ? "Workers’ comp record" : ""].filter(Boolean).join(" / ") || "See full license record"}</p>
        {matchedBy?.length ? <p>Matched by {matchedBy.slice(0, 2).join(" and ")}</p> : null}
        {distanceMiles !== undefined ? <p>Approx. {distanceMiles.toFixed(1)} miles from search center · registered mailing address, not service area</p> : null}
      </div><span className="record-open">Open record <Arrow /></span></div>
    </div>
  </Link>;
}
