# Self-report — CODE-REV-S02-C5C6 (Claude Opus 5, reviewer, mission `consent-ui`, round 1, blind)

**Target:** `t_22f0434b` / CODE-S02-C5C6 — `279d9577` (C1 follow-up) · `da1e1fa6` (S02-C5) · `3d207a48` (S02-C6),
base `68f3ea33`, branch `slice/consent-s02-modal`.
**Worktree:** `.worktrees/rev-s02-c5c6/dialectical-engine`, detached at `3d207a48`, porcelain 0 at start and at exit.
**Verdict:** PASS with 7 non-blocking findings, all ticketed in the verdict.

The question this file answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade.
> what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a
> one prompt machine even better.

---

## 1. The body on the floor: my own first probe was green for the wrong reason, in the same way the author's was

My render/behaviour probe drove the scroll metrics with `Object.defineProperty(element, …)` **after** mount.
Three cases failed on their *precondition* (`expected false to be true` on "starts disabled"), not on the property
under test. Root cause, measured not guessed: jsdom's own `scrollTop`/`clientHeight`/`scrollHeight` are all `0`,
and `0 + 0 >= 0 - 8` is **true**, so the gate latches during the mount evaluation and no later `scroll` can
re-close it. The element does not exist before React renders it, so a per-element definition is structurally too
late.

That is exactly the author's D2, reached independently, from the failing direction. **Price: one probe rewrite,
~6 minutes, ~1 vitest cycle.** I then deliberately used a *different* restore route from theirs — redefine on
`Element.prototype` where jsdom actually declares the accessors and restore the **saved original descriptors** —
so the two measurements are independent rather than a rehearsal of the author's.

**What I nearly got wrong, and it is the more dangerous half:** if my three cases had happened to assert only the
*enabled* direction, they would all have passed at mount for free and I would have signed off a gate I never
exercised. The generic lesson: **a probe whose "before" state is the environment's default state is not a probe.**
Every gate case must assert a *negative control* whose expected value differs from the environment's zero value.

## 2. Two of my own mutants were no-ops, and the harness told me only because I made it fail loudly

- `MR10` renamed the `TITLE_ID` **constant** — used for both `id=` and `aria-labelledby=`, so the reference still
  resolved. SURVIVED, and it meant nothing.
- `MR13` *inserted* a second end marker instead of *moving* the real one, so the last child was still the marker.
  SURVIVED, and it meant nothing.

Both were my errors, both re-ran correctly as `MR10b` / `MR13b` and were CAUGHT. **Price: 2 wasted cluster runs,
~4 minutes.** What saved the rest: `mutate.py` refuses to write unless the anchor string occurs **exactly once**,
so a mutant can never be a silent no-op. **Upgrade for the fleet: make "the mutant must change observable
behaviour" a checked property, not a hope** — the cheap version is to assert the mutated file's md5 differs AND
that a one-line "the mutant is reachable" smoke assertion goes red. A SURVIVED verdict from an unreachable mutant
is worse than no mutant, because it reads as coverage evidence.

## 3. What repeatedly cost tokens

### 3.1 The tool shell is zsh and the fleet's idioms are bash — measured cost, three retries
`[ "$n" != "0" ]` inside a `for` over a list containing `{:` produced `bad math expression` and printed 29 false
positives ("ALREADY in globals.css") before I noticed the errors interleaved with the output. `git diff -- <path>`
silently matched nothing twice, because this repo's git root is one level **above** the `package.json` directory
and a relative pathspec is resolved against `cwd`, not against the repo root. **Price: ~5 tool calls.**
**Upgrade:** COMMON §3 already says the git root is one level up; it should also say, in the same sentence,
*"so every `git … -- <path>` from `dialectical-engine/` takes a path relative to `dialectical-engine/`, and every
`git diff` line you paste carries the `dialectical-engine/` prefix — the two are not the same string."* And every
counting loop belongs in a `.sh` under `/bin/bash` (§10.16/§10.21 already say it for greps that COUNT; my loop was
one, and I ran it inline first anyway).

