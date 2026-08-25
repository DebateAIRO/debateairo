# TP-10 TYPECHECK-CRITERION CORRECTION — second QA→ARCH return on `t_489ecbcc` (lane L2)

- **Seat:** ARCHITECTURE, Claude Opus (intake amendment **A4**). Read-only everywhere except this file. This seat writes no ticket; the **Router** applies the correction to the board.
- **Returning edge:** spine §7 `QA→ARCH RETURN` — *defect is in: **acceptance-criteria***. `rework_round` unchanged (a plan-criterion defect consumes no worker budget).
- **Scope discipline:** narrow correction. Nothing settled by `planning/S03a-contract-correction.md` is reopened. The manifest, TP-10's one devDependency line, the regenerated lockfile, option (a), the `./core` alias ruling, and the relocation of the resolution proof to S06 all stand unchanged.
- **Inputs read:** board `t_489ecbcc` (Codex `CODEX BLOCKED` 12:46 + Router `BLOCKER VERIFIED AND ATTRIBUTED` 12:48) · `t_5504afe0` (S06, §5.4 applied 11:02) · `planning/S03a-contract-correction.md` · `planning/VerticalSlices.md` §0/§1/§2/§3/§4/§7 · `planning/FinalPlan.md` §G (**G0–G6 read in full**) + §P.1/§H.3 · `planning/LANE-PLAN-APPROVAL.md` · root `package.json`, root `tsconfig.json`, and a live root typecheck in the lane worktree.

---

## 1. The Router's position — evaluated, and upheld with two strengthenings

**Upheld.** "Clean root typecheck" is the wrong criterion for any lane in this mission. A lane cannot be responsible for a baseline it inherits and is forbidden to repair, and the seat was right to refuse both escapes.

**But the criterion as posed — "introduces NO NEW typecheck errors relative to the base commit" — is not yet safe to paste.** It is under-specified in three ways that a later lane could walk through, and it is silent on the one slice that a criterion change cannot rescue at all (§4, S13). The corrected text in §3 keeps the Router's principle and closes those holes.

### 1.1 Does it weaken any real guarantee? No — and on the load-bearing one it is the *stronger* form

Three guarantees are bundled into the old sentence. They come apart cleanly.

| Guarantee | Under "clean root typecheck" | Under baseline preservation |
|---|---|---|
| **The lane's own change typechecks.** | Implied only. | **Strengthened** — T-2 makes it *absolute zero* on every file in the lane's diff, which the old clause never said out loud. |
| **`@debateai/obs-capture` is really linked; no `TS2307` for it.** *(the guarantee TP-10 exists to protect)* | **Already dead.** With a non-empty inherited baseline `tsc` exits 1 unconditionally, so "exit 0" carries **zero** information about linkage. The criterion is not strict — it is *uninformative*. | **Restored.** `TS2307` naming `@debateai/obs-capture` is absent from the pin, so it is always a NEW diagnostic and always a hard fail (T-3). |
| **The whole repo typechecks.** | Asserted, never true, and never a lane property. | Correctly **not** a lane criterion. Relocated to a mission-level disposition (§5). |

The second row is the crux and it inverts the intuition: absolute cleanliness is not the strict option here, it is the *vacuous* one. Baseline preservation is what turns the clause back into a gate.

**In-mission precedent — this shape is already ratified.** `VerticalSlices.md` §1 **S12** (CI inventory gate, adjudication (c) / H5-05) deleted its "passes on a clean tree" claim for exactly this reason — 556 `throw new` · 176 `catch` · 56 bare `catch {` were inherited and unfixable in-mission — and replaced it with *"passes against the checked-in baseline, which grandfathers the pre-existing inventory and fails only on post-baseline entries."* This correction is the same move applied to `tsc` instead of `lint`. The mission is not inventing a lenience; it is applying a rule it already adopted.

**Two baselines, deliberately opposite capture times — do not conflate them.** S12's lint baseline is captured **late** (after L3/L4/L5 land) so the mission's own authorized rewrites are grandfathered. The typecheck baseline must be captured **early** (at the mission base) because its purpose is *attribution*: anything after the base has an owner. The Router must not let the two rules migrate into each other.

