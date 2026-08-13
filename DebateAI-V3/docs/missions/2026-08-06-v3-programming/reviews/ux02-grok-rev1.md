# UX-02 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_e795a52c` · **Board:** `debateai-v3`  
**Title:** [Codex] UX-02 · Hide the five machine fields behind a collapsed Advanced disclosure (DR-166-B)  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-13  
**Inputs:** ticket body (`hermes kanban --board debateai-v3 show t_e795a52c`), `goal-packets/UX-02-codex-goal.md`, `handoffs/UX-02-codex-handoff.md`, DR-166-B (+ DR-166 / DR-166-A context); judged from **shipped source + re-run checks**, not handoff trust alone.  
**Mode:** READ-AND-RUN ONLY. No product, test, or `defaults.tsx` edits for this deliverable. No shared-tree mutation for RED proof (DR-163); mutation truth is encoded in the named default-visibility test and re-verified green on the current tree. Did **not** read any peer (Opus) UX-02 verdict.

## Verdict

**APPROVED**

All five OBJECTIVE axes **PASS**. The shipped `/new` page hides the five DR-166 machine-owned controls behind a closed-by-default Advanced disclosure, reveals them prefilled/editable/provenance-hinted when opened, leaves `defaults.tsx` derivation logic out of the UX-02 inventory (layout-only change in `page.tsx` + render tests), keeps UX-01 / DR-166-A guarantees green against the expanded state, and collects/passes the hermetic render suite under this review.

Advisories below are non-gating. None substitutes for a failed axis.

---

## Decision table (five axes)

| # | Axis | Result | Source / test proof |
|---|---|---|---|
| **1** | Default `/new` render is question + depth dial + Start with the five machine fields **absent** | **PASS** | Closed Advanced: `advancedOpen` init `false` (`page.tsx:47`); five control ids only inside `MachineOwnedAskFields` mounted when `advancedOpen` (`page.tsx:267–288` + `defaults.tsx:168–235`); re-run `DR-166-B + MUTATION visible-by-default` green — no `id="agentCount|asOf|decisionOwner|actionOwner|decisionScope"` on default HTML |
| **2** | Collapsed Advanced (closed by default) reveals the five fields prefilled, editable, provenance-hinted | **PASS** | Toggle `aria-expanded` / `aria-controls="machineOwnedAskFields"` (`page.tsx:258–266`); expanded render test asserts prefilled values + provenance + ready Start (`ux01-…:245–258`); editable controls case (`ux01-…:329–337`) |
| **3** | `defaults.tsx` logic untouched (layout only) | **PASS** | UX-02 inventory = `page.tsx` + render test + handoff/log only; `defaults.tsx` is **untracked** (UX-01 artifact), mtime `2026-08-13 12:04` vs UX-02 page edit `14:09`; no UX-02 claim of derivation edits; page only adds `advancedOpen` gate around existing `MachineOwnedAskFields` |
| **4** | UX-01 guarantees still hold against **expanded** Advanced (DR-166-A two-identity guard; derivation / prefill+editable+provenance) | **PASS** | Expanded cases green: DR-166-A two-token owners (`ux01-…:269–294`), B4 prefill+Start (`:245–258`), editable five (`:329–337`), absence honesty B5 (`:315–327`), pure mutations on `derive*` / `buildNewDebateAskConfig` still import shipped `defaults.tsx` |
| **5** | Vitest list collection + hermetic re-run | **PASS** | This review: `pnpm exec vitest list tests/render/ux01-new-debate-form.test.tsx` exit 0 — includes named DR-166-B default-hidden + B4 expanded + DR-166-A MUT-I; `pnpm exec vitest run …` → **14 passed / 1 skipped (live opt-in)** |

**Overall:** **APPROVED** (consistent with five PASS axes).

---

## Grounding (V ruling / packet)

DR-166-B (ledger, 2026-08-13): prefilled-but-visible is rejected. The five machine fields — Agent Count, As Of, Decision Owner, Action Owner, Decision Scope — must not appear on the default form. They live behind a collapsed **Advanced** disclosure (closed by default); rare power users can still edit (DR-166 editability preserved). Default surface intent: **question + depth dial (DR-157) + Start**. Provenance moves into the disclosure with the fields.

