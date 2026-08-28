# S05 — CONTINUATION 2. One charge: the spool path is resolved unsafely, in two ways.

## 0. Standing conditions, unchanged from continuation 1

Round counting is **dissolved** for this slice by V (2026-08-27): *"its just a blocker, continue as you are until it is fixed... no need for more rounds if new blockers are found. Just questions."* There is no round budget to ask for. Reproduce-first RED, full constant disclosure, commit when green, and stop at READY FOR PEER REVIEW still apply. A genuine design fork comes up through Router; permission to do what this packet already orders does not.

Worktree `.worktrees/obs-lane-2/dialectical-engine`, branch `obs-lane-2-capture`. **Base is `caac4d9`** (on `14965fc`, on `7afdbe5`). Tree clean. Commit on top.

## 1. Why this exists now, and why it was held until now

A blind security lens found this during the review of `14965fc`. Router **held it** rather than charging it, because it predates all of this slice's work and fixing it changes what these files are permitted to become. Router put it to V directly. **V ruled on 2026-08-27: charge both halves now.** The reasoning V was given, and accepted: `install/*.ts` freezes into S05b's `contract.forbidden` when this slice closes, so this is the last moment the fix can exist at all — and the cheapest, because a seat is already in these files.

Continuation 1 (`caac4d9`) was explicitly ordered **not** to touch this and did not: the lens's window is intact and `lstatSync(finalComponentPath)` still sits immediately adjacent to `return realpathSync(value)`, now at lines 58-59. You are the seat that closes it.

## 2. CHARGED — half one, the deterministic half. Only the FINAL component is checked; a symlinked ancestor is followed every time.

`install/{api,runner,scheduler}.ts` checks that the **last** name in `OBS_SPOOL_DIR` is not a symlink, then calls `realpathSync(value)` on the whole path and opens a file in the result. **Every other component is resolved silently and followed.**

So with `OBS_SPOOL_DIR=/var/spool/obs`, if `/var/spool` is a symlink to `/mnt/other`, every fatal record lands in `/mnt/other/obs` and the operator is never told. **No race, no timing, no attacker needed — 100% of boots, deterministically.**

This is not a hypothetical deployment shape. §3.7 itself requires the spool to sit on **a different volume from `PGDATA`** — precisely the situation in which an administrator reaches for a symlink. The lens verified the behaviour: `$FIX/mid/hop/inner` resolves through `realpathSync` to `$FIX/elsewhere/inner`, and the descriptor is opened and written there.

## 3. CHARGED — half two, the race. Two independent resolutions of the same path.

```ts
if (lstatSync(finalComponentPath).isSymbolicLink()) return undefined;
return realpathSync(value);
```

Two separate lookups. Replace the final component between them and `realpathSync` follows the new symlink. `O_NOFOLLOW` does not save you: it covers the **filename** at open time, and the **directory** was already canonicalised, so nothing re-checks it.

Measured by the lens, unassisted — a real `symlinkSync` flipper process against the real installer, 40-component path:

```
VICTIM_ITERATIONS 40000, elapsed 30502 ms
RACE WON (files in attacker dir): 2
  api-76488-244bfcd7-….spool
  api-76488-e40ef3ff-….spool
```

Two wins in 40,000; 0/40,000 on two subsequent runs — roughly 1e-4 to 1e-5 per boot against a spinning attacker. Deep paths widen the window because `realpath` spends longer on the prefix. Injecting the swap **between** the two calls puts the full 1108-byte Tier-0 record in the attacker's directory deterministically.

Bounded, and say so in your handoff rather than overstating it: the prerequisite is write access to the parent of the named directory; `O_EXCL` still prevents clobbering an existing file and `O_NOFOLLOW` still prevents following a symlink at the filename. The outcome is creation of a new `0600` file with a fixed-shape name and fixed-shape JSON in a directory the operator did not name.

## 4. The property to achieve

**The descriptor must be opened inside the directory the operator actually named — resolved once, with no component followed that the operator did not write, and no window in which the resolution can change underneath it.**

