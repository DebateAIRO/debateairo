SKILLS LOADED: using-superpowers, heartbeat-protocol, heartbeat-worker, superpowers:brainstorming, superpowers:test-driven-development, superpowers:receiving-code-review, superpowers:systematic-debugging, superpowers:verification-before-completion

# READY FOR PEER REVIEW — SUP-00-KB

REWORK ACKNOWLEDGED: `sup-00-kb-grok-verdict.md`, all 217 lines; B1–B3 and N1–N4 were addressed in rework round 1.

## Identity and authority

- Ticket: `SUP-00-KB`
- Worker session: `/root/sup00_kb_author` (the packet exposes no separate CLI session id and keeps `owner.session: pending`)
- Branch: `slice/oa-sup-01`
- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-sup-01/dialectical-engine`
- Commit: none; the packet forbids commit, push, merge, and branch/worktree operations
- Authority epoch: `1`
- Rework round: `1`
- Human review: required
- Comments read through: `sup-00-kb-grok-verdict.md:217`, plus the 2026-09-03 rework dispatch (original cursor `not-ticketed/user-request-2026-09-02`)

The frozen, already-approved packet satisfied the brainstorming approval gate. No board or external system was queried or mutated, and no subagent was launched.

## Delivered artifact

Created 12 fixed corpus entries as 24 bilingual Markdown files under `packages/support-kb/content/`:

| id | English | Romanian |
|---|---|---|
| `getting-started-debate` | yes | yes |
| `debate-topic-and-description` | yes | yes |
| `risk-tier-choice` | yes | yes |
| `budget-tier-choice` | yes | yes |
| `guide-how-it-works` | yes | yes |
| `unsupported-capabilities` | yes | yes |
| `public-answer-disclosure` | yes | yes |
| `browse-public-debates` | yes | yes |
| `view-public-debate` | yes | yes |
| `publish-a-debate` | yes | yes |
| `unpublish-a-debate` | yes | yes |
| `delete-a-private-debate` | yes | yes |

Every file has exactly these front-matter fields in this order: `id, lang, title, status, sources, verified_against, ratified_by, ratified_on`. All entries are `status: intended`; both ratification fields are empty. This deliberately does not impersonate V. All entries use `verified_against: "2b670d30"` and only line-addressed sources from the packet's named seeds.

### Round-1 correction disposition

| Finding | Correction |
|---|---|
| B1 publish oracle/internal mechanics | Publish EN/RO now tells the owner to sign in, open the debate page, choose publish, and re-authenticate. `step-up grant`, `RUN_NOT_FOUND`, service-return wording, and failed-ownership collapsing were removed. |
| B2 anonymous pagination invention | Browse EN/RO now separates signed-in browsing from home at `/` from anonymous opening of a shared `/public/debate/{id}` link. Page-size, offset, pagination, anonymous-list, and “surface” wording were removed. Sources were reduced to the two public route facts. |
| B3 bilingual auth drift | Publish, unpublish, and delete use equivalent `re-authenticate` / `reautentifică-te` wording. The vague Romanian `confirmare suplimentară` wording is absent. |
| N1 wire errors in visitor copy | `DEBATE_NOT_FOUND` and `DEBATE_MUST_BE_PRIVATE` were removed. View names `/public/debate/{id}`; delete says a published debate must be unpublished first. |
| N2 hidden signed-in prerequisite | Getting-started EN/RO now names `/new` and sign-in before starting a run. |
| N3 internal jargon | Unsupported-capabilities EN/RO now uses plain current-product language while preserving the same four unavailable actions. |
| N4 missing page-level procedure | Publish, unpublish, and delete now direct the owner to the debate page and the page's re-authentication step. The copies-may-remain warning stays in unpublish. |

## Authority-hash drift check

Start and end hashes were identical:

```text
4d1daa2133ce9786fc9677ee34fda75b0ec466a4bbbd34e432f828816ca7afdc  .superpowers/sdd/PLAN-SupportAgent/task-0-brief.md
369a6dd8910e888e94b02dc880ddbe3305c45345bd8ed6c983371691096f8b07  docs/missions/observability-agents/slices/SUP-01/SPEC.md
71ce4dbf93b9a00eda66a9cdbf95373af6b69dcc72f3704f52a2dd4592333e88  .superpowers/sdd/PLAN-SupportAgent/sup-00-kb-grok-verdict.md
```

No hash drift occurred. The six seed files in the assigned worktree also remained clean against HEAD.

## RED, GREEN, and refutation evidence

### Initial RED

Property: all 12 fixed ids must have both `.en.md` and `.ro.md` files.

Before authoring, the structural check exited `1` and reported:

```text
RED: missing 24 required corpus files
```

After authoring, the complete validator reported 12 bilingual pairs and 24 files.

### Deliberate mutants

| Property | Mutant applied | RED evidence | Restore evidence |
|---|---|---|---|
| No V ratification is invented | changed one `status: intended` to `status: shipped` while ratification stayed empty | exit `1`; named `getting-started-debate.en.md` | GREEN: all 24 entries intended and unratified |
| Every source resolves | changed `apps/ui/app/new/page.tsx:27` to line `9999` | exit `1`; named the invalid source in `risk-tier-choice.en.md` | GREEN: every source reference resolves to a nonblank line |
| Forbidden claims remain absent | inserted the word `price` into one body | exit `1`; `forbidden-claim hits=1` | GREEN: forbidden-claim scan = 0 |
| Filename and front matter remain paired | changed the Romanian `view-public-debate` front-matter id to another id | exit `1`; named `view-public-debate.ro.md` | GREEN: all 12 ids have matching en/ro front matter |
| Neighboring changes are not over-caught | changed only an English localized title | expected GREEN from the intended/unratified assertion | original title restored |

`git status --short -- packages/support-kb/content` was printed after every restore and showed only the expected untracked corpus directory; no mutant residue remained.

### Round-1 product-truth RED/GREEN and refutation

Before the correction, the new focused product-truth probe exited `1` with **55 named failures** across publish, browse, unpublish, delete, view, and getting-started. It reported the missing page/route/re-authentication concepts and the forbidden grant, pagination, vague-translation, and wire-error wording. After the six pair corrections, that exact probe reported:

```text
GREEN: focused product-truth contract; failures=0
```

Round-1 mutants:

| Property | Mutant | Expected result | Restore |
|---|---|---|---|
| Publish help is visitor-facing | replaced `re-authenticate` with `step-up grant` | RED, exit 1: internal grant wording rejected | GREEN; page-level re-authentication restored |
| Browse help is not backend pagination | inserted page-size, offset, and anonymous-list copy | RED, exit 1: backend pagination wording rejected | GREEN; home/shared-link distinction restored |
| EN/RO name the same auth act | replaced Romanian `reautentifică-te` with `confirmare suplimentară` | RED, exit 1: bilingual-equivalence property rejected the vague wording | GREEN; explicit re-authentication restored |
| Neighboring title edit is outside the body property | changed only the English publish title | GREEN as expected | original title restored |

`git status --porcelain` was printed after every restore and showed only the two cumulative allowed untracked artifacts: the corpus directory and this report. No mutant residue remained.

One focused verifier initially reported RED for `unsupported-capabilities` even though all concepts were present. Systematic diagnosis showed `full_v3=true`, `body_v3=false`: the only match was the required source path `apps/ui/lib/v3/...`. Scoping the jargon assertion to user-visible title/body made the check GREEN without changing citations.

### Verification-harness RED frame

The first three-run attempt was RED because the verifier passed project-relative citation paths directly to `git show`. The worktree Git root is one directory above the project and `git rev-parse --show-prefix` returns `dialectical-engine/`. The diagnostic evidence showed that `HEAD:dialectical-engine/apps/api/src/index.ts` exists while `HEAD:apps/api/src/index.ts` does not. The single harness correction was to prepend the detected prefix only for Git-object reads. No corpus content changed for this correction.

## Exact artifact verification

The corrected validator performed all of the following on every run:

- exact 24-file set for the 12 fixed ids and two languages;
- exact eight-field front-matter order, with no missing or extra fields;
- filename/front-matter `id` and `lang` agreement;
- `status: intended` and empty `ratified_by` / `ratified_on`;
- `verified_against` equal to worktree HEAD `2b670d30`;
- every `sources` item restricted to a packet seed and resolving to a nonblank line in the Git object at `2b670d30`;
- nonempty, distinct English/Romanian bodies, each no longer than 120 whitespace-delimited words;
- exact corrected source lists for the six reworked procedures;
- bilingual concept equivalence across all 12 pairs, including explicit EN/RO re-authentication for publish, unpublish, and delete;
- product-truth requirements for signed-in home browsing, anonymous shared-link viewing, debate-page owner actions, `/new`, `/`, and `/public/debate/{id}`;
- rejection of API grants, wire errors, pagination controls, anonymous-list claims, and service-return/oracle explanations in visitor copy;
- forbidden pricing, model-count, and verdict-proof claim scan;
- byte-level whitespace checks: no CR, tabs, trailing whitespace, or missing final newline.

Three-run cluster result; worst run governs:

| Run | Structure | Source lines | Bilingual | Product truth | Forbidden hits | Whitespace | Exit |
|---:|---|---|---|---|---:|---|---:|
| 1 | 24/24; 8/8 fields | 100/100 at `2b670d30` | 12/12 | 12/12 | 0 | clean | 0 |
| 2 | 24/24; 8/8 fields | 100/100 at `2b670d30` | 12/12 | 12/12 | 0 | clean | 0 |
| 3 | 24/24; 8/8 fields | 100/100 at `2b670d30` | 12/12 | 12/12 | 0 | clean | 0 |

Worst run: **PASS**.

Additional exact evidence:

- `ls packages/support-kb/content | sort` returned the 24 expected names, with one `.en.md` and one `.ro.md` for every id in the table above.
- Ruby `YAML.safe_load` parsed all 24 front-matter blocks; every printed key list was exactly `id,lang,title,status,sources,verified_against,ratified_by,ratified_on`.
- `grep -Eic 'price|cost|five|SUPPORTED means|CONTESTED means' packages/support-kb/content/*.md` printed `0` for every one of the 24 files. Its process exit was `1`, which is grep's expected no-match status.
- Each comprehensive round-1 validator run reported exactly: `PASS structural=24/24 fields=8/8 status=intended ratified=empty sources=100/100@2b670d30 bilingual=12/12 product_truth=12/12 forbidden_hits=0 whitespace=clean`.

## Files changed

Round 1 modified exactly these corpus files:

- `packages/support-kb/content/getting-started-debate.en.md`
- `packages/support-kb/content/getting-started-debate.ro.md`
- `packages/support-kb/content/browse-public-debates.en.md`
- `packages/support-kb/content/browse-public-debates.ro.md`
- `packages/support-kb/content/view-public-debate.en.md`
- `packages/support-kb/content/view-public-debate.ro.md`
- `packages/support-kb/content/publish-a-debate.en.md`
- `packages/support-kb/content/publish-a-debate.ro.md`
- `packages/support-kb/content/unpublish-a-debate.en.md`
- `packages/support-kb/content/unpublish-a-debate.ro.md`
- `packages/support-kb/content/delete-a-private-debate.en.md`
- `packages/support-kb/content/delete-a-private-debate.ro.md`
- `packages/support-kb/content/unsupported-capabilities.en.md`
- `packages/support-kb/content/unsupported-capabilities.ro.md`
- `.hermes/reports/observability-agents/agent-reports/SUP-00-KB-sol.md` (this same handoff)

Cumulatively, the first pass created the following allowed files:

- `packages/support-kb/content/<id>.en.md` and `packages/support-kb/content/<id>.ro.md` for each of the 12 ids in the delivered-artifact table (24 files)
- `.hermes/reports/observability-agents/agent-reports/SUP-00-KB-sol.md`

No readonly seed, plan, spec, test/eval case, application source, or other seat's artifact was edited. Scoped final status is expected to show only:

```text
?? .hermes/reports/observability-agents/agent-reports/SUP-00-KB-sol.md
?? packages/support-kb/content/
```

## Constants disclosed

- ids: the 12 packet-fixed ids, unchanged
- languages: `en`, `ro`
- status: `intended`
- ratification fields: empty strings
- verification commit: `2b670d30`
- body ceiling checked: 120 words
- source syntax: packet-seed project path plus one existing nonblank line number

No migration number, runtime setting, model number, verdict interpretation, or pricing figure was added.

## Limitations and findings

- V has not ratified this prose. The SUP-01 loader contract will ignore every entry until V changes approved entries to `status: shipped`, `ratified_by: V`, and supplies `ratified_on`.
- Romanian copy has not had native-speaker review. That review should be part of V's ratification gate.
- This ticket owns corpus artifacts only. No loader, runtime, UI, API, or evaluation-case behavior was run or claimed.
- The packet-specific source contract was followed; `docs/founding/ui-boundary-contract.md` was not quoted and was not needed for any final corpus claim.
- Unexpected tooling finding: this linked worktree's Git root is the parent of the project directory, so Git-object verification needs the dynamic `--show-prefix` value even though user-facing source references correctly stay project-relative.

## Self-report — murder-case analysis

### What actually consumed time and tokens

1. **The verifier lacked repository-prefix awareness.** The first full cluster spawned a large repeated error stream. The immediate cause was using project-relative citations as root-relative `git show` paths. The systemic cause is that the packet supplies a nested project worktree but no canonical artifact-validation command.
2. **The same schema logic was repeated inline.** File-pair, front-matter, source, and forbidden-claim checks had to be expressed in transient scripts. Repetition increased both prompt volume and the chance that the verifier itself would be wrong.
3. **Line-level claim review was manual.** The prose had to be compared against six seed surfaces claim by claim. Three claims were tightened after this audit: an absence-based description-field statement was removed, the unpublish persistence statement gained its disclosure source, and the deletion outcome gained its response source.
4. **The pre-ratification state differs from the broad Task-0 DoD.** The brief describes ratified shipped entries, while this packet correctly orders `intended` entries because V has not acted. The packet resolved the decision, but automation needs an explicit phase flag to avoid treating the intentional pre-ratification state as a failure.
5. **Generic heartbeat instructions and the narrow packet are not mechanically merged.** The generic worker workflow names additional mission files and board operations, while this packet declares all nonlisted files forbidden and says the task is not ticketed. Human interpretation was required to apply the packet-specific contract without expanding scope.

### Round-1 forensic addendum

1. **The first-pass oracle was too structural.** File counts, YAML, source-line existence, and forbidden words all passed while two entries still converted backend behavior into false visitor procedures. The missing assertion was “could a visitor actually follow this sentence in the UI?”
2. **API truth was mistaken for help truth.** Pagination limits and collapsed authorization errors were accurate handler facts but harmful support copy. A Help Corpus validator needs a separate visitor-language deny list and route/procedure contract, not merely source resolution.
3. **Distinct translations did not prove equivalent translations.** The first validator checked only `EN body != RO body`; it could not detect `step-up grant` versus `confirmare suplimentară`. The round-1 verifier now checks paired concepts for all 12 ids.
4. **Verifier scope caused another false RED.** Searching whole files for `V3` caught the legitimate `/v3/` source path after the user copy had been fixed. Assertions about user-facing jargon must inspect title/body, while source-policy assertions inspect front matter separately.
5. **The source packet omits the visitor UI files that define these procedures.** The review supplied the resulting truth, but future packets should include the owner home and publication-control sources in readonly scope or provide their ratified facts in a claim matrix. Otherwise an author must choose between incomplete help and evidence that cannot directly cite the visible procedure.

### What to upgrade

- Check in or attach a canonical `support-kb` validator that accepts `--phase intended|ratified`, discovers `git rev-parse --show-prefix`, parses YAML, validates the fixed id manifest, resolves citations from Git objects, and emits the three-run table.
- Put the 12 ids, allowed source files, expected front-matter keys, forbidden patterns, and authority hashes in one machine-readable packet block. Generate both the validation configuration and author template from that block.
- Provide a seed claim matrix: `id -> allowed claims -> exact source lines`. This preserves independent prose authorship while removing repeated source archaeology and making unsupported negative claims easier to reject.
- Add a native-Romanian review seat or a ratification checklist that explicitly checks product terminology such as `run`, `Topic`, `Tree`, and `Outline`.
- State packet overrides explicitly: `generic read-order superseded by readonly list`, `board unavailable`, and `owner.session uses dispatch id`. That removes ambiguity without weakening the heartbeat contract.
- Keep mutation checks as named validator fixtures rather than mutating production artifacts in place. A validator fixture for missing pair, bad status, bad source, forbidden claim, and harmless title change would make refutation repeatable and cheaper.
- Add visitor-language policy checks that reject wire codes, token/grant vocabulary, pagination parameters, and anti-enumeration behavior in corpus bodies unless V explicitly ratifies them as user copy.
- Make bilingual validation concept-based per id. A deterministic per-pair concept matrix is cheaper and stronger than checking only that the two bodies differ.

### One-prompt-machine shape

A stronger single prompt would contain: the machine-readable state block; absolute worktree and output paths; immutable authority hashes; fixed ids; eight-key schema; pre-ratification phase; seed claim matrix; one canonical validation command; five supplied mutant fixtures; and the exact handoff template. The worker would then perform only four reasoning-heavy acts: verify authority, author bilingual prose, audit each sentence against the claim matrix, and run the canonical verifier three times. Everything else becomes deterministic tooling output.

## Handoff

Round-1 corpus corrections and this report are ready for independent peer re-review. The worker has not self-approved, committed, pushed, merged, marked Done, or entered V ratification.

`comments read through: sup-00-kb-grok-verdict.md:217 + 2026-09-03 rework dispatch (original cursor not-ticketed/user-request-2026-09-02)`
