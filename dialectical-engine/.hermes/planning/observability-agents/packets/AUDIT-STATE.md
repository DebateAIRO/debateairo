# PACKET AUDIT-STATE — landed-state audit of the observability loop (mission `observability-agents`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/00-intake-H0.md`.

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `t_0d8634a7` · **seat:** AUDIT-STATE · **role:** verification (`heartbeat-reviewer` — you judge landed work and the board's claims about it; you write no product code) · **model:** Fable 5.1 (Claude subagent)
- **session:** record your agent id/session in your CLAIM comment · **comment cursor at dispatch:** 0
- **review route:** consumed directly by the orchestrator (board reconciliation) and cited by REQ-FIX · **rework rounds: max 3**
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/fixagent-state-audit.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs/audit-state-*.log` (verbatim command outputs you cite)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/AUDIT-STATE.md` (self-report)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only)
  - comments on `t_0d8634a7`
- **forbidden:** every other write. **NO git writes of any kind** (no add/commit/stash/checkout/branch/worktree/reset — also not in any worktree). No migrations, no SQL writes, no process starts or stops. You MAY run: `pnpm vitest run <files>`, `pnpm generate:contract` (writes only its generated contract file — record `git status --porcelain` before and after and report any delta), `pnpm typecheck`, `pnpm audit:source`, the demo script, `git status/diff/log/show` (read-only), `hermes kanban --board observability-loop show <ticket> --json` for the tickets named below. Do not `stat`, list, read, or grep the security zone files directly (COMMON §3); test runs and the demo's own guard may touch what they touch — that is not yours.

## 2. Upstream artifacts (absolute paths)
- Predecessor slice contracts: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-observability-loop/planning/VerticalSlices.md` §1 (file surface per S-slice) · `planning/S02-registry-pin-correction.md` §3.2, §3.2a, §4.2, §4.3 (the RP-0 recipe and the seven seed-gap members) · `planning/TYPECHECK-BASELINE.md` (the typecheck gate law: `generate:contract` first; the `count: 0 at 80362d0` pin is VOID).
- Today's demo log: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs/d12-demo-2026-09-01.log`; the demo: `docs/missions/2026-08-21-observability-loop/demo/observability-demo.sh` (D6 textual rule near line 787) and its `README.md`.
- Board `observability-loop` tickets (read-only): S01 `t_1fde033d` · S02 `t_8e040ec2` · S03a `t_489ecbcc` · S03b `t_9b5ca941` · S04 `t_d1e18a14` · S05 `t_6e99d607` · S05b `t_3a04cc06` · S06 `t_5504afe0` · S07 `t_9f4e5bfb` · RP-0 `t_4deda7ab` · D12 `t_40c2cc1b` · `t_d821f99e`.
- Commits on `dev` that carried obs work: `7a3ff398`, `7afdbe5d`, `14965fc1`, `caac4d94`, `01422e29`, `5f0bd546`, `3e91cf42` (merge of `obs-lane-2-capture`), `2d1f86b8`.

