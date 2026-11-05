import { after } from "next/server";
import { createUserClient } from "@/lib/claims/auth";
import { claimBody, claimError, claimResponse } from "@/lib/claims/http";
import {
  ClaimInputError,
  claimInput,
  profileInput,
  reviewInput,
  licenseId,
  text,
  uuid,
} from "@/lib/claims/validation";
import { flushClaimNotices } from "@/lib/claims/notices";
export const maxDuration = 60;
function delivery(id: string) {
  after(async () => {
    try {
      await flushClaimNotices(id);
    } catch {
      console.warn(
        "Claim notification delivery deferred; inspect the private mail queue.",
      );
    }
  });
}
export async function POST(request: Request) {
  try {
    const body = await claimBody(request);
    const db = await createUserClient();
    const { data: user, error } = await db.auth.getUser();
    if (error || !user.user?.email_confirmed_at)
      return claimResponse({ error: "Sign in again to continue." }, 401);
    if (body.action === "submit") {
      const result = await db
        .from("business_claims")
        .insert(claimInput(body))
        .select("id")
        .single();
      if (result.error)
        throw new ClaimInputError(
          result.error.code === "23505"
            ? "You already have an open request for this profile."
            : "Unable to submit. Check your open requests, try later, or contact support. No ownership was granted.",
        );
      delivery(result.data.id);
      return claimResponse(
        {
          ok: true,
          next: "/account",
          message: "Your claim is pending independent review.",
        },
        201,
      );
    }
    if (body.action === "save-profile") {
      const result = await db
        .from("business_profiles")
        .update(profileInput(body))
        .eq("license_id", licenseId(body.license_id))
        .eq("updated_at", text(body.updated_at, 64, 1))
        .select("license_id")
        .single();
      if (result.error)
        throw new ClaimInputError(
          "Unable to save. Your access or the profile may have changed; reload before trying again.",
        );
      return claimResponse({
        ok: true,
        message: "Your public business details were saved.",
      });
    }
    const access = await db.rpc("business_claim_admin_access"),
      claims = await db.auth.getClaims();
    if (
      access.error ||
      access.data !== true ||
      claims.error ||
      claims.data?.claims.aal !== "aal2"
    )
      return claimResponse(
        { error: "An MFA-verified reviewer session is required." },
        403,
      );
    if (body.action === "review") {
      const id = uuid(body.claim_id),
        status = String(body.expected_status);
      if (!["pending", "approved"].includes(status))
        throw new ClaimInputError("Reload the review queue.");
      const result = await db
        .from("business_claims")
        .update(reviewInput(body))
        .eq("id", id)
        .eq("status", status)
        .eq("updated_at", text(body.updated_at, 64, 1))
        .select("id")
        .single();
      if (result.error)
        throw new ClaimInputError(
          "Review was not saved. Check verification evidence, competing ownership, and whether the request changed. You cannot approve your own claim.",
        );
      delivery(id);
      return claimResponse({
        ok: true,
        message: "Review recorded. Notification queued.",
      });
    }
    if (body.action === "deliver-notices") {
      const result = await flushClaimNotices(uuid(body.claim_id));
      return claimResponse({
        ok: true,
        message: result.configured
          ? `Email attempts: ${result.sent} accepted; ${result.review} need delivery review.`
          : "Email delivery is not configured; queued messages are preserved.",
      });
    }
    throw new ClaimInputError("Unsupported claim action.");
  } catch (error) {
    return claimError(error);
  }
}
