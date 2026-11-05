import nodemailer from "nodemailer";
import type { ScheduledState } from "./scheduled";

export type EmailConfig = {from:string;to:string} & (
  {provider:"gmail";password:string} | {provider:"resend";apiKey:string}
);
export type NotificationConfig=EmailConfig & {healthcheck:string};
export function emailConfig(env:Record<string,string|undefined>):EmailConfig {
  const email=/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
  const to=env.CSLB_ALERT_TO?.trim() ?? "";
  const provider=env.CSLB_EMAIL_PROVIDER?.trim() || (env.GMAIL_USER?.trim() || env.GMAIL_APP_PASSWORD?.trim() ? "gmail" : "resend");
  if(!email.test(to))throw new Error("Configure one CSLB_ALERT_TO recipient. Values suppressed.");
  if(provider==="gmail") {
    const from=env.GMAIL_USER?.trim() ?? "";
    // Google displays app passwords in groups separated by spaces.
    const password=(env.GMAIL_APP_PASSWORD ?? "").replace(/ /g,"");
    if(!email.test(from) || !/^[a-zA-Z0-9]{16}$/.test(password))throw new Error("Configure GMAIL_USER and a 16-character GMAIL_APP_PASSWORD. Values suppressed.");
    return {provider,from,to,password};
  }
  if(provider!=="resend" || !env.RESEND_API_KEY?.trim() || !email.test(env.CSLB_ALERT_FROM ?? ""))throw new Error("Configure Gmail credentials or Resend credentials and sender. Values suppressed.");
  return {provider,apiKey:env.RESEND_API_KEY,from:env.CSLB_ALERT_FROM!,to};
}
export function monitorConfig(env:Record<string,string|undefined>):{healthcheck:string} {
  if(!/^https:\/\/hc-ping\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(env.CSLB_HEALTHCHECK_URL ?? ""))throw new Error("Configure CSLB_HEALTHCHECK_URL. Value suppressed.");
  return {healthcheck:env.CSLB_HEALTHCHECK_URL!};
}
export function notificationConfig(env:Record<string,string|undefined>):NotificationConfig {
  return {...emailConfig(env),...monitorConfig(env)};
}
export function notificationMessage(state:ScheduledState) {
  const success=state.phase==="verified" && state.outcome?.kind==="complete";
  const outcome=state.outcome;
  const text=["California Contractor Search",success ? "The CSLB refresh and production verification passed." : "The scheduled CSLB refresh needs review. Automatic imports are stopped.",
    `Attempt: ${state.id}`,`Run: ${state.runId ?? "not started"}`,
    ...(success && outcome?.kind==="complete" ? [`Contractors: ${outcome.contractors}`,`Retained records: ${outcome.retained}`,`Completed: ${outcome.completedAt}`,`CSLB file dates: ${Object.values(outcome.sourceDates).sort().join(", ")}`] : [`Stage: ${state.failure ?? "interrupted"}`,"Inspect the local checkpoint; do not delete snapshots or bypass validation."]),
    "Registered mailing locations are not confirmed service areas.","https://californiacontractorsearch.vercel.app/"].join("\n");
  return {subject:success ? "CSLB refresh completed" : "CSLB refresh needs attention",text};
}
export async function sendRefreshEmail(config:EmailConfig,state:ScheduledState,request:typeof fetch=fetch,test=false) {
  const message=test ? {subject:"CSLB refresh alert test",text:"This is a California Contractor Search notification setup test. No contractor records were changed and no recurring refresh was enabled."} : notificationMessage(state);
  return sendEmailMessage(config,`ccs-refresh-${state.id}`,state.startedAt,message,request);
}
export async function sendEmailMessage(config:EmailConfig,id:string,createdAt:string,message:{subject:string;text:string},request:typeof fetch=fetch) {
  if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new Error("Invalid notification identifier.");
  if(config.provider==="gmail") {
    let transport:ReturnType<typeof nodemailer.createTransport>|undefined;
    try {
      transport=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,
        auth:{user:config.from,pass:config.password},tls:{minVersion:"TLSv1.2",rejectUnauthorized:true},
        connectionTimeout:15000,greetingTimeout:10000,socketTimeout:20000,dnsTimeout:10000,
        logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
      const result=await transport.sendMail({from:config.from,to:config.to,...message,
        // Useful for tracing, NOT an SMTP idempotency guarantee. Scheduler forbids ambiguous retries.
        messageId:`<${id}@${config.from.split("@")[1]}>`,
        date:new Date(createdAt),disableFileAccess:true,disableUrlAccess:true});
      if(!Array.isArray(result.accepted) || !result.accepted.some((recipient:unknown)=>typeof recipient==="string" && recipient.toLowerCase()===config.to.toLowerCase()) || result.rejected?.length)throw new Error();
    } catch {throw new Error("Gmail SMTP acknowledgment failed; details suppressed. Check delivery before any manual retry.");}
    finally {transport?.close();}
    return;
  }
  // Resend supports a stable idempotency key. No raw responses/errors/headers are logged.
  try {
    const response=await request("https://api.resend.com/emails",{method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${config.apiKey}`,"Content-Type":"application/json","Idempotency-Key":id},
      body:JSON.stringify({from:config.from,to:[config.to],...message})});
    if(!response.ok) throw new Error();
    const body=await response.json();if(typeof body.id!=="string" || !body.id) throw new Error();
  } catch {throw new Error("Email provider acknowledgment failed; details suppressed.");}
}
export async function pingRefresh(config:{healthcheck:string},event:"start"|"success"|"fail",request:typeof fetch=fetch) {
  try {
    const response=await request(config.healthcheck+(event==="success" ? "" : `/${event}`),{method:"GET",redirect:"error",signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error();
  } catch {throw new Error("Independent monitor acknowledgment failed; URL suppressed.");}
}
