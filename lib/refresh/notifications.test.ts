import { beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { emailConfig, notificationConfig, sendRefreshEmail } from "./notifications";
import type { ScheduledState } from "./scheduled";

vi.mock("nodemailer",()=>({default:{createTransport:vi.fn()}}));
const env={GMAIL_USER:"sender@gmail.com",GMAIL_APP_PASSWORD:"abcd efgh ijkl mnop",CSLB_ALERT_TO:"recipient@gmail.com"};
const state:ScheduledState={version:1,id:"00000000-0000-4000-8000-000000000001",startedAt:"2026-10-31T12:00:00Z",phase:"blocked"};
const sendMail=vi.fn(),close=vi.fn();
beforeEach(()=>{
  vi.clearAllMocks();
  sendMail.mockResolvedValue({accepted:[env.CSLB_ALERT_TO],rejected:[]});
  vi.mocked(nodemailer.createTransport).mockReturnValue({sendMail,close} as unknown as ReturnType<typeof nodemailer.createTransport>);
});
describe("Gmail alert configuration",()=>{
  it("uses the Gmail user as sender and removes app-password display spaces",()=>{
    expect(emailConfig({...env,CSLB_ALERT_FROM:"different@example.com"})).toEqual({provider:"gmail",from:env.GMAIL_USER,to:env.CSLB_ALERT_TO,password:"abcdefghijklmnop"});
  });
  it("can test email alone but still requires the independent monitor for scheduled writes",()=>{
    expect(emailConfig(env).provider).toBe("gmail");
    expect(()=>notificationConfig(env)).toThrow("CSLB_HEALTHCHECK_URL");
  });
  it("does not silently fall back to Resend when Gmail is partially configured",()=>{
    expect(()=>emailConfig({...env,GMAIL_APP_PASSWORD:"",RESEND_API_KEY:"secret",CSLB_ALERT_FROM:"sender@example.com"})).toThrow("GMAIL_APP_PASSWORD");
  });
  it.each([
    {GMAIL_USER:"sender@gmail.com\r\nBcc:other@example.com"},
    {GMAIL_APP_PASSWORD:"not-an-app-password"},
    {CSLB_ALERT_TO:"one@example.com,two@example.com"},
    {CSLB_EMAIL_PROVIDER:"unknown"},
  ])("rejects malformed settings without exposing their values",override=>{
    expect(()=>emailConfig({...env,...override})).toThrow("suppressed");
  });
  it("allows explicit provider selection without automatic fallback",()=>{
    expect(emailConfig({...env,CSLB_EMAIL_PROVIDER:"resend",RESEND_API_KEY:"secret",CSLB_ALERT_FROM:"sender@example.com"}).provider).toBe("resend");
  });
});
describe("Gmail SMTP delivery",()=>{
  it("uses bounded verified TLS and sends one plain-text message with no file/URL access",async()=>{
    const request=vi.fn<typeof fetch>();
    await sendRefreshEmail(emailConfig(env),state,request,true);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host:"smtp.gmail.com",port:465,secure:true,auth:{user:env.GMAIL_USER,pass:"abcdefghijklmnop"},
      tls:{minVersion:"TLSv1.2",rejectUnauthorized:true},connectionTimeout:15000,greetingTimeout:10000,socketTimeout:20000,dnsTimeout:10000,
      logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
    }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({from:env.GMAIL_USER,to:env.CSLB_ALERT_TO,subject:"CSLB refresh alert test",messageId:`<ccs-refresh-${state.id}@gmail.com>`});
    expect(sendMail.mock.calls[0][0].text).toContain("No contractor records were changed");
    expect(sendMail.mock.calls[0][0].html).toBeUndefined();expect(request).not.toHaveBeenCalled();expect(close).toHaveBeenCalledTimes(1);
  });
  it("does not expose authentication errors, passwords or raw server responses",async()=>{
    sendMail.mockRejectedValue(new Error("535 AUTH secret-password raw-address"));
    await expect(sendRefreshEmail(emailConfig(env),state)).rejects.toThrow("details suppressed");
    try {await sendRefreshEmail(emailConfig(env),state);}catch(error){expect(String(error)).not.toMatch(/535|AUTH|secret-password|raw-address/);}
    expect(close).toHaveBeenCalledTimes(2);
  });
  it.each([
    {accepted:[],rejected:[env.CSLB_ALERT_TO]},
    {accepted:["another@example.com"],rejected:[]},
    {},
  ])("requires explicit acceptance of the configured recipient",async result=>{
    sendMail.mockResolvedValue(result);
    await expect(sendRefreshEmail(emailConfig(env),state)).rejects.toThrow("acknowledgment failed");expect(close).toHaveBeenCalledTimes(1);
  });
});
