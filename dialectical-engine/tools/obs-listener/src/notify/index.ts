import type { FixProposal } from "../worker-diagnosis/schema.js";
import { osascriptProposalInputCommand, type NotificationCommandRunner } from "./osascript.js";
import { sendmailProposalCommand } from "./sendmail.js";
import { renderProposalCommentInput, ticketCommentCommand } from "./ticket-comment.js";

export interface NotificationFailureOccurrence {
  readonly runtime: "listener";
  readonly capturePoint: "self";
  readonly code: "FIXAGENT_NOTIFICATION_FAILED";
  readonly channel: "osascript" | "ticket" | "sendmail";
  readonly incidentId: string;
}

export interface NotificationOccurrencePort {
  record(occurrence: NotificationFailureOccurrence): Promise<void>;
}

export interface ProposalNotification {
  readonly incidentId: string;
  readonly proposalId: string;
  readonly ticketId: string;
  readonly hash: string;
  readonly proposal: FixProposal;
}

export interface ProposalNotifier {
  notify(value: ProposalNotification): Promise<void>;
}

export interface ProposalNotifierOptions {
  readonly osascript: NotificationCommandRunner;
  readonly ticket: NotificationCommandRunner;
  readonly occurrence: NotificationOccurrencePort;
  readonly sendmail?: Readonly<{ readonly runner: NotificationCommandRunner; readonly recipient: string }>;
}

export function notifyProposal(options: ProposalNotifierOptions): ProposalNotifier {
  return Object.freeze({
    async notify(value: ProposalNotification): Promise<void> {
      const attempts = [
        ["osascript" as const, options.osascript,
          osascriptProposalInputCommand({ incidentId: value.incidentId, proposalId: value.proposalId })],
        ["ticket" as const, options.ticket,
          ticketCommentCommand(value.ticketId, renderProposalCommentInput({
            proposalId: value.proposalId, hash: value.hash, proposal: value.proposal,
          }))],
      ] as const;
      for (const [channel, runner, command] of attempts) {
        try {
          await runner.run(command);
        } catch {
          await options.occurrence.record(Object.freeze({
            runtime: "listener",
            capturePoint: "self",
            code: "FIXAGENT_NOTIFICATION_FAILED",
            channel,
            incidentId: value.incidentId,
          }));
        }
      }
      if (options.sendmail !== undefined) {
        try {
          await options.sendmail.runner.run(sendmailProposalCommand(
            options.sendmail.recipient,
            value.incidentId,
            value.proposalId,
          ));
        } catch {
          await options.occurrence.record(Object.freeze({
            runtime: "listener",
            capturePoint: "self",
            code: "FIXAGENT_NOTIFICATION_FAILED",
            channel: "sendmail",
            incidentId: value.incidentId,
          }));
        }
      }
    },
  });
}
