import Link from "next/link";
import type { Contractor } from "@/lib/contractors/types";
import { displayClassificationCode } from "@/lib/search/normalize";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/license/status-badge";

export function ResultCard({ contractor, matchedBy }: { contractor: Contractor; matchedBy?: string[] }) {
  return (
    <Link
      href={`/license/${contractor.licenseNumber}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 sm:p-6"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950 group-hover:text-blue-900">{contractor.businessName}</h2>
          <p className="mt-1 font-mono text-sm text-slate-600">License #{contractor.licenseNumber}</p>
        </div>
        <StatusBadge status={contractor.licenseStatus} />
      </div>
      <div className="mt-5 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <p>
          <span className="font-medium text-slate-950">
            {contractor.classifications.map((item) => displayClassificationCode(item.code)).join(", ")}
          </span>{" "}
          {contractor.classifications.map((item) => item.name.replace(" Contractor", "")).join(", ")}
        </p>
        <p>{contractor.city}, California {contractor.zip}</p>
        <p>Expires {formatDate(contractor.expirationDate)}</p>
        <p className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
          {contractor.bonds.length ? <span>✓ Bond on file</span> : null}
          {contractor.workersComp.length ? <span>✓ Workers&apos; comp record</span> : null}
        </p>
      </div>
      {matchedBy?.length ? <p className="mt-4 text-xs text-slate-500">Matched by {matchedBy.slice(0, 2).join(" and ")}</p> : null}
    </Link>
  );
}
