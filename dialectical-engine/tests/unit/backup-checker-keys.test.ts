// The backup checker's call site: the first checker's own key with ":BACKUP" after it. Every reader that reads a call-site key
// must read a backup checker's key exactly as it reads its first checker's key, and must refuse the suffix after a writer's key.
// One table drives every reader over every first-checker key the write-and-check loop uses and its backup twin.
import { describe, expect, it } from "vitest";
import {
  BACKUP_CHECKER_KEY_SUFFIX, STRUCTURE_REPAIR_CALL_SITE_PREFIX, backupCheckerCallSiteKey, debateRoleFromCallSiteKey, firstCheckerKeyOfBackup,
  lengthCallStepOf, readWithBackupCheckerKey
} from "@debateai/kernel";
import {
  buildFramedPrompt, parsePreviewProviderTestConfig, previewCallTierOf, previewFinalWriterRoleOf, previewThinkingStepOf, withPreviewProviderCallPolicy,
  type ProviderCallRequest, type ProviderCallResult
} from "@debateai/providers";
import {
  STORY_CHECKER_V4_CONTRACT_ID, answerUpdateCallSiteRole, contributionCheckCallSiteRole, investigationReportCallSiteRole, pathClimbCallSiteRole,
  pathOutcomeCallSiteRole, pathRewriteCallSiteRole, pathRewriteThinkingOf, publicReportCallSiteRole
} from "@debateai/story";
import { providerCallCostEnvelopePhase, providerCallSharedWall, storyCallScopeAgrees } from "../../apps/runner/src/index.js";
import { isPathRewriteCallSite } from "../../apps/runner/src/path-rewrite-scope.js";

type Lane = "story" | "served";
type Site = Readonly<{ key: string; lane: Lane }>;

/** Every first checker's key the write-and-check loop sends, with the lane it is sent on. */
const CHECKER_SITES: readonly Site[] = Object.freeze([
  { key: "STORY:CHECKER:1", lane: "story" }, { key: "STORY:CHECKER:4", lane: "story" }, { key: "STORY:CHECKER:8", lane: "story" },
  { key: "PATH_REWRITE:CHECKER:1", lane: "story" }, { key: "PATH_REWRITE:CHECKER:4", lane: "story" },
  { key: "PATH_CLIMB:CHECKER:2", lane: "story" },
  { key: "PATH_OUTCOME:CHECKER:3:1", lane: "served" }, { key: "PATH_OUTCOME:CHECKER:8:2", lane: "served" },
  { key: "INVESTIGATION_REPORT:ANSWER_CHECK:1", lane: "story" }, { key: "INVESTIGATION_REPORT:STORY_CHECK:4", lane: "story" },
  { key: "ANSWER_UPDATE:ANSWER_CHECK:2", lane: "story" },
  { key: "PUBLIC_REPORT:ANSWER_CHECK:1", lane: "story" }, { key: "PUBLIC_REPORT:STORY_CHECK:3", lane: "story" },
  { key: "POST_COMPOSE_R9:EVALUATOR:1", lane: "served" }, { key: "POST_COMPOSE_R9:EVALUATOR:2", lane: "served" }
]);

/** Writers' keys (and other calls' keys) of the same families: the suffix after any of them names no call site. */
const OTHER_SITES: readonly Site[] = Object.freeze([
  { key: "STORY:STORYTELLER:1", lane: "story" }, { key: "STORY:STORYTELLER:3", lane: "story" }, { key: "STORY:CHARTS:1", lane: "story" },
  { key: "PATH_REWRITE:WRITER:1", lane: "story" }, { key: "PATH_REWRITE:SUGGEST:1", lane: "story" }, { key: "PATH_CLIMB:WRITER:3", lane: "story" },
  { key: "PATH_OUTCOME:WRITER:3:1", lane: "served" },
  { key: "INVESTIGATION_REPORT:ANSWER:1", lane: "story" }, { key: "INVESTIGATION_REPORT:ANSWER_ASKED:1", lane: "story" },
  { key: "INVESTIGATION_REPORT:STORY:2", lane: "story" }, { key: "ANSWER_UPDATE:ANSWER:1", lane: "story" },
  { key: "PUBLIC_REPORT:STORY:1", lane: "story" },
  { key: "COMPOSER:SYNTHESIZER:INITIAL:1", lane: "served" }, { key: "COMPOSER:SYNTHESIZER:RETRY:2", lane: "served" },
  { key: "JUDGE:root:1", lane: "served" }, { key: "PANEL:JUDGE:root:1:1", lane: "served" }, { key: "JUDGE:review:abc", lane: "served" },
  { key: "CONTRIBUTION_CHECK:CHECKER:1", lane: "story" }
]);

