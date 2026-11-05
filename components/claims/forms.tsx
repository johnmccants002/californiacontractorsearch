"use client";

import Script from "next/script";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { BusinessProfile, Claim } from "@/lib/claims/validation";

type Reply = {
  ok?: boolean;
  error?: string;
  message?: string;
  next?: string;
  factorId?: string;
  secret?: string;
};
async function submit(
  endpoint: string,
  data: Record<string, unknown>,
): Promise<Reply> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const reply = await response.json();
  if (!response.ok || !reply.ok)
    throw new Error(reply.error || "Unable to complete this request.");
  return reply;
}

export function ClaimForm({
  action,
  initial = {},
  children,
  label,
  endpoint = "/api/claims",
}: {
  action: string;
  initial?: Record<string, unknown>;
  children?: ReactNode;
  label: string;
  endpoint?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFailed(false);
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const data: Record<string, unknown> = { ...initial, ...fields, action };
    for (const key of ["attested", "public_consent", "confirmed"])
      if (key in fields) data[key] = fields[key] === "on";
    try {
      const reply = await submit(endpoint, data);
      setMessage(reply.message || "Saved.");
      if (reply.next) router.push(reply.next);
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="claim-form" onSubmit={onSubmit}>
      <fieldset disabled={busy}>
        {children}
        <button className="button-primary" type="submit">
          {busy ? "Working…" : label}
        </button>
      </fieldset>
      <p
        role={failed ? "alert" : "status"}
        className={failed ? "form-error" : "claim-feedback"}
      >
        {message}
      </p>
    </form>
  );
}

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
};
function captcha() {
  return (window as unknown as { turnstile?: Turnstile }).turnstile;
}
export function SignInForm({
  next,
  siteKey,
}: {
  next: string;
  siteKey: string;
}) {
  const router = useRouter(),
    container = useRef<HTMLDivElement>(null),
    widget = useRef<string | undefined>(undefined);
  const [token, setToken] = useState(""),
    [address, setAddress] = useState(""),
    [code, setCode] = useState("");
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  function mountChallenge() {
    if (container.current && widget.current === undefined && captcha())
      widget.current = captcha()!.render(container.current, {
        sitekey: siteKey,
        callback: (value: string) => setToken(value),
        "expired-callback": () => setToken(""),
        "error-callback": () => {
          setToken("");
          setFailed(true);
          setMessage(
            "The security challenge could not load. Reload the page and try again.",
          );
        },
      });
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const reply = await submit(
        "/api/account",
        sent
          ? { action: "verify-code", email: address, code, next }
          : { action: "send-code", email: address, captcha_token: token },
      );
      if (reply.next) {
        router.push(reply.next);
        router.refresh();
      } else {
        setSent(true);
        setMessage(reply.message || "Check your email for a code.");
      }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
      if (widget.current !== undefined) captcha()?.reset(widget.current);
      setToken("");
    }
  }
  return (
    <form className="claim-form" onSubmit={send}>
      <fieldset disabled={busy}>
        <label>
          Email address
          <input
            className="field-input"
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            readOnly={sent}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        {sent && (
          <label>
            Email code
            <input
              className="field-input"
              name="code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6,8}"
              required
              minLength={6}
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </label>
        )}
        <div hidden={sent}>
          <div ref={container} />
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onReady={mountChallenge}
            onError={() => {
              setFailed(true);
              setMessage("Unable to load sign-in protection. Please reload.");
            }}
          />
        </div>
        <button className="button-primary" disabled={busy || (!sent && !token)}>
          {busy
            ? "Working…"
            : sent
              ? "Verify and sign in"
              : "Email me a sign-in code"}
        </button>
        {sent && (
          <button
            className="button-secondary"
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setMessage(
                "Wait at least one minute before requesting another code.",
              );
            }}
          >
            Use another email / request a new code
          </button>
        )}
      </fieldset>
      <p
        role={failed ? "alert" : "status"}
        className={failed ? "form-error" : "claim-feedback"}
      >
        {message}
      </p>
    </form>
  );
}

