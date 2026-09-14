import { resolveSafeTemplate } from "./registry/index.js";

export const CAUSE_CHAIN_MAX_CODES = 8 as const;
export const CAUSE_CODE_MAX_LENGTH = 64 as const;
export const CAUSE_CODE_UNAVAILABLE = "CAUSE_CODE_UNAVAILABLE";
export const CAUSE_PARENT_NOT_CAPTURED =
  "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED";
export const CAUSE_RELATION_WRAPS = "WRAPS";
export const EMPTY_CAUSE_CHAIN_CODES = Object.freeze([]) as readonly [];

type OwnDataRead =
  | Readonly<{ readonly kind: "value"; readonly value: unknown }>
  | Readonly<{ readonly kind: "missing" }>
  | Readonly<{ readonly kind: "unavailable" }>;

const MISSING = Object.freeze({ kind: "missing" }) as OwnDataRead;
const UNAVAILABLE = Object.freeze({ kind: "unavailable" }) as OwnDataRead;

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null)
    || typeof value === "function";
}

function readOwnData(value: unknown, key: "code" | "cause" | "error"): OwnDataRead {
  if (!isObjectLike(value)) return UNAVAILABLE;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return MISSING;
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      return UNAVAILABLE;
    }
    return Object.freeze({ kind: "value", value: descriptor.value });
  } catch {
    return UNAVAILABLE;
  }
}

function isRegisteredCode(value: unknown): value is string {
  if (typeof value !== "string" || value.length > CAUSE_CODE_MAX_LENGTH) {
    return false;
  }
  try {
    return resolveSafeTemplate(value) !== undefined;
  } catch {
    return false;
  }
}

function isAllowedCauseCode(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= CAUSE_CODE_MAX_LENGTH
    && (value === "3D000"
      || value === CAUSE_CODE_UNAVAILABLE
      || isRegisteredCode(value));
}

function frozen(codes: readonly string[]): readonly string[] {
  return codes.length === 0
    ? EMPTY_CAUSE_CHAIN_CODES
    : Object.freeze([...codes]);
}

function finishUnavailable(codes: string[]): readonly string[] {
  if (codes.length < CAUSE_CHAIN_MAX_CODES) {
    codes.push(CAUSE_CODE_UNAVAILABLE);
  } else {
    codes[CAUSE_CHAIN_MAX_CODES - 1] = CAUSE_CODE_UNAVAILABLE;
  }
  return frozen(codes);
}

function snapshotFromWrapper(
  wrapperCode: string,
  error: unknown,
  firstCode?: string,
): readonly string[] {
  const codes = [wrapperCode];
  if (error === undefined || error === null) return frozen(codes);
  if (!isObjectLike(error)) return finishUnavailable(codes);

  const seen = new Set<object>();
  let cursor: unknown = error;
  let prefetchedCode: string | undefined = firstCode;

  while (cursor !== undefined && cursor !== null) {
    if (!isObjectLike(cursor) || seen.has(cursor)) {
      return finishUnavailable(codes);
    }
    seen.add(cursor);

    const codeRead = prefetchedCode === undefined
      ? readOwnData(cursor, "code")
      : Object.freeze({ kind: "value", value: prefetchedCode } as const);
    prefetchedCode = undefined;
    if (codeRead.kind !== "value" || !isAllowedCauseCode(codeRead.value)) {
      return finishUnavailable(codes);
    }
    const code = codeRead.value;
    if (code === CAUSE_CODE_UNAVAILABLE) {
      return finishUnavailable(codes);
    }
    if (!(codes.length === 1 && code === wrapperCode)) {
      if (codes.length >= CAUSE_CHAIN_MAX_CODES) {
        return finishUnavailable(codes);
      }
      codes.push(code);
    }

    const causeRead = readOwnData(cursor, "cause");
    if (causeRead.kind === "missing") return frozen(codes);
    if (causeRead.kind === "unavailable") return finishUnavailable(codes);
    if (causeRead.value === undefined || causeRead.value === null) {
      return frozen(codes);
    }
    if (codes.length >= CAUSE_CHAIN_MAX_CODES) {
      return finishUnavailable(codes);
    }
    cursor = causeRead.value;
  }

  return frozen(codes);
}

export function snapshotEmittedCause(input: unknown): readonly string[] {
  const wrapperRead = readOwnData(input, "code");
  if (wrapperRead.kind !== "value" || !isRegisteredCode(wrapperRead.value)) {
    return EMPTY_CAUSE_CHAIN_CODES;
  }
  const errorRead = readOwnData(input, "error");
  if (errorRead.kind === "missing") return EMPTY_CAUSE_CHAIN_CODES;
  if (errorRead.kind === "unavailable") {
    return frozen([wrapperRead.value, CAUSE_CODE_UNAVAILABLE]);
  }
  return snapshotFromWrapper(wrapperRead.value, errorRead.value);
}

export function snapshotHandledCause(
  error: unknown,
  context: unknown,
): readonly string[] {
  const contextCode = readOwnData(context, "code");
  if (contextCode.kind === "value" && isRegisteredCode(contextCode.value)) {
    return snapshotFromWrapper(contextCode.value, error);
  }

  const errorCode = readOwnData(error, "code");
  if (errorCode.kind !== "value" || !isRegisteredCode(errorCode.value)) {
    return EMPTY_CAUSE_CHAIN_CODES;
  }
  return snapshotFromWrapper(errorCode.value, error, errorCode.value);
}

function inspectCodes(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    return undefined;
  }
  if (
    lengthDescriptor === undefined
    || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value")
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > CAUSE_CHAIN_MAX_CODES
  ) {
    return undefined;
  }

  const codes: string[] = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    } catch {
      return undefined;
    }
    if (
      descriptor === undefined
      || !Object.prototype.hasOwnProperty.call(descriptor, "value")
      || !isAllowedCauseCode(descriptor.value)
      || (descriptor.value === CAUSE_CODE_UNAVAILABLE
        && index !== lengthDescriptor.value - 1)
    ) {
      return undefined;
    }
    codes.push(descriptor.value);
  }
  return codes;
}

export function projectCauseChainCodes(
  value: unknown,
  wrapperCode: string,
): readonly string[] {
  const codes = inspectCodes(value);
  if (
    codes === undefined
    || codes.length < 2
    || !isRegisteredCode(wrapperCode)
    || codes[0] !== wrapperCode
  ) {
    return EMPTY_CAUSE_CHAIN_CODES;
  }
  return frozen(codes);
}

export function causeChainWrapperCode(value: unknown): string | undefined {
  const codes = inspectCodes(value);
  const wrapperCode = codes?.[0];
  return isRegisteredCode(wrapperCode) ? wrapperCode : undefined;
}

export function isProjectedCauseChainCodes(
  value: unknown,
  wrapperCode: string,
): value is readonly string[] {
  const codes = inspectCodes(value);
  if (codes === undefined) return false;
  if (codes.length === 0) return true;
  return codes.length >= 2
    && isRegisteredCode(wrapperCode)
    && codes[0] === wrapperCode;
}
