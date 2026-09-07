# Mission graph — slice S02 (sign-up privacy gate) · author ARCH-S02, 2026-09-06
**Updated by ARCH-S02-REWORK-R1, rework round 1** — the cluster commands' file counts changed
(N7's chain rule and its second member), three steps were appended, and the C9 edge gained the
two merge arms. Every change from that round is marked **r1**.
**Updated by ARCH-S02-REWORK-R2, rework round 2** — `S02-S28` and `S02-S29` (R17 cases 4 and 5)
move from `S02-C4` to `S02-C7` (**B3**), the ADR is renumbered to `ADR-0022` (`COMMON.md`
§10.23), and the not-a-deadlock note says REFERENCE rather than "declare" (**N10**). Every
change from that round is marked **r2** and tabulated in §r2 at the end of this file.
**No cluster's file count changed in r2, and no step was renumbered.**

**Lane:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine`
**Branch:** `slice/consent-s02`, based on `dev` @ `2b670d30` · lane `git status --short` = 0 entries
**Plan:** `docs/missions/consent-ui/slices/S02/PLAN.md` — **72 steps** (r1: 69 + `S02-S70`,
`S02-S71`, `S02-S72`; no step renumbered), 9 clusters, 24/24 SPEC trace both ways, 72/72
refutation rows
**Spine gate:** the planning-graph gate asks for V's yes on this image. Per the orchestrator's
standing ruling (row V-8) **the fleet proceeds by default and V vetoes**; this file is the
artefact V vetoes or accepts.

## The cluster graph

```mermaid
flowchart TD
  subgraph BASE["base 2b670d30 · lane slice/consent-s02 · nothing here waits on the other lane"]
    C1["<b>S02-C1</b> shared modal semantics<br/>modalSemantics.ts + its render test<br/>+ <b>r1:</b> the ADR (S02-S72, status Proposed)<br/><b>r2: renumbered ADR-0020 → ADR-0022</b><br/>steps S01-S10, S72 · Esc stack, focus trap,<br/>focus return, backdrop, reduced motion<br/><i>MISSION'S FIRST ARTEFACT — S01 is blocked on it</i>"]
    C2["<b>S02-C2</b> policy content<br/>lib/privacyPolicy.ts + unit test<br/>steps S11-S16 · 8 pills, 11 sections,<br/>12 bullets, decoded characters"]
  end

  C3["<b>S02-C3</b> checkbox group<br/>SignUpFlow.tsx + group test<br/>+3 one-line edits to auth-flow<br/>steps S17-S24, <b>S70 (r1)</b><br/><i>command: 3 files</i>"]
  C4["<b>S02-C4</b> the gate<br/>SignUpFlow.tsx + gate test<br/>+1 new case in auth-flow<br/><b>r2: steps S25, S26, S27, S30, S31, S32</b> — R17 cases 1, 2, 3, 6<br/>+ R18's refusal · <b>cases 4 and 5 moved to C7 (B3)</b><br/><i>command: <b>4 files (r1: +C3's)</b> — file count UNCHANGED by r2</i>"]
  C5["<b>S02-C5</b> modal, rendered<br/>PrivacyPolicyModal.tsx + render test<br/>steps S33-S39 · props, ARIA, copy,<br/>pills, sections, footer, read/consent<br/><i>command: 1 file</i>"]
  C6["<b>S02-C6</b> modal, behaviour<br/>PrivacyPolicyModal.tsx + behaviour test<br/>steps S40-S48 · scroll gate + latch,<br/>focus wiring, acknowledge vs close<br/><i>command: <b>2 files (r1: +C5's)</b></i>"]
  C7["<b>S02-C7</b> sign-up ↔ modal wiring<br/>SignUpFlow.tsx + wiring test<br/>steps S49-S58, <b>S71 (r1)</b>, <b>S28 + S29 (r2)</b> · three entry points,<br/>three dismissals, <b>the Esc pin</b>,<br/><b>r1: the mirror arm on all six routes (B1)</b><br/><b>r2: R17 cases 4 and 5, re-routed through the acknowledgement</b><br/><i>command: <b>5 files (r1: +C3's, +C4's, +node-runner)</b> — file count UNCHANGED by r2</i>"]
  C8["<b>S02-C8</b> CSS + style contract<br/>ONE delimited block at the END of globals.css<br/>+ style-contract test · steps S59-S65<br/>no colour literal · no token declared · contrast .65"]
  C9["<b>S02-C9</b> integration + merge<br/>no product edit · steps S66-S69<br/>full-slice run, standing gates, dev stack<br/><i>command: <b>10 files + 2 merge arms (r1)</b></i>"]

  C1 --> C5
  C2 --> C5
  C3 --> C4
  C4 --> C7
  C5 --> C6
  C6 --> C7
  C1 -. "helper consumed by the card too" .-> C7
  C7 --> C9
  C8 --> C9

  C1 -.->|"no shared file — concurrent"| C2
  C3 -.->|"no shared file — the two chains run in parallel"| C5
  C3 -.->|"<b>r1 chain rule (N7):</b> every cluster that edits SignUpFlow.tsx<br/>re-runs every earlier chain member's test file"| C7
  C5 -.->|"<b>r1:</b> the SAME rule on the modal chain — the member<br/>the finding did not sample"| C6
  C7 -.->|"C8 shares no file with C1-C7 and could run any time;<br/>scheduled after C7 only because its selectors must<br/>match the class names C3/C5/C6 introduce"| C8

  classDef base fill:#eef,stroke:#557,stroke-width:1px;
  classDef last fill:#efe,stroke:#575,stroke-width:1px;
  class C1,C2 base;
  class C9 last;
```

## The cross-slice edges — and why they are not a deadlock

```mermaid
flowchart LR
  subgraph L1["lane .worktrees/consent-s01 · branch slice/consent-s01"]
    S01C1["<b>S01-C1</b> tokens + z-index + scrim<br/>the two globals.css token blocks<br/>+ t9-mode-tokens map registrations<br/><i>S01 is the SOLE writer of both</i>"]
    S01rest["S01's card / bar / persistence clusters"]
  end
  subgraph L2["lane .worktrees/consent-s02 · branch slice/consent-s02"]
    A["<b>S02-C1</b> modalSemantics.ts<br/>references NO token"]
    B["S02-C2 … S02-C8"]
    M["<b>S02-S66</b> git merge slice/consent-s01<br/>ONE step · LAST · run by the ORCHESTRATOR"]
  end

  A ==>|"S01 merges slice/consent-s02 —<br/>S01-R18 and the Esc stack need this file"| S01rest
  B -.->|"S02-C5/C6 land PrivacyPolicyModal.tsx;<br/>S01's card opens it with mode=read"| S01rest
  S01C1 ==>|"--ok-edge · --scrim · --z-policy-scrim · --z-policy-card<br/>(measured: 0 declarations at base;<br/>the 5th token --ok-dot already exists)"| M
  B --> M
  M --> V["V acceptance · 14 steps ×2 modes<br/>https://localhost:3000/sign-up"]

  note["NOT a deadlock: modalSemantics.ts and privacyPolicy.ts reference no token,<br/>and S02's CSS may REFERENCE var(--scrim) before S01 declares it (S02 declares NO token) —<br/>t9 asserts set equality over DECLARATIONS and scans for #hex/rgb()/oklch() literals,<br/>and a var() reference is neither. Only the BROWSER APPEARANCE waits on S01."]
  note -.-> M

  classDef n fill:#ffd,stroke:#a90,stroke-width:1px;
  class note n;
```

**Conflict expected and accepted** (vertical-slice law §6): both lanes append a delimited block
at the end of `globals.css`. Resolution is both blocks, S01's first, S02's second. Not a reason
to serialize.

## Seats, gates and the merge point

```mermaid
flowchart TD
  REQ["REQ-01 · Opus 5<br/>SPEC.md v3 FROZEN · PLAN scaffold"] --> REV["REQ-REV-01 · Opus 5 blind<br/>3 rounds · PASS at r3"]
  REV --> ARCH["<b>ARCH-S02</b> · Opus 5 · t_50321020<br/>PLAN.md steps + clusters + boundaries<br/>+ refutation table + this graph"]
  ARCH --> AREV["ARCH-REV-S02 · Opus 5, blind<br/>probes the plan for one step it<br/>cannot mechanically verify"]
  AREV --> CODE["coding seats · Opus 5 · one cluster each<br/>lane .worktrees/consent-s02<br/>3-run law · commit on slice/consent-s02"]
  CODE --> CREV["per-cluster task review<br/>Opus 5, fresh blind session<br/>one per cluster, on the cluster's probe"]
  CREV -->|"all clusters GREEN on the worst of 3 runs<br/>+ every review PASS or all findings closed<br/>+ branch committed + V steps runnable"| GROK["<b>Grok 4.6 gate</b><br/>finished-UI-element review<br/>fired ONCE, never on a partial element"]
  GROK --> VQA["<b>V personally</b> · QA<br/>14 numbered steps × Terracotta + Chamber<br/>Done is V's veto, nothing less"]
  VQA --> MERGE["<b>V performs the merge</b><br/>slice/consent-s02 → dev<br/>no seat pushes, merges or marks Done"]

  ARCH -. "rework ≤3 rounds; round 4 is a V DECISIONS PACKET row" .- AREV
  CODE -. "rework ≤3 rounds" .- CREV

  classDef v fill:#fee,stroke:#a55,stroke-width:2px;
  class VQA,MERGE v;
```

## The standing gates every cluster reports (deltas, never colours)

```mermaid
flowchart LR
  CL["any cluster's ONE command<br/>capture-first · anchored Tests arm<br/>· no 'failed' arm · <b>Test Files n passed (n)</b> arm"] --> G1
  CL --> G2
  CL --> G3
  G1["<b>G1</b> pnpm run generate:contract && pnpm typecheck<br/>DELTA: exit 1, exactly 8 diagnostics,<br/>all in tests/unit/s14-ui.test.ts"]
  G2["<b>G2</b> vitest tests/unit/t9-mode-tokens.test.ts<br/><b>r1:</b> DELTA by the failing test NAMES (never the glyph)<br/>+ the colour-literal HIT LIST counted at exactly 1<br/>+ the pinned element asserted separately"]
  G3["<b>G3</b> vitest tests/unit/v2ui-node-runner.test.ts<br/>exit 0, Tests 2 passed (2) —<br/>the guard that actually bites for R21"]
```

**Why the gates are outside the guard, not inside it:** the lawful guard asserts a GREEN
summary with no `failed`; G1 and G2 are RED at base *by design* (`BASELINE.md`), so folding
them in would make every cluster command permanently red and unable to discriminate anything.
`BASELINE.md`'s own rule is "assert the DELTA, never the absolute", and a delta is a different
assertion.

**The fourth arm exists because ARCH-S02 measured a new variant of the acceptance-command
family:** `pnpm exec vitest run <existing> <missing>` runs only the existing file, prints
`Tests 17 passed (17)` and exits 0. Validated on known-good and known-bad input; appended to
`.hermes/TOOLING-TRAPS.md` as variant 7.

## r1 — what this rework changed in the graph, and why

| Change | Finding | Why it is a graph change and not only a text change |
|---|---|---|
| `C4` 3→4 files, `C7` 2→5 files | **N7** | The `C3 → C4 → C7` chain shares `SignUpFlow.tsx`, so a later cluster's regression into an earlier one's pins was invisible until `C9`. **This is the structural gap B1 fell through**: C4's six mirror cases ran before C7 existed, and C4's command never re-ran C7's file. |
| `C6` 1→2 files | **N7's class, second member** | `C5 → C6` share `PrivacyPolicyModal.tsx` and had the identical shape. A finding is a sample of a class (`heartbeat-protocol` §2.2); the sweep is complete — `C1`, `C2` and `C8` share a product file with nobody. |
| `C9` 9→10 files **+ two merge arms** | **N1** | `C9`'s mutant column claimed it detected "the merge losing S01's `globals.css` block" and could not. `run_c9` now asserts `grep -c -- '--scrim:'` → `2` and `grep -c -- '=== consent-ui S02 ==='` → `2`. **Consequence, accepted: `C9` cannot go green before the merge — correct, because `S02-S66` is its first step.** |
| `C1` gains the shared-modal-semantics ADR (**named `ADR-0020` in r1; renumbered to `ADR-0022-shared-modal-semantics.md` in r2 — see §r2**) | orchestrator note | The ADR was "warranted, not written by this seat" with no number and no owner. It is now step `S02-S72`, written by the C1 coding seat, status `Proposed`, with three mechanical arms and no vitest case — so `C1`'s command is unchanged. |
| `C3` gains `S02-S70`, `C7` gains `S02-S71` | **N3** | R03's "keyboard-toggleable" hook had no step at all. **Measured: jsdom 30.0.1 does not implement Space-activates-checkbox** (`clickEventsSeen=0`), so both steps assert the ACTIVATION event and hand the keystroke to V. |
| `C7`'s mirror arm on six route steps | **B1** | The one defect no step in the graph could see: the DOM says `false`, the R17 mirror says `true`, and `Create account` is computed from the mirror alone. |

**Nothing in the concurrency structure moved.** The chain rule adds test files that a cluster
RUNS, never files it WRITES, so the single-writer analysis behind `C1 ∥ C2`, `{C3→C4} ∥
{C5→C6}` and `C8 ∥ everything` is unchanged. The two-seat schedule is still
`C1∥C2 → {C3→C4} ∥ {C5→C6} → C7 → C8 → C9`.

**`modalSemantics.ts`'s exported surface did NOT change** — B1 lives entirely in
`SignUpFlow.tsx`. S01's lane can be written against the round-0 signature unchanged.

## r2 — what rework round 2 changed in the graph, and why

| Change | Finding | Why it is a graph change and not only a text change |
|---|---|---|
| `S02-S28` and `S02-S29` move `C4` → `C7`; `C4` 8→6 steps, `C7` 11→13 steps | **B3** | R17 cases 4 and 5 expect `Create account` **enabled**, and after C7's click rule the ONLY route that ticks `privacy-accepted` is the modal's acknowledgement — which does not exist until C7. Measured, three runs: `STAGE c4` reports `NO MODAL AT THIS STAGE` for both cases and `STAGE c7: 6/6 pass` (`probes/arch-s02-rework-r2-r17-post-c7-fixed.mjs`). **The r1 chain rule is what exposed it**: C7's command now RUNS `consent-signup-gate.test.tsx`, so under the old text a C7 seat was deadlocked — it could not go green without deleting its own click rule, and it may not edit C4's test. Routed as V-DECISIONS row **V-18**, default (a). |
| `C4` loses its only positive control | **B3, second-order** | Every step left in `C4` expects `disabled === true`, so `C4`'s command can no longer catch a `disabled` hard-coded `true`. That mutant now sits in `C7`'s mutant column, caught by `S02-S28` in its new home and independently by `S02-S53`. Stated in both cluster rows rather than left implicit. |
| `ADR-0020` → **`ADR-0022-shared-modal-semantics.md`** everywhere | orchestrator CORRECTION, `COMMON.md` §10.23 | `ADR-0019`/`ADR-0020` are reserved by the halted `translation` mission. `consent-ui`'s allocation is `ADR-0021` (S01-C2) and `ADR-0022` (S02-C1). 8 references in `PLAN.md` and 2 here. |
| the not-a-deadlock note says **REFERENCE**, not "declare" | **N10** | S02 declares no token (`COMMON.md` §10.8); `t9-mode-tokens.test.ts:376-377` asserts set equality over DECLARATIONS, and a seat reading the graph alone could have taken the old wording as licence to declare one. |

**Nothing in the concurrency structure moved in r2 either.** No cluster gained or lost a FILE:
`C4` still runs 4, `C7` still runs 5, `C9` still runs 10, and the two steps moved between
clusters that are already strictly sequential (`C3 → C4 → C7`, all three writing
`SignUpFlow.tsx`). The two-seat schedule is unchanged. **No step was renumbered** — `S02-S28`
and `S02-S29` keep their ids and their requirement (`R17`, whose trace row already read
`C4 · C7`); only their cluster, their test file and their route changed.
