// packages/payments-netopia/src/index.ts
// NETOPIA Payments API v2 (spec 2026-10-05 §2.4). N2: the pure layer; N3 appends the client and N4 the notice verifier
// after this block. requests.ts and answers.ts stay internal (the client imports them by path).
export { NETOPIA_BASES, isNetopiaPaymentUrl, isNetopiaPosSignature, netopiaEnvironmentOf } from "./hosts.js";
export { NETOPIA_FACTS, netopiaLanguageOf } from "./facts.js";
export { bankDeclined, declineSideOf, statusToState } from "./status.js";
export { iso2ToNetopiaCountry, netopiaCountryToIso2 } from "./countries.js";
export { microsToNetopiaAmount, netopiaAmountToMicros } from "./money.js";
export { parseOccurredAt } from "./time.js";
export { createSecretToken } from "./secret-token.js";
export { parseJsonKeepingNumberText } from "./json.js";
// N3: the client (spec §2.3 errors, §2.4.1–2.4.3). createNetopiaPaymentsForRecording and the timeouts stay internal.
export { answeredOrderReused, createNetopiaPayments, type NetopiaConfig, type NetopiaDeps } from "./client.js";
