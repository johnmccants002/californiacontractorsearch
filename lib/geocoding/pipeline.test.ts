import { afterEach, describe, expect, it, vi } from "vitest";
import { GeocodingStore } from "./store";
import { runGeocodingJob, type PipelineIO, type SourceAddress } from "./pipeline";
import { parseCensusCsv } from "./census";
vi.mock("server-only", () => ({}));
const stores: GeocodingStore[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
const row = (id: number, street = "123 Main St"): SourceAddress => ({ id, license_number: String(1000000 + id), business_name: "Test Fixture", source_status: "Clear", address_line_1: street, address_line_2: null, city: "Sacramento", state: "CA", zip: "95814" });
function setup(rows: SourceAddress[]) {
  const store = new GeocodingStore(":memory:"); stores.push(store);
  const job = store.createJob("https://example.supabase.co", 100, false);
  const io: PipelineIO = {
    read: vi.fn(async (cursor) => rows.filter((r) => r.id > cursor)),
    submit: vi.fn<PipelineIO["submit"]>(async (items) => {
      const csv = items.map((i) => `"${i.id}",input,Match,Exact,"123 MAIN ST, SACRAMENTO, CA, 95814","-121.49,38.58",1,L`).join("\n");
      return { csv, results: parseCensusCsv(csv, items) };
    }),
    apply: vi.fn<PipelineIO["apply"]>(async (updates) => updates.map((u) => ({ license_id: u.id, applied: true }))),
  };
  return { store, job, io };
}
describe("durable geocoding jobs", () => {
  it("deduplicates addresses but updates every stable contractor ID and records skips", async () => {
    const { store, job, io } = setup([row(1), row(2), row(3, "PO BOX 5")]);
    await runGeocodingJob(store, job.id, io, 10000);
    expect(io.submit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(io.submit).mock.calls[0][0]).toHaveLength(1);
    expect(vi.mocked(io.apply).mock.calls[0][0].map((u) => u.id)).toEqual([1, 2, 3]);
    expect(vi.mocked(io.apply).mock.calls[0][0][2].result.status).toBe("skipped_po_box");
    expect(store.job(job.id).phase).toBe("complete");
  });
  it("restarts a failed apply from saved results without resubmitting Census requests", async () => {
    const { store, job, io } = setup([row(1)]);
    vi.mocked(io.apply).mockRejectedValueOnce(new Error("network"));
    await expect(runGeocodingJob(store, job.id, io)).rejects.toThrow();
    await runGeocodingJob(store, job.id, io);
    expect(io.submit).toHaveBeenCalledTimes(1);
    expect(io.apply).toHaveBeenCalledTimes(2);
    expect(store.syncIds(job.id)).toEqual([1]);
  });
  it("restarts the saved failed batch and marks changed/deleted records stale", async () => {
    const { store, job, io } = setup([row(1), row(2)]);
    vi.mocked(io.submit).mockRejectedValueOnce(new Error("network"));
    await expect(runGeocodingJob(store, job.id, io)).rejects.toThrow("progress retained");
    vi.mocked(io.apply).mockResolvedValue([{ license_id: 1, applied: false }, { license_id: 2, applied: true }]);
    await runGeocodingJob(store, job.id, io);
    expect(vi.mocked(io.submit).mock.calls[1][0]).toEqual(vi.mocked(io.submit).mock.calls[0][0]);
    expect(store.syncIds(job.id)).toEqual([2]);
  });
  it("reuses cached addresses in later jobs", async () => {
    const { store, job, io } = setup([row(1)]);
    await runGeocodingJob(store, job.id, io);
    const later = store.createJob(job.source, 100, false);
    await runGeocodingJob(store, later.id, io);
    expect(io.submit).toHaveBeenCalledTimes(1);
  });
});
