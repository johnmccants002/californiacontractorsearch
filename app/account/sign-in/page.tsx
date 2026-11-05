import { SignInForm } from "@/components/claims/forms";
import { safeNext } from "@/lib/claims/validation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNext((await searchParams).next);
  return (
    <>
      <p className="eyebrow">BUSINESS ACCESS / FREE</p>
      <h1>Your business. Your profile.</h1>
      <p>
        Sign in with a code sent to your email. No password needed. Verifying
        your email creates an account; business authority is reviewed separately
        before editing is enabled.
      </p>
      <section className="claim-card claim-narrow">
        <h2>Sign in or create an account</h2>
        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
          <SignInForm
            next={next}
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        ) : (
          <p>Sign-in is still being configured. Please check back later.</p>
        )}
        <p>
          We use your email for sign-in and claim updates. It is not published
          unless you separately add it as a public customer-contact email.
        </p>
      </section>
    </>
  );
}
