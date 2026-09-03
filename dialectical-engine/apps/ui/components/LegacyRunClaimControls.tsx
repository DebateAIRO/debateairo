"use client";

import { useState, type FormEvent } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";

type LegacyRunClaimClient = Pick<ContractClient, "claimLegacyRuns">;

function failureMessage(failure: unknown): string {
  if (failure instanceof ContractHttpError && failure.code === "SESSION_REQUIRED") {
    return "Your session expired. Sign in again before claiming legacy debates.";
  }
  return "Legacy debates could not be claimed. Check the old token and try again.";
}

export function LegacyRunClaimControls({
  client = contractClient
}: { readonly client?: LegacyRunClaimClient }) {
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
        ? `${result.claimed_count} legacy ${result.claimed_count === 1 ? "debate" : "debates"} added to this account.`
        : "No unclaimed legacy debates matched that token.");
    } catch (failure) {
      setMessage(failureMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="setCard" aria-labelledby="legacy-run-claim-heading" onSubmit={(event) => void claim(event)}>
      <h2 className="setCardTitle" id="legacy-run-claim-heading">Claim legacy debates</h2>
      <p className="setCardHint">
        If you created debates before account sign-in was introduced, enter that old access token once to attach only
        its unclaimed debates to this account. The token is not saved by this browser or the server.
      </p>
      <div className="setCardRow">
        <div className="setField setFieldMono">
          <label htmlFor="legacy-run-token">Old debate access token</label>
          <input
            id="legacy-run-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Old debate access token"
            value={legacyToken}
            onChange={(event) => setLegacyToken(event.target.value)}
            required
          />
        </div>
        <button type="submit" className="setBtn" disabled={busy || legacyToken.length === 0}>
          {busy ? "Claiming…" : "Claim legacy debates"}
        </button>
      </div>
      {message ? <p className="setStatus" role="status">{message}</p> : null}
    </form>
  );
}
