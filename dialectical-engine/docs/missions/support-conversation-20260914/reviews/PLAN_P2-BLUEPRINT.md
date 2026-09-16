# PLAN_P2 implementation blueprint

## Decision and measured boundary

The final CP1 correction uses a reviewed deterministic recovery component for every shipped article/language. The component contains two immutable strings: a model projection and a visitor fallback. It is stored separately from review metadata so its digest is not self-referential. The model still gets one attempt with the current model and relay. A valid screened draft remains authoritative. A rejected ordinary knowledge draft can recover only from the exact fallback bound to the request's already-pinned top source.

The read-only census at product revision `e0dcfe77f49655bea774bdfacf988b911be4ff06` found 18 logical shipped articles and 36 filesystem entries: 18 English and 18 Romanian. The production API has no separate in-code entries. Twelve pairs currently qualify through Sol article review and six through legacy owner ratification. Those facts apply only to the existing articles. All 36 new projection/fallback records require a new separate editorial review and start with blank owner ratification.

The exhaustive entry list, source origins, current article digests, existing provenance, absolute paths, proposed write ownership, and test union are in `PLAN_P2-inventory.json`. Test fixtures and `tests/support-eval/run.ts` are not production corpus members or preview-admission evidence.

## Exact component and attestation schema

`packages/support-kb/recovery/components.json` has exactly this shape:

```json
{
  "schemaVersion": 1,
  "components": [
    {
      "id": "account-access",
      "lang": "en",
      "articleSha256": "<exact article file SHA-256>",
      "modelProjection": "<complete reviewed model-facing facts>",
      "fallback": "<complete reviewed visitor-facing answer>"
    }
  ]
}
```

The top level and every record use exact key sets. Records sort by Unicode code point on `id`, then `en`, then `ro`; each `(id, lang)` is unique. The component key set must equal the shipped article key set. Each string is nonblank valid Unicode. `articleSha256` must match the exact source article bytes. `modelProjectionSha256` and `fallbackSha256` mean SHA-256 of the exact UTF-8 bytes of the corresponding JSON string value after JSON decoding. `componentFileSha256` means SHA-256 of the exact file bytes.

`packages/support-kb/reviews/manifest.json` moves to schema version 2 without changing the existing catalog and article records. It adds:

```json
{
  "recovery": {
    "componentFileSha256": "<exact components.json SHA-256>",
    "components": [
      {
        "id": "account-access",
        "lang": "en",
        "articleSha256": "<exact article file SHA-256>",
        "modelProjectionSha256": "<exact projection UTF-8 SHA-256>",
        "fallbackSha256": "<exact fallback UTF-8 SHA-256>",
        "reviewedBy": "SOL",
        "reviewerSession": "<actual separate reviewer session>",
        "reviewedOn": "<actual ISO date>",
        "evidence": "<absolute editorial report path>",
        "ratifiedBy": "",
        "ratifiedOn": ""
      }
    ]
  }
}
```

The review array has the same order and complete key set as the component file. `reviewedBy` is exactly `SOL`; session, date, and evidence are nonblank and real. Owner fields are paired: both blank for this implementation, or later both valid with `ratifiedBy: "V"` only after owner acceptance. Existing article ratification never fills recovery ratification.

The loader rejects or excludes a component when the file, schema, key set, order, uniqueness, language pair, article binding, component-file digest, field digest, reviewer identity, evidence, or paired ratification is missing, malformed, stale, or tampered. Production API and status CLI use a strict `requireReviewedRecovery` mode and fail startup before publishing a snapshot unless every shipped pair is complete and reviewed. Focused fixtures may use non-strict mode to prove individual exclusion; they cannot be used by production callers.

Corpus admission also screens every projection and fallback with the shared canonical text views, credential-operation relation, path/link/markup rules, current closed canonical identifiers, and repository metadata patterns. Projection construction must not copy the raw body mechanically. Review must establish factual completeness in the target language. A digest match does not replace semantic review.

## Runtime types, snapshot, and context

