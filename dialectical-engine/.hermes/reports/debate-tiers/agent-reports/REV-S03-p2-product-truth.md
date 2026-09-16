# Self-report — REV-S03-p2-product-truth (ticket `t_1f2f4ab2`, review head `d35a9634`)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## The body: a fix that passed every check and did not fix the product

Pass 1 found `/new`'s tier cards empty. `FIX-S03-p1-F2` ran RED-first, swept eight mutants, listed
eleven surfaces in its sweep, was re-verified by the orchestrator at two heads, and shipped 78/78 ×3.
At `d35a9634` the cards are **still empty** — the register row the stack publishes carries
`kind: "PLAN_TIER_ROSTERS"` and the schema the route parses it with is `.strict()` without `kind`, so
an ordinary session gets **500 INTERNAL_ERROR**. Two FIX passes, three green layers, one broken
promise.

**The cause is not the missing key. It is that every test on both sides of the seam builds its own
input.** The projection test writes a row literal (`tests/unit/api.test.ts:286-292`); the route test
stubs the projection away (`:251-254`); the render suite mocks the client. Three layers, each honest
about itself, no test anywhere taking its input **from the producer**. The publisher's true shape is
pinned in a different file the fix never had to read
(`tests/integration/dev-deployment-register.test.ts:179-187`), and it disagrees with the reader.

The class is not "a roster collapses silently" (what F2 was told to fix). The class is: **a strict
reader that omits the discriminator its producer writes, because no test joins them.** Swept: seven
of the eight register-row readers declare `kind: z.literal(...)`
(`packages/register/src/index.ts:62,125,210,219,261,319,324`); the eighth is S03's, and it is the only
one whose row is served to a browser.

## What we must upgrade (in order of leverage)

1. **A producer-provenance law for boundary tests.** Any test asserting a value crossing a boundary
   must obtain at least one side from the real producer function — never a literal. This is
   mechanically checkable: an architecture test that flags a test file containing a `row_key:` literal
   with a hand-written `value_json`. Had this existed, the BUILD seat would have caught B1 — no review
   pass needed. It is the cheapest change on this list and it kills the whole class.
2. **Mounts must be named by what they JOIN.** The package's re-verification says *"the file↔rosters
   mount 8/8"*; the command behind it is three file-loader suites
   (`reverify-gate-s03-mount-d35a9634.log:4-11`) that never touch the register, the route or the page.
   The label spans file↔rosters; the command spans file↔loader. `packet-check` should reject a mount
   label `A↔B` whose command set touches only A — and the slice gate should require one
   producer→consumer mount per acceptance step, or that step declared UNVERIFIED.
3. **A FIX node should be required to extend the reviewer's probe one layer DOWN, not re-derive it in
   place.** F2 faithfully re-derived my pass-1 case B (a good-faith, correct act) and its re-derivation
   inherited my probe's mock of the client — so it re-proved the page, which was never the broken part
   after the route landed. "Re-derive the reviewer's probe" should read "re-derive it, then replace its
   nearest mock with the real producer."
