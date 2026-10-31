import { formatDate } from "@/lib/format";
import type { Freshness } from "@/lib/refresh/freshness-state";
export function DataFreshness({data}:{data:Freshness}) {
  return <div className="dataset-freshness" aria-label="Dataset update information">
    <p>Data updated: {data.updatedAt ? <time dateTime={data.updatedAt}>{formatDate(data.updatedAt)}</time> : "Date not yet verified"}.</p>
    {data.sourceDates?.length ? <p>CSLB files dated {formatDate(data.sourceDates[0])}{data.sourceDates.length>1 ? ` – ${formatDate(data.sourceDates.at(-1)!)}` : ""}. Not a live license-status check.</p> : <p>Verify current license information directly with CSLB.</p>}
    {data.pending ? <p>{data.updatedAt ? "A refresh is pending validation. The date above is the last fully completed update." : "The first refresh is pending validation; no completed update date is available yet."}</p> : null}
  </div>;
}
