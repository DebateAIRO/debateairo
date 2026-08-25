# S03a CONTRACT CORRECTION — QA→ARCH return on `t_489ecbcc` (lane L2)

- **Seat:** ARCHITECTURE, Claude Opus (intake amendment **A4**). Read-only everywhere except this file. This seat writes no ticket; the **Router** applies the correction to the board.
- **Returning edge:** spine §7 `QA→ARCH RETURN` — *defect is in: **acceptance-criteria***. `rework_round: 0 of 3` (no Codex rework consumed).
- **Inputs read:** `planning/FinalPlan.md` §B.1/§B.2/§P (D02, D06a, TP-1..TP-8, §P.3) · `planning/VerticalSlices.md` §0/§1 (S01–S16)/§2/§3/§4/§6/§8 · `planning/LANE-PLAN-APPROVAL.md` (authority_epoch 1) · `planning/Pg0-a-PIN-DRAFT.md` §1–§2 · `research/POST-SYNTHESIS-RULINGS.md` (incl. **Batch 5**: Pg0-a RATIFIED AS DRAFTED; **E6-02 amended to SINGLE custodian**) · board `t_489ecbcc` (three lens verdicts + Router diamond note) · the delivered artifact and the real workspace.
- **Verdict of the three lenses, uncontested here:** the manifest is **correct**. Nothing in this correction asks for a byte of it to change.

---

## 1. The finding, restated — and one correction to the return's stated reason

The impossibility is **real**. The reason cited in the QA→ARCH return is **not the operative one**, and the mission should not inherit the wrong rule.

**What the return said:** *"the root manifest is on the G0 floor deny list ('any dependency or manifest declaration')."*

**What is actually true.** `planning/Pg0-a-PIN-DRAFT.md` §2 is the **floor path/glob deny list for the loop's fix tiers** (source: FinalPlan §D.4, RT-29) — the enumerated set the *autonomous fix agent* must **ESCALATE** on "regardless of line count", sitting directly under §1's QUICK/PR-FIX/ESCALATE tier table. It governs the **product the mission builds**, at G4/G5, when the listener proposes a patch. It does **not** bind this mission's coding lanes. The lane-binding prohibition is `VerticalSlices.md` §0 **GLOBAL-FORBID**, and root `package.json` is **not in it**.

**What actually blocks S03a** is narrower, purely contractual, and entirely inside ARCH's own document:

1. `contract.allowed` for S03a is exactly one path (`packages/obs-capture/package.json`).
2. FinalPlan **§P.1 grants root `package.json` to nobody except TP-6 (`lint-wiring`, `:16`, D07/S12·L6) and TP-7 (`build-filter`, `:12`, D19/S13·L6)** — both line-scoped, both in **L6**, which merges **last** in the G1 tail and hard-depends on L3/L4/L5.
3. The V-approved L2 row states **"No root-config edit."**
4. `pnpm-workspace.yaml` is `readonly` — and irrelevant anyway: it already globs `packages/*`, and **workspace membership is not linkage**.
5. No consumer exists at S03a time; S03b/S04/S05 are *inside* the package, and the external consumers (S06·L3, S08·L4, S10/S11·L5, S16·L8) all come later.

So: **the criterion is unsatisfiable by construction, the code is correct, and the defect is a §P omission.** Distinguishing (1)–(3) from the Pg0-a floor list matters because the floor list would make the fix *unlawful*; the true reason makes it *unowned* — a thing ARCH can specify and V can grant.

### 1.1 The larger defect the return surfaced (mission-level, not S03a-level)

`@debateai/obs-capture` is **never linked by any slice in the mission**, yet §P *mandates bare-specifier imports of it in product code*:

