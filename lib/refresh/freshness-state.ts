export interface Freshness { updatedAt?:string; sourceDates?:string[]; pending:boolean }
export function freshnessState(rows: {phase:string;completed_at:string|null;source_dates:unknown}[], now=Date.now()): Freshness {
  const valid=(value:unknown): value is string => typeof value==="string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value.slice(0,10) && Date.parse(value)<=now;
  const complete=rows.filter(r=>r.phase==="complete" && valid(r.completed_at)).sort((a,b)=>Date.parse(b.completed_at!)-Date.parse(a.completed_at!))[0];
  const sourceDates=complete?.source_dates && typeof complete.source_dates==="object" ? [...new Set(Object.values(complete.source_dates).filter(valid))].sort() : [];
  return {pending:rows.some(r=>["applying","geocoding","indexing"].includes(r.phase)),...(complete ? {updatedAt:complete.completed_at!,sourceDates} : {})};
}
