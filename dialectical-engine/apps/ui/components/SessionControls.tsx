"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ContractClient, SessionSummary } from "@debateai/contract";
import { contractClient } from "../lib/api.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import settingsEnglish from "../messages/en/settings.json";
import { clearStoredSupportConversation } from "./support/conversation.js";

export type SessionControlClient = Pick<ContractClient,
  "listSessions" | "logout" | "revokeSession" | "revokeAllSessions" | "stepUp"
>;

export interface SessionControlsProps {
  readonly client?: SessionControlClient;
  readonly onSessionEnded?: () => void;
  readonly catalog?: MessageCatalog;
  readonly locale?: LocaleCode;
}

/* The server stores only a hash of the user agent (binding_context.user_agent_hash),
   so no session row carries a device name. The current session is the exception:
   it is this browser, so its device can be named from the client directly.
   Other sessions have no honest source and stay unnamed. */
type UADataBrand = { readonly brand: string; readonly version: string };
type UAData = { readonly platform?: string; readonly brands?: readonly UADataBrand[] };

function currentDeviceLabel(): string | null {
  if (typeof navigator === "undefined") return null;
  const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  const ua = navigator.userAgent;

  const platform =
    uaData?.platform && uaData.platform.length > 0
      ? uaData.platform
      : /iPhone/.test(ua) ? "iPhone"
      : /iPad/.test(ua) ? "iPad"
      : /Android/.test(ua) ? "Android"
      : /Macintosh|Mac OS X/.test(ua) ? "Mac"
      : /Windows/.test(ua) ? "Windows"
      : /Linux/.test(ua) ? "Linux"
      : null;

  const branded = (uaData?.brands ?? []).find(
    (b) => !/Not.?A.?Brand/i.test(b.brand) && b.brand !== "Chromium"
  );
  const browser =
    branded?.brand
      ?? (/Edg\//.test(ua) ? "Edge"
      : /OPR\//.test(ua) ? "Opera"
      : /Firefox\//.test(ua) ? "Firefox"
      : /Chrome\//.test(ua) ? "Chrome"
      : /Safari\//.test(ua) ? "Safari"
      : null);

  const parts = [platform, browser].filter((p): p is string => p !== null && p.length > 0);
  return parts.length === 0 ? null : parts.join(" · ");
}

function describeFailure(failure: unknown, catalog: MessageCatalog): string {
  return failure instanceof Error ? failure.message : t(catalog, "settings.sessions.operationFailed");
}

