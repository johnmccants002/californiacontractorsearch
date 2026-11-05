import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadTypesenseEnvironment } from "./typesense-env";
import { refreshCslb } from "./refresh-cslb";
import { runScheduled } from "../lib/refresh/scheduled";
import { readScheduledState, saveScheduledState, acquireScheduledLock } from "../lib/refresh/scheduled-store";
import { emailConfig, monitorConfig, notificationConfig, sendRefreshEmail, pingRefresh } from "../lib/refresh/notifications";
import { verifyProduction } from "../lib/refresh/production-check";

async function main() {
  const args=process.argv.slice(2),mode=args[0];
  if(mode==="--help") {console.log("--preflight: local configuration/status only. --run: scheduled refresh (activation required). --recover ATTEMPT_UUID: explicitly reviewed recovery. --test-email: sends one test email without monitor or source writes. --test-alert: sends a test email and monitor start/success, no source writes. Optional --credentials-file PATH. No schedule is installed by this command.");return;}
  if(!["--preflight","--run","--recover","--test-alert","--test-email"].includes(mode))throw new Error("Select --preflight, --run, --recover UUID, --test-email or --test-alert.");
  const prefix=mode==="--recover"?2:1;
  if(mode==="--recover" && !/^[0-9a-f-]{36}$/.test(args[1]??""))throw new Error("Supply the exact blocked attempt UUID.");
  const credentials=args.slice(prefix);
  if(credentials.length && (credentials.length!==2 || credentials[0]!=="--credentials-file" || !credentials[1]))throw new Error("Unsupported scheduler arguments.");
  if(existsSync(".env.refresh.local"))process.loadEnvFile(".env.refresh.local");
  await loadTypesenseEnvironment(credentials);
  const directory=resolve(".data/scheduler");
  if(mode==="--preflight") {
    let emailReady=false,monitorReady=false,provider:string|undefined;
    try{provider=emailConfig(process.env).provider;emailReady=true;}catch{/* Never print values. */}
    try{monitorConfig(process.env);monitorReady=true;}catch{/* Never print values. */}
    const state=await readScheduledState(directory);
    console.log(JSON.stringify({scheduleEnabled:process.env.CSLB_SCHEDULE_ENABLED==="true",writesEnabled:process.env.CSLB_REFRESH_ENABLED==="true",geoEnabled:process.env.CENSUS_GEOCODING_ENABLED==="true",emailConfigured:emailReady,emailProvider:provider,monitorConfigured:monitorReady,alertsConfigured:emailReady&&monitorReady,phase:state?.phase ?? "not_started",attempt:state?.id,databaseWrites:0,notificationsSent:0}));return;
  }
  if(mode==="--test-email") {
    const {randomUUID}=await import("node:crypto");
    const config=emailConfig(process.env);
    await sendRefreshEmail(config,{version:1,id:randomUUID(),startedAt:new Date().toISOString(),phase:"blocked"},fetch,true);
    console.log(JSON.stringify({testEmailAccepted:true,emailProvider:config.provider,monitorPingSent:false,databaseWrites:0}));return;
  }
  const alerts=notificationConfig(process.env);
  if(mode==="--test-alert") {
    const {randomUUID}=await import("node:crypto");
    await pingRefresh(alerts,"start");
    await sendRefreshEmail(alerts,{version:1,id:randomUUID(),startedAt:new Date().toISOString(),phase:"blocked",failure:"interrupted"},fetch,true);
    await pingRefresh(alerts,"success");console.log(JSON.stringify({testEmailAccepted:true,monitorPingAccepted:true,databaseWrites:0}));return;
  }
  if(process.env.CSLB_SCHEDULE_ENABLED!=="true" || process.env.CSLB_REFRESH_ENABLED!=="true" || process.env.CENSUS_GEOCODING_ENABLED!=="true")throw new Error("Scheduled writes disabled. Complete the documented activation checks first.");
  if(process.env.NEXT_PUBLIC_SUPABASE_URL!=="https://rymkuumshptqopwhwyrn.supabase.co" || process.env.TYPESENSE_COLLECTION!=="contractors")throw new Error("Scheduled target differs from the approved project/alias.");
  const unlock=await acquireScheduledLock(directory);
  try {
    const result=await runScheduled({
      load:()=>readScheduledState(directory),save:state=>saveScheduledState(directory,state),now:()=>new Date().toISOString(),
      refresh:async(runId,onRun)=>{
        const outcome=await refreshCslb(["--run",...(runId?["--resume",runId]:[]),...credentials],onRun,false);
        if(!outcome)throw new Error("No refresh outcome.");return outcome;
      },
      verify:async outcome=>{
        const report=await verifyProduction({completedAt:outcome.completedAt,sourceDates:Object.values(outcome.sourceDates),retainedLicense:outcome.retainedLicense});
        await writeFile(resolve(".data/refresh",outcome.runId,"production-verification.json"),JSON.stringify(report,null,2),{mode:0o600});
      },
      emailProvider:alerts.provider,email:state=>sendRefreshEmail(alerts,state),ping:event=>pingRefresh(alerts,event),
    },mode==="--recover"?args[1]:undefined);
    console.log(JSON.stringify(result));
  }finally{await unlock();}
}
main().catch(()=>{console.error("Scheduled refresh did not finish. Inspect the aggregate scheduler checkpoint/configuration. No raw errors or credentials logged; do not bypass the review stop.");process.exitCode=1;});
