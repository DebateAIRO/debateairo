// tests/unit/public-report-carrier-maker.test.ts
// V4 start step, Task 56h-port (coordinator ruling of 8 Nov, option A): the run a visitor's report of a public debate is carried on, when nothing else
// can carry it, is a run of the visitor's own made only for that report: made through the one writer of encrypted runs on the visitor's session, under
// the owner's ask admission lease, with no work item and no battery row, marked as a report run of that debate; and a run already made for that debate
// (one a press that lost its race left unused) is used again, never a second one. Made-up ids only.
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import type { StartRunInput } from "@debateai/db";
import { PUBLIC_REPORT_CARRIER_MARK } from "@debateai/db";
import { PUBLIC_REPORT_RUN_QUESTION, publicReportCarrierMaker } from "../../apps/api/src/public-tree.js";

const PRESSER = Object.freeze({ ownerRef: "0b0b0b0b-0000-4000-8000-000000000001", userId: "0c0c0c0c-0000-4000-8000-000000000001", sessionId: "0d0d0d0d-0000-4000-8000-000000000001",
  free: true });
const DEBATE = "0e0e0e0e-0000-4000-8000-000000000001";
const LEASE_CLIENT = { lease: true } as unknown as PoolClient;

function world(kept: string | null) {
  const steps: string[] = [];
  const started: Readonly<{ input: StartRunInput; client: PoolClient }>[] = [];
  const make = publicReportCarrierMaker({
    readOwn: async (ownerRef, publicationRef) => { steps.push(`read ${ownerRef} ${publicationRef}`); return kept; },
    startRun: async (input, client) => { steps.push("start"); started.push({ input, client }); return "0f0f0f0f-0000-4000-8000-000000000009"; },
    withAdmissionLease: async (ownerRef, use) => { steps.push(`lease ${ownerRef}`); try { return await use(LEASE_CLIENT); } finally { steps.push("release"); } },
    site: { releaseKey: "r7-0123456789ab", batteryVersion: "battery-test" },
    now: () => new Date("2026-11-08T09:00:00.000Z")
  });
  return { make, steps, started };
}

describe("Task 56h-port: a run of the presser's own, made only to carry their report of a public debate", () => {
  it("none yet: one is made on the presser's session, inside the owner's admission lease, marked as this debate's report run, with nothing to run", async () => {
    const { make, steps, started } = world(null);
    expect(await make(PRESSER, DEBATE)).toBe("0f0f0f0f-0000-4000-8000-000000000009");
    expect(steps).toEqual([`lease ${PRESSER.ownerRef}`, `read ${PRESSER.ownerRef} ${DEBATE}`, "start", "release"]);
    const { input, client } = started[0]!;
    expect(client).toBe(LEASE_CLIENT);
    expect(input.principal).toEqual({ kind: "server", userId: PRESSER.userId, ownerRef: PRESSER.ownerRef });
    expect(input.sessionId).toBe(PRESSER.sessionId);
    expect(input.questionLine).toBe(PUBLIC_REPORT_RUN_QUESTION);
    // The mark names the debate (a public reference) and nothing else; the run has no battery row, so no work item is ever made for it.
    expect(input.depthParams).toEqual({ [PUBLIC_REPORT_CARRIER_MARK]: DEBATE });
    expect(input.batteryRows).toEqual([]);
    // The site's own release and its settings version, so the runner charges its calls to that version's guard.
    expect(input.releaseKey).toBe("r7-0123456789ab");
    expect(input.registerVersion).toBe(7);
    // Its envelope basis is the mark alone: no debate could ever be run on it (no envelope parses from it).
    expect(input.envelopeBasis).toEqual({ [PUBLIC_REPORT_CARRIER_MARK]: DEBATE });
    expect(input.asOf.toISOString()).toBe("2026-11-08T09:00:00.000Z");
    // Budget spec §2.7: every production run start carries a plan tier; a report run carries its presser's (Free here).
    expect(input.planTier).toBe("free");
  });

  it("a paid presser's report run carries the paid tier", async () => {
    const { make, started } = world(null);
    await make({ ...PRESSER, free: false }, DEBATE);
    expect(started[0]!.input.planTier).toBe("premium");
  });

  it("one already made for this debate (a press that lost its race left it unused): that one, and none is made", async () => {
    const { make, steps, started } = world("0f0f0f0f-0000-4000-8000-000000000001");
    expect(await make(PRESSER, DEBATE)).toBe("0f0f0f0f-0000-4000-8000-000000000001");
    expect(started).toEqual([]);
    expect(steps).toEqual([`lease ${PRESSER.ownerRef}`, `read ${PRESSER.ownerRef} ${DEBATE}`, "release"]);
  });
});
