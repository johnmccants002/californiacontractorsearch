import type { Metadata } from "next";
import { ClaimsShell } from "@/components/claims/shell";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Business account",
  robots: { index: false, follow: false },
};
export default ClaimsShell;
