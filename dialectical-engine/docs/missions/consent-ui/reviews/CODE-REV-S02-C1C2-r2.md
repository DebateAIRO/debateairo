# CODE-REV-S02-C1C2 — round 2 verdict · slice S02, clusters `S02-C1` + `S02-C2`

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging`

`superpowers:receiving-code-review` — **not loaded this session** (COMMON §10.9 form): nothing of
mine is contested; I load it before answering if the author contests N5, N6 or N7.
`predecessor session loaded:` not applicable — round 1 was a different session of this seat name
and its `SKILLS LOADED` line is its own (verdict r1, line 3).

**Verdict: PASS.** All five round-1 findings ADDRESSED, each re-measured by me. Four new
non-blocking findings (N5–N8), three packet findings (P1–P3), and one finding against **myself**
(S1 — I destroyed the round-1 self-report; §7). Round 2 of max 3. **A PASS here releases the S02
MODAL chain (C5/C6)** per my packet §4.

**Under review:** seat `CODE-S02-C1C2-REWORK-R1`, ticket `t_eab0c89f`, commit `06ab1da4`
(parent `91877847`) on `slice/consent-s02`.
**My worktree:** `.worktrees/rev-s02-c1c2-r2/dialectical-engine`, **detached at `06ab1da4`**,
`git status --porcelain` = 0 tracked entries at CLAIM and at handoff (only my own
`.review-scratch/`, deleted before handoff). `pnpm run generate:contract` run first, **exit 0**,
tree unchanged, `packages/contract/generated/{client.ts,openapi.json,field-inventory.json}` present.
**My probe kit (promoted BEFORE this verdict, COMMON §10.26):**
`.hermes/reports/consent-ui/probes/code-rev-s02-c1c2-r2-*` — 9 files, every one lane-independent
(`$1` / `argv[1]`), with a README carrying the expected strings.

---

## 0. Headline

**The blocking defect is dead, and it is dead by the property, not by the fixture.** I replanted
the round-1 implementation (`const top = surfaceStack[surfaceStack.length - 1]`) and the cluster's
OWN suite now reports **four** failures where round 1 reported none. I replanted all **ten**
round-1 mutants: all ten are killed, **including `M10` (`stopPropagation` removed), which survived
round 1**. The reviewer's kit goes `Tests 2 failed | 27 passed (29)` → `Tests 29 passed (29)` in my
worktree, three runs.

The author's handoff is honest to the byte on everything I re-measured, including the three
mutants it reports as SURVIVING — I reproduced all three survivals independently. **One claim in
it is wrong, and it is the one that was written into shared memory:** that jsdom can discriminate
"exactly one" unfocusable element type, and therefore the N1 advance loop cannot be pinned here.
There is a second (`<fieldset disabled>`), the advance loop **is** pinnable in two lines, and I
have the RED/GREEN to prove it. That is N5, and it is non-blocking because the shipped code is
CORRECT — only its test and its record are not.

---

## 1. Packet review (`heartbeat-reviewer` §1) — both packets, before the diff

**Every constant in both packets verifies.** Measured by me, in my worktree, at `06ab1da4`:

| Packet claim | Measured by me | Result |
|---|---|---|
| HEAD `06ab1da4`, parent `91877847`; C1 `8fe1e0bc`, C2 `91877847` reviewed in r1 | `git log --oneline -5` → `06ab1da4 · 91877847 · 8fe1e0bc · 2b670d30` | OK |
| review package `S02-C1C2-r2.diff` "378 lines: the fix commit only" | `wc -l` → **378**; its `## Commits` lists `06ab1da4` alone | OK |
| the round-1 package "has the original two commits" | `wc -l S02-C1C2-r1.diff` → **893** (the r1 verdict's own figure) | OK |
| probe kit `code-rev-s02-c1c2-r1-*` "8 files" | `ls … \| wc -l` → **8** | OK |
| kit prints `Tests 29 passed (29)` against the fix | ×3 in MY worktree, §3.1 | OK |
| cluster command `run S02-C1 1 tests/render/consent-modal-semantics.test.tsx`, "`<n>` rose" | ×3 both shells → **`Tests 17 passed (17)`** (was 10) | OK |
| N1 → orchestrator ruling `t_c16d9fe5` | ticket exists, `status: ready`; body read on the board and quoted in §2/N1 | OK |
| N4 "done: `snapshots/packets/`" | 10 `*.at-dispatch` files exist | OK |
| rework packet's `allowed` = 3 product/doc files + report + traps + scratch | `git diff --name-status 91877847 06ab1da4` → **exactly those 3**, nothing else | OK |
| "the EXPORTED SURFACE is byte-frozen" | my own check, §3.3 — **byte-identical, sha256 equal** | OK |
| both packet paths resolve from my cwd | absolute; they do | OK |
| **both packets vs their at-dispatch snapshots** | `diff` → **IDENTICAL** for `CODE-REV-S02-C1C2-R2.md` and `CODE-S02-C1C2-REWORK-R1.md` | OK |

That last row is round-1 N4 discharged, and it is worth naming: **this is the first packet review
in this mission that can prove what the seat actually read.** COMMON §10.32 now carries it.

Three packet defects (P1–P3) are in §5.

**Author's `SKILLS LOADED` vs the worker floor — checked, and it PASSES.** Declared:
`superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker, superpowers:receiving-code-review,
superpowers:test-driven-development, superpowers:systematic-debugging, superpowers:verification-before-completion`
— the full floor (`heartbeat-protocol` §1: TDD, verification, systematic-debugging on a bug,
receiving-code-review on rework), with the predecessor's loads on a separate line in COMMON §10.9's
exact form. I cannot grep their transcript; what I can check is whether the handoff *behaves* like
those skills were loaded, and it does — a RED frame before every GREEN (§3 of the handoff), root
cause stated before the fix, and no completion claim without pasted output. **No fabrication
finding.**

**Author's self-report bar** (`agent-reports/CODE-S02-C1C2.md`, Part II at lines 187–302, written
23:33, **before** the 23:36 handoff): **meets it, and exceeds it.** Names the cause once
("derived *topmost* from **when** a surface registered instead of from **where** it is"), prices it
(≈55 min, of which the fix was ~8), records two near-misses including the one that matters — *"a
nested fixture is not automatically a discriminating fixture"* — and lists dead ends. One of those
dead ends is factually wrong; that is N5, not a bar failure.

