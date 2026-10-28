import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addressSnapshot, prepareAddress } from "./address";
let pg: PGlite;
const address = { address_line_1: "123 Main St", address_line_2: null, city: "Sacramento", state: "CA", zip: "95814" };
const update = { id: 1, hash: prepareAddress(address).hash, snapshot: addressSnapshot(address), result: { latitude: 38.58, longitude: -121.49, matchedAddress: "123 MAIN ST", status: "accepted", quality: "exact", geocodedAt: "2026-10-27T00:00:00Z" } };
beforeAll(async () => {
  pg = await PGlite.create();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.licenses(id bigint PRIMARY KEY, address_line_1 text,address_line_2 text,city text,state text,zip text,source_status text);
    ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_read ON public.licenses FOR SELECT TO anon,authenticated USING(true);
    GRANT SELECT ON public.licenses TO anon,authenticated; GRANT ALL ON public.licenses TO service_role;
    INSERT INTO public.licenses VALUES(1,'123 Main St',NULL,'Sacramento','CA','95814','Clear');`);
  await pg.exec(await readFile(new URL("../../supabase/migrations/20261028045933_census_geocoding_enrichment.sql", import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => { await pg?.close(); });
describe("geocoding SQL safeguards (isolated Postgres)", () => {
  it("permits service-role updates but denies anonymous writes and RPC execution", async () => {
    await pg.exec("SET ROLE anon");
    await expect(pg.query("select * from public.apply_census_geocodes($1::jsonb)", [JSON.stringify([update])])).rejects.toThrow(/permission denied/);
    await expect(pg.exec("UPDATE public.licenses SET latitude=12 WHERE id=1")).rejects.toThrow(/permission denied/);
    await pg.exec("RESET ROLE; SET ROLE service_role");
    const result = await pg.query("select * from public.apply_census_geocodes($1::jsonb)", [JSON.stringify([update])]);
    expect(result.rows).toEqual([{ license_id: 1, applied: true }]);
    await pg.exec("RESET ROLE");
  });
  it("invalidates coordinates on an import address change and rejects stale writes", async () => {
    await pg.exec("UPDATE public.licenses SET address_line_1='456 New Street' WHERE id=1");
    expect((await pg.query("SELECT latitude,geocode_address_hash FROM public.licenses")).rows).toEqual([{ latitude: null, geocode_address_hash: null }]);
    expect((await pg.query("select * from public.apply_census_geocodes($1::jsonb)", [JSON.stringify([update])])).rows).toEqual([{ license_id: 1, applied: false }]);
    await pg.exec("UPDATE public.licenses SET address_line_1='123 Main St' WHERE id=1");
  });
  it("rejects invalid and nullable accepted coordinates and oversized requests", async () => {
    for (const result of [{ ...update.result, latitude: 999 }, { ...update.result, latitude: null }, { ...update.result, quality: null }, { ...update.result, status: "review" }]) {
      await expect(pg.query("select * from public.apply_census_geocodes($1::jsonb)", [JSON.stringify([{ ...update, result }])])).rejects.toThrow(/check constraint/);
    }
    await expect(pg.query("select * from public.apply_census_geocodes($1::jsonb)", [JSON.stringify(Array(201).fill(update))])).rejects.toThrow("1 to 200");
  });
  it("keeps source addresses intact and allows idempotent replays", async () => {
    for (let i = 0; i < 2; i++) expect((await pg.query("select * from public.apply_census_geocodes($1::jsonb)", [JSON.stringify([update])])).rows).toEqual([{ license_id: 1, applied: true }]);
    expect((await pg.query("SELECT address_line_1,latitude FROM public.licenses")).rows).toEqual([{ address_line_1: "123 Main St", latitude: 38.58 }]);
  });
});
