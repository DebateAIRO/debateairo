# S05 FINAL — CODE REVIEW, SHARED BRIEF (read this, then your lens)

You are ONE OF THREE BLIND PARALLEL LENSES. You do not know what the others examine; do not look for their work. **Do not read any Kanban comment on `t_6e99d607` posted after `2026-08-27 13:11`.**

## YOU HAVE YOUR OWN WORKTREE. USE ONLY IT.

Your lens packet names your worktree path. It is yours alone, checked out at `01422e2`, clean, with `node_modules` already present. **Do not touch `.worktrees/obs-lane-2`** — that is the lane's tree and is not yours.

You MAY mutate your own worktree to build mutants and probes, because nobody else can see it. Restore what you change and prove the tree is clean at the end. Probe artifacts still go to a scratch directory outside the repo. (A previous diamond ran three lenses in one shared tree; one lens's mutant left files another lens found in its own `git status` and could not account for. That was the Router's error, and this is the fix.)

## What you are reviewing — THREE COMMITS, and round-over-round diffing finally works

```
7afdbe5  base
14965fc  rework 4      path handling, seed coverage, deterministic arm probe
caac4d9  continuation 1  the four defects the last diamond found
01422e2  continuation 2  refuse symlinked spool directories        <-- HEAD
```

Whole slice: `git diff 7afdbe5..01422e2`. Round over round: `git diff 14965fc..caac4d9` and `git diff caac4d9..01422e2`. **Use the per-commit diffs** — the last diamond had to re-derive everything against hand-built mutants because three rounds were fused into one uncommitted blob. That is over.

Expected surface and nothing else: `packages/obs-capture/install/{api,runner,scheduler}.ts` and `tests/architecture/obs-l2-s05-{boot-capture,import-graph}.test.ts`.

## Authoritative sources
- `planning/L2-ADDENDUM-PLAN.md` **§2**, **§2.4**, **§3.5**, **§3.7**, **§3.8**, **§6.1**
- `planning/DEFINITION-OF-DONE.md`
- The two packets the seats were given: `goal-packets/s05-continuation-1.md`, `goal-packets/s05-continuation-2.md`
- Ticket: `hermes kanban --board observability-loop show t_6e99d607` — board flag BEFORE the verb; never `boards switch`

## What the previous diamond found, and what was done about it

Three blind lenses reviewed `14965fc` and found four defects. Continuation 1 fixed all four; continuation 2 fixed a fifth that had been held for a V ruling.

- **B-1** a quadratic regex on the boot path stalled all three runtimes ~31 s on a large separator run, silently, and ran *before* the guard that would reject the path anyway. Now claimed linear, pinned by a wall-clock test (`BOOT_STALL_SEPARATOR_COUNT = 60,000`, `BOOT_STALL_MAX_MS = 2,000`; seat measured 5.9–6.2 ms).
- **B-2** a write failing *after* committing bytes was retried whole through `O_APPEND`, fusing a truncated prefix with the retry into one unparseable line that §3.8's drain counts as `REDACTOR_FAILURE` and skips. Now claimed fixed with a six-case write-outcome matrix (expected call counts 1 / 2 / 2 / 3 / 2 / 2).
- **R-1** `/` and `/////` were newly accepted; now refused before any fs call.
- **S-1** `.` segments silently disabled capture, and the `.` half of the rejection guarded nothing. Now `.` is accepted, literal `..` still refused.
- **THE SYMLINK CHARGE (continuation 2).** The old code checked only the FINAL component with `lstatSync`, then called `realpathSync` on the whole path — so any symlinked ANCESTOR was followed on 100% of boots, and the two independent lookups also raced. `lstatSync` is now removed entirely; `realpathSync` runs exactly once on the normalised spelling, and the directory is accepted **only when `canonicalPath === normalizedPath`**.

## THE BEHAVIOUR CHANGE IS DELIBERATE AND V-RULED. Do not report it as a defect.

Refusing symlinked ancestors means a deployment that legitimately uses a symlinked spool path **stops capturing**, silently, because §2.4 forbids throwing, logging or delaying boot. This deliberately trades *"silently writes to the wrong place"* for *"silently writes nowhere"*. **V ruled on 2026-08-27 to charge this fix**, with that consequence stated to V in advance and accepted. The operator-visible remedy is `obsctl status`, recorded as an obligation on S22 (`t_37f2f56f`).

What IS in scope: whether the implementation actually achieves the property, whether the equality comparison can be defeated, and whether it broke anything else.

## What must still hold — the seat re-proved these; verify rather than assume

Byte-identical stderr across 12 paired arms with the installer contributing **zero** bytes (claimed static 561 / dynamic 392, with SHA256s on the ticket) · clean shutdown writes nothing · exactly one parseable record on the normal path · no leak across 9 paths including a poisoned `toJSON` and stack-frame text · arm determinism 30/30 then 24/24 under load · all three `normalizedSpoolDirectory` functions byte-identical to one another after RUNTIME normalisation · owned suite 59/59, L2 subset 119/119 · TBP §6.1 and T-5.

## NOT FINDINGS — routed, and re-reporting them burns the round
The `audit:source` `process.env` rows (V decision `t_d821f99e`) · S02's registry `switch` row (`t_8e040ec2`) · the 0-byte clean-boot spool, §3.6's macrotask wording, §3.8's drain race, and the four Tier-1 sink misbehaviours (all on S05b's seam contract, `t_3a04cc06`).

## Standing law
**Excluded zone** — never modified, never imported, **no filesystem metadata of any kind**: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`. No user-linked identifiers, no free text; ids are **declared kinds, never shape-inferred**.

**Typecheck §6.1** at base `7afdbe5`: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **The count-0 pin at `80362d0` is VOID; do not cite it.** T-5 fail-closed: `pnpm generate:contract` first, then **positively assert zero module-resolution escape** from YOUR worktree root.

No push, no merge, no self-Done, no ticket split, no branch operation, no database action.

## Method
Reproduce before concluding. Label each finding **CONFIRMED** (executed) or **PLAUSIBLE** (reasoned). **"No defects in this lens" is a legitimate and valuable verdict** — do not manufacture findings to look thorough. **A false evidence claim is itself a blocker.** State suite results as `passed/total` from output you saw printed. Report any undisclosed tuning constant.

## Return
Final message: `LENS <n> — GREEN` or `LENS <n> — FINDINGS`, then each finding with its label, the exact command and output establishing it, and what it breaks. Finish with `git status --porcelain` on your worktree proving you left it clean. Do not write to the board; Router posts.
