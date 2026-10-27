/**
 * Italy clause approval (mission italy-clause-approval, slice S01): the vocabulary the browser, the API and the
 * database agree on. Pure constants and two pure functions; no I/O.
 */

/** The country whose sign-ups see the second checkbox (picked in Region, or the request IP resolves to it). */
export const ITALY_COUNTRY = "IT" as const;

/** The Terms clauses the Italian Civil Code arts. 1341-1342 approval covers, in the order they are shown. */
export const ITALY_APPROVAL_CLAUSES: readonly [11, 12, 14, 15, 18] = Object.freeze([11, 12, 14, 15, 18] as const);

/** Which test put the account in Italy: the picked region, the request IP, or both. */
export const ITALY_APPROVAL_LEGS: readonly ["PICKED", "IP", "BOTH"] = Object.freeze(["PICKED", "IP", "BOTH"] as const);
export type ItalyApprovalLeg = typeof ITALY_APPROVAL_LEGS[number];

/** The legal.acceptance row kind the approval is recorded under. */
export const ITALY_APPROVAL_KIND = "ITALY_SPECIFIC_APPROVAL" as const;

/** The refusal code a sign-up gets when an Italian account does not carry the approval. */
export const ITALY_APPROVAL_REQUIRED = "ITALY_APPROVAL_REQUIRED" as const;

/** Both tests true is BOTH, one is its own leg, neither is null (no approval is owed). */
export function italyApprovalLeg(picked: boolean, ip: boolean): ItalyApprovalLeg | null {
  if (picked && ip) return "BOTH";
  if (picked) return "PICKED";
  if (ip) return "IP";
  return null;
}

export function isItalyApprovalLeg(value: unknown): value is ItalyApprovalLeg {
  return typeof value === "string" && (ITALY_APPROVAL_LEGS as readonly string[]).includes(value);
}
