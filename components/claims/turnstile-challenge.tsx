"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

export function TurnstileChallenge({
  siteKey,
  onToken,
  onError,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (!ready || !container.current || !api) return;
    let active = true;
    const id = api.render(container.current, {
      sitekey: siteKey,
      callback: (token: string) => { if (active) onToken(token); },
      "expired-callback": () => { if (active) onToken(""); },
      "error-callback": () => {
        if (!active) return;
        onToken("");
        onError("The security challenge could not load. Reload the page and try again.");
      },
    });
    return () => {
      // Ignore late callbacks before removing the iframe. A completed email
      // request must not restart a hidden challenge over the code-entry step.
      active = false;
      api.remove(id);
    };
  }, [ready, siteKey, onToken, onError]);

  return (
    <>
      <div ref={container} />
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => { if (mounted.current) setReady(true); }}
        onError={() => {
          if (mounted.current)
            onError("Unable to load sign-in protection. Please reload.");
        }}
      />
    </>
  );
}
