import { siteConfig } from "@/config/site";
import { Arrow } from "@/components/brand";

export function Sponsorship({ classification }: { classification?: string }) {
  return <aside className="school-promotion" aria-label="Sponsored resource">
    <div><p className="eyebrow">Sponsored by Contractors Intelligence School</p>
      <h2>{classification ? `Your next chapter: ${classification} licensing.` : "Build what comes next."}</h2>
      <p>Take the next step toward your California contractor license.</p>
    </div>
    <a href={siteConfig.cisUrl} target="_blank" rel="sponsored noopener noreferrer" className="button-secondary">
      {classification ? `Learn About ${classification} Licensing` : "Explore Contractor License Preparation"} <Arrow diagonal />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  </aside>;
}
