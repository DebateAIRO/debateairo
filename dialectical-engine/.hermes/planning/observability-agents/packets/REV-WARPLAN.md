# PACKET REV-WARPLAN — blind review of the 2026-09-02 war plan (mission `observability-agents`)

Seat: **Grok 4.6**, reviewer. Ticket **`t_d9a33421`** on board `observability-agents`. Round **1** of max **3**.
Authority marker required on the ticket before you start: `HERMES AUTHORIZED NEXT: REV-WARPLAN` — verify it with the `show` command in §1; if it is absent, post `BLOCKED: no authority marker` and stop.

## 0. Read order — in full, in this order, with `cat` (you have no Skill tool; the BODY of each file is what counts, and the orchestrator greps your transcript for phrases from inside them)
1. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md` — binding for every seat of this mission (write-as-you-go §4b, self-report §5, stopping rule §6).
2. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md` — the router; note §3b (`SKILLS LOADED`) and the floor table.
3. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md` — your role contract. §1 review the packet FIRST; §2 probe, never read; §3 findings; §4 verdict; §5 handoff.
4. `/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md` — your floor skill (evidence before assertions).
5. This packet, to the end.
6. The artifact under review: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/WAR-PLAN-2026-09-02.md` (v1, 325 lines; `shasum -a 256` prefix `0164fe0b4d0366cc` — if the prefix differs, the file moved under you: record the new prefix and review what is there).

Your handoff OPENS with `SKILLS LOADED: <every file above you actually read, by name>`. Naming one you did not read is a fabrication finding against you.

## 1. Ticket state and board commands (exact forms — `hermes` is on PATH at `/Users/vladmihaimiron/.local/bin/hermes`; board flag BEFORE the verb)
- Read: `hermes kanban --board observability-agents show t_d9a33421`
- Comment: `hermes kanban --board observability-agents comment t_d9a33421 "<text>" --author grok-4.6`
- You mark nothing Done, mutate no status, `complete` nothing, `assign` nothing. Comments are your only board write.

## 2. What you are reviewing, and who wrote it
A PLANNING artifact — a war plan — written by the orchestrator (Claude Code, Fable 5.1) at V's order of 2026-09-02. It proposes the next campaign for the FixAgent, a "Foundry" mock database (real PostgreSQL 18 per worktree, embedded, template-cloned), an alert file in the app, a v2 of the frozen FIX-13 SPEC, and seven new V decision rows (V-9..V-15). It also inventories the battlefield (six theatres, §2). V will read the plan AFTER your verdict. You are its only independent reviewer. The author cannot review it; this packet was written by the same author — review the packet too (§3 below is a charge, not a courtesy).

