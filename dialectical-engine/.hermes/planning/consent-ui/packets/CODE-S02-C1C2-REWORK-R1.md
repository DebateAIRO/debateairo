# PACKET CODE-S02-C1C2-REWORK-R1 — rework round 1 of max 3 for seat CODE-S02-C1C2 (mission `consent-ui`, slice S02, cluster C1 = `modalSemantics.ts`)

**STEP 0 — CLAIM** on `t_d641ec15` (board `consent-ui`) with `comments read through` BEFORE reading anything else.

You are the CODE-S02-C1C2 seat, **round-1 rework, fresh session** (memory on disk). Read, in this order, in full:
1. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/consent-ui/packets/COMMON.md` (§10.16–10.32 bind your commands and your handoff).
2. Your original packet `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/consent-ui/packets/CODE-S02-C1C2.md` (its `allowed` list still binds — one correction: `ModalSurface` has THREE members, the four-member type is C5's prop type).
3. Your predecessor's handoff (the `READY FOR PEER REVIEW` comment by `CODE-S02-C1C2` on `t_eab0c89f`) and its self-report `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/consent-ui/agent-reports/CODE-S02-C1C2.md` (continue it — Part II — never rewrite it).
4. **The verdict you are answering:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/reviews/CODE-REV-S02-C1C2-r1.md` — B1 blocking, N1–N4 non-blocking, the F2 ruling (full-Tab trap CORRECT, no change).
5. The reviewer's probe kit, read-only: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/consent-ui/probes/code-rev-s02-c1c2-r1-*` (8 files incl. `-esc-stack.probe.tsx`, `-nesting.probe.tsx`, `-remount.probe.tsx` and the vitest config the reviewer used — copy the config to your scratch if a path must change; the probes themselves stay byte-untouched).

Skills (Skill tool, in order, THIS session): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-worker` · `superpowers:receiving-code-review` (BEFORE reading the verdict; findings are data) · `superpowers:test-driven-development` · `superpowers:systematic-debugging` (B1 is a real defect — root cause before fix) · `superpowers:verification-before-completion`. Declare only what THIS session loaded.

- **lane:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine`, branch `slice/consent-s02`, HEAD must be `91877847` at CLAIM (if not, stop and say so). ONE commit: `fix(consent-ui S02-C1): topmost surface by DOM containment; stopPropagation pin; focusable filter` (+ the Co-Authored-By trailer).
- **allowed:** `apps/ui/components/consent/modalSemantics.ts` · `tests/render/consent-modal-semantics.test.tsx` · `docs/architecture/01-decisions/ADR-0022-shared-modal-semantics.md` (§Decision wording only) · self-report (append Part II) · `.hermes/TOOLING-TRAPS.md` (append) · scratch `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/code-s02-c1c2-rework-r1/`. **Forbidden:** everything else; the EXPORTED SURFACE of `modalSemantics.ts` is byte-frozen (S01 consumes it) — prove it unchanged with the predecessor's checker or a diff of the exported declarations.
- **rework rounds:** round 1 of max 3.

## 1. What "addressed" means
- **B1 (BINDING, measured):** "topmost" is derived from the DOM (containment / document position via `compareDocumentPosition`), never from effect-commit order. RED first: run the reviewer's kit against HEAD and paste `Tests 2 failed | 27 passed (29)`; then fix; then `Tests 29 passed (29)` verbatim, three runs. Add the NESTED-pair case (and the three-deep case) to `consent-modal-semantics.test.tsx` so the cluster command owns it; the sibling case stays. ADR-0022 §Decision: replace "the last entry" with the containment rule (one sentence). Sweep: the Tab trap reads the same `top` — assert the nested case for Tab too (the reviewer's P10).
- **N2 (BINDING, measured):** the six-line pin — a `window` keydown listener sees 0 Escape events while a surface is open — in the cluster test file.
- **N1 (ADVISORY, ORCHESTRATOR RULING `t_c16d9fe5`):** filter `[type=hidden]` and `tabindex="-1"` on EVERY arm of the selector, and after `focus()` advance to the next candidate if `document.activeElement` did not move; keep the selector's other members. Positive-tabindex ordering and `display:none` are NOT in scope (unmeasurable in jsdom — say so). RED first with the reviewer's P11/P12.
- **N3 (ADVISORY):** the `matchMedia` case drives the absent branch explicitly (stub/delete the property inside the case) instead of asserting the environment.
- **N4:** not yours (orchestrator process).

## 2. Verification (all pasted verbatim)
`run S02-C1 1 tests/render/consent-modal-semantics.test.tsx` ×3 from a `.sh` under `/bin/bash` AND inline (worst run wins; the `<n>` count rises if you add cases — state the new summary) · the reviewer kit ×3 · `cd <lane>/apps/ui && npx tsc --noEmit -p tsconfig.json` exit 0 · root `pnpm typecheck` delta (8 in the pin, 0 outside) · S02-S72's three ADR arms · `git status --porcelain` empty after the commit · exported-surface check BYTE-IDENTICAL.

## 3. Handoff
Self-report Part II first (what made B1 invisible to a sibling-pair test; priced). Post `REWORK READY FOR REVIEW` on `t_eab0c89f` with a pointer on `t_d641ec15`, OPENING with `SKILLS LOADED:`, then the commit hash, the RED→GREEN kit output, the three-run tables, the surface check, `comments read through` for both tickets.
