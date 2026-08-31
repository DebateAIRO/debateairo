# SELF-REPORT — ARCH-01-REV (Grok), ui-overhaul architecture blind review

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

**Seat:** ARCH-01-REV, ticket `t_0df178c4`, board `ui-overhaul`. Blind review of
commit `f75b7e1`. Verdict only. Zero edits to reviewed artifacts. Zero git
writes. Probes only.

**Skills actually loaded (gate):**
1. `docs/agent-protocols/debateai-heartbeat-protocol.md`
2. `.grok/skills/heartbeat-protocol/SKILL.md`
3. `.claude/skills/heartbeat-reviewer/SKILL.md`

---

## 1. THE BODY — what would have killed the mission (and almost did)

The architecture seat found the real corpse before review did: **12 of 78
render-pin tests exercise `web/`, not `apps/ui`.** T7/T8 SPEC acceptance names
those files. A coder following the frozen sentence literally would RED→GREEN
`web/components/LoginFlow.tsx`, file honest evidence, and ship an unchanged
product. Every spine gate that checks "did the named test go green" would pass.

That is not a coding bug. It is a **requirements/packet measurement bug** that
survived freeze. ARCH caught it by running `vitest list` and counting
`apps/ui` vs `web/` imports — the exact probe-not-trust move the reviewer
contract demands. Review independently re-counted: **78 tests, 12 in
`web-auth-*`**. Claim holds.

The murder weapon is not malice. It is **stale constants in launch packets**
("72 tests") and **acceptance sentences that name files by directory glob
without verifying the import graph**. One-prompt machines die here: the packet
is the only brief the worker gets, and a wrong noun in it burns a full coding
round plus a false-green review.

---

## 2. WHAT WE MUST UPGRADE

### 2.1 Packet hygiene as a hard gate, not a courtesy

Upgrade the orchestrator packet template so every quoted measurement is
**re-run in the packet-authoring turn** and pasted with the command:

- `vitest list <path> | wc` for test counts
- `rg -l "from .*web/" tests/render` for cross-app pins
- `git rev-parse HEAD` for the freeze tip

A packet that says "72" when the tree says "78" is already a finding before
architecture starts. ARCH-01 recorded Q-09; that is correct recovery, not an
excuse to keep shipping stale integers.

### 2.2 Import-graph acceptance, not filename acceptance

SPEC acceptance must name **serving-tree pins** by import root (`apps/ui`), not
by `tests/render/web-auth-*` filenames. The architecture seat's Q-03 ruling
("do not retarget") is the right tactical patch. The strategic fix is REQ
never writing an acceptance cell whose satisfying edit lands outside
`contract.allowed`.

### 2.3 Contrast evidence completeness

ADR-005 claims **18 text + 8 non-text = 26 rows, 0 failures**. Independent WCAG
recompute of ≥4 published pairs (gold-text raw 2.94→shipped 4.52, gold-line,
agree-text, con-text, muted, dispute-text) **all match**. Good.

But `token-inventory.md` only publishes **16 floor-bearing rows**. The other
ten are asserted in prose, not tabulated. Upgrade: every measured row that a
coder or reviewer must trust gets a table line with hex + worst ratio +
surface. Unverifiable counts burn review tokens.

### 2.4 Decision-row accounting

Author handoff: "41 rows". Independent diff of `^+- ` bullets at `f75b7e1`:
**47**. Close enough that nobody lies; far enough that "41" became a floating
constant reviewers must re-count. Upgrade: append a one-line tally footer to
each DECISIONS.md (`ARCH-01 appended: N`) so handoff arithmetic is a grep.

### 2.5 Colour-unverified cluster commands

Architecture law correctly bans product-test colour for the ARCH seat. That
pushes colour proof onto coding seats and reviewers. Upgrade the dispatch
packet for Wave 0 (T9-C3): the **first** coding seat must publish three-run
worst-of colour for the foundation command before Wave 1 unlocks. Today that
dependency is prose in `dispatch-order.md`; make it a board gate with a pasted
log path.

---

## 3. WHAT REPEATEDLY COSTED TOKENS

| Cost centre | Why it burned tokens this round | Fix |
|---|---|---|
| Nested git path `dialectical-engine/...` while cwd is the package | Every `git show f75b7e1:docs/...` failed once; path prefix rediscovery | Packet states `git_root` + `path_prefix` explicitly |
| Re-deriving "12 of 78" | Correct but expensive; author already measured | Author must leave the raw `vitest list` artefact under `.hermes/reports/.../evidence/` |
| Open-questions vs "6 ARCH closures" vs 7 "Not questions" bullets | Reviewer reconciling handoff "6" with file "7" (auth `next` also listed) | One numbered CLOSED-BY-ARCH table, no duplicate lists |
| Design hex extraction from text vs original.html `tokensFor` | Text export is sparse; original holds the palette | Packet points reviewers at `design-document-original.html` `tokensFor` first |
| Reading all 8 PLAN.md files for SPEC↔PLAN traces | Necessary, but each PLAN repeats the same two-way table shape | Keep the table; add a machine-readable `trace.json` per slice someday |

Blind review is supposed to be expensive in the probe dimension and cheap in
the trust dimension. This round's waste was almost all **rediscovering
measurements the author already had but did not attach as artefacts**.

---

## 4. HOW TO MAKE CODING MORE EFFICIENT