---

## 2. The five round-1 findings — one line each, with the evidence I re-ran

### B1 — **ADDRESSED**

*"Topmost" was derived from React's effect-commit order; a nested pair inverted the Esc stack.*

**Evidence I re-ran, four independent ways:**

1. **The r1 kit, in my worktree, ×3** (`.review-scratch/` = the three probes byte-identical to the
   promoted originals, `cmp` verified, plus the unedited config):
   ```
   KIT RUN 1  exit=0    Test Files  3 passed (3)     Tests  29 passed (29)
   KIT RUN 2  exit=0    Test Files  3 passed (3)     Tests  29 passed (29)
   KIT RUN 3  exit=0    Test Files  3 passed (3)     Tests  29 passed (29)
   ```
   and every probe's own console line now reads what the r1 verdict measured on its patched module:
   ```
   P1 NESTED same-commit -> outer.onClose=0 inner.onClose=1
   Q2 NESTED same-commit   -> outer=0 inner=1  (SPEC demands outer=0 inner=1)
   Q5 three nested a>b>c, ONE Escape -> closed: ["c"]  (SPEC demands ["c"])
   Q6 nested   : byArray=outer  byDom=inner   (want inner)
   R1a sequential open -> card=0 modal=1 (want card=0 modal=1)
   R1b AFTER a remount  -> card=0 modal=1 (SPEC wants card=0 modal=1)
   R2 after ONE Escape: card in document = true, modal in document = false, depth = 1
   P10 after Tab from surface a -> activeElement = close-b
   ```
   `R2` is the one that mattered: **one Escape now removes the modal and leaves the card**, which is
   what `slices/S01/SPEC.md:348-350` demands in words.
2. **The author's claimed RED, reproduced by me, not taken on trust.** I replanted the round-1
   implementation (`const top = surfaceStack[surfaceStack.length - 1]`) and ran the kit alone:
   ```
   exit=1        Tests  2 failed | 27 passed (29)
    FAIL  .review-scratch/esc-stack.probe.tsx > REV probe — the Esc stack > P1 NESTED same-commit: which surface consumes the one Escape?
    FAIL  .review-scratch/remount.probe.tsx > REV probe 3 — reachability of the inverted stack > R2 what the VISITOR sees when the stack is inverted
   ```
   — the author's string, character for character, and the same two test names.
3. **The cluster's OWN suite now owns the property** (this is what makes B1 stay dead after the
   kit is forgotten). Mutant `MB1a` = the round-1 implementation restored:
   ```
   KILLED | MB1a round-1 impl restored (last registered)   exit=1   Tests  4 failed | 13 passed (17)
     FAIL … > delivers one Escape to the nested inner surface, not to the outer one it mounted with
     FAIL … > delivers one Escape to the innermost of three nested surfaces
     FAIL … > delivers one Escape by document position when two surfaces opened out of DOM order
     FAIL … > traps Tab inside the nested inner surface, not inside the outer one
   ```
   Round 1's suite reported **0** failures for that same code. The Tab sweep (the r1 verdict's P10)
   is pinned too — fourth line.
4. **`ADR-0022` §Decision now matches the code.** `grep -c` over the ADR: `last entry` = **0**,
   `LIFO` = **0**, `compareDocumentPosition` = **1**; the paragraph names the containment rule and
   the child-first effect reason. The three `S02-S72` arms re-run by me: `ARM1 EXISTS` ·
   `ARM2 'Status: Proposed' = 1` · `ARM3 useModalSurface 1 · backdropCloseHandler 1 ·
   prefersReducedMotion 1 · openSurfaceCount 2` · `ARM-neg 'Status: Accepted' = 0`.

*(The words the ADR deleted survive in two other artifacts — N6.)*

