import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/claims/auth";
import { CLAIM_FIELDS, type Claim } from "@/lib/claims/validation";
import { ClaimForm, MfaForm, ReviewForm } from "@/components/claims/forms";
import { getCslbLicenseUrl } from "@/config/site";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { db, user } = await requireAccount("/admin/claims");
  const access = await db.rpc("business_claim_admin_access");
  if (access.error)
    return (
      <p role="alert">
        Reviewer access could not be verified. Please try again later.
      </p>
    );
  if (access.data !== true) notFound();
  const auth = await db.auth.getClaims();
  if (auth.error || auth.data?.claims.aal !== "aal2") return <MfaForm />;
  const params = await searchParams,
    status = ["pending", "approved", "denied", "revoked"].includes(
      params.status || "",
    )
      ? params.status!
      : "pending";
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(params.page || "1", 10) || 1),
  );
  const result = await db
    .from("business_claims")
    .select(CLAIM_FIELDS)
    .eq("status", status)
    .order("created_at")
    .order("id")
    .range((page - 1) * 20, page * 20);
  const claims = (result.data || []) as Claim[],
    visible = claims.slice(0, 20);
  const licenses = visible.length
    ? await db
        .from("licenses")
        .select(
          "id,license_number,business_name,phone,source_status,source_missing_since",
        )
        .in(
          "id",
          visible.map((c) => c.license_id),
        )
    : { data: [] };
  const events = visible.length
    ? await db
        .from("business_claim_events")
        .select("id,license_id,event,created_at,before_data,after_data")
        .in(
          "license_id",
          visible.map((c) => c.license_id),
        )
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] };
  if (
    ("error" in licenses && licenses.error) ||
    ("error" in events && events.error)
  )
    return (
      <p role="alert">
        Source facts or review history could not be loaded. No review can be
        submitted from this page. Please try again later.
      </p>
    );
  return (
    <>
      <p className="eyebrow">PRIVATE / MFA REVIEW</p>
      <h1>Business claim reviews</h1>
      <p>
        Verify authority through contact information independently obtained from
        CSLB or another established business source. Do not rely on the
        applicant’s supplied phone, website, email domain, license knowledge, or
        public personnel names alone. Confirm the person is authorized by the
        business, and record the method and date.
      </p>
      <p>
        For a competing claim, contact the existing manager and resolve the
        dispute first. Revoke their claim only after review, then approve the
        replacement. Replacement approval clears previous owner-provided content
        and preserves the private audit trail.
      </p>
      <nav className="claim-actions" aria-label="Review filters">
        {["pending", "approved", "denied", "revoked"].map((s) => (
          <Link
            key={s}
            href={`/admin/claims?status=${s}`}
            aria-current={status === s ? "page" : undefined}
          >
            {s}
          </Link>
        ))}
      </nav>
      {result.error ? (
        <p role="alert">The review queue could not be loaded.</p>
      ) : !visible.length ? (
        <p>No {status} claims on this page.</p>
      ) : (
        visible.map((claim) => {
          const license = licenses.data?.find((l) => l.id === claim.license_id);
          return (
            <section key={claim.id} className="claim-card">
              <p className="eyebrow">
                {claim.status} ·{" "}
                {new Date(claim.created_at).toISOString().slice(0, 10)}
              </p>
              <h2>
                {license?.business_name || `License record ${claim.license_id}`}
              </h2>
              <p>
                {claim.applicant_name} ·{" "}
                {claim.applicant_role.replaceAll("_", " ")} ·{" "}
                {claim.applicant_email}
              </p>
              <p>
                Applicant-supplied website (unverified):{" "}
                {claim.website || "None"}
              </p>
              {license && (
                <p>
                  Imported CSLB phone: {license.phone || "Not available"}.{" "}
                  <a
                    href={getCslbLicenseUrl(license.license_number)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Check current official CSLB record ↗
                  </a>
                </p>
              )}
              {claim.user_id === user.id ? (
                <p>
                  You cannot review your own claim. Another MFA-verified
                  reviewer is required.
                </p>
              ) : (
                ["pending", "approved"].includes(claim.status) && (
                  <ReviewForm claim={claim} />
                )
              )}
              <details>
                <summary>Recent private audit history</summary>
                {(events.data || [])
                  .filter((e) => e.license_id === claim.license_id)
                  .map((e) => (
                    <div key={e.id}>
                      <p>
                        {e.event} · {e.created_at}
                      </p>
                      <pre className="claim-audit">
                        {JSON.stringify(
                          { before: e.before_data, after: e.after_data },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  ))}
                <p>
                  Up to 100 recent events across this page. Full history is
                  retained in the private audit table.
                </p>
              </details>
              <ClaimForm
                action="deliver-notices"
                initial={{ claim_id: claim.id }}
                label="Send pending notifications"
              />
              <p>
                Only never-attempted notices are sent. Ambiguous or failed
                deliveries require private queue review.
              </p>
            </section>
          );
        })
      )}
      <nav className="claim-actions" aria-label="Review pagination">
        {page > 1 && (
          <Link href={`/admin/claims?status=${status}&page=${page - 1}`}>
            Previous
          </Link>
        )}
        {claims.length > 20 && (
          <Link href={`/admin/claims?status=${status}&page=${page + 1}`}>
            Next
          </Link>
        )}
      </nav>
    </>
  );
}
