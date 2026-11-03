import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/claims/auth";
import { ClaimForm } from "@/components/claims/forms";
export default async function Page({
  params,
}: {
  params: Promise<{ licenseNumber: string }>;
}) {
  const { licenseNumber } = await params;
  if (!/^\d{1,10}$/.test(licenseNumber)) notFound();
  const { db, user } = await requireAccount(`/claim/${licenseNumber}`);
  const { data: license, error } = await db
    .from("licenses")
    .select(
      "id,license_number,business_name,source_status,source_missing_since",
    )
    .eq("license_number", licenseNumber)
    .maybeSingle();
  if (error)
    return (
      <p role="alert">Unable to load this business. Please try again later.</p>
    );
  if (!license) notFound();
  const existing = await db
    .from("business_claims")
    .select("id,status")
    .eq("license_id", license.id)
    .eq("user_id", user.id)
    .in("status", ["pending", "approved"]);
  const managed = await db
    .from("business_profiles")
    .select("license_id")
    .eq("license_id", license.id)
    .maybeSingle();
  return (
    <>
      <p className="eyebrow">LICENSE #{license.license_number}</p>
      <h1>{managed.data ? "Request profile access" : "Claim this business"}</h1>
      <h2>{license.business_name}</h2>
      <p>
        Claiming is free. We independently confirm that you can represent this
        business before granting access. We may contact the business using
        independently obtained contact information.
      </p>
      <Link href={`/license/${licenseNumber}`}>
        Review the public license profile
      </Link>
      {existing.error || managed.error ? (
        <p role="alert">
          We could not check existing claims. Please try again later.
        </p>
      ) : existing.data?.length ? (
        <section className="claim-card">
          <p>
            You already have a {existing.data[0].status} request for this
            profile.
          </p>
          <Link href="/account">View your request</Link>
        </section>
      ) : !license.source_status || license.source_missing_since ? (
        <p className="record-advisory">
          This source record needs review before it can be claimed. Contact the
          review team.
        </p>
      ) : (
        <section className="claim-card claim-narrow">
          {managed.data && (
            <p className="record-advisory">
              This business already has a manager. Your request will notify the
              existing manager and enter manual review. Their access will not
              change automatically.
            </p>
          )}
          <ClaimForm
            action="submit"
            initial={{ license_id: license.id }}
            label="Submit claim for review"
          >
            <label>
              Your full name
              <input
                className="field-input"
                name="applicant_name"
                autoComplete="name"
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <label>
              Your role
              <select
                className="field-input"
                name="applicant_role"
                defaultValue="owner"
              >
                <option value="owner">Business owner</option>
                <option value="authorized_representative">
                  Authorized representative
                </option>
              </select>
            </label>
            <label>
              Business website (optional)
              <input
                className="field-input"
                name="website"
                type="url"
                maxLength={500}
                placeholder="https://example.com"
              />
            </label>
            <p>
              Updates go to your verified account email. Do not upload identity
              documents or provide private financial information. Your name and
              review details are private to you and the review team.
            </p>
            <label className="claim-check">
              <input type="checkbox" name="attested" required /> I am authorized
              to represent this business and request management access. I
              understand that CSLB facts cannot be edited, my request will be
              independently reviewed, and access may be revoked if
              misrepresented.
            </label>
          </ClaimForm>
        </section>
      )}
    </>
  );
}