Packet non-decision (explicit): risk/budget stay wherever they are unless they are the same noise; **do not re-rule** — note only. **Do not touch `defaults.tsx` logic** — UX-01 derivations/guards are settled.

Shipped shape matches the five-field visibility ruling: conditional mount of `MachineOwnedAskFields` under Advanced; risk tier + composition budget remain on the outer panel (packet-allowed non-decision, handoff-noted).

---

## Axis (1) — five machine fields absent from default surface

### Production path

`apps/v2-ui/app/new/page.tsx`:

```47:47:apps/v2-ui/app/new/page.tsx
  const [advancedOpen, setAdvancedOpen] = useState(false);
```

```258:288:apps/v2-ui/app/new/page.tsx
            <button
              type="button"
              className="optionsToggle"
              aria-expanded={advancedOpen}
              aria-controls="machineOwnedAskFields"
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              Advanced <span style={{ fontSize: 9 }}>{advancedOpen ? "▲" : "▼"}</span>
            </button>
            {advancedOpen ? (
              <div id="machineOwnedAskFields">
                <MachineOwnedAskFields
                  agentCount={agentCount}
                  asOf={asOf}
                  decisionOwner={decisionOwner}
                  actionOwner={actionOwner}
                  decisionScope={decisionScope}
                  ...
                />
              </div>
            ) : null}
```

The five control elements (`id="agentCount"`, `asOf`, `decisionOwner`, `actionOwner`, `decisionScope`) are defined only inside `MachineOwnedAskFields` in `defaults.tsx:168–235`. With `advancedOpen === false`, that component is not mounted, so those ids cannot appear in the default SSR/static markup the hermetic suite renders.

### Named mutation / default-hidden kill

```260:267:tests/render/ux01-new-debate-form.test.tsx
  it("DR-166-B + MUTATION visible-by-default: hides all five machine-owned controls until Advanced opens", async () => {
    const html = await renderRealNewDebatePage();
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="machineOwnedAskFields"[^>]*>Advanced/);
    expect(html).not.toContain('id="machineOwnedAskFields"');
    for (const id of ["agentCount", "asOf", "decisionOwner", "actionOwner", "decisionScope"]) {
      expect(html, id).not.toContain(`id="${id}"`);
    }
  });
```

This case **is** the kill for “always render the five controls”: if `MachineOwnedAskFields` were mounted unconditionally, the id assertions fail. This review did **not** re-mutate production (DR-163); it re-executed the binding test on the shared dirty tree → **PASS**.

### Default surface honesty (non-blocking vs ticket prose)

Strict ticket/DR prose also names “depth dial + nothing else.” Shipped default (both Advanced and Options closed) still shows:

- Topic / question textarea  
- Risk tier + composition budget (outer panel)  
- Advanced toggle (closed)  
- Options toggle (closed; tree depth / DR-157 knobs live **inside** Options)  
- Envelope hint + Start / Cancel  

Risk/budget visibility is the packet’s explicit non-decision — handoff correctly declines to re-rule. Depth remaining under the pre-existing Options disclosure is outside the five-field deliverable. **Not a FAIL of axis (1) as scoped to the five DR-166 machine fields.** If V wants the literal “question + depth + Start only” surface, that is a separate product ruling (same deferral handoff already records).

---

## Axis (2) — Advanced reveals prefilled / editable / provenance-hinted fields

### Closed by default + a11y surface

- Init: `useState(false)` → `aria-expanded="false"` on the Advanced button.  
- Open: conditional mount of `#machineOwnedAskFields` with `aria-controls` pairing.

### Expanded guarantees (shipped component)

`MachineOwnedAskFields` (`defaults.tsx:141–235`) still:

