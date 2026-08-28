# S05 REWORK 4 — CODE REVIEW, SHARED BRIEF (read this, then your lens)

You are ONE OF THREE BLIND PARALLEL LENSES. You do not know what the others examine; do not look for their work. **Do not read any Kanban comment on `t_6e99d607` posted after `2026-08-27 09:51`.**

**YOU ARE READ-ONLY.** No edit, create, delete, stage, commit, push, merge, or any git write. No Kanban writes. Tests, typecheck and probes are expected. **All probe artifacts go to a scratch dir OUTSIDE the repo** — a prior lens leaked two files into the worktree and had to report itself. **Scope every search**; do not run repo-wide recursive greps over `apps/` or `packages/`.

## THIS IS THE LAST ROUND, AND IT IS PAST THE CAP
`rework_round: 4 of 3`, authorised by V personally beyond the standing cap. `packages/obs-capture/install/*.ts` enters S05b's `contract.forbidden` when this slice closes — **after this, nobody edits these three files again.** Anything you let through is permanent. Equally: a finding you invent costs a round nobody has. Be exact.

## What you are reviewing — COMMITTED THIS TIME
Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2/dialectical-engine`, branch `obs-lane-2-capture`.

- base `7afdbe5d3cf3bb1949064ca04e8678222c8fff84`
- commit `14965fc1bfe83017ffce6b62a01060abd3f625a3`
- `rev-list 7afdbe5..HEAD` = 1 · worktree clean · 5 files · 1460 insertions, 107 deletions

```
git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2/dialectical-engine diff 7afdbe5..14965fc
```

Expected set and nothing else: `packages/obs-capture/install/{api,runner,scheduler}.ts` and `tests/architecture/obs-l2-s05-{boot-capture,import-graph}.test.ts`.

**Read this carefully: that diff is the FUSED delta of ALL FOUR ROUNDS.** Rounds 1–3 were never committed — each overwrote the last in place — so round 4's single commit carries everything since base. You still cannot diff round 4 against round 3. What is new is that the object is now stable and hash-addressable, so every claim you make can be pinned to `14965fc` and re-checked by someone else. Prior lenses handled the fusion by re-deriving properties from scratch against controlled mutants rather than trusting round-over-round claims. Do the same, and say so where it limits you.

## Authoritative sources
- `planning/L2-ADDENDUM-PLAN.md` **§2**, **§3.5**, **§3.7** (the config seed table), **§3.8**, **§6.1**.
- The packet the seat was given: `goal-packets/s05-rework-4.md` — it lists exactly what was ordered.
- `planning/DEFINITION-OF-DONE.md` — the mission's measure. B1 was charged for failing D1 and D4.
- Ticket: `hermes kanban --board observability-loop show t_6e99d607` — `--board observability-loop` **before** the verb; never `boards switch`. The `comment` verb takes its body as a positional argument; there is no `--file`.

## What round 4 was ordered to change

**CHARGED — B1, the round-3 blocker.** `install/{api,runner,scheduler}.ts` rejected zero-length path segments before `realpathSync`, so a trailing or doubled separator on `OBS_SPOOL_DIR` returned `undefined` and Tier 0 never opened. Measured against one valid writable directory: `/…/plain` → 1 spool file, `/…/plain/` → 0, `/…/plain//` → 0. Silent by contract, so an operator got a permanent fatal-capture blackout with zero signal.

