export const PENDING_EXPORT_KEY = "debateai.exportPending";

export function stashPendingExport(token: string): void {
  try { window.sessionStorage.setItem(PENDING_EXPORT_KEY, token); } catch {}
}

export function readPendingExport(): string | null {
  try { return window.sessionStorage.getItem(PENDING_EXPORT_KEY); } catch { return null; }
}

export function clearPendingExport(): void {
  try { window.sessionStorage.removeItem(PENDING_EXPORT_KEY); } catch {}
}
