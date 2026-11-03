import { createUserClient } from "@/lib/claims/auth";
import { claimBody, claimError, claimResponse } from "@/lib/claims/http";
import {
  ClaimInputError,
  email,
  safeNext,
  text,
  uuid,
} from "@/lib/claims/validation";

export async function POST(request: Request) {
  try {
    const body = await claimBody(request);
    const db = await createUserClient();
    if (body.action === "send-code") {
      const address = email(body.email),
        captcha = text(body.captcha_token ?? "", 4096, 1);
      if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
        throw new ClaimInputError("Sign-in protection is not configured yet.");
      const { error } = await db.auth.signInWithOtp({
        email: address,
        options: { captchaToken: captcha, shouldCreateUser: true },
      });
      if (error)
        throw new ClaimInputError(
          "Unable to send a code. Check the security challenge, wait a minute, and try again.",
        );
      return claimResponse({
        ok: true,
        message:
          "If this address can sign in, a code is on its way. Check your spam folder too.",
      });
    }
    if (body.action === "verify-code") {
      const code = text(body.code, 8, 6);
      if (!/^\d{6,8}$/.test(code))
        throw new ClaimInputError("Enter the code from your email.");
      const { error } = await db.auth.verifyOtp({
        email: email(body.email),
        token: code,
        type: "email",
      });
      if (error)
        throw new ClaimInputError(
          "That code is invalid or expired. Request a new code and try again.",
        );
      return claimResponse({ ok: true, next: safeNext(body.next) });
    }
    if (body.action === "sign-out") {
      const { error } = await db.auth.signOut({ scope: "local" });
      if (error) throw error;
      return claimResponse({ ok: true, next: "/" });
    }
    const { data: user, error } = await db.auth.getUser();
    if (error || !user.user?.email_confirmed_at)
      return claimResponse({ error: "Sign in again to continue." }, 401);
    const access = await db.rpc("business_claim_admin_access");
    if (access.error || access.data !== true)
      return claimResponse({ error: "Reviewer access is required." }, 403);
    if (body.action === "enroll-mfa") {
      const factors = await db.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      if (factors.data.totp.length)
        return claimResponse({ ok: true, factorId: factors.data.totp[0].id });
      const enrollment = await db.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "California Contractor Search reviews",
      });
      if (enrollment.error)
        throw new ClaimInputError(
          "Unable to start MFA setup. If an earlier setup was interrupted, contact the administrator.",
        );
      return claimResponse({
        ok: true,
        factorId: enrollment.data.id,
        secret: enrollment.data.totp.secret,
      });
    }
    if (body.action === "verify-mfa") {
      const code = text(body.code, 6, 6);
      if (!/^\d{6}$/.test(code))
        throw new ClaimInputError("Enter the six-digit authenticator code.");
      const result = await db.auth.mfa.challengeAndVerify({
        factorId: uuid(body.factor_id),
        code,
      });
      if (result.error)
        throw new ClaimInputError(
          "Authenticator verification failed. Please try a new code.",
        );
      return claimResponse({ ok: true, next: "/admin/claims" });
    }
    throw new ClaimInputError("Unsupported account action.");
  } catch (error) {
    return claimError(error);
  }
}
