export interface NotificationCommand {
  readonly binary: string;
  readonly args: readonly string[];
  readonly stdin?: string;
}

export interface NotificationCommandRunner {
  run(command: NotificationCommand): Promise<void>;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const ProposalNotificationInputSchema = z.object({
  incidentId: z.string().regex(UUID),
  proposalId: z.string().regex(SAFE_ID),
}).strict();

export function osascriptProposalInputCommand(input: unknown): NotificationCommand {
  const parsed = ProposalNotificationInputSchema.parse(input);
  return osascriptProposalCommand(parsed.incidentId, parsed.proposalId);
}

export function osascriptProposalCommand(incidentId: string, proposalId: string): NotificationCommand {
  if (!UUID.test(incidentId) || !SAFE_ID.test(proposalId)) throw new TypeError("FIX12_NOTIFICATION_ID");
  const message = `incident ${incidentId} proposal ${proposalId}`;
  return Object.freeze({
    binary: "osascript",
    args: Object.freeze(["-e", `display notification "${message}" with title "FixAgent proposal"`]),
  });
}
import { z } from "zod";
