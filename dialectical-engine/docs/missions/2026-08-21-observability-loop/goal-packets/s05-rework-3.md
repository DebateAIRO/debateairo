# GOAL PACKET — S05 REWORK 3 — ticket `t_6e99d607`

**`rework_round: 3 of 3`. ONE item charged. This is the LAST round under the standing convention, and `packages/obs-capture/install/*.ts` is FROZEN to every later slice — S05b's `contract.forbidden` includes it. Everything here is a last-chance fix.**

## 0. Read first
1. `planning/L2-ADDENDUM-PLAN.md` **§2**, **§3.5**, **§3.7** (the config seed table — this round turns on it), **§6.1**.
2. Ticket: `hermes kanban --board observability-loop show t_6e99d607` — `--board observability-loop` **before** the verb; never `boards switch`.

## 1. What three lenses certified. NOT reopened, and you must not break it.
- **D1 is genuinely fixed** — delay `0`, arm fires in turn 1 (~1.3 ms, was ~25 ms), and the test **fails** when a 25 ms or 40 ms arm is substituted. Proven by mutation.
- **Clean shutdown writes nothing** — 30 scenarios, 3 runtimes, zero anomalies. The monitor/`exit` duplicate hazard is closed by `fatalBoundaryRecordAttempted`; removing that latch fails 7 tests.
- **12/12 paired arms**: equal status, **byte-identical** stderr (verified by sha256 and `Buffer.compare`, not by length).
- **Zero-arity handler intact.** Six token classes planted across message, two-level `cause` chain, own properties **and stack-frame text** (secret in the directory name, the filename, and a function name), plus six hostile env vars — **nothing reached disk on either write path**, in all three runtimes.
- **G5-4 pin holds** — 31 keys, deeply equal to the live redactor.
- **`writeComplete` is a character-for-character match** of `spool.ts`'s reference loop; 1-byte-at-a-time writes complete without spinning.
- **`O_EXCL` + `O_NOFOLLOW` genuinely close A6/A7** — a symlink planted at the *exact* predicted filename is refused with `EEXIST`, degradation is silent, and a pre-existing `0666` file keeps its content and mode. The refusal is a **kernel guarantee, not entropy** — proven by forcing the filename fully predictable.
- **The seam is capability-complete.** A lens walked all four S05b obligations and proved them by execution, including writing *through* the handed-out fd and confirming a Tier-1 swap yields **one** record, not two.
- **13 reversion mutants** were all caught by the suite. **TBP exact**: 9 / `98c8eb42…`, T-2 zero, T-5 5,057 resolutions / **0 escapes**.

**Do not redo any of it. Every change below must leave all of it true — re-prove the byte-identical stderr and the no-leak result after your edits.**

---

## 2. CHARGED — C1 · four undisclosed Tier-0 constants that diverge from §3.7's seeds

`install/{api,runner,scheduler}.ts:59-61,90`. Measured with every `OBS_*` unset except `OBS_SPOOL_DIR`, read off the raw record:

| field | delivered default | §3.7 declared seed |
|---|---|---|
| `environment` | `"development"` | `"unknown"` |
| `build_ref` | `"UNTRACKED-DEV:unknown"` | `"UNTRACKED-DEV:UNKNOWN"` |
| `build_dirty` | `false` | `true` |
| `writer_identity` | `"obs-capture-runner"` | the runtime name |

None appear in your 22:55 **TUNING CONSTANT DISCLOSURE**. They are invisible to the entire suite because `fixtureEnvironment()` sets **all seven** `OBS_*` variables on every child, so no probe ever exercises a fallback and G5-4 cannot see them — it pins the *shape* while the fixture supplies the *values to both sides*.

**Why it matters and why it is now-or-never:** in a default environment Tier 0 and Tier 1 will stamp **different** `environment`, `build_dirty` and `writer_identity` for the same process, because S05b reads §3.7's seeds. `build_dirty: false` is the **dishonest direction** against §3.7's own words ("honest interim stamp"), and `writer_identity` is §3.7's **A.2 chain-key selector**. After this round nobody can reconcile them — `install/*.ts` is forbidden to S05b.

**Charged** under the explicit, twice-repeated instruction to disclose every tuning constant you choose. Not for the values — §2.4 does not bind you to §3.7's table — **for choosing four defaults silently while filing a disclosure section that omitted them.**

