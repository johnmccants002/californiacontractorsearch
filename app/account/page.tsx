import Link from "next/link";
import { requireAccount } from "@/lib/claims/auth";
import { CLAIM_FIELDS, type Claim } from "@/lib/claims/validation";
import { ClaimForm } from "@/components/claims/forms";
export default async function Page() {
  const { db, user } = await requireAccount();
  const [result, admin] = await Promise.all([
    db
      .from("business_claims")
      .select(CLAIM_FIELDS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    db.rpc("business_claim_admin_access"),
  ]);
  const claims = (result.data || []) as Claim[];
  const licenses = claims.length
    ? await db
        .from("licenses")
        .select("id,license_number,business_name")
        .in(
          "id",
          claims.map((c) => c.license_id),
        )
    : { data: [] };
  return (
    <>
      <p className="eyebrow">BUSINESS ACCOUNT</p>
      <h1>Manage your profiles</h1>
      <p>
        Signed in as {user.email}. Claim approval is separate from license
        status.
      </p>
      <div className="claim-actions">
        <Link className="button-secondary" href="/search">
          Find a business to claim
        </Link>
        {admin.data === true && (
          <Link className="button-secondary" href="/admin/claims">
            Review claims
          </Link>
        )}
        <ClaimForm action="sign-out" endpoint="/api/account" label="Sign out" />
      </div>
      {result.error ? (
        <p role="alert">
          We could not load your claims. Please try again later.
        </p>
      ) : !claims.length ? (
        <section className="claim-card">
          <h2>No claims yet</h2>
          <p>
            Find your license, then select “Claim this business.” We will review
            your authority before you can edit the profile.
          </p>
        </section>
      ) : (
        <div className="claim-list">
          {claims.map((claim) => {
            const license = licenses.data?.find(
              (l) => l.id === claim.license_id,
            );
            return (
              <section className="claim-card" key={claim.id}>
                <p className="eyebrow">{claim.status}</p>
                <h2>
                  {license?.business_name ||
                    `License record ${claim.license_id}`}
                </h2>
                <p>
                  Requested{" "}
                  {new Date(claim.created_at).toLocaleDateString("en-US", {
                    timeZone: "America/Los_Angeles",
                  })}{" "}
                  ·{" "}
                  {claim.status === "pending"
                    ? "Independent review is required. No editing access has been granted."
                    : claim.status === "approved"
                      ? "Management access is subject to the current business identity and any subsequent review."
                      : "No current editing access. Contact the review team to dispute this decision."}
                </p>
                {license && (
                  <div className="claim-actions">
                    <Link href={`/license/${license.license_number}`}>
                      View license #{license.license_number}
                    </Link>
                    {claim.status === "approved" && (
                      <Link
                        className="button-secondary"
                        href={`/account/business/${license.license_number}`}
                      >
                        Edit business details
                      </Link>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <p>Your latest 100 claim requests are shown.</p>
    </>
  );
}
