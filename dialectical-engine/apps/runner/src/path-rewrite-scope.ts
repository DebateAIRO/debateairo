/**
 * Plan 2026-10-30 dig-model revision W3-2 (for W3-5) — A DIG'S PATH REWRITE ON THE STORY LANE. The rewrite's calls run
 * after the dig settled, in the story's place, each naming the dig's own run: the writer at `PATH_REWRITE:WRITER:{n}`
 * (a SYNTHESIZER call) and the checker at `PATH_REWRITE:CHECKER:{n}` (an EVALUATOR call), n 1 to 4 (3 and 4: the backup
 * writer and checker of another maker). The same keys as packages/story/src/path-rewrite.ts `PATH_REWRITE_CALL_SITE`.
 * The gateway's story scope accepts them with that role only, and charges them on the PATH_REWRITE seam, which is never
 * walled (packages/budget `pathRewriteSeam`): a dig that started always gets its rewrite.
 */
const PATH_REWRITE_CALL_SITE = /^PATH_REWRITE:(WRITER|CHECKER):[1-4]$/u;
export const PATH_REWRITE_CALL_SITE_PREFIX = "PATH_REWRITE:";

/** The role a well-formed path-rewrite call site carries, or null for any other key. */
export function pathRewriteCallSiteRole(callSiteKey: string): "SYNTHESIZER" | "EVALUATOR" | null {
  const site = PATH_REWRITE_CALL_SITE.exec(callSiteKey);
  if (site === null) return null;
  return site[1] === "WRITER" ? "SYNTHESIZER" : "EVALUATOR";
}

export function isPathRewriteCallSite(callSiteKey: string): boolean {
  return pathRewriteCallSiteRole(callSiteKey) !== null;
}
