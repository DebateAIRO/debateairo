# Self-report — lane/risk-signal-diagnostics, round 0, 2026-09-07

Seat: one Opus 5 worker, two tickets (F-RISK-IDENTITY-LOG, F-AUTH-RISK-POISONED-CATCH).
Wall clock: first recorded command 15:03:19 CEST (`02-sweep.log` header), handoff 15:24, about 25 minutes counting the reading before the sweep. One session, no rework round.
Tip `d1b29b5b610d621612a715ae2772fde7a32ee28b`. Both tickets green.

A case file. Causes, prices, dead ends — not a diary.

---

## The one that would have gotten past everybody

**Cause: I derived the assertion from the demo defect instead of from the instruction.**

The ticket's amendment says, in codex's words, that a general uppercase-message regex is *weaker*
than an explicit set of known reasons. I read it, agreed, built the explicit map — and then wrote
a corpus aimed at the defect I had *seen* (a driver's prose leaking) rather than at the mechanism
I had been *told* to prove. Every constant-shaped probe I invented was a long synthetic secret
because long felt more dangerous. A message-shape rule carries a length bound (`{2,63}`), so all
my long probes fell out of it and the rejected mechanism passed my suite 4/4.

Only §2's refutation duty caught it: build the mutant the assertion exists to catch, apply it,
watch it kill. It didn't kill. That is the whole value of that rule, and it is the second time
this corpus records the same lesson — the spine already says *"an assertion that pins the mutant
you were shown is not a pin of the property."* I was shown "message leaks"; the property was
"only an explicit map decides."

Price: one extra commit and a re-take of five gate records, roughly eight minutes. Cheap only
because the mutant ran. Had I stopped at green, I would have shipped a test that passes against
the exact implementation codex rejected, with a report claiming the map was pinned.

**Upgrade, and it is a packet-shaped one.** When a ticket amendment says *mechanism X is weaker
than mechanism Y*, the packet should say: **"your test must fail if the implementation is X."**
That is one sentence, it converts a rationale into a gate, and it is checkable by a reviewer
without reading the test. My packet gave me the rationale and left me to invent the gate. I got
there, but by luck of process rather than by instruction.

## The RED that proved nothing

**Cause: for a "make hidden information visible" ticket, the obvious RED order is the wrong one.**

I wrote the category test first, ran it, and got three red tests saying
`authenticationRiskSignalPoisonCategory is not a function`. Red, three failures, a real
transcript — and completely worthless: it proves a symbol is missing, not that decrypt and parse
are collapsed. A reviewer holding that transcript beside my fix cannot tell whether I changed
behaviour or only added a name.

The fix is an ordering rule: land the **read side** first — the pure inspector that returns
`null` when the information is absent — and take the RED against that. The frame then reads
`expected null to be 'context-decrypt'`, which is the defect stated by the runner. The read side
changes no behaviour, so it is not a fix smuggled in ahead of its test.

Price: one extra capture, about four minutes. Filed as a tooling trap because the shape recurs —
every "surface the cause", "add a category", "expose the reason" ticket has this trap in it, and
this mission has now produced three such tickets in two days.

## What the packet got right, and it saved real time

Three things, worth copying verbatim into the next packet:

1. **THE FACTS section with file:line, marked "verify each before acting."** Every constant in it
   was true. `main.ts:64`, `auth-risk.ts:39` and `:212`, the two pinned identities, the "8
   inherited s14-ui lines" — all checked, all correct. Zero minutes lost to a wrong constant.
   That is not normal for this mission and it should be said.
2. **Naming the *outcome* and marking the mechanism as an example** (D58). "e.g.
   `apps/api/src/risk-signal-identity.ts`" let me take the module name offered and spend my
   thinking on the alphabet instead of on litigating a filename.
3. **"commit everything of the round BEFORE taking gate records" as a numbered step** (D64
   ADDENDUM 5). I followed it, and then broke it anyway by finding a test defect *after* the
   first gate sweep — which is the case the rule does not cover. See below.

## Where the packet was unclear, exactly

- **`packages/db/src/auth-risk.ts (the poisoned helper and the catch at :212; nothing else)`.**
  Changing the helper's signature mechanically forces its three other call sites in the same
  file. Is that "nothing else"? I read it narrowly, used a default parameter to keep the diff
  inside the parenthetical, and flagged the trade-off for the reviewer — but I spent real thought
  on it. **A contract that scopes by *construct* ("the helper") should say what happens to that
  construct's callers.** One clause: *"call-site updates forced by an allowed signature change
  are in scope."*
- **The contract allows a new export from `auth-risk.ts` but holds `packages/db/src/index.ts`
  readonly**, and that file re-exports by explicit named list. So the new symbol is unreachable
  through `@debateai/db` by construction. I used a direct source import, which is this suite's
  convention, but the packet did not anticipate the collision. **A contract that grants a file
  and forbids its barrel should say which import form the test is expected to use.**
- **"×3 each (passed/total)"** for four suites. I ran the four files together three times, which
  gives each suite three runs. If the intent was three *separate* invocations per file, that is
  twelve runs and I did four. It reads either way.

## The habit that cost the most tokens, and it is not a mistake

Reading. Before writing a line I read: the packet, the router, the worker contract, two board
tickets, the codex F2/F3 origin, `INSTRUCTIONS.md`, five DECISIONS entries, `TOOLING-TRAPS`,
`main.ts`, `auth-risk.ts`, three test files, four crypto classes, the pg driver's error class,
`vitest.config.ts`, and the four sibling formatters for the class sweep. That is the largest
single line item in this round's budget.

**It was correct and I would do it again** — the class sweep alone found six unfixed members that
no checklist would have named, and the `pg` `DatabaseError` name (`"error"`, not
`"DatabaseError"`) would have been an invented value if I had guessed it. But two of those reads
were avoidable and both are mechanisable:

- **The DECISIONS extraction cost two failed attempts** because my `awk` range pattern did not
  match the file's heading styles — some entries are `## D61 — …`, some `## 2026-09-03 · D58 — …`,
  and D64's addendum is a bold paragraph, not a heading at all. Three heading grammars in one
  append-only file. **A `tools/decision.sh <id>` that knows all three would pay for itself in a
  week**; every seat that cites a D-number does this grep.
- **`riskSignalFailureIdentity`'s consumer line numbers moved under me** (175/226 → 176/227)
  because I re-inserted a blank line after the extraction, and I nearly reported the pre-edit
  numbers from an earlier grep. Caught by re-reading at write time. The memory rule "unread values
  are invented" holds even when *you* wrote the value ten minutes ago — a line number is a
  measurement of the current file, not a fact you own.

## Toward the one-prompt machine

Four concrete moves, ordered by what they would have saved *this* round:

1. **Make the refutation duty a packet field, not a paragraph.** The packet already names three
   mutants and their expected verdicts — that is excellent and it is why A2 exists at all. Extend
   it one step: for any ticket whose amendment rejects a mechanism, name **the rejected mechanism
   as a required mutant**. My A2 was self-invented; it should have been assigned.
2. **Add a "commit → gate → *and if you then change anything, say so and re-take*" line.** D64
   ADDENDUM 5 tells you to commit before measuring. It does not cover the honest case where
   measuring *teaches you something* and you must go round again. I re-took five records and said
   so; a seat under pressure would have been tempted to keep the stale ones. Name the loop.
3. **`stamp-check.sh` should take a `--preserved` list.** It flagged six records, all six
   legitimately preserved (provisioning, sweep, three REDs, baseline), and exits 1. An
   exit-1-that-is-fine trains people to ignore exit codes. Let the seat declare the preserved set
   and let the tool exit 0 when the flagged set equals the declared set — then a nonzero exit
   means something again.
4. **Ship a `tools/class-sweep.sh`.** Every worker in this mission runs the same four greps by
   hand — "who else has this function shape", "who else has this catch shape", "who consumes this
   symbol", "who produces it" — and each of us reinvents the flags. Mine died once on `zsh`
   globbing `--include=*.ts`. A script that takes a shape and emits a member table with a blank
   verdict column would make §2.2 mechanical instead of conscientious.

## Dead ends, so nobody re-derives them

- **Exporting the poison-category constants through `@debateai/db` is not available** to a lane
  that holds `packages/db/src/index.ts` readonly. The barrel is an explicit named list. Direct
  source import is the only route; it is also the house convention (57 of the files under
  `tests/unit/` do it).
- **A test that asserts the output is a member of the module's own exported alphabet is nearly
  vacuous.** Widening the module's set widens the assertion with it. I considered exporting the
  frozen sets and checking membership, and rejected it: the alphabet must be written literally in
  the *test*, so growing it breaks the test. That is why the module exports one function and
  nothing else.
- **`tsc` accepts `let plaintext:Buffer;` assigned inside a `try` whose `catch` calls a
  `:never`-returning function declaration.** I expected a "used before assigned" error and had a
  helper-function restructure ready. Not needed — the simple form typechecks, 8 diagnostics
  unchanged. Do not pre-emptively restructure for this.
- **`mutate.sh` v3 handles multi-line OLD/NEW correctly**, including a nine-line block with
  braces, `$`, quotes and a comment. The B mutant restores the pre-fix catch verbatim in one
  transcript. No need to reduce a structural mutant to a single-token one.
