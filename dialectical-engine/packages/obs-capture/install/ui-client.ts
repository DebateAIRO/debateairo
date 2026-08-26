const UI_CLIENT_CONTEXT = Object.freeze({
  runtime: "ui_client" as const,
  boundary: "client_report" as const,
});

/** Total UI-client seam; the core is loaded only when a failure is captured. */
export function captureUiClientFailure(error: unknown): void {
  void import("@debateai/obs-capture")
    .then(({ captureHandled }) => captureHandled(error, UI_CLIENT_CONTEXT))
    .catch(() => undefined);
}