### N1 — **ADDRESSED** (per orchestrator ruling `t_c16d9fe5`, whose body I read verbatim on the board)

The ruling ordered: filter `[type=hidden]` and `tabindex="-1"` **on every arm**, advance past a
candidate `focus()` did not land on, visibility out of scope. All three delivered
(`modalSemantics.ts:38-51` `isFocusCandidate`, `:74-84` the advance loop). `FOCUSABLE_SELECTOR`
itself is byte-unchanged, as the ruling requires.

```
KILLED | MN1a no tabindex=-1 filter              1 failed | 16 passed (17)  — skips a control that tabindex=-1 has removed from the tab order
KILLED | MN1e whole isFocusCandidate filter removed  1 failed | 16 passed (17)  — same case
KILLED | MN1d neither hidden filter nor advance  1 failed | 16 passed (17)  — skips a hidden input, so Tab inside the surface is never a no-op
SURVIVED| MN1b no hidden-input filter             Tests 17 passed (17)
SURVIVED| MN1c no advance loop                    Tests 17 passed (17)
```
The two survivals are **exactly what the author disclosed** (F3) and I reproduced them
independently. One of them is separately pinnable after all — **N5**.

### N2 — **ADDRESSED**, and this is the round's cleanest result

`M10` (remove `event.stopPropagation()`) was the one mutant the round-1 suite could not see.

```
KILLED | M10 stopPropagation removed   exit=1   Tests  1 failed | 16 passed (17)
  FAIL  tests/render/consent-modal-semantics.test.tsx > … > keeps Escape from reaching a window listener while a surface is open
```
The new case (`:371-390`) carries its own **control** — with nothing open the same `window`
listener DOES see the key (`onWindow` called once) — so a run in which the event never reached
`document` cannot pass it vacuously. That control is the difference between a pin and a
coincidence, and the author wrote it unprompted.

### N3 — **ADDRESSED**

`tests/render/consent-modal-semantics.test.tsx:406-421` now DRIVES the absent branch
(`vi.stubGlobal("matchMedia", undefined)`) instead of asserting `typeof window.matchMedia`. The
`afterEach` calls `vi.unstubAllGlobals()` (`:125`), so the stub does not leak. The rewrite did not
weaken the pin: `KILLED | M5 matchMedia unguarded → 1 failed | 16 passed (17) — reports no
reduced-motion preference when matchMedia does not exist`.

### N4 — **ADDRESSED** (orchestrator's, not the author's)

`.hermes/reports/consent-ui/snapshots/packets/` exists with **10** `*.at-dispatch` files, and
COMMON §10.32 now states the rule. `diff` of my own packet and of the rework packet against their
snapshots: **IDENTICAL**. The r1 N4 open question is also settled: `grep -c "four\|Four"` over
`CODE-S02-C1C2.md.at-dispatch` → **0**, so the four-member `ModalSurface` sentence was never in
that packet, and nobody is charged.

---

## 3. What I verified, and HOW — verbatim outputs

### 3.1 The cluster commands, ×3, from a `.sh` under `/bin/bash` AND inline (COMMON §10.16)

`run()` transcribed verbatim from `docs/missions/consent-ui/slices/S02/PLAN.md:1376-1388` (I
re-measured that citation: the fenced `sh` block begins at `:1376`). My script takes the lane as
`$1` — `.hermes/reports/consent-ui/probes/code-rev-s02-c1c2-r2-cluster.sh`.

```
=== FROM .sh UNDER /bin/bash ===
### grep flavour: grep (BSD grep, GNU compatible) 2.6.0-FreeBSD · LC_ALL=<unset>
--- RUN 1 ---   S02-C1 | vt=0 guard=0 VERDICT=0 | sum=[      Tests  17 passed (17)] fil=[ Test Files  1 passed (1)]
                S02-C2 | vt=0 guard=0 VERDICT=0 | sum=[      Tests  6 passed (6)] fil=[ Test Files  1 passed (1)]
--- RUN 2 ---   (identical)
--- RUN 3 ---   (identical)

=== INLINE (tool shell) ===
### grep flavour: ugrep 7.8.4 aarch64-apple-macosx · LC_ALL=<unset>
--- RUN 1 ---   S02-C1 | vt=0 guard=0 VERDICT=0 | sum=[      Tests  17 passed (17)] fil=[ Test Files  1 passed (1)]
                S02-C2 | vt=0 guard=0 VERDICT=0 | sum=[      Tests  6 passed (6)] fil=[ Test Files  1 passed (1)]
--- RUN 2 ---   (identical)
--- RUN 3 ---   (identical)
```

**Three-run worst case, as I measured it:**
**`S02-C1` — WORST RUN VERDICT=0, `Tests 17 passed (17)`, `Test Files 1 passed (1)`** (was 10 in
round 1; +6 ordered cases +1 disclosed addition, one case rewritten in place for N3).
**`S02-C2` — WORST RUN VERDICT=0, `Tests 6 passed (6)`, `Test Files 1 passed (1)`** (untouched by
this commit; re-run anyway). Both shells agree; no run differed.

### 3.2 Mutation harness — 19 mutants against the cluster's OWN suite