| Where §P mandates a bare import | Slice · lane | Merge step |
|---|---|---|
| **TP-5** `apps/runner/src/main.ts` — `import "@debateai/obs-capture/install/runner"` | S06 · L3 | 3a |
| **TP-3** `apps/api/src/main.ts` — `import "@debateai/obs-capture/install/api"` | S08 · L4 | 3b |
| `apps/scheduler/src/cli.ts` — installer import + lifecycle wrapper | S10 · L5 | 3c |
| `packages/providers/src/index.ts` — capture at the exhaustion throws | S11 · L5 | 3c |
| `apps/api/src/obs-client-report.ts` — registry enumerations | S09 · L4 | 3b |

**No slice owns any dependency declaration.** S12's contract explicitly forbids *"every non-root `package.json`"*, and TP-6/TP-7 are two script lines. Verified against the real tree:

```
node_modules/@debateai/                    21 links — exactly the 21 root devDependencies
apps/api/node_modules/@debateai/           12 links — exactly apps/api/package.json's deps
packages/db/node_modules/@debateai/         2 links — crypto, kernel
```

pnpm is in isolated-linker mode: **a package is resolvable from a file only if some `node_modules` on that file's ancestor chain contains it, and pnpm creates those links only from declared dependencies.** Empirically confirmed in this repo, from `packages/db/src` (which declares neither):

```
@debateai/api        -> <REPO>/apps/api/src/index.ts     (root devDep — resolves by root hoisting)
@debateai/evaluator  -> ERR_MODULE_NOT_FOUND             (not a root devDep — does not resolve)
@debateai/obs-capture-> ERR_MODULE_NOT_FOUND
```

Consequence, and it is not confined to S03a: the moment **S06** lands its TP-5 line, root `pnpm typecheck` (`tsc --noEmit`, `include: apps/**, packages/**, tools/**, tests/**`) raises **TS2307** for every lane, and `apps/runner` cannot boot. **Linkage is mandatory by merge step 3a.** §5 handles it.

---

## 2. The decomposition this correction is built on

The returned criterion fused three independent properties into one sentence. They have different owners, different proofs, and different earliest-possible dates.

| Property | What it means | What it needs | Earliest honest owner |
|---|---|---|---|
| **RESOLUTION** | the exports map maps declared specifiers to targets and refuses everything else | the manifest bytes only — Node's exports resolution is **syntactic**; it does not stat the target | **S03a** (this slice) |
| **LINKAGE** | the package is reachable *by name* from outside itself | a dependency declaration in some `package.json` + `pnpm install` | **unowned today** — see §5 |
| **LOAD** | a declared subpath actually loads a module | the target file to exist | the slice that authors each target: `.`/`./core` → **S03b**, `./registry-internal` → **S02**, `./zone-internal` → **S04**, `./install/*` → **S05** |

A scaffold slice can prove **RESOLUTION** and nothing else. That is not a weakening: RESOLUTION is the entire architectural boundary this ticket is rated HIGH for. LINKAGE is a workspace-plumbing fact; LOAD belongs to whoever writes the file.

**The principle established here, and applied consistently below:** *the slice that creates a capability is not necessarily the slice that proves it.* S03a already relies on this (`tests: none`, "correctness proven by S02/S03b/S04/S05 resolving their imports"). The defect was that the acceptance text did not.

---

## 3. DECISION — option (a)

**Option (a) is taken.** S03a's acceptance is re-scoped to resolver-level manifest correctness and encapsulation; the workspace-root resolution proof relocates to **S06 (L3)**, the first slice whose own already-granted contract (TP-5) puts a bare specifier into product code on the deployment path.

**Option (b) is refused as posed.** There is no lawful path by which S03a causes linkage *within its current contract*, and there is no zero-amendment path for **any** slice. Exhaustively, the mechanisms that could create linkage:

