import "server-only";
import { createClient } from "@supabase/supabase-js";
import { emailConfig, sendEmailMessage } from "../refresh/notifications";
import { claimsOrigin } from "./config";
import { uuid } from "./validation";
type Notice = {
  id: string;
  claim_id: string;
  kind: string;
  recipient: string | null;
  created_at: string;
};
export function claimNoticeMessage(kind: string, origin: string) {
  const descriptions: Record<string, string> = {
    submitted_admin:
      "A business profile claim is waiting for independent review. Sign in with MFA to review it. Never approve a claim from an email link alone.",
    submitted_user:
      "Your business profile claim was received and is pending review. Email verification does not establish business authority. You can follow its status in your account.",
    access_requested:
      "Someone requested access to a business profile you manage. Your access has not changed. Sign in and contact the review team if this request is unexpected.",
    approved:
      "Your profile claim was approved. You can now add business details. CSLB facts remain read-only. Claimed status is not an endorsement or license guarantee.",
    denied:
      "Your profile claim was not approved. You can see its status and request a review through your account. Existing CSLB records were not changed.",
    revoked:
      "Your profile management access was revoked after review. Owner-provided content is no longer displayed under that claim. Contact the review team through your account if you dispute this decision.",
  };
  if (!descriptions[kind]) throw new Error("Unknown claim notice.");
  return {
    subject:
      kind === "submitted_admin"
        ? "Business profile claim awaiting review"
        : "California Contractor Search — profile claim update",
    text: `${descriptions[kind]}\n\n${origin}${kind === "submitted_admin" ? "/admin/claims" : "/account"}\n\nCalifornia Contractor Search is independent of CSLB. This notice contains no verification codes or private review evidence.`,
  };
}
/** At-most-once automatic SMTP attempt. Lost acknowledgments remain for manual review. */
export async function flushClaimNotices(claimId?: string) {
  if (process.env.CLAIMS_EMAIL_ENABLED !== "true")
    return { configured: false, sent: 0, review: 0 };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Claim delivery is not configured.");
  // Validate sender/admin recipient before reserving any message.
  const admin = emailConfig({
    ...process.env,
    CSLB_ALERT_TO: process.env.CLAIMS_ADMIN_EMAIL,
  });
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let query = db
    .from("business_claim_notices")
    .select("id")
    .eq("state", "pending")
    .order("created_at")
    .limit(3);
  if (claimId) query = query.eq("claim_id", uuid(claimId));
  const { data, error } = await query.abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error("Claim mail queue unavailable.");
  const outcomes = await Promise.all(
    (data ?? []).map(async (row) => {
      const reserved = await db
        .rpc("reserve_business_claim_notice", { target: row.id })
        .abortSignal(AbortSignal.timeout(5000));
      if (reserved.error) throw new Error("Claim mail reservation failed.");
      const notice = reserved.data?.[0] as Notice | undefined;
      if (!notice) return "skipped";
      try {
        const config =
          notice.kind === "submitted_admin"
            ? admin
            : emailConfig({
                ...process.env,
                CSLB_ALERT_TO: notice.recipient ?? "",
              });
        await sendEmailMessage(
          config,
          `ccs-claim-${notice.id}`,
          notice.created_at,
          claimNoticeMessage(notice.kind, claimsOrigin()),
        );
        const ack = await db
          .from("business_claim_notices")
          .update({ state: "sent", sent_at: new Date().toISOString() })
          .eq("id", notice.id)
          .eq("state", "sending")
          .select("id")
          .abortSignal(AbortSignal.timeout(5000));
        if (ack.error || ack.data?.length !== 1) throw new Error();
        return "sent";
      } catch {
        await db
          .from("business_claim_notices")
          .update({ state: "review" })
          .eq("id", notice.id)
          .eq("state", "sending")
          .abortSignal(AbortSignal.timeout(5000));
        return "review";
      }
    }),
  );
  return {
    configured: true,
    sent: outcomes.filter((x) => x === "sent").length,
    review: outcomes.filter((x) => x === "review").length,
  };
}
