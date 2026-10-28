import { siteConfig } from "@/config/site";
import { sourceDate, type DatasetSource } from "@/lib/contractors/provenance";
import type { Contractor } from "@/lib/contractors/types";
import { formatDate } from "@/lib/format";

const datasetCopy: Record<DatasetSource, string> = {
  cslb: "Search imported public CSLB license records. This is an independent directory, not a live CSLB status check. Always verify current information with CSLB.",
  demo: "Demo mode: results are fictional demonstration records, not real contractor recommendations or verified license information.",
  unknown: "The source of the connected records has not been confirmed. Verify license information directly with CSLB.",
  empty: "No imported contractor records are available yet. Use the official CSLB lookup to verify a license.",
  unavailable: "Contractor records are temporarily unavailable. Please try again or use the official CSLB lookup. No demonstration records have been substituted.",
};

export function DatasetNotice({ source }: { source: DatasetSource }) {
  return <p className={source === "cslb" ? "dataset-notice" : "dataset-notice dataset-notice-warning"}>{datasetCopy[source]}</p>;
}

export function LicenseVerification({ contractor }: { contractor: Contractor }) {
  const date = sourceDate(contractor.sourceUpdatedAt);
  const imported = contractor.dataSource === "cslb";
  return (
    <section aria-label="Record source and verification" className={`verification-panel${imported ? "" : " verification-warning"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="verification-title">
            {imported ? "Source: CSLB public records" : contractor.dataSource === "demo" ? "Fictional demonstration record" : "Record source unconfirmed"}
          </p>
          {imported ? <>
            <p className="verification-date">Source record updated: {date ? <time dateTime={date}>{formatDate(date)}</time> : "Date unavailable"}</p>
            <p className="verification-note mt-1">Date supplied in the source record—not a live status check.</p>
          </> : <p className="verification-note mt-2">{contractor.dataSource === "demo" ? "Names, dates, and license details shown here are sample data." : "Do not rely on this record without checking the official source."}</p>}
        </div>
        <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noopener noreferrer" className="button-secondary min-h-11 shrink-0 gap-2 self-start sm:self-auto">
          Verify with CSLB <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <p className="verification-note mt-3">{imported ? `Use license #${contractor.licenseNumber}. License status may change; confirm current details before making decisions.` : "Use the official lookup for real license information; this record is not proof of licensure."}</p>
    </section>
  );
}
