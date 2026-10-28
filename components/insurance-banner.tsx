import { siteConfig } from "@/config/site";
import { Arrow } from "@/components/brand";

/** Complimentary placement, independent of license records and search ranking. */
export function InsuranceBanner() {
  return <aside aria-label="Advertisement: Pro-Builders Insurance Agency" className="insurance-banner">
    <div className="page-shell insurance-inner">
      <div className="insurance-identity"><p className="ad-label">Advertisement</p><p>Pro-Builders Insurance Agency</p></div>
      <div className="insurance-copy"><p>Insurance &amp; bonds for California contractors</p><span>General Liability, Workers’ Comp &amp; Contractor Bonds</span></div>
      <a href={siteConfig.insuranceAdvertiserUrl} target="_blank" rel="sponsored noopener noreferrer" className="insurance-link">
        Visit Pro-Builders <Arrow diagonal /><span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  </aside>;
}
