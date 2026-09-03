# REV-02 self-report — public-debate-access — Grok plan-review lens, 2026-08-29

Filed per `heartbeat-protocol` §3 / packet §8. Question answered, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict in one line

**REWORK** — one blocking security gap (`replay_handle` survives "complete" node redaction and will render on the public page), plus several non-blocking plan-hygiene defects that will burn coding/QA tokens if left.

## CAUSE, not symptom

### 1. Redaction scoped to the named field, not the handle class (PRICE: 1 full programming+QA cycle if shipped)

**Symptom:** S01 redacts `abstention.ledger_unknown_ref` and proudly flags `register_*` for S04.

**Cause:** The seat hunted the ONE field REV-01 named, then stopped. It did not walk every nested schema that wholesale `nodes`/`edges` copy would serialize. `LabeledNumberSchema.replay_handle` sits on every `base_score`, every present `final_strength`, and every PRESENT edge strength — required `z.string().min(1)`, same "owner-only handle" family as `inspection_handle` / `ledger_digest_handle`, and the public `NodeDetailDrawer` literally prints `replay {baseScore.replay_handle}`.

This is the same failure mode as INTAKE N4 (infer a local mechanism, miss the class): field-shaped reasoning instead of surface-shaped reasoning. **Upgrade:** any "copy X wholesale" decision must ship a recursive handle inventory of X's zod graph before the redaction step is marked done — not a list of fields a prior reviewer happened to mention.

### 2. Shared presentational leaves ≠ no drift (PRICE: slow parity rot across missions)

**Symptom:** S02 asserts "no visual drift risk" because `DebateThread`/`DebateCanvas`/… are reused.

**Cause:** The drift surface moved up one layer. View-toggle markup, honesty wiring, and scoring chrome are *ported* into `PublicDebatePageClient`, not shared. Leaves stay in sync; chrome will not. Packet asked exactly this; the plan answered a different question (leaf reuse) and called it solved.

**Upgrade:** when the architecture chooses parallel trees, require one concrete anti-drift step (shared chrome component, or a render test that mounts owner+public fixtures and diffs affordance labels).

### 3. Worktree blindness strands tooling and receipts (PRICE: ~15–20 min this seat)

This worktree has no usable `node_modules/.bin/tsx` / local zod. Live API probes worked; schema probes needed the main-tree tsx. Agent-reports dir started empty here while ARCH's report lives in the main tree — exactly the TOOLING-TRAPS "blind lens strands receipts" entry.

**Upgrade:** review worktrees should either (a) share `node_modules` via the install strategy the coding seats use, or (b) packet-document the main-tree tool path as the probe runner. Orchestrator must collect `REV-02-grok.md` from this worktree before any janitor pass.

### 4. What repeatedly costs tokens on this mission

| Cost source | Observed here | Fix |
|---|---|---|
| Re-deriving INTAKE ground truth | Avoided — corrections log paid for itself | Keep per-claim tags |
| Truncated `hermes kanban show` | Hit; used `--json` + python slices | Packet already warns; seats still lose minutes |
| zsh / missing `rg` / no `timeout` | Hit; fell back to `grep` + `perl alarm` | TOOLING-TRAPS works when read first |
| Same-model blind spots on handle class | ARCH caught `ledger_unknown_ref`, missed `replay_handle` | Independent lens must walk nested schemas, not trust the author's inventory |
| Cluster table vs step-body drift | S02-C1 table says `1..3`, bodies have `1..5` | Architecture contract: table ranges generated from step headings, not typed by hand |

### 5. Toward a one-prompt machine

- **Pre-bake a "wholesale copy hazard" checklist into `heartbeat-architecture`:** for every schema field newly publicized, list nested `*_handle` / `*_ref` / `z.unknown()` / `.passthrough()` nodes with redact / defer-to-S04 / accept. Empty checklist = blocking self-finding.
- **Make SKILLS LOADED the first line of author handoffs too.** ARCH's floor skills were verified only via Router transcript forensics; the handoff itself still opens `READY FOR PEER REVIEW` with no `SKILLS LOADED:` line. This seat is the first under the gate — keep the gate, and reject author handoffs that omit it the same way.
- **Do not let "flagged for S04" become a dumping ground for anything uncomfortable.** Deferral is valid for product judgment (`claim` text). It is not valid for a required handle that the public UI already knows how to render.

## What I nearly got wrong