## 3. Charges — every one gets an answer or an explicit UNVERIFIED
**A. Board receipts.** For each S-ticket above: board column today · the last verdict-bearing comment (date, marker, verdict) · the slice's file surface per VerticalSlices §1 and whether each file exists on `dev @ 8d38185c` (`git ls-tree`), with the commit that introduced it (`git log --diff-filter=A --format=%h -- <path> | tail -1`) · measured state (LANDED / PARTIAL / ABSENT) · recommended board action for the orchestrator (`done` with the evidence commit / keep `todo` / keep `blocked` with the blocker named). One table. The orchestrator applies it; you change no board state.
**B. Suites.** `find tests -name 'obs-*' -o -name '*obs-l*'` (and any test file importing `@debateai/obs-capture` — grep). Run the set with `pnpm vitest run <files>` THREE times; report each run as `passed/total`, the WORST run as the verdict, every failure named with its `❯ file:line` marker and whether it predates today (git blame the assertion). Save each run to `logs/audit-state-suite-run-{1,2,3}.log`.
**C. Gates.** (1) `pnpm audit:source` — the `blocking` array VERBATIM and its length; (2) `pnpm generate:contract` then `pnpm typecheck` — exit code and diagnostic count (repo-wide, the command the lanes run — never a subset); state plainly that the tree carries 111 `ui-overhaul` dirty entries so these numbers describe THIS tree, and separate diagnostics in obs paths from the rest. Save to `logs/audit-state-gates.log`.
**D. Stage 16 (D6 textual).** Read the demo's rule and `packages/obs-capture/src/zone/manifest.ts`. Decide with evidence: (i) demo-rule defect — the manifest is the human-owned RP-1 classification list and MUST name the prefixes as literals, so the textual rule needs an exemption for the manifest itself; or (ii) a genuine D6 violation — some obs artifact imports, reads, stats, lists, or probes a zone path. Probe: grep every file under `packages/obs-capture/` for `import`/`readFileSync`/`stat`/`existsSync`/`readdir`/`resolve` applied to any zone prefix, and read `src/zone/classifier.ts` to confirm classification is string-prefix matching only. Verdict + the exact demo line to change if (i), or the offending `path:line` if (ii).
**E. Lane 3.** In `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-3` (read-only): `git status --porcelain`, `git diff --stat`, its HEAD and base vs `dev`; list the uncommitted S06 files; for each, `git diff <lane-3 HEAD>..dev -- <path>` to say whether `dev` moved under it; state whether that work still applies or must be re-cut. Also list the other predecessor worktrees (`git worktree list | grep obs-`) with HEAD and dirty count; recommend keep/remove per worktree. Remove nothing.
**F. RP-0 independent derivation.** Confirm from `t_4deda7ab` that no hash comment from V exists. Then, having never seen `tests/unit/obs-l2-s02-registry.test.ts`'s expected value (do NOT open that file), independently derive the `declared_gap` set from the card: the seven §4.2 members plus the §3.2a subclass pass over the frozen 115-file scope — enumerate what you find, its count, and the two subclass codes. You MAY compute the sha256 with the card's one-liner and post it labelled **"independent derivation — NOT a ratification; V runs the one-liner"**. If your subclass pass yields anything other than exactly `PROVIDER_CALL_FAILED` and `PROVIDER_CONTENT_UNACCEPTED`, STOP that charge and report it as a finding.
**G. Board truth vs memory.** The orchestrator's notes say S05 "closed GREEN at 367591e" and S02 exhaustive-1 was dispatched 2026-08-27. Verify both against the tickets and the tree; report where the notes are wrong.

## 4. Output skeleton — `requirements/fixagent-state-audit.md` (exact headings)
```
# Observability loop — landed-state audit (2026-09-01, dev @ 8d38185c)
## Verdict summary                     (≤10 lines: what is landed, what is not, the three numbers V should know)
## A Board receipts                    (table)
## B Suites, three runs                (table + worst-run verdict)
## C Gates: audit:source, typecheck    (verbatim arrays and counts)
## D Stage 16 ruling input             (verdict, evidence, the line to change or the offender)
## E Lane 3 and predecessor worktrees  (table)
## F RP-0 independent derivation       (enumeration, count, hash labelled as derivation)
## G Notes vs truth                    (corrections)
## Findings                            (B1…, N1… — file:line, failure scenario, evidence)
## UNVERIFIED / gaps
```

## 5. Handoff
Post `READY FOR PEER REVIEW` on `t_0d8634a7` (and append it under `## Handoff` in the audit file), OPENING with `SKILLS LOADED: <list>`, then: the verdict summary · the findings list · what you did NOT verify and why · `git status --porcelain | wc -l` before and after your session (must be equal, or explain the delta to the file) · `comments read through: <n>`. Self-report first (COMMON §5). Then stop.

## 6. Stop conditions
COMMON §6 with a 2.5-hour soft bound, plus: `BLOCKED` immediately if any charge would require a git write, a migration, or a zone read — skip the charge with UNVERIFIED and continue; block only if A–D are all unanswerable.
