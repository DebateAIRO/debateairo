# H2 Plan re-review — Docker Hatchet

Date: 2026-08-21  
Ticket: `H2-DOCKER-CODEX`  
Review round: `2`  
Reviewer session: `01a023d9-941c-7933-a618-2d944dbb51a5`  
Reviewed artifact: `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md`  
Plan SHA-256: `c1d8db0ce2b2ad6b06cf17bd384d68f165f9a44f4cf5d05b78be65e85cf82901`

## Scope and method

This is the same-session P8 replay of H2-03 through H2-09 against the complete
current C2 rework-2 `Plan.md`. H2-01, H2-02, and the secondary replay-service
defect were checked only for regression. I did not inspect
`architecture/PlanReview.md` or any `g3-*` artifact. I did not edit `Plan.md` or
exercise Docker, a database, product data, secrets, or any external system.

The approval test remains executable closure: a later seat must not have to
invent an input, authorization, dependency, file owner, or proof procedure, and
the declared slice order must permit each prerequisite to exist before it is
required.

## Verdict

**PEER REVIEW CHANGES REQUESTED.**

The recut materially improves every finding, but each of H2-03 through H2-09
still has at least one reproduced blocker. H2-01, H2-02, and the secondary
replay-service defect remain resolved.

## Finding replay

| Finding | Round-2 result | Disposition |
|---|---|---|
| H2-01 | AR-2/AR-2a and explicit `-p docker-hatchet` scoping remain intact. | RESOLVED — no regression |
| H2-02 | Static D0a and runtime D0b remain separate. | RESOLVED — no regression |
| H2-03 | Exact web/timing contracts exist, but dispatcher-health discovery is downstream of D3, which already requires dispatcher health. | CHANGES REQUESTED |
| H2-04 | V-14/V-15/V-16 cover the previously named mutations, but D6 may write product data with no product-data authorization. | CHANGES REQUESTED |
| H2-05 | Manifest fragments, DP files, and the external secret path are improvements, but D4/D6 completion evidence is assigned to D7-owned files. | CHANGES REQUESTED |
| H2-06 | App/runner ports, mounts, and URLs are much more exact, but the Postgres bootstrap and dispatcher database-secret contract is absent. | CHANGES REQUESTED |
| H2-07 | The identity literal and V gates are supplied, but the acceptance fixture's actual product values remain delegated to D4. | CHANGES REQUESTED |
| H2-08 | A predecessor name exists, but its owner cannot perform content work and its producing artifact/worker remain unspecified. | CHANGES REQUESTED |
| H2-09 | Restart and authorization are improved, but several SQL assertions measure the wrong or an undefined event/count. | CHANGES REQUESTED |

## H2-03 — health and one-shot semantics

Status: **CHANGES REQUESTED**.

What flipped:

- The `web` healthcheck is now an exact `node -e` command.
- Section 2.7.1a chooses concrete timing values.
- D3a gives vendor-dependent surfaces a named output with exact-or-`ABSENT`
  acceptance.
- Scheduler remains correctly classified as a one-shot unit behind V-11.

Reproduced blocker — circular dispatcher-health dependency:

1. Section 2.7.1 says the dispatcher's exact health command is whatever D3a
   records in `deploy/VENDOR-SURFACES.md`.
2. The gate matrix makes D3 stop on `engine healthy` (`Plan.md:1126`), and D3's
   detailed done contract requires U-11 to be closed or blocked
   (`Plan.md:1223`).
3. D3a cannot begin until D3; its entry is explicitly “D3 (a running engine)”
   (`Plan.md:1227-1231`).

D3 therefore needs D3a's output before D3a is eligible. A D3 coding seat must
still invent a provisional readiness check, omit the healthcheck, or violate the
slice graph.

Required correction: split engine bootstrap from D3 acceptance, or move the
readiness discovery to an executable predecessor that can run before the D3
fragment and D3 health verdict are finalized. The selected command or an
`ABSENT` blocker must exist before D3 is asked to become healthy.

## H2-04 — important-operation gates

Status: **CHANGES REQUESTED**.

V-14, V-15, and V-16 correctly distinguish authorization from values and now
cover D0b's disposable project, D3's privileged DB work, D4's acceptance rows
and destructive injections, and D7's lifecycle mutations.

