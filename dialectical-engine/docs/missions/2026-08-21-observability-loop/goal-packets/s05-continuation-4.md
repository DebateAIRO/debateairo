# S05 — CONTINUATION 4. One line in a test probe, and one sentence corrected.

## 0. Standing conditions

Round counting is **dissolved** for this slice by V (2026-08-27). Reproduce-first RED, full constant disclosure, commit when green, stop at READY FOR PEER REVIEW.

Worktree `.worktrees/obs-lane-2/dialectical-engine`, branch `obs-lane-2-capture`. **Base is `693c77a`**. Tree clean. Commit on top.

**PRODUCTION CODE IS NOT IN SCOPE AND MUST NOT CHANGE.** `git diff <your commit> -- packages/obs-capture/install/` must be zero lines, exactly as continuation 3 achieved. The three installers must stay byte-identical to their `01422e2` versions. The V-ruled `canonicalPath === normalizedPath` rule is untouchable.

## 1. CHARGED — the assertion added by continuation 3 checks the wrong property, and a verification lens proved it by producing the exact charged defect while the suite stayed green.

Continuation 3 closed the splice hole with a buffer-**identity** invariant: `new Set(buffers).size === 1` in `writeOutcomeProbe`, asserted per arm. Against the mutant it was built for — rebuild `Buffer.from(JSON.stringify(...))` on each attempt — it works: 6 of 8 arms fail with `expected 2 to be 1 // Object.is equality`.

But `Object.is` compares the **reference**. The property that matters is that every byte written comes from **one immutable serialization**. A mutant that re-serialises into the *same* buffer object defeats it:

```ts
const bytes = tierZeroWriteAttempt?.bytes ?? rebuilt;
if (tierZeroWriteAttempt !== undefined && rebuilt.byteLength === bytes.byteLength) {
  bytes.set(rebuilt);          // same object, new contents
}
```

Measured against that mutant, outcomes `["half","fail","success"]`:

```
writeSync calls  = 3
distinctBuffers  = 1                      <-- the new assertion is satisfied
  call1 off=0    occurred_at=…18.501Z  source_event_ref=beafb9b1-…
  call3 off=567  occurred_at=…18.502Z  source_event_ref=5c32262a-…
ON DISK parse            = OK
ON DISK occurred_at      = …18.501Z                       <-- head, attempt 1
ON DISK source_event_ref = 5c32262a-13bf-475e-9c0b-5b5a6d6b56cb   <-- tail, attempt 3

pnpm exec vitest run …obs-l2-s05-{import-graph,boot-capture}.test.ts  ->  61 passed (61)
```

**The whole owned suite is green while a spliced record sits on disk.** That is byte-for-byte the defect this matrix exists to catch. The test named `"never fuses retry bytes after %s"` does not establish "never fuses retry bytes" — it establishes "never used two buffer *objects*". This is the same class of overclaim continuation 3 correctly fixed at `:1139`: the name asserts the property, the assertions prove a proxy for it.

`packages/obs-capture/install/*.ts` freeze into S05b's `contract.forbidden` when this slice closes, so this matrix is the **permanent** guard on the memoisation. It must not be guarding a proxy.

**THE REMEDY IS VERIFIED AND YOU ARE FREE TO IMPROVE ON IT.** The lens added a content digest alongside the identity Set — `contents.add(sha256(buffer))`, assert `distinctContents === 1` — and measured both directions:

```
candidate fix + real production code  ->  52 passed (52)        (no false alarm)
candidate fix + content mutant        ->  6 failed | 46 passed (52)
```

It also still kills the original rebuild mutant. **Keep the identity assertion as well** — it is cheap and it names a distinct failure mode.

**PROVE IT BOTH WAYS, THREE MUTANTS:** (a) the original rebuild-per-attempt mutant, (b) the in-place `bytes.set(rebuilt)` mutant above, (c) the unmutated tree. Show (a) and (b) RED and (c) GREEN, restore, and prove the installers byte-identical to `01422e2` by sha256.

## 2. CHARGED — the achieved-property sentence is still too narrow. Correct it.

Continuation 3 wrote: *"a torn prefix can survive when a write commits bytes and every later attempt fails or makes zero progress."* Sufficient, but not the actual envelope. On the **clean, unmutated tree**, outcomes `["half","half","fail"]`:

```
writeSync calls = 4
  call1 half off=0    call2 half off=567   (283 further bytes committed)
  call3 fail off=850  call4 fail off=850
ON DISK bytes = 850   trailingNL = false   lines = 1   parse = FAIL(Unterminated string)
```

Call 2 neither failed nor made zero progress, and an 850-byte torn prefix still survives. The accurate statement, which the lens supplied and you should use or better:

> Retries never fuse or splice — every on-disk byte comes from one immutable serialization written at a monotonically advancing offset, so the spool holds at most one record. A torn prefix survives whenever at least one write commits bytes and the record never completes, **regardless of whether the later attempts fail, stall, or commit further bytes.**

**Do not change the write path.** Pin the `["half","half","fail"]` shape as a ninth arm so the wider envelope is asserted rather than described, and state the property correctly in your handoff.

## 3. Evidence hygiene — three corrections to carry forward, none of them defects

The lens found no false evidence claim, but three things in the last handoff read as stronger than they are. Do not repeat them:

- **`"expected 1 distinct buffer, received 2"` was a gloss.** Vitest emits `AssertionError: expected 2 to be 1 // Object.is equality`, with no mention of buffers. The substance reproduced exactly — but a quotation formatted as verbatim output must be verbatim.
- **The `normalizedSpoolDirectory` sha256 `aa2473c9…` is a property of an unpublished extraction recipe, not of the tree.** Report the durable form — one unique digest across all three files — not the absolute value, unless you also publish the recipe.
- **"unresolved resolution real paths: 0" is definitionally zero** and carries no containment information. The informative T-5 figure is the **escape count**.

Also note: the lens measured 5,041 resolution frames and 1,046 unique real paths where continuation 3 reported 5,057 and 1,048. Neither is a tree pin, and the lens reported its own without absorbing the discrepancy. Do the same — **zero escape is the criterion**.

## 4. Do not break what is certified

Re-prove: byte-identical stderr (paired-arm property only — **never quote an absolute byte count as a tree pin**), the no-leak result, exactly one record on the normal path, arm determinism, the continuation-1 pins (linear normalisation under its wall bound; the original six arms at `1/2/2/3/2/2`; `/` and `/////` refused; `.` accepted, `..` refused), and one unique `normalizedSpoolDirectory` digest across all three installers.

## 5. Standing law

**Excluded zone** — never modified, never imported, no filesystem metadata of any kind: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`.

**Typecheck §6.1** at base `7afdbe5`: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. The count-0 pin at `80362d0` is **VOID**. T-5 fail-closed: `pnpm generate:contract` first, then positively assert zero module-resolution escape.

**Routed, do not fix or report:** `t_d821f99e`, `t_8e040ec2`, `t_3a04cc06`, `t_37f2f56f`, `t_89061516`, `t_a85ad2d8`. The `finalComponentSwapProbe` naming and its structurally-unfalsifiable assertions are **known and deliberately left** — the packet that ordered the rename considered removal and chose not to.

**No push, no merge, no Done, no ticket split, no branch or worktree operation.**

## 6. Where to stop

Commit on `obs-lane-2-capture` on top of `693c77a`. End at **READY FOR PEER REVIEW** on `t_6e99d607`, with all three mutant results, the ninth arm, the corrected property statement, the re-proofs, and every constant disclosed. Then stop.
