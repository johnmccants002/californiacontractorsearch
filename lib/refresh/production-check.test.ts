import { describe, expect, it, vi } from "vitest";
import { assertFreshness, verifyProduction } from "./production-check";
const options={completedAt:"2026-10-31T12:00:00Z",sourceDates:["2026-10-28","2026-10-30"],retainedLicense:"999"};
const freshness=`<div class="dataset-freshness" aria-label="Dataset update information"><time datetime="${options.completedAt}">Oct 31, 2026</time><p>Oct 28, 2026 – Oct 30, 2026. Not a live license-status check.</p></div>`;
const card=(id:string,distance?:number)=>`<a class="record-card" href="/license/${id}">Fixture${distance===undefined ? "" : ` Approx. ${distance} miles from search center`}</a>`;
function fixture(change:(html:string,path:string)=>string=(html)=>html) {
  return vi.fn<typeof fetch>(async url=>{
    const u=new URL(String(url)),path=u.pathname+u.search;
    if(u.pathname.includes("suggestions")) return new Response(JSON.stringify({suggestions:[{licenseNumber:"1082303"}]}),{headers:{"X-Robots-Tag":"noindex"}});
    let html=freshness;
    if(u.pathname==="/search") {
      html+='<meta name="robots" content="noindex, follow">Status filters use the last-known status';
      if(u.searchParams.has("near")) {const start=u.searchParams.has("page")?11:1;html+=Array.from({length:10},(_,i)=>card(String(start+i),(start+i)/10)).join("");}
      else html+=card(u.searchParams.get("q")==="999"?"999":"1082303");
      if(u.searchParams.get("q")==="999")html+="Not in latest CSLB download. Last known: ACTIVE";
    }
    if(u.pathname==="/license/1082303")html+='<script type="application/ld+json">{}</script><a href="https://www.cslb.ca.gov/1082303">Official</a>';
    if(u.pathname==="/license/999")html='<p>Not in latest CSLB download. Last known: ACTIVE</p><a href="https://www.cslb.ca.gov/999">Official</a>';
    return new Response(change(html,path));
  });
}
describe("production verification",()=>{
  it("checks search, radius, order, pagination, metadata, autocomplete and warnings",async()=>{
    const report=await verifyProduction(options,fixture());expect(report.checks).toHaveLength(9);expect(report.noindex).toBe(true);expect(JSON.stringify(report)).not.toContain("Fixture");
  });
  it.each([
    ["missing noindex",(html:string,path:string)=>path.startsWith("/search")?html.replace("noindex","index"):html],
    ["outside radius",(html:string)=>html.replace("Approx. 1 miles","Approx. 100 miles")],
    ["wrong order",(html:string)=>html.replace("Approx. 0.1 miles","Approx. 9 miles")],
    ["duplicate pagination",(html:string,path:string)=>path.includes("page=2")?html.replace('href="/license/11"','href="/license/1"'):html],
    ["stale freshness",(html:string)=>html.replace(options.completedAt,"2026-10-30T12:00:00Z")],
    ["retained fresh verification",(html:string,path:string)=>path==="/license/999"?html+freshness:html],
  ])("fails closed for %s",async(_name,change)=>{
    await expect(verifyProduction(options,fixture(change))).rejects.toThrow("response contents suppressed");
  });
  it("does not treat partial or pending freshness as completed",()=>{
    expect(()=>assertFreshness(freshness.replace("Oct 30, 2026","Oct 27, 2026"),options)).toThrow();
    expect(()=>assertFreshness(freshness.replace("</div>","pending validation</div>"),options)).toThrow();
  });
  it("never exposes raw HTTP failures",async()=>{
    const request=vi.fn<typeof fetch>().mockRejectedValue(new Error("secret headers"));
    await expect(verifyProduction(options,request)).rejects.toThrow("Production verification failed at homepage; response contents suppressed.");
  });
});