One important-operation gap remains. The grants table states that
`job:replay-self-test` may append to the two `serve` streams and
`job:settlement-watch` may append scorecard/ledger rows (`Plan.md:969-971`). D6
runs the scheduler one-shots, yet its authoritative gate row says its important
operations are “none beyond V-14's D3 scope” (`Plan.md:1130`). V-14 authorizes
creation of principals and grants; it does not authorize the jobs' product-data
writes. V-15 is scoped to D4's asks only.

Required correction: either prove and state that D6's invoked completion path
performs no product-data write, or add an explicit, bounded product-data
authorization covering the exact D6 writes and make it a D6 entry gate.

## H2-05 — exact files and writers

Status: **CHANGES REQUESTED**.

What flipped:

- The single multiply-written manifest became one fragment per slice.
- DP now owns exact production-target outputs.
- The operator secret is outside the repository, so no `.gitignore` edit is
  authorized or needed.

The evidence-file ownership remains internally impossible:

- L-0 requires every D4 L-case to record numeric expected/actual counts in
  `deploy/ACCEPTANCE.md` (`Plan.md:552-553`).
- D4 must finish those L-case verdicts before D5 and D7 can run.
- The exact manifest and writer matrix assign `deploy/ACCEPTANCE.md` solely to
  D7 (`Plan.md:741`, `Plan.md:1410`).
- D6 likewise requires `deploy/DISCLOSURE.md` to contain its scheduler result
  before D6 completes (`Plan.md:1318-1329`), but that file is also solely D7's.

Thus D4 and D6 must either write a forbidden file or wait for their downstream
D7 successor to make them complete. The abbreviated
`docs/…/architecture/path-manifest/<slice>.md` notation also weakens an otherwise
exact-path contract, though the cyclic evidence ownership is independently
blocking.

Required correction: give D4 and D6 exact, individually owned evidence
fragments and make D7 merge/read them, or re-cut the slice completion rules so
no predecessor depends on a future writer. Enumerate the manifest-fragment
paths without `…` or `<slice>` shorthand in the normative exact-file table.

## H2-06 — runtime values, secrets, images, and mounts

Status: **CHANGES REQUESTED**.

The recut now fixes the original app/runner omissions: it names the external
operator file, exact crypto sources and targets, the runner as a KEK consumer,
concrete hosts/ports, `API_HOST`, and literal compositions for application and
job URLs.

The data-plane secret/value contract is still incomplete:

- AR-17 says the SQL one-shots hold a mission bootstrap-admin credential
  (`Plan.md:945-946`).
- Section 3.6 says the four `*_PASSWORD` values and
  `HATCHET_CLIENT_TOKEN` are the only `OPS` entries (`Plan.md:1065`). None is
  identified as the Postgres bootstrap-admin credential.
- The matrix names `POSTGRES_HATCHET_DB`, but supplies no exact dispatcher DB
  principal/password, connection URL, vendor environment keys, or carrier by
  which the dispatcher reaches that database.
- `SERVER_URL` still affects token validity and remains U-6a, outside the
  supposedly authoritative value matrix (`Plan.md:461-472`, `Plan.md:1596`).

A D3 seat must therefore invent or rediscover the Postgres initialization
secret and the dispatcher's database configuration before the engine can run.

Required correction: enumerate the exact Postgres bootstrap variables and
credential source, the exact dispatcher database principal/URL and vendor env
keys, their owners/carriers/consumers, and the treatment of `SERVER_URL`. If a
vendor surface must be discovered, give it the same predecessor/output/blocker
discipline as the health surfaces rather than leaving it inside D3.

## H2-07 — principals and lawful dispatch receipt

Status: **CHANGES REQUESTED**.

V-14 and V-15 now gate the DB and product-data writes, and AR-18 supplies a
fixed non-secret dev-token literal, deterministic identity derivation, a
fixture path, and explicit retention. Those changes resolve most of H2-07.

