/** Pin the exact missing source IDs, not just their count, before any writes. */
export function retentionPlan(current: number[], saved?: number[]) {
  if (current.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(current).size !== current.length) {
    throw new Error("Invalid retention source IDs; review before importing.");
  }
  const sorted = [...current].sort((a,b) => a-b);
  if (saved && JSON.stringify(sorted) !== JSON.stringify(saved)) {
    throw new Error("Missing-license membership changed since preparation; review before resuming.");
  }
  return sorted;
}

/** Each receipt is idempotent. Replaying after a lost response preserves the plan. */
export async function reconcileRetained(ids: number[], apply: (batch: number[]) => Promise<number>) {
  for (let offset=0; offset<ids.length; offset+=200) {
    const count = await apply(ids.slice(offset,offset+200));
    if (!Number.isInteger(count) || count < Math.min(offset+200,ids.length) || count > ids.length) {
      throw new Error("Invalid retention acknowledgement; resume the same plan.");
    }
  }
}
