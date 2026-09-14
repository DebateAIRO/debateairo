import type { NotificationCommand } from "./osascript.js";

const MAILBOX = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/u;

export function sendmailProposalCommand(
  recipient: string,
  incidentId: string,
  proposalId: string,
): NotificationCommand {
  if (!MAILBOX.test(recipient) || recipient.length > 254) throw new TypeError("FIX12_SENDMAIL_RECIPIENT");
  const subject = `FixAgent proposal ${proposalId}`;
  const body = `incident ${incidentId}\nproposal ${proposalId}\n`;
  return Object.freeze({
    binary: "sendmail",
    args: Object.freeze(["--", recipient]),
    stdin: `To: ${recipient}\nSubject: ${subject}\n\n${body}`,
  });
}
