import type { BillingRepository, OutboxJob } from "@debateai/db";
import type { PoolClient } from "pg";
import type { OutboxHandler, OutboxOutcome } from "./outbox.js";
import { DONE } from "./outbox.js";
import { openBillingProfile, type BillingProfile } from "./records.js";

/**
 * The same ids as P17's `MailTemplateId` (packages/mail-templates/src/templates.ts); P17 is built later and pins the
 * two lists equal. R-8's sixteen, plus Q-5's owner template `O2` ("A refund could not be completed and needs your
 * attention", English only, params `chargeRef`, `refundAmount`, `reasonCode`), which RefundDesk's dead-letter path
 * queues (P9b).
 */
export type BillingMailTemplateId =
  | "M1" | "M2_INVOICE_LINK" | "M2_INVOICE_ATTACHED" | "M3" | "M4" | "M5A" | "M5B" | "M5C"
  | "M6" | "M7" | "M8" | "M9" | "M10" | "M11" | "M11_DUPLICATE" | "O1" | "O2";

const TEMPLATE_IDS: ReadonlySet<string> = new Set<BillingMailTemplateId>([
  "M1", "M2_INVOICE_LINK", "M2_INVOICE_ATTACHED", "M3", "M4", "M5A", "M5B", "M5C",
  "M6", "M7", "M8", "M9", "M10", "M11", "M11_DUPLICATE", "O1", "O2"
]);

/** Structurally P17's `MailAttachment` (apps/api/src/mail-mime.ts). */
export type BillingMailAttachment = Readonly<{
  filename: string;
  contentType: "text/plain; charset=UTF-8" | "application/pdf";
  content: Uint8Array;
}>;

/** Structurally P17's `TemplatedMail`: its `TemplatedMailSender` satisfies `BillingMailPort`. */
export type BillingMail = Readonly<{
  messageId: string;
  to: string;
  templateId: BillingMailTemplateId;
  locale: string;
  params: Readonly<Record<string, string>>;
  attachments: ReadonlyArray<BillingMailAttachment>;
}>;

export interface BillingMailPort {
  sendTemplated(mail: BillingMail): Promise<void>;
}

/** What an EMAIL job may attach, resolved at send time from content-free fields. */
export type BillingAttachmentKind = "ACCEPTED_TERMS" | "WITHDRAWAL_FORM" | "SMARTBILL_INVOICE_PDF";
const ATTACHMENT_KINDS: ReadonlySet<string> = new Set<BillingAttachmentKind>([
  "ACCEPTED_TERMS", "WITHDRAWAL_FORM", "SMARTBILL_INVOICE_PDF"
]);

/** `null` = nothing to attach this time (for example a Terms file whose hash no longer matches). */
export type AttachmentResolver = (
  fields: Readonly<Record<string, string>>, locale: string
) => Promise<BillingMailAttachment | null>;

export type BillingEmailRequest = Readonly<{
  template: BillingMailTemplateId;
  recipient: Readonly<{ kind: "CUSTOMER"; customerId: string }> | Readonly<{ kind: "OWNER" }>;
  /** Unique per message together with the template: the job ref is `${template}:${dedupeRef}`. */
  dedupeRef: string;
  params: Readonly<Record<string, string>>;
  attachments?: ReadonlyArray<Readonly<{ kind: BillingAttachmentKind; fields: Readonly<Record<string, string>> }>>;
  notBefore: Date;
}>;

type EmailOutboxJob = Readonly<{
  kind: "EMAIL";
  ref: string;
  notBefore: Date;
  payload: Readonly<Record<string, string | number | boolean | null>>;
}>;

/**
 * The queue never holds an address (spec: "the EMAIL job resolves the address from the billing profile at send
 * time"). It holds the template, the customer id and the params; params are amounts, dates, plan ids and our own
 * URLs, never personal text.
 */
export function emailJob(request: BillingEmailRequest): EmailOutboxJob {
  const payload: Record<string, string | number | boolean | null> = {
    template: request.template,
    recipient: request.recipient.kind,
    customer_id: request.recipient.kind === "CUSTOMER" ? request.recipient.customerId : null,
    attachments: (request.attachments ?? []).map((attachment) => attachment.kind).join(",")
  };
  for (const [name, value] of Object.entries(request.params)) payload[`param.${name}`] = value;
  for (const attachment of request.attachments ?? []) {
    for (const [name, value] of Object.entries(attachment.fields)) payload[`attach.${attachment.kind}.${name}`] = value;
  }
  return Object.freeze({
    kind: "EMAIL" as const,
    ref: `${request.template}:${request.dedupeRef}`,
    notBefore: request.notBefore,
    payload: Object.freeze(payload)
  });
}

export async function enqueueEmail(
  repository: Pick<BillingRepository, "enqueue">, client: PoolClient, request: BillingEmailRequest
): Promise<void> {
  await repository.enqueue(client, emailJob(request));
}

const dead = (code: string): OutboxOutcome => Object.freeze({ kind: "DEAD" as const, code });

function fieldsWithPrefix(payload: OutboxJob["payload"], prefix: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of Object.entries(payload)) {
    if (name.startsWith(prefix) && typeof value === "string") fields[name.slice(prefix.length)] = value;
  }
  return fields;
}

export function createEmailJobHandler(deps: Readonly<{
  repository: Pick<BillingRepository, "latestProfile">;
  recordsKey: Buffer;
  ownerReportEmail: string;
  mail: BillingMailPort;
  attachments: ReadonlyMap<BillingAttachmentKind, AttachmentResolver>;
}>): OutboxHandler {
  return async (job) => {
    const { template, recipient, customer_id: customerId, attachments } = job.payload;
    if (typeof template !== "string" || !TEMPLATE_IDS.has(template)) return dead("EMAIL_PAYLOAD_INVALID");
    let to: string;
    let locale: string;
    if (recipient === "OWNER") {
      to = deps.ownerReportEmail;
      locale = "en";
    } else if (recipient === "CUSTOMER" && typeof customerId === "string") {
      const latest = await deps.repository.latestProfile(customerId);
      if (latest === null) return dead("BILLING_PROFILE_MISSING");
      let profile: BillingProfile;
      try {
        profile = openBillingProfile(deps.recordsKey, customerId, latest.profileCiphertext);
      } catch {
        return dead("BILLING_PROFILE_UNREADABLE");
      }
      to = profile.email;
      locale = profile.locale;
    } else {
      return dead("EMAIL_PAYLOAD_INVALID");
    }
    const resolved: BillingMailAttachment[] = [];
    for (const kind of typeof attachments === "string" && attachments.length > 0 ? attachments.split(",") : []) {
      const resolver = ATTACHMENT_KINDS.has(kind) ? deps.attachments.get(kind as BillingAttachmentKind) : undefined;
      if (resolver === undefined) return dead("EMAIL_ATTACHMENT_UNRESOLVED");
      const attachment = await resolver(fieldsWithPrefix(job.payload, `attach.${kind}.`), locale);
      if (attachment !== null) resolved.push(attachment);
    }
    await deps.mail.sendTemplated(Object.freeze({
      messageId: job.jobId,
      to,
      templateId: template as BillingMailTemplateId,
      locale,
      params: Object.freeze(fieldsWithPrefix(job.payload, "param.")),
      attachments: Object.freeze(resolved)
    }));
    return DONE;
  };
}
