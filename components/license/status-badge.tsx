import type { LicenseStatus } from "@/lib/contractors/types";

const styles: Record<LicenseStatus, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  EXPIRED: "border-amber-200 bg-amber-50 text-amber-900",
  SUSPENDED: "border-red-200 bg-red-50 text-red-800",
  INACTIVE: "border-slate-200 bg-slate-100 text-slate-700",
};

export function StatusBadge({ status }: { status: LicenseStatus }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide ${styles[status]}`}>{status}</span>;
}
