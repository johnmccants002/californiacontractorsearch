import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InsuranceBanner } from "@/components/insurance-banner";
import { siteConfig } from "@/config/site";

const interfaceFont = localFont({ src: "./fonts/manrope-latin-variable.woff2", variable: "--font-interface", weight: "200 800", display: "swap" });
const displayFont = localFont({ src: "./fonts/barlow-condensed-600.woff2", variable: "--font-display", weight: "600", display: "swap" });
const technicalFont = localFont({ src: "./fonts/ibm-plex-mono-400.woff2", variable: "--font-technical", weight: "400", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "California Contractor Search | Search CSLB Contractor Licenses",
    template: "%s | California Contractor Search",
  },
  description: siteConfig.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: "California Contractor Search",
    description: siteConfig.description,
    url: siteConfig.url,
  },
  twitter: {
    card: "summary_large_image",
    title: "California Contractor Search",
    description: siteConfig.description,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${interfaceFont.variable} ${displayFont.variable} ${technicalFont.variable}`}>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <SiteHeader />
        <InsuranceBanner />
        <main id="main-content" tabIndex={-1}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
