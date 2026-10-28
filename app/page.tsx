import Link from "next/link";
import type { Metadata } from "next";
import { DatasetNotice } from "@/components/data-source";
import { getDatasetSource } from "@/lib/contractors/repository";
import { SearchForm } from "@/components/search/search-form";
import { Sponsorship } from "@/components/sponsorship";
import { CaliforniaDrawing } from "@/components/california-drawing";
import { SectionHeading } from "@/components/section-heading";
import { Arrow } from "@/components/brand";
import { featuredClassifications, siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: await getDatasetSource() === "cslb", follow: true } };
}

export default async function HomePage() {
  const source = await getDatasetSource();
  return <>
    <section className="home-hero"><div className="page-shell">
      <div className="hero-grid"><div className="hero-content">
        <p className="eyebrow"><span className="index-dot" /> CALIFORNIA CONTRACTOR SEARCH <span className="hero-edition">/ PUBLIC RECORDS</span></p>
        <h1>Find the right<br />contractor.<span>Know who you’re hiring.</span></h1>
        <p className="hero-description">A clearer view of California contractor licenses.<br className="hidden sm:block" /> Search by name, license number, trade, or location.</p>
        <SearchForm showExamples />
      </div><CaliforniaDrawing /></div>
      <div className="hero-bottom"><span className="technical">01 / SEARCH WITH CLARITY</span><p>Independent search. Public records. No account required.</p></div>
    </div></section>

    <div className="page-shell home-sections">
      <section id="trades" aria-labelledby="browse-heading">
        <SectionHeading number="02" label="THE TRADE INDEX" title="Built for every kind of builder." id="browse-heading"><p>Find a specialty.<br />Start with a classification.</p></SectionHeading>
        <div className="trade-index">{featuredClassifications.map((classification, index) =>
          <Link key={classification.slug} href={`/classification/${classification.slug}`}>
            <span className="trade-code">{classification.code}</span><span className="trade-name">{classification.name}<span className="technical">CLASSIFICATION / {String(index + 1).padStart(2, "0")}</span></span><Arrow />
          </Link>
        )}<Link href="/search" className="trade-all"><span className="trade-code">↗</span><span className="trade-name">Find your trade<span className="technical">EXPLORE THE FULL SEARCH</span></span><Arrow /></Link></div>
      </section>

      <section className="data-attribution" id="about-data" aria-labelledby="data-heading">
        <div><p className="eyebrow"><span>03</span> / KNOW THE SOURCE</p><h2 id="data-heading">A clearer view.<br />An informed decision.</h2></div>
        <div className="data-attribution-copy"><DatasetNotice source={source} /><p>{siteConfig.disclaimer}</p>
          <a href={siteConfig.cslbLookupUrl} target="_blank" rel="noopener noreferrer" className="text-link">Verify with the official CSLB <Arrow diagonal /><span className="sr-only"> (opens in a new tab)</span></a>
        </div>
      </section>
      <Sponsorship />
    </div>
  </>;
}