### 3.2 Mission docs are in the main tree, but `.hermes/TOOLING-TRAPS.md` is in BOTH — with 948 lines missing in the lane
COMMON §10.36 says `docs/missions/**` and `.hermes/**` "are untracked and do not exist inside a detached worktree".
Half true, and the false half is the dangerous one: `docs/missions/consent-ui/` genuinely does not exist in my
worktree, but `.hermes/TOOLING-TRAPS.md` **does** — it is tracked (936 tracked entries under `.hermes`), and the
lane's copy is the last *committed* version: **1034 lines against the main tree's 1982, a strict prefix**. A seat
that reads it relatively gets a plausible, stale file instead of a missing-file error. This is N5 in the verdict.

### 3.3 The review package is excellent and I still had to read the files
The 1181-line `-U10` package answered "what changed" in ONE read — that part of the harness works and should not
change. But every *line number* I needed for a finding (`:255`, `:118/:122`, `:147`, `:29`) had to be re-derived
from the checked-out file, because a diff's line numbers are the diff's. **Upgrade, cheap:** the package generator
appends a `## Anchors` section — `grep -n` output for the classes, listeners and ids the packet's charges name, at
HEAD. The orchestrator already computes those numbers to write the charges; emitting them costs nothing and saves
every reviewer the same three greps.

## 4. Dead ends, so nobody re-derives them

1. **`Object.defineProperty(el, …)` after mount cannot drive the scroll gate.** §1. Do not try again.
2. **A "conformance shim" for `compareDocumentPosition` keyed on a lazily-assigned creation tag does not work.**
   My first shim assigned the tag on first *query*, so `held.cDP(other)` always made the incumbent the "earlier"
   node and the mutant survived anyway. The shim must decide direction from a property that exists **before** the
   comparison — I used `isConnected` (a disconnected node sorts after a connected one, consistently both ways).
   Once keyed that way, MN7b is caught. **Price: one full probe cycle, ~8 minutes.**
3. **Deleting the component's type-pin block with a single regex leaves dangling `Expect<`/`Exact<` references**
   and produces 2 diagnostics that look like the mutant being caught. The control must delete the whole block
   (lines 35–45) and be re-run **unmutated** first to prove the baseline is `exit=0, 0 diagnostics`. I nearly
   reported "the pin does not discriminate" off that bad control. **This is the single most dangerous near-miss of
   my session:** a broken control inverts a finding.
4. **`grep -c 'worktrees'` over your own probe kit will hit your own comment about not hard-coding worktree paths.**
   Trivial, but it cost a re-run of the §10.35 check.

## 5. What we must upgrade (ranked by expected saving)

### 5.1 A "the ruling and the code disagree" detector, because prose drifted from mechanism for a whole round
The orchestrator ruling on `t_eab0c89f` says the Esc stack resolves unrelated siblings by **most recently opened**.
The shipped code resolves them by **document order**. Nobody noticed for two rounds because both phrasings are
true of the *one arrangement anyone tested*. I found an arrangement where they give **opposite** answers in one
15-line probe. **Upgrade:** when a ruling states a RULE, the packet that consumes it carries a two-case table —
one case where the rule's two candidate readings agree, one where they disagree — and the seat runs both. A rule
with no disagreeing case is not a rule, it is a description of a single example.

### 5.2 "Unpinnable in this environment" must be a measured claim about a NAMED mechanism, not about the environment
The author declared MN7b unpinnable and TOOLING-TRAPS now records it that way. It is unpinnable **against jsdom's
default `compareDocumentPosition`**; it is perfectly pinnable with a 12-line spec-conformant shim of that one
method, and my probe goes GREEN with the clause and RED without it. The pattern to institutionalise: *before
writing "unpinnable", name the single environment behaviour that blocks the pin and ask whether that behaviour can
be shimmed.* The answer is usually yes, and the cost is one function. **This is the highest-leverage line in this
report:** "unpinnable" entries in shared memory turn into permanent coverage holes, and one of them already shipped
a defensive clause with no gate.

