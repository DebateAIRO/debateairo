/**
 * V4 start step, Task 59 (spec 2026-11-03 §7, the map pages): a debate with chosen paths (a v2 run, its paths sealed by
 * 0156's `core.start_path_set`) has no classic map view. Its page reads the paths from `Answer.branches` (Tasks 57, 58
 * and 60), so GET /v1/answers/{id}/map finds no map for it and a publication copies none, and the map choice is never
 * read for it. The owner check asks `core.read_start_path_ids` (0156: the run's path ids, NULL without a set) only for
 * the caller's own run, after the owner query. An R22 run reads exactly as before.
 */
import { describe, expect, it } from "vitest";
import type { RunOwnershipAccess } from "@debateai/db";
import {
  RepositoryAnswerMapViewApplication, runOwnerCheckFrom,
  type MapRunFindInput, type MapViewReadInput, type MapViewSource, type RunOwnerCheck
} from "../../apps/api/src/map-views.js";
import { STORY_TEST_ANSWER_ID, STORY_TEST_RUN_ID } from "../support/storyApiFixtures.js";

const OWNERSHIP: RunOwnershipAccess = Object.freeze({ ownerRef: "00000000-0000-4000-8000-0000000000aa", legacyAskerId: null });
const ROOT_A = "a0000000-0000-4000-8000-00000000000a";
const ROOT_B = "b0000000-0000-4000-8000-00000000000b";
const RECORD: MapViewSource = Object.freeze({
  answers: [{ statement: "Move gradually.", rootNodeId: ROOT_A }, { statement: "Move now.", rootNodeId: ROOT_B }],
  alsoRaised: [{ claim: "Ask the school.", makers: ["A"] }]
});
const FIND: MapRunFindInput = Object.freeze({ answerId: STORY_TEST_ANSWER_ID, ownership: OWNERSHIP });
const READ: MapViewReadInput = Object.freeze({ runId: STORY_TEST_RUN_ID, nodeIds: new Set([ROOT_A, ROOT_B]), ownership: OWNERSHIP });

/** A map choice reader that records every call. */
function recordingReader(log: string[]) {
  return {
    readMapOpeningForRun: async (runId: string) => {
      log.push(`opening:${runId}`);
      return "MAP" as const;
    },
    readMapChoiceForRun: async (runId: string) => {
      log.push(`choice:${runId}`);
      return RECORD;
    }
  };
}

/** An owner check that records every call; `pathRun` undefined = a composition without the path-run question. */
function recordingOwner(owned: boolean, pathRun: boolean | undefined, log: string[]): RunOwnerCheck {
  return {
    owns: async (runId) => {
      log.push(`owns:${runId}`);
      return owned;
    },
    ownedRunOfAnswer: async (answerId) => {
      log.push(`owner:${answerId}`);
      return owned ? STORY_TEST_RUN_ID : null;
    },
    ...(pathRun === undefined ? {} : {
      isPathRun: async (runId: string) => {
        log.push(`paths:${runId}`);
        return pathRun;
      }
    })
  };
}

describe("the classic map view of a debate with chosen paths", () => {
  it("finds no map and reads no view, and the map choice is never read", async () => {
    const log: string[] = [];
    const app = new RepositoryAnswerMapViewApplication(recordingReader(log), recordingOwner(true, true, log));
    expect(await app.findMapRun(FIND)).toBeNull();
    expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`, `paths:${STORY_TEST_RUN_ID}`]);
    log.length = 0;
    expect(await app.readMapView(READ)).toBeNull();
    expect(log).toEqual([`owns:${STORY_TEST_RUN_ID}`, `paths:${STORY_TEST_RUN_ID}`]);
  });

  it("asks nothing about paths for a caller who does not own the run", async () => {
    const log: string[] = [];
    const app = new RepositoryAnswerMapViewApplication(recordingReader(log), recordingOwner(false, true, log));
    expect(await app.findMapRun(FIND)).toBeNull();
    expect(await app.readMapView(READ)).toBeNull();
    expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`, `owns:${STORY_TEST_RUN_ID}`]);
  });
});

describe("an R22 run's map view is unchanged", () => {
  const VIEW = { positions: [{ node_id: ROOT_A, answer: "Move gradually." }, { node_id: ROOT_B, answer: "Move now." }],
    also_raised: ["Ask the school."] };

  it("is found and read after the path-run question says no", async () => {
    const log: string[] = [];
    const app = new RepositoryAnswerMapViewApplication(recordingReader(log), recordingOwner(true, false, log));
    expect(await app.findMapRun(FIND)).toBe(STORY_TEST_RUN_ID);
    expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`, `paths:${STORY_TEST_RUN_ID}`, `opening:${STORY_TEST_RUN_ID}`]);
    log.length = 0;
    expect(await app.readMapView(READ)).toEqual(VIEW);
    expect(log).toEqual([`owns:${STORY_TEST_RUN_ID}`, `paths:${STORY_TEST_RUN_ID}`, `choice:${STORY_TEST_RUN_ID}`]);
  });

  it("reads as before with an owner check that cannot ask about paths", async () => {
    const log: string[] = [];
    const app = new RepositoryAnswerMapViewApplication(recordingReader(log), recordingOwner(true, undefined, log));
    expect(await app.findMapRun(FIND)).toBe(STORY_TEST_RUN_ID);
    expect(await app.readMapView(READ)).toEqual(VIEW);
    expect(log).toEqual([`owner:${STORY_TEST_ANSWER_ID}`, `opening:${STORY_TEST_RUN_ID}`, `owns:${STORY_TEST_RUN_ID}`, `choice:${STORY_TEST_RUN_ID}`]);
  });
});

describe("the database's answer", () => {
  it("asks core.read_start_path_ids, and only a true answer is a path run", async () => {
    const queries: { text: string; values: unknown[] }[] = [];
    const check = (rows: readonly Readonly<{ path_run?: unknown }>[]) => runOwnerCheckFrom(async (text, values) => {
      queries.push({ text, values });
      return { rows };
    });
    expect(await check([{ path_run: true }]).isPathRun!(STORY_TEST_RUN_ID)).toBe(true);
    expect(queries).toEqual([{ text: "SELECT core.read_start_path_ids($1) IS NOT NULL AS path_run", values: [STORY_TEST_RUN_ID] }]);
    expect(await check([{ path_run: false }]).isPathRun!(STORY_TEST_RUN_ID)).toBe(false);
    expect(await check([]).isPathRun!(STORY_TEST_RUN_ID)).toBe(false);
    expect(await check([{ path_run: "true" }]).isPathRun!(STORY_TEST_RUN_ID)).toBe(false);
  });
});