### 1.2 Is a captured baseline gameable? Yes — by four routes, all closed in §3

1. **Baseline growth by a later lane.** If each lane re-captured a baseline from its own parent, errors would ratchet: lane N's parent contains lane N−1's damage, and lane N passes. **Closed by pinning the baseline ONCE at the mission base** — every lane compares against that pin, never against its own parent. A lane inheriting an earlier lane's error then fails, and the failure correctly points upstream. Growth is a Router/V act, logged; a lane cannot perform it because **nothing under `docs/` is in any lane's `allowed:` set** (verified across all of §1's slice contracts). *(Recorded, not actioned: S12's lint baseline lives inside S12's own `tools/obs-inventory/**` grant, so S12 **can** grow it. That posture is H5-adjudicated and this seat does not reopen it — but the typecheck baseline deliberately does **not** copy that ownership model, and this is why.)*
2. **Count-only comparison.** "No new errors" read as a count lets a lane fix one baseline error and introduce one of its own for a net zero. **Closed by multiset-subset comparison on `(path, TS-code, message)`, not counting** (T-3).
3. **Narrowing the compiler.** `tsc -p some-other-tsconfig`, a `--filter`, an added `exclude`, or a `skipLibCheck` flip all shrink the observed set without shrinking reality. **Closed by T-1**, which pins the command *and* the `sha256` of root `tsconfig.json`.
4. **A stale pin larger than reality.** Once the accounts refactor lands, a pin still listing nine re-authorizes errors that no longer exist — the ratchet in disguise, pointing down instead of up. **Closed by making the downward re-pin mandatory, not optional** (§3, re-pin rule).

### 1.3 Line drift — the one real complication, and it is bounded to a single file

Of the four baseline-bearing files, **exactly one** is inside any lane's contract: `apps/api/src/main.ts`, granted to **S08 · L4** as **TP-3** (`FinalPlan` §P.1 — the first-import line `import "@debateai/obs-capture/install/api"`). Because TP-3 inserts a line at the **top**, the pinned diagnostic at `(51,28)` will legitimately appear at `(52,28)`. A naive line-exact comparison would score that as one removed + one added and fail a lawful slice.

The other three are unreachable by every lane: `packages/db/src/identity.ts` is **GLOBAL-FORBID**; `tests/architecture/t1-argon2-worker-contract.test.ts` and `tests/integration/registration-database.test.ts` fall outside every lane's `obs-l<LANE>-<SLICE>-*` test glob and inside GLOBAL-FORBID's pre-existing-test-file rule.

So the comparison is line-exact where it can be (untouched files, T-4) and line-agnostic only where drift is structurally forced (touched files, T-3) — with the drift itself required to be accounted for, not waved through.

---

## 2. Attribution, independently confirmed

- **The nine are real and stable.** Re-run by this seat in the lane worktree: `pnpm typecheck` → exit 1, exactly nine diagnostics, byte-identical to the worker's and the Router's captures.
- **Zero mention `obs-capture`.** Confirmed by inspection of all nine.
- **They predate the mission's coding work.** L1's merged commit `6829599` touches five files (`migrations/0034_obs_foundation.sql`, `packages/db/src/{index,obs-schema,schema}.ts`, `tests/integration/obs-l1-s01-foundation.test.ts`) — **none** of the four baseline-bearing files. The nine are inherited from `9801f85` and are not L1's.
- **TP-10 cannot have caused them.** The lane's entire tracked diff is `package.json` (+1) and `pnpm-lock.yaml` (+5); `packages/obs-capture/` contains **one** file, `package.json`, and **zero** `.ts` files, so root `tsc`'s `packages/**/*.ts` include picks up nothing from it. `tsc` never reads a lockfile.
- **TP-10 already satisfies the corrected criterion**, on all four clauses, with no code change: T-1 (root `tsconfig.json` `sha256` identical to base) · T-2 (no lane-touched file is in `tsc`'s include) · T-3 (observed multiset ≡ pinned) · T-4 (all nine pinned files untouched, line-exact).

**Consequence for the Router: hand the ticket back for evidence capture only. Nothing about the delivered artifact changes.**

---

## 3. CORRECTED CRITERION — verbatim

Stated **once**, mission-wide, and referenced by each affected ticket rather than re-typed. Replaces every clause in this mission that asserts a **root** typecheck property.

> **TYPECHECK BASELINE PRESERVATION (TBP) — mission-wide; replaces every "root `pnpm typecheck` is clean" clause in mission 2026-08-21-observability-loop.**
>
> A lane is measured on what it **introduces**, never on what it **inherits**. The mission pins **one** typecheck baseline; every slice asserting a root-typecheck property proves **preservation** against that pin, not absolute cleanliness.
>
> **THE PIN.** Captured at mission base commit **`29f370e`**; `count: 9`; `sha256: 98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`. Authoritative copy: `docs/missions/2026-08-21-observability-loop/planning/TYPECHECK-BASELINE.md`. Capture and comparison recipe, byte-for-byte, run from the worktree root:
>
> ```
> pnpm typecheck 2>&1 | grep -E 'error TS[0-9]+:' | LC_ALL=C sort
> ```
>
> `count` is that stream's line count; `sha256` is that stream through `shasum -a 256`. The pin is recorded in **three** places — the baseline file, this correction, and each affected ticket's acceptance text — so a silent edit to any one is detectable as disagreement between the other two.
>
> **GREEN REQUIRES ALL FOUR.**
>
> - **T-1 · command integrity.** The check is the unmodified root script `pnpm typecheck` (`package.json:13` → `tsc --noEmit`), run from the lane worktree root, against a root `tsconfig.json` byte-identical to the base commit's — show both `sha256` values and that they match (`905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d` at `29f370e`). No `-p`, no `--filter`, no added `exclude`, no compiler-option change. A criterion measured with a narrowed compiler is not measured.
> - **T-2 · zero errors in lane-touched files.** Every path in the lane's own diff (`git diff --name-only <base>...HEAD`, plus untracked additions) carries **zero** diagnostics. **Absolute, not baseline-relative.** Sole exception: a lane-touched file that also appears in the pin — today exactly one, `apps/api/src/main.ts`, granted to **S08 · L4** as TP-3 — is measured by T-3 instead, and the lane must additionally show its diff to that file and **account for the line drift** (TP-3 inserts one line at the top, so the pinned `(51,28)` is required to reappear at `(52,28)`, unchanged in code and text).
> - **T-3 · no new diagnostic.** Normalize each observed diagnostic to the key `(path, TS-code, message-text)`, discarding `(line,col)`, and compare **multisets**. The observed multiset must be a **subset** of the pinned multiset. Any key absent from the pin, or any key whose observed multiplicity exceeds the pin's, is a **NEW error and a hard fail** — including, specifically, any `TS2307` naming `@debateai/obs-capture`, which is absent from the pin and therefore always new. Counting is not comparison: a lane may not offset a new error against a baseline error it happened to remove.
> - **T-4 · line-exact for untouched files.** For every pinned file **not** in the lane's diff, observed diagnostics must match the pin **including `(line,col)`**. A pinned error that moves, vanishes, or changes text in a file the lane never opened is a **non-local effect** of the lane's change and must be explained on the ticket before GREEN.
>
> **REPORTING.** The lane pastes the observed `count` and `sha256` and, whenever either differs from the pin, enumerates every differing line. A **shrink** (observed ⊂ pinned) is permitted, but must be reported — never silently absorbed.
>
> **RE-PINNING.** *Downward* (a strictly smaller set) is a **Router** act, performed at a merge boundary, recorded on the board with the new `count`/`sha256` and the commit that caused the shrink. It is **mandatory, not optional**: a stale pin larger than reality re-authorizes errors that no longer exist. *Upward* (any added diagnostic) requires **V**, and must name the commit and the owner of each addition. **No lane can perform either** — nothing under `docs/` is in any lane's `allowed:` set.
>
> **EXPLICITLY NOT WEAKENED.** TBP replaces only clauses about the **root** typecheck of the **inherited repo**. It does **not** touch: **(i)** `S03a-contract-correction.md` §4 **G-D**, whose `tsc` runs in a scratch directory over a synthetic consumer of the manifest — that stays absolute-clean with its `TS2307` negative control, because it measures the artifact and inherits nothing; **(ii)** the **product's** fix-tier precondition that `pnpm typecheck` pass before the loop may auto-apply a fix (`FinalPlan` §D.4 tiers; OBS-CODEX-R96; `research/opus-requirements.md` QUICK-FIX condition 8) — that is a fail-**CLOSED** interlock on mutation authority, and making it baseline-relative would let the loop mutate a repo it cannot fully typecheck. It stays absolute, and the Router must **not** propagate TBP there.

### 3.1 The pinned baseline — verbatim, for `planning/TYPECHECK-BASELINE.md`

```
apps/api/src/main.ts(51,28): error TS2554: Expected 3 arguments, but got 2.
packages/db/src/identity.ts(103,30): error TS2554: Expected 4 arguments, but got 3.
packages/db/src/identity.ts(104,37): error TS2554: Expected 4 arguments, but got 3.
tests/architecture/t1-argon2-worker-contract.test.ts(405,24): error TS2554: Expected 3 arguments, but got 2.
tests/integration/registration-database.test.ts(327,43): error TS2741: Property 'argon2' is missing in type '{ repository: PostgresIdentityRepository; mail: MailSender; dekStore: UserDekStore; blindIndexKey: Buffer<ArrayBuffer>; ... 4 more ...; sleep?: (milliseconds: number) => Promise<void>; }' but required in type '{ readonly repository: IdentityRepository; readonly mail: MailSender; readonly dekStore: UserDekStore; readonly blindIndexKey: Uint8Array<ArrayBufferLike>; ... 5 more ...; readonly verificationTokenFactory?: () => string; }'.
tests/integration/registration-database.test.ts(610,9): error TS2554: Expected 4 arguments, but got 3.
tests/integration/registration-database.test.ts(611,9): error TS2554: Expected 4 arguments, but got 3.
tests/integration/registration-database.test.ts(890,7): error TS2554: Expected 4 arguments, but got 3.
tests/integration/registration-database.test.ts(891,7): error TS2554: Expected 4 arguments, but got 3.
```

Normalized keys with multiplicity (the T-3 comparison set, 5 keys / 9 diagnostics):

| path | code | message | ×
|---|---|---|---|
| `apps/api/src/main.ts` | TS2554 | Expected 3 arguments, but got 2. | 1 |
| `packages/db/src/identity.ts` | TS2554 | Expected 4 arguments, but got 3. | 2 |
| `tests/architecture/t1-argon2-worker-contract.test.ts` | TS2554 | Expected 3 arguments, but got 2. | 1 |
| `tests/integration/registration-database.test.ts` | TS2741 | Property `'argon2'` is missing … | 1 |
| `tests/integration/registration-database.test.ts` | TS2554 | Expected 4 arguments, but got 3. | 4 |

**Home, and why.** `docs/missions/2026-08-21-observability-loop/planning/` is Router/ARCH document surface, already the home of `S03a-contract-correction.md`. It is outside every lane's `allowed:` set, so no lane can grow it; it costs **zero** lane file surface, so it does not repeat the **R-01** error of minting a path §P grants to nobody; and it does not collide with S12's `tools/obs-inventory/**`. A lane reads the pin from the ticket text (which carries `count` + `sha256` inline) or from the file — either is sufficient, since the check is a hash comparison.

---

## 4. Propagation — every clause in this mission that asserts typecheck cleanliness

Exhaustive sweep of `planning/VerticalSlices.md`, `planning/FinalPlan.md` (**§G read in full**), `planning/LANE-PLAN-APPROVAL.md`, `planning/Pg0-a-PIN-DRAFT.md`, `planning/S03a-contract-correction.md`, and `goal-packets/**`.

| # | Where | Clause today | Disposition |
|---|---|---|---|
| **1** | **S03a / TP-10** — `t_489ecbcc`; `S03a-contract-correction.md` **§5.5 G-E** | "Root `pnpm typecheck` stays clean." | **REPLACE** with §4.1 below. This is the block. Already satisfied by the delivered work (§2). |
| **2** | **S06** — `t_5504afe0` (§5.4 applied 11:02); `S03a-contract-correction.md` **§5.4**, third bullet | "root `pnpm typecheck` (`tsc --noEmit`) is clean with the TP-5 line present" | **REPLACE** with §4.2 below. **Highest priority after #1**: this is the relocated linkage proof, it hits the identical nine at merge step 3a, and it will reproduce this exact blocker in L3 if left alone. |
| **3** | **S13** — `t_1ca8851f`; `VerticalSlices.md` §1 S13 | GREEN = "root `build` runs `pnpm --filter dialectical-engine-v2ui build` → `next build`" | **REPLACE** with §4.3 below. **Indirect but hard**, and a criterion change alone does not fix it — see §4.3. |
| **4** | **S12** — `t_a0ce760a`; `VerticalSlices.md` §1 S12 | `lint` "passes against the checked-in baseline" | **NO CHANGE.** Not a typecheck clause; it is the mission's *precedent* for TBP. Cited in §1.1. Keep the two baselines distinct (§1.1, opposite capture times). |
| **5** | **S03a §4 G-D** — scratch-dir `tsc` over a synthetic consumer | "typechecks clean … deep import is `TS2307`" | **NO CHANGE — do not propagate.** Measures the artifact, inherits nothing. Weakening it would destroy the boundary proof. |
| **6** | **`FinalPlan.md` §G (G0–G6)** | — | **NOTHING TO PROPAGATE.** §G contains **zero** typecheck acceptance clauses; its gates assert product properties (chaos, authority, grants, canaries, injection corpus). G4/G5's "clean-baseline enforcement on a seeded dirty tree" (OBS-R112) is **git** cleanliness, not typecheck. Recorded so the sweep is closed, not merely unfound. |
| **7** | **Product fix tiers** — `FinalPlan` §D.4; OBS-CODEX-R96; `research/opus-requirements.md` QUICK-FIX cond. 8 | "typecheck … GREEN" as a precondition for auto-apply | **NO CHANGE — do not propagate.** Same sentence, opposite role: a fail-CLOSED interlock on the loop's mutation authority. Baseline-relativizing it would authorize the loop to mutate a repo it cannot fully typecheck. |

### 4.1 Replacement for S03a / TP-10 `G-E` (verbatim)

> **G-E · linkage.** After `pnpm install`, `node_modules/@debateai/obs-capture` exists, and `import.meta.resolve("@debateai/obs-capture/zone-internal")` executed with **cwd at the workspace root** returns the in-repo target instead of `ERR_MODULE_NOT_FOUND`; from that same outside-the-package position the deep specifier `@debateai/obs-capture/src/zone/index.js` is still refused with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `pnpm-lock.yaml` carries the matching `importers: .:` `devDependencies` entry and is the `pnpm install`-regenerated file, not a hand edit. Root `pnpm typecheck` satisfies **TBP T-1…T-4** against the pin (`count: 9`, `sha256: 98c8eb42…`) — in particular **zero** `TS2307` naming `@debateai/obs-capture`. No probe run from inside the package counts toward this clause.

### 4.2 Replacement for S06 §5.4's typecheck bullet (verbatim)

> - **root `pnpm typecheck` satisfies TBP T-1…T-4** with the TP-5 line present, observed `count`/`sha256` pasted. This is the gate the missing link would break repo-wide, and **the baseline form is what keeps it a gate**: a `TS2307` naming `@debateai/obs-capture` is absent from the pin, so it is always a NEW diagnostic and always a hard fail (T-3). Absolute cleanliness would be the *weaker* clause here — with a non-empty inherited baseline `tsc` exits 1 unconditionally, so "exit 0" carries **no** information about linkage, while "no new diagnostic" carries exactly the information this clause exists to obtain.

### 4.3 Replacement for S13's GREEN (verbatim) — plus a second pin

**Why a criterion change alone is not enough.** Root `build` is `package.json:12` = `pnpm run generate:contract && pnpm run typecheck && pnpm --filter <target> build`. TP-7 changes only the filter target and leaves the `&&` chain intact, so **a non-empty typecheck baseline aborts the shell chain before `next build` is ever reached.** No wording about baselines can change that; `&&` does not consult a pin. S13's mechanism is unreachable end-to-end until the baseline is empty. The lawful fix is the same decomposition principle §2 of the prior correction established — *the slice that creates a capability is not necessarily the slice that proves it, and a slice is not measured on properties it does not own.* S13 owns the **repoint**, not the health of two unrelated pre-steps.

> **RED→GREEN (S13, decomposed — TBP corollary).** **RED** — `package.json:12` filters `dialectical-engine-web`, so `build` covers only `web/`. **GREEN**, in two parts, both required: **(a) wiring** — `package.json:12` names `dialectical-engine-v2ui` and no other filter, and the `generate:contract && typecheck &&` prefix is byte-unchanged; **(b) the wired command succeeds when invoked directly** — `pnpm --filter dialectical-engine-v2ui build` runs `next build`, which typechecks `apps/ui` against `apps/ui/tsconfig.json` (`typecheck: tsc --noEmit -p tsconfig.json`), exit 0, satisfying **TBP T-1…T-4 against the `apps/ui` pin**. Part (b) is run directly because root `build`'s `&&` chain aborts at `pnpm run typecheck` while the root baseline is non-empty; **if the root pin is empty when S13 runs, the full chain `pnpm build` must additionally be run and shown exit 0** — that is the stronger evidence and is preferred whenever available. TBP T-1…T-4 also apply to S13's own TP-7 line against the **root** pin. **Unchanged:** root `tsc --noEmit` still excludes `apps/ui` via root `tsconfig.json` `exclude`, so S09's `apps/ui/lib/obs/**` and `app/{global-error,error}.tsx` remain covered **only** by the `next build` path; removing the root exclusion stays out of scope.

> **Second pin required — `apps/ui`.** `next build` compiles a **different project** (`apps/ui/tsconfig.json`) than root `tsc --noEmit` (root `tsconfig.json`, `exclude: ["node_modules","web","apps/ui","packages/contract/generated"]`), so **none** of the nine root-pinned diagnostics is in it. The Router captures a second pin — same recipe, same base commit `29f370e`, recorded in the same baseline file under a separate heading — **before L6 dispatch**. It must be **captured, not assumed empty**: S09 (L4) adds files under `apps/ui/lib/obs/**` that this project compiles, and L6 merges after L4.

---

## 5. Does THIS mission need to act on the repo state?

**Two answers, and they are different for the two things people mean by "act".**

**REPAIR — NO. Purely the accounts mission's.** The Router's position is upheld. The split refactor is `9801f85` committing one half (the argon2 contract test) while the call-site updates in `packages/db/src/identity.ts` and `tests/integration/registration-database.test.ts` were deliberately excluded on V's ruling as accounts-mission work. Two of the four files are GLOBAL-FORBID / excluded-zone; the other two are outside every lane's test glob. **No lane may repair it, and with TBP in force no lane needs it repaired** — TP-10, S06 and (via §4.3) S13 all reach GREEN with the baseline non-empty. This mission must **not** wait on the accounts commit, and no lane may be held for it.

**PIN AND TRACK — YES, and this part is this mission's own act.** Three obligations, all Router-level, none requiring a lane or V:

1. **Pin the baseline now** (§3.1) — this is the act that converts an inherited defect from an ambient excuse into a falsifiable, attributable constant. It is not bookkeeping; without it TBP has nothing to compare against.
2. **Re-pin downward the moment the accounts commit lands.** Mandatory, at the next merge boundary, before the next lane dispatch. A stale nine-line pin outliving the fix would re-authorize errors that no longer exist — §1.2 route 4.
3. **Record the inherited defect on the mission's ledger with its named owner** (accounts mission, commit `9801f85` as the split point), so G1 acceptance sees a known, owned, quantified inheritance rather than an unexplained red.

**One V question exists, and it is NOT blocking.** Nothing in §3 or §4 needs a ruling: all of it is acceptance text on already-granted surfaces, adding no path to any lane contract, and `docs/missions/**` is not lane surface. The single question is about **acceptance of the wave, not dispatch of the lane**, and can be answered any time before G1 acceptance:

> **Q (single, yes/no):** At **G1 acceptance**, must the inherited typecheck pin be **empty** (i.e. the accounts mission's held-back commit has landed), or may V accept G1 with a non-empty pin recorded as a known inheritance owned by another mission?

Context V needs, in one line: it changes nothing about how any lane is measured — TBP already unblocks every lane either way — it decides only whether this mission's wave acceptance is coupled to another mission's commit. If V wants the coupling, the **earliest** point it bites is **L6/S13**, where `pnpm build`'s `&&` chain makes the full-chain evidence available only with an empty pin (§4.3).

---

## 6. Floor / forbidden confirmation

| Surface touched by this correction | GLOBAL-FORBID §0? | Pg0-a §2 floor deny list? | OBS-R104 self-modification set? | Note |
|---|---|---|---|---|
| `planning/TP-10-typecheck-criterion-correction.md` (this file) | No | No | No | mission doc surface; no lane owns `docs/**` |
| `planning/TYPECHECK-BASELINE.md` (**new**, Router creates) | No | No | No | same surface; deliberately outside every lane's `allowed:` set (§1.2 route 1) |
| `t_489ecbcc` / `t_5504afe0` / `t_1ca8851f` acceptance text | No | No | No | text only; no `allowed`/`forbidden`/`tests`/`readonly`/`risk_tier` field changes |

**No code file is touched by this correction, and no lane contract gains a path.** The four baseline-bearing files are named only as **diagnostic strings in a pinned artifact** — the same path-string-as-data posture OBS-R130/R134/R135 already licenses. `packages/db/src/identity.ts` and the re-export block `packages/db/src/index.ts:587-603`, `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, the `zone-route-mount region` `apps/api/src/index.ts:193-235`, `migrations/**`, the `identity` schema, `ledger.ledger_entry` / `core.run_progress_event` / `core.work_item`, the OBS-R104 set, the pre-existing test files and `tests/support/**`, `vitest.config.ts`, `pnpm-workspace.yaml` and root `tsconfig.json` are all **unmodified and unmodifiable** by anything specified here. This seat's verification ran read-only (`tsc --noEmit` writes nothing); the lane worktree's `git status` is unchanged.

---

## 7. What the Router applies

1. **Create `planning/TYPECHECK-BASELINE.md`** from §3.1 — the nine lines verbatim, `base_commit: 29f370e`, `count: 9`, `sha256: 98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, plus the recipe and the re-pin rule. Add the `apps/ui` pin under a second heading before L6 dispatch (§4.3).
2. **`t_489ecbcc` (S03a/TP-10)** — replace `G-E` with §4.1; attach TBP (§3) by reference with the pin inline. **Unblock and return for evidence capture only.** The delivered work already satisfies all four clauses (§2) — **no code change, no artifact change.** `rework_round` unchanged.
3. **`t_5504afe0` (S06)** — replace §5.4's typecheck bullet with §4.2. Do this **before L3 dispatch**, or the same blocker reappears at merge step 3a.
4. **`t_1ca8851f` (S13)** — replace GREEN with §4.3, and note the second pin obligation. Do this before L6 dispatch.
5. **Do NOT touch** `t_a0ce760a` (S12), `S03a-contract-correction.md` §4 G-D, `FinalPlan` §G, or the product fix-tier preconditions (§4 rows 4–7). Over-propagation is the failure mode on this correction.
6. **Route §5's Q to V as a single non-blocking row.** Do not hold any lane for it.
7. **Standing obligation:** re-pin downward at the merge boundary after the accounts commit lands, recorded on the board with the new `count`/`sha256`.
8. **Carried forward from the prior correction, still outstanding:** `S03a-contract-correction.md` §9 item 5 (applying §4 / §5.4 / §5.6 and TP-10 to `VerticalSlices.md` §1/§2/§3 and `FinalPlan` §P.1) has **not** been applied — `VerticalSlices.md` contains no reference to the correction. Recorded so it is not lost; the plan artifacts and the board currently disagree, and TBP will add a second such divergence if the docs are not caught up.

**No V ruling gates any of items 1–5, 7, or 8.** Item 6 is the only V-routed element and it blocks nothing.
