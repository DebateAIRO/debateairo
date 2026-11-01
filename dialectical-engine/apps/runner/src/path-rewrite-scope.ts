import {
  ANSWER_UPDATE_CALL_SITE_PREFIX as STORY_ANSWER_UPDATE_CALL_SITE_PREFIX, CONTRIBUTION_CHECK_CALL_SITE_PREFIX as STORY_CONTRIBUTION_CHECK_CALL_SITE_PREFIX,
  PATH_CLIMB_CALL_SITE_PREFIX as STORY_PATH_CLIMB_CALL_SITE_PREFIX, PUBLIC_REPORT_CALL_SITE_PREFIX as STORY_PUBLIC_REPORT_CALL_SITE_PREFIX,
  contributionCheckCallSiteRole as storyContributionCheckCallSiteRole, publicReportCallSiteRole as storyPublicReportCallSiteRole,
  answerUpdateCallSiteRole as storyAnswerUpdateCallSiteRole, pathClimbCallSiteRole as storyPathClimbCallSiteRole,
  pathRewriteCallSiteRole as storyPathRewriteCallSiteRole
} from "@debateai/story";

/**
 * Plan 2026-10-30 dig-model revision W3-2 (for W3-5) — A DIG'S PATH REWRITE ON THE STORY LANE. The rewrite's calls run
 * after the dig settled, in the story's place, each naming the dig's own run: the writer at `PATH_REWRITE:WRITER:{n}`
 * (a SYNTHESIZER call) and the checker at `PATH_REWRITE:CHECKER:{n}` (an EVALUATOR call), n 1 to 4 (3 and 4: the backup
 * writer and checker of another maker). W3-7: the keys are packages/story/src/path-rewrite.ts `PATH_REWRITE_CALL_SITE`,
 * the one pattern (no copy here). The gateway's story scope accepts them with that role only, and charges them on the
 * PATH_REWRITE seam, which is never walled (packages/budget `pathRewriteSeam`): a dig that started always gets its rewrite.
 */
export const PATH_REWRITE_CALL_SITE_PREFIX = "PATH_REWRITE:";

/** The role a well-formed path-rewrite call site carries, or null for any other key. */
export function pathRewriteCallSiteRole(callSiteKey: string): "SYNTHESIZER" | "EVALUATOR" | null {
  return storyPathRewriteCallSiteRole(callSiteKey);
}

/** R22 decision 2: the climb's sites, the same roles, charged on their own never-walled PATH_CLIMB seam. */
export const PATH_CLIMB_CALL_SITE_PREFIX = STORY_PATH_CLIMB_CALL_SITE_PREFIX;
export const pathClimbCallSiteRole = storyPathClimbCallSiteRole;
/** R22 decision 3: the main-answer update's sites, charged on their own never-walled ANSWER_UPDATE seam. */
export const ANSWER_UPDATE_CALL_SITE_PREFIX = STORY_ANSWER_UPDATE_CALL_SITE_PREFIX;
export const answerUpdateCallSiteRole = storyAnswerUpdateCallSiteRole;

/** Decision 13: the AI check on a contribution, and a report on a public debate, each on its own never-walled seam. */
export const CONTRIBUTION_CHECK_CALL_SITE_PREFIX = STORY_CONTRIBUTION_CHECK_CALL_SITE_PREFIX;
export const contributionCheckCallSiteRole = storyContributionCheckCallSiteRole;
export const PUBLIC_REPORT_CALL_SITE_PREFIX = STORY_PUBLIC_REPORT_CALL_SITE_PREFIX;
export const publicReportCallSiteRole = storyPublicReportCallSiteRole;

export function isPathRewriteCallSite(callSiteKey: string): boolean {
  return pathRewriteCallSiteRole(callSiteKey) !== null;
}