| Field | Prefill source (page state after effects) | Editable | Provenance |
|---|---|---|---|
| agent count | `deriveAgentCountDefault(deployment)` → `"2"` in fixture | number `input` + `onChange` | `MachineDefaultHint` + `agentCountProvenance` |
| as of | `deriveSessionAskDefaults` / ask time | `datetime-local` + edit flag | `asOfProvenance` |
| decision / action owner | `session.asker_id` | text inputs | session identity hints |
| decision scope | `"personal"` (`DECISION_SCOPE_DEFAULT`) | text input | DR-166 hint |

Re-run expanded case (`B4/DR-166-B expanded…`) asserts `aria-expanded="true"`, container id, `value="2"`, `value="asker:test-user-alpha"`, `value="personal"`, configuredProviderSet provenance string, and Start `class="startBtn ready"` without `disabled`. Editable case asserts none of the five inputs are `readonly`/`disabled`.

---

## Axis (3) — `defaults.tsx` logic untouched (layout only)

### Dirty-tree honesty

| Path | Git status | Notes |
|---|---|---|
| `apps/v2-ui/app/new/page.tsx` | `M` (tracked) | Diff vs `HEAD` includes **both** UX-01 and UX-02 uncommitted work; UX-02-specific delta is `advancedOpen` + Advanced toggle + conditional `MachineOwnedAskFields` mount |
| `apps/v2-ui/app/new/defaults.tsx` | `??` untracked | Entire file is the UX-01 defaults module; **no committed baseline** to `git diff` |
| `tests/render/ux01-new-debate-form.test.tsx` | `??` untracked | UX-01 suite extended for DR-166-B default-hidden + expanded selectors |

### Why axis (3) still PASSes

1. Handoff inventory does not list `defaults.tsx` under UX-02 changed files.  
2. Filesystem mtime: `defaults.tsx` **12:04**, `page.tsx` **14:09**, render test **14:10** — consistent with UX-02 editing only page + tests in the claim window.  
3. Source structure: derivation (`deriveAgentCountDefault`, `deriveSessionAskDefaults`, `buildNewDebateAskConfig`) and field markup remain in `defaults.tsx`; UX-02 adds **layout gating** in `page.tsx` only.  
4. Page wiring of defaults (useEffect prefill, ready predicate, submit via `buildNewDebateAskConfig`) is UX-01 semantics preserved under the disclosure — not a new derivation algorithm.

**Cannot claim a pure UX-02-only git hunk on `defaults.tsx`** because the file is untracked; the honest statement is: no evidence of UX-02 logic edits, and the deliverable is the conditional mount in `page.tsx`.

---

## Axis (4) — UX-01 guarantees against expanded Advanced

### DR-166-A two-identity guard

```269:294:tests/render/ux01-new-debate-form.test.tsx
  it("DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page", async () => {
    ...
    const alphaHtml = await renderRealNewDebatePage({ advanced: true });
    ...
    const betaHtml = await renderRealNewDebatePage({ advanced: true });
    ...
    // decisionOwner + actionOwner bound to asker:test-user-alpha vs beta
  });
```

Production path still derives owners from `session.asker_id` only (`defaults.tsx:18–28`); no person-constant `"V"` as owner. Expanded render is required so the inputs exist for assertion — the disclosure does not short-circuit session derivation (effects still run when Advanced is closed; state is prefilled before open).

### Derivation / prefill / editable / provenance / honest absence

All still green under this review against `{ advanced: true }` where the DOM is required:

- B1/B3 agent_count N-generic from `configuredProviderSet`  
- B2/B5 risk/envelope independence  
- MUTATION decision_owner / action_owner / decision_scope / as_of pure seams  
- B5 fabricated fallback dies; Start stays disabled  
- B6 edited as_of preserved  

Page `useEffect` derivation (`page.tsx:75–128`) runs regardless of `advancedOpen`; hiding the controls does not skip machine defaults or ready-state computation — Start can still enable with fields collapsed once session/deployment effects settle (B4 expanded proves ready; default-hidden case does not require Start assertion, and prefill still occurs in state).

### Test harness note (advisory A1)

