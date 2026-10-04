import { siteConfig } from "@/config/site";

export function Sponsorship({ classification }: { classification?: string }) {
  return (
    <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:flex sm:items-center sm:justify-between sm:gap-8" aria-label="Sponsored resource">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Sponsored by Contractors Intelligence School</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">
          {classification ? `Interested in becoming a ${classification} contractor?` : "Want to become a licensed California contractor?"}
        </h2>
      </div>
      <a href={siteConfig.cisUrl} target="_blank" rel="sponsored noreferrer" className="button-secondary mt-4 inline-flex shrink-0 sm:mt-0">
        {classification ? `Learn About ${classification} Licensing` : "Explore Contractor License Preparation"}
      </a>
    </aside>
  );
}
