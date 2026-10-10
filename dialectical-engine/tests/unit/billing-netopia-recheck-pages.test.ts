// tests/unit/billing-netopia-recheck-pages.test.ts
// N9, ruling PR-30: the start's quarantine re-check reads keyset pages of at most 500 rows in (received_at,
// quarantine_id) order and loops until a short page, so a flood of stored rejections is never read at once.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { NoticeQuarantinePage, NoticeQuarantineRow } from "@debateai/db";
import { NetopiaNoticeIntake, type NetopiaNoticeIntakeDeps } from "../../apps/api/src/billing/netopia-intake.js";
import { recordingAudit, TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { testNetopiaKeys } from "../support/netopia-notice.js";

const POS = ["NT9P", "A6E5", "R0W5", "K3Y5", "ET00"].join("-");
const NOW = new Date("2026-10-07T06:00:00.000Z");

/** Rows whose seal does not open under the records key: each one is counted `failed`, nothing is stored. */
function flood(count: number): NoticeQuarantineRow[] {
  return Array.from({ length: count }, (_, index) => Object.freeze({
    quarantineId: randomUUID(), receivedAt: new Date(NOW.getTime() - 86_400_000 + index * 1_000),
    reason: "NOTICE_SIGNATURE_INVALID" as const, orderId: null, rawCiphertext: Buffer.from([1, 2, 3, index % 256]),
    headerCiphertext: null, keyId: "0".repeat(16)
  }));
}

function intakeOver(rows: ReadonlyArray<NoticeQuarantineRow>) {
  const pages: Array<Readonly<{ since: Date; page: NoticeQuarantinePage | undefined; returned: number }>> = [];
  const repository = {
    withTransaction: async <T>(work: (client: never) => Promise<T>) => work({} as never),
    quarantineSince: async (_client: unknown, since: Date, page?: NoticeQuarantinePage) => {
      const start = page?.after === null || page?.after === undefined ? 0
        : rows.findIndex((row) => row.quarantineId === page.after!.quarantineId) + 1;
      const slice = rows.slice(start, page === undefined ? undefined : start + page.limit);
      pages.push(Object.freeze({ since, page, returned: slice.length }));
      return slice;
    }
  } as unknown as NetopiaNoticeIntakeDeps["repository"];
  const audit = recordingAudit();
  const intake = new NetopiaNoticeIntake({
    repository, jobs: {} as NetopiaNoticeIntakeDeps["jobs"], trust: testNetopiaKeys().trust(POS),
    recordsKey: TEST_RECORDS_KEY, paymentEnvironment: "sandbox", mode: "ON", audit, kick: () => undefined
  });
  return { intake, pages, audit };
}

describe("N9 the quarantine re-check reads in pages (ruling PR-30)", () => {
  it("reads 500 rows a page, each page after the last row of the one before, until a short page", async () => {
    const rows = flood(1_201);
    const { intake, pages, audit } = intakeOver(rows);
    expect(await intake.recheckQuarantine(NOW)).toBe(0);
    expect(pages.map((entry) => [entry.page?.limit, entry.returned])).toEqual([[500, 500], [500, 500], [500, 201]]);
    expect(pages.map((entry) => entry.page?.after ?? null)).toEqual([
      null,
      { receivedAt: rows[499]!.receivedAt, quarantineId: rows[499]!.quarantineId },
      { receivedAt: rows[999]!.receivedAt, quarantineId: rows[999]!.quarantineId }
    ]);
    expect(pages.every((entry) => entry.since.getTime() === NOW.getTime() - 14 * 86_400_000)).toBe(true);
    expect(audit.events).toEqual([{ event: "billing.notice.recheck", fields: { quarantined: 1_201, verified: 0, failed: 1_201 } }]);
  });

  it("asks once more after an exactly full page, and writes no line for an empty quarantine", async () => {
    const full = intakeOver(flood(500));
    await full.intake.recheckQuarantine(NOW);
    expect(full.pages.map((entry) => entry.returned)).toEqual([500, 0]);
    const empty = intakeOver([]);
    expect(await empty.intake.recheckQuarantine(NOW)).toBe(0);
    expect(empty.pages).toHaveLength(1);
    expect(empty.audit.events).toEqual([]);
  });
});