Add an admitted entry type carrying the existing immutable article fields plus required `modelProjection`, `fallback`, and server-only recovery-review metadata. `LoadedHelpCorpus.entries` contains only admitted entries. Deep-freeze every record and array before building `HelpCorpusSnapshotLookup`; request processing reads the selected snapshot only and never reopens live component, article, catalog, or review files.

Keep existing pair counts and add internal recovery pair counts so article provenance and recovery provenance remain distinct. At final attestation the expected values are 18 shipped, 0 ignored, 12 Sol-reviewed article pairs, 6 owner-ratified article pairs, 18 Sol-reviewed recovery pairs, and 0 owner-ratified recovery pairs. Do not add these fields to the public Support message shape.

`kbVersion` hashes the exact component file bytes and a canonical manifest of every selected component key, article digest, projection digest, fallback digest, and selected review metadata in addition to the existing catalog, article, and provenance inputs. Changing any projection, fallback, article, review identity, evidence, or ratification therefore creates a new version. The request's session version continues to resolve through the immutable lookup; an unknown or stale version keeps the existing `409` boundary.

`buildSupportKnowledgeContext` accepts admitted entries. Ranking remains deterministic and completes before the model call. It returns source IDs in the exact ranking order; index zero is the pinned top source used for recovery. The model context renders only policy text, screened human capability labels/availability/action labels, opaque request-local aliases, and each selected entry's complete `modelProjection`. It never renders raw article body, raw title, canonical source/action/capability IDs, routes, or repository metadata.

Preserve the 24,000-code-point system ceiling without slicing a projection or factual section. Compute the fixed policy/catalog/output-contract cost first, then add ranked complete projections while they fit. If the top projection cannot fit, produce no eligible source and do not call the model. Do not truncate a component into a misleading partial statement.

## Answer transition

Before the single existing model attempt, capture from the pinned snapshot:

1. the complete selected-entry array;
2. the deterministic top entry at `context.sourceIds[0]`;
3. that entry's exact reviewed fallback;
4. source-appropriate action IDs: the intersection of current-context available action IDs and action IDs of catalog capabilities that cite the top article.

The normal accepted-draft path stays unchanged: translate request-local aliases, validate membership, screen text, attach canonical sources and trusted actions, and persist the canonical cipher return.

Recovery eligibility comes only from the server's trusted ordinary-knowledge request path and pinned source, never from `draft.kind` or any other rejected completion field. For every rejection predicate on that path, including invalid JSON, exact-key-set, kind, schema, text, source, and action failures, emit only the existing bounded fixed-category diagnostic. Discard the complete draft, raw completion, source/action arrays, and any user/model-derived replacement text. Do not retry. If the pinned top entry has an admitted fallback, screen that exact fallback again with the final response policy. Resolve only the captured source-appropriate action IDs through `resolveSupportActions` for the request's trusted signed-in context, preserving the existing maximum. Persist the exact fallback as `ANSWER_GROUNDED`, return the cipher write result as HTTP text, cite only the pinned top canonical source, and apply the normal grounded rating/resolution effects. Preserve the rejected model call's actual usage, spend/reservation, relay, circuit, timeout, degraded recovery, and first/completed timestamps.

Do not append incident text to the fallback because that would break exact-byte identity. If the fallback is absent, invalid, no longer matches the pinned entry, or fails the final screen, take the existing `REFUSE_SAFETY` branch with the existing fixed refusal, empty sources/actions, no grounded rating/resolution effects, and preserved model accounting. The recovery branch must never use a newer snapshot, second-ranked fallback, rejected arrays, raw article body, interpolation, substring rewriting, or a second model call.

Case summaries are outside this branch. They retain the exact four-key `case_summary` envelope, empty source/action arrays, one attempt, and deterministic bounded safe replacement. No conversational outcome/rating is invented for summaries. Existing canonical cipher, privacy, private-context, consent, ownership, encryption/shred, degraded, human-handoff, queue, spend, reservation, and runtime-model behavior remain unchanged.

## Security correction design

Use the same pure kernel facts in input redaction, response-policy screening, summary screening, and recovery admission. Do not copy approximate regexes between sinks.

