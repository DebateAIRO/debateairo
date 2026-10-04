import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createEmailBlindIndex, normalizeEmailForBlindIndex } from "@debateai/crypto";
import type { BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import type { BillingRecipientReader } from "./account-email.js";
import type { BillingAudit } from "./audit.js";
import type { BillingMailPort } from "./email-job.js";
import { openBillingProfile, type BillingProfile } from "./records.js";
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
  /** W8 (P2-I12): M9 goes to the account's current address; to the billing profile's only after an erasure. */
  recipients: BillingRecipientReader;
  /** P17's sender. Absent until P17 is composed: a request then sends nothing, like any other silent case. */
  mail: BillingMailPort | undefined;
  /** `PUBLIC_APP_URL` (R-7). */
  publicAppUrl: string;
  audit: BillingAudit;
  clock: () => Date;
}>;

/** The statuses `requestCancelLocked` cancels (P2-W10: SUSPENDED too); any other plan gets no link. */
const CANCELLABLE: ReadonlySet<string> = new Set(["ACTIVE", "PAST_DUE", "SUSPENDED"]);
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
    let normalized: string;
    let blindIndex: Buffer;
    try {
      normalized = normalizeEmailForBlindIndex(email);
      blindIndex = createEmailBlindIndex(this.deps.blindIndexKey, normalized);
    } catch {
      return "SILENT";
    }
    if (this.deps.mail === undefined) return "SILENT";
    // W8 (P2-I12, the owner's ruling): the address typed is matched against the account's CURRENT address, and M9 goes
    // to that account's current address (the one that matched).
    const ownerRef = await this.deps.identities.ownerRefByEmailBlindIndex(blindIndex);
    if (ownerRef !== null) {
      return this.issue(ownerRef, async (customerId, profile) =>
        (await this.deps.recipients.currentAddress(customerId)) ?? profile.email);
    }
    // No account holds that address. After an erasure the address kept with the billing profile still names the
    // person, so an erased owner whose plan the sweep has not ended yet is matched by it, and M9 goes there.
    const erased = await this.erasedOwnerByProfileAddress(normalized);
    return erased === null ? "SILENT" : this.issue(erased, async (_customerId, profile) => profile.email);
  }

  /**
   * The owner, among those whose erasure has committed and whose plan is still live (the sweep's own list, 0089, and
   * 0091's `owner_erasure_committed`: the erasure stop's backlog, normally empty), whose latest billing profile holds
   * this normalised address. Profiles are sealed, so each candidate's is opened and compared; a candidate whose lookup
   * or profile cannot be read is skipped (the request has already been answered, and nothing here may show).
   */
  private async erasedOwnerByProfileAddress(normalized: string): Promise<string | null> {
    let after: string | null = null;
    for (;;) {
      const page = await this.deps.billing.pendingErasureOwnerRefs(after, 100);
      if (page.length === 0) return null;
      for (const candidate of page) {
        try {
          if (!await this.deps.billing.ownerErasureCommitted(candidate)) continue;
          const customer = await this.deps.billing.customerByOwner(candidate);
          const latest = customer === null ? null : await this.deps.billing.latestProfile(customer.customerId);
          if (customer === null || latest === null) continue;
          const profile = openBillingProfile(this.deps.recordsKey, customer.customerId, latest.profileCiphertext);
          if (normalizeEmailForBlindIndex(profile.email) === normalized) return candidate;
        } catch {
          continue;
        }
      }
      after = page[page.length - 1]!;
    }
  }

  /**
   * One link for this owner's live plan with no cancel pending, at most three a day (A25), mailed to `recipient`'s
   * answer. P2-W10: a plan paused by a card dispute (SUSPENDED) is live and cancellable too.
   */
  private async issue(
    ownerRef: string, recipient: (customerId: string, profile: BillingProfile) => Promise<string>
  ): Promise<"SENT" | "SILENT"> {
    const mail = this.deps.mail;
    if (mail === undefined) return "SILENT";
    const state = await this.deps.billing.subscriptionForOwner(ownerRef);
    if (state === null || !CANCELLABLE.has(state.status) || state.cancelRequested) {
      return "SILENT";
    }
    const customer = await this.deps.billing.customerByOwner(ownerRef);
    const latest = customer === null ? null : await this.deps.billing.latestProfile(customer.customerId);
    if (customer === null || latest === null) return "SILENT";
    const profile = openBillingProfile(this.deps.recordsKey, customer.customerId, latest.profileCiphertext);
    const to = await recipient(customer.customerId, profile);
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
    await mail.sendTemplated(Object.freeze({
      messageId: randomUUID(), to, templateId: "M9", locale: profile.locale,
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
      // P2-M12: the cancel is dated once the owner lock is held (the token was checked at the first reading).
      return await requestCancelLocked(this.deps, client, locked, this.deps.clock(), "EMAIL_LINK") === "REQUESTED"
        ? "CANCELLED" as const : "NOTHING_TO_CANCEL" as const;
    });
    if (outcome === "CANCELLED") this.deps.audit("billing.cancel", { source: "EMAIL_LINK" });
    return outcome;
  }
}
