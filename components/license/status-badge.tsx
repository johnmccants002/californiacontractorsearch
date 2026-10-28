import type { LicenseStatus } from "@/lib/contractors/types";

const styles: Record<LicenseStatus, string> = {
  ACTIVE: "status-active",
  EXPIRED: "status-expired",
  SUSPENDED: "status-suspended",
  INACTIVE: "status-inactive",
};

export function StatusBadge({ status }: { status: LicenseStatus }) {
  return <span className={`status-badge ${styles[status]}`}>{status}</span>;
}
