import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { downloadDataset, downloads } from "./download-cslb-data.mjs";
afterEach(()=>vi.restoreAllMocks());
it('allows bounded ten-minute bulk transfers while keeping portal requests at two minutes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccs-download-test-'));
  const timeout=vi.spyOn(AbortSignal,'timeout');
  const fetch=vi.spyOn(globalThis,'fetch')
    .mockResolvedValueOnce(new Response('<input type="hidden" name="__VIEWSTATE" value="fixture">'))
    .mockResolvedValueOnce(new Response('<input type="hidden" name="__VIEWSTATE" value="fixture2">'))
    .mockResolvedValueOnce(new Response('LicenseNo,BusinessName\n123,Fixture\n',{headers:{'content-type':'text/csv'}}));
  try {
    await downloadDataset(downloads[0],directory);
    expect(timeout.mock.calls.map(([ms])=>ms)).toEqual([120000,120000,600000]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await readFile(join(directory,'license-master.csv'),'utf8')).toContain('123,Fixture');
  } finally {await rm(directory,{recursive:true});}
});
it('never promotes an interrupted download to a complete CSV',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccs-download-test-'));
  vi.spyOn(globalThis,'fetch')
    .mockResolvedValueOnce(new Response('fixture'))
    .mockResolvedValueOnce(new Response('fixture'))
    .mockResolvedValueOnce(new Response(new ReadableStream({start(controller){controller.error(new DOMException('Timed out','TimeoutError'));}}),{headers:{'content-type':'text/csv'}}));
  try {
    await expect(downloadDataset(downloads[0],directory)).rejects.toMatchObject({name:'TimeoutError'});
    await expect(readFile(join(directory,'license-master.csv'))).rejects.toMatchObject({code:'ENOENT'});
  } finally {await rm(directory,{recursive:true});}
});