**U3, value spans.** Once a supported credential label and assignment connector are recognized, a balanced quote owns its complete contents. An unmatched opening quote owns through a safe hard delimiter or end of input. An unquoted value owns through newline/semicolon or a comma that starts a declared coordinator. Dots, hyphens, slashes, spaces, and punctuation internal to that span do not terminate it. When a bounded scanner exhausts its work allowance, redact through end rather than retain an unchecked suffix. Keep benign intent-only mentions with no connector.

**U4, relation and object binding.** Split independent clauses at additive/causal coordinators and at a new explicit subject or finite/modal/auxiliary verb group. Cover English `may`, `might`, `can`, `could`, `will`, `would`, `should`, `must`, `is`, and `are`, plus Romanian `poate`, `pot`, `va`, `vor`, `ar`, `este`, `sunt`, and `trebuie`. A positive credential operation is rejected only when its governed object is a credential term or a bounded pronoun that resolves to a credential in the immediately relevant group. Explicit display-name/account-name/profile-name objects do not bind to an older credential. Negation remains group-local and is not a blanket bypass. All 52 current human labels must pass in neutral factual frames; hostile EN/RO, obfuscated, pronoun, supplied-value, and transformed/validated credential controls remain rejected.

**U5, canonical path views.** Screen every canonical decoded view for root slash or backslash, relative `./`, `../`, `.\\`, `..\\`, drive-root `[A-Za-z]:[\\/]`, UNC `\\\\host\\share`, protocol-relative, URL, markup, and encoded equivalents. Malformed or unsafe decoding fails closed. Preserve benign percentages, ordinary punctuation, and non-path text.

**U6, closed identifiers.** Preserve all 35 current hyphenated catalog/article/action IDs, current request-local aliases, stale/unknown/duplicate alias rejection, canonical decoding, and no narrative ID leakage. Recovery prose and projections receive the same closed-set checks before admission and at the final sink.

These are finite bilingual property matrices over the shipped vocabulary and named transformations. They do not claim proof over arbitrary natural language.

## RED-first implementation sequence and ownership

`FIX_P2` owns exactly the 21 product paths listed in the inventory. It must:

1. Add failing U3-U6 class-transform tests first in `support-credentials`, `support-redaction`, `support-response-policy`, `support-text-views`, route, and case sinks. Each hostile transform has a neighboring benign control.
2. Add failing loader/component tests for exact schema, complete 36-entry coverage by fixture, pair completeness, every digest/provenance failure, semantic admission, immutable snapshots, and `kbVersion` mutation.
3. Add failing context tests proving no raw body/title/IDs/routes/repository metadata reaches the model, complete-section packing, deterministic top source, and the 24,000 ceiling.
4. Add failing answer/route/metrics tests for every rejected predicate, EN and RO recovery, exact fallback/cipher/HTTP equality, canonical one-source provenance, source-appropriate trusted actions, usage/spend/degraded preservation, grounded effects, and invalid/no-fallback refusal effects.
5. Implement the kernel primitives, strict loader, component schema, context projection, and answer transition. Commit the component file without review records. Production strict loading must remain ineligible until `ATTEST_P2`; do not fabricate temporary reviewer metadata.

`EDIT_P2` is a separate Sol editorial session. It receives the exact FIX_P2 product revision, component-file digest, 36-row key/article/projection/fallback digest table, current catalog digest, source definitions, and existing factual evidence. It reviews every EN/RO projection and fallback for fidelity, completeness, natural language, security-boundary compatibility, fallback usefulness, and source-appropriate action guidance. It writes only `EDITORIAL-RECOVERY-p1.md` with PASS/REWORK, actual session/date, exact revision/file/row hashes, row-level disposition, and discrepancies. It cannot edit product, manifest, or owner ratification.

After editorial PASS, `ATTEST_P2` owns exactly two product paths: `packages/support-kb/reviews/manifest.json` and `tests/unit/support-recovery-attestation.test.ts`. It copies the actual reviewer identity, evidence path, component-file digest, and all 36 component hashes into manifest schema v2; owner fields remain blank. Its production-corpus test loads the real 36 entries in strict mode and proves the exact record set, hashes, review evidence, counts, zero recovery owner ratification, semantic admission, and deterministic version. Any mismatch fails closed. ATTEST_P2 then runs the final affected interface/focused checks and one attributed typecheck; it does not run the unchanged full integrated union.

