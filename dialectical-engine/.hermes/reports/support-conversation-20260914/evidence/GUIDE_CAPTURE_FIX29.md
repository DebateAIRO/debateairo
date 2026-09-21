# GUIDE_CAPTURE_FIX29

- Ticket: `t_99f8b1a6`
- Revision: `456cafb9e56a737de550570b5736ec52d79ddf48`
- KB: `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`
- Verdict: `PASS_REAL_MESSAGE_SCREENSHOT_TARGET`
- Skills loaded: retained mission BODY/COMMON and verification floors from the established author session; no new skill was required.

## Finding and correction

The LIVE28 mismatch was a harness defect. The public component renders `source.label` in the source list (`Assistant.tsx:647-657`), and the staged observation consumer also compares labels. The sealed screenshot helper instead compared visible labels with `api.sources[].id` (`GUIDE_HARNESS_BIND21/screenshot-evidence-successor.mjs:98-102`). LIVE28 row 1 therefore compared `Navigate Dialectical Engine` with `app-navigation` after API and DOM projections had otherwise matched.

The successor helper compares visible labels with API labels and leaves the assistant count, target index, role, text, action, top/footer reachability and expanded-complete screenshot checks intact. The actual short row fixture exposed a second bounded harness condition: when the footer is already fully visible in the top view, requiring a strictly larger scroll position falsely rejects it. The successor accepts equal scroll positions only when the top-view footer is already contained; long overflow replies still require forward scrolling.

No product file changed and no UI defect was found.

## Focused evidence

The local-only browser fixture used the accepted LIVE28 row 1 text and the real public reply structure/classes. It covered short full EN, long full RO, long compact EN and short compact RO. All four produced complete, original-pane-top and original-pane-footer PNGs. Previous-article, wrong-index and stale-projection negatives rejected in every case. The sealed old helper reproduced `GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH`; the successor passed. Support attempts were zero.

Two representative PNGs were visually inspected: the complete short row includes the accepted answer and source footer; the complete long compact case includes the entire overheight answer plus source/action footer.

The final binding proof passed 25/25 controls. The retained full58 proof remains byte-identical at SHA-256 `1b5d7b296d5b5981d6391ebba27e8a35e03a0cd20cb671c7cf799494ee999520`; it was not rerun.

## Successor contract

The exact command contract has seven self-bound phases and fresh LIVE29 phase/UI/capacity/gate/row-proof/capture/idle paths. The actual receipt and 93 screenshots use the unused `GUIDE_LIVE_GUIDE22` namespace. The fixed31 plan remains 31 unique rows, five sessions, 14 EN/17 RO, at most 27 model calls and 31-second pacing. Runtime7 custody, product/KB, the private LIVE20 runtime log path, and the FIX22 deferred-owner contract/output are unchanged.

The reusable operator uses absolute `/Users/vladmihaimiron/.local/bin/node --import tsx`, exact cwd, narrow in-memory `SUPPORT_DATABASE_URL` selection, tool-captured stdout/stderr, numeric stop-first status and a 123-path invocation-time absence/collision set. Its metadata requires the previously proven `require_escalated` execution context. No operational invocation occurred here.

The successor capture records only the first two session creation observation timestamps (`ordinal`, `observedAtUtc`), with no session identifiers or capabilities, so later owner-session timing can use measured events.

## Capacity timing

`2026-09-21T03:21:15.789581Z` is the conservative five-session `NOT_BEFORE`, derived from root's LIVE28 completion/consumption upper bound `2026-09-21T02:21:10.789581Z` plus one hour and five seconds. It is planning evidence, not an exact prior session creation time or a capacity PASS. Two later owner sessions and six messages still require their own natural availability.

## Execution qualifications

The first local browser launch in the default sandbox failed before fixture execution because native browser process registration was denied. The required escalated local context then worked. A focused RED proved the already-visible short-footer false rejection before the final GREEN. A separate fixture-only trailing-space mismatch was corrected without changing the production contract. The final local-only fixture passed; no runtime, HTTP, status, capacity, database, Support or model traffic occurred.

Forgot password remains unresolved/actionless. This node does not claim CP1/CP2 acceptance or readiness.
