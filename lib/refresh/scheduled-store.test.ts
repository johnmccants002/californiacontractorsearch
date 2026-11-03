import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { acquireScheduledLock, readScheduledState, saveScheduledState } from "./scheduled-store";
it("persists private checkpoints/history and excludes concurrent workers",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"ccs-schedule-test-"));
  try {
    expect(await readScheduledState(directory)).toBeUndefined();
    const unlock=await acquireScheduledLock(directory);
    await expect(acquireScheduledLock(directory)).rejects.toThrow("lock exists");
    const state={version:1 as const,id:"00000000-0000-4000-8000-000000000001",startedAt:new Date().toISOString(),phase:"running" as const};
    await saveScheduledState(directory,state);expect(await readScheduledState(directory)).toEqual(state);
    expect(JSON.parse(await readFile(join(directory,state.id+".json"),"utf8"))).toEqual(state);
    expect((await stat(join(directory,"state.json"))).mode&0o777).toBe(0o600);
    await unlock();const release=await acquireScheduledLock(directory);await release();
    await writeFile(join(directory,"state.json"),"broken");await expect(readScheduledState(directory)).rejects.toThrow("review");
  }finally{await rm(directory,{recursive:true});}
});
it("does not remove a lock whose ownership changed",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"ccs-schedule-test-"));
  try {const unlock=await acquireScheduledLock(directory);await writeFile(join(directory,"worker.lock"),JSON.stringify({pid:0,token:"other"}));await expect(unlock()).rejects.toThrow("ownership");expect(await readFile(join(directory,"worker.lock"),"utf8")).toContain("other");}
  finally{await rm(directory,{recursive:true});}
});
