import type { LicenseStatus } from "@/lib/contractors/types";

const styles: Record<LicenseStatus, string> = {
  ACTIVE: "status-active",
  EXPIRED: "status-expired",
  SUSPENDED: "status-suspended",
  INACTIVE: "status-inactive",
};

export function StatusBadge({ status, lastKnown = false }: { status: LicenseStatus; lastKnown?: boolean }) {
  return <span className={`status-badge ${lastKnown ? "status-last-known" : styles[status]}`}>{lastKnown ? `Last known: ${status}` : status}</span>;
}
