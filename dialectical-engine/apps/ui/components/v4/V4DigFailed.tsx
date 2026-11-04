"use client";

import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { DigRetry } from "@/lib/v4/digRetry";
import { sayNothingTaken } from "@/lib/v4/failedRun";
import type { DigView } from "@/lib/v4/types";

/*
 * Owner review 3 Nov 2026 (wait-f18, dig-f12): what a dig that did not finish says in its panel, under "This dig didn't
 * finish.": its plain reason sentence (the same fixed sentences as the failed page), "Nothing was taken from your quota
 * for this." only when the server confirms it, then the way on. [Try this dig again] digs the same picks with the same
 * Quick/Thorough choice through the usual 10-second Undo note (lib/v4/digRetry.ts). After a second failure of the same dig:
 * "This keeps failing. Write your report; it uses everything that finished." ("Write my report" stays in the rail and the
 * header, never beside a dig button.) A dig already tried again shows no second button here.
 */

export type V4FailedDigs = Readonly<{
  /** What this failed dig's panel offers. */
  retryOf: (dig: DigView) => DigRetry;
  /** Starts the retry (the page's usual Undo window). */
  onRetry: (dig: DigView) => void;
  /** The plain sentence for a run's stored reason (the page's `home` catalogue reads it). */
  reasonText: (reason: string | null | undefined) => string;
}>;

export function V4DigFailed({ dig, failed, digBusy, catalog }: Readonly<{
  dig: DigView;
  failed: V4FailedDigs;
  /** Another dig is in its Undo window or being sent: the button waits. */
  digBusy: boolean;
  catalog: MessageCatalog;
}>) {
  if (dig.state !== "FAILED") return null;
  const retry = failed.retryOf(dig);
  // A dig whose run could not be read has no reason of its own: the fixed "stopped partway" sentence is not said for it.
  const reason = dig.terminalReason === undefined ? null : failed.reasonText(dig.terminalReason);
  return (
    <div className="v4DigFailed">
      {reason === null ? null : <p className="v4PanelText">{reason}</p>}
      {sayNothingTaken(dig.terminalReason, dig.quotaUntouched === true)
        ? <p className="v4PanelText">{t(catalog, "v4.digFailed.nothingTaken")}</p>
        : null}
      {retry.kind === "OFFER" ? (
        <button type="button" className="v4Btn v4BtnPrimary v4DigFailedRetry" disabled={digBusy} onClick={() => failed.onRetry(dig)}>
          {t(catalog, "v4.digFailed.retry")}
        </button>
      ) : null}
      {retry.kind === "KEEPS_FAILING" ? <p className="v4PanelText v4DigFailedAgain">{t(catalog, "v4.digFailed.keepsFailing")}</p> : null}
    </div>
  );
}
