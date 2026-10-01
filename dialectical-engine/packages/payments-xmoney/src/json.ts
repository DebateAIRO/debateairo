// packages/payments-xmoney/src/json.ts
/**
 * JSON.parse that keeps every number as its exact SOURCE TEXT (Node's reviver `context.source`), so an
 * xMoney id never loses digits and "24.20" reaches the money parser as written. Strings stay strings.
 *
 * Node 26 (the engines pin) always gives a number's `context.source`, so the JSON_NUMBER_SOURCE_UNAVAILABLE
 * throw fires only on a runtime that would otherwise lose digits by rounding the number through a double.
 * It is an environment fault, never a vendor one; both callers (decryptNotice here, and P3b's transaction
 * reader) turn it into their own refusal.
 */
export function parseJsonKeepingNumberText(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    if (typeof context?.source !== "string") throw new TypeError("JSON_NUMBER_SOURCE_UNAVAILABLE");
    return context.source;
  });
}
