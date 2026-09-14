import { FixProposalSchema, type FixProposal } from "../worker-diagnosis/schema.js";
import type { NotificationCommand } from "./osascript.js";
import { z } from "zod";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const HASH = /^[0-9a-f]{64}$/u;

export const ProposalCommentInputSchema = z.object({
  proposalId: z.string().regex(SAFE_ID),
  hash: z.string().regex(HASH),
  proposal: FixProposalSchema,
}).strict();

export function renderProposalCommentInput(input: unknown): string {
  const parsed = ProposalCommentInputSchema.parse(input);
  return renderProposalComment(parsed.proposalId, parsed.hash, parsed.proposal);
}

export function renderProposalComment(
  proposalId: string,
  hash: string,
  proposal: FixProposal,
): string {
  if (!SAFE_ID.test(proposalId) || !HASH.test(hash)) throw new TypeError("FIX12_NOTIFICATION_ID");
  const parsed = FixProposalSchema.parse(proposal);
  return [
    `PROPOSAL ${proposalId}`,
    `HASH ${hash}`,
    `INCIDENT ${parsed.incidentId}`,
    `ROOT ${parsed.root}`,
    `DEFECT_CLASS ${parsed.diagnosis.defectClass}`,
    `SIZE ${parsed.sizeLabel}`,
    `INVARIANT ${parsed.redTestPlan.invariantRef}`,
    `SCOPE ${parsed.changeScope.join(",")}`,
  ].join("\n");
}

export function ticketCommentCommand(ticketId: string, comment: string): NotificationCommand {
  if (!SAFE_ID.test(ticketId)) throw new TypeError("FIX12_TICKET_ID");
  return Object.freeze({
    binary: "hermes",
    args: Object.freeze(["kanban", "--board", "fixagent", "comment", ticketId, comment]),
  });
}
