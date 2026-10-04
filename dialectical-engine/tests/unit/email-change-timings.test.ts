import { describe, expect, it } from "vitest";
import { EmailChangeService } from "../../apps/api/src/email-change.js";

// Turn 14's two timings belong to the service: the link expires in 24 hours (design 14C) and a
// resend waits 60 seconds. They are module-private (the source-purity law refuses an exported
// numeric literal), so the composition root passes neither and the running API gets these
// defaults. Only `resend` is driven: its repository call carries both timings, and a COOLDOWN
// answer returns before any address is decrypted, so no DEK or mail is needed.

type Dependencies = ConstructorParameters<typeof EmailChangeService>[0];

const now = new Date("2026-10-04T09:00:00.000Z");
const session = Object.freeze({ userId: "user:t14-timings", sessionId: "session:t14-timings" });
const source = Object.freeze({ ip: "203.0.113.7", userAgent: "t14-timings", requestId: "request:t14-timings" });

function service(timings: Partial<Pick<Dependencies, "tokenTtlMs" | "resendCooldownMs">> = {}) {
  const resends: { expiresAt: Date; cooldownMs: number }[] = [];
  const repository = {
    async resend(input: Readonly<{ expiresAt: Date; cooldownMs: number }>) {
      resends.push({ expiresAt: input.expiresAt, cooldownMs: input.cooldownMs });
      return Object.freeze({ status: "COOLDOWN" as const });
    }
  };
  const built = new EmailChangeService({
    repository: repository as unknown as Dependencies["repository"],
    users: {} as unknown as Dependencies["users"],
    blindIndexKey: new Uint8Array(32),
    mail: {} as unknown as Dependencies["mail"],
    now: () => now,
    tokenFactory: () => "A".repeat(43),
    ...timings
  });
  return { built, resends };
}

describe("Turn 14 change-email timings", () => {
  it("gives a 24-hour link and a 60-second resend cooldown when the caller passes neither", async () => {
    const { built, resends } = service();
    await expect(built.resend(session, source)).rejects.toMatchObject({ code: "RESEND_COOLDOWN" });
    expect(resends).toEqual([{ expiresAt: new Date(now.getTime() + 24 * 3_600_000), cooldownMs: 60_000 }]);
  });

  it("uses a caller's own timings, and still refuses either one out of range", async () => {
    const { built, resends } = service({ tokenTtlMs: 3_600_000, resendCooldownMs: 1_000 });
    await expect(built.resend(session, source)).rejects.toMatchObject({ code: "RESEND_COOLDOWN" });
    expect(resends).toEqual([{ expiresAt: new Date(now.getTime() + 3_600_000), cooldownMs: 1_000 }]);
    expect(() => service({ resendCooldownMs: 999 })).toThrow("EMAIL_CHANGE_POLICY_INVALID");
    expect(() => service({ tokenTtlMs: 25 * 3_600_000 + 1 })).toThrow("EMAIL_CHANGE_POLICY_INVALID");
  });
});