**Required:** align each to §3.7's seed, **or** keep a divergence and state the reason in the source and the handoff. Either way, add a test that exercises the **unset** environment so the defaults are reachable by the suite at all.

---

## 3. UNCHARGED — the frozen-surface fixes

**A1 · Type the seam.** `RUNTIME_CAPTURE_MODULE` is a `const`, not a literal, so `import()` returns `any` and TypeScript **never** checks that `startCaptureRuntime` exists or that its argument matches — not now, and not after S05b writes the module, because these files are frozen to it. A lens proved the mechanism standalone: the literal form raises `TS2307` (which would break T-2 — your workaround was reasonable), the const form accepts `m.anyNameAtAll(1,2,3,"unchecked")` with zero diagnostics. **Declare the call shape locally and assert the dynamic import to it**, pinning the seam structurally without resolving the module. Say in the handoff that you did, and why the literal is not usable.

**A2 · The latch is set before the sink runs.** `:106-109` sets `fatalBoundaryRecordAttempted` **before** calling `exitSink()`. A Tier-1 sink that throws, or is `null`, or was installed by a `startCaptureRuntime` that then threw, **silently destroys fatal capture in all three production runtimes with no Tier-0 fallback** — confirmed across four variants, 0 bytes each. Set the latch **after** a successful write, or keep the Tier-0 serializer as an explicit fallback when the sink throws. Add a `typeof nextExitSink === "function"` guard on `installExitSink`.

**A3 · Validate the handed-out fd before writing.** Confirmed: a seam holder that closes `spoolFd` and opens other files causes the **Tier-0 record to be written into an unrelated file** via descriptor reuse. Snapshot `fstatSync(spoolFd).dev/.ino` at open and re-check before writing. Node builtins only; forbidden by no clause.

**A4 · Make G5-5 part 2 falsifiable.** The prompt-exit probe replaces `globalThis.setTimeout` with a stub that never creates a real timer, then calls `process.exit(0)`. Both defeats are total, so `loaded === false` is a tautology — a 25 ms arm and a missing `.unref()` are both indistinguishable from correct. **Run the prompt-exit arm with the real `setTimeout` and let the process end naturally.** A criterion incapable of failing is the shape that was charged in round 2; do not leave one behind in the same file.

**A5 · Normalise `OBS_SPOOL_DIR`.** Used raw. Confirmed: `a/b/../../../x` escapes; a symlinked directory redirects (`O_NOFOLLOW` covers only the final component); a relative value landed a file **inside the repo working tree**. `O_EXCL` bounds the blast radius to creating one benign `0600` file, so this is hardening — but `path.resolve` plus reject-`..` plus absolute-only closes it in three lines.

**A6 · Tighten G5-2's in-repo assertion.** It compares stderr **byte length**; the certified property is **byte identity**. A lens verified identity independently. Use `Buffer.compare`.

**A7 · Disclose or derive the `75`.** `obs-l2-s05-boot-capture.test.ts:65` — a bare `setTimeout(…, 75)`, un-named, undisclosed. Two lenses flagged it. It is **not** the `25` failure class (both arms share it and the control positively asserts a crash, so an undersized value fails loudly) — but name it and state it.

## 4. Route onward, NOT yours — do not fix these here
§3.6's "exactly one macrotask" is literally false (`startCaptureRuntime` lands at turn 2–3; intrinsic to `import()`) → plan/S05b. The 0-byte spool file created on every clean boot and never unlinked → ops (S14/S25). §3.8's cross-process drain selecting a *live sibling's* file → S05b; your per-process name is what makes it fixable, via `process.kill(pid, 0)`. A non-zero graceful exit writing a `DEGRADED` record → plan-level; §3.5 mandates the `exit` registration and G5-4 forces the envelope shape, so you had no lawful alternative and this is not a defect.

## 5. Typecheck (§6.1) — base `7afdbe5`
Pin: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **The count-0 pin at `80362d0` is VOID — do not cite it.** T-5 fail-closed: `pnpm generate:contract` first, then **positively assert zero module-resolution escape**. A1 must not add a diagnostic — if typing the seam raises one, that is a blocker to report, not a reason to leave it untyped.

## 6. Where you stop
No push, no merge, no Done, no ticket-split, no worktree or branch operation, no database action. End at **READY FOR PEER REVIEW** on `t_6e99d607`. **Disclose every constant, and state explicitly which of §3.7's seeds you matched and which you deliberately diverged from.** Then stop.
