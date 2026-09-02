# I09 — Domain copy modules · SPEC

> **SPEC v2 — supersedes `SPEC-v1.md`, 2026-09-02, REQ-01 rework round 1.**
>
> Written in answer to the blind review `docs/missions/translation/reviews/REQ-REV-01.md`. This is a **defect correction with no scope change**, so it needs no V ratification; v1 is archived beside this file and remains the record of what was frozen first.
>
> **What changed:** B4 — 14 machine-code invariant strings removed from the census; figure 229 → 215. N5 — added the requirement re-pointing `apps/ui/lib/scoringResponse.test.mjs`, which asserts return values and is covered by no oracle. B1 — added the write-concurrency section.

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I09` · catalog namespace `domain` · census **215** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Move the domain copy modules under `lib/` into the `domain` catalog — the condition-mark vocabulary, abstention kinds, scoring status copy, scrutiny labels, recommendations, live-event sentences and the API error messages. These are the words the product uses about itself, and they are read by every screen.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I09-R01` | Every one of the 229 strings this slice owns, listed per file in `requirements/census.md`, is read from `locales/<code>/domain.json` and no longer appears as a literal in the owned files. | R23, R25 |
| `I09-R02` | `locales/en/domain.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it that no owned file reads. | R25, R28 |
| `I09-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, glyphs and keyboard shortcut names, as listed in R31. | R31, R32 |
| `I09-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured from this slice's base commit with the same fixtures, and the baseline was committed before the first extraction edit. | R34, R35 |
| `I09-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the owned files renders identically before and after. | R35 |
| `I09-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this slice owns. | R23 |
| `I09-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not two fragment keys. | R23 |
| `I09-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice I11. | R38, R39 |
| `I09-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against its source text is re-pointed at the catalog or at rendered output inside this slice. | R52 |
| `I09-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | R53 |
| `I09-R11` | The 28 condition-mark labels and the 5 abstention-kind labels in `lib/v3/labels.ts` become catalog keys whose key names are the contract's own vocabulary values, so a new mark added to `@debateai/contract` fails the exhaustive switch exactly as it does today. | R23 |
| `I09-R12` | The `pluralize` helper at `lib/scoringResponse.ts:125` and its four call sites keep their current English output in this slice; slice I11 replaces the mechanism. | R39 |
| `I09-R13` | `lib/api.ts` and `app/api/[...path]/route.ts`: a message a reader can see is extracted; an error *code* such as `API_UPSTREAM_UNREACHABLE` or `DIALECTICAL_API_BASE_REQUIRED` stays a literal, and the slice records which of the two each string is. | R23 |
| `I09-R14` | `lib/v3/adapter.ts:363-368`, which builds a percentage by string concatenation, keeps its current output in this slice and is listed as an input to slice I11. | R41 |
| `I09-R15` | `tests/unit/dr174-resilience.test.ts`, `tests/unit/dr184-judged-standing.test.ts` and `tests/unit/pol01-policy.test.ts`, all GREEN at `4f764037` and all asserting on this slice's modules, stay green or are re-pointed inside this slice. | R52 |
| `I09-R16` | `apps/ui/lib/scoringResponse.test.mjs` asserts the RETURN VALUES of `lib/scoringResponse.ts` (57 assertions) and is covered by no oracle in this mission — O1 renders component HTML, not module return values. It is re-pointed inside this slice. | R52 |

## States

- Every screen that reads these modules renders in English identically to before.
- With another language active, the honesty vocabulary, scoring status lines and live-event sentences are in that language.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Open a debate that carries condition marks and choose **한국어**. | The condition marks in the honesty drawer read in Korean — "Stale", "Under review", "Attribution ambiguous" and the rest. |
| 2 | Start a run and watch the live status line. | The progress sentence reads in Korean. |
| 3 | Open the scoring panel on a debate whose scoring failed. | The scoring status copy reads in Korean. |
| 4 | Look at a scrutiny badge on a node. | Its label reads in Korean. |
| 5 | Disconnect the API and reload. | The upstream error message a reader sees reads in Korean; the machine error code in the response body is unchanged. |
| 6 | Switch back to **English**. | Every one of those strings reads exactly as it did before this mission. |

## Out of scope

- The screens that render these strings (slices I05–I08, I10).
- Plural and number mechanisms (slice I11).

## Owned files — exhaustive

**Extraction ownership** — this slice moves these files' strings into the catalog, and no other slice does. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/lib/v3/labels.ts` | 36 |
| `apps/ui/lib/v3/adapter.ts` | 36 |
| `apps/ui/lib/v3/liveEvents.ts` | 3 |
| `apps/ui/lib/v3/tokenUnlock.ts` | 9 |
| `apps/ui/lib/v3/answerExport.ts` | 6 |
| `apps/ui/lib/v3/missingCapabilities.ts` | 4 |
| `apps/ui/lib/scoringResponse.ts` | 27 |
| `apps/ui/lib/scoringStatusCopy.ts` | 15 |
| `apps/ui/lib/scoringFormat.ts` | 13 |
| `apps/ui/lib/debatePresentation.ts` | 23 |
| `apps/ui/lib/recommendation.ts` | 10 |
| `apps/ui/lib/scrutiny.ts` | 16 |
| `apps/ui/lib/scrutinyDepth.ts` | 6 |
| `apps/ui/lib/api.ts` | 2 |
| `apps/ui/lib/models.ts` | 3 |
| `apps/ui/lib/makerIdentity.ts` | 1 |
| `apps/ui/lib/observability/suspiciousScoring.ts` | 4 |
| `apps/ui/lib/observability/logger.ts` | 1 |
| `apps/ui/lib/observability/index.ts` | 0 |
| `apps/ui/lib/scoring/scoringResponseSpecification.ts` | 0 |
| **Total** | **215** |

**Write concurrency** — a different property from extraction ownership, and this section is the one that satisfies the SINGLE WRITER law. This slice writes the files below without owning them for extraction; each row names the wave rule that makes the write safe.

| Also written | What this slice does to it | Why it is not a concurrent write |
|---|---|---|
| `tests/unit/dr174-resilience.test.ts`, `tests/unit/dr184-judged-standing.test.ts`, `tests/unit/pol01-policy.test.ts`, `apps/ui/lib/scoringResponse.test.mjs` | re-point assertions on the copy modules' return values | R52 + R57. `scoringResponse.test.mjs` asserts return values, not rendered HTML, and is named explicitly because no oracle covers it (N5). |

