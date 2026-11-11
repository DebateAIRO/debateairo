"use client";

import { useId, useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { DigRetry } from "@/lib/v4/digRetry";
import { sayNothingTaken } from "@/lib/v4/failedRun";
import type { DigView } from "@/lib/v4/types";

/*
 * Owner review 3 Nov 2026 (wait-f18, dig-f12): what a dig that did not finish says in its panel, under "This dig didn't
 * finish.": its plain reason, said about the dig (the owner's answer to question 3, 5 Nov 2026: one line per reason group,
 * the same as the dig's own failed page), "Nothing was taken from your quota for this." only when the server confirms it
 * (never when some was used, question 20 A), then the way on. [Try this dig again] digs the same picks with the same
 * Quick/Thorough choice through the usual 10-second Undo note (lib/v4/digRetry.ts). After a second failure of the same dig:
 * "This keeps failing. Write your report; it uses everything that finished." ("Write my report" stays in the rail and the
 * header, never beside a dig button.) A dig already tried again shows no second button here, and its reason promises no
 * later try (the owner's third round, 5 Nov: the AIs-unavailable line drops "You can try it again in a while.").
 * V4 start step, Task 57m (owner 8 Nov, "Use these drafts"): a dig whose two continues failed again offers no button and says "This keeps
 * failing. We're looking into it, and a future fix will solve it. You can still write your report; it uses everything that finished."
 */

export type V4FailedDigs = Readonly<{
  /** What this failed dig's panel offers. */
  retryOf: (dig: DigView) => DigRetry;
  /** Starts the retry (the page's usual Undo window). */
  onRetry: (dig: DigView) => void;
  /**
   * The plain line for a dig's stored reason, said about the dig (lib/v4/failedRun.ts digFailureMessage). `keepsFailing`
   * (optional): the same dig keeps failing, so the line promises no later try (the owner's third round, 5 Nov).
   */
  reasonText: (reason: string | null | undefined, keepsFailing?: boolean) => string;
}>;

export function V4DigFailed({ dig, failed, digBusy, rest = null, catalog }: Readonly<{
  dig: DigView;
  failed: V4FailedDigs;
  /** Another dig is in its Undo window or being sent: the button waits. */
  digBusy: boolean;
  /**
   * ACCESS-9 / journey-f14 (the wave-2 checks, 4 Nov): digging rests while the report is written, with this reason. The
   * button stays where it is and focusable (aria-disabled), names the visible line under it, and a press gives that line
   * the shared 1-second highlight again. Null: no rest.
   */
  rest?: string | null;
  catalog: MessageCatalog;
}>) {
  const restId = useId();
  const [replay, setReplay] = useState(0);
  if (dig.state !== "FAILED") return null;
  const retry = failed.retryOf(dig);
  // A dig whose run could not be read has no reason of its own: the fixed "stopped partway" sentence is not said for it.
  // The owner's third round (5 Nov): a dig that keeps failing says its reason without "try it again in a while".
  const reason = dig.terminalReason === undefined ? null : failed.reasonText(dig.terminalReason, retry.kind === "KEEPS_FAILING");
  return (
    <div className="v4DigFailed">
      {reason === null ? null : <p className="v4PanelText">{reason}</p>}
      {sayNothingTaken(dig.terminalReason, dig.quotaUntouched === true)
        ? <p className="v4PanelText">{t(catalog, "v4.digFailed.nothingTaken")}</p>
        : null}
      {retry.kind === "OFFER" ? (
        <button
          type="button"
          className={`v4Btn v4BtnPrimary v4DigFailedRetry${rest === null ? "" : " v4DigWaiting"}`}
          disabled={digBusy && rest === null}
          aria-disabled={rest === null ? undefined : "true"}
          aria-describedby={rest === null ? undefined : restId}
          onClick={() => {
            if (rest !== null) setReplay((count) => count + 1);
            else failed.onRetry(dig);
          }}
        >
          {t(catalog, "v4.digFailed.retry")}
        </button>
      ) : null}
      {retry.kind === "OFFER" && rest !== null ? (
        <p key={replay} id={restId} className={`v4PanelHint v4Muted${replay > 0 ? " v4Highlight" : ""}`} data-dig-rest="">{rest}</p>
      ) : null}
      {retry.kind === "KEEPS_FAILING" ? (
        <p className="v4PanelText v4DigFailedAgain">
          {t(catalog, retry.afterContinues === true ? "v4.digFailed.keepsFailingContinues" : "v4.digFailed.keepsFailing")}
        </p>
      ) : null}
    </div>
  );
}
