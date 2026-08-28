# S02 — EXHAUSTIVE-1. One `switch`, one clause, and a compiler question nobody has answered.

## 0. Scope, and why this is small on purpose

Round counting is **dissolved** for this slice's family by V (2026-08-27). Reproduce-first RED, full constant disclosure, commit when green, stop at READY FOR PEER REVIEW.

Worktree `.worktrees/obs-lane-2/dialectical-engine`, branch `obs-lane-2-capture`. **Base is `367591e`.** Tree clean. Commit on top.

**This is not the S02 addendum.** That is gated behind RP-0 (`t_4deda7ab`), a V custodian act, and you must not touch it. S02's base work is **done and V-ratified** — the registry reproduces the ratified Set-A pin (276 members, `65ba47df…`), its suite is 23/23, and none of that is reopened.

**Your entire surface is `packages/obs-capture/src/registry/index.ts` and `tests/unit/obs-l2-s02-registry.test.ts`.** Nothing else. `packages/obs-capture/install/*.ts` are FROZEN — S05 closed GREEN and they are byte-identical to `01422e2`; a diff of one byte there is a contract violation.

## 1. CHARGED — the repo's own audit is red on this file, and the guard it wants is missing.

```
pnpm audit:source
  "packages/obs-capture/src/registry/index.ts has a switch without default + exhaustive fall-through"
```

Measured in the file: `switch (` ×1, `default:` ×0, `exhaustive(` ×0. The rule is `tools/orphan-audit/src/index.ts:474` — a file containing `switch (` must contain **both** `default:` and `exhaustive(`.

The site is `validatesDeclaration` at `:585-603`, a **type predicate** switching over the four typed-template-parameter kinds — `id`, `registry_code`, `closed_enum`, `bounded_int`. This is the code carrying V's DECLARED KINDS, NOT SHAPES rule and Pg0-a §7-R's "no string parameter may carry unvalidated input". The repo's carrier for this pattern already exists: `exhaustive(value: never): never` at `packages/kernel/src/index.ts:279`.

**State the consequence accurately, because it is smaller than it looks and overstating it is its own defect.** Router traced the caller: `validateTemplateParameters` at `:605-647` treats a falsy predicate as `dropped.push(name)`, with `fallback_minimized = dropped.length > 0`. So an unhandled kind degrades to *parameter dropped, record marked minimized* — the **fail-closed** direction, and the honest one. It is not a data-safety hole. What it is, is **silent and misattributing**: a fifth kind would make every parameter of that kind vanish and every record read `fallback_minimized: true`, whose declared meaning is redaction pressure, not an unhandled declaration type. A human reading that row would diagnose the wrong subsystem — which is the precise failure class this mission exists to eliminate, sitting in the mission's own code.

**Ordered:** add the `default:` clause with the kernel's `exhaustive()` carrier. Show `audit:source` losing this row — paste the `blocking` array before and after.

## 2. CHARGED — settle the compiler question BY EXECUTION. Nobody has.

Under `strict: true` (`tsconfig.json:7`, and `noImplicitReturns` is **not** set), does adding a fifth member to `TemplateParameterDeclaration` raise **TS2366** at the fall-through, or does it compile silently?

This has been asserted in both directions and measured in neither. Router deliberately did not test it, because doing so meant mutating a worktree another seat was working in. You own this worktree now, so it is yours.

Add a fifth member to the union, run `pnpm typecheck`, **paste the diagnostic or the absence of one**, then revert and show the count back at 9. Then say plainly which is true.

**This matters beyond tidiness.** If the compiler catches it, `exhaustive()` is belt-and-braces and the repo's convention is cheap insurance. If it does **not**, then that `default:` clause is the *only* thing standing between a future fifth kind and silent misattribution — and that is worth knowing repo-wide, not just here. Report it either way.

## 3. UNCHARGED, and do not go looking for more

Do not refactor the registry. Do not touch the ratified pin, the Set-A derivation, the declared-gap or forwarder-manifest hashes, or any of the 23 existing tests except to add what §1 and §2 require. This slice has been charged five times for tests that pin a proxy instead of a property — do not add an assertion that merely restates the happy path.

If your `default:` clause needs a test, the falsifiable form is: the clause is reachable only by a declaration kind the union does not contain, so **assert it by mutation** rather than by calling it. If you conclude no test is warranted because the compiler already fails the mutation, say so with the evidence from §2 and add nothing. **Declining to add a test is the correct answer when the property is already pinned**, and this family has been over-fixed before.

## 4. Standing law

**Excluded zone** — never modified, never imported, no filesystem metadata of any kind: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`.

**Typecheck §6.1** at base `7afdbe5`: count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. The count-0 pin at `80362d0` is **VOID**; do not cite it. T-5 fail-closed: `pnpm generate:contract` first, then positively assert zero module-resolution escape. Adding an import must not move the count.

**Already routed — do not fix, do not report:** the three `audit:source` `process.env` rows on `install/*.ts` (V decision row `t_d821f99e`; §3.7 mandates env-only config so those files cannot satisfy the rule, and the remedy is under `tools/`, which is floor-deny). The 0-byte clean-boot spool, §3.6's macrotask wording, §3.8's drain race and the Tier-1 sink misbehaviours (`t_3a04cc06`). The macOS canonical-path documentation (`t_37f2f56f`, `t_89061516`, `t_a85ad2d8`).

**No push, no merge, no Done, no ticket split, no branch or worktree operation.** V performs every merge.

## 5. Reporting, and one standing rule this family earned

State suite results as `passed/total`, name any failures and whether they predate you, and make **no blanket claim** that nothing is caused by this diff. **Never quote an absolute stderr byte count as a tree pin** — three lenses measured three different values and all three were correct, because each probe carries its own error token; the durable property is paired-arm byte identity. A quotation formatted as verbatim output must **be** verbatim.

## 6. SELF-REPORT — binding, and you are the second agent ever held to it

Before your final handoff, write 10-20 honest lines to
`.hermes/reports/2026-08-21-observability-loop/agent-reports/s02-exhaustive-1.md`
covering **what went well · what fought you · what you would change**.

Not a summary of your handoff — that exists and nobody needs it twice. What you would tell the next seat: friction with the tooling, ambiguity in this packet, a place the contract made you guess, something you nearly got wrong. If this packet was unclear, say so and say where; Router wrote it and Router is the one who needs to know. **An anodyne self-report is worse than none, because it makes an empty record look full.**

## 7. Where to stop

Commit on `obs-lane-2-capture` on top of `367591e`. End at **READY FOR PEER REVIEW** on `t_8e040ec2` — note that is S02's ticket, **not** S05's — with the before/after `blocking` arrays, the §2 compiler verdict with its pasted evidence, your §3 decision and reasoning, the TBP figures, and every constant disclosed. Then stop.