| Mechanism | Verdict |
|---|---|
| dependency declaration in a `package.json` | the **only** durable mechanism — and unowned (§5) |
| `pnpm-workspace.yaml` | already globs `packages/*`; membership ≠ linkage; `readonly` anyway |
| `vitest.config.ts` `resolve.alias` | edited by **no** slice (R-01, GLOBAL-FORBID); would not fix runtime or `tsc` |
| root `tsconfig.json` `paths` | granted to no deliverable; would fix `tsc` only, not runtime — a *worse* failure mode |
| `pnpm link` / a hand-made symlink | untracked, non-durable, unreviewable, destroyed by the next install |
| self-reference | works **only** from inside the package; structurally cannot detect the missing link (this is precisely what produced the false GREEN) |
| relative deep import from `tests/**` | lawful and precedented (`tests/**` imports `crypto`/`evaluator`/`evidence` this way — they are not root devDeps) but **bypasses the exports map**, so it cannot prove the boundary, and it is unavailable to product code |

So (b) is not merely disallowed by S03a's contract — it does not exist. The correct response is (a) **plus** a named §P amendment that gives LINKAGE an owner (§5), which is where the single V question sits (§6).

---

## 4. CORRECTED S03a ACCEPTANCE — verbatim

Replaces the `RED→GREEN obligation + falsifiable acceptance criterion` bullet of `VerticalSlices.md` §1 S03a **and** the corresponding field in ticket `t_489ecbcc`. Everything else in the slice (allowed / tests / readonly / forbidden / rationale / traceability / risk_tier) is **unchanged**.

> **RED→GREEN:** **RED** — no package manifest exists, so `packages/obs-capture/` is an **open directory, not an encapsulated package**: with no `exports` map the module resolver refuses nothing, and a deep specifier into the package's internals (`@debateai/obs-capture/src/zone/index.ts`) resolves. **Zero** specifiers are refused with `ERR_PACKAGE_PATH_NOT_EXPORTED`, because no boundary exists to refuse them. **GREEN** — the manifest exists and Node's own resolver, asked from **outside** the package, enforces the contracted boundary. All four clauses are proven by **calling the resolver** (`import.meta.resolve` / `import()` / `tsc`) — never by reading the manifest back out and printing it:
>
> - **G-A · declared surface.** Each of the five contracted specifiers resolves **through the exports map** to its contracted target inside `packages/obs-capture/`: `.` → `./src/index.ts` · `./core` → `./src/index.ts` · `./registry-internal` → `./src/registry/index.ts` · `./zone-internal` → `./src/zone/index.ts` · `./install/<name>` → `./install/<name>.ts`. Resolution succeeding while the target file is **absent** is the expected and required result — exports resolution is syntactic, and `ERR_MODULE_NOT_FOUND` on a *declared* subpath with an absent target is distinguishable from `ERR_PACKAGE_PATH_NOT_EXPORTED` on an undeclared one. **That distinction is the proof.**
> - **G-B · encapsulation.** Every undeclared subpath is refused with `ERR_PACKAGE_PATH_NOT_EXPORTED`, at minimum: `./src/index.ts` · `./src/zone/index.js` · `./package.json` · `./zone` · `./install` (bare). There is no second door into `src/zone/`; the only route is the declared `./zone-internal`.
> - **G-C · no escape through the wildcard.** Every traversal form through `./install/*` is refused with `ERR_INVALID_MODULE_SPECIFIER`, including the two excluded-zone escapes named by GLOBAL-FORBID: `./install/../../../packages/db/src/identity` and `./install/../../../apps/api/src/registration`; plus `./install/../src/zone/index`, `./install/%2e%2e/src/zone/index`, `./install/node_modules/x`. No target in the map contains `..`; nothing resolves outside `packages/obs-capture/`.
> - **G-D · enforced at both layers, and nothing widens it.** Because root `tsconfig.json` is `module`/`moduleResolution: NodeNext`, **`tsc` honours the map too**: a consumer importing the five declared subpaths typechecks clean, and a deep import of `./src/zone/index.js` is `TS2307`. The map contains exactly **one** wildcard — the contracted `./install/*` — and no `./*` catch-all, no condition object, no condition array, no `default` fallback, no `imports` map, and **no `scripts` key** (so `install` names runtime modules, never an npm lifecycle hook); `private: true`; zero declared dependencies.
>
> **EXPLICITLY NOT CLAIMED BY THIS SLICE — recorded so no downstream slice inherits a false baseline.** S03a does **not** assert that `@debateai/obs-capture` is *linked* into any `node_modules`, and it must not be measured on that. Linking requires a dependency declaration in a `package.json`, which is outside this slice's `allowed:` set and outside every §P grant it could reach. The known, accepted post-S03a workspace state is: **`node_modules/@debateai/obs-capture` does not exist, and all five declared specifiers return `ERR_MODULE_NOT_FOUND` when asked from the workspace root.** The workspace-root resolution proof lives at **S06** (see §5.4); the per-subpath **load** proof lives with each target's author (S02 · S03b · S04 · S05), exactly as this slice's `tests: none` rationale already states.