4. **Charges should include one OPEN question.** My three closed charges ("confirm the 200", "confirm
   the 401", "confirm `/v1/deployment` stayed operator-only") all PASS at this head. A slice whose
   charges are all closed is a slice that can only be confirmed. One open charge per lens — here:
   *"what does the producer of this value actually write?"* — is what turned this pass.

## What I nearly got wrong

**I was one step from writing PASS.** Everything F2 built verifies line by line: the route row, the
preHandler path, the client method, the page's named refusal, the shipped 200/401 cases. I had
confirmed all of charge 2 and started on charge 3 before asking the question nobody asked me to ask —
what the publisher writes. The tell that saved it was small: `PlanTierRostersSchema` is `.strict()`
with two members, and my own pass-1 probe had hand-written a register row containing `kind` (I copied
that shape from the real code in pass 1 and never noticed it could not survive a strict parse). **My
own pass-1 fixture contained the evidence for pass 2's finding and I did not see it in pass 1.**

I also nearly filed two merge hunks as changes: `GET /v1/plan-tiers` and the resource union appear in
`diff-cd043907..d35a9634-S03-files.patch` as **context** lines inside the observability hunks. Reading
a patch by grep instead of by `@@` header is how a lens invents a merge finding.

## What repeatedly cost tokens (priced)

- **Packet geography, ~2 min + a judgment call.** My contract forbids opening `.worktrees/all` and then
  names twelve inputs inside it, including my own output path. Every lens pays this privately and may
  rule differently. Filed as N1. Cost across three lenses this pass: ~6 min, plus the risk of two
  lenses reading different subsets.
- **Merge-moved line numbers, 3 re-greps.** `apps/api/src/index.ts:139 → :150`, `:475-477 → :510-512`.
  The package warned ("re-grep"), which is right, but a package that ships a `pass1-line-map.txt`
  (old:line → new:line for the files under review) would cost the orchestrator one command and save
  every lens the same three greps.
- **Raw log weight I never read.** The package carries 868KB + 3×161KB of vitest output; I opened
  exactly one 18-line log. A per-suite digest plus logs on demand would cut package size ~99% with no
  loss — the digest (`reverify-d35a9634.txt`) is already there and is excellent.
- **My own measurement cost, for calibration:** 2 probe files, four vitest runs — unit probe 1.3s,
  render probe 0.9s, C4 five-suite ~40s, §5 integrated ~5 min wall (backgrounded to a log, which was
  the right call). The finding itself cost about six tool calls after the first suspicion.

## Dead ends (do not re-derive these)

- **There is no `INSERT INTO register.register_row` anywhere.** Register rows are published through
  `createPostgresRegisterPublicationPort(pool).importHistorical({rows})`
  (`apps/runner/src/dev-deployment-register.ts:713`). ~3 min lost grepping for the INSERT.
- **`grep --include=*.ts` fails under this shell** with `(eval):1: no matches found` — zsh expands the
  glob before grep sees it. Use `grep -rn PATTERN dir1 dir2 | grep -v node_modules`. This belongs in
  `TOOLING-TRAPS.md`; it has cost at least one command in each of my two passes.
- **`dev:auth:up` does not seed the register from `dev-auth-stack.ts`** — the call is one level down at
  `apps/runner/src/dev-auth-data-plane.ts:375` (`["dev:auth:seed-register"]`). Two greps.

## How this becomes more of a one-prompt machine

The single change with the highest ratio here: **generate the mount from the acceptance step, at
ARCH time, and make it a cluster deliverable.** Acceptance step 2 says "Open `/new`. The Free card
lists exactly `gpt-5.6-luna` and `glm-5.3-flash`." That sentence names a producer (`config/models.yaml`
→ the publisher) and a consumer (the card). A single generated test that walks producer→consumer and
asserts the sentence would have failed in cluster C4, before pass 1 existed — and both B1s (pass 1's
operator-gated read and pass 2's discriminator) would have been build-time failures, not two review
passes, two FIX nodes and six blind lenses. The review fleet is currently paying, at ~3 seats per
pass, for the absence of one test per user-visible sentence.

Second: **the honesty law needs a typed failure, not a 500.** The route fail-closes to
`INTERNAL_ERROR` + correlation id when the row will not parse, so the page says
`ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: INTERNAL_ERROR` — true, and useless to V and to the next seat.
The handler already has a typed refusal for a missing application member
(`DEPLOYMENT_REGISTER_UNAVAILABLE`, `apps/api/src/index.ts:921-926`) but none for a row that fails the
schema, which is the reachable case. Typed refusals at every fail-closed branch would have named this
defect on V's screen in plain words the first time anyone loaded the page.

## Where THIS packet fought me, exactly

- `packets/REV-S03-p2-product-truth.md:9-12` — the `.worktrees/all` contradiction above (N1).
- Charge 2 is phrased as confirmations of things that are true (`…confirm the ordinary-user 200 +
  unauthenticated 401 cases prove it in-process`). They do prove it in-process, for a row shape the
  product does not produce. A charge that can only be confirmed cannot catch a fix that is right at
  every layer and wrong at the seam.
- Charge 4's freeze-pair line is still a template sentence in prose ("the freeze commit that carries
  this packet and the package (stamped in the DISPATCHED comment)") rather than a concrete
  `<previous>..<latest>` pair, which the same line demands "never a pointer". I ran the merge
  cross-check it actually needed (`git diff cd043907 d35a9634 -- <file>`) and did not run the
  mission-tree freeze diff, because the pair was not stamped. Minor, but it is the second pass in which
  that line arrives partly unresolved.