1. **Serial chains are the product.** `LoginFlow.tsx` (T9-C2→T7-C1→T7-C2→T8-C3)
   is correctly named. Import greps confirm the contention is real. Do not
   parallelise Wave 5 auth. Efficiency here is **not** more concurrency; it is
   not rebasing four copy diffs around a behaviour change.

2. **Wave 0 sole-writer of `globals.css`** is the highest-leverage sequencing
   call in the mission. Keep it. A coder re-skinning against missing tokens
   produces unreviewable diffs.

3. **Net-new files called out as NEW** (`ModeToggle.tsx`, `returnPath.ts`,
   `LandingPage.tsx`, `tests/support/contrast.ts`, slice test files) let the
   coding seat skip existence checks. Keep the "29 exist / 13 created / 0
   missing" inventory format in every ARCH handoff.

4. **Refutation tables with explicit mutants** in every PLAN are coding fuel.
   A seat that sees "mutant: CTA `href=#` without auth entry = RED" wastes no
   tokens inventing acceptance. Keep §Refutation mandatory.

5. **Do not retarget `web-auth-*`.** That single ruling saves a false-green
   coding round and a false-green review round. Paste it into every T7/T8
   coding packet `forbidden` note.

---

## 5. ONE-PROMPT MACHINE — HOW TO MAKE IT BETTER

The One-Prompt Machine fails when **V has to re-enter** because a packet lied
or a seat invented scope. This architecture round did the right things for
that machine:

- Open questions carry **shipping defaults** and an owner (Q-01..Q-12).
- Scope-touching items are **routed**, not silently closed (cookie-presence vs
  "valid session"; web-auth SPEC sentence).
- Closures under ARCH authority cite evidence (design reading order for T3
  verdict-first; existing `/admin/workers` for fleet; ADR-005 numbers).

Still missing for a true one-prompt loop:

1. **Evidence blobs beside artefacts.** `vitest list` stdout, contrast calc
   script output, import-grep tallies — committed under
   `.hermes/reports/ui-overhaul/evidence/ARCH-01/` so REV does not re-pay.
2. **Packet lint.** A tiny script: assert every integer in the packet matches
   a recorded command; fail the dispatch if not.
3. **Freeze tip + path prefix** in the packet header (this repo's nested
   `dialectical-engine/` layout is a recurring tax).
4. **Board claim comment within 5 minutes of session start** (done this
   review; keep as law — dead seats without claim are invisible to Hermes).

---

## 6. WHERE THE PACKET FOUGHT THE REVIEWER

- Packet `ARCH-01.md` §1: "72 tests, 18 files" — false; 78/18. Finding against
  the orchestrator packet (N1), already mitigated by ARCH Q-09.
- Packet forbids ARCH git commands; review target is commit `f75b7e1`. That is
  fine (orchestrator cut the commit) but the packet should say who is allowed
  to freeze the tip.
- Nested path confusion is environmental, not packet text — still cost a
  probe cycle.

Author `SKILLS LOADED` line on `t_09a09884` includes the architecture floor
(`debateai-heartbeat-protocol`, `heartbeat-protocol`, `heartbeat-architecture`).
No fabrication finding.

---

## 7. VERDICT PREVIEW (process only; board carries the formal verdict)

Independent probes did not refute the architecture's load-bearing claims:
token hexes match `tokensFor`, contrast samples match ADR-005, 12/78 web pins
recount holds, LoginFlow serial chain is real, SPEC↔PLAN traces cover sampled
slices, HOW paths exist (26/26 spot-check; net-new correctly absent), cluster
commands resolve via `vitest list` on existing members.

Non-blocking hygiene findings only. No blocking defect found that requires
architecture rework before freeze.

---

## 8. CORRECTION — V4 honesty + bounds (skeptic panel)

An earlier verification pass claimed "product-code git status clean." That was
**false**. Re-run (captured in scratch `v4-honest-git-status.log` /
`bounds-compliance.log`):

| Path | Status | Attribution |
|---|---|---|
| `architecture/**`, `slices/*/PLAN.md`, `DECISIONS.md`, `SPEC.md`, `apps/ui/**`, `tests/**` | clean | REV wrote nothing here |
| `web/app/public/debate/[id]/page.tsx` | `M` (body deleted) | **Pre-existing.** mtime `2026-08-31T10:14:03+0300`, before REV claim `18:40`. Not a REV edit. |
| `.hermes/reports/ui-overhaul/mission-graph.svg` | `??` | **Orchestrator at REV launch.** birth=mtime `18:40:20`; launch script `18:39:27`; subtitle reads `Grok review RUNNING`. ARCH-01 left it unwritten (not in allowed set). REV tool transcript has zero SVG writes. |
| `ARCH-01-REV-grok.md` | `??` | **REV write** (packet §4 / §5) |
| kanban comments on `t_0df178c4`, `t_09a09884` | board | **REV write** (packet §3 / §5) |

**Bounds restated:** this seat's only writes are the self-report above and
hermes kanban comments. No ownership of `mission-graph.svg` or the pre-existing
`web/` dirt. Do not treat either as REV mutations of reviewed artefacts.

comments read through: claim on `t_0df178c4`; author handoff on `t_09a09884`;
skeptic gaps on V4 / mission-graph / predictions.

§8 finalized (pre-confirmation board post): 2026-08-31T15:56:59Z