const ROLES = ["SYNTHESIZER", "EVALUATOR", "JUDGE"] as const;

/** Every reader's answer for one key on one lane, in one object, so a twin can be compared whole. */
function readings(key: string, lane: Lane) {
  return {
    debateRole: debateRoleFromCallSiteKey(key),
    lengthStep: lengthCallStepOf(key),
    lengthStepOnLane: lengthCallStepOf(key, lane),
    thinkingStep: previewThinkingStepOf({ callSiteKey: key, lane }),
    finalWriterRoles: ROLES.map((role) => previewFinalWriterRoleOf({ callSiteKey: key, lane, role })),
    callTiers: ROLES.map((role) => previewCallTierOf({ callSiteKey: key, lane, role })),
    pathRewriteRole: pathRewriteCallSiteRole(key),
    pathRewriteThinking: pathRewriteThinkingOf(key),
    pathClimbRole: pathClimbCallSiteRole(key),
    pathOutcomeRole: pathOutcomeCallSiteRole(key),
    reportRole: investigationReportCallSiteRole(key),
    answerUpdateRole: answerUpdateCallSiteRole(key),
    publicReportRole: publicReportCallSiteRole(key),
    pathRewriteSite: isPathRewriteCallSite(key),
    scopeAgrees: ROLES.flatMap((role) => (["story", "served"] as const).map((onLane) =>
      storyCallScopeAgrees({ lane: onLane, callSiteKey: key, role }))),
    repairScopeAgrees: ROLES.map((role) => storyCallScopeAgrees({ lane, callSiteKey: `${STRUCTURE_REPAIR_CALL_SITE_PREFIX}${key}`, role })),
    phases: ROLES.map((role) => providerCallCostEnvelopePhase({ role, lane, callSiteKey: key })),
    walls: ROLES.map((role) => providerCallSharedWall({ role, lane, callSiteKey: key }))
  };
}

describe("the backup checker's key", () => {
  it("is the first checker's key with one suffix, and reads back to it", () => {
    expect(BACKUP_CHECKER_KEY_SUFFIX).toBe(":BACKUP");
    expect(backupCheckerCallSiteKey("PATH_REWRITE:CHECKER:1")).toBe("PATH_REWRITE:CHECKER:1:BACKUP");
    expect(firstCheckerKeyOfBackup("PATH_REWRITE:CHECKER:1:BACKUP")).toBe("PATH_REWRITE:CHECKER:1");
    expect(firstCheckerKeyOfBackup("PATH_REWRITE:CHECKER:1")).toBeNull();
    // At most one suffix: a backup's own backup is no key, and neither is the suffix alone.
    expect(() => backupCheckerCallSiteKey("PATH_REWRITE:CHECKER:1:BACKUP")).toThrow();
    expect(() => backupCheckerCallSiteKey("")).toThrow();
    expect(firstCheckerKeyOfBackup("PATH_REWRITE:CHECKER:1:BACKUP:BACKUP")).toBeNull();
    expect(firstCheckerKeyOfBackup(":BACKUP")).toBeNull();
  });

  it("a reader wrapped by the helper keeps a backup key only when its first key reads as a checker's", () => {
    const read = (key: string) => (key === "A:CHECKER" ? "checker" : key === "A:WRITER" ? "writer" : null);
    const isChecker = (answer: string) => answer === "checker";
    expect(readWithBackupCheckerKey("A:CHECKER", read, isChecker)).toBe("checker");
    expect(readWithBackupCheckerKey("A:CHECKER:BACKUP", read, isChecker)).toBe("checker");
    expect(readWithBackupCheckerKey("A:WRITER", read, isChecker)).toBe("writer");
    expect(readWithBackupCheckerKey("A:WRITER:BACKUP", read, isChecker)).toBeNull();
    expect(readWithBackupCheckerKey("B:OTHER:BACKUP", read, isChecker)).toBeNull();
  });
});

