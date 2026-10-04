import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/license/status-badge";
import { getContractorByLicense } from "@/lib/contractors/repository";
import { displayClassificationCode } from "@/lib/search/normalize";
import { formatCurrency, formatDate } from "@/lib/format";
import { siteConfig } from "@/config/site";

type PageProps = { params: Promise<{ licenseNumber: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { licenseNumber } = await params;
  const contractor = await getContractorByLicense(licenseNumber);
  if (!contractor) return { title: "License not found" };
  const title = `${contractor.businessName} | California Contractor License #${contractor.licenseNumber}`;
  return {
    title: { absolute: title },
    description: `${contractor.businessName} is listed in ${contractor.city}, California with contractor license #${contractor.licenseNumber}. View status, classifications, personnel, bond, and workers' compensation details.`,
    alternates: { canonical: `/license/${contractor.licenseNumber}` },
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
    <div className="page-shell py-10 sm:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-4xl">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
          <Link href="/" className="hover:text-blue-900">Home</Link> <span aria-hidden="true">/</span> <span>License #{contractor.licenseNumber}</span>
        </nav>

        <header className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="font-mono text-sm font-semibold text-blue-800">California Contractor License #{contractor.licenseNumber}</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{contractor.businessName}</h1>
            </div>
            <StatusBadge status={contractor.licenseStatus} />
          </div>
          <p className="mt-6 max-w-3xl border-t border-slate-200 pt-6 leading-7 text-slate-700">
            {contractor.businessName} is a California contractor based in {contractor.city}. The company holds California contractor license #{contractor.licenseNumber} and is currently listed as {contractor.licenseStatus} in this site&apos;s dataset.
          </p>
        </header>

        <div className="mt-8 space-y-6">
          <ProfileSection title="License Information">
            <dl className="fact-list">
              <Fact label="License number" value={contractor.licenseNumber} />
              <Fact label="Status" value={contractor.licenseStatus} />
              <Fact label="Issue date" value={formatDate(contractor.issueDate)} />
              <Fact label="Expiration date" value={formatDate(contractor.expirationDate)} />
              <Fact label="Entity type" value={contractor.entityType} />
            </dl>
          </ProfileSection>

          <ProfileSection title="Classifications">
            <div className="space-y-3">
              {contractor.classifications.map((classification) => (
                <Link key={classification.id} href={`/classification/${classification.slug}`} className="block rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50/40">
                  <span className="font-mono font-bold text-blue-800">{displayClassificationCode(classification.code)}</span>
                  <span className="ml-3 font-semibold text-slate-950">{classification.name}</span>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{classification.description}</p>
                </Link>
              ))}
            </div>
          </ProfileSection>

          <ProfileSection title="Business Information">
            <dl className="fact-list">
              <Fact label="Address" value={[contractor.addressLine1, contractor.addressLine2].filter(Boolean).join(", ")} />
              <Fact label="City, state, ZIP" value={`${contractor.city}, ${contractor.state} ${contractor.zip}`} />
              <Fact label="Phone" value={contractor.phone || "Not available"} />
            </dl>
          </ProfileSection>

          <ProfileSection title="Personnel">
            {contractor.personnel.length ? contractor.personnel.map((person) => (
              <div key={person.id} className="border-b border-slate-200 py-4 last:border-0">
                <p className="font-semibold text-slate-950">{person.fullName}</p>
                <p className="mt-1 text-sm text-slate-600">{person.role}{person.associationDate ? ` · Associated ${formatDate(person.associationDate)}` : ""}</p>
              </div>
            )) : <p className="text-slate-600">No personnel records are available.</p>}
          </ProfileSection>

          <div className="grid gap-6 lg:grid-cols-2">
            <ProfileSection title="Bond Information">
              {contractor.bonds.length ? contractor.bonds.map((bond) => (
                <dl className="fact-list" key={bond.id}>
                  <Fact label="Type" value={bond.bondType} />
                  <Fact label="Company" value={bond.bondCompany} />
                  <Fact label="Bond number" value={bond.bondNumber} />
                  <Fact label="Amount" value={formatCurrency(bond.bondAmount)} />
                  <Fact label="Effective" value={formatDate(bond.effectiveDate)} />
                </dl>
              )) : <p className="text-slate-600">No bond record is available in this dataset.</p>}
            </ProfileSection>

            <ProfileSection title="Workers’ Compensation">
              {contractor.workersComp.length ? contractor.workersComp.map((item) => item.exemption ? (
                <p key={item.id} className="text-slate-700">This record indicates a workers&apos; compensation exemption.</p>
              ) : (
                <dl className="fact-list" key={item.id}>
                  <Fact label="Carrier" value={item.carrier ?? "Not available"} />
                  <Fact label="Policy" value={item.policyNumber ?? "Not available"} />
                  <Fact label="Effective" value={formatDate(item.effectiveDate)} />
                  <Fact label="Expiration" value={formatDate(item.expirationDate)} />
                </dl>
              )) : <p className="text-slate-600">No workers&apos; compensation record is available.</p>}
            </ProfileSection>
          </div>

          <ProfileSection title="Source and verification">
            <p className="leading-7 text-slate-700">Contractor license information is intended to be sourced from public California Contractors State License Board records. This MVP ships with fictional demonstration records until the public-data import is connected.</p>
            <p className="mt-3 text-sm font-medium text-slate-700">Data last updated: {formatDate(contractor.sourceUpdatedAt)}</p>
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">License status may change. Verify current information directly with CSLB before making important decisions.</p>
            <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noreferrer" className="button-secondary mt-5">Verify with official CSLB lookup ↗</a>
          </ProfileSection>

          <ProfileSection title="Frequently asked questions">
            <div className="space-y-6">
              <div><h3 className="font-semibold text-slate-950">What is {contractor.businessName}&apos;s license number?</h3><p className="mt-2 text-slate-600">The license number shown in this dataset is {contractor.licenseNumber}.</p></div>
              <div><h3 className="font-semibold text-slate-950">Is this an official CSLB website?</h3><p className="mt-2 text-slate-600">No. California Contractor Search is independent and is not affiliated with CSLB.</p></div>
            </div>
          </ProfileSection>
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><h2 className="text-xl font-bold tracking-tight text-slate-950">{title}</h2><div className="mt-5">{children}</div></section>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
