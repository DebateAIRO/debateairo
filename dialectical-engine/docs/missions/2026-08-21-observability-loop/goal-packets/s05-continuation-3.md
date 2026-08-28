# S05 — CONTINUATION 3. Three test-coverage items. No production behaviour changes.

## 0. Standing conditions

Round counting is **dissolved** for this slice by V (2026-08-27). No round budget, no ceremony. Reproduce-first RED, full constant disclosure, commit when green, stop at READY FOR PEER REVIEW. Genuine design forks come up through Router; permission to do what this packet orders does not.

Worktree `.worktrees/obs-lane-2/dialectical-engine`, branch `obs-lane-2-capture`. **Base is `01422e2`** (on `caac4d9`, on `14965fc`, on `7afdbe5`). Tree clean. Commit on top.

**A THREE-LENS BLIND DIAMOND JUST PASSED THIS CODE.** Lens 2 (security) returned GREEN outright. The shipped behaviour is not in question and **you are not changing it**. Every item below is a gap between what the tests prove and what the handoffs claimed. These files freeze into S05b's `contract.forbidden` when this slice closes, which is why untested-but-correct is not good enough here.

**HELD, DO NOT TOUCH:** the `realpathSync(normalized) === normalized` rule itself. A lens measured that it refuses `/tmp`, `/var`, `/var/spool` and `$TMPDIR` on this host because macOS ships them as symlinks into `/private`. That is with V as a policy question. Do not change the rule, do not soften it, do not add an escape hatch. If V changes it, that is a separate charge.

## 1. CHARGED — a spliced record passes the entire suite. Close it.

`install/{api,runner,scheduler}.ts:121` memoises the record buffer:

```ts
const bytes = tierZeroWriteAttempt?.bytes ?? Buffer.from(JSON.stringify({ ... }));
```

That memoisation is **load-bearing and untested**. A lens mutated it to rebuild the record on every attempt while keeping the persisted offset, and got a record welded from two different attempts:

```
writeSync calls: 3   distinct buffers: 2
  call1 buffer: occurred_at=...543Z  source_event_ref=2cf746f9-...
  call3 buffer: occurred_at=...545Z  source_event_ref=29e14402-...
  ON DISK:      occurred_at=...543Z  source_event_ref=29e14402-...
SUITE RESULT: 50 passed (50)
```

Head from attempt 1, tail from attempt 3. It still parses as JSON and still satisfies `toMatchObject({ code, runtime })`, because the envelope is byte-length-stable — fixed-width ISO timestamp, fixed-width UUID — so the splice lands on identical offsets.

**What is ordered:** an assertion that fails on that mutant. The lens named the cheap form — in `writeOutcomeProbe`, assert every write attempt used the *same* buffer (`new Set(buffers).size === 1`) — and you are not required to use it. **Prove it by mutation:** apply the rebuild-per-attempt mutant, show the suite now fails, restore, show it green. Paste both.

This is the fourth time this mission has charged a test that passes against a defect it exists to catch. Do not add an assertion that merely re-states the happy path.

## 2. CHARGED — B-2's stated property is not what the code achieves. Fix the claim and cover the arms.

All six matrix arms reproduce with exactly the claimed call counts `1 / 2 / 2 / 3 / 2 / 2`, and there is no livelock. But the matrix omits two arms, and in them the property fails:

```
half then all fail   calls=3  bytes=560  lines=1  parse=FAIL(Unterminated string)  trailingNL=false
half then all zero   calls=3  bytes=560  lines=1  parse=FAIL(Unterminated string)  trailingNL=false
```

The stated property is *"after any single fatal event the spool file holds EITHER exactly one parseable record OR no bytes at all, never a fused or torn line."* What the code actually achieves is **never fused**, **at most one record**, and **a torn prefix can survive** when a write commits bytes and every later attempt fails.

**This is not a regression** — the pre-fix code left the same torn prefix — and §3.8's drain skips a torn line as `REDACTOR_FAILURE`, the same cost as a fused one. **Do not change the write path to chase it.** What is ordered: add both arms to the matrix so the behaviour is pinned rather than accidental, and **state the achieved property accurately** in your handoff instead of the overstated one. If you believe the torn prefix is worth eliminating, that is a genuine question for Router, not a change to make quietly.

## 3. CHARGED — a test claims to close a window it does not test.

`tests/architecture/obs-l2-s05-boot-capture.test.ts:1113` is named:

> `"resolves the named directory once without a final-component swap window"`

It injects its swap into `lstatSync`. **Production no longer calls `lstatSync`.** The swap never fires, and the test proves only that the resolution trace has exactly one entry.

The window it is named for is real and is **not closable in Node** — `realpathSync` verifies by path, `openSync` re-resolves it, `O_NOFOLLOW` covers only the filename, and there is no `openat`. A lens measured it at 15.58–18.17 µs and could not win it in 293 boots across 243,458 attacker flips; a second lens could not win it in 381 boots across 166,598 flips on a 49-component path. It is a bounded residual, not a defect.

**What is ordered:** keep the single-resolution assertion, which is genuinely valuable — rename it to what it proves, and add a comment recording that the check-to-open window remains, is ~17 µs, is depth-independent, requires pre-existing write access to the spool directory's parent, and is bounded by `O_CREAT|O_EXCL|O_NOFOLLOW` at mode `0600`. A future reader must not believe this window was closed.

## 4. Do not break what three lenses just certified

Re-prove after your edits: **byte-identical stderr** (installer contributes zero bytes), **the no-leak result**, **exactly one record on the normal path**, **arm determinism**, and the four continuation-1 fixes (linear normalisation under its wall pin, the write-outcome matrix, `/` and `/////` refused, `.` accepted with `..` refused). All three `normalizedSpoolDirectory` functions must stay byte-identical to one another after RUNTIME normalisation.

## 5. Reporting — one standing lesson you must obey

**NEVER QUOTE AN ABSOLUTE STDERR BYTE COUNT AS A TREE PIN.** Three lenses measured three different numbers — 569/400, 561/392, 517/348 — and all three were correct: each seat's bespoke probe uses its own error token, the token appears four times in the stack, so the count is a property of the probe, not of the tree. The durable property is **paired-arm byte identity**. State it that way.

State suite results as `passed/total`, name failures and whether they predate you, and do not make blanket "nothing is caused by this diff" claims — the three `audit:source` `process.env` rows demonstrably are.

## 6. Standing law

**Excluded zone** — never modified, never imported, **no filesystem metadata of any kind**: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`. No user-linked identifiers, no free text; declared kinds only.

**Typecheck §6.1** at base `7afdbe5`: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. The count-0 pin at `80362d0` is **VOID**; do not cite it. T-5 fail-closed: `pnpm generate:contract` first, then positively assert zero module-resolution escape.

**Already routed — do not fix, do not report:** the `audit:source` rows (`t_d821f99e`), S02's registry `switch` row (`t_8e040ec2`), the 0-byte clean-boot spool, §3.6's macrotask wording, §3.8's drain race, the four Tier-1 sink misbehaviours (`t_3a04cc06`), and the `spoolFd: undefined` seam ambiguity (`t_37f2f56f`).

**No push, no merge, no Done, no ticket split, no branch or worktree operation, no database action.**

## 7. Where to stop

Commit on `obs-lane-2-capture` on top of `01422e2`. End at **READY FOR PEER REVIEW** on `t_6e99d607`, with the mutation proof for item 1, both new arms for item 2, the renamed test and its comment for item 3, the re-proofs from §4, and every constant disclosed. Then stop.
