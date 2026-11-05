import assert from "node:assert/strict";

export const PRODUCTION_ORIGIN="https://californiacontractorsearch.vercel.app";
type Options={completedAt:string;sourceDates:string[];retainedLicense?:string};
export function assertFreshness(html:string, options:Options) {
  const region=html.match(/<div class="dataset-freshness"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert(region && region.includes(options.completedAt));
  const format=(date:string)=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(date));
  const dates=[...options.sourceDates].sort();
  assert(dates.length && region.includes(format(dates[0])) && region.includes(format(dates.at(-1)!)));
  assert(region.includes("Not a live license-status check.") && !region.includes("pending validation"));
}
/** Never return response bodies, contractor facts, or query URLs in diagnostics. */
export async function verifyProduction(options:Options, request:typeof fetch=fetch) {
  const checks:{name:string;elapsedMs:number}[]=[];
  let stage="start";
  async function page(name:string,path:string) {
    stage=name;const started=performance.now();
    const response=await request(PRODUCTION_ORIGIN+path,{signal:AbortSignal.timeout(45000),redirect:"error",headers:{"Cache-Control":"no-cache"}});
    assert.equal(response.status,200);const html=await response.text();
    const text=html.replace(/<script\b[\s\S]*?<\/script>/g,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ");
    const cards=[...html.matchAll(/<a\b[^>]*class="record-card"[^>]*>/g)].map(m=>m[0].match(/href="\/license\/(\d+)"/)?.[1]);
    if(path.startsWith("/search")) {
      assert.match(html,/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/);
      assert(!/Location search is temporarily unavailable|Location search is not enabled|Showing fictional demonstration records/.test(text));
      assert(text.includes("Status filters use the last-known status") && cards.length && cards.every(Boolean));
      assertFreshness(html,options);
    }
    checks.push({name,elapsedMs:Math.round(performance.now()-started)});
    return {html,text,cards};
  }
  try {
    assertFreshness((await page("homepage","/")).html,options);
    assert.equal((await page("exact license","/search?q=1082303")).cards[0],"1082303");
    assert.equal((await page("business typo","/search?q=1+Demoltion")).cards[0],"1082303");
    const geo="/search?classification=c36&near=95814&radius=10&sort=distance&nearby=1";
    const first=await page("nearby radius",geo),second=await page("nearby pagination",geo+"&page=2");
    assert.equal(first.cards.length,10);assert.equal(second.cards.length,10);
    assert.equal(new Set([...first.cards,...second.cards]).size,20);
    const distances=[...(first.text+" "+second.text).matchAll(/Approx\.\s+([\d.]+)\s+miles from search center/g)].map(m=>Number(m[1]));
    assert.equal(distances.length,20);
    distances.forEach((d,i)=>{assert(d>=0 && d<=10.005);if(i)assert(d>=distances[i-1]);});
    const detail=await page("profile","/license/1082303");
    assert(detail.html.includes("application/ld+json") && detail.html.includes("https://www.cslb.ca.gov/1082303"));
    assert(!detail.text.includes("Not in latest CSLB download"));assertFreshness(detail.html,options);
    stage="autocomplete";const started=performance.now();
    const response=await request(PRODUCTION_ORIGIN+"/api/search/suggestions?q=1%20Demo",{signal:AbortSignal.timeout(30000),redirect:"error"});
    assert.equal(response.status,200);assert.match(response.headers.get("X-Robots-Tag")??"",/noindex/);
    const body=await response.json();assert(body.suggestions.some((s:{licenseNumber:string})=>s.licenseNumber==="1082303"));
    checks.push({name:stage,elapsedMs:Math.round(performance.now()-started)});
    if(options.retainedLicense) {
      assert(/^\d{1,10}$/.test(options.retainedLicense));
      const profile=await page("retained profile","/license/"+options.retainedLicense);
      assert(profile.text.includes("Not in latest CSLB download") && profile.text.includes("Last known:"));
      assert(!profile.html.includes("Dataset update information"));
      assert(profile.html.includes("https://www.cslb.ca.gov/"+options.retainedLicense));
      const search=await page("retained search","/search?q="+options.retainedLicense);
      assert(search.text.includes("Not in latest CSLB download") && search.text.includes("Last known:"));
    }
    return {checkedAt:new Date().toISOString(),checks,noindex:true,registeredLocationNotServiceArea:true};
  } catch { throw new Error(`Production verification failed at ${stage}; response contents suppressed.`); }
}
