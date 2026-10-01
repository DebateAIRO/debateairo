// packages/payments-xmoney/src/json.ts
/**
 * JSON.parse that keeps every number as its exact SOURCE TEXT (Node's reviver `context.source`), so an
 * xMoney id never loses digits and "24.20" reaches the money parser as written. Strings stay strings.
 */
export function parseJsonKeepingNumberText(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => (
    typeof value === "number"
      ? (typeof context?.source === "string" ? context.source : String(value))
      : value
  ));
}
