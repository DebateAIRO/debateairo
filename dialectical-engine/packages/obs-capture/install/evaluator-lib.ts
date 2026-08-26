const EVALUATOR_CONTEXT = Object.freeze({
  runtime: "evaluator_lib" as const,
  boundary: "exported_function" as const,
});

/** Total library-boundary seam; the core is loaded only when a failure is captured. */
export function captureEvaluatorLibraryFailure(error: unknown): void {
  void import("@debateai/obs-capture")
    .then(({ captureHandled }) => captureHandled(error, EVALUATOR_CONTEXT))
    .catch(() => undefined);
}
