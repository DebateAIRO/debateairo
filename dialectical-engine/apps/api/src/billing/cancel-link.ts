import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createEmailBlindIndex, normalizeEmailForBlindIndex } from "@debateai/crypto";
import type { BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import type { BillingMailPort } from "./email-job.js";
import { openBillingProfile } from "./records.js";
import { requestCancelLocked } from "./subscription-actions.js";
import { lockedSubscription } from "./subscription-core.js";

/** The stored form of a cancel token: sha256 under its own purpose label, 64 hex. The token itself is never stored. */
export function cancelTokenSha256(token: string): string {
  return createHash("sha256").update("debateai:token:billing-cancel:v1\0", "utf8").update(token, "utf8").digest("hex");
}

/**
 * The link in M9, `${PUBLIC_APP_URL}/cancel#token=<43 base64url>` (R-7). The token rides in the fragment: browsers
 * never send it to a server, a proxy or a log.
 */
export function cancelLinkUrl(publicAppUrl: string, token: string): string {
  return `${new URL(publicAppUrl).origin}/cancel#token=${token}`;
}

export type CancelLinkDeps = Readonly<{
  billing: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner">;
  /** B5: a PAST_DUE plan cancelled through the link ends at once, with its FREE entitlement (P12b's rule). */
  entitlements: Pick<EntitlementRepository, "append">;
  identities: Readonly<{ ownerRefByEmailBlindIndex(emailBlindIndex: Buffer): Promise<string | null> }>;
  blindIndexKey: Uint8Array;
  recordsKey: Buffer;
  /** P17's sender. Absent until P17 is composed: a request then sends nothing, like any other silent case. */
  mail: BillingMailPort | undefined;
  /** `PUBLIC_APP_URL` (R-7). */
  publicAppUrl: string;
  audit: BillingAudit;
  clock: () => Date;
}>;

/** A25: at most three links per account in any 24 hours; each token lives 24 hours. */
const LINKS_PER_DAY = 3;
const DAY_MS = 86_400_000;

/**
 * Terms §12: cancel without signing in. `request` runs AFTER the route has answered 202, so whether an account,
 * a plan or a link exists never shows in the answer or its timing (spec §2.7).
 */
export class CancelLinkService {
  constructor(private readonly deps: CancelLinkDeps) {}

  async request(email: string): Promise<"SENT" | "SILENT"> {
    let blindIndex: Buffer;
    try {
      blindIndex = createEmailBlindIndex(this.deps.blindIndexKey, normalizeEmailForBlindIndex(email));
    } catch {
      return "SILENT";
    }
    const ownerRef = await this.deps.identities.ownerRefByEmailBlindIndex(blindIndex);
    if (ownerRef === null || this.deps.mail === undefined) return "SILENT";
    const state = await this.deps.billing.subscriptionForOwner(ownerRef);
    if (state === null || (state.status !== "ACTIVE" && state.status !== "PAST_DUE") || state.cancelRequested) {
      return "SILENT";
    }
    const customer = await this.deps.billing.customerByOwner(ownerRef);
    const latest = customer === null ? null : await this.deps.billing.latestProfile(customer.customerId);
    if (customer === null || latest === null) return "SILENT";
    const profile = openBillingProfile(this.deps.recordsKey, customer.customerId, latest.profileCiphertext);
    const now = this.deps.clock();
    const token = randomBytes(32).toString("base64url");
    const issued = await this.deps.billing.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, ownerRef);
      // A25: at most three links per account in any 24 hours; the fourth is silent.
      const recent = await this.deps.billing.cancelTokensIssuedForOwnerSince(
        ownerRef, new Date(now.getTime() - DAY_MS), client
      );
      if (recent >= LINKS_PER_DAY) return false;
      await this.deps.billing.insertCancelToken(client, {
        tokenSha256: cancelTokenSha256(token), subscriptionId: state.subscriptionId,
        issuedAt: now, expiresAt: new Date(now.getTime() + DAY_MS)
      });
      return true;
    });
    if (!issued) return "SILENT";
    await this.deps.mail.sendTemplated(Object.freeze({
      messageId: randomUUID(), to: profile.email, templateId: "M9", locale: profile.locale,
      params: Object.freeze({ cancelLinkUrl: cancelLinkUrl(this.deps.publicAppUrl, token) }),
      attachments: Object.freeze([])
    }));
    this.deps.audit("billing.cancel_link.sent", {});
    return "SENT";
  }

  /** One use per token, within 24 hours; the cancel itself is Settings' own (`requestCancelLocked`, M7 included). */
  async cancelByToken(token: string): Promise<"CANCELLED" | "NOTHING_TO_CANCEL" | "INVALID"> {
    const now = this.deps.clock();
    const outcome = await this.deps.billing.withTransaction(async (client) => {
      const used = await this.deps.billing.useCancelToken(client, cancelTokenSha256(token), now);
      if (used === null) return "INVALID" as const;
      const first = (await this.deps.billing.subscriptionEvents(used.subscriptionId, client))[0];
      if (first === undefined) return "NOTHING_TO_CANCEL" as const;
      const locked = await lockedSubscription(this.deps, client, first.ownerRef);
      if (locked === null || locked.state.subscriptionId !== used.subscriptionId) return "NOTHING_TO_CANCEL" as const;
      return await requestCancelLocked(this.deps, client, locked, now, "EMAIL_LINK") === "REQUESTED"
        ? "CANCELLED" as const : "NOTHING_TO_CANCEL" as const;
    });
    if (outcome === "CANCELLED") this.deps.audit("billing.cancel", { source: "EMAIL_LINK" });
    return outcome;
  }
}
