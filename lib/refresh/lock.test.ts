import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
it('rejects overlapping maintenance workers and safely releases its own lock',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ccs-maintenance-test-'));
  try {
    const code=`import {acquireMaintenanceLock} from ${JSON.stringify(new URL('./lock.mjs',import.meta.url).href)};
      const release=await acquireMaintenanceLock();
      try { await acquireMaintenanceLock(); throw new Error('duplicate accepted'); } catch(error) { if(!error.message.includes('lock exists')) throw error; }
      await release();const second=await acquireMaintenanceLock();await second();console.log('safe');`;
    const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{cwd:directory});
    expect(result.stdout.trim()).toBe('safe');
  } finally {await rm(directory,{recursive:true});}
});
