import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Freshness } from "./freshness-state";
import { freshnessState } from "./freshness-state";

export const getDataFreshness = cache(async (): Promise<Freshness> => {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url || !key) return {pending:false};
  try {
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await db.from("cslb_refresh_runs").select("phase,source_dates,completed_at,started_at").order("started_at",{ascending:false}).limit(2).abortSignal(AbortSignal.timeout(3000));
    return error ? {pending:false} : freshnessState(data ?? []);
  } catch { return {pending:false}; } // Metadata failure must not break search/profile pages.
});