`code-rev-s02-c1c2-r2-mutants.py`. Each mutant is applied to a pristine byte copy, the cluster
command runs, failing test NAMES are printed with an ASCII anchor (never vitest's glyph — COMMON
§10.16), the module is restored with `git checkout HEAD --`, and **the restore is asserted
byte-identical to the pristine text** (`pristine sha256[:24] = ec45551bee291031b18e989a`, 7483
bytes). Porcelain for the module after **every** restore: `[]`.

| Mutant | Result | Killed? |
|---|---|---|
| M1 FIFO (`surfaceStack[0]`) | 1 failed \| 16 passed | yes |
| M2 stack never pops | 6 failed \| 11 passed | yes |
| M3b focusable set cached AT OPEN | 2 failed \| 15 passed | yes |
| M4 focus not returned | 1 failed \| 16 passed | yes |
| M5 `matchMedia` unguarded | 1 failed \| 16 passed | yes |
| M6 Escape to EVERY surface | 4 failed \| 13 passed | yes |
| M7 Tab `preventDefault` removed | 1 failed \| 16 passed | yes |
| M8 initial focus not applied | 2 failed \| 15 passed | yes |
| M9 second `document` keydown listener | 6 failed \| 11 passed | yes |
| **M10 `stopPropagation()` removed** | **1 failed \| 16 passed** | **yes — was NO in round 1** |
| MB1a round-1 impl restored | 4 failed \| 13 passed | yes |
| MB1b containment arm ONLY | 1 failed \| 16 passed | yes |
| MB1c FOLLOWING arm ONLY | 17 passed | **no — correct, see below** |
| MB1d topmost = FIRST in document order | 5 failed \| 12 passed | yes |
| MN1a no `tabindex="-1"` filter | 1 failed \| 16 passed | yes |
| MN1b no hidden-input filter | 17 passed | **no — N5** |
| MN1c no advance loop | 17 passed | **no — N5** |
| MN1d neither | 1 failed \| 16 passed | yes |
| MN1e whole filter removed | 1 failed \| 16 passed | yes |

**16 / 19 killed.** `MB1c` SURVIVING is correct, not a gap: a contained node is also `FOLLOWING`,
so `DOCUMENT_POSITION_CONTAINED_BY` is documentation, not logic — the author says the same, and my
mutant confirms it from the other side (`MB1b`, containment-only, IS killed, by the out-of-DOM-order
case, so that case is load-bearing). The other two survivals are N5.

### 3.3 The exported surface — my OWN check, byte-level, across the fix commit

`code-rev-s02-c1c2-r2-surface.py`. Every top-level `export` declaration extracted from
`git show 91877847:…` and `git show 06ab1da4:…` by a brace-depth scan, joined, hashed, no
whitespace normalisation.

```
exported declarations at 91877847 : 5
exported declarations at 06ab1da4 : 5
sha256 of the joined signatures  before = 7cb8a8837a5e2fb437dc145ff733c2c3
sha256 of the joined signatures  after  = 7cb8a8837a5e2fb437dc145ff733c2c3
BYTE-IDENTICAL EXPORTED SURFACE ACROSS THE FIX COMMIT: True   (317/317 bytes)

DISCRIMINATORS (each MUST be False):
   False  one space after a comma removed
   False  HTMLElement | null reflowed
   False  a single character dropped
```
And against the PLAN's fenced contract block, each declaration minus its terminating `;`:
```
  True  export type ModalSurface = Readonly<{
  True  export function useModalSurface(open: boolean, surface: ModalSurface): void
  True  export function backdropCloseHandler(
  True  export function prefersReducedMotion(): boolean
  True  export function openSurfaceCount(): number
ALL FIVE PLAN DECLARATIONS PRESENT BYTE-FOR-BYTE IN THE MODULE: True (5 declarations)
DISCRIMINATOR (must be False): False
```
**S01 can consume this unchanged.** The module still has no `export default`, five named exports
and no others, and no import-time side effect.

*Disclosure on my own first attempt:* my first extractor stopped at the `{` of a function body and
so swallowed a trailing space, reporting three of five as `False`. **The divergence was mine.** I
re-modelled with a brace-depth scan before writing anything down; the output above is the corrected
run. *(The r1 lens disclosed the same shape of error in its copy-diff probe. Two rounds, two
extractor bugs — see my self-report §3.2.)*

### 3.4 Standing gates — the DELTA, never "green" (COMMON §10.20: reported, not folded in)

```
G1  pnpm typecheck        exit=1 · ran-arm `^\$ tsc --noEmit$` = 1 · 8 diagnostics,
                          ALL in tests/unit/s14-ui.test.ts (2×TS2307, 2×TS18046, 2×TS2339, 2×TS7006)
                          OUTSIDE THE PIN = 0.   DELTA vs BASELINE.md: ZERO.
G1b cd apps/ui && npx tsc --noEmit -p tsconfig.json   ->  exit 0, ZERO output lines  (COMMON §10.30)
G2  t9-mode-tokens        exit=1 · Tests 2 failed | 6 passed (8) · exactly the two pinned NAMES ·
                          colour-literal HIT LIST = 1 element, the pinned one:
                          "…/apps/ui/app/globals.css:6096:background: color-mix(in srgb, #0a0806 32%, transparent);"
                          DELTA: ZERO — no third failure, no second hit.
G3  v2ui-node-runner      exit=0 · Tests 2 passed (2)
G4  auth-flow-integration exit=0 · Tests 17 passed (17)          (BASELINE 17 on this branch)
G5  auth-front-door-parity exit=1 · Tests 2 failed (2)           (BASELINE: the two ENOENT)
```

