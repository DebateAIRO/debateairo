# S05 — CONTINUATION 5. Stop pinning mutants. Pin the property.

## 0. Standing conditions

Round counting is **dissolved** for this slice by V (2026-08-27). Reproduce-first RED, full constant disclosure, commit when green, stop at READY FOR PEER REVIEW.

Worktree `.worktrees/obs-lane-2/dialectical-engine`, branch `obs-lane-2-capture`. **Base is `602afba`**. Tree clean. Commit on top.

**PRODUCTION CODE IS NOT IN SCOPE AND MUST NOT CHANGE.** `git diff 01422e2..<your commit> -- packages/obs-capture/install/` must be **zero lines** and all three installers must stay byte-identical to their `01422e2` versions by sha256. The V-ruled `canonicalPath === normalizedPath` rule is untouchable. **The write path is correct** — a verification lens tried to break it in every shape it could construct and could not. Only the tests are wrong.

## 1. READ THIS BEFORE THE CHARGE. The pattern matters more than the bug.

Three consecutive rounds have now shipped an assertion that pinned **exactly the mutant it was shown, and nothing more**:

| round | claimed to prove | actually proved | defeated by |
|---|---|---|---|
| c3 | "never fuses retry bytes" | never used two buffer **objects** | re-serialise into the same object |
| c4 | one immutable serialization at a **monotonically advancing offset** | the buffer **contents** never differ | corrupt the **offset**, leave the buffer alone |
| — | ? | ? | ? |

Each fix was correct about the mutant in front of it and silent about the property behind it. **Do not write a third assertion aimed at the mutants below.** Write the one that follows from the property, and then check the mutants fall out of it.

## 2. CHARGED — the offsets are never asserted, and corrupting them keeps the suite green.

A verification lens applied these to **all three** installers, changing no buffer and no contents:

```ts
// o6 — one-line off-by-one in the memoised resume offset
if (tierZeroWriteAttempt !== undefined
  && tierZeroWriteAttempt.offset > 0
  && tierZeroWriteAttempt.offset < tierZeroWriteAttempt.bytes.byteLength) {
  tierZeroWriteAttempt.offset += 1;      // o7 is the same line with -= 1
}
```

Same object, same contents, one immutable serialization. Measured on `["half","fail","success"]`:

```
o6 (+1):  call1 off=0 wrote 567 | call2 off=567 FAIL | call3 off=568 wrote 566
          ON DISK 1133 bytes, parse OK, distinctBuffers=1, distinctContents=1
          DISK vs SERIALIZED diverges at byte 567
            serialized[563..579] = "UNKNOWN:DECLARE
            on-disk   [563..579] = "UNKOWN:DECLARED      <-- a byte dropped from the middle

o7 (-1):  call3 off=566  (the offset goes BACKWARDS — "monotonically advancing" is false)
          ON DISK 1135 bytes, parse OK          <-- a byte duplicated

both:     Test Files 2 passed (2) · Tests 62 passed (62)
```

The record still ends in `\n`, is still one line, still parses, and still matches `{ code, runtime }` — while `at_seq_watermark` silently reads `"UNKOWN:DECLARED_KIND_REQUIRED"`. **Both invariants pass at 1.**

**The owned suite is the entire guard.** The lens grepped the repository: only `obs-l2-s05-boot-capture.test.ts` and `obs-l2-s05-import-graph.test.ts` reference these installers at all. When `install/*.ts` freeze into S05b's `contract.forbidden`, this matrix is all that stands behind them — and it is 62/62 green with a corrupted record on the spool.

**Why the matrix is structurally blind, and why adding arms will not fix it:** the only arm whose retry writes *after* a partial commit is `["half","fail","success"]`. In arms 7–9 the retry commits nothing. And the torn branch asserts only nonempty / no trailing newline / one line / parse fails — every one of which a corrupted prefix satisfies. A missing or duplicated byte inside a string value breaks none of them.