describe("every reader reads a backup checker's key as its first checker's key", () => {
  it.each(CHECKER_SITES.map((site) => [site.key, site.lane] as const))("%s on the %s lane and its twin give the same answers", (key, lane) => {
    const first = readings(key, lane);
    expect(readings(backupCheckerCallSiteKey(key), lane)).toEqual(first);
    // The twin is a real call site wherever its first key is one: a story-lane checker is a story call with the checker's role.
    if (lane === "story") expect(storyCallScopeAgrees({ lane, callSiteKey: backupCheckerCallSiteKey(key), role: "EVALUATOR" })).toBe(true);
  });

  it.each(OTHER_SITES.map((site) => [site.key, site.lane] as const))("%s with the suffix is no call site of any reader", (key, lane) => {
    const twin = `${key}${BACKUP_CHECKER_KEY_SUFFIX}`;
    const read = readings(twin, lane);
    expect(read.debateRole).toBeNull();
    expect(read.lengthStep).toBeNull();
    expect(read.lengthStepOnLane).toBeNull();
    expect(read.thinkingStep).toBeNull();
    expect(read.finalWriterRoles).toEqual([null, null, null]);
    expect(read.callTiers).toEqual(["STANDARD", "STANDARD", "STANDARD"]);
    expect([read.pathRewriteRole, read.pathRewriteThinking, read.pathClimbRole, read.pathOutcomeRole, read.reportRole, read.answerUpdateRole,
      read.publicReportRole]).toEqual([null, null, null, null, null, null, null]);
    expect(read.pathRewriteSite).toBe(false);
    // The story lane takes no such key with any role.
    for (const role of ROLES) expect(storyCallScopeAgrees({ lane: "story", callSiteKey: twin, role })).toBe(false);
  });

  it("the contribution check is not the write-and-check loop: its key takes no backup suffix", () => {
    expect(contributionCheckCallSiteRole("CONTRIBUTION_CHECK:CHECKER:1")).toBe("EVALUATOR");
    expect(contributionCheckCallSiteRole("CONTRIBUTION_CHECK:CHECKER:1:BACKUP")).toBeNull();
  });

  it("a structure-repair call of a backup checker's call is read as a repair, as the first checker's repair is", () => {
    for (const site of CHECKER_SITES) {
      const repair = `${STRUCTURE_REPAIR_CALL_SITE_PREFIX}${backupCheckerCallSiteKey(site.key)}`;
      expect(lengthCallStepOf(repair)).toBe("structure_repair");
      expect(previewThinkingStepOf({ callSiteKey: repair, lane: site.lane })).toBe("slip_fix");
    }
  });
});

describe("the preview runs a backup story checker exactly as the first one", () => {
  const MODEL = "zai-org/GLM-5.3-Flash";
  const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
    deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "backup-checker-keys-fixture"
  }))!;
  const RESULT: ProviderCallResult = {
    content: "{}", rawArtifactRef: "artifact:fixture", ledgerEntryRef: "ledger:fixture",
    provider: "openai-compatible-http", model: MODEL, maker: "Z.AI", modelVersion: MODEL
  };
  const checkerRequest = (callSiteKey: string): ProviderCallRequest => {
    const framed = buildFramedPrompt({
      contract: { contractId: STORY_CHECKER_V4_CONTRACT_ID, instruction: "Check the synthetic story.", answerForm: "Return one JSON object." },
      material: [{ name: "candidate_story", content: "A synthetic story." }]
    });
    return {
      runId: "run:synthetic", subjectItemId: "story:synthetic", callSiteKey, role: "EVALUATOR", lane: "story",
      bound: { maxAttempts: 2, tokenCeiling: 2048, deadlineMs: 180_000 }, contractHash: "contract:synthetic", providerRef: "preview:fixture-a",
      packet: framed.packet, preferredResponseFormat: "json_object", classifyContent: () => ({ parseStatus: "PARSED", parseError: null }),
      buildRepairPacket: () => framed.packet
    };
  };
  const forwarded = async (request: ProviderCallRequest): Promise<ProviderCallRequest> => {
    let received: ProviderCallRequest | undefined;
    await withPreviewProviderCallPolicy({ call: async (effective) => { received = effective; return RESULT; } }, CONFIG, { model: MODEL }).call(request);
    if (received === undefined) throw new Error("PREVIEW_REQUEST_NOT_FORWARDED");
    return received;
  };

  it("the same repair try, the same token floor and the same thinking level", async () => {
    const request = checkerRequest("STORY:CHECKER:1");
    const first = await forwarded(request);
    const backup = await forwarded({ ...request, callSiteKey: backupCheckerCallSiteKey(request.callSiteKey) });
    const { callSiteKey: _first, ...firstRest } = first;
    const { callSiteKey: _backup, ...backupRest } = backup;
    expect(backupRest).toEqual(firstRest);
    // The story checker's own repair try: two POSTs in the call. A key the preview did not take for a story checker gets one.
    expect(backup.maxAttemptsThisCall).toBe(2);
    expect((await forwarded({ ...request, callSiteKey: "STORY:CHECKER:1:OTHER" })).maxAttemptsThisCall).toBe(1);
  });
});