### 3.5 File surface, no-touch surfaces, and the standing V law

```
git diff --name-status 91877847 06ab1da4
M  apps/ui/components/consent/modalSemantics.ts
M  docs/architecture/01-decisions/ADR-0022-shared-modal-semantics.md
M  tests/render/consent-modal-semantics.test.tsx
3 files changed, 217 insertions(+), 14 deletions(-)
```
Exactly the rework packet's `allowed` list, nothing else. Diff hits for
`apps/api/` · `packages/` · `migrations/` · `tools/` · `app/globals.css` · `tests/integration/` ·
`tests/unit/registration` → **0 each**. No `+`/`-` line anywhere in the diff matching
`register(|adult_affirmed|privacy_accepted` — **the registration request shape is unchanged**. No
`#hex` / `rgb(a)(` / `oklch(` literal added. No `package.json` / lockfile change — **no new
dependency**. The `globals.css` block discipline is trivially satisfied: the file is untouched.

---

## 4. New findings — non-blocking. Each demands a fix; the tier sets WHEN, never WHETHER

### N5 — the N1 advance loop ships UNPINNED, and the recorded reason it "cannot" be pinned is false

**Files:** `apps/ui/components/consent/modalSemantics.ts:74-84` (the advance loop) ·
`tests/render/consent-modal-semantics.test.tsx` (no case) · `.hermes/TOOLING-TRAPS.md:1602` (heading) and `:1611` (the sentence) ·
`agent-reports/CODE-S02-C1C2.md` §4 dead-ends.

**CLASS:** *an environment measurement over a finite sample is written into shared memory as a
universal ("only X" / "exactly one"), and a later seat skips real work because of it.* This is
COMMON §2.2's "a finding is a SAMPLE of a class" applied to **measurements**, where no rule exists
yet.

**The claim, verbatim from TOOLING-TRAPS.md** (`### jsdom 30.0.1: focus() lands on almost
everything a browser would refuse — only input[type=hidden] is refused`):

> "So a focus-trap test in jsdom can discriminate **exactly one** unfocusable element type."

**Concrete inputs → wrong outcome.** Probe `code-rev-s02-c1c2-r2-focusability.probe.tsx` runs the
pinned selector, then `isFocusCandidate`, then `focus()`, over 17 element shapes:

```
plain button                       selector=true  afterFilter=true  focus()lands=true
button tabindex=-1                 selector=true  afterFilter=false focus()lands=true
button [hidden]                    selector=true  afterFilter=true  focus()lands=true
button display:none                selector=true  afterFilter=true  focus()lands=true
button visibility:hidden           selector=true  afterFilter=true  focus()lands=true
input type=hidden                  selector=true  afterFilter=false focus()lands=false
button DISABLED + tabindex=0       selector=true  afterFilter=true  focus()lands=true
button inside <fieldset disabled>  selector=true  afterFilter=true  focus()lands=false   <<<<
a WITHOUT href, tabindex=0         selector=true  afterFilter=true  focus()lands=true
button inert                       selector=true  afterFilter=true  focus()lands=true
W1 ELEMENTS THE FILTER KEEPS BUT jsdom focus() REFUSES: ["button inside <fieldset disabled>"]
```

`button:not([disabled])` matches — the *button* carries no `disabled` attribute; the fieldset does.
The filter keeps it. jsdom refuses focus on it, **exactly as a real browser does** (HTML: a
descendant of a disabled `fieldset` is itself disabled). So the set is **two**, not one, and the
advance loop is pinnable here.

**Remedy — BINDING (measured).** Add one case to `tests/render/consent-modal-semantics.test.tsx`:
a surface containing `<fieldset disabled><button>locked</button></fieldset>` then a real button;
focus the close button, press `Tab`, assert focus lands on the real button. **My measurement, both
directions** (`code-rev-s02-c1c2-r2-advance-loop-discriminates.sh`, and probe
`-advance-loop.probe.tsx`):

```
=== A. SHIPPED module (06ab1da4) ===
  exit=0        Tests  1 passed (1)
W2 Tab from close -> activeElement = next-real
=== B. MUTANT MN1c — advance loop removed ===
  exit=1        Tests  1 failed (1)
W2 Tab from close -> activeElement = close            <- Tab is a DEAD KEY inside the dialog
```

**Also BINDING: correct the TOOLING-TRAPS entry and the self-report dead-end** — both currently
tell every future seat that this test cannot be written. **The shipped code is CORRECT**; that is
why this is N and not B. What is wrong is that a shipped branch has no gate (the exact N2 class
this round closed) and the mission's shared memory says it cannot have one.