The fixture remains a path and schema, not an exact input. The D4 contract says
`deploy/fixtures/acceptance-ask.json` will supply the thirteen required fields
(`Plan.md:1262`), then says only that every value is a “fixture datum” and that
`as_of` is stamped at invocation (`Plan.md:1263`). It gives no literal values or
authorized source for the other twelve fields. D4 is the writer, so that coding
seat still invents the product data. V-15 would authorize writes before the
artifact's actual contents exist.

Required correction: place the literal JSON body in the plan or identify an
already-existing authorized source plus deterministic transformation. Bind
V-15 to that exact content (for example by path and hash) and state the exact
number of requests/retained rows its scope permits.

## H2-08 — D5 origin branch

Status: **CHANGES REQUESTED**.

The gate matrix now makes V-9(b) depend on accepted completion of
`AC60-ROUTE-CONTRACT`, which is the right dependency shape. Its producer is not
yet executable:

- AR-22 assigns the predecessor ticket to “the orchestrator”
  (`Plan.md:1296`). Under the governing protocol the router/orchestrator routes
  work and does no content work.
- Its deliverable is a file contract “granting some seat” the two web files
  (`Plan.md:1298`), so the actual worker/owner is still unspecified.
- No exact output artifact path or accepted evidence is named; the D5 matrix
  nevertheless calls it an accepted artifact.

Required correction: name the authorized implementation owner, exact file
contract, durable completion artifact/evidence, and dependency identity, then
make D5 consume that accepted artifact. Alternatively constrain this mission
to V-9(a). A router-owned placeholder is not a producing predecessor.

## H2-09 — dispatcher-law falsification

Status: **CHANGES REQUESTED**.

The explicit runner `start`, V-16 gates, fixed evidence tables, numeric-receipt
rule, and exact-or-`ABSENT` redelivery discovery address important parts of the
round-1 finding. The `ABSENT` rule is acceptable because it truthfully blocks a
law instead of substituting weaker evidence.

Several asserted proofs are still non-executable or measure a different fact:

- L-1 compares a ledger sequence to “the sequence of the claim-recording
  entry” (`Plan.md:557`), but the fixed evidence surface gives the claim only
  `core.work_item` fields—with no sequence—and defines no claim-recording
  `ledger_entry` action kind. The comparison has no identified right-hand row.
- L-2 observes `CLAIMED` before terminal completion (`Plan.md:558`). That proves
  visibility before terminal state, not that the claim committed before the
  model call began; no call-start observation or synchronization is defined.
- L-4 compares a “run terminal event” (`Plan.md:560`) that is not included in
  the fixed evidence-surface table and has no named table/columns/query.
- L-5 and L-6 use `count(*)` over every `ledger_entry` having an `attempt_id`
  (`Plan.md:561-562`). That counts ledger rows, not distinct attempts, and it
  omits the promised `call_site_key` filter; comparing it to
  `*_MAX_ATTEMPTS` is dimensionally invalid.
- The table still gives SQL fragments and prose triggers rather than exact
  invocations with parameter-binding/capture steps, despite labeling the
  column “Exact procedure.”

Required correction: identify the actual claim-order event or choose a
directly observable committed-claim proof; define a call-start synchronization
for L-2; add the terminal-event surface; count distinct attempts for one call
site; and provide exact scripts/commands that capture and bind all identifiers.
Keep D3a's `ABSENT` blocker where the vendor lacks a lawful forcing mechanism.

## Regression checks

- **H2-01:** remains resolved. The mission project, ownership refusal, and
  explicit project scoping are intact.
- **H2-02:** remains resolved. D0a performs static/read-only preflight while
  D0b owns the authorized disposable runtime fixture.
- **Secondary replay-service defect:** remains resolved. `replay-ceremony` is a
  profiled service definition invoked with `run --rm` and argv credentials.

## Conclusion

Round 2 closes many of the earlier omissions but does not yet form an acyclic,
fully authorized, single-writer executable contract. The seven scoped findings
remain RED for the narrower residuals above and require another C2 recut before
H2 can approve.

READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / H2-rework-2
- owner CLI session: 01a023d9-941c-7933-a618-2d944dbb51a5
- artifact path: docs/missions/2026-08-21-docker-hatchet/architecture/H2-plan-review.md
- verdict: PEER REVIEW CHANGES REQUESTED