1. **Nearly waved `replay_handle` into S04** the way ARCH deferred `register_*`. Dead end: `register_*` is absent from the owner public UI path the plan mounts; `replay_handle` is actively rendered by the shared `NodeDetailDrawer` S02 reuses. Deferral would ship a visible leak, not an audit question.
2. **Nearly treated C2-2 "verbatim deep-equals" as B-blocking.** It is a stranger-test landmine (abstaining fixtures break C2-2 after redaction), but a worker can satisfy both tests with disjoint fixtures. Filed as N, not B.
3. **Nearly re-litigated V Row 2** because ARCH's ticket comment still spoke of OPEN rows. The PLAN body already chose disclosed answer-only, matching the CLOSED ruling. Status prose is stale; substance is not contradictory.

## Dead ends (do not re-derive)

- Worktree-local `node_modules/.bin/tsx` — absent; use main-tree tsx or python key-presence probes.
- `hermes kanban show` without `--json` — truncates; always dump JSON for comment bodies.
- Ban-word grep hits on the law line itself ("Forbidden acceptance words: improve…") — not a criterion defect.
- Bare `:3000/v1/public/debates` — Next 404; wrong surface (INTAKE already fixed this).

## Where THIS packet fought me

1. **Highest-value probe list was right** (`ledger_unknown_ref` completeness) — and the plan's own pride in catching that field made it easier to stop there. Packet said "sibling fields"; that word did the work.
2. **Board contract** (`t_7ee9aed5` + `t_f864a84b` only) — held. Did not open sibling SPEC-review tickets; ARCH handoff already quoted the needed REV-01 line.
3. **V closed rows** — packet said contradicting them is blocking. Checked; plan matches Rows 1/2/4/5. No B there.
4. **`ask_user_question` unavailable** in this non-interactive seat — proceeded under REFUTE default on `replay_handle` as B.
5. **Receipt path** — allowed write is worktree-local; TOOLING-TRAPS says that strands the ledger. Filed here as required; orchestrator must copy to main tree at seat exit.

## Skills actually loaded (bodies read)

`heartbeat-protocol` (`.claude` + `.grok` copies), `heartbeat-reviewer`, `verification-before-completion`, `receiving-code-review`.


---

## Rework confirmation — round 1 of 3 (2026-08-29)

Narrow scope: whether prior findings are closed. Default posture REFUTE. Did not re-litigate the whole plan.

### Skills loaded this turn
heartbeat-protocol, heartbeat-reviewer, verification-before-completion, receiving-code-review

### (1) B1 replay_handle — CLOSED
MEASURED by reading S01-C2-0B / S01-C2-1 / S01-C2-5 / S01-C2-6 in the refreshed PLAN:
- shared `redactLabeledNumber` applied at `base_score`, `final_strength`, and edge `strength.number` (PRESENT arm) via `redactNodeForPublic` + `redactEdgeForPublic`
- S01-C2-6 names a residual-handle sweep as an acceptance test with explicit RED-before-GREEN against pre-rework `publications.ts`
Own python simulation of the planned helper redacts all three replay sites to `REDACTED_OWNER_ONLY`.

### (2) `.passthrough()` — NOT CLOSED → B2
ARCHITECTURE classified `stranger_restatement` as COPIED-AND-FLAGGED for S04 (checklist 3d). That is a list entry, not a publish-path projection.
The planned `redactNodeForPublic` does `{...node, base_score:..., final_strength:..., abstention:...}` and therefore copies `stranger_restatement` wholesale.
Own probe (simulated helper + fixture with `secret_extra` / `owner_note` on `stranger_restatement`):
- `passthrough extras survived? {'check_status': 'PASS', 'secret_extra': 'LEAK-ME', 'owner_note': 'do-not-publish'}`
- `JSON contains LEAK-ME? True`
Confirmation brief law: unknown-key passthrough on a copied path defeats field-by-field review by construction; a per-field list alone does NOT close it.
Required fix: project to `{ check_status }` only inside `redactNodeForPublic`, plus a residual test that injects an extra key and asserts absence from published JSON.