export function MfaForm() {
  const [factor, setFactor] = useState(""),
    [secret, setSecret] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function begin() {
    setBusy(true);
    setMessage("");
    try {
      const reply = await submit("/api/account", { action: "enroll-mfa" });
      setFactor(reply.factorId || "");
      setSecret(reply.secret || "");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to set up MFA.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="claim-card">
      <h2>Verify your reviewer session</h2>
      <p>
        Reviews require an authenticator code, in addition to email sign-in.
      </p>
      {!factor ? (
        <button className="button-primary" onClick={begin} disabled={busy}>
          {busy ? "Working…" : "Continue with authenticator"}
        </button>
      ) : (
        <>
          {secret && (
            <p>
              Add a time-based account in your authenticator app using this
              setup key. Keep it private:{" "}
              <code className="claim-secret">{secret}</code>
            </p>
          )}
          <ClaimForm
            endpoint="/api/account"
            action="verify-mfa"
            initial={{ factor_id: factor }}
            label="Verify authenticator"
          >
            <label>
              Six-digit authenticator code
              <input
                className="field-input"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
            </label>
          </ClaimForm>
        </>
      )}
      <p role="alert" className="form-error">
        {message}
      </p>
    </section>
  );
}

export function BusinessEditor({ profile }: { profile: BusinessProfile }) {
  return (
    <ClaimForm
      action="save-profile"
      initial={{
        license_id: profile.license_id,
        updated_at: profile.updated_at,
      }}
      label="Save public business details"
    >
      <label>
        About your business
        <textarea
          className="field-input"
          name="description"
          maxLength={2000}
          rows={6}
          defaultValue={profile.description}
        />
      </label>
      <label>
        Business website (HTTPS)
        <input
          className="field-input"
          name="website"
          type="url"
          maxLength={500}
          placeholder="https://example.com"
          defaultValue={profile.website}
        />
      </label>
      <div className="claim-fields">
        <label>
          Public customer phone
          <input
            className="field-input"
            name="contact_phone"
            type="tel"
            maxLength={40}
            defaultValue={profile.contact_phone}
          />
        </label>
        <label>
          Public customer email
          <input
            className="field-input"
            name="contact_email"
            type="email"
            maxLength={254}
            defaultValue={profile.contact_email}
          />
        </label>
      </div>
      <label>
        Business hours
        <textarea
          className="field-input"
          name="hours"
          rows={3}
          maxLength={500}
          defaultValue={profile.hours}
        />
      </label>
      <label>
        Service areas (self-reported)
        <textarea
          className="field-input"
          name="service_areas"
          rows={3}
          maxLength={1000}
          defaultValue={profile.service_areas}
        />
      </label>
      <p>
        Leave optional fields blank to remove them. Service areas do not change
        nearby-search coordinates, which use registered business addresses.
      </p>
      <label className="claim-check">
        <input type="checkbox" name="public_consent" required /> These details
        are accurate, appropriate for public display, and I am authorized to
        publish them. I will not include sensitive personal information or
        misleading license or insurance claims.
      </label>
    </ClaimForm>
  );
}

export function ReviewForm({ claim }: { claim: Claim }) {
  return (
    <ClaimForm
      action="review"
      initial={{
        claim_id: claim.id,
        expected_status: claim.status,
        updated_at: claim.updated_at,
      }}
      label="Record review decision"
    >
      <label>
        Decision
        <select className="field-input" name="status" required defaultValue="">
          <option value="" disabled>
            Select a decision
          </option>
          {claim.status === "pending" ? (
            <>
              <option value="approved">
                Approve independently verified authority
              </option>
              <option value="denied">Deny claim</option>
            </>
          ) : (
            <option value="revoked">Revoke management access</option>
          )}
        </select>
      </label>
      {claim.status === "pending" && (
        <label>
          Verification method (required for approval)
          <select
            className="field-input"
            name="verification_method"
            defaultValue=""
          >
            <option value="">Not verified / denying</option>
            <option value="cslb_phone">
              Called the number independently obtained from CSLB
            </option>
            <option value="independent_business_contact">
              Other independently established business contact
            </option>
          </select>
        </label>
      )}
      <label>
        Private verification evidence / decision reason
        <textarea
          className="field-input"
          name="review_note"
          minLength={20}
          maxLength={2000}
          rows={4}
          required
          placeholder="Record when, how, and with whom authority was confirmed, or the reason for denial/revocation. No passwords, government IDs, or financial documents."
        />
      </label>
      <label className="claim-check">
        <input type="checkbox" name="confirmed" required /> I independently
        reviewed this request. An email code, public license number,
        applicant-provided phone, or website alone is not proof of authority.
        For revocation, I have reviewed the dispute and notified the affected
        business as appropriate.
      </label>
    </ClaimForm>
  );
}
