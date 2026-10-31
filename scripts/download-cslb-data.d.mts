export interface Dataset { code: string; eventTarget: string; filename: string }
export const downloads: Dataset[];
export function selectedDataset(dataset: Dataset): Promise<{html: string; cookie: string}>;
export function downloadDataset(dataset: Dataset, directory?: string): Promise<void>;
