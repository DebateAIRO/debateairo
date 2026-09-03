export class ObservationError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "ObservationError";
    this.code = code;
  }
}

export function normalizeObservationError(error: unknown): string {
  if (error instanceof ObservationError && /^OBSERVATION_[A-Z0-9_]+$/u.test(error.code)) {
    return error.code;
  }
  if (error instanceof Error) {
    const match = /\bOBSERVATION_[A-Z0-9_]+\b/u.exec(error.message);
    if (match !== null) return match[0];
  }
  return "OBSERVATION_INTERNAL_ERROR";
}
