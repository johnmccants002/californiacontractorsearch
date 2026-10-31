import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

// One persistent worker host/volume. Never remove a stale lock automatically.
export async function acquireMaintenanceLock() {
  const directory = resolve(".data");
  await mkdir(directory, {recursive:true,mode:0o700});
  const path = `${directory}/maintenance.lock`;
  const handle = await open(path,"wx",0o600).catch(() => { throw new Error("A data-maintenance lock exists. Inspect its PID; remove only a confirmed stale lock."); });
  const token = randomUUID();
  await handle.writeFile(JSON.stringify({pid:process.pid,token}));
  return async () => {
    await handle.close();
    const owner = JSON.parse(await readFile(path,"utf8"));
    if (owner.pid !== process.pid || owner.token !== token) throw new Error("Maintenance lock owner changed; retained for review.");
    await unlink(path);
  };
}
