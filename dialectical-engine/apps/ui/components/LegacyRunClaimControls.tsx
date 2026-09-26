"use client";

import { useState, type FormEvent } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import type { LocaleCode } from "@/lib/i18n/locales";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import settingsEnglish from "@/messages/en/settings.json";

type LegacyRunClaimClient = Pick<ContractClient, "claimLegacyRuns">;

function failureMessage(failure: unknown, catalog: MessageCatalog): string {
  if (failure instanceof ContractHttpError && failure.code === "SESSION_REQUIRED") {
    return t(catalog, "settings.legacy.sessionExpired");
  }
  return t(catalog, "settings.legacy.claimFailed");
}

export function LegacyRunClaimControls({
  client = contractClient,
  catalog = settingsEnglish,
  locale = "en"
}: Readonly<{
  client?: LegacyRunClaimClient;
  catalog?: MessageCatalog;
  locale?: LocaleCode;
}>) {
  const [legacyToken, setLegacyToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function claim(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || legacyToken.length === 0) return;
    const submittedToken = legacyToken;
    setLegacyToken("");
    setBusy(true);
    setMessage(null);
    try {
      const result = await client.claimLegacyRuns(submittedToken);
      setMessage(result.status === "CLAIMED"
        ? tPlural(catalog, "settings.legacy.claimed", result.claimed_count, locale)
        : t(catalog, "settings.legacy.noneMatched"));
    } catch (failure) {
      setMessage(failureMessage(failure, catalog));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="setCard" aria-labelledby="legacy-run-claim-heading" onSubmit={(event) => void claim(event)}>
      <h2 className="setCardTitle" id="legacy-run-claim-heading">
        {t(catalog, "settings.legacy.title")}
      </h2>
      <p className="setCardHint">
        {t(catalog, "settings.legacy.hint")}
      </p>
      <div className="setCardRow">
        <div className="setField setFieldMono">
          <label htmlFor="legacy-run-token">{t(catalog, "settings.legacy.token")}</label>
          <input
            id="legacy-run-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={t(catalog, "settings.legacy.token")}
            value={legacyToken}
            onChange={(event) => setLegacyToken(event.target.value)}
            required
          />
        </div>
        <button type="submit" className="setBtn" disabled={busy || legacyToken.length === 0}>
          {busy ? t(catalog, "settings.legacy.claiming") : t(catalog, "settings.legacy.claim")}
        </button>
      </div>
      {message ? <p className="setStatus" role="status">{message}</p> : null}
    </form>
  );
}
