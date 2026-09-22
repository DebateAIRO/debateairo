# TREL2 SELF-REPORT — case file

Seat: Opus 5, session `opus-trel-w1` (same seat that built TREL). Lane worktree
`.worktrees/lane-trel2` on `lane/trel2`, base `3409852`. Round 1, no rework.

---

## r1

## 1. The probe budget was the whole design problem, and it cost one call

The packet grants 3 live success probes. I spent **1**. That was not luck — it
came from noticing that the CLI's failure mode is *free*: `Not logged in` is
emitted before any model call (`is_error: true`, `total_cost_usd: 0`,
`modelUsage: {}`). So the question "which setting source carries the login?" can
be answered mostly with **failures**, which cost nothing.

The sequence that did it:

| # | Vector | Outcome | Cost |
|---|---|---|---|
| 1 | `--setting-sources ""` alone | Not logged in | free |
| 2 | `""` in the **full production vector** | Not logged in | free |
| 3 | `user` in the full vector | pong, one model key | **$0.032 — the one success** |
| 4 | `project,local` in the full vector | Not logged in | free |

Probe 4 is the one worth copying. It proves **necessity** — every source
*except* `user` still fails — and it is free, because it fails. A seat that only
ran probes 2 and 3 would know `user` *works* but not that it is *minimal*, and
would have no evidence against someone later "fixing" it to
`user,project,local`. **Design probe sets so the expensive direction is asked
once and the cheap direction carries the rest of the argument.**

**Near-miss:** my first instinct was to test the flag in isolation (probe 1).
That would have been a weaker basis for a production change — flag interactions
are real, and the relay passes seven other flags. Switching to the full
production vector for probes 2–4 cost nothing and makes the evidence directly
transferable to the code. **Probe the vector you ship, not the flag you're
thinking about.**

## 2. What I got wrong, and it is the same class as TREL rounds 2 and 3

I enumerated every **construction** site of the argument vector — all three
makers, `buildArguments`, `authEnvironmentKeys`, the child-env allowlist. That
enumeration was good and it is what let me clear grok and codex quickly.

**I did not enumerate the ASSERTION sites.** `acceptance/adversarial-corpus.test.ts:524`
pinned the same argument vector a second time, and I found it only when the zone
run went red with `CLAUDE-ARGV-01`.

This is the third time in two lanes that "I fixed the instance I was looking at"
has cost me a cycle. TREL r2 and r3 were the same shape. The packet even told me
to "enumerate-the-class first" — and I read that as *source* sites, because
that's where the defect was. **A constant that appears in production code
appears in tests too, and the tests are part of the class.** The grep that would
have caught it is the one I eventually ran: `grep -rn -- '"--setting-sources"'`
across `acceptance/ apps/ packages/ tests/`, five seconds, five hits, exactly one
of them unfixed.

**PRICE:** one zone run (~2.5 min × 3) plus the diagnosis. Cheap this time only
because the zone run is fast; in a lane gated on the full suite it would have
been a rework round.

**CURE for the contract:** when a change alters a value that production code
*emits*, enumerate every site that *asserts* it before running anything. Two
greps, not one: constructors and assertions.

## 3. The trade-off was already written down, three missions ago

I was about to reason the trade-off out from first principles. Then the same
enumeration grep hit
`docs/missions/2026-08-17-accounts-privacy-security/research/S5-llm-isolation.md:32`:

> **No `--setting-sources`** on the claude relay: user-scope settings/memory
> still load. Currently benign (`~/.claude/settings.json` has no `hooks`; no
> `~/.claude/CLAUDE.md`), but a future user-level hook would execute inside the
> relay child.

That is the *exact* risk `""` was introduced to close, written by the seat that
introduced it, with the mitigating facts already measured. My trade-off
paragraph is far stronger for quoting it than for re-deriving it — and I can
state what re-admitting `user` costs in the original author's own terms.

**Lesson worth generalising:** when reverting or narrowing a hardening measure,
find the artifact that *introduced* it before writing the justification. The
security research directory is not decoration; it is the record of what a flag
was for. I found it by accident, in a grep whose output I nearly discarded as
"mostly docs".

## 4. Verification that actually discriminated

Four mutants, and two of them earned their place:

- **MB (over-grant to `user,project,local`)** is the one I would not have
  written a round ago. It is killed by `keeps project and local settings out of
  the relayed call` — a test that is **green on the base and green after the
  fix**, and whose only job is to fail if someone widens the grant. Without it,
  "narrowest" is a claim in a report; with it, "narrowest" is enforced. **When a
  packet's deliverable is a *narrowness* argument, the argument needs a test that
  fails on over-granting, not just one that passes on the chosen value.**
- **MC (preflight drifts to hand-written args)** is killed by *only* the parity
  test, which is what proves the parity test measures drift rather than
  restating the implementation.
- MA is the straightforward revert; MN (handshake wording) is the neighbour and
  is correctly not caught.

## 5. F26 turned out to be a deletion, not an addition

The instinct was to *build* a preflight tool. The right answer was to notice
that `invokeCli` already resolves the binary, builds the arguments through the
adapter and builds the child environment — so the relay's own startup handshake
**is** the preflight. F26's cure is therefore to give that step a name
(`preflightClaudeCli`) and have `startClaudeRelay` call it, so there is exactly
one code path and drift is structurally impossible rather than merely
discouraged.

Three divergences died in one four-line extraction. **When a parity finding says
"X must match Y", check whether Y can simply *be* X before writing code that
keeps them in sync.**

## 6. What should change in the harness

- **Grant the trade-off deliverable a source requirement.** "Say what the flag
  protected" should mean "cite the artifact that introduced it," which turns a
  paragraph of reasoning into a paragraph of evidence. It cost me one grep.