### 4.1 Evidence procedure (normative; both probes are read-only on the repo)

The worker must not write anything outside its scratch directory, and must not create `node_modules` entries in the worktree.

- **Probe A — the real artifact (proves G-A, G-B, G-C).** In a scratch dir outside the repo: `node_modules/@debateai/obs-capture` → **symlink to the real package directory in the lane worktree**; a minimal consumer `package.json` (`"type": "module"`). Run `import.meta.resolve` for the declared, undeclared and traversal specifier sets and paste the exact per-specifier outcome (resolved URL or error `code`). This probes the delivered bytes on disk; the repo is not modified. *(Note for the reader of the evidence: `import.meta.resolve` does not stat the target, so a `RESOLVED` line for an absent target is correct and expected — see G-A.)*
- **Probe B — load + type layer (proves G-D and the load half of G-A).** In the scratch dir: a **byte-identical copy** of the manifest (record the `sha256` of both the copy and the delivered file and show they match) into a scratch package directory, plus **decoy** target files at all five paths; then (i) a real `import()` of each declared specifier, and (ii) `tsc --noEmit` over a consumer importing all five, with the negative control `import "@debateai/obs-capture/src/zone/index.js"` → `TS2307`. The copy licenses the conclusion only because the bytes are identical and the resolver is a pure function of (manifest bytes, specifier, on-disk targets); the recorded hashes are what make that argument checkable.
- **RED capture.** Run **Probe A's specifier set unchanged** against the pre-slice state (the same scratch harness, symlinked at a package directory containing the `src/`+`install/` shape but **no `package.json`**). The required RED signature is: `ERR_PACKAGE_PATH_NOT_EXPORTED` count **= 0**, and `@debateai/obs-capture/src/zone/index.ts` **RESOLVED**. The RED and GREEN commands are then the *same* command, which is what makes the transition load-bearing rather than tautological. A `readFile` → `ENOENT` on a file about to be created is **not** acceptable RED for this slice.

**Both directions are already satisfied by the delivered manifest** — lens 1 and lens 2 independently produced exactly this evidence (6/6 declared resolve and load, 7/7 undeclared refused, 6/6 traversal rejected including both excluded-zone escapes, `tsc` exit 0 with the TS2307 negative control), and this seat re-ran Probe A against the delivered file and reproduced 5/5 · 5/5 · 4/4. **The re-run exists to put the evidence on the ticket, not to discover anything.**

---

## 5. Where the relocated proofs live, and the linkage the mission is missing

### 5.1 What must be added to the plan (the amendment) — `TP-10`

Fully specified here so it is paste-ready; **gated on §6**.

> **TP-10** | root `package.json` | region **`obs-capture-dep`** — a **single line** `"@debateai/obs-capture": "workspace:*"` inserted into the `@debateai/*` run inside `devDependencies` (`:37-57` at `dc9fd57`; `:58` is `@types/node`) | **owner: S03a · L2** | co-tenants: TP-7 `build-filter` (`:12`) and TP-6 `lint-wiring` (`:16`), both S12/S13 · **L6** | resolution: **region-disjoint + merge-order** — the `devDependencies` block is ≥20 lines from both script lines, and **L2 merges at §4 step 2 while L6 merges at step 4a**. This is exactly the TP-2 pattern (L1 before L3) already ratified in §2.
>
> Companion generated file: **`pnpm-lock.yaml`** — the `importers: .:` `devDependencies` entry, **regenerated by `pnpm install`, never hand-edited**. Sole writer in the mission: S03a. It must be committed with the manifest line, or every downstream lane installs a lockfile that disagrees with the manifest.

