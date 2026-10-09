// packages/payments-netopia/src/json.ts

/**
 * JSON.parse keeping every number as its exact SOURCE TEXT (the reviver's `context.source`), so "24.20" reaches the money
 * parser as written and an ntpID never loses digits; a runtime without the source throws instead of rounding (the rule
 * the first card processor's package followed, and tax-quaderno's reader follows).
 */
export function parseJsonKeepingNumberText(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    if (typeof context?.source !== "string") throw new TypeError("JSON_NUMBER_SOURCE_UNAVAILABLE");
    return context.source;
  });
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The member at a dot path from `root` ("payment.binding.token"), or undefined when a step is not an object member. */
export function valueAtPath(root: unknown, dotted: string): unknown {
  let current: unknown = root;
  for (const step of dotted.split(".")) {
    if (!isJsonRecord(current) || !Object.hasOwn(current, step)) return undefined;
    current = current[step];
  }
  return current;
}