`hooks.openAdvanced` hardcodes `advancedDisclosureStateSlot = 2`. Python count of `useState` in `NewDebateForm` confirms slot **2 = `advancedOpen`** today. Reordering state declarations would silently break expanded-state tests without a production bug. Non-blocking; prefer a less order-coupled open path if the suite is next revised.

---

## Axis (5) — vitest list collection + re-run

### Commands re-run this review (real stdout captured under scratch)

```text
pnpm exec vitest list tests/render/ux01-new-debate-form.test.tsx
# exit 0 — named cases include:
#   B4/DR-166-B expanded: Advanced reveals every prefilled field and keeps Start enabled
#   DR-166-B + MUTATION visible-by-default: hides all five machine-owned controls until Advanced opens
#   DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
#   (+ remaining UX-01 hermetic cases)
```

```text
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx
# Test Files  1 passed (1)
# Tests       14 passed | 1 skipped (15)
# Duration    308ms
# LIVE READ-ONLY case skipped (UX01_LIVE_STACK unset) — expected
```

Evidence files (private scratch, not committed):

- `{SCRATCH}/ux02-vitest-list.txt`  
- `{SCRATCH}/ux02-vitest-run.txt`  

Broader handoff gates (full `tests/render`, 521 vitest, acceptance, typecheck, lint) were **not** all re-run in this seat; the plan allows that when the gating render suite + source audit cover the five axes. No contradictory failure observed on the gating suite.

### DR-163 mutation RED

Handoff claimed an injected RED for unconditional visibility during TDD. This review did **not** re-apply that production mutation on the shared dirty tree. **Describe-only for a clone-isolated lens if re-proof is required:**

1. In `apps/v2-ui/app/new/page.tsx`, temporarily replace `{advancedOpen ? ( <div id="machineOwnedAskFields">…</div> ) : null}` with unconditional `<div id="machineOwnedAskFields"><MachineOwnedAskFields … /></div>` (keep the Advanced button).  
2. Run:  
   `pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx -t "DR-166-B \\+ MUTATION visible-by-default"`  
3. Expect **1 failed** (ids present while `aria-expanded="false"` / container still present depending on edit).  
4. Restore the conditional mount; expect full suite green again.  

Do **not** leave that mutation on the shared tree.

---

## Advisories (non-gating)

| ID | Note |
|---|---|
| **A1** | Test `advancedDisclosureStateSlot = 2` is order-coupled to `useState` declaration order. |
| **A2** | Risk tier + composition budget remain on the default outer panel; packet non-decision — separate V ruling if “nothing else visible” is to be literal. |
| **A3** | Tree depth / scrutiny (DR-157 depth dial) remain under collapsed **Options**, not on the default surface; pre-existing placement, not a five-field regression. |
| **A4** | Root `AGENTS.md` template scripts (`tests/render-templates.sh`, `tests/lint-templates.sh`) are absent in this checkout (handoff-noted); not used as a FAIL signal for UX-02. |
| **A5** | Live-stack case not exercised (`UX01_LIVE_STACK` unset); hermetic path only. |

---

## Inventory attributed to UX-02 (this lens)

- `apps/v2-ui/app/new/page.tsx` — closed-by-default Advanced disclosure + conditional mount of existing `MachineOwnedAskFields`  
- `tests/render/ux01-new-debate-form.test.tsx` — default-hidden mutation + expanded-state selector/assertion adjustments  
- Mission handoff / progress log (worker artifacts; not re-judged as product)

**Not in UX-02 logic scope:** `apps/v2-ui/app/new/defaults.tsx` (UX-01 untracked module; layout consumer only).

---

## Review markers

```text
READY FOR PEER REVIEW: satisfied upstream by Codex (ticket comment 2026-08-13 14:13).
Grok dual-diamond lens: APPROVED — five axes PASS.
Did not read peer Opus UX-02 verdict.
comments read through: Codex WORKER CLAIM 14:06; READY FOR PEER REVIEW 14:13; no later ticket comments at review time.
```

**Deliverable path:** `docs/missions/2026-08-06-v3-programming/reviews/ux02-grok-rev1.md`
