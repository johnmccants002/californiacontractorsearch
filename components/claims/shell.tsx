import Link from "next/link";
import { notFound } from "next/navigation";
import { claimsEnabled } from "@/lib/claims/config";

export function ClaimsShell({ children }: { children: React.ReactNode }) {
  if (!claimsEnabled()) notFound();
  return (
    <div className="page-shell inner-page claim-shell">
      <nav className="breadcrumb" aria-label="Business account navigation">
        <Link href="/account">Business account</Link>
        <span aria-hidden="true">/</span>
        <Link href="/search">Find a license</Link>
      </nav>
      {children}
      <aside className="claim-help">
        <h2>Need help or want to dispute a claim?</h2>
        <p>
          Contact the profile review team and include the license number. Do not
          email passwords, sign-in codes, government IDs, or sensitive financial
          documents.
        </p>
        {process.env.CLAIMS_SUPPORT_EMAIL &&
        /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(
          process.env.CLAIMS_SUPPORT_EMAIL,
        ) ? (
          <a href={`mailto:${process.env.CLAIMS_SUPPORT_EMAIL}`}>
            {process.env.CLAIMS_SUPPORT_EMAIL}
          </a>
        ) : (
          <p>
            Support contact is not configured yet. Profile claiming is in setup.
          </p>
        )}
        <p>
          Claiming is free. It confirms permission to manage business-provided
          content, not a CSLB endorsement, license verification, or guarantee of
          workmanship.
        </p>
      </aside>
    </div>
  );
}