The final implementation test union is exactly the 23 retained LIVE_P1 suites plus the two new recovery suites, 25 files total, in the order listed in the inventory. Focused RED/GREEN frames run only affected clusters. LIVE_P2 owns the one final current-byte execution of that exact 25-file union after attestation; ATTEST_P2 supplies the prior focused checks and attributed typecheck. Final pass 3/3 reviews the exact product revision regardless of LIVE_P2 outcome.

## Refutation matrix

| Property | Required mutant | Required control |
| --- | --- | --- |
| Complete attestation | Delete one language or review row; duplicate/reorder a key | Exact 36-row corpus loads |
| Exact binding | Change component-file, article, projection, fallback, reviewer, or evidence byte | Unchanged digest set yields one stable version |
| Semantic admission | Insert route, closed ID, repository path, credential operation, or unsafe encoding | Reviewed factual limitations and 52 neutral labels pass |
| Snapshot identity | Mutate source/component after snapshot or request a stale version | Pinned version returns the original deep-frozen strings |
| Projection boundary | Substitute raw body/title or slice a factual section | Whole projection only, under 24,000 code points |
| Top-source recovery | Re-rank after model or use second/newer source | Captured index-zero source and fallback only |
| Rejected draft isolation | Feed rejected text/arrays into fallback, source, action, log, case, store, or HTTP | Exact fallback and trusted catalog-derived action set |
| Single attempt | Add retry after any rejection | One completion call and preserved original usage |
| Final screening | Bypass screen or tamper fallback after load | Exact admitted fallback passes and reaches cipher/HTTP equally |
| Outcome effects | Mark recovery as refusal or give refusal grounded effects | Recovery gets grounded effects; invalid fallback gets empty refusal effects |
| U3 span | Unmatched quote, long value, dot/hyphen/slash tail | Intent-only credential discussion remains unchanged |
| U4 relation | Add modal/auxiliary positive group or credential pronoun | Explicit display-name object and group-local negation remain safe |
| U5 paths | Encode slash, backslash, drive, UNC, or relative path | Benign percentages and punctuation pass |
| U6 aliases | Inject closed ID, stale/unknown/duplicate alias, or encoded ID | Current unique request aliases translate once |

## LIVE_P2 consumer and acceptance contract

Before any real traffic, update and run the strict seven-field diagnostic consumer controls. The output record remains exactly `attemptId`, `code`, `predicate`, `hasSources`, `hasActions`, `sourceCount`, and `actionCount`; it retains UUID, known-enum, duplicate, hostile-extra-field, malformed, delayed, and multi-event controls.

The consumer must allow one valid rejection event in a sequential isolated window whose API result is `ANSWER_GROUNDED`, because that is the observable recovery sequence. It records this as a rejected-draft category followed by reviewed fallback, never as accepted model prose. A grounded window with no rejection event remains the accepted-draft case. An incompatible terminal response with an event, multiple/invalid/duplicate events, or any event outside the isolated cursor window is `AMBIGUOUS`. Window isolation is not an API-request join: concurrent or delayed valid events cannot be assigned by `attemptId` alone and must stay ambiguous. No rejected text or matched token is logged.

At the one final exact revision, LIVE_P2 runs the same seven prompts once with no retries and requires seven useful accurate answers. It verifies sources/actions, the English creation pointer, compact Romanian keyboard activation, API/DOM text equality, ordinary system trust, and the supported owned stack idle afterward. A rejection event plus fallback is acceptable only when the returned bytes equal a reviewed fallback from the pinned source. This evidence does not reclassify the fallback as model prose.

Forgot-password navigation remains blocked on the owner's exact destination. PLAN_P2, implementation, attestation, LIVE_P2, and final pass 3/3 do not close CP1 or constitute owner acceptance.