### 5.3 Class lists a downstream cluster must consume should be MACHINE-derived in the handoff
The author's F2 list of 29 class names is complete — I re-derived it from the component with one `grep -oE` and it
matched member for member. That is a good outcome that depended on the author being careful. **Make it a command:**
the handoff pastes `grep -oE 'className="[^"]+"' <file> | … | sort -u` and its output, so C8's packet can be built
by copy, and so a reviewer verifies it by re-running one line instead of diffing two prose lists.

### 5.4 Standing gates should be measured ONCE per head and cached, not per cluster per seat
I ran `pnpm typecheck`, the `apps/ui` project typecheck, `t9-mode-tokens`, `auth-flow-integration` and
`v2ui-node-runner` at exactly the same commit the author had already run them at, and got byte-identical figures.
That is the point of a blind lens for the *cluster* commands — but for the four **standing** gates it is pure
duplication: they are properties of the head, not of the review. **Upgrade:** the orchestrator publishes a signed
`gates/<sha>.txt` when it cuts the review package; the reviewer re-runs **one** of the four at random as a spot
check and asserts the file. **Saving: ~4 minutes and ~5 tool calls per review seat, every seat, every round.**

### 5.5 `PASS` needs a machine-checkable exit contract
My exit obligations were: probe kit copied **before** the verdict comment, self-report **before** the verdict
comment, `git status --porcelain` empty, one comment on each of two tickets. Four ordered steps, all enforced by
my own care. **Upgrade:** `hermes kanban ... comment <ticket> --marker VERDICT` refuses to post unless
`probes/<seat>-r<n>-*` is non-empty and `agent-reports/<seat>-r<n>.md` exists. The rule already exists in three
packets; making it a gate costs one `if` and removes a whole class of "the seat meant to".

## 6. How to make this more of a one-prompt machine

1. **The single best thing in this packet was §4** — every charge phrased as *"the author claims X; measure it"*,
   with the author's own numbers inline. I never had to guess what "verified" meant. **Keep this exactly.**
2. **The charge that produced the most value per token was F3** ("say what each rule does for the one stack the
   product will actually build"). It is a *scenario* charge, not a *property* charge, and it found the one thing
   that will bite S01-C6. **More scenario charges, fewer property charges** — the properties are already pinned by
   the author's own suite, which the cluster command re-runs for free.
3. **What the packet made me re-derive:** whether `.hermes/TOOLING-TRAPS.md` is readable from the lane (§10.36 says
   no, reality says yes-but-stale); the SPEC's accent-token table and pill→section table, which I parsed out of
   `SPEC.md` with two regexes so my assertions could not be satisfied by the component's own constants — worth
   doing, but the regexes are now in the promoted kit and the next seat should not write them a third time.
4. **One line that would have saved me a cycle:** the packet's list of charges should mark which are *confirmations*
   (re-measure the author's number) and which are *rulings* (produce a judgement). I treated F2/F3/F4 as
   confirmations first and had to go back and build the judgement apparatus.

## 7. Ledger of this seat's own errors

| # | Error | Caught by | Price |
|---|---|---|---|
| 1 | Drove the scroll metrics after mount; three cases failed on their precondition | my own run | ~6 min, 1 rewrite |
| 2 | `MR10`/`MR13` were no-op mutants | the SURVIVED verdicts looked wrong for the property | ~4 min, 2 runs |
| 3 | First `compareDocumentPosition` shim keyed on lazy first-query order | the mutant survived with the shim in place | ~8 min, 1 cycle |
| 4 | Deleted the type-pin block with a partial regex; read 2 syntax errors as "mutant caught" | re-ran the control unmutated | ~5 min — **would have inverted a finding** |
| 5 | Ran a counting loop inline in zsh with `{:` in the pattern | `bad math expression` noise | ~2 min |

**Skills:** `superpowers:using-superpowers`, `heartbeat-protocol`, `heartbeat-reviewer`,
`superpowers:verification-before-completion`, `superpowers:systematic-debugging`.
`superpowers:receiving-code-review` — **not loaded this session** (COMMON §10.9 form): no finding of mine has been
contested yet; I load it the moment the author refutes one.
