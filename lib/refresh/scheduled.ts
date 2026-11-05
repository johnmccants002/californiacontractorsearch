import { randomUUID } from "node:crypto";
import type { RefreshOutcome } from "../../scripts/refresh-cslb";

export interface ScheduledState {
  version: 1;
  id: string;
  startedAt: string;
  phase: "running" | "blocked" | "verified" | "success";
  runId?: string;
  outcome?: RefreshOutcome;
  failure?: "refresh_failed" | "production_failed" | "interrupted";
  emailAttemptedAt?: string;
  emailProvider?: "gmail" | "resend";
  emailAccepted?: boolean;
  finishedAt?: string;
}
export interface ScheduledIO {
  load():Promise<ScheduledState|undefined>;
  save(state:ScheduledState):Promise<void>;
  refresh(runId:string|undefined,onRun:(id:string)=>Promise<void>):Promise<RefreshOutcome>;
  verify(outcome:Extract<RefreshOutcome,{kind:"complete"}>):Promise<void>;
  email(state:ScheduledState):Promise<void>;
  emailProvider: "gmail" | "resend";
  ping(event:"start"|"success"|"fail"):Promise<void>;
  now():string;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validateScheduledState(value:ScheduledState) {
  if (value.version!==1 || !UUID.test(value.id) || !Number.isFinite(Date.parse(value.startedAt)) || !["running","blocked","verified","success"].includes(value.phase) ||
      (value.runId!==undefined && !UUID.test(value.runId)) ||
      (value.emailAttemptedAt!==undefined && !Number.isFinite(Date.parse(value.emailAttemptedAt))) ||
      (value.emailProvider!==undefined && !["gmail","resend"].includes(value.emailProvider)) ||
      (["verified","success"].includes(value.phase) && !["unchanged","complete"].includes(value.outcome?.kind ?? ""))) throw new Error("Invalid scheduler checkpoint; review required.");
  if(value.outcome?.kind==="complete" && (!UUID.test(value.outcome.runId) || value.runId!==value.outcome.runId || !Number.isSafeInteger(value.outcome.contractors) || value.outcome.contractors<1 || !Number.isSafeInteger(value.outcome.retained) || value.outcome.retained<0 || !Number.isFinite(Date.parse(value.outcome.completedAt)))) throw new Error("Invalid completed refresh checkpoint.");
  return value;
}
/** Caller owns the exclusive scheduler lock. No automatic recovery of a failed/crashed writer. */
export async function runScheduled(io:ScheduledIO, recover?:string) {
  let state=await io.load();
  if(state) validateScheduledState(state);
  if(recover && (!state || state.id!==recover || !["blocked","running"].includes(state.phase))) throw new Error("Recovery must identify the blocked attempt exactly.");
  async function emailOnce() {
    if (!state || state.emailAccepted || (state.phase==="verified" && state.outcome?.kind==="unchanged")) return;
    // SMTP has no idempotency contract. Unknown/changed providers also require review.
    if(state.emailAttemptedAt && (state.emailProvider!=="resend" || io.emailProvider!==state.emailProvider))throw new Error("Email delivery is ambiguous; review provider history before a manual retry.");
    // Resend deduplicates for 24h; never automatically retry an ambiguous older send.
    if (state.emailAttemptedAt && Date.parse(io.now())-Date.parse(state.emailAttemptedAt)>23*3600000) throw new Error("Email acknowledgment expired; inspect provider history before retrying.");
    state.emailProvider=io.emailProvider;state.emailAttemptedAt ??= io.now();await io.save(state);
    await io.email(state);state.emailAccepted=true;await io.save(state);
  }
  if (state && ["running","blocked"].includes(state.phase) && !recover) {
    if(state.phase==="running") {state.phase="blocked";state.failure="interrupted";await io.save(state);}
    await io.ping("fail").catch(()=>{});
    await emailOnce();
    throw new Error("Scheduled refresh stopped for review; no database retries performed.");
  }
  if (!state || state.phase==="success" || recover) {
    const resume=recover ? state?.runId : undefined;
    state={version:1,id:randomUUID(),startedAt:io.now(),phase:"running",runId:resume};
    await io.save(state);
    let stage:"refresh_failed"|"production_failed"="refresh_failed";
    try {
      await io.ping("start");
      state.outcome=await io.refresh(resume,async id=>{state!.runId=id;await io.save(state!);});
      if(state.outcome.kind==="complete") { stage="production_failed";await io.verify(state.outcome); }
      state.phase="verified";await io.save(state);
    } catch {
      state.phase="blocked";state.failure=stage;await io.save(state);
      await io.ping("fail").catch(()=>{});
      await emailOnce();
      throw new Error(`Scheduled refresh ${stage}; checkpoint retained for review.`);
    }
  }
  // Delivery-only retries after successful verification must never rerun an import.
  try {await emailOnce();await io.ping("success");}
  catch {await io.ping("fail").catch(()=>{});throw new Error("Refresh verified, but notification/monitor delivery needs attention. Import will not repeat.");}
  state.phase="success";state.finishedAt=io.now();await io.save(state);
  return {attempt:state.id,outcome:state.outcome?.kind,runId:state.runId,emailAccepted:Boolean(state.emailAccepted)};
}
