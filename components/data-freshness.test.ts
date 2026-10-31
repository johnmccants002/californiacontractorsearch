import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DataFreshness } from "./data-freshness";
it("shows the last completed refresh date separately from CSLB source-file dates",()=>{
  const html=renderToStaticMarkup(createElement(DataFreshness,{data:{updatedAt:'2026-10-30T12:00:00Z',sourceDates:['2026-10-28','2026-10-30'],pending:true}}));
  expect(html).toContain('Data updated:');expect(html).toContain('dateTime="2026-10-30T12:00:00Z"');expect(html).toContain('CSLB files dated');expect(html).toContain('pending validation');expect(html).toContain('Not a live');
});
it("does not invent a freshness date before the first verified refresh",()=>{
  const html=renderToStaticMarkup(createElement(DataFreshness,{data:{pending:false}}));expect(html).toContain('Date not yet verified');expect(html).not.toContain('<time');
});
it("distinguishes the first pending refresh from an older verified update",()=>{
  const html=renderToStaticMarkup(createElement(DataFreshness,{data:{pending:true}}));
  expect(html).toContain('first refresh is pending validation');expect(html).not.toContain('last fully completed');
});