### 5.2 Why root-devDependency-in-L2, and not per-consumer declarations

Per-consumer declarations (`apps/runner`, `apps/api`, `apps/scheduler`, `packages/providers`) match the repo's convention and are strictly narrower in reach — but they are **structurally wrong for this plan** on two counts:

- **The binding-wave base.** §4 step 3 branches L3, L4 and L5 **in parallel off the L1+L2 base**. A linkage edit made in L3 is invisible to L4 and L5 in their own worktrees, so their RED→GREEN could not be established in-lane. **Linkage must exist in the base the binding wave branches from — i.e. it must land with L2 or earlier.**
- **Lockfile co-tenancy.** Four manifests across three lanes means `pnpm-lock.yaml` gains three lane writers on the same `importers:` region — a guaranteed cross-lane conflict on a file the plan grants to nobody.

One root devDependency line is **one manifest + one generated file, in one lane, merged before every consumer**, and it makes the package resolvable from `tests/**`, `acceptance/**` and every `apps/*`/`packages/*` file at once (empirically demonstrated above with `@debateai/api` from `packages/db/src`). Reach cost: root hoisting means any package *could* import obs-capture without declaring it. That is the pre-existing posture for all 21 root devDeps including `@debateai/db`; it widens **who** may import, never **what** is importable — the exports map (G-B/G-C) is untouched by it — and the outbound direction remains lens 2's MEDIUM, already routed to the **D21 import-graph fixture (S05/S16)**, which this makes no worse.

Recommended owner **S03a** because it is (i) parked and being re-issued by this correction anyway — zero extra churn, (ii) first in the lane, so every later L2 slice and every downstream lane inherits a linked package, and (iii) already the mission's sole owner of this package's manifest.

### 5.3 If V's answer is delayed, L2 is **not** blocked

The corrected S03a in §4 requires **no** amendment and can be re-issued immediately. Nothing in L2 needs linkage: S02/S03b/S04/S05 are inside the package (self-reference resolves and honours the exports map — verified: `@debateai/obs-capture/zone-internal` → `src/zone/index.ts`, while `@debateai/obs-capture/src/zone/index.js` → `ERR_PACKAGE_PATH_NOT_EXPORTED`), and their `tests/**` files may import relatively, the precedent the repo already uses for `crypto`/`evaluator`/`evidence`. Two consequences the Router must carry:

- Relative test imports **do not exercise the exports map**, so they never substitute for G-A..G-D or for §5.4.
- **Hard deadline:** TP-10 must be merged into the base **before §4 step 3 is dispatched**. If V's answer arrives after L2 has merged, the Router assigns TP-10 to a terminal L2 addendum on the same branch — never to L3/L4/L5 individually (§5.2).

### 5.4 Addition to S06 — the relocated workspace-root resolution proof (verbatim)

**Appended to** `VerticalSlices.md` §1 S06's `RED→GREEN` bullet and to ticket `t_5504afe0`. **No new file surface**: both surfaces named are already in S06's contract (`TP-5 apps/runner/src/main.ts`, `tests/integration/obs-l3-s06-*.test.ts`).

