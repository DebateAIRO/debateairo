export const PENDING_EXPORT_KEY = "debateai.exportPending";
export const EXPORT_LINK_OUTCOME_KEY = "debateai.exportLinkOutcome";
export type ExportLinkOutcome = "downloaded" | "invalid" | "incomplete" | "wrongAccount";

export function stashPendingExport(token: string): void {
  try {
    window.sessionStorage.removeItem(EXPORT_LINK_OUTCOME_KEY);
    window.sessionStorage.setItem(PENDING_EXPORT_KEY, token);
  } catch {}
}

export function readPendingExport(): string | null {
  try { return window.sessionStorage.getItem(PENDING_EXPORT_KEY); } catch { return null; }
}

export function clearPendingExport(): void {
  try {
    window.sessionStorage.removeItem(PENDING_EXPORT_KEY);
    window.sessionStorage.removeItem(EXPORT_LINK_OUTCOME_KEY);
  } catch {}
}

export function rememberExportLinkOutcome(outcome: ExportLinkOutcome): void {
  try { window.sessionStorage.setItem(EXPORT_LINK_OUTCOME_KEY, outcome); } catch {}
}

export function readExportLinkOutcome(): ExportLinkOutcome | null {
  try {
    const outcome = window.sessionStorage.getItem(EXPORT_LINK_OUTCOME_KEY);
    return outcome === "downloaded" || outcome === "invalid" || outcome === "incomplete" || outcome === "wrongAccount" ? outcome : null;
  } catch { return null; }
}
