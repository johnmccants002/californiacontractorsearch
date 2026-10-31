import { Client } from "typesense";
import type { SupabaseClient } from "@supabase/supabase-js";
import { typesenseConfig } from "@/lib/typesense/config";
import { indexSelect, mapIndexDocument, GEO_SCHEMA_VERSION, type IndexMarker, type IndexRow, type ContractorDocument } from "@/lib/typesense/schema";
import { assertImportSuccess, readIndexSource } from "@/lib/typesense/indexing";

export function sameDocument(expected: ContractorDocument, actual: ContractorDocument) {
  // Set-like search fields have no meaningful order; omit ingestion timestamp.
  const normalize = (value: unknown, key: string) => Array.isArray(value) && key !== "location" ? [...value].sort() : value ?? null;
  const keys = new Set([...Object.keys(expected),...Object.keys(actual)]);
  keys.delete("indexed_at");
  return [...keys].every(k => JSON.stringify(normalize(expected[k as keyof ContractorDocument],k)) === JSON.stringify(normalize(actual[k as keyof ContractorDocument],k)));
}
/** Update the existing ready v2 index via a durable outbox; no alias swap or deletion. */
export async function syncRefreshIndex(db: SupabaseClient, run: string, expectedCount: number, version: string) {
  const config = typesenseConfig(process.env,"index");
  const client = new Client({nodes:[{host:config.host,port:config.port,protocol:config.protocol}],apiKey:config.key,timeoutSeconds:30,connectionTimeoutSeconds:10,numRetries:2,logLevel:"silent"});
  if (!(await client.health.retrieve()).ok) throw new Error("Typesense is not healthy; refresh checkpoint retained.");
  if ((await client.aliases(config.collection).retrieve()).collection_name !== version) throw new Error("Index alias changed since the refresh began; review required.");
  const marker = await client.collections<IndexMarker>(version).documents("__ccs_ready__").retrieve();
  if (!marker.ready || marker.schema_version !== GEO_SCHEMA_VERSION) throw new Error("A ready geographic index is required.");
  const readDocs = async (ids: number[]) => {
    const result = await readIndexSource(() => db.from("licenses").select(indexSelect(true)).in("id",ids).abortSignal(AbortSignal.timeout(30_000)),"refresh verification");
    if (result.data?.length !== ids.length) throw new Error("Changed source records disappeared; review required.");
    return (result.data as unknown as IndexRow[]).map(row => {
      const doc = mapIndexDocument(row,Date.now(),true);
      if (!doc) throw new Error("Unconfirmed source record in refresh outbox.");
      return doc;
    });
  };
  for (;;) {
    const pending = await readIndexSource(() => db.from("cslb_refresh_changes").select("license_id").eq("run_id",run).eq("indexed",false).order("license_id").limit(200).abortSignal(AbortSignal.timeout(30_000)),"refresh outbox");
    const ids = (pending.data ?? []).map(r => Number(r.license_id)); if (!ids.length) break;
    if ((await client.aliases(config.collection).retrieve()).collection_name !== version) throw new Error("Index alias changed during refresh; review required.");
    const docs = await readDocs(ids);
    assertImportSuccess(await client.collections(version).documents().import(docs,{action:"upsert",dirty_values:"reject",throwOnFail:false}),docs.length);
    const indexed = await client.collections<ContractorDocument>(version).documents().search({q:"*",query_by:"business_name",filter_by:`record_kind:=contractor && license_id:=[${ids.join(",")}]`,per_page:250});
    const current = await readDocs(ids);
    if (indexed.found !== ids.length || indexed.hits?.length !== ids.length || current.some(doc => !indexed.hits?.some(hit => hit.document.id === doc.id && sameDocument(doc,hit.document)))) throw new Error("Index/source read-back mismatch; outbox remains pending.");
    await readIndexSource(() => db.from("cslb_refresh_changes").update({indexed:true}).eq("run_id",run).in("license_id",ids).abortSignal(AbortSignal.timeout(30_000)),"refresh acknowledgement");
  }
  const total = await client.collections(version).documents().search({q:"*",query_by:"business_name",filter_by:"record_kind:=contractor",per_page:0});
  if (total.found !== expectedCount || (await client.aliases(config.collection).retrieve()).collection_name !== version) throw new Error("Final index count/alias validation failed; freshness date was not advanced.");
}