Working directory: the MAIN tree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine` (git root is the parent, `/Users/vladmihaimiron/Documents/DebateAIRO`). It is clean at `dev @ 2b670d30`. Other missions' worktrees exist under `.worktrees/` and `../DebateAIRO-worktrees/` — do not enter them.

## 3. Charges — answer every one; `UNVERIFIED` with the reason is an acceptable answer, silence is not
- **C1 · Packet review (reviewer §1).** Check this packet's constants against reality: ticket id exists and carries the marker; the sha256 prefix; every path in §0 resolves (`test -r`); the `allowed` list in §5 covers every deliverable §6 demands. A packet defect is a finding against the orchestrator.
- **C2 · Run the evidence index yourself.** The plan's §13 lists the commands behind its numbers. Run every one from the main tree and compare. Any mismatch (including "the command as written does not run") is a finding; say whether the mismatch changes a conclusion.
- **C3 · Spot-check the theatre map (§2.1) at the source, at least eight facts across at least four theatres.** Candidates: PR #8's numbers and checks (`gh pr view 8 --json …`, `gh pr checks 8`); the one-file conflict (`git merge-tree --write-tree --name-only dev origin/security/2026-09-01-hardening`); board counts (`hermes kanban --board observability-agents stats`, `… --board ui-overhaul list | grep running`); the six red obs tests and the typecheck baseline (`docs/missions/observability-agents/TYPECHECK-BASELINE.md`, `requirements/fixagent-state-audit.md`); `tests/support/testDatabase.ts` (what `startTestDatabase()` actually does; what `selectPrototypeDatabaseMechanism()` returns); `acceptance/standing-db.ts` lines 32–55 (does it really adopt and migrate a reachable server?); embedded-postgres binaries (`find node_modules/.pnpm -maxdepth 1 -name '@embedded-postgres+darwin-arm64*'` then `ls …/native/bin`); the migration count and the two `0025_` files; `sed -n '8p' .gitignore`; `docker ps`. Quote what you ran and what came back.
- **C4 · Law check.** Read `~/.claude/skills/heartbeat-orchestrator/SKILL.md` §6 (vertical-slice law) and `docs/agent-protocols/debateai-heartbeat-protocol.md` item 6 (push law) and the zone rules named in the plan's §3. Does any step in §5–§8 or Appendix A break a law WITHOUT a corresponding V row in §12? Does any V row ask V something that is not V's to decide, or take a decision that IS V's without a row?
- **C5 · Attack the Foundry (§7).** Your default posture is to refute. Specifically: (a) read `tests/unit/test-database-policy.test.ts` and `tests/integration/database.test.ts` around line 1037 — does the proposed `DEBATEAI_WORKTREE_DB=1` seam keep both green as the plan claims? (b) `validateApiEnvironment` in `packages/register/src/runtime-environment.ts` — does "distinct roles on one cluster" really satisfy the ≥6-distinct-URL rule? (c) `CREATE DATABASE … TEMPLATE` semantics vs `ALLOW_CONNECTIONS false` and roles being cluster-global — any hole? (d) migration ordering (`packages/db/src/index.ts` ~line 717) — does the template rebuild rule (hash of the sorted file list) cover it? (e) is Option 0 (SQLite/emulator) REALLY non-viable — find one counter-argument and settle it. (f) If you can settle a point by a small experiment (a throwaway `tsx` script under your scratch dir booting `EmbeddedPostgres` and cloning a template), run it three times and report timings — an experiment beats an argument.
- **C6 · Attack the loop (§6, Appendix A).** Base/rebase logic; whether GitHub rulesets can in fact confine a bot identity to `refs/heads/fixagent/*` while forbidding `dev`/`main` (say UNVERIFIED if you cannot establish it without network — but read `gh api repos/DebateAIRO/debateairo/rulesets`, currently `[]`); the draft-PR step; whether the alert file's gitignore claim keeps FIX-13-R09 (`git status --porcelain` unchanged) true; kill mid-push; the V-11 code-first recommendation — what does it risk that the plan does not name?
- **C7 · Attack the order of battle (§5).** Is thin-loop-first (inverting the frozen G1→G2 order) right, or does it skip a dependency the SPECs name? Read `slices/FIX-01/SPEC.md` §7 and the FIX-17 surface in Op 2 — are Op 1 and Op 2 truly file-disjoint? Is "3 coders inside one slice worktree with child worktrees" sound? Are the timeline estimates grounded in the ledger (`.hermes/reports/observability-agents/LEDGER.md`) or invented?
- **C8 · The V rows (§12).** V's standing style (memory of this fleet): explain bottom-up with an example, then options, then a recommendation. Is each row self-contained for a reader who has not read the plan? Is any recommendation wrong on the evidence?
- **C9 · Omissions.** Name at least three things the plan should have covered and did not (candidates you may check: the 13 unmerged `codex/accounts-*`/`auth-*` branches vs PR #8; Hatchet's role; the halted `translation` mission; the `accounts-program-closure` board with 1 running and 16 blocked; the model-evaluator; CI having no DB service; who runs the FixAgent daemon and where it lives on this Mac). Say which are real gaps and which are correctly out of scope.
- **C10 · Predictions.** One paragraph: what you expect the AUTHOR got wrong that you could not prove, and what a second reviewer should check first.

## 4. Probes — rules
Read-only everywhere except §5. Git: read verbs only (`status`, `log`, `diff`, `show`, `ls-remote`, `merge-tree --write-tree`, `worktree list`, `branch`, `rev-list`, `rev-parse`) — never `commit`, `checkout`, `switch`, `stash`, `push`, `pull`, `merge`, `rebase`, `reset`, `worktree add/remove`. `gh`: read verbs only (`pr view/list/checks`, `api` GET). `hermes`: `show`, `list`, `stats`, `comment` only. Docker: `docker ps` and **SELECT-only** `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT …"` if you need a live-DB fact; no DDL/DML, ever — that is V's live database. `pnpm`: you may run `pnpm typecheck`, `pnpm exec vitest run <one file>`, `pnpm exec tsx <your scratch script>`; do not run `pnpm test` (it includes `acceptance/`, which wants live LLM relays) and do not run `pnpm install`. Never touch `.worktrees/`, `../DebateAIRO-worktrees/`, `acceptance/.pgdata*`.

## 5. Allowed writes (everything else is read-only)
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/reviews/REV-WARPLAN-grok.md` — your verdict (write it EARLY and keep updating it; COMMON §4b).
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/REV-WARPLAN.md` — your self-report (COMMON §5; start it as soon as you have one finding).
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` — append only.
- Scratch: `/private/tmp/rev-warplan/` (create it; throwaway scripts and outputs; nothing else reads it).
- Board comments on `t_d9a33421` (§1).

## 6. Verdict file — exact skeleton (`reviews/REV-WARPLAN-grok.md`)
```
SKILLS LOADED: <list>
# VERDICT: PASS | REWORK | BLOCKED   (round 1 of 3)
## Packet review (C1)
## Probes run (C2, C3, C5f) — command · output verbatim (trimmed) · agrees / disagrees with the plan
## Findings
### B1 … (blocking) — plan §/line quoted · what you ran · concrete failure scenario · evidence
### N1 … (non-blocking; every N-finding still demands a fix)
## Law check (C4)
## Foundry attack (C5) · Loop attack (C6) · Order of battle (C7) · V rows (C8) · Omissions (C9)
## What I did NOT verify, and why
## Predictions (C10)
## Spend: wall-clock, turns, tokens if the CLI reports them
```
Vocabulary: `PASS` / `REWORK` / `BLOCKED` only — never "pass with concerns" (concerns are N-findings). Number every finding. Quote the plan by section and line (`sed -n 'Np'`).

## 7. Handoff — order matters (freeze law: the board comment is your LAST write)
1. Verdict file complete on disk. 2. Self-report on disk. 3. TOOLING-TRAPS appended if you learned a trap. 4. ONE final comment on `t_d9a33421`:
`READY FOR HERMES REVIEW: REV-WARPLAN round 1 — <PASS | REWORK (<n> B, <m> N) | BLOCKED>` newline `SKILLS LOADED: <list>` newline `verdict: docs/missions/observability-agents/reviews/REV-WARPLAN-grok.md` newline `comments read through: <count of comments on the ticket when you last ran show>`.
Post a `HEARTBEAT: <what is on disk>` comment at each natural checkpoint before that (COMMON §4b).
Return control at that handoff, at a genuine blocker, or at an IMPORTANT OPERATION, but keep the unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no message. Termination requires the spine's goal-specific FULLY DONE condition.

## 8. Stopping rule
Soft bound 2 hours. At 1.5 hours with charges open: write what you have, mark the rest `UNVERIFIED — out of time`, hand off. Do not idle; do not start unasked work; do not edit the plan.

---

# ROUND 2 — same seat, same session (resumed), same ticket `t_d9a33421`

**This section supersedes COMMON.md wherever they differ** (COMMON's tree constants `8d38185c` / 111 dirty and its 3 h stopping bound are stale for this seat; the handoff marker for this seat is `READY FOR HERMES REVIEW`). Your round-1 packet defect N6 is accepted and charged to the orchestrator.

## R2.0 What changed
The author reworked the plan to **v2**: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/WAR-PLAN-2026-09-02.md`, now **362 lines**, `shasum -a 256` prefix **`dc403816357973d2`** (v1 was 325 lines / `0164fe0b4d0366cc`). **Appendix C** of v2 is the changelog: one row per round-1 finding (B1, N1..N9, plus your C5f/C6/C9 points and the live-109 count), naming where each was fixed. Round-1 verdict and self-report are untouched on disk; write round 2 as a NEW file.

## R2.1 Charges
- **R2-C1 · Close-out check.** For EACH row of Appendix C: open the cited location (`sed -n`), quote the new text, and rule **CLOSED / NOT CLOSED / PARTIAL** with the reason. B1 first: confirm Op 1's scope is now exactly FIX-01 §7 and that the new **Op 1b / slice VS-H** file list is disjoint from FIX-01 §7 AND from Op 2's FIX-17 surface (name any overlap).
- **R2-C2 · Re-probe what changed.** Any number or claim v2 changed or added (77 triggers, 109 live `prosecdef`, the pairwise-URL rule quoted from `runtime-environment.ts:107-161`, the 35/34 comment, the `3503dcf8` pin statement in Op 0.2, the decoy-ref drill in Op 0.4) — verify it at source again; do not trust that the author copied your numbers correctly.
- **R2-C3 · Regressions.** Did the rework break anything that was right in v1? Read §5 Op 1/1b/2/3 and §10 end to end once more as a whole; check the Timeline table and §1 line 7 still agree with the body.
- **R2-C4 · New content.** Attack the additions: the `FIXAGENT_APP_CHECKOUT` main-worktree refusal rule (Op 3, §8, V-14) — is "main worktree" well-defined for this repo (`git worktree list` first row)? The decoy protected ref drill (Op 0.4) — does it actually prove confinement, or only refusal on one pattern? The orphan-cleanup rule (§6 step 7, App. A R08′) — any state where a PR-less ref survives? Risk 18's flapping-fingerprint cap — consistent with FIX-12-R07's `TELEMETRY_MISSING` fail-closed?
- **R2-C5 · Verdict.** `PASS` only if every Appendix C row is CLOSED and no new B-finding exists; otherwise `REWORK` with numbered findings (continue numbering: B2…, N10…). Round 2 of 3 — if your REWORK would need a round 4, say so and mark the residue for a V DECISIONS PACKET row instead.
- **R2-C6 · Predictions** paragraph, as before.

## R2.2 Deliverables (allowed writes unchanged from §5, plus these two files)
- Verdict: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/reviews/REV-WARPLAN-grok-r2.md` — open with `SKILLS LOADED:` (list what you actually re-read this round; the skill bodies from round 1 count only if they are still in your context — say so honestly), then `# VERDICT: PASS | REWORK (round 2 of 3)`, then `## Close-out (R2-C1)` as a table (Appendix C row · location · CLOSED/NOT CLOSED/PARTIAL · evidence), `## Re-probes (R2-C2)`, `## Regressions (R2-C3)`, `## New content (R2-C4)`, `## Findings`, `## What I did NOT verify`, `## Predictions`, `## Spend`.
- Self-report: APPEND a `## Round 2` section to `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/REV-WARPLAN.md`.

## R2.3 Handoff (freeze law — the board comment is your LAST write)
Verdict file on disk → self-report appended → `HEARTBEAT` comments at checkpoints → ONE final comment on `t_d9a33421`:
`READY FOR HERMES REVIEW: REV-WARPLAN round 2 — <PASS | REWORK (<n> B, <m> N)>` newline `SKILLS LOADED: <list>` newline `verdict: docs/missions/observability-agents/reviews/REV-WARPLAN-grok-r2.md` newline `comments read through: <count>`.
Authority marker required before you start: `HERMES AUTHORIZED NEXT: REV-WARPLAN round 2` on the ticket. Stopping rule: soft 1 h; at 45 min write what you have and mark the rest `UNVERIFIED — out of time`. Read-only rules of §4 unchanged.

---

# ROUND 3 — same seat, same session (resumed), same ticket `t_d9a33421` — THE LAST LAWFUL ROUND

**Supersedes COMMON.md and the round-1 §5/§6 wherever they differ** (§5/§6 describe round 1 ONLY; your R2.2/R3.2 paths win). Round-2 packet defect N14 accepted: the line count was quoted from a newline-counting script, not from `wc -l`; this round pins `wc -l`.

## R3.0 What changed
The author reworked the plan to **v3**: same path, **376 lines by `wc -l`**, `shasum -a 256` prefix **`6ea74a45c44106ed`**. Appendix C now has a **Round 2** table (B2, N10..N14, the two unnumbered regressions) naming where each was fixed. Round-1 and round-2 verdicts are untouched on disk.

## R3.1 Charges
- **R3-C1 · Close-out of the Round 2 table** — for each row: open the cited location, quote the new text, rule CLOSED / NOT CLOSED / PARTIAL. B2 first: print `git worktree list | head -1` and the configured path, and rule whether the two-part start gate as now written (`show-toplevel` == first row AND path == `<toplevel>/dialectical-engine`) succeeds on this Mac.
- **R3-C2 · Copy sweep** — your own prediction: "fix the pointer, not the copies". Grep v3 for every sentence that could still carry an old rule (`child worktree`, `file-list`/`migration-list`, `first row`, `decoy`, `flapping`, `≥6`, `~30`) and rule whether every copy agrees with the fixed one.
- **R3-C3 · Regressions** — anything v3 broke that v2 had right.
- **R3-C4 · Verdict** — `PASS` if every Round-2 row is CLOSED and no new B-finding exists. Otherwise `REWORK` with numbered findings (B3…, N15…) **and**, because round 4 does not exist, one line per remaining finding stating the exact V DECISIONS PACKET row text the orchestrator must add for it.
- **R3-C5 · Predictions** paragraph.

## R3.2 Deliverables
- Verdict: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/reviews/REV-WARPLAN-grok-r3.md` — opens with `SKILLS LOADED:` (honest: what you re-read this round vs what is still in context), then `# VERDICT: PASS | REWORK (round 3 of 3)`, `## Close-out (R3-C1)`, `## Copy sweep (R3-C2)`, `## Regressions (R3-C3)`, `## Findings`, `## What I did NOT verify`, `## Predictions`, `## Spend`.
- Self-report: APPEND `## Round 3` to `.hermes/reports/observability-agents/agent-reports/REV-WARPLAN.md`.

## R3.3 Handoff (freeze law — the board comment is your LAST write)
Verdict on disk → self-report appended → ONE final comment on `t_d9a33421`: `READY FOR HERMES REVIEW: REV-WARPLAN round 3 — <PASS | REWORK (<n> B, <m> N)>` newline `SKILLS LOADED: <list>` newline `verdict: docs/missions/observability-agents/reviews/REV-WARPLAN-grok-r3.md` newline `comments read through: <count>`. Authority marker required first: `HERMES AUTHORIZED NEXT: REV-WARPLAN round 3`. Stopping rule: soft 45 min; at 30 min write what you have. Read-only rules of §4 unchanged.
