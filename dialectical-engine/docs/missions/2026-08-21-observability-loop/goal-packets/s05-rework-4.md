# GOAL PACKET — S05 REWORK 4 — ticket `t_6e99d607`

**YOU ARE A FRESH SEAT. You have no history with this slice. Everything you need is in this packet, on the ticket, and in the plan. Do not assume anything you cannot read.**

**`rework_round: 4 of 3` — V AUTHORISED THIS ROUND BEYOND THE STANDING CAP**, because one real defect remains and `packages/obs-capture/install/*.ts` can never be edited again after this slice closes (it is in the next slice's `contract.forbidden`). **This is the last edit these three files will ever receive.**

## 0. Read first, in this order
1. **Your working tree:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2/dialectical-engine`, branch `obs-lane-2-capture`, base commit `7afdbe5`. **Three prior rework rounds are already applied and UNCOMMITTED in this tree.** Do not revert them.
2. `docs/missions/2026-08-21-observability-loop/planning/L2-ADDENDUM-PLAN.md` — **§2** (contract), **§3.5**, **§3.7** (config seeds), **§6.1** (typecheck). Authoritative.
3. `docs/missions/2026-08-21-observability-loop/planning/DEFINITION-OF-DONE.md` — the mission's measure, designed with V today. Your work serves **D1**, **D4**, **D5** and **D7**.
4. The ticket, whose comments carry three rounds of review verdicts:
   `hermes kanban --board observability-loop show t_6e99d607`
   **Always put `--board observability-loop` BEFORE the verb. Never run `boards switch`.**

## 1. What three review rounds have CERTIFIED. Do not redo it, and do not break it.
Nine blind Claude Opus lenses across three rounds have proven, by execution:
- **Crash semantics preserved** — 12 paired arms (3 runtimes × static/dynamic × spool on/off): equal exit status and **byte-identical stderr**, verified by `Buffer.compare`.
- **A clean shutdown writes nothing**; a crash writes **exactly one** record.
- **The zero-arity handler makes the caught error structurally unreachable** from the serializer. Secrets planted in the message, a two-level cause chain, own properties and **stack-frame text** reach disk nowhere, on either write path, in all three runtimes.
- **G5-4 holds** — the written record equals the live redactor's output, 31 keys.
- **`O_EXCL` + `O_NOFOLLOW`** refuse a symlink planted at the exact predicted filename.
- **The fd identity check** defeats the descriptor-reuse attack on both paths.
- **The seam interface is real** — renaming the function, renaming or adding a field, or passing positional arguments each raises a compiler diagnostic.
- **All four charged config seeds now match §3.7** and are falsifiable by a test.
- **25 of 30 reversion mutants** are caught by the suite.

**Re-prove the byte-identical stderr and the no-leak result after your edits.** Everything else, leave alone.

---

## 2. THE BLOCKER — B1 · a trailing slash silently disables all fatal capture

`packages/obs-capture/install/{api,runner,scheduler}.ts:51-53`.

The path normaliser splits the raw value and rejects any zero-length segment **before** `realpathSync` is reached. So a trailing separator makes `normalizedSpoolDirectory` return `undefined`, and Tier 0 never opens. Measured against **the same valid, writable, non-symlinked directory**:

```
OBS_SPOOL_DIR=/…/plain     -> 1 spool file   (capture works)
OBS_SPOOL_DIR=/…/plain/    -> 0 spool files  (capture silently OFF)
OBS_SPOOL_DIR=/…/plain//   -> 0 spool files  (capture silently OFF)
```

Degradation is silent **by contract** — no throw, no log, stderr byte-identical to an uninstrumented run. So an operator who writes `OBS_SPOOL_DIR=/var/spool/obs/` in a compose or env file gets a **permanent fatal-capture blackout with zero signal**. This fails **D1** ("nothing is silently dropped") and **D4** ("silence never passes as health") of the definition of done.

**Required:** canonicalise before validating — or otherwise accept a trailing separator — so that a valid directory is accepted however an operator spells it. **Do not weaken the rejections that were proven to work:** relative paths, `..` traversal, and a symlinked final component must all still be refused, and the degradation must stay silent. Add a test covering trailing slash, doubled separator, and at least one already-rejected case so the boundary is pinned in both directions.

---

## 3. ALSO FIX — all in files that are NOT frozen

**F1 · The suite is flaky.** 17 consecutive runs gave 16 × 43/43 and 1 × 41/43. The failing assertion is `tests/architecture/obs-l2-s05-import-graph.test.ts:455` — `expect(promptExit.trace).not.toContain("@debateai/obs-capture/runtime")`. Removing the timer stub was correct, but the replacement races the unref'd 0 ms arm against process teardown; under parallel load the arm wins. **Production behaviour is right; the assertion is absolute where the mechanism is probabilistic.** Make it deterministic without making it toothless — it must still fail a 25 ms arm and a missing `.unref()`, which are the two mutants it exists to catch.

**F2 · Two of §3.7's seven seeds are unreachable by any test.** `REDACTION_POLICY_VERSION_SEED` and `ALLOWLIST_SET_ID_SEED` can be changed with the whole suite still green. The new unset-environment test's `toMatchObject` pins only the four charged keys. Extend it to all seven so no seed can drift unnoticed.

**F3 · Disclose the parsing policy and the remaining constant.** `configBooleanValue` treats any value other than the exact string `"true"` as `false`, so a malformed `OBS_BUILD_DIRTY=1` or `=yes` yields the **dishonest** direction against §3.7's "honest interim stamp". The seed is correct; the parsing is undisclosed. Also disclose `FD_REUSE_PROBE_MAX_OPENS = 64`.

## 4. Do NOT fix — these are routed elsewhere
The three new `audit:source` rows (`install/*.ts` reads `process.env` outside the register loader) — §3.7 **mandates** env-only config, so these files can never satisfy that rule; the lawful remedy is an exemption in `tools/orphan-audit/`, which is not frozen and not yours. The 0-byte spool file left on every clean boot → ops. The "exactly one macrotask" wording → plan. A Tier-1 sink that writes then throws producing two records, and a sink that returns without writing → both already written into the next slice's seam contract, and neither is fixable from your side.

## 5. Report honestly — one prior claim was imprecise
The last handoff reported **"103/103 cumulative"**. A reviewer reproduced it as **110 tests, 103 passed, 7 failed** — all seven pre-existing and none caused by this slice. That is a passing count reported as a clean sweep. **State suite results as `passed/total`, and name any failures and whether they pre-date your work.**

## 6. RED — reproduce-first, mandatory
- **RED-B1:** the three-value table above, against one directory, showing capture ON without the slash and silently OFF with it.
- **RED-F1:** demonstrate the flake — run the focused suite enough times, or force the race, to observe the failure at least once, and identify the racing mechanism.
- **RED-F2:** mutate `REDACTION_POLICY_VERSION_SEED` and show the suite stays green.

## 7. Typecheck (§6.1) — base `7afdbe5`
Pin: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **`TYPECHECK-BASELINE.md`'s count-0 pin at `80362d0` is VOID — measured in a dirty checkout. Do not cite it.** T-5 is fail-closed: run `pnpm generate:contract` before measuring and say you did, then **positively assert zero module-resolution escape** from the worktree root — escape is silent and a matching diagnostic count is **not** evidence of containment.

## 8. COMMIT WHEN GREEN — this is new, and it is required
Rounds 1–3 were left uncommitted and each overwrote the last in place, so **no reviewer could diff round over round**; three separate lenses had to re-derive every property from scratch against hand-built mutants and said so. When your GREEN is complete, **commit on `obs-lane-2-capture`** with message `fix(obs): fatal-boundary installers — path handling, seed coverage, deterministic arm probe`. **No push. No merge. No `main`. No branch or worktree operation.** The commit is so the next review has something to diff.

## 9. Where you stop
End at **READY FOR PEER REVIEW** on `t_6e99d607`, with every RED frame, the suite result as `passed/total`, the TBP figures, and **every constant you chose disclosed**. Two consecutive rounds were charged over undisclosed constants — do not make it three. Then stop.