**UNCHARGED, also ordered:** the flaky assertion at `obs-l2-s05-import-graph.test.ts:455` (1 failure in 17 runs; the unref'd 0 ms arm races teardown) — deterministic without being toothless; `REDACTION_POLICY_VERSION_SEED` and `ALLOWLIST_SET_ID_SEED` unreachable by any test; `configBooleanValue`'s parsing policy and `FD_REUSE_PROBE_MAX_OPENS=64` undisclosed.

## What NINE PRIOR BLIND LENSES certified by execution across rounds 1–3. Round 4 changed the installers again, so RE-VERIFY rather than assume — but do not re-litigate the design:
- **Paired-control equality** — with/without installer, 3 runtimes × static/dynamic: equal exit status and **BYTE-IDENTICAL stderr** (`Buffer.compare`, not length).
- **A clean shutdown writes NOTHING**; a crash writes **exactly one** record, never two.
- **Zero-arity handler** — the caught error is structurally unreachable from the serializer. Six token classes planted across message, a two-level `cause` chain, own properties and **stack-frame text** reached disk nowhere, on either write path.
- **G5-4** — the written record minus `occurred_at`/`source_event_ref` is **deeply equal** to the live `createSharedRedactor` output, 31 keys.
- **`O_EXCL` + `O_NOFOLLOW`** refuse a symlink planted at the exact predicted filename; the fd identity check (`fstat` dev+ino) defeats descriptor reuse; degradation is silent — no throw, no log, no boot delay.
- **The seam is capability-complete and compiler-checked**: S05b can obtain the fd, write through it, swap the sink for one record not two, learn its runtime, and find records under `*.spool`.
- **25 of 30 reversion mutants** were caught by the suite.

## ONE UNEXPLAINED FIGURE, stated neutrally because it is in the record and was not addressed
The seat's RED table reports **747 bytes** of stderr from its deliberate fatal error on all three spellings. Its post-fix GREEN table reports **751 bytes** on all three. The handoff does not say why the figure moved. It may be nothing — the probe's temp directory name appears in the output and its `mktemp` suffix differs between runs — or it may not. The load-bearing property is control-vs-installed byte identity (`573` static / `404` dynamic, with SHA256s given), not this number. Resolve it if it falls in your lens; do not assume either way.

## NOT FINDINGS — already routed, and reporting them here wastes the round
- **The three `audit:source` rows** (`install/*.ts` reads `process.env` outside the register loader). §3.7 mandates env-only config, so these files cannot satisfy that rule; the only remedy is under `tools/`, which is floor-deny. It is a V decision row, `t_d821f99e`.
- **A fourth `audit:source` row** on `packages/obs-capture/src/registry/index.ts` (switch without `default:`/`exhaustive`) — S02's file, routed to `t_8e040ec2`.
- **The 0-byte spool file left on every clean boot**, **§3.6's "exactly one macrotask" wording**, **§3.8's cross-process drain race**, and **the Tier-1 sink misbehaviours** (a sink that writes then throws; one that returns without writing; one that registers its own death handler; one that calls `process.exit`) — all four are on S05b's seam contract, `t_3a04cc06`, and none is fixable from the installer side.

## Standing law
- **Excluded zone** — never modified, never imported, and **NO filesystem metadata of any kind** (no content read, import, directory listing, hash, size, mtime, mode; no SQL against `identity.*`): `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`.
- **No user-linked identifiers and no free text** in anything durable; ids are **declared kinds, never shape-inferred**.
- **Typecheck (§6.1):** base `7afdbe5` — count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **The count-0 pin at `80362d0` is VOID** — it was measured in a dirty checkout; do not cite it. **T-5 is fail-closed:** run `pnpm generate:contract` first, **and positively assert zero module-resolution escape from the worktree root**. Escape is silent, and a matching diagnostic count is NOT evidence of containment.
- No push, merge, self-Done, ticket split, worktree/branch operation, or database action. V performs every merge.

## Method
Reproduce before concluding. Label every finding **CONFIRMED** (you executed it) or **PLAUSIBLE** (you reasoned it). "No defects in this lens" is a legitimate and valuable verdict. **A false evidence claim is itself a blocker** — a prior round reported "103/103 cumulative" for a run that was in fact 110 tests, 103 passed, 7 failed. State results as `passed/total`. **Report any undisclosed tuning constant**; an undisclosed value is what got two of the last three rounds charged.

## Return
Return your verdict as your final message: a short header line `LENS <n> — <GREEN | FINDINGS>`, then each finding with its label, the exact command and output that establishes it, and what it breaks. Do not write to the board; Router posts. Do not summarise the other lenses; you cannot see them.
