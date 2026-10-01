"use client";

import { FormEvent, useEffect, useState } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { checkDob, dobToIso, type DobErrorCode, type DobParts } from "@debateai/kernel";
import { AgeRefusal } from "@/components/AgeRefusal";
import { AuthShell } from "@/components/AuthShell";
import { clearStoredSupportConversation } from "@/components/support/conversation";
import { announceSessionChange } from "@/components/support/sessionChange";
import { DateOfBirthField, EMPTY_DOB } from "@/components/DateOfBirthField";
import { contractClient } from "@/lib/api";
import { resolveDobLocale, type DobLocale } from "@/lib/dob/dobLocale";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { safeReturnPath } from "@/lib/returnPath";
import authEnglish from "@/messages/en/auth.json";

type AgeConfirmationClient = Pick<ContractClient, "confirmAge" | "readAgeConfirmation">;

function continueToDestination(): void {
  window.location.assign(safeReturnPath(new URLSearchParams(window.location.search).get("next")));
}

/**
 * The one-time date-of-birth check for accounts created before the field existed — design
 * document Turn 8 · 8k. The same widget as sign-up and one Confirm button. A pass continues
 * to where the reader was going; a refusal freezes the account and shows the refusal (8j).
 */
export function AgeConfirmationFlow({
  catalog = authEnglish,
  client = contractClient,
  dobLocale = resolveDobLocale("en"),
  refused: refusedOnArrival = false,
  onConfirmed = continueToDestination,
  onSignedOut = () => window.location.replace("/login")
}: Readonly<{
  catalog?: MessageCatalog;
  client?: AgeConfirmationClient;
  dobLocale?: DobLocale;
  refused?: boolean;
  onConfirmed?: () => void;
  onSignedOut?: () => void;
}>) {
  const [dateOfBirth, setDateOfBirth] = useState<DobParts>(EMPTY_DOB);
  const [dateOfBirthError, setDateOfBirthError] = useState<DobErrorCode | null>(null);
  const [refused, setRefused] = useState(refusedOnArrival);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Arriving here without owing the check (already confirmed, or signed out) moves on. */
  useEffect(() => {
    if (refusedOnArrival) return undefined;
    let active = true;
    client.readAgeConfirmation().then(
      (status) => { if (active && status.status === "confirmed") onConfirmed(); },
      (failure: unknown) => {
        if (active && failure instanceof ContractHttpError && failure.status === 401) onSignedOut();
      }
    );
    return () => { active = false; };
  }, [client, onConfirmed, onSignedOut, refusedOnArrival]);

  async function confirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const check = checkDob(dateOfBirth);
    if (check.code !== "ok") {
      setDateOfBirthError(check.code);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await client.confirmAge(dobToIso(dateOfBirth));
      if (result.outcome === "refused") {
        // The refusal revokes every session of the account (E7, D-S04-19): the help-chat transcript goes, here and in
        // every other tab of this browser (S04-R01).
        clearStoredSupportConversation();
        announceSessionChange();
        setRefused(true);
        return;
      }
      onConfirmed();
    } catch {
      setError(t(catalog, "auth.ageCheck.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (refused) return <AgeRefusal catalog={catalog} />;

  return (
    <AuthShell
      eyebrow={t(catalog, "auth.ageCheck.eyebrow")}
      title={t(catalog, "auth.ageCheck.title")}
      description={t(catalog, "auth.ageCheck.description")}
      footer={null}
    >
      {error ? <div className="authAlert" role="alert">{error}</div> : null}
      <form className="authForm" data-form="age-confirmation" aria-busy={busy} onSubmit={confirm}>
        <div className="authField">
          <DateOfBirthField
            catalog={catalog}
            locale={dobLocale}
            value={dateOfBirth}
            error={dateOfBirthError}
            onChange={(next) => {
              setDateOfBirth(next);
              setDateOfBirthError(null);
            }}
            disabled={busy}
          />
        </div>
        <button className="authPrimary" type="submit" disabled={busy}>
          {busy ? t(catalog, "auth.login.checking") : t(catalog, "auth.ageCheck.confirm")}
        </button>
      </form>
    </AuthShell>
  );
}