export function SessionControls({
  client = contractClient,
  onSessionEnded,
  catalog = settingsEnglish,
  locale = "en"
}: SessionControlsProps) {
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepUpComplete, setStepUpComplete] = useState(false);
  // Read after mount: navigator is absent during SSR, and reading it in render
  // would desynchronise the server and client markup.
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  useEffect(() => { setDeviceLabel(currentDeviceLabel()); }, []);
  const finishSession = () => {
    // DL3-F3: the support widget's transcript is tab-scoped, so without this it
    // outlived the account that produced it — the next person to sign in on this
    // browser opened Help and read the previous person's support conversation.
    clearStoredSupportConversation();
    if (onSessionEnded !== undefined) onSessionEnded();
    else if (typeof window !== "undefined") window.location.assign("/settings");
  };

  async function refresh(): Promise<void> {
    const result = await client.listSessions();
    setSessions(result.sessions);
  }

  useEffect(() => {
    let active = true;
    void client.listSessions().then(
      (result) => { if (active) { setSessions(result.sessions); setError(null); } },
      (failure) => { if (active) setError(describeFailure(failure, catalog)); }
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [catalog, client]);

  async function revoke(session: SessionSummary): Promise<void> {
    setBusy(session.session_id);
    setError(null);
    try {
      await client.revokeSession(session.session_id);
      if (session.current) finishSession();
      else await refresh();
    } catch (failure) {
      setError(describeFailure(failure, catalog));
    } finally {
      setBusy(null);
    }
  }

  async function revokeAll(): Promise<void> {
    setBusy("all");
    setError(null);
    try {
      await client.revokeAllSessions();
      setSessions([]);
      finishSession();
    } catch (failure) {
      setError(describeFailure(failure, catalog));
    } finally {
      setBusy(null);
    }
  }

  async function logout(): Promise<void> {
    setBusy("logout");
    setError(null);
    try {
      await client.logout();
      setSessions([]);
      finishSession();
    } catch (failure) {
      setError(describeFailure(failure, catalog));
    } finally {
      setBusy(null);
    }
  }

  async function stepUp(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("step-up");
    setError(null);
    setStepUpComplete(false);
    try {
      await client.stepUp(
        String(data.get("step-up-password") ?? ""),
        String(data.get("step-up-code") ?? "")
      );
      setStepUpComplete(true);
      form.reset();
      await refresh();
    } catch (failure) {
      setError(describeFailure(failure, catalog));
    } finally {
      setBusy(null);
    }
  }

  /* A session id is a uuid — unreadable, and useless for deciding what to
     revoke. Every row therefore leads with something a person can actually
     recognise: the current session names this device, and the others name when
     they were signed in. The id stays on the revoke control's accessible name
     so the action is still unambiguous to assistive tech and to tests. */
  const signedInOn = (iso: string): string =>
    t(catalog, "settings.sessions.signedIn", {
      date: formatDate(locale, iso, { day: "numeric", month: "long", year: "numeric" })
    });

  return (
    <>
      <section aria-labelledby="active-sessions-heading">
        <div className="setSectionHead">
          <h2 className="setSectionTitle" id="active-sessions-heading">
            {t(catalog, "settings.sessions.title")}
          </h2>
          <p className="setSectionHint">{t(catalog, "settings.sessions.hint")}</p>
        </div>
        <div className="setList">
          {loading ? <p className="setStatus">{t(catalog, "settings.sessions.loading")}</p> : null}
          {error ? <div className="setError" role="alert">{error}</div> : null}
          {!loading && sessions.length === 0 ? (
            <p className="setStatus">{t(catalog, "settings.sessions.none")}</p>
          ) : null}
          {sessions.map((session) => (
            <div className="setSessionRow" key={session.session_id}>
              <span className="setDot" data-state={session.current ? "current" : undefined} aria-hidden="true" />
              <div className="setSessionMain">
                <div className="setSessionLine">
                  <span className="setSessionDevice">
                    {session.current
                      ? deviceLabel ?? t(catalog, "settings.sessions.current")
                      : signedInOn(session.created_at)}
                  </span>
                  <span className="setSessionName">
                    {session.current
                      ? t(catalog, "settings.sessions.current")
                      : t(catalog, "settings.sessions.other")}
                  </span>
                </div>
                <p className="setSessionSeen">
                  {t(catalog, "settings.sessions.lastSeen", {
                    date: formatDate(locale, session.last_seen_at, {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })
                  })}
                </p>
              </div>
              <button
                type="button"
                className="setBtn setBtnRevoke"
                disabled={busy !== null}
                aria-label={t(catalog, "settings.sessions.revokeLabel", {
                  sessionId: session.session_id
                })}
                onClick={() => { void revoke(session); }}
              >
                {t(catalog, "settings.sessions.revoke")}
              </button>
            </div>
          ))}
          <div className="setListActions">
            <button
              type="button"
              className="setBtn setBtnQuiet"
              disabled={busy !== null}
              onClick={() => { void revokeAll(); }}
            >
              {t(catalog, "settings.sessions.revokeAll")}
            </button>
            <button
              type="button"
              className="setBtn setBtnQuiet"
              disabled={busy !== null}
              onClick={() => { void logout(); }}
            >
              {t(catalog, "settings.sessions.signOut")}
            </button>
          </div>
        </div>
      </section>

      <form className="setCard" data-session-step-up="true" onSubmit={stepUp}>
        <h3 className="setCardTitle">{t(catalog, "settings.sessions.freshAuthentication")}</h3>
        <p className="setCardHint">{t(catalog, "settings.sessions.freshAuthenticationHint")}</p>
        <div className="setCardRow">
          <div className="setField">
            <label htmlFor="step-up-password">{t(catalog, "settings.password")}</label>
            <input
              id="step-up-password"
              name="step-up-password"
              type="password"
              autoComplete="current-password"
              placeholder={t(catalog, "settings.password")}
              required
            />
          </div>
          <div className="setField">
            <label htmlFor="step-up-code">{t(catalog, "settings.authenticatorCode")}</label>
            <input
              id="step-up-code"
              name="step-up-code"
              autoComplete="one-time-code"
              placeholder={t(catalog, "settings.authenticatorCode")}
              required
            />
          </div>
          <button type="submit" className="setBtn setBtnPrimary" disabled={busy !== null}>
            {t(catalog, "settings.sessions.verify")}
          </button>
        </div>
        {stepUpComplete ? (
          <p className="setStatus" role="status">
            {t(catalog, "settings.sessions.freshAuthenticationComplete")}
          </p>
        ) : null}
      </form>
    </>
  );
}
