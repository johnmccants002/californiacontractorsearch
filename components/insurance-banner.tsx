import { siteConfig } from "@/config/site";

/** Complimentary placement, independent of license records and search ranking. */
export function InsuranceBanner() {
  return (
    <aside aria-label="Advertisement: Pro-Builders Insurance Agency" className="border-b border-teal-100 bg-teal-50/70">
      <div className="page-shell flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden="true" className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-teal-900 text-white sm:flex">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-6" focusable="false">
              <path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3Z" strokeLinejoin="round" />
              <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Advertisement</p>
            <p className="mt-1 text-base font-bold tracking-tight text-teal-950">Insurance &amp; bonds for California contractors</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              <span className="font-semibold text-slate-800">Pro-Builders Insurance Agency</span>
              <span className="hidden lg:inline"> · General Liability, Workers’ Comp &amp; Contractor Bonds</span>
            </p>
          </div>
        </div>
        <a href={siteConfig.insuranceAdvertiserUrl} target="_blank" rel="sponsored noopener noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-teal-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 sm:self-auto">
          Visit Pro-Builders <span aria-hidden="true">↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </aside>
  );
}
