# Self-report — ARCH-PES-S03 · node ARCH(S03) pass 1 · ticket t_21a1edcf · 2026-09-24

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Wall clock 14:28:52 → 14:53:41 EEST, **25 minutes**, one pass, no rework, no blocker.
Transcript `subagents/agent-adbd71f6a2f5bad4c.jsonl`, 1.24 MB. 31 tool calls. Six suite runs
(~40 s each), one `pnpm typecheck` (~90 s). No git write, no product file, no listener, no key.

---

## 1. The finding that would have killed the slice, and what caused it

**R3.5 orders a test that enumerates refusal codes "out of the source". The source has no inventory
to enumerate.** It has *three* — `PROVIDER_CREDENTIAL_REFUSAL_CODES` (3 codes),
`PROVIDER_COST_ENVELOPE_REFUSAL_CODES` (4), `SUPPORT_MODEL_STARTUP_REFUSAL_CODES` (2) — and **six of
the twelve codes the class needs are in none of them**: three are bare `throw new TypeError`, two are
`TypedDomainError` arguments, one is a class field. SPEC §2 forbids touching `apps/` or `packages/`,
so a fourth inventory cannot be created.

**CAUSE:** the SPEC was written from ONE observed idiom — the frozen array the existing pin already
slices — and the word "constants" in R3.5 was carried over from it. That is TOOLING-TRAPS `:3088`
("a surface derived from ONE idiom misses the assertion the SPEC itself names"), recurring in a
*requirements* document five days after it was filed against a *packet*. The trap entry is about
write surfaces; nobody generalised it to read surfaces.

**PRICE if it had reached BUILD:** a coder reuses the existing pin's regex `/"([A-Z_]+)"/gu` by
habit. It yields **zero** for the price anchors, because those codes live in BACKTICK templates.
The pin then passes at base, passes after, and pins nothing — a green slice whose whole purpose was
to stop drift. Nothing downstream catches it: `REV(S03)` reads a passing suite. Estimated cost of
discovery at V's acceptance instead: one REV pass + one FIX node + one re-review ≈ **3 seats**.

**What I did instead:** wrote `probes/ARCH-PES-S03/enumeration.mjs` — the enumeration as a runnable
program, before writing a word of it into the plan. It prints each anchor's resolved `path:line`,
the codes it yields, the union, the absent set, and one line the reviewer can read on its own:
`CLOSES WITH SPEC R3.3's SIX? true`. The regex is proved on a known-hit fixture in the same run.
That file IS the plan's §1b; the BUILD seat transcribes a proved artifact rather than deriving one.

## 2. What I nearly got wrong

**I nearly reinterpreted a frozen requirement.** I had written the whole plan with C2's four
document cases in `tests/architecture/vps-deployment-baseline.test.ts` — the obvious home, where
the kit's README assertions already live. That makes it 35/35. Acceptance step 2 (`SPEC.md:128-132`)
requires that suite's reported pair to be **its base pair**, 31/31. My first move was to write a
`V-ROW: NEW` asking V to read "its base pair" as "base plus what this slice adds".

That is a quiet spec change wearing a V row as a hat. `heartbeat-architecture` §1 forbids it and I
had loaded the skill twenty minutes earlier. The fix was not a ruling, it was **a different file**:
put the four cases in `v9` (whose number step 2 does not pin), leave the kit suite byte-identical.
Step 2 then passes as frozen, R3.8's answer becomes a one-liner anyone can check
(`git diff -- tests/architecture/` prints nothing), and step 2's single command now runs **every**
case the slice adds. Cost of the catch: ~6 minutes of replanning and one re-run of the C2 base probe.
Cost of not catching it: a V row that should never have reached V, plus an acceptance V would have
run and failed.

**Generalisable rule, and it is the most valuable line in this report:** *before writing a V row that
asks V to re-read frozen text, spend one minute looking for the change of FILE, ORDER or NAME that
makes the text true as written.* Two of my three near-V-rows dissolved that way.

## 3. Dead ends — measured, so nobody re-derives them

1. **Scan the whole file for uppercase literals.** `packages/providers/src/index.ts` yields **59**
   tokens (`CLASSIFIER`, `PARSED`, `UNKNOWN`, the env-var name `PROVIDER_DISCOVERY_TARGETS_JSON`).
   A pin demanding all 59 appear in §11 fails forever for reasons S03 must not fix.
