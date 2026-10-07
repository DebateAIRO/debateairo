// packages/payments-netopia/src/hosts.ts
import type { PaymentEnvironment } from "@debateai/billing-core";

/** Spec 2026-10-05 §2.4.1: the four bases (probed 5 October 2026); the newer clients use the first of each pair (N-1). */
const BASES: ReadonlyArray<Readonly<{ base: string; environment: PaymentEnvironment }>> = [
  { base: "https://secure.netopia-payments.com/api", environment: "live" },
  { base: "https://secure.mobilpay.ro/pay", environment: "live" },
  { base: "https://secure-sandbox.netopia-payments.com", environment: "sandbox" },
  { base: "https://secure.sandbox.netopia-payments.com", environment: "sandbox" }
];
export const NETOPIA_BASES: ReadonlyArray<Readonly<{ base: string; environment: PaymentEnvironment }>> =
  Object.freeze(BASES.map((entry) => Object.freeze({ base: entry.base, environment: entry.environment })));

/** By exact match: a trailing slash or another letter case is not a NETOPIA base. */
export function netopiaEnvironmentOf(baseUrl: string): PaymentEnvironment | null {
  return NETOPIA_BASES.find((entry) => entry.base === baseUrl)?.environment ?? null;
}

const POS_SIGNATURE = /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){4}$/u;
export function isNetopiaPosSignature(value: string): boolean {
  return typeof value === "string" && POS_SIGNATURE.test(value);
}

const PAYMENT_HOST_SUFFIXES: ReadonlyArray<string> = Object.freeze([".netopia-payments.com", ".mobilpay.ro"]);
/** Spec §2.2 rule 10: https on a NETOPIA subdomain, no user info, no explicit port (the URL lets anyone pay our order). */
export function isNetopiaPaymentUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.port !== "") return false;
  const host = parsed.hostname.toLowerCase();
  return PAYMENT_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}