> **Inherited from S03a (S03a-CORRECTION §5.4) — workspace-root resolution, deployment path.** S06 is the first slice whose contract places a **bare specifier** for `@debateai/obs-capture` into product code (TP-5), so it is where resolution from outside the package becomes a real, falsifiable product property rather than a scaffold claim. GREEN additionally requires, with exact output pasted:
> - **from the workspace root** (a directory that is **not** inside `packages/obs-capture/`), `@debateai/obs-capture/install/runner` **resolves and loads** — `import.meta.resolve` returns the in-repo target and `import()` succeeds — alongside a **control** line for a known-linked workspace package (e.g. `@debateai/db`) proving the probe and the environment are sound;
> - **`node_modules/@debateai/obs-capture` exists** after `pnpm install`, and `ls node_modules/@debateai/` is shown;
> - **root `pnpm typecheck` (`tsc --noEmit`) is clean** with the TP-5 line present — this is the gate the missing link would break repo-wide (`TS2307`), so it is asserted here explicitly and once;
> - **the boundary still holds from a real consumer**: a deep import `@debateai/obs-capture/src/zone/index.js` from `apps/runner` is refused (`ERR_PACKAGE_PATH_NOT_EXPORTED` at runtime, `TS2307` under `tsc`). S03a proved this against the manifest; S06 proves it survives real linkage.
>
> Self-reference (any probe run with cwd inside `packages/obs-capture/`) is **not** acceptable evidence for this clause: it resolves off the package's own `name`+`exports` with no `node_modules` entry and is structurally incapable of detecting a missing link.

### 5.5 Optional clause if V grants TP-10 to S03a (verbatim, conditional)

Attach **only** if §6 is answered in S03a's favour. It asserts the mechanical outcome of the edit and nothing more; the deployment-path proof stays at §5.4.

> **G-E · linkage (only if TP-10 is granted to this slice).** After `pnpm install`, `node_modules/@debateai/obs-capture` exists, and `import.meta.resolve("@debateai/obs-capture/zone-internal")` **executed with cwd at the workspace root** returns the in-repo target instead of `ERR_MODULE_NOT_FOUND`. `pnpm-lock.yaml` carries the matching `importers: .:` `devDependencies` entry and is the regenerated file, not a hand edit. Root `pnpm typecheck` stays clean. No probe run from inside the package counts toward this clause.

### 5.6 Addition to S03b — the alias consequence (verbatim; see §7)

**Appended to** `VerticalSlices.md` §1 S03b's `RED→GREEN` bullet and to ticket `t_9b5ca941`. **No new file surface**: `src/index.ts` and `tests/unit/obs-l2-s03b-*.test.ts` are already S03b's.

> **Core-surface thinness (S03a-CORRECTION §7).** `.` and `./core` are ratified aliases of `./src/index.ts`, so the property that keeps the zone classifier out of the default import surface is a **source-level** property of the root barrel and is asserted here, where it can be: a unit test proves `packages/obs-capture/src/index.ts` re-exports **nothing** from `src/zone/**` and nothing from `src/registry/**` — neither directly nor transitively through another barrel — and therefore that importing `@debateai/obs-capture` or `@debateai/obs-capture/core` yields **no** zone-classifier or registry-internal binding. The zone and registry surfaces are reachable only through their own declared subpaths.

---

## 6. The one question for V — smallest form

Everything in §4, §5.4 and §5.6 is inside ARCH's authority and needs no ruling: it changes acceptance text only, on surfaces already granted, adding no file to any lane.

**§5.1 does add one path to one lane contract**, and that contract is part of the plan V approved at **`authority_epoch: 1`**. This mission's own precedent is that a surface §P grants to nobody is **routed, not minted** (R-01 withdrew exactly such a grant; G5-V1 was routed and V ruled it). This seat therefore specifies the amendment completely but does not apply it, and states one bounded question:

> **Q (single, yes/no + epoch):** May `S03a`'s `contract.allowed` gain **exactly one** additional path — root `package.json`, region `obs-capture-dep`: the single line `"@debateai/obs-capture": "workspace:*"` in `devDependencies`, plus the `pnpm install`-regenerated `pnpm-lock.yaml` `importers: .:` entry — **under `authority_epoch 1`**, or does widening an approved lane contract require a new authority epoch?

