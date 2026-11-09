// tests/unit/public-report-carrier-export.test.ts
// V4 start step, Task 56h-port (coordinator ruling of 8 Nov, option A): a run made only to carry a visitor's report of a public debate is listed in
// the person's data export like each of their runs, and says what it is: a report run (kind PUBLIC_REPORT_RUN). Every other run reads as before.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { collectSnapshot, type RawExportRows } from "../../apps/api/src/data-export/snapshot.js";

const rawFixture = JSON.parse(readFileSync(new URL("../fixtures/data-export/raw-a.json", import.meta.url), "utf8"));
const claim = { exportId: "export-1", userId: "user-1", ownerRef: "owner-1", sessionId: "session-1", locale: "en", requestedAt: new Date("2026-10-05T00:00:00.000Z"), attempt: 1 };

function collect(depthParams: unknown) {
  const raw = structuredClone(rawFixture) as Record<string, any>;
  raw.runs[0].depth_params = depthParams;
  const ownerView = {
    runKeyPresent: vi.fn(async () => true), runRemovedByCheck: vi.fn(async () => false), readSynthesisChecks: vi.fn(async () => []), readPublicationReviews: vi.fn(async () => []),
    readRun: vi.fn(async () => ({ run_ref: "run-1", question_line: "A report on a public debate", state: "QUEUED", terminal_reason: null, hold_until: null })),
    readRunAnswer: vi.fn(async () => null), readAnswer: vi.fn(), readInspection: vi.fn(), readLedgerDigest: vi.fn(), readStory: vi.fn(), readDisclosure: vi.fn(), readNode: vi.fn(),
    resolveRunRef: vi.fn(async (run: string) => run)
  };
  const decrypt = {
    openPublicFlag: vi.fn(async (): Promise<unknown> => { throw new Error("no sealed report in this fixture"); }),
    openUserField: vi.fn(async (_user: string, field: string) => `PLAIN:${field}`), openRecord: vi.fn(() => "PLAIN:record"),
    openSupport: vi.fn(async () => "PLAIN:support"), openRunContent: vi.fn(async (): Promise<readonly unknown[] | null> => [])
  };
  return collectSnapshot({ claim, workerId: "worker-1", source: { readRaw: async () => raw as unknown as RawExportRows }, ownerView: ownerView as never, decrypt: decrypt as never,
    now: () => new Date("2026-10-06T00:00:00.000Z") });
}

describe("Task 56h-port: the data export lists a report run as one", () => {
  it("a run marked as a public debate's report run reads kind PUBLIC_REPORT_RUN, with its question and state", async () => {
    const entry = (await collect({ public_report_carrier: "0e0e0e0e-0000-4000-8000-000000000001" })).debates.debates[0]!;
    expect(entry).toMatchObject({ kind: "PUBLIC_REPORT_RUN", content_status: "READABLE", question: "A report on a public debate", state: "QUEUED" });
  });

  it("any other run has no kind, as before", async () => {
    const entry = (await collect({ depth: 1 })).debates.debates[0]!;
    expect(Object.hasOwn(entry, "kind")).toBe(false);
  });
});
