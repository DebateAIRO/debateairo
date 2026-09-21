# GUIDE_CAPTURE_FIX30

- Ticket: `t_ce9f0dca`
- Native session: `/root/preview`
- Revision: `456cafb9e56a737de550570b5736ec52d79ddf48`
- KB: `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`
- Verdict: `PASS_COMPLETE_FULL_ANSWER_CAPTURE`
- Usage: `UNAVAILABLE`

## Skills loaded

Read in this continuation: `GUIDE_CAPTURE_FIX30.md` and `COMMON.md`. The established author session retained the previously loaded heartbeat/BODY protocol and verification floors; no new Codex skill was invoked.

## Finding

REVIEW29 was correct. The FIX29 helper expanded only `.supportChatScroll`, while the real full-page chain also includes the height-constrained grid containers and `.supportDesk { height: calc(100vh - 32px); overflow: hidden; }`. Playwright produced a tall PNG, but the outer root clipped the painted answer. Dimensions and file existence therefore gave a false completeness claim.

The inert full-RO reproduction used the actual public ancestor structure: `supportDesk → supportDeskBody → supportAgent → supportChatScroll → supportConversation → current assistant article`. Under the old pane-only helper, changing footer, source and action paint produced the same PNG SHA-256. The old image showed the top of the answer plus blank clipped space and omitted the footer.

## Correction

The successor helper releases fixed height and overflow constraints along the selected current article's entire ancestor chain through the exact root. It explicitly handles the full desk and agent grid rows, expands the pane, and temporarily enlarges the viewport when required. It saves and restores every affected ancestor's exact inline style text, scroll offsets, page scroll and viewport.

Restoration runs in `finally` paths. The outer capture also restores the original pane scroll after taking the separate top and footer views. The label-to-label source projection, current article count/index/role/text/action equality, short already-contained footer rule, and stale/previous/wrong-index rejections remain unchanged.

## Evidence

The final local-only browser frame passed four cases and twelve negatives with zero Support attempts:

- actual short full EN row 1: 760×210;
- long full RO: 760×562;
- long compact EN: 340×948;
- short compact RO: 340×268.

The corrected long full-RO PNG was visually inspected. It contains the green target top marker, the full long answer, the footer, the red `Navighează în Dialectical Engine` source and the blue `Deschide Ajutor` action. Independent top, footer, source and action color mutations each changed the corrected PNG hash. The old clipped helper ignored the footer/source/action mutation. Success and forced screenshot-exception cases both restored styles, scroll state and viewport exactly.

Screenshot controls passed with result `PASS_COMPLETE_FULL_ANSWER_CAPTURE`. Final binding controls passed 34/34. The retained full58 proof stays byte-identical at `1b5d7b296d5b5981d6391ebba27e8a35e03a0cd20cb671c7cf799494ee999520`; no product suite, typecheck or broad corpus run was repeated.

## Operational binding

The new command, gate and operator contracts change only the helper/capture and necessary contract hashes. Every still-unused LIVE29 phase/UI/capacity/gate/row-proof/profile/operator path and the `GUIDE_LIVE_GUIDE22` actual response/screenshot namespace remain unchanged. All seven phase argv entries self-bind the exact FIX30 command contract. The fixed31 plan remains 31 unique cases, five sessions, 14 EN/17 RO, at most 27 model calls and 31-second pacing.

The reusable operator retains absolute `node --import tsx`, narrow in-memory `SUPPORT_DATABASE_URL`, numeric stop-first status, tool-captured stdout/stderr without outer redirection, and 123 unique invocation-time absence paths. Runtime7, product456, KB7ef, the private LIVE20 log path, FIX22 deferred-owner contract/output, and the unused LIVE25 owner-testability path are unchanged. Later LIVE29 must invoke it using `require_escalated`.

The first and second session observation timestamps remain identifier-free. The conservative five-session `NOT_BEFORE` remains exactly `2026-09-21T03:21:15.789581Z`; it is planning evidence rather than a capacity PASS.

## Process reconstruction and upgrades

The recurring cost came from treating evidence plumbing as secondary. Three screenshot defects escaped in sequence: label-vs-ID comparison, a short footer requiring impossible positive scroll, and outer-ancestor clipping hidden by a nonzero PNG. Each caused another sealed packet, review, rebinding cycle and delayed live sampling.

The strongest upgrades are:

1. Make paint influence the screenshot oracle. Completeness must require top, body, source, action and footer mutations to affect the final image, alongside restoration checks.
2. Build fixtures from the actual DOM and clipping chain. Generic single-pane markup cannot validate a nested grid with an overflow-hidden root.
3. Generate command, gate, operator, path ownership and manifest data from one typed contract. Hand-copied namespaces and hashes repeatedly created rework.
4. Run the exact production child boundary inertly before allocating capacity. Environment, wrapper ownership, output absence and proof consumption should be one pre-traffic test.
5. Record minimal timing evidence on the first attempt. Identifier-free session creation timestamps prevent later capacity scheduling from depending on upper bounds.
6. Use one staged prompt pipeline: compile requirements into canonical rows and proof obligations; generate fixtures/contracts; run deterministic controls; obtain independent review; only then issue the single live capture. Any failed invariant stops before quota use.

This would make the workflow closer to a one-prompt machine: the prompt supplies policy and coverage, while a deterministic compiler produces artifacts, validates exact runtime boundaries and emits either a sealed executable operator or a finite pre-traffic failure.

No product, Git, runtime, HTTP, status, capacity, database, Support or model action occurred. Product source custody remains the existing clean revision; typecheck limitations are unchanged. Forgot password remains unresolved/actionless. This is not CP1/CP2 acceptance or readiness.