Context V needs, in one paragraph: without this line, `@debateai/obs-capture` is never linked and §P's own TP-3/TP-5 bare imports cannot resolve — root `tsc --noEmit` reds repo-wide and `apps/runner`/`apps/api` cannot boot from merge step 3a onward. It is one line in one file plus a regenerated lockfile; it grants no new capability to the observability loop (root `package.json` remains on the Pg0-a floor deny list, so the loop can never auto-edit it — **ESCALATE** unconditionally, which is the intended posture and is unchanged by this grant). No V ruling is required to re-issue the corrected S03a in §4; L2 can run to completion without an answer (§5.3). The answer is needed **before §4 step 3 (the binding wave) is dispatched**.

**Not asked of V, because ARCH decided them:** which manifest carries the line (root, not per-consumer — §5.2), which lane owns it (L2 — the binding-wave base constraint), where the resolution proof lives (S06 — §5.4), and the `./core` ruling (§7).

**E6-02 note (Batch 5, SINGLE custodian):** V alone is custodian and sole approver; this question needs one approval, not two. It is a plan-surface question, not a re-pin, so it does not touch the Pg0-a bundle and does not consume RP-1/RP-2/RP-3.

---

## 7. RULING — `.` and `./core` are aliases: **INTENDED, ratified as delivered**

Both lenses flagged that `"."` and `"./core"` resolve to the identical target (`./src/index.ts`), so `core` is not a narrower surface than the root. Verified again here: both resolve to the same URL, hence one module instance and no dual-package hazard.

**Ruled: keep both entries, both pointing at `./src/index.ts`. Do not differentiate. The manifest does not change.**

Reasoning:

1. **Differentiating would mint file surface no slice owns.** `"./core": "./src/core/index.ts"` requires a `src/core/index.ts`. S03b's grant is an **enumerated** file list — `src/{index,emit,context,queue,flusher,redactor,spool,health}.ts` — not `src/**`. Creating that target is precisely the R-01 error (a surface §P grants to no deliverable), and it would buy a decision that must then also be routed to V.
2. **A different target would not buy the property anyway.** "Core is structurally incapable of inheriting the root barrel" is not a manifest property: a hypothetical `src/core/index.ts` could re-export the zone just as easily as `src/index.ts` can. The guarantee is a **source** property, so it is asserted where it is enforceable — §5.6 puts it in S03b's already-granted unit-test glob, as a falsifiable assertion rather than a manifest gesture.
3. **The split the ticket's HIGH tier actually rests on is present and proven.** `zone-internal` → `src/zone/index.ts` and `registry-internal` → `src/registry/index.ts` are distinct targets, and nothing reaches `src/zone/` except the declared `./zone-internal` (G-B/G-C, 7/7 and 6/6 across two independent lenses). The zone classifier is kept out of the default import by *what the barrel re-exports*, which §5.6 now pins.
4. **The reach cost is zero.** Two names for the identical module widen nothing. Lens 2 reached the same conclusion and explicitly declined to hold the slice for it.
5. **Bounded irreversibility, accepted knowingly.** The manifest is one-shot *for this mission* (S02/S03b/S04/S05 must never edit it), not forever: a future mission may re-point `./core`. Keeping the name declared **reserves** it, which is strictly better than dropping it — dropping it would break the "pre-declare every subpath the package will ever expose" property that the whole one-shot design rests on.

**Recorded for every downstream slice:** `.` and `./core` are interchangeable within this mission. Import the core surface as **`@debateai/obs-capture`**; treat `./core` as a reserved alias. **No slice may rely on `./core` being narrower than the root** — it is not, and §5.6 is what keeps the root honest.

---

## 8. Floor / forbidden confirmation

