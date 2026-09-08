import { createHash } from "node:crypto";

import { canonicalProposal } from "../worker-diagnosis/validate.js";
import { FixProposalSchema, type FixProposal } from "../worker-diagnosis/schema.js";
import type { CliResult } from "./types.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const REASON_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const HASH = /^[0-9a-f]{64}$/u;

export interface StoredProposal {
  readonly proposalId: string;
  readonly incidentId: string;
  readonly ticketId: string;
  readonly hash: string;
  readonly proposal: FixProposal;
}

export interface ProposalControlAction {
  readonly kind: "APPROVED" | "DENIED" | "PROPOSAL_TAMPERED";
  readonly proposalId: string;
  readonly incidentId: string;
  readonly actionRef: string;
  readonly reasonCode?: string;
}

export interface ProposalControlStore {
  loadProposal(proposalId: string): Promise<StoredProposal | undefined>;
  appendAction(action: ProposalControlAction): Promise<void>;
  setIncidentState(incidentId: string, state: "APPROVED" | "PARKED" | "TICKETED"): Promise<void>;
  discardProposal(proposalId: string): Promise<void>;
}

export interface ProposalTicketPort {
  comment(ticketId: string, value: string): Promise<void>;
}

export function canonicalProposalHash(proposal: FixProposal): string {
  return createHash("sha256").update(canonicalProposal(FixProposalSchema.parse(proposal)), "utf8").digest("hex");
}

async function loadUntampered(
  proposalId: string,
  store: ProposalControlStore,
): Promise<StoredProposal | CliResult> {
  if (!SAFE_ID.test(proposalId)) throw new TypeError("FIX12_PROPOSAL_ID");
  const stored = await store.loadProposal(proposalId);
  if (stored === undefined) return Object.freeze({ exitCode: 1, stdout: "", stderr: "PROPOSAL_NOT_FOUND\n" });
  const computed = canonicalProposalHash(stored.proposal);
  if (!HASH.test(stored.hash) || stored.hash !== computed) {
    await store.appendAction(Object.freeze({
      kind: "PROPOSAL_TAMPERED",
      proposalId,
      incidentId: stored.incidentId,
      actionRef: computed,
    }));
    await store.discardProposal(proposalId);
    await store.setIncidentState(stored.incidentId, "TICKETED");
    return Object.freeze({ exitCode: 1, stdout: `PROPOSAL_TAMPERED ${proposalId}\n`, stderr: "" });
  }
  return stored;
}

function isCliResult(value: StoredProposal | CliResult): value is CliResult {
  return Object.hasOwn(value, "exitCode");
}

export async function approveProposal(
  proposalId: string,
  store: ProposalControlStore,
  ticket: ProposalTicketPort,
): Promise<CliResult> {
  const stored = await loadUntampered(proposalId, store);
  if (isCliResult(stored)) return stored;
  await store.appendAction(Object.freeze({
    kind: "APPROVED", proposalId, incidentId: stored.incidentId, actionRef: stored.hash,
  }));
  await store.setIncidentState(stored.incidentId, "APPROVED");
  await ticket.comment(stored.ticketId, `APPROVED ${proposalId}`);
  return Object.freeze({ exitCode: 0, stdout: `APPROVED ${proposalId} ${stored.hash}\n`, stderr: "" });
}

export async function denyProposal(
  proposalId: string,
  reasonCode: string | undefined,
  store: ProposalControlStore,
  ticket: ProposalTicketPort,
): Promise<CliResult> {
  const reason = reasonCode ?? "CUSTODIAN_DENIED";
  if (!REASON_CODE.test(reason)) throw new TypeError("FIX12_REASON_CODE");
  const stored = await loadUntampered(proposalId, store);
  if (isCliResult(stored)) return stored;
  await store.appendAction(Object.freeze({
    kind: "DENIED", proposalId, incidentId: stored.incidentId, actionRef: stored.hash, reasonCode: reason,
  }));
  await store.setIncidentState(stored.incidentId, "PARKED");
  await ticket.comment(stored.ticketId, `DENIED ${proposalId} ${reason}`);
  return Object.freeze({ exitCode: 0, stdout: `DENIED ${proposalId} ${reason}\n`, stderr: "" });
}
