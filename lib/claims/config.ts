export function claimsEnabled() {
  return process.env.CLAIMS_ENABLED === "true";
}
export function claimsOrigin() {
  const origin = new URL(
    process.env.CLAIMS_SITE_URL ||
      "https://californiacontractorsearch.vercel.app",
  );
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      ))
  )
    throw new Error("Invalid claims site configuration.");
  return origin.origin;
}
export function userSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Account sign-in is not configured.");
  // Never fall back to service_role, including a privileged key misfiled as anon.
  if (key.startsWith("sb_secret_")) throw new Error("Use a public account client key.");
  if (key.split(".").length === 3) {
    let role: unknown;
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")).role; }
    catch { throw new Error("Invalid public account client key."); }
    if (role !== "anon") throw new Error("Use a public account client key.");
  }
  return { url, key };
}