| Surface touched by this correction | GLOBAL-FORBID (§0)? | Pg0-a §2 floor deny list (loop tiers)? | OBS-R104 self-modification set? | Note |
|---|---|---|---|---|
| `packages/obs-capture/package.json` (S03a, **unchanged bytes**) | No | No | No | already `contract.allowed`; no edit is requested by this correction |
| `apps/runner/src/main.ts` (S06 TP-5) | No | No | No | already S06's grant; no new line beyond the TP-5 import |
| `tests/integration/obs-l3-s06-*.test.ts` | No — S06's own glob | No | No | filename partition intact (`obs-l3-s06-`) |
| `tests/unit/obs-l2-s03b-*.test.ts` | No — S03b's own glob | No | No | filename partition intact (`obs-l2-s03b-`) |
| root `package.json` `obs-capture-dep` + `pnpm-lock.yaml` (**§5.1, pending V**) | **No** — absent from GLOBAL-FORBID | **Yes** — but that list binds the *loop's fix tiers* (FinalPlan §D.4 / RT-29), not mission lanes (§1) | No | region-disjoint from TP-6/TP-7 and merge-ordered L2→L6; remains permanently **ESCALATE**-only for the loop, which is the intended posture |

**Untouched and confirmed:** the excluded zone (`apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts`, the re-export block `packages/db/src/index.ts:587-603`) — this correction adds no import of it and no reference to it beyond quoting the two traversal-escape specifiers as **test input strings** in G-C, which is the same path-string-as-data posture OBS-R130/R134/R135 already licenses for the D03 manifest · the `zone-route-mount region` `apps/api/src/index.ts:193-235` · `migrations/**` (`≤0033` and `0034`) · the `identity` schema · `ledger.ledger_entry` / `core.run_progress_event` / `core.work_item` · the OBS-R104 set (policy bundle, allowlist, zone manifest, obsctl, audit writer, chain/proof key paths) · the 110 pre-existing test files and `tests/support/**` · **`vitest.config.ts`** (R-01 — no include glob is added or needed; every test named here lands under the existing `tests/**` include) · `pnpm-workspace.yaml` and root `tsconfig.json` (still no edit needed — `packages/*` is already globbed and `packages/**/*.ts` already included) · every other lane's owned files.

**Evidence-procedure containment:** §4.1 runs entirely in a scratch directory outside the repo (symlink in, byte-copy out); it creates no `node_modules` entry in any worktree and mutates nothing under version control. This seat's own verification ran under the same rule.

---

## 9. What the Router applies

1. **`t_489ecbcc` (S03a)** — replace the acceptance field with §4 verbatim; keep `allowed`/`tests`/`readonly`/`forbidden`/`risk_tier`/traceability unchanged; attach §4.1 as the evidence procedure; return the ticket to the worker. `rework_round` stays **0 of 3** (plan correction, not code rework). The delivered manifest is **accepted as-is** — the re-run produces the evidence, it does not change the artifact.
2. **`t_5504afe0` (S06)** — append §5.4 to the acceptance field.
3. **`t_9b5ca941` (S03b)** — append §5.6 to the acceptance field.
4. **Route §6 to V** as a single DECIDE-V row. Do **not** hold S03a for the answer. Do **not** dispatch §4 merge step 3 (the binding wave) until TP-10 is merged into the base.
5. **Plan artifacts** — apply §4 / §5.4 / §5.6 to `VerticalSlices.md` §1; on a V yes, add TP-10 to `FinalPlan.md` §P.1, to `VerticalSlices.md` §2 (both the TP table and the shared-surface table, root `package.json` becoming a **cross-lane** row: L2 `devDependencies` vs L6 `:12`/`:16`, resolved region-disjoint + merge-order), amend the §3/LANE-PLAN-APPROVAL **L2** row (the phrase *"No root-config edit."* becomes *"root `package.json` `obs-capture-dep` line + regenerated `pnpm-lock.yaml` only"*), and add `pnpm-lock.yaml` to §2's owned-surfaces list with S03a as sole writer.
6. **Process finding, recorded not actioned:** the worker should have posted a blocker instead of substituting a manifest echo for the unreachable half of the criterion. The remedy is this corrected contract; no rework round is consumed, and the guard-rail ("a sixth path or an unresolved conflict is posted as a blocker rather than decided locally") is restated on the re-issued ticket.

**No V ruling is required for items 1–3.** Item 4 is the only gated element.
