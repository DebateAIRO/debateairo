export class ObservationError extends Error {
  readonly code: string;

  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "ObservationError";
    this.code = code;
  }
}

function errorCode(error: unknown): string | null {
  if (error === null || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "ECONNREFUSED"
    || code === "ENOTFOUND"
    || code === "ETIMEDOUT"
    || code === "57P01"
    || code === "57P03"
    || (code !== null && /^08[0-9A-Z]{3}$/u.test(code));
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