### (3) Fourth named-field leak — not found as a new schema key; passthrough hole is the live defect
Walked every NodeSchema/EdgeSchema nested shape (LabeledNumber, MakerLineage, NodeReview, Abstention, ConditionMark enum). Open-ended shapes on the copy path are only:
- `stranger_restatement` `.passthrough()` (new this round, listed)
- `disagreement` `z.record(string, unknown)` (round 0, listed)
No fourth *named* schema field omitted from S01-C2-0B. Product-adjacent note (same B2 class, not a separate field): `core.stranger_restatement.restatement_text` / judgement `restatement_text` exist in-repo; serve today projects only `{check_status}`, but `.passthrough()` would admit `restatement_text` without any PLAN step naming that key — which is why projection, not a checklist row, is the closure.

### (4) DECISIONS append-only / SPECs untouched — CLOSED
- `cmp` vs main tree: SPEC.md (and S02 SPEC-v1.md) byte-identical for S01–S04.
- DECISIONS: early bullets still contain original "not yet a V ruling" text (unedited); REWORK ROUND 1 SUPERSEDES entries appended. Main-tree line sequences preserved in order.

### Prior N1–N7 — CLOSED (spot-checked)
- N1: S02-C6 affordance-drift cluster present
- N2: S02-C1 table 1..5; S01-C3 self-caught 1..4
- N3: C2-2 redaction-aware expected object
- N4: DECISIONS supersede, not rewrite
- N5: S03-C1-4 mechanical + S03-C1-5 QA route
- N6: acknowledged as Router timing / out of ARCH scope
- N7: PLAN Row 4 CLOSED; DECISIONS appends for Rows 1/4; S02 Row 1 append

### Verdict this round
**REWORK** (round 2 of max 3 authorized if ARCH patches again) — B2 only. B1 and N-findings closed.

### What I nearly got wrong
Nearly PASS'd because serve.ts:2198 currently emits only `{check_status}`, which makes the passthrough look inert in today's happy path. The confirmation brief's "list alone does not close it" rule is what kept the probe honest.


---

## Rework confirmation — round 2 of 3 (2026-08-29) — B2 only

Narrow scope: is B2 closed, and is the open-shape class closed. Skills this turn: heartbeat-protocol, heartbeat-reviewer, verification-before-completion, receiving-code-review.

### (1) Original leak probe vs REVISED redactNodeForPublic — CLOSED
Simulated PLAN's round-2 helper (fresh `{ check_status }`, `disagreement: null`) against the same dirty fixture used in round-1 confirmation:
- round-1 spread: `LEAK-ME-RESTATEMENT` / `do-not-publish` / `LEAK-ME-DISAGREEMENT` / `secret-ptr-9f2a` all survive → C2-7/C2-8 would FAIL
- round-2 projection: `stranger_restatement == {check_status: PASS}`, keys `['check_status']`, `disagreement is None`, all four leak strings absent → C2-7/C2-8 would PASS
- claim/locator/defeater_refs preserved (Done #3 argument surface intact)
Projection claimed is projection achieved: later properties overwrite `...node` for those two fields; extras do not merge back.

### (2) Two-members-only claim — could not refute
Independent full-file sweep of `packages/contract/src/index.ts` for `.passthrough(`, `.catchall(`, `z.record(`, `z.any(`, `z.unknown(`, `.and(`:
- ON copied Node/Edge path: exactly `stranger_restatement` (passthrough) and `disagreement` (z.record/unknown)
- All nested schemas on that path (LabeledNumber, MakerLineage, NodeReview, Abstention, ConditionMark, enums): CLEAN
- Off-path hits (AskRequest.depth_params, Deployment.register.value, ShadowSuppression.would_have_suppressed, Answer.answer_form, cost_envelope.basis, RunEvent.payload): not copied by S01
No THIRD widening shape found. REAL NodeSchema.safeParse still accepts dirty extras (schema stays open — correct); closure is at publish projection.

### (3) disagreement → null vs V Done #3 — SAFE
Producer (`judgement` writes jsonb beside panel_contract_hashes/dispersion) + consumer (NodeDetailDrawer blind `JSON.stringify`) confirm this is an internal panel diagnostic, not argument text. Nulling removes a READ the owner sees only as an unlabeled dump; it does not remove verdict, claim, tree, scores, locator, or defeater structure. Done criterion 3 still holds.

### (4) Residual tests fail pre-fix — YES (by construction of the named assertions)
C2-7/C2-8 assert key-set equality / `=== null` / string absence. Against round-1 spread those assertions fail; against round-2 they pass (probe above). Tests pin the defect.

### Verdict
**PASS.** B2 closed; class closed at two members; no blocking findings; no non-blocking findings filed (last-round discipline).
