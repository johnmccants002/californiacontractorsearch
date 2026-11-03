export class ClaimInputError extends Error {}
export const CLAIM_FIELDS =
  "id,license_id,user_id,applicant_name,applicant_role,applicant_email,website,status,verification_method,reviewed_at,created_at,updated_at";
export const PROFILE_FIELDS =
  "license_id,description,website,contact_phone,contact_email,hours,service_areas,updated_at";
export type ClaimStatus = "pending" | "approved" | "denied" | "revoked";
export type Claim = {
  id: string;
  license_id: number;
  user_id: string;
  applicant_name: string;
  applicant_role: string;
  applicant_email: string;
  website: string;
  status: ClaimStatus;
  verification_method: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type BusinessProfile = {
  license_id: number;
  description: string;
  website: string;
  contact_phone: string;
  contact_email: string;
  hours: string;
  service_areas: string;
  updated_at: string;
};
export function text(value: unknown, max: number, min = 0): string {
  if (typeof value !== "string")
    throw new ClaimInputError("Check the required fields.");
  const result = value.trim();
  const hasControl = Array.from(result).some((char) => {
    const code = char.charCodeAt(0);
    return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
  });
  if (result.length < min || result.length > max || hasControl)
    throw new ClaimInputError(
      `Keep text between ${min} and ${max} characters.`,
    );
  return result;
}
export function email(value: unknown) {
  const result = text(value, 254, 3);
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(result))
    throw new ClaimInputError("Enter one valid email address.");
  return result;
}
export function website(value: unknown) {
  const result = text(value, 500);
  if (!result) return "";
  try {
    const url = new URL(result);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname.includes(".") ||
      /[\s<>\\]/.test(result)
    )
      throw new Error();
    return url.href;
  } catch {
    throw new ClaimInputError("Use a complete HTTPS business website address.");
  }
}
export function safeNext(value: unknown) {
  return typeof value === "string" &&
    /^(?:\/account|\/admin\/claims|\/claim\/\d{1,10})$/.test(value)
    ? value
    : "/account";
}
export function licenseId(value: unknown) {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new ClaimInputError("Invalid license.");
  return id;
}
export function uuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new ClaimInputError("Invalid request.");
  return value;
}
export function claimInput(body: Record<string, unknown>) {
  if (body.attested !== true)
    throw new ClaimInputError(
      "Confirm you are authorized to represent this business.",
    );
  if (
    !["owner", "authorized_representative"].includes(
      String(body.applicant_role),
    )
  )
    throw new ClaimInputError("Select your role.");
  return {
    license_id: licenseId(body.license_id),
    applicant_name: text(body.applicant_name, 120, 2),
    applicant_role: String(body.applicant_role),
    website: website(body.website ?? ""),
    attested: true,
  };
}
export function profileInput(body: Record<string, unknown>) {
  if (body.public_consent !== true)
    throw new ClaimInputError(
      "Confirm these details may be displayed publicly.",
    );
  const phone = text(body.contact_phone ?? "", 40);
  if (!/^[0-9+(). x-]*$/.test(phone))
    throw new ClaimInputError("Enter a valid customer-contact phone number.");
  const contact = text(body.contact_email ?? "", 254);
  return {
    description: text(body.description ?? "", 2000),
    website: website(body.website ?? ""),
    contact_phone: phone,
    contact_email: contact ? email(contact) : "",
    hours: text(body.hours ?? "", 500),
    service_areas: text(body.service_areas ?? "", 1000),
  };
}
export function reviewInput(body: Record<string, unknown>) {
  const status = String(body.status);
  if (!["approved", "denied", "revoked"].includes(status))
    throw new ClaimInputError("Select a review decision.");
  const method = body.verification_method;
  if (
    status === "approved" &&
    !["cslb_phone", "independent_business_contact"].includes(String(method))
  )
    throw new ClaimInputError(
      "Record how business authority was independently verified.",
    );
  if (body.confirmed !== true)
    throw new ClaimInputError("Confirm your review decision.");
  return {
    status,
    verification_method: status === "approved" ? String(method) : null,
    review_note: text(body.review_note, 2000, 20),
  };
}
