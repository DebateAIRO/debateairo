"use client";
import { useEffect, useRef } from "react";
import { loadTurnstile, turnstileLanguage, validTurnstilePublicConfig, type TurnstileAction, type TurnstileBrowserApi } from "@/lib/turnstile";

export type TurnstileChallengeProps = Readonly<{
  siteKey: string; action: TurnstileAction; locale: string; nonce: string;
  /** Increment after every submit attempt: Siteverify consumes proofs even on refusal. */
  resetKey: string | number;
  onToken(token: string | null): void;
  onError(): void;
}>;
export function TurnstileChallenge({ siteKey, action, locale, nonce, resetKey, onToken, onError }: TurnstileChallengeProps) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileBrowserApi; id: string } | null>(null);
  const callbacks = useRef({ onToken, onError }); callbacks.current = { onToken, onError };
  const previousReset = useRef(resetKey);
  const language = turnstileLanguage(locale);
  useEffect(() => {
    let active = true;
    callbacks.current.onToken(null);
    const fail = () => { if (active) { callbacks.current.onToken(null); callbacks.current.onError(); } };
    if (!validTurnstilePublicConfig({ siteKey, nonce })) { fail(); return; }
    loadTurnstile(nonce).then(api => {
      if (!active || !container.current) return;
      try {
        const id = api.render(container.current, {
          sitekey: siteKey, action, language, appearance: "interaction-only", execution: "render", size: "flexible", "response-field": false,
          callback: token => { if (!active) return; if (typeof token !== "string" || token.length < 1 || token.length > 2048 || !/\S/u.test(token)) { fail(); return; } callbacks.current.onToken(token); },
          "expired-callback": () => { if (active) callbacks.current.onToken(null); },
          "timeout-callback": fail, "error-callback": fail
        });
        widget.current = { api, id };
      } catch { fail(); }
    }).catch(fail);
    return () => {
      active = false;
      const current = widget.current; widget.current = null;
      if (current) { try { current.api.remove(current.id); } catch { /* SDK teardown never retains proof. */ } }
      callbacks.current.onToken(null);
    };
  }, [siteKey, action, language, nonce]);
  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    callbacks.current.onToken(null);
    const current = widget.current;
    if (current) { try { current.api.reset(current.id); } catch { callbacks.current.onError(); } }
  }, [resetKey]);
  return <div ref={container} data-turnstile-challenge={action} style={{ width: "100%", minWidth: 300 }} />;
}
