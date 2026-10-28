import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/license/status-badge";
import { LicenseVerification } from "@/components/data-source";
import { getContractorByLicense } from "@/lib/contractors/repository";
import { displayClassificationCode } from "@/lib/search/normalize";
import { formatCurrency, formatDate } from "@/lib/format";
import { featuredClassifications, siteConfig } from "@/config/site";

type PageProps = { params: Promise<{ licenseNumber: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { licenseNumber } = await params;
  const contractor = await getContractorByLicense(licenseNumber);
  if (!contractor) return { title: "License not found", robots: { index: false, follow: true } };
  const title = `${contractor.businessName} | California Contractor License #${contractor.licenseNumber}`;
  return {
    title: { absolute: title },
    description: `${contractor.businessName} is listed in ${contractor.city}, California with contractor license #${contractor.licenseNumber}. View status, classifications, personnel, bond, and workers' compensation details.`,
    alternates: { canonical: `/license/${contractor.licenseNumber}` },
    robots: { index: contractor.dataSource === "cslb", follow: true },
    openGraph: { title, description: `California contractor license profile for ${contractor.businessName}.`, type: "profile" },
  };
}

export default async function LicensePage({ params }: PageProps) {
  const { licenseNumber } = await params;
  const contractor = await getContractorByLicense(licenseNumber);
  if (!contractor) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness"],
    name: contractor.businessName,
    identifier: {
      "@type": "PropertyValue",
      name: "California contractor license number",
      value: contractor.licenseNumber,
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: [contractor.addressLine1, contractor.addressLine2].filter(Boolean).join(", "),
      addressLocality: contractor.city,
      addressRegion: contractor.state,
      postalCode: contractor.zip,
      addressCountry: "US",
    },
    ...(contractor.phone ? { telephone: contractor.phone } : {}),
  };

  return (
    <div className="page-shell inner-page">
      {contractor.dataSource === "cslb" ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /> : null}
      <div>
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span> <span>License #{contractor.licenseNumber}</span>
        </nav>

        <header className="profile-header">
          <div className="profile-title-row">
            <div>
              <p className="eyebrow">California Contractor License #{contractor.licenseNumber}</p>
              <h1>{contractor.businessName}</h1>
            </div>
            <StatusBadge status={contractor.licenseStatus} />
          </div>
          <LicenseVerification contractor={contractor} />
          <p className="profile-summary">
            {contractor.dataSource === "cslb" ? `${contractor.businessName} is listed in the imported CSLB records with a business address in ${contractor.city}, ${contractor.state}. License #${contractor.licenseNumber} is recorded as ${contractor.licenseStatus} in this dataset.` : `This ${contractor.dataSource === "demo" ? "demonstration" : "unconfirmed"} profile shows ${contractor.businessName} and license number ${contractor.licenseNumber}. It is not verification of a real contractor's license.`}
          </p>
        </header>

        <div className="profile-grid">
          <ProfileSection number="01" title="License Information">
            <dl className="fact-list">
              <Fact label="License number" value={contractor.licenseNumber} />
              <Fact label="Status" value={contractor.licenseStatus} />
              <Fact label="Issue date" value={formatDate(contractor.issueDate)} />
              <Fact label="Expiration date" value={formatDate(contractor.expirationDate)} />
              <Fact label="Entity type" value={contractor.entityType} />
            </dl>
          </ProfileSection>

          <ProfileSection number="02" title="Classifications">
            <div className="space-y-3">
              {contractor.classifications.map((classification) => (
                <Link key={classification.id} href={featuredClassifications.some((item) => item.slug === classification.slug) ? `/classification/${classification.slug}` : `/search?classification=${encodeURIComponent(classification.code)}`} className="profile-classification">
                  <span>{displayClassificationCode(classification.code)}</span>
                  <span>{classification.name}</span>
                  <p>{classification.description}</p>
                </Link>
              ))}
            </div>
          </ProfileSection>

          <ProfileSection number="03" title="Business Information">
            <dl className="fact-list">
              <Fact label="Address" value={[contractor.addressLine1, contractor.addressLine2].filter(Boolean).join(", ")} />
              <Fact label="City, state, ZIP" value={`${contractor.city}, ${contractor.state} ${contractor.zip}`} />
              <Fact label="Phone" value={contractor.phone || "Not available"} />
            </dl>
          </ProfileSection>

          <ProfileSection number="04" title="Personnel">
            {contractor.personnel.length ? contractor.personnel.map((person) => (
              <div key={person.id} className="personnel-record">
                <p>{person.fullName}</p>
                <p>{person.role}{person.associationDate ? ` · Associated ${formatDate(person.associationDate)}` : ""}</p>
              </div>
            )) : <p className="text-[var(--muted)]">No personnel records are available.</p>}
          </ProfileSection>

          <>
            <ProfileSection number="05" title="Bond Information">
              {contractor.bonds.length ? contractor.bonds.map((bond) => (
                <dl className="fact-list" key={bond.id}>
                  <Fact label="Type" value={bond.bondType} />
                  <Fact label="Company" value={bond.bondCompany} />
                  <Fact label="Bond number" value={bond.bondNumber} />
                  <Fact label="Amount" value={formatCurrency(bond.bondAmount)} />
                  <Fact label="Effective" value={formatDate(bond.effectiveDate)} />
                </dl>
              )) : <p className="text-[var(--muted)]">No bond record is available in this dataset.</p>}
            </ProfileSection>

            <ProfileSection number="06" title="Workers’ Compensation">
              {contractor.workersComp.length ? contractor.workersComp.map((item) => item.exemption ? (
                <p key={item.id} className="text-[var(--muted)]">This record indicates a workers&apos; compensation exemption.</p>
              ) : (
                <dl className="fact-list" key={item.id}>
                  <Fact label="Carrier" value={item.carrier ?? "Not available"} />
                  <Fact label="Policy" value={item.policyNumber ?? "Not available"} />
                  <Fact label="Effective" value={formatDate(item.effectiveDate)} />
                  <Fact label="Expiration" value={formatDate(item.expirationDate)} />
                </dl>
              )) : <p className="text-[var(--muted)]">No workers&apos; compensation record is available.</p>}
            </ProfileSection>
          </>

          <ProfileSection number="07" title="Source and verification" wide>
            <p className="max-w-4xl text-[var(--muted)]">{contractor.dataSource === "cslb" ? "This profile uses imported public California Contractors State License Board records. The source record date is shown above; it is not the date of a live verification or a guarantee that every detail is current." : contractor.dataSource === "demo" ? "This is a fictional demonstration profile. Its names, dates, and other details are sample data, not imported CSLB facts." : "The origin of this record has not been confirmed. Verify all license information directly with CSLB."}</p>
            <p className="record-advisory">License status may change. Verify current information directly with CSLB before making important decisions.</p>
            <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noopener noreferrer" className="button-secondary mt-5">Verify with official CSLB lookup ↗</a>
          </ProfileSection>

          <ProfileSection number="08" title="Frequently asked questions" wide>
            <div className="faq-grid">
              <div><h3>What is {contractor.businessName}&apos;s license number?</h3><p>The license number shown in this dataset is {contractor.licenseNumber}.</p></div>
              <div><h3>Is this an official CSLB website?</h3><p>No. California Contractor Search is independent and is not affiliated with CSLB.</p></div>
            </div>
          </ProfileSection>
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ number, title, children, wide = false }: { number: string; title: string; children: React.ReactNode; wide?: boolean }) {
  return <section className={`profile-section${wide ? " profile-section-wide" : ""}`}><p className="eyebrow">{number} / RECORD DETAIL</p><h2>{title}</h2><div className="profile-section-content">{children}</div></section>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
