"use client";

import { useSyncExternalStore } from "react";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";
import { newerVersionReason, subscribeNewerVersion } from "@/lib/v3/releaseWatch";

/** The server never knows of a newer version: the first paint is always empty, so hydration matches. */
const nothingOnTheServer = () => null;

/**
 * Side-by-side uploads spec 2026-10-21 §7 (plan C13): once this page learns that another version of the site serves
 * (lib/v3/releaseWatch.ts), one small, plain, non-blocking line under the top bar says so — neutrally, "The site was
 * updated." (final fix wave W4: after a way back it is older) — with a Reload button. The
 * page keeps working underneath; nothing is hidden or disabled. Words from the layout's shared catalogue (`chrome`).
 */
export function NewVersionNote() {
  const { catalog } = useChromeI18n();
  const reason = useSyncExternalStore(subscribeNewerVersion, newerVersionReason, nothingOnTheServer);
  if (reason === null) return null;
  return (
    <div className="newVersionNote" role="status">
      <span>
        {reason === "MADE_BY_NEWER"
          ? t(catalog, "chrome.release.madeByNewer")
          : t(catalog, "chrome.release.newerVersion")}
      </span>
      <button type="button" className="newVersionNoteReload" onClick={() => window.location.reload()}>
        {t(catalog, "chrome.release.reload")}
      </button>
    </div>
  );
}
