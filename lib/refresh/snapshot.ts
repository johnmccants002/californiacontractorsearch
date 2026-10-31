import { DatabaseSync } from "node:sqlite";
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import { createHash } from "node:crypto";
import { mapLicense, mapPersonnel, mapWorkersComp } from "./mapping.mjs";

export type Payload = { license: Record<string, unknown>; personnel: Record<string, unknown>[]; workers_comp: Record<string, unknown>[] };
export const requiredHeaders = {
  licenses: ["LicenseNo","LastUpdate","BusinessName","FullBusinessName","PrimaryStatus","SecondaryStatus","IssueDate","ExpirationDate","MailingAddress","City","State","County","ZIPCode","BusinessPhone","BusinessType","Classifications(s)","WorkersCompCoverageType","WCInsuranceCompany","WCPolicyNumber","WCEffectiveDate","WCExpirationDate",...['CB','WB','DB'].flatMap(p => [`${p}SuretyCompany`,`${p}Number`,`${p}Amount`,`${p}EffectiveDate`,`${p}CancellationDate`])],
  personnel: ["LIC-NO","Name","EMP-Titl-CDE","ASSN-DT","DIS-ASSN-DT","LastUpdated"],
  workers_comp: ["LicenseNo","WorkersCompCoverageType","WCInsuranceCompany","WCPolicyNo","EffectiveDate","ExpirationDate","CancellationDate","LastUpdate"],
};
export type Table = keyof typeof requiredHeaders;
export type RelatedTable = Exclude<Table, "licenses">;
export type MembershipReview = Record<RelatedTable, {
  matchedRows: number;
  matchedLicenses: number;
  quarantinedRows: number;
  quarantinedLicenses: number;
}>;
export function validateSourceRow(table:Table, row:Record<string,string>) {
  if (table === "licenses" && (!(row.BusinessName?.trim() || row.FullBusinessName?.trim()) || !row.PrimaryStatus?.trim())) throw new Error("Missing source identity/status.");
  if (table === "personnel" && !row.Name?.trim()) throw new Error("Missing personnel name.");
  const dates = table === "licenses" ? ["LastUpdate","IssueDate","ExpirationDate","WCEffectiveDate","WCExpirationDate",...['CB','WB','DB'].flatMap(p=>[`${p}EffectiveDate`,`${p}CancellationDate`])] : table === "personnel" ? ["ASSN-DT","DIS-ASSN-DT","LastUpdated"] : ["EffectiveDate","ExpirationDate","CancellationDate","LastUpdate"];
  for (const field of dates) for (const part of (row[field] ?? "").split("|")) {
    if (!part.trim()) continue;
    const match = part.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const iso = match && `${match[3]}-${match[1].padStart(2,"0")}-${match[2].padStart(2,"0")}`;
    if (!iso || !Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10) !== iso) throw new Error("Unexpected source date; review instead of silently clearing it.");
  }
  if (table === "licenses") for (const field of ["CBAmount","WBAmount","DBAmount"]) {
    const amount = (row[field] ?? "").trim().replaceAll(/[$,]/g,"");
    if (amount && (!Number.isFinite(Number(amount)) || Number(amount)<0)) throw new Error("Invalid source bond amount.");
  }
}
export class RefreshSnapshot {
  readonly db: DatabaseSync;
  constructor(path: string, readOnly = false) {
    this.db = new DatabaseSync(path, { readOnly });
    if (!readOnly) this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS licenses(number TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS personnel(number TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS personnel_number ON personnel(number);
      CREATE TABLE IF NOT EXISTS workers_comp(number TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS workers_number ON workers_comp(number);`);
  }
  async stage(table: Table, path: string) {
    if (Number(this.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n)) throw new Error("Snapshot is already staged; use a new snapshot directory.");
    const transform = { licenses: mapLicense, personnel: mapPersonnel, workers_comp: mapWorkersComp }[table];
    const parser = createReadStream(path).pipe(parse({ bom: true, trim: true, skip_empty_lines: true, relax_quotes: true,
      columns: (headers: string[]) => {
        if (requiredHeaders[table].some(h => !headers.includes(h)) || new Set(headers).size !== headers.length) throw new Error("CSLB CSV columns changed; review required.");
        return headers;
      } }));
    const insert = this.db.prepare(`INSERT INTO ${table}(number,payload) VALUES(?,?)`);
    let count = 0;
    this.db.exec("BEGIN");
    try {
      for await (const row of parser) {
        validateSourceRow(table,row);
        const mapped = transform(row);
        const number = String(mapped.license_number ?? "");
        if (!/^\d{1,10}$/.test(number)) throw new Error("Invalid CSLB license identity.");
        if (table === "licenses" && (!String(mapped.source_status ?? "").trim() || !String(mapped.business_name ?? "").trim())) throw new Error("Missing CSLB source identity/status.");
        insert.run(number, JSON.stringify(mapped)); count++;
      }
      this.db.exec("COMMIT"); return count;
    } catch { this.db.exec("ROLLBACK"); throw new Error(`Invalid ${table} snapshot (CSV, duplicate identity, or required field); no database writes performed.`); }
  }
  validate(minimums: Record<Table,number> = { licenses: 200000, personnel: 300000, workers_comp: 150000 }) {
    if (this.db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") throw new Error("Saved refresh snapshot failed its integrity check.");
    const counts = Object.fromEntries(Object.keys(minimums).map(t => [t,Number(this.db.prepare(`SELECT count(*) AS n FROM ${t}`).get()!.n)])) as Record<Table,number>;
    for (const table of Object.keys(minimums) as Table[]) {
      if (counts[table] < minimums[table]) throw new Error("CSLB snapshot is incomplete; no production changes allowed.");
      // The independently published detail files include newer and historical
      // licenses outside this master. Preserve those rows for review, but never
      // manufacture a parent license or attach details using an approximate ID.
      if (table !== "licenses" && counts[table] > 0 && !this.db.prepare(`SELECT 1 FROM ${table} d JOIN licenses l ON l.number=d.number LIMIT 1`).get()) throw new Error("CSLB detail file has no matching master licenses; review the selected source files.");
    }
    return counts;
  }
  membership(): MembershipReview {
    return Object.fromEntries((["personnel", "workers_comp"] as const).map(table => {
      const count = (matched: boolean) => {
        const row = this.db.prepare(`SELECT count(*) AS rows,count(DISTINCT d.number) AS licenses
          FROM ${table} d LEFT JOIN licenses l ON l.number=d.number WHERE l.number IS ${matched ? "NOT " : ""}NULL`).get()!;
        return {rows:Number(row.rows),licenses:Number(row.licenses)};
      };
      const matched=count(true), quarantined=count(false);
      return [table,{matchedRows:matched.rows,matchedLicenses:matched.licenses,quarantinedRows:quarantined.rows,quarantinedLicenses:quarantined.licenses}];
    })) as MembershipReview;
  }
  digest() {
    const hash = createHash("sha256");
    for (const table of ["licenses", "personnel", "workers_comp"] as const) {
      hash.update(table);
      for (const row of this.db.prepare(`SELECT number,payload FROM ${table} ORDER BY number,payload`).iterate()) hash.update(JSON.stringify([row.number,row.payload])+"\n");
    }
    return hash.digest("hex");
  }
  has(number: string) { return Boolean(this.db.prepare("SELECT 1 FROM licenses WHERE number=?").get(number)); }
  batch(after: string, limit=200): Payload[] {
    const related = (table: string, number: string) => this.db.prepare(`SELECT DISTINCT payload FROM ${table} WHERE number=? ORDER BY payload`).all(number).map(r => JSON.parse(String(r.payload)));
    return this.db.prepare("SELECT number,payload FROM licenses WHERE number>? ORDER BY number LIMIT ?").all(after,limit)
      .map(row => ({ license: JSON.parse(String(row.payload)),personnel: related("personnel",String(row.number)),workers_comp: related("workers_comp",String(row.number)) }));
  }
  close() { this.db.close(); }
}
