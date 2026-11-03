import Link from "next/link";
import { website, type BusinessProfile } from "@/lib/claims/validation";

export function PublicBusinessDetails({
  profile,
  licenseNumber,
}: {
  profile: BusinessProfile | null;
  licenseNumber: string;
}) {
  let url = "";
  try {
    url = website(profile?.website || "");
  } catch {
    /* Invalid direct-API values must not become links. */
  }
  return (
    <section className="profile-section profile-section-wide claim-public">
      <p className="eyebrow">BUSINESS-PROVIDED / SEPARATE FROM CSLB RECORDS</p>
      <h2>{profile ? "From the business" : "Is this your business?"}</h2>
      {profile ? (
        <>
          <p className="claim-label">Claimed profile</p>
          <p>
            Management access was reviewed. This is not a CSLB endorsement,
            license verification, or guarantee of service. The following details
            are supplied by the business.
          </p>
          <div className="claim-copy">
            {profile.description && <p>{profile.description}</p>}
            {url && (
              <p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer ugc nofollow"
                >
                  Visit business website ↗
                </a>
              </p>
            )}
            {profile.contact_phone && (
              <p>Customer contact phone: {profile.contact_phone}</p>
            )}
            {profile.contact_email && (
              <p>Customer contact email: {profile.contact_email}</p>
            )}
            {profile.hours && (
              <>
                <h3>Business hours</h3>
                <p>{profile.hours}</p>
              </>
            )}
            {profile.service_areas && (
              <>
                <h3>Service areas · self-reported</h3>
                <p>{profile.service_areas}</p>
                <p>
                  Not independently confirmed. Nearby-search distances use
                  registered business addresses, not service areas.
                </p>
              </>
            )}
          </div>
          <p>
            Business details last saved{" "}
            {new Date(profile.updated_at).toLocaleDateString("en-US", {
              timeZone: "America/Los_Angeles",
            })}
            . This does not change the CSLB source date.
          </p>
          <Link className="button-secondary" href={`/claim/${licenseNumber}`}>
            Request management access
          </Link>
        </>
      ) : (
        <>
          <p>
            Claim this profile for free to add your website, customer contact
            details, business hours, and service areas. License and insurance
            records remain read-only.
          </p>
          <Link className="button-secondary" href={`/claim/${licenseNumber}`}>
            Claim this business
          </Link>
        </>
      )}
    </section>
  );
}