*Not charged to the author:* the hidden-input filter half genuinely **cannot** be pinned alone —
everything it removes is either already skipped by the advance loop or already pinned by the
`tabindex="-1"` case. `MN1b`'s survival is inherent overlap, not a gap. Only the advance-loop half
was pinnable, and only via a shape nobody had measured.

### N6 — the sentence that produced B1 is still live in two artifacts, one of which is the ADR's own source of record

**Files:** `apps/ui/components/consent/modalSemantics.ts:29` ·
`docs/missions/consent-ui/slices/S02/DECISIONS.md:101`.

**CLASS:** *the CLASS was swept in the code and in the ADR, but not across the artifact chain that
feeds them* (COMMON §2.2: fix the class, not the instance).

Measured, `grep -c`:

| Artifact | `LIFO` | `last entry` / `LAST entry` |
|---|---|---|
| `ADR-0022` (corrected this round) | 0 | 0 |
| `modalSemantics.ts` | **1** (`:29` — *"The Esc stack: LIFO, module-level…"*) | 0 |
| `S02/DECISIONS.md` | **1** (`:101`) | **1** (`:101`) |

`DECISIONS.md:101` reads, verbatim: *"A module-level **LIFO array** in `modalSemantics.ts` … On
`Escape`, only the **LAST** entry's `onClose` is invoked"* — and `ADR-0022`'s own header names that
row as its **Source of record** (*"Transcribed, not decided here. Sources: … `DECISIONS.md` — 'The
Esc stack's implementation shape'"*). The ADR and the row it was transcribed from now say opposite
things about the same mechanism, and the ADR is declared **law for every future overlay in this
repo**. A seat writing C5/C6, S01's card, or the `A11Y-OVERLAYS` retrofit (`t_8962842f`) that
reads DECISIONS.md rebuilds B1.

The module's own `:29` is milder but the same class: it is not even accurate as a data-structure
claim any more (removal is `lastIndexOf` + `splice`, not LIFO), and "LIFO" is precisely the mental
model that produced the defect.

**Remedy — per member, because ownership differs:**
- `modalSemantics.ts:29` — **BINDING (measured: the grep table above)**; one line, inside the
  author's own `allowed` file: say *registry* and point at `topmostSurface()`.
- `S02/DECISIONS.md:101` — **ADVISORY**, and **NOT the author's** (not in their `allowed` list).
  DECISIONS.md is append-only, so the fix is a new dated row superseding the shape, written by the
  architecture seat / orchestrator. See **P1**.
- `S02/PLAN.md:175-181` (S02-S01) still describes the fixture as *"outer first then inner"* — the
  phrasing four readers satisfied with siblings. Not false, so ADVISORY; fold into the same edit.

### N7 — `topmostSurface()` treats a DETACHED container as topmost

**File:** `apps/ui/components/consent/modalSemantics.ts:96-110`.
**CLASS:** *the guard tests `null`, but the property the comparison needs is `isConnected`.*

The guard is `if (held === null || other === null || held === other) continue;`. A container that
is non-null but no longer in the document is compared anyway. Measured
(`code-rev-s02-c1c2-r2-detached.probe.tsx`, jsdom 30.0.1):

```
W3a rel=37  DISCONNECTED=true FOLLOWING=true CONTAINED_BY=false IMPL_SPECIFIC=true
    ->  topmostSurface()'s 'above' test = true
W3a  detached.isConnected = false   attached.isConnected = true
```

So a registered surface whose container has been detached **wins** over every attached one and
consumes the `Escape`.

**Reachability — measured per ref idiom, React 19:**
```
W3b {"callback-no-return":"null (safe)","callback-with-cleanup":"NON-NULL, isConnected=false (stale detached node)","object-ref":"null (safe)"}
```
The test file's `TestSurface` and an object ref both leave `containerRef.current === null` on
detach, so **no current consumer reaches this**. React 19's cleanup-returning callback ref does
NOT null the ref — a consumer using that idiom, or one that keeps `open` true while conditionally
not rendering its container, holds a stale detached node and permanently captures `Escape`.

**Remedy — ADVISORY.** One clause: skip candidates whose container is not `isConnected`, and do not
let a disconnected incumbent stand. It matters because ADR-0022 makes this module law for overlays
not yet written (C5/C6, `A11Y-OVERLAYS`), and this is the one branch of the new function nothing
pins. **What I could NOT do:** build a consumer inside this cluster's surface that holds the bad
state persistently — the two consumers do not exist yet. Stated as measured mechanism plus
unmeasured reachability, not as a claim about shipped behaviour.

### N8 — the round-1 probe kit is not re-runnable without editing it, and carries one control that cannot discriminate

**Files:** `.hermes/reports/consent-ui/probes/code-rev-s02-c1c2-r1-cluster.sh:4` and
`-surface-check.py:7` (both hard-code `.worktrees/rev-s02-c1c2/…`); `-surface-check.py:32`.

Both confirmed by me. COMMON §10.10 makes re-running a promoted probe the discharge of a finding,
while the author must not edit a reviewer's probe — the kit as promoted makes those two rules
contradict each other, and it cost the author (their F6) and me (~25 min re-deriving a mutation
harness that already existed). The author's disclosed control defect also verifies: the negative
control `"export function openSurfaceCount(): number "` (trailing space) is `True` against the
module, because the implementation reads `): number {` — a control that cannot discriminate.

**Remedy — ADVISORY, and half of it is already discharged.** This is a finding against the
**reviewer role**, not the author. My r2 kit takes the lane from `$1`/`argv[1]`, its README carries
the expected strings, and every checker ships with a discriminator that comes out `False`. The
standing rule worth adopting: *a file promoted to `probes/` may not contain a literal path under
`.worktrees/`* — one grep at promotion time.

---

## 5. Packet findings (`heartbeat-reviewer` §1)

**P1 — a BINDING remedy lost a member between the verdict and the packet that implements it.**
The round-1 B1 remedy ordered `ADR-0022` §Decision **and** `PLAN.md` §Cluster S02-C1's S02-S01
corrected. `CODE-S02-C1C2-REWORK-R1.md` §1 orders only the ADR; `PLAN.md` is not in `allowed` and
no ticket was named. The author flagged the gap correctly (their §8) and stopped, as they must.
Neither packet looked at `S02/DECISIONS.md:101` at all. Consequence measured in N6.
**Remedy — BINDING (measured: the N6 grep table).** *A rework packet lists every artifact the
verdict's remedy names and, for each, either puts it in `allowed` or names the ticket that carries
it; a remedy member with neither is a packet defect.* Owner: orchestrator.

**P2 — my own packet's kit instruction is unsatisfiable as written.** §4: *"copy only the vitest
config into your worktree's `.review-scratch/`"*. The config's `include` globs
`.review-scratch/**/*.probe.tsx`, so the three probes must be copied there too (renamed), and they
must sit exactly one level under the package root because they import `../apps/ui/…`. Same class
as the author's F5 from the other side. ADVISORY; ~4 min.

**P3 — an acceptance COUNT stated over a GLOB.** §4: the kit *"must print `Tests 29 passed (29)`"*.
True only while no other `*.probe.tsx` sits in `.review-scratch/`. The moment I added my own
probes the kit printed `31`, and the RED reproduction printed `2 failed | 29 passed (31)`. Nothing
was broken; the constant simply is not a property of the kit. ADVISORY. **Remedy:** name the three
files in `include`, or keep reviewer probes in a sibling directory. I recorded the workaround in my
kit README so the next seat does not lose the time.

---

## 6. What I did NOT verify — so the next lens knows the gaps

- **The browser half of N1.** jsdom's `focus()` lands on `[hidden]`, `display:none`,
  `visibility:hidden`, `inert` and `disabled + tabindex="0"` (measured, §4/N5), so no jsdom probe
  discriminates the visibility members. UNVERIFIED; V or the Grok element gate.
- **Whether a real browser delivers `Escape` / `Tab` to `document` at all** in the dev stack.
  `PLAN.md`'s refutation table hands this to V (steps 7 and 14). UNVERIFIED here.
- **N7's persistent reachability.** I measured the mechanism and the ref-idiom matrix; I could not
  build a consumer that holds the bad state, because C5/C6 and S01's card do not exist at
  `06ab1da4`.
- **Clusters C3–C9 of S02, and all of S01.** `PrivacyPolicyModal.tsx`, `SignUpFlow.tsx`,
  `globals.css` and the CSS/style contract are not in this commit.
- **The merged S01+S02 tree.** B1's consumer-side consequence is measured on the r1 kit's faithful
  reproduction of S01's documented shape, not on S01's code.
- **C2 (`privacyPolicy.ts`) beyond re-running its suite** (`Tests 6 passed (6)`, ×3). The commit does
  not touch it; the r1 verdict's codepoint-level copy diff (0 mismatches) stands and I did not
  re-derive it.
- **The ADR's business claims** (retention periods, subprocessor URL, controller entity) — declared
  UNVERIFIED-by-design in the SPEC.
- **Anything visual, in either mode.** No CSS in these clusters.
- **`t9-mode-tokens`'s two pre-existing failures** — inherited from BASELINE, not investigated.
- **The author's transcript.** I checked their `SKILLS LOADED` line against the floor and against
  the behaviour of the handoff; I cannot grep a session I was not in.

---

## 7. S1 — a finding against MYSELF, filed before my verdict rather than after

**I destroyed the round-1 lens's self-report.** My `allowed` list says
`agent-reports/CODE-REV-S02-C1C2.md`, **"append Part II"**; I called `Write` on that path instead
of reading and appending. `.hermes/reports/` is untracked (`??`), the machine's only APFS local
snapshots are `com.apple.os.update-*` and predate today, and no copy exists in the repo or in
`/private/tmp/claude-501`. **It is not recoverable.** That a Part I existed is proved by the r1
lens's `REVIEW COMPLETE` comment on `t_0b1a0110`, which names that exact path as its filed
self-report. The file now opens with a dated notice recording the loss and pointing at every
round-1 artefact that survives; I raised it on `t_d2cce8be` at the time, not at handoff.

**CLASS, because it will recur:** two seats of the same NAME in different rounds share one
self-report path; `Write` on an existing file is silent and irreversible; the only guard is one
word in a packet. Live right now for `CODE-S02-C1C2` (Part I + Part II in one file) and for every
`-REWORK-R<n>` seat in this mission.
**Remedy — BINDING (measured: the loss).** Either (a) one file per seat-round,
`agent-reports/<SEAT>-r<n>.md`, concatenated at mission close; or (b) the orchestrator writes
`snapshots/agent-reports/<SEAT>.md.pre-r<n>` at dispatch — exactly what COMMON §10.26 already
mandates for artifacts a rework packet may change and §10.32 for packets. A self-report is
neither today. Owner: orchestrator.

---

## 8. Tickets the orchestrator must route (`heartbeat-reviewer` §3)

| id | tier | Where the fix lands | Remedy tier |
|---|---|---|---|
| N5 | non-blocking | one `<fieldset disabled>` case in `consent-modal-semantics.test.tsx`; correct `TOOLING-TRAPS.md:1602-1617` and the `CODE-S02-C1C2.md` dead-end | **BINDING (measured: W1 + W2 RED/GREEN)** |
| N6 | non-blocking | `modalSemantics.ts:29` (author's file) · `S02/DECISIONS.md:101` append (ARCH/orchestrator) · `S02/PLAN.md:175-181` | **BINDING** for the module line; ADVISORY for the docs |
| N7 | non-blocking | `modalSemantics.ts:96-110` — `isConnected` in the guard; decide before C5/C6 and before `A11Y-OVERLAYS` (`t_8962842f`) | ADVISORY |
| N8 | non-blocking | `probes/code-rev-s02-c1c2-r1-{cluster.sh,surface-check.py}`; a promotion-time grep for `\.worktrees/` | ADVISORY (lane half discharged in my r2 kit) |
| P1 | packet | rework-packet construction rule; and route N6's DECISIONS/PLAN members now | **BINDING (measured: the N6 grep table)** |
| P2 | packet | re-review packet wording for a kit re-run | ADVISORY |
| P3 | packet | acceptance counts over globs | ADVISORY |
| S1 | process | self-report path collision across rounds — **mine** | **BINDING (measured: the loss)** |

The author's F1 (disclosed extra case), F3 (overlap), F4 (the r1 verdict's wrong `:687` citation — at
`91877847`, where the r1 lens measured, the file was 323 lines and the asserted line was `:257`;
I re-measured both), F6 and F7 are all confirmed as fairly reported.
**F1 is explicitly NOT a finding:** `CONTAINED_BY || FOLLOWING` is the round-1 verdict's own
prescribed remedy, quoted verbatim; charging an author for implementing a BINDING remedy as written
would be the worst finding this mission could produce. If the mission ever wants "most recently
opened wins" for two unrelated siblings, that is a SPEC change, and the author was right to flag it
rather than decide it.

---

## 9. Predictions (blind-lens falsifiability)

I expect any other lens on this commit to **PASS it**, and to pass it on the same four checks I
ran first: the kit goes green, the cluster count rose from 10 to 17, the exported surface is
byte-identical, and the standing gates sit on BASELINE. Those four are decisive and they all hold.

**What I expect another lens to MISS is N5**, and to miss it for a specific, respectable reason:
the author disclosed the overlap themselves, in the handoff *and* in TOOLING-TRAPS *and* in their
dead-ends, with a measured table attached. A disclosed gap with a measurement beside it reads as
closed. It is only reachable by distrusting the *universal* in a table of six samples and running
an eleven-shape sweep of your own — and the sweep's one hit (`<fieldset disabled>`) is an element
nobody in this mission has written, because no SPEC or design extract mentions `fieldset`
(`grep -rn fieldset docs/missions/consent-ui/` → 0). I would check the negative universal first if
I were arguing against myself.

**Second prediction:** if another lens raises a stack finding, it will be about the **out-of-DOM-order
sibling rule** (F1) — it is visible from reading the diff, it is an unforced semantic choice, and it
is pinned by a brand-new test. That is the trap: it is the round-1 verdict's own prescribed code. A
lens that files it has not re-read the remedy it is enforcing.

**Third:** I expect no other lens to have measured **React 19's ref-cleanup idiom** (N7's `W3b`),
which is what separates "the detached branch is unreachable" from "unreachable for two of three ref
idioms". If a lens argues N7 away, that matrix is the reply — and if a lens files N7 as *blocking*,
the reply is that no current consumer uses the third idiom.

---

`comments read through: t_eab0c89f = 5` (the author's CLAIM, HEARTBEAT and READY FOR PEER REVIEW;
the round-1 lens's verdict comment; the `REWORK READY FOR REVIEW` I am answering).
`t_d2cce8be = 2` (my own CLAIM and my HEARTBEAT/incident report; no other comment has existed on it).
Also read, as evidence and not as instruction: `t_0b1a0110` (3), `t_c16d9fe5` (0 comments; body
read), `t_4f97ca86` (body read).