2. **Scan the `throw new TypeError` idiom only.** 15 codes, **8 absent from §11** — six more than
   R3.3 orders, so the pin could never go green inside the slice's scope. This one is dangerous
   because it *looks* principled.
3. **Add a fourth inventory constant to `packages/providers`.** The shape a reader expects; barred
   by SPEC §2 and measured by acceptance step 7.
4. **Run the two clusters in parallel on "disjoint regions".** They share `deploy/vps/README.md`,
   and C1's pin READS what C2 writes. TOOLING-TRAPS `:522` already says this; regions are not files.

## 4. Where THIS packet was unclear — exactly

- **`ARCH-S03.md:15`** lists the allowed paths but **not `PROGRESS.md`**, while SPEC R3.3, R3.5,
  R3.7 and R3.8 each require something "recorded in `PROGRESS.md`". The ARCH node cannot write it
  and the packet never says who does. I planned the BUILD seat as its author; if that is wrong,
  four requirements have no owner. **Smallest fix: one clause in the BUILD packet's `allowed`.**
- **`ARCH-S03.md:10`** pins the code surface to single lines — `packages/providers/src/index.ts:679,
  727-731, 740-744`. The enumeration's real surface needed `:192-198`, `:278`, `:687`, `:700`,
  `:934-946`, plus two files the packet never names (`packages/register/src/cost-envelope-policy.ts`,
  `apps/api/src/support/model.ts`). Same family as REQ-REV's N2 and TOOLING-TRAPS `:3129`: **a range
  cut by line arithmetic stops before the thing it was cut to show.** I read past the packet's ranges
  and say so here rather than planning blind. **Fix: when a packet cites a constant, cite the
  `git grep -n` that FINDS it, not a line number that a later commit moves.**
- **`ARCH-S03.md:26`** says "record the verdict per command in PLAN.md §3" but the scaffold's §3
  table has no verdict column. I added one. A scaffold and a packet that disagree about a table's
  shape cost one decision each time.

## 5. Upgrades, ranked by tokens saved

1. **Ship `enumeration.mjs` as a repo script, not a probe.** Any node that must assert "the docs name
   every code the code emits" re-derives this from scratch today. As
   `scripts/refusal-code-sweep.mjs` taking an anchor list, it is a one-line cluster command forever.
   *Saves: the 8 exploratory greps I ran (~15k tokens) on every future slice that touches §11, and
   it is the only mechanical defence against the backtick-regex failure.*
2. **Put a `## Read surfaces` block in every ARCH packet, beside `inputs`.** Inputs are cited as
   single lines because a human wrote them from a previous seat's prose. An ARCH node needs the
   `git grep` that enumerates a class, not the line where one member sits. *Saves the read-past-the-
   packet decision, which costs a paragraph of justification in every handoff and is the thing a
   blind reviewer most often mistakes for a contract breach.*
3. **Make "prove the negative assertion can fail" a packet charge, not a trap entry.**
   TOOLING-TRAPS `:329` has been filed since 2026-08-29 and is still a thing seats remember or do
   not. My START frame proves acceptance step 7's empty output is not vacuous (the same pathspec
   prints 258 files over a moved range) — that took 4 lines of shell. A charge makes it universal.
4. **Give the scaffold the columns the packet asks for.** REQ writes `PLAN.md`'s skeleton, the ARCH
   packet lists what must appear in it, and they drifted on one column. Generate the scaffold FROM
   the packet's charge list.
5. **State the `PROGRESS.md` author in `INSTRUCTIONS.md` once**, since four requirements across one
   slice point at it and no packet owns it.

## 6. Toward the one-prompt machine

The single highest-leverage change this pass suggests: **a planning node's deliverable should include
a runnable artifact, not only prose.** The plan's strongest section is §1b, and it is strong for one
reason — it was executed before it was written, so its central claim
(`CLOSES WITH SPEC R3.3's SIX? true`) is a measurement a reviewer re-runs in 3 seconds rather than a
sentence they must evaluate. Every gate I could make runnable, I ran; the one step I could not
(C1-3, the guard-order sentence) says so in the plan instead of dressing a judgement as a criterion.

Concretely: add to the ARCH contract — *any enumeration, count or set a later step will use as an
oracle is delivered as a script under the seat's probes directory, run at base, with its output
quoted in the PLAN.* That converts the most expensive review question ("is this list right?") into a
command. It is also what made this pass 25 minutes instead of a rework round.
