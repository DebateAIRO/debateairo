import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encrypt, generateDek, type ReadableUserDekStore } from "@debateai/crypto";
import type { AccountErasureNotificationClaim, PostgresAccountErasureRepository } from "@debateai/db";
import { AccountErasureNotificationReconciler } from "../../apps/api/src/account-erasure.js";
import type { SecurityNotificationMail } from "../../apps/api/src/mail-channel.js";

/**
 * Mission email-locale, S01-C11.4 and C11.6 (SPEC-v4 R-13; D-101, D-108). The erasure worker sends each claimed row in the
 * language stored on that row (`display.locale`), and `display` is required on SecurityNotificationMail, so a notice cannot
 * be built without a language. The database side (schedule, cancel, completion, refusal) is in
 * tests/integration/mail-locale-erasure.test.ts.
 */

const EMAIL_ADDRESS = "person@example.test";

function claimFor(userId: string, dek: Buffer, mailLocale: string, eventKind: "SCHEDULED" | "CANCELLED" | "COMPLETION"): AccountErasureNotificationClaim {
  const keyId = `user-dek:${userId}`;
  return Object.freeze({
    messageId: randomUUID(),
    claimToken: randomUUID(),
    userId,
    erasureId: randomUUID(),
    channelType: "email",
    addressCiphertext: encrypt(dek, Buffer.from(EMAIL_ADDRESS, "utf8"),
      ["identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    eventKind,
    executeAt: new Date("2026-11-30T00:00:00.000Z"),
    mailLocale
  });
}

describe("account erasure notices (email-locale C11)", () => {
  it("C11.4: the worker sends a claimed row in the language stored on it, and not in a profile or cookie language", async () => {
    const scheduledUser = randomUUID();
    const cancelledUser = randomUUID();
    const scheduledDek = generateDek();
    const cancelledDek = generateDek();
    const deks = new Map<string, Buffer>([[scheduledUser, scheduledDek], [cancelledUser, cancelledDek]]);
    const users: ReadableUserDekStore = {
      async store() { throw new Error("NOT_USED"); },
      async load(userId) {
        const dek = deks.get(userId);
        if (dek === undefined) throw new Error("USER_DEK_MISSING");
        return Buffer.from(dek);
      },
      async exists(userId) { return deks.has(userId); },
      async destroy() { throw new Error("NOT_USED"); }
    };
    const claims = [
      claimFor(scheduledUser, scheduledDek, "ro", "SCHEDULED"),
      claimFor(cancelledUser, cancelledDek, "pl", "CANCELLED")
    ];
    const repository = {
      async claimNotifications() { return claims; },
      async withNotificationLease<T>(_userId: string, use: () => Promise<T>): Promise<T> { return use(); },
      async acknowledgeNotification() { return true; },
      async failNotification() { return "FAILED" as const; }
    } as unknown as PostgresAccountErasureRepository;
    const sent: SecurityNotificationMail[] = [];
    const reconciler = new AccountErasureNotificationReconciler(repository, users, {
      async sendSecurityNotification(mail) { sent.push(mail); }
    });

    const outcomes = await reconciler.reconcile(100);

    expect(outcomes.map((outcome) => outcome.outcome)).toEqual(["ACKNOWLEDGED", "ACKNOWLEDGED"]);
    expect(sent.find((mail) => mail.eventKind === "SCHEDULED")?.display).toEqual({ locale: "ro", timeZone: null });
    expect(sent.find((mail) => mail.eventKind === "CANCELLED")?.display).toEqual({ locale: "pl", timeZone: null });
  });

  it("C11.6 (4): display is required on SecurityNotificationMail, so a notice cannot be built without a language (D-101)", () => {
    // @ts-expect-error display is required on SecurityNotificationMail (C11.6 (4)): this literal must not compile.
    const withoutDisplay: SecurityNotificationMail = {
      messageId: randomUUID(), recipient: EMAIL_ADDRESS, eventKind: "SCHEDULED", executeAt: new Date(0)
    };
    expect(withoutDisplay.eventKind).toBe("SCHEDULED");
  });
});
