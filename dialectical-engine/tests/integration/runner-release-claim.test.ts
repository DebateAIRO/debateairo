// Side-by-side spec §3 (plan B Task B6): two releases live at once never run each other's debates. A runner of release
// r1 handed a work item of a release-r2 debate (a job sent to the wrong task, an old retry, a hand dispatch) answers
// NO_WORK with one content-free RUNNER_RELEASE_MISMATCH line, BEFORE any claim probe or model call, and leaves the
// item exactly as it found it: READY and unclaimed, for r2's own runner. The REAL WalkingSkeletonRunner, composed as
// apps/runner/src/main.ts composes it on the preview (tests/support/preview-debate-harness.ts), on a migrated embedded
// PostgreSQL. Integration suites are skipped by the CI gate: run this file by hand before merging.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "@debateai/db";
import { PANEL_REFS, previewDebateHarness } from "../support/preview-debate-harness.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const stubClosers: (() => Promise<void>)[] = [];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(stubClosers.splice(0).map((close) => close()));
});
afterAll(async () => database?.stop());

const { startGates, previewRunner, admittedRun } = previewDebateHarness({ pool: () => database.pool, stubClosers });

const THIS_RELEASE = ["r1", "aaaaaaaaaaaa"].join("-");
const OTHER_RELEASE = ["r2", "bbbbbbbbbbbb"].join("-");

describe("a runner never runs another release's debate (side-by-side §3)", () => {
  it("answers NO_WORK with its own line, before any probe or call, and leaves the item READY and unclaimed", async () => {
    const { workItemId } = await admittedRun("other-release", { panelRefs: PANEL_REFS, releaseKey: OTHER_RELEASE });
    const gates = await startGates({});
    const composed = await previewRunner(gates, "single", { releaseKey: THIS_RELEASE });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(composed.runner.executeWorkItem(workItemId)).resolves.toEqual({ kind: "NO_WORK" });

    expect(gates.requests).toEqual([]);
    const row = (await database.pool.query<{ state: string; claimed_by: string | null }>(
      "SELECT state, claimed_by FROM core.work_item WHERE work_item_id = $1", [workItemId])).rows[0];
    expect(row).toEqual({ state: "READY", claimed_by: null });
    const mismatchLines = warn.mock.calls
      .map(([line]) => { try { return JSON.parse(String(line)) as Record<string, unknown>; } catch { return null; } })
      .filter((line) => line?.event === "RUNNER_RELEASE_MISMATCH");
    expect(mismatchLines).toEqual([{
      kind: "DEBATEAI_RUNNER_CLAIM", event: "RUNNER_RELEASE_MISMATCH", workItemId,
      runReleaseKey: OTHER_RELEASE, releaseKey: THIS_RELEASE
    }]);
  });
});
