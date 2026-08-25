# HERMES CHANGES REQUESTED — S02, rework round 1 of 3

Router merge of the three blind lenses on `t_8e040ec2`. lens1 correctness
**GREEN** · lens3 product-truth **GREEN (gate PROVEN)** · lens2 security **RED**.
Route: same worker, same session, same worktree. `rework_round` increments once.

## No lens disagreement — they verified different things, and together they are precise

Lens 1 proved a **fifth parameter TYPE is unspellable**, mutation-testing both
doors: adding a fifth array member fires `TS2322`; adding a fifth declaration
variant while leaving the array untouched — the bypass it built specifically to
defeat that pin — fires `TS2366`, because the validator switch is exhaustive
with no `default`. That property is real and holds.

Lens 2 proved something different and compatible: **one of the four existing
types is not membership-closed.** The vocabulary is shut; the `id` member is
shape-validated only.

**The Router conflated these and posted a false claim** (13:44: "a type that
cannot be spelled, not a runtime check", presented as meaning no free text can
enter). Withdrawn. Both facts stand; only the inference was wrong.

## BLOCKING — S02-L2-F1: the `id` type is shape-only

`SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u` — a 65-character
alphabet over 128 positions. Live, it **admitted**: a session id, an asker id,
an IP address, a 64-char hex key, a 90-char JWT-shaped token, a 73-char
snake_case prose string, and
`the.user.said.her.password.is.hunter2.and.her.card.is.4111111111111111`.
That last one is the finding: free text wearing an id's clothes, and it would
be stored.

**What is true today, precisely:** nothing can leak, because all 285 templates
carry an **empty parameter list**. The wall is held by *absence*, not by the
`id` validator. And `SAFE_ID_PATTERN` is **S02's own authorship** — the
ratified document fixed the *vocabulary*, not the *validator*.

Required — all three, and they are small:

1. **Tighten the validator to plausible identifier shapes.** Ids in this system
   are structured (uuid, `sess_…`, `run_…`, numeric, registry codes), not free
   prose. At minimum reject: strings containing more than a small number of
   `.`-separated word segments, and lengths far beyond any real id. You may not
   close it to a membership set — ids are open by nature — so make the shape
   genuinely narrow and say what it admits.
2. **State the guarantee honestly wherever it appears** — in the registry's own
   doc comment and in the ticket evidence: three of four types are
   membership-closed; `id` is shape-validated; the OBS-R048/R103 property holds
   **at G0 by the empty parameter list**, not by the id type.
3. **Make the first `id` parameter a named security gate.** The re-pin that
   admits any `id` parameter must be flagged in the registry as requiring
   explicit review of what that parameter can carry — not routine bookkeeping.

If you conclude a genuinely safe `id` shape cannot be specified without a
policy decision (e.g. an enumerated set of id *kinds* with a pattern each),
STOP and post a blocker with your recommendation; the Router routes it to V.
Do not invent policy.

## NOT a defect — dispositioned by the Router, no action

**S02-L2-F2 (file attribution).** `package.json` and `pnpm-lock.yaml` are
**TP-10**, owned by S03a/L2 and V-authorized on `authority_epoch 1`; the lens
saw lane-cumulative state. Your test's bare specifier is now the *correct*
form, since product code must import by bare specifier and the linkage exists
deliberately. **No change.** The lens's substantive measurement — that with the
link in place `apps/api` resolves into the package and `zone-internal` becomes
reachable the moment S03b creates it, with no import gate in the repo — is
**upheld and routed to S05/D21** as a second required import-graph assertion
(outbound: no `apps/**` or `packages/**` file may import obs-capture's
`zone-internal`). Not yours.

## SHOULD-FIX (cheap, do them while you are in the file)

- **L2-LOW-1** `SafeTemplateId = \`tpl.${string}\`` is an open template-literal
  type over a stored text column. `\`tpl.${RegistryCode}\`` is a free tightening.
- **L2-LOW-2** duplicate declaration names yield a name both stored *and*
  reported dropped — pick one and be consistent.
- **L2-LOW-3** the `^OBS_` fence and cross-partition disjointness hold **by
  content, not by construction** — no dedupe, and a `new Map` last-wins would
  silently shadow. Make it structural if it costs little.
- **L1-R1** the drift test is non-blocking for drift but **blocking for
  environment** (needs the planning doc on disk, git, `29f370e` reachable, and
  `sh`; ~4.3s of a ~4.3s suite), which partly inverts its non-flaky purpose.
  Make its environment prerequisites skip-with-reason rather than fail.
- **L1-R2** the structural half of the injection wall has **no runtime
  assertion** (vitest strips types), so it rides entirely on `tsc`. Note this
  explicitly in the evidence; TBP T-2 requires zero diagnostics in your own
  touched paths, which is what actually enforces it.

## Held under attack — DO NOT churn (9 from lens 2, plus lens 1 and 3's set)

No coercion (`"5"` for `bounded_int` is dropped, not coerced) · undeclared keys
never copied · **no prototype pollution** (`Object.create(null)`; a `__proto__`
declaration lands as an own key) · inherited properties rejected via
`hasOwnProperty.call` · **no TOCTOU** (malicious getter read exactly once;
validated binding == stored binding) · `registry_code`/`closed_enum`/
`bounded_int` genuinely closed · 285 distinct codes, `^OBS_` fence holding both
ways · 285 injective `tpl.<code>` ids · only import in 608 lines is
`@debateai/kernel`, zero zone references, zero free-text fields · S03a
encapsulation survives · pin reproduced independently by two lenses, set
equality exact both directions, 276/276 members real, 7/7 gaps honest, RED
arithmetic verified, all 10 conjuncts gated, conjunct 10 correctly non-blocking.

## Rework rules

Same session, same worktree, contract unchanged. Reproduce-first on F1 — show
the pattern admitting the prose/card string **before** you tighten it, and the
same input rejected after. Keep `file:line` frames. Do not weaken an assertion
to reach green, and do not strengthen a test by widening the system.
`rework_round: 1 of 3`. End with `REWORK READY FOR HERMES REVIEW` on
`t_8e040ec2`.
