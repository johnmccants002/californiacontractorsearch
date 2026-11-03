import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/claims/auth";
import { PROFILE_FIELDS, type BusinessProfile } from "@/lib/claims/validation";
import { BusinessEditor } from "@/components/claims/forms";
export default async function Page({
  params,
}: {
  params: Promise<{ licenseNumber: string }>;
}) {
  const { licenseNumber } = await params;
  if (!/^\d{1,10}$/.test(licenseNumber)) notFound();
  const { db, user } = await requireAccount();
  const license = await db
    .from("licenses")
    .select("id,license_number,business_name,license_status")
    .eq("license_number", licenseNumber)
    .maybeSingle();
  if (license.error)
    return (
      <p role="alert">Unable to load this business. Please try again later.</p>
    );
  if (!license.data) notFound();
  const claims = await db
    .from("business_claims")
    .select("id")
    .eq("user_id", user.id)
    .eq("license_id", license.data.id)
    .eq("status", "approved");
  const profile = await db
    .from("business_profiles")
    .select(PROFILE_FIELDS)
    .eq("license_id", license.data.id)
    .maybeSingle();
  if (claims.error || profile.error)
    return (
      <p role="alert">Unable to verify your access. Please try again later.</p>
    );
  if (!claims.data?.length || !profile.data)
    return (
      <section className="claim-card">
        <h1>Management access unavailable</h1>
        <p>
          This profile may need approval, have a changed business identity, or
          have revoked access. Contact the review team.
        </p>
        <Link href="/account">Back to your account</Link>
      </section>
    );
  return (
    <>
      <p className="eyebrow">OWNER-PROVIDED DETAILS</p>
      <h1>{license.data.business_name}</h1>
      <p>
        License #{licenseNumber} · Imported status:{" "}
        {license.data.license_status}. These CSLB facts are read-only. Only the
        separate business-provided section below can be changed.
      </p>
      <Link href={`/license/${licenseNumber}`}>View public profile</Link>
      <section className="claim-card">
        <BusinessEditor
          key={profile.data.updated_at}
          profile={profile.data as BusinessProfile}
        />
      </section>
    </>
  );
}
