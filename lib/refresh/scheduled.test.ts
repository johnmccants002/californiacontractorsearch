import { describe, expect, it, vi } from "vitest";
import { runScheduled, validateScheduledState, type ScheduledIO, type ScheduledState } from "./scheduled";
import { notificationConfig, notificationMessage, sendRefreshEmail, pingRefresh } from "./notifications";
const id="00000000-0000-4000-8000-000000000001",run="00000000-0000-4000-8000-000000000002";
const now="2026-10-31T12:00:00Z";
const outcome={kind:"complete" as const,runId:run,contractors:246604,retained:677,completedAt:now,sourceDates:{master:"2026-10-28"}};
function harness(initial?:ScheduledState) {
  let state=initial ? structuredClone(initial):undefined;
  const history:ScheduledState[]=[];
  const io:ScheduledIO={load:async()=>state ? structuredClone(state):undefined,save:vi.fn(async s=>{state=structuredClone(s);history.push(structuredClone(s));}),
    refresh:vi.fn(async(_run,onRun)=>{await onRun(run);return outcome;}),verify:vi.fn(async()=>{}),email:vi.fn(async()=>{}),emailProvider:"resend",ping:vi.fn(async()=>{}),now:()=>now};
  return {io,history,state:()=>state};
}
describe("unattended refresh safety",()=>{
  it("persists the run and verification before announcing success",async()=>{
    const h=harness();await runScheduled(h.io);
    expect(h.state()).toMatchObject({phase:"success",runId:run,emailAccepted:true});
    expect(h.history[0]).toMatchObject({phase:"running"});
    expect(h.io.verify).toHaveBeenCalledWith(outcome);
    expect(h.io.email).toHaveBeenCalledTimes(1);
    expect(vi.mocked(h.io.ping).mock.calls.map(c=>c[0])).toEqual(["start","success"]);
  });
  it("keeps unchanged releases quiet but acknowledges the missed-run monitor",async()=>{
    const h=harness();vi.mocked(h.io.refresh).mockResolvedValue({kind:"unchanged",sourceDates:{master:"2026-10-28"}});
    await runScheduled(h.io);expect(h.io.email).not.toHaveBeenCalled();expect(h.io.verify).not.toHaveBeenCalled();expect(h.state()?.phase).toBe("success");
  });
  it("latches a failure across later invocations without retrying source writes",async()=>{
    const h=harness();vi.mocked(h.io.refresh).mockRejectedValue(new Error("secret database response"));
    await expect(runScheduled(h.io)).rejects.toThrow("refresh_failed");
    await expect(runScheduled(h.io)).rejects.toThrow("no database retries");
    expect(h.io.refresh).toHaveBeenCalledTimes(1);expect(h.io.email).toHaveBeenCalledTimes(1);expect(h.state()?.phase).toBe("blocked");
    expect(JSON.stringify(h.history)).not.toContain("secret");
  });
  it("blocks an interrupted process and requires its exact attempt ID",async()=>{
    const h=harness({version:1,id,startedAt:now,phase:"running",runId:run});
    await expect(runScheduled(h.io)).rejects.toThrow("review");expect(h.io.refresh).not.toHaveBeenCalled();expect(h.state()?.failure).toBe("interrupted");
    await expect(runScheduled(h.io,run)).rejects.toThrow("exactly");
    await runScheduled(h.io,id);expect(h.io.refresh).toHaveBeenCalledWith(run,expect.any(Function));expect(h.state()?.id).not.toBe(id);
  });
  it("latches production failure and does not send a success message",async()=>{
    const h=harness();vi.mocked(h.io.verify).mockRejectedValue(new Error("body with contractor facts"));
    await expect(runScheduled(h.io)).rejects.toThrow("production_failed");
    expect(h.state()).toMatchObject({phase:"blocked",failure:"production_failed",runId:run});
    expect(notificationMessage(h.state()!).subject).toContain("attention");expect(JSON.stringify(h.history)).not.toContain("contractor facts");
  });
  it("retries email delivery without repeating a successful import or live checks",async()=>{
    const h=harness();vi.mocked(h.io.email).mockRejectedValueOnce(new Error("lost acknowledgment"));
    await expect(runScheduled(h.io)).rejects.toThrow("notification");expect(h.state()?.phase).toBe("verified");
    await runScheduled(h.io);expect(h.io.refresh).toHaveBeenCalledTimes(1);expect(h.io.verify).toHaveBeenCalledTimes(1);expect(h.io.email).toHaveBeenCalledTimes(2);
    expect(vi.mocked(h.io.email).mock.calls[0][0].id).toBe(vi.mocked(h.io.email).mock.calls[1][0].id);
  });
  it("does not resend accepted email if the monitor acknowledgment fails",async()=>{
    const h=harness();let calls=0;vi.mocked(h.io.ping).mockImplementation(async event=>{if(event==="success" && calls++===0)throw new Error("offline");});
    await expect(runScheduled(h.io)).rejects.toThrow("monitor");await runScheduled(h.io);
    expect(h.io.email).toHaveBeenCalledTimes(1);expect(h.io.refresh).toHaveBeenCalledTimes(1);
  });
  it("does not automatically retry an ambiguous Gmail send or repeat the import",async()=>{
    const h=harness();h.io.emailProvider="gmail";
    vi.mocked(h.io.email).mockRejectedValueOnce(new Error("SMTP connection lost after DATA"));
    await expect(runScheduled(h.io)).rejects.toThrow("delivery");
    expect(h.state()).toMatchObject({phase:"verified",emailProvider:"gmail",emailAttemptedAt:now});
    await expect(runScheduled(h.io)).rejects.toThrow("delivery");
    expect(h.io.email).toHaveBeenCalledTimes(1);expect(h.io.refresh).toHaveBeenCalledTimes(1);
  });
  it("does not retry an ambiguous Gmail failure alert",async()=>{
    const h=harness();h.io.emailProvider="gmail";
    vi.mocked(h.io.refresh).mockRejectedValue(new Error("database failed"));
    vi.mocked(h.io.email).mockRejectedValue(new Error("SMTP acknowledgment lost"));
    await expect(runScheduled(h.io)).rejects.toThrow();
    await expect(runScheduled(h.io)).rejects.toThrow("ambiguous");
    expect(h.state()?.phase).toBe("blocked");expect(h.io.email).toHaveBeenCalledTimes(1);expect(h.io.refresh).toHaveBeenCalledTimes(1);
  });
  it("does not resend accepted Gmail email after a monitor failure",async()=>{
    const h=harness();h.io.emailProvider="gmail";
    vi.mocked(h.io.ping).mockImplementationOnce(async()=>{}).mockRejectedValueOnce(new Error("monitor unavailable"));
    await expect(runScheduled(h.io)).rejects.toThrow("monitor");await runScheduled(h.io);
    expect(h.state()?.phase).toBe("success");expect(h.io.email).toHaveBeenCalledTimes(1);
  });
  it.each([undefined,"gmail" as const])("requires review when the original email provider is %s",async provider=>{
    const h=harness({version:1,id,startedAt:now,phase:"verified",outcome,runId:run,emailAttemptedAt:now,emailProvider:provider});
    await expect(runScheduled(h.io)).rejects.toThrow("delivery");expect(h.io.email).not.toHaveBeenCalled();expect(h.io.refresh).not.toHaveBeenCalled();
  });
  it("requires review before switching an ambiguous Resend attempt to Gmail",async()=>{
    const h=harness({version:1,id,startedAt:now,phase:"verified",outcome,runId:run,emailAttemptedAt:now,emailProvider:"resend"});h.io.emailProvider="gmail";
    await expect(runScheduled(h.io)).rejects.toThrow("delivery");expect(h.io.email).not.toHaveBeenCalled();
  });
  it("requires review when an ambiguous email send outlives provider deduplication",async()=>{
    const h=harness({version:1,id,startedAt:"2026-10-29T12:00:00Z",phase:"verified",outcome,runId:run,emailAttemptedAt:"2026-10-29T12:00:00Z",emailProvider:"resend"});
    await expect(runScheduled(h.io)).rejects.toThrow("delivery");expect(h.io.email).not.toHaveBeenCalled();expect(h.io.refresh).not.toHaveBeenCalled();
  });
  it("does not write source data if the independent monitor is unavailable at start",async()=>{
    const h=harness();vi.mocked(h.io.ping).mockRejectedValue(new Error("offline"));await expect(runScheduled(h.io)).rejects.toThrow();expect(h.io.refresh).not.toHaveBeenCalled();
  });
  it("rejects corrupt checkpoints",()=>{
    expect(()=>validateScheduledState({version:1,id,startedAt:now,phase:"success"})).toThrow();
    expect(()=>validateScheduledState({version:1,id:"wrong",startedAt:now,phase:"running"})).toThrow();
  });
});
describe("notification boundaries",()=>{
  const config={provider:"resend" as const,apiKey:"secret",from:"alerts@example.com",to:"recipient@example.com",healthcheck:`https://hc-ping.com/${id}`};
  it("requires a verified-sender configuration and an independent monitor",()=>{
    expect(()=>notificationConfig({})).toThrow("Configure");
    expect(notificationConfig({RESEND_API_KEY:"secret",CSLB_ALERT_FROM:config.from,CSLB_ALERT_TO:config.to,CSLB_HEALTHCHECK_URL:config.healthcheck})).toEqual(config);
    expect(()=>notificationConfig({RESEND_API_KEY:"secret",CSLB_ALERT_FROM:config.from,CSLB_ALERT_TO:config.to,CSLB_HEALTHCHECK_URL:"http://localhost/secret"})).toThrow();
  });
  it("sends aggregate-only plain text with a stable idempotency key",async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({id:"accepted"}),{status:200}));
    const state:ScheduledState={version:1,id,startedAt:now,phase:"verified",outcome,runId:run};
    await sendRefreshEmail(config,state,request);const [url,options]=request.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");expect(options?.redirect).toBe("error");
    expect(options?.headers).toMatchObject({"Idempotency-Key":`ccs-refresh-${id}`});
    const body=JSON.parse(options?.body as string);expect(body.to).toEqual([config.to]);expect(body.text).toContain("246604");expect(body.html).toBeUndefined();
  });
  it("suppresses raw provider failures and treats malformed acknowledgments as failures",async()=>{
    const state:ScheduledState={version:1,id,startedAt:now,phase:"blocked"};
    const request=vi.fn<typeof fetch>().mockRejectedValue(new Error("secret headers"));
    await expect(sendRefreshEmail(config,state,request)).rejects.toThrow("details suppressed");
    request.mockResolvedValue(new Response("{}",{status:200}));await expect(sendRefreshEmail(config,state,request)).rejects.toThrow();
  });
  it("sends no source records or logs to the independent monitor",async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(new Response("OK"));
    await pingRefresh(config,"fail",request);expect(request.mock.calls[0][0]).toBe(config.healthcheck+"/fail");expect(request.mock.calls[0][1]?.body).toBeUndefined();
  });
});
