import type { Payload } from "./snapshot";
export type RefreshPhase = "applying" | "geocoding" | "indexing" | "complete";
export interface RefreshRun { id: string; phase: RefreshPhase; cursor: string; processed: number; expected: number }
export interface RefreshIO {
  read(): Promise<RefreshRun>;
  batch(after: string): Payload[];
  apply(after: string, items: Payload[]): Promise<{cursor:string;processed:number}>;
  reconcile(): Promise<void>;
  advance(phase: RefreshPhase): Promise<void>;
  geocode(): Promise<void>;
  index(): Promise<void>;
  log?(value: {phase:string;processed:number;expected:number}): void;
}
/** Acknowledged database cursor is authoritative, including after lost responses. */
export async function runRefresh(io: RefreshIO) {
  let job = await io.read();
  while (job.phase === "applying") {
    const batch = io.batch(job.cursor);
    if (!batch.length) {
      if (job.processed !== job.expected) throw new Error("Snapshot cursor/count mismatch; refresh stopped.");
      await io.reconcile();
      await io.advance("geocoding"); break;
    }
    const result = await io.apply(job.cursor,batch);
    if (result.cursor !== batch.at(-1)!.license.license_number || result.processed !== job.processed+batch.length) throw new Error("Invalid refresh acknowledgement; resume from the database checkpoint.");
    job = await io.read(); io.log?.(job);
  }
  job = await io.read();
  if (job.phase === "geocoding") { await io.geocode(); await io.advance("indexing"); }
  job = await io.read();
  if (job.phase === "indexing") { await io.index(); await io.advance("complete"); }
}
