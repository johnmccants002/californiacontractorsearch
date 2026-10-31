import { describe, expect, it, vi } from "vitest";
import { retentionPlan, reconcileRetained } from "./retention";

describe("sealed retention plan", () => {
  it("pins exact stable IDs and rejects changed membership even at the same count", () => {
    expect(retentionPlan([20,10])).toEqual([10,20]);
    expect(retentionPlan([20,10],[10,20])).toEqual([10,20]);
    expect(() => retentionPlan([10,30],[10,20])).toThrow("membership changed");
    expect(() => retentionPlan([10],[10,20])).toThrow("membership changed");
    expect(() => retentionPlan([10,10])).toThrow("Invalid");
    expect(() => retentionPlan([NaN])).toThrow("Invalid");
    expect(() => retentionPlan([Number.MAX_SAFE_INTEGER+1])).toThrow("Invalid");
  });
  it("replays bounded batches after lost responses without dropping or duplicating IDs", async () => {
    const ids=Array.from({length:677},(_,i)=>i+1), receipts=new Set<number>();
    let fail=true;
    const apply=vi.fn(async (batch:number[])=>{
      batch.forEach(id=>receipts.add(id));
      if(fail && receipts.size===400) { fail=false;throw new Error("lost response"); }
      return receipts.size;
    });
    await expect(reconcileRetained(ids,apply)).rejects.toThrow("lost response");
    await reconcileRetained(ids,apply);
    expect([...receipts]).toEqual(ids);
    expect(apply.mock.calls.every(([batch])=>batch.length<=200)).toBe(true);
  });
  it("does not send an empty batch and rejects invalid acknowledgements",async()=>{
    const apply=vi.fn(async()=>0);await reconcileRetained([],apply);expect(apply).not.toHaveBeenCalled();
    await expect(reconcileRetained([10],apply)).rejects.toThrow("acknowledgement");
    await expect(reconcileRetained([10],async()=>2)).rejects.toThrow("acknowledgement");
  });
});
