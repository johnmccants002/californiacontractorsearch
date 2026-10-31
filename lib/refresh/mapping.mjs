function clean(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function parseDate(value) {
  const input = clean(value);
  if (!input) return null;
  const match = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function parseTimestamp(value) {
  const date = parseDate(value);
  return date ? `${date}T00:00:00Z` : null;
}

function parseAmount(value) {
  const input = clean(value)?.replaceAll(/[$,]/g, "");
  if (!input) return null;
  const amount = Number(input);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeClassification(value) {
  return String(value ?? "").toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function splitPipe(value) {
  return String(value ?? "").split("|").map((item) => item.trim());
}

function mappedStatus(primaryStatus, expirationDate) {
  const source = String(primaryStatus ?? "").toLowerCase();
  if (source !== "clear") return "SUSPENDED";
  if (expirationDate && expirationDate < new Date().toISOString().slice(0, 10)) return "EXPIRED";
  return "ACTIVE";
}

export function mapLicense(row) {
  const expirationDate = parseDate(row.ExpirationDate);
  return {
    license_number: String(row.LicenseNo).trim(),
    business_name: clean(row.BusinessName) ?? clean(row.FullBusinessName) ?? "Unknown business",
    license_status: mappedStatus(row.PrimaryStatus, expirationDate),
    source_status: clean([row.PrimaryStatus, row.SecondaryStatus].filter(clean).join(" — ")),
    issue_date: parseDate(row.IssueDate),
    expiration_date: expirationDate,
    address_line_1: clean(row.MailingAddress),
    city: clean(row.City),
    state: clean(row.State),
    county: clean(row.County),
    zip: clean(row.ZIPCode),
    phone: clean(row.BusinessPhone),
    entity_type: clean(row.BusinessType),
    source_updated_at: parseTimestamp(row.LastUpdate),
    classifications: [...new Set(splitPipe(row["Classifications(s)"]).map(normalizeClassification).filter(Boolean))],
    wc_coverage_type: clean(row.WorkersCompCoverageType),
    wc_carrier: clean(row.WCInsuranceCompany),
    wc_policy_number: clean(row.WCPolicyNumber),
    wc_effective_date: parseDate(row.WCEffectiveDate),
    wc_expiration_date: parseDate(row.WCExpirationDate),
    cb_company: clean(row.CBSuretyCompany),
    cb_number: clean(row.CBNumber),
    cb_amount: parseAmount(row.CBAmount),
    cb_effective_date: parseDate(row.CBEffectiveDate),
    cb_cancellation_date: parseDate(row.CBCancellationDate),
    wb_company: clean(row.WBSuretyCompany),
    wb_number: clean(row.WBNumber),
    wb_amount: parseAmount(row.WBAmount),
    wb_effective_date: parseDate(row.WBEffectiveDate),
    wb_cancellation_date: parseDate(row.WBCancellationDate),
    db_company: clean(row.DBSuretyCompany),
    db_number: clean(row.DBNumber),
    db_amount: parseAmount(row.DBAmount),
    db_effective_date: parseDate(row.DBEffectiveDate),
    db_cancellation_date: parseDate(row.DBCancellationDate),
  };
}

export function mapPersonnel(row) {
  const parts = String(row.Name ?? "").trim().split(/\s{2,}/).map((item) => item.trim()).filter(Boolean);
  const lastName = parts[0] ?? "Unknown";
  const firstName = parts[1] ?? "Unknown";
  const middleName = clean(parts.slice(2).join(" "));
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const roles = [...new Set(splitPipe(row["EMP-Titl-CDE"]).filter(Boolean))];
  const associationDates = splitPipe(row["ASSN-DT"]).map(parseDate).filter(Boolean).sort();
  const rawDisassociationDates = splitPipe(row["DIS-ASSN-DT"]);
  const disassociationDates = rawDisassociationDates.map(parseDate).filter(Boolean).sort();
  const hasCurrentAssociation = rawDisassociationDates.some((item) => !clean(item));

  return {
    license_number: String(row["LIC-NO"]).trim(),
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    full_name: fullName,
    role: clean(roles.join(", ")),
    association_date: associationDates[0] ?? null,
    disassociation_date: hasCurrentAssociation ? null : (disassociationDates.at(-1) ?? null),
    source_updated_at: parseTimestamp(row.LastUpdated),
  };
}

export function mapWorkersComp(row) {
  return {
    license_number: String(row.LicenseNo).trim(),
    coverage_type: clean(row.WorkersCompCoverageType),
    carrier: clean(row.WCInsuranceCompany),
    policy_number: clean(row.WCPolicyNo),
    effective_date: parseDate(row.EffectiveDate),
    expiration_date: parseDate(row.ExpirationDate),
    cancellation_date: parseDate(row.CancellationDate),
    source_updated_at: parseTimestamp(row.LastUpdate),
  };
}