## 3. THE REMEDY, verified by the lens in both directions across eight mutants

Persist the intercepted buffer, and assert that **the on-disk bytes are a prefix of the single serialization**. That is the property itself — not a proxy for it — and it subsumes both existing invariants and the offset arithmetic in one assertion:

```
CLEAN TREE, all nine arms                 -> prefix = true     (no false alarm)
a-rebuild, b-inplace                      -> prefix = false
o1, o2, o3, o4, o6, o7 (offset mutants)   -> prefix = false
```

`["half","fail","success"]` is the discriminating arm for every one of them.

**Keep `distinctBuffers` and `distinctContents` as well.** They cost nothing and they name two distinct failure modes precisely, which makes a future failure diagnosable rather than merely detected. The prefix assertion is the property; those two are the diagnosis.

**Prove it with all eight mutants**, each applied to **all three** installers, plus the clean tree. Show the clean tree green and every mutant red, name which assertion fires for each, then restore and prove byte-identity to `01422e2` by sha256.

## 4. CHARGED — a methodology defect in the last round's own proof

The previous seat applied its mutants to **`runner.ts` only**. That form is *also* killed by `obs-l2-s05-import-graph`'s `new Set(sources.map(normalizeProcessInstaller)).size === 1`, which detects the three installers diverging from each other. So a single-installer mutant is **over-detected**: it dies on the byte-identity guard regardless of whether the behavioural assertion works.

The previous round's mutant proof was therefore weaker than it read. **Every mutant you apply goes to all three installers**, so the identity guard stays satisfied and only real behaviour is under test. State that you did this.

## 5. UNCHARGED, and do not over-fix it

The ninth arm `["half","half","fail"]` was added to pin *"later attempts … commit further bytes"*, but its calls 1 and 2 are inside the **same** `writeComplete` loop of the **monitor** attempt — so it pins "a later **call** commits further bytes". The clause about a later **attempt** is pinned by no arm. The lens measured the shape that does exercise it on the clean tree, `["half","fail","half","fail"]`: 4 calls, `off=0 wrote 567 | fail | off=567 wrote 283 | fail`, 850 bytes, no trailing newline, parse fails.

**The property statement is TRUE** — the lens could not falsify it in any direction. If the prefix assertion from §3 already covers this shape, say so and add nothing. If a tenth arm is genuinely the cheapest way to assert the clause, add it. Do not add an arm merely to have added one.

## 6. Do not break what is certified

Re-prove: paired-arm stderr byte identity (**never quote an absolute byte count as a tree pin**), the no-leak result, exactly one record on the normal path, arm determinism, the continuation-1 pins (linear normalisation under its wall bound; original six arms at `1/2/2/3/2/2`; `/` and `/////` refused; `.` accepted, `..` refused), and one unique `normalizedSpoolDirectory` digest across all three installers — **the uniqueness property, not an absolute digest from an unpublished recipe**.

## 7. Standing law

**Excluded zone** — never modified, never imported, no filesystem metadata of any kind: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`.

**Typecheck §6.1** at base `7afdbe5`: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. The count-0 pin at `80362d0` is **VOID**. T-5 fail-closed: `pnpm generate:contract` first, then positively assert zero module-resolution escape.

**Routed — do not fix or report:** `t_d821f99e`, `t_8e040ec2`, `t_3a04cc06`, `t_37f2f56f`, `t_89061516`, `t_a85ad2d8`. The `finalComponentSwapProbe` naming is known and deliberately left.

**No push, no merge, no Done, no ticket split, no branch or worktree operation.**

## 8. Where to stop

Commit on `obs-lane-2-capture` on top of `602afba`. End at **READY FOR PEER REVIEW**, with the eight-mutant proof, the clean-tree green, which assertion fires for each mutant, the §4 statement, your §5 decision with its reasoning, the §6 re-proofs, and every constant disclosed. Then stop.