Router states the property, not the mechanism. One candidate exists and is cheap: resolve once with `realpathSync` and **require the canonical result to equal the value the operator gave** (after your own separator normalisation), which refuses every symlinked component — ancestor or final — in a single resolution that has nothing to race against, and lets you drop the separate `lstat` entirely. You are not required to use it. Whatever you choose, **disclose the mechanism and why it has no window.**

**THE TRADE-OFF YOU MUST STATE, because it is a real behaviour change.** Refusing symlinked ancestors means a deployment that legitimately uses a symlinked spool path stops capturing. That failure is **silent**, because §2.4 forbids throwing, logging or delaying boot. So you are replacing *"silently writes to the wrong place"* with *"silently writes nowhere"*. Router's position, and the reason this is charged rather than questioned: fail-closed is consistent with the refusal these files **already** apply to a symlinked final component, and the operator-visible remedy is `obsctl status` (§R-5), now recorded as an obligation on S22 `t_37f2f56f`. **State the consequence plainly in your handoff so nobody discovers it later.** If your reading of §3.7 makes you believe the other direction is correct, that is a genuine question — raise it through Router rather than choosing quietly.

## 5. What you must not break

Continuation 1 fixed four things in these same files. **Re-prove each after your edits** — a path-resolution rewrite is exactly what would regress them:

- **B-1** normalisation is now linear, pinned by a wall-clock bound (`BOOT_STALL_SEPARATOR_COUNT = 60,000`, `BOOT_STALL_MAX_MS = 2,000`). Your change must not reintroduce super-linear cost. Run that test and paste it.
- **B-2** a write that fails after committing bytes no longer fuses a truncated prefix with a retry. The write-outcome matrix (success / half / fail / zero, expected call counts 1 / 2 / 2 / 3 / 2 / 2) must still hold.
- **R-1** `/` and `/////` are refused.
- **S-1** `.` segments are accepted (`/dir/.`, `/a/./b`) while literal `..` stays refused.

And the standing certifications three blind lenses re-proved, four of which you re-prove again: **byte-identical stderr** (the installer contributes zero bytes in every configuration), **the no-leak result**, **exactly-one-record on the normal path**, and **arm determinism**. All three `normalizedSpoolDirectory` functions must remain byte-identical to each other after RUNTIME normalisation — continuation 1 left them at sha256 `2f2bf44382d801cf14d018fb733462e5d19596597867b4463e60ae280cf2e93b`; yours will differ, but they must still agree with one another.

## 6. RED is mandatory and reproduce-first

Against the current tree, before any edit:
1. Build a real symlinked **ancestor** — a directory whose parent component is a link — and show a fatal record landing in the link's target rather than the named path. This is the deterministic half; it needs no race and must reproduce every time.
2. Demonstrate the race, or state honestly that you could not win it and show the deterministic injection between the two calls instead. The lens needed 40,000 iterations for two wins; **do not burn hours chasing it** — the injected proof is sufficient and the deterministic half above is the real charge.

Paste both frames.

## 7. Standing law, unchanged

**Excluded zone** — never modified, never imported, **no filesystem metadata of any kind**: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`. No user-linked identifiers, no free text; ids are declared kinds.

**Typecheck §6.1** at base `7afdbe5`: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **The count-0 pin at `80362d0` is VOID; do not cite it.** T-5 fail-closed: `pnpm generate:contract` first, then **positively assert zero module-resolution escape** from the worktree root.

**Already routed — do not fix, do not report:** the `audit:source` `process.env` rows (`t_d821f99e`), S02's registry `switch` row (`t_8e040ec2`), the 0-byte clean-boot spool, §3.6's macrotask wording, §3.8's drain race, and the four Tier-1 sink misbehaviours (`t_3a04cc06`).

**No push, no merge, no Done, no ticket split, no branch or worktree operation, no database action.** V performs every merge.

## 8. Reporting

State suite results as `passed/total`, name any failures and whether they predate you. Continuation 1 set the standard here and you inherit it: it declined to make a blanket "nothing is caused by this diff" claim and instead named exactly which routed rows the cumulative S05 diff does cause. Do the same.

Disclose **every** constant you choose. Commit on `obs-lane-2-capture` on top of `caac4d9`. End at **READY FOR PEER REVIEW** on `t_6e99d607`. Then stop.
