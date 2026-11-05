import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { validateScheduledState, type ScheduledState } from "./scheduled";

export async function readScheduledState(directory:string) {
  try {return validateScheduledState(JSON.parse(await readFile(resolve(directory,"state.json"),"utf8")));}
  catch(error) {if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw new Error("Cannot read scheduler checkpoint; review required.",{cause:error});}
}
export async function saveScheduledState(directory:string,state:ScheduledState) {
  validateScheduledState(state);await mkdir(directory,{recursive:true,mode:0o700});
  const tmp=resolve(directory,"state.json.tmp"),path=resolve(directory,"state.json");
  const file=await open(tmp,"w",0o600);
  try {await file.writeFile(JSON.stringify(state,null,2));await file.sync();}finally{await file.close();}
  await rename(tmp,path);
  // Preserve an aggregate history, including reviewed failed attempts.
  const history=await open(resolve(directory,`${state.id}.json`),"w",0o600);
  try {await history.writeFile(JSON.stringify(state,null,2));await history.sync();}finally{await history.close();}
}
export async function acquireScheduledLock(directory:string) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const path=resolve(directory,"worker.lock"),token=randomUUID();
  const file=await open(path,"wx",0o600).catch(()=>{throw new Error("Scheduler lock exists; inspect its PID. Never remove an active or unverified lock.");});
  try {await file.writeFile(JSON.stringify({pid:process.pid,token,startedAt:new Date().toISOString()}));await file.sync();}finally{await file.close();}
  return async()=>{
    const owner=JSON.parse(await readFile(path,"utf8"));
    if(owner.pid!==process.pid || owner.token!==token) throw new Error("Scheduler lock ownership changed; retained for review.");
    await unlink(path);
  };
}
