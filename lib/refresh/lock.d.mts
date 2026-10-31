export function acquireMaintenanceLock(): Promise<() => Promise<void>>;