- **Probe budgets should be spent on necessity, not just sufficiency.** Worth
  one line in any packet that authorises live calls: *the cheapest probe is the
  one you expect to fail.*
- **The enumeration rule needs its second half written down** (§2).
- **Keep `--tools ""`, `--strict-mcp-config`, `--no-session-persistence`
  independent of the settings question.** They are the flags actually doing the
  isolation work, and because they are separate, re-admitting the user source
  costs far less than it would in a design where one flag carried everything.
  That was someone else's good decision and it is why this fix could be narrow.

## 7. Ledger

One round, one live probe ($0.032), three files, +162/−9. Two blocking findings
cleared (F25 auth, F26 parity), one self-inflicted regression caught by my own
zone run and fixed before handoff, two pre-existing failures re-proven on this
base rather than inherited from TREL's.

---

## r2 — rework round 1 (codex review r1)

## 8. I called a hazard "latent" without checking whether it had already fired

This is the finding, and it is not subtle. My r1 trade-off said the user-memory
risk was "latent, not active" and that the old research's mitigating facts
"still hold on this host." **One `stat` would have refuted that.**
`/Users/stefan.nour/.claude/CLAUDE.md` exists — 913 bytes — so the moment I
selected `--setting-sources user`, that file's text began entering every relayed
call. The reviewer checked it in one command; I asserted the opposite in a
deliverable paragraph.

**CAUSE, precisely.** I inherited the *conclusion* of the 2026-08-17 security
research ("currently benign: no `~/.claude/CLAUDE.md`") and reused it as a
*present-tense fact*. That research was correct **when it was written**. Host
state is not a constant, and a security finding's mitigating conditions are
exactly the part most likely to have expired. I even quoted the sentence
containing the condition — and did not test the condition.

**PRICE:** one rework round, and worse, a report that stated a false host fact
with confidence in the section the packet designated as its main deliverable.

**CURE, general:** *quoted evidence dated earlier than today is a hypothesis
about the present.* When reusing a prior finding's "currently benign" clause,
re-measure the clause, not the conclusion. For file-existence claims that is one
`stat`. I now think any trade-off paragraph asserting "X does not exist / is not
configured" should be required to carry the command that checked it, the way
suite counts carry their log path.

## 9. The probe I refused to spend was the one that mattered

In r1 I rejected `--safe-mode` **without a probe**, and wrote the reasoning out:
it was "a coarser, whole-mode switch whose scope is defined by the CLI's
changing notion of 'customization'." That reasoning is not wrong in the
abstract. It was simply not evidence, and I had two paid probes sitting unused.

I optimised for *spending less* when the packet's constraint was *spend at most
three*. Underspending a budget is not a virtue when the unspent probe is the one
that discriminates between two candidate designs. The result: I shipped the
weaker of the two options and reported the stronger one as considered-and-
rejected, which is the most expensive possible way to be wrong — it looks like
diligence.

**What the probe actually cost:** $0.017, and it was *cheaper* than the config it
replaced ($0.0324), because it puts less in the context window.

**CURE:** when a packet grants a budget for discrimination, an unspent probe at
handoff needs a justification at least as strong as a spent one. "I reasoned it
out" is not that justification when the probe is available and cheap.

## 10. What went right, and is worth copying

- **The A/B design got two answers from two probes.** Same prompt, one flag
  differing: probe 5 proved the defect exists today (`YES`), probe 6 proved the
  fix removes it (`NO`) *and* that auth survives *and* gave a 2,706-token
  deterministic corroboration. Asking the model a **presence** question keeps the
  probe content-free by construction — I never learned or recorded what the
  user's CLAUDE.md says, only that it was or wasn't in context.
- **Token count as a second, non-self-report signal.** The model saying "NO"
  could in principle be wrong; a 50% context drop under an identical prompt could
  not. Two independent signals from one paid call.
- **Static and empirical agreed.** The binary sets
  `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` for safe-mode and its disable map carries
  `claudeMd:true, hooks:true`. I could *not* fully resolve the User-memory path
  statically in a 233 MB minified bundle, and said so rather than dressing a
  partial trace as proof — which is exactly why the probe was needed.
- **The enumeration lesson from r1 held.** Before changing the vector I grepped
  both `"--setting-sources"` and `"--strict-mcp-config"` across
  `acceptance/ apps/ packages/ tests/`, found both assertion sites up front, and
  updated them in the same commit. No zone-run surprise this round.

## 11. The combination the decision rule did not name

The rule offered "adopt safe-mode **in place of** `--setting-sources user`". I
kept **both**, because they are orthogonal and each is load-bearing:
`--setting-sources user` decides *which scopes load*, `--safe-mode` decides
*which customizations inside those scopes are honoured*. Safe-mode alone would
re-admit project and local **settings** (the CLI defaults to all three sources
when the flag is absent) — a strictly wider scope surface than today. Mutants MD
and MB prove neither flag is redundant: dropping either one is caught.

I flagged this as a deliberate reading of the rule rather than silently doing
something other than what was asked. **When a decision rule offers A-or-B and
the honest answer is A-and-B, say so in the report** — the rule was written
before the probe results existed, and the probes are what changed the shape of
the answer.

## 12. Ledger

Two rounds. Round 1: correct fix, false host claim, unspent budget. Round 2: the
budget spent, the claim corrected, strictly better isolation adopted at lower
per-call cost. Six probes total, three paid ($0.0816 all-in). Net: the relay now
authenticates *and* the recorded prompt is once again the complete model-visible
input — which is the property the ceremony's replay record depends on.
