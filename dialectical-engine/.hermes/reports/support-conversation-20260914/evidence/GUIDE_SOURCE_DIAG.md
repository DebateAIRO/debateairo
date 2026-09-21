# GUIDE_SOURCE_DIAG

## Disposition

**ORACLE PRIMARY SET INCOMPLETE / OBSERVED PRODUCT ANSWER SOURCE SUPPORTED.**

Canonical row 26 did not expose a product transport, rendering, membership, or source-selection failure. Production supplied the exact Romanian request with the ordered reviewed context `app-navigation`, `guide-how-it-works`, and `debate-workspace-menus`. The model cited the first source only. That is legal under the production contract: structured-answer validation requires every cited source to belong to the supplied context, but it deliberately permits a non-empty subset.

The cited source is relevant. The reviewed Romanian `app-navigation` projection says the landing page offers Method and Transcripts/the sample debate, Home is the debate library, Help accepts free text, and Support may explain and offer fixed navigation. Those are the factual anchors in the retained public answer. The menu inventory also assigns landing Method and Transcripts to `app-navigation`; it reserves `guide-how-it-works` for the local How it works control inside an already-open debate.

The mismatch is in the harness oracle. The broad family prompt, “Where can I learn how a debate works?” / “Unde pot afla cum funcționează o dezbatere?”, accepts only `guide-how-it-works` or `debate-workspace-menus` as primary. The pre-request proof checks only that one of those appears somewhere in context. The actual assertion then rejects `app-navigation`, even when production offered it first and its reviewed public facts directly answer the broad where-to-learn question.

## Offline discriminator

The bounded actual-code discriminator loaded the strict 44-entry reviewed corpus at KB version `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`, built the exact Romanian context, and replayed only the retained public answer through the shipped parser, validator, reference translator, source-policy predicate, and text screen.

- Context sources: `app-navigation`, `guide-how-it-works`, `debate-workspace-menus`.
- Requested actions: none; source policy: null.
- Draft diagnostic: `ACCEPTED`.
- Parse, validation, canonical translation, source-policy check, and text screen: pass.
- Translated source IDs: `app-navigation`; action IDs: empty.

The first sandbox attempt failed before product code ran because `tsx` could not create its local IPC socket. The identical authorized offline command then passed. Both captures are preserved. No browser, runtime, HTTP, Support, model, capacity, database, or private-log activity occurred.

## Bounded correction

Make an append-only BIND17 harness/oracle revision. Do not change product, KB content, attestation, model, or runtime behavior for this finding.

The family-level primary-source set should be the same for both paired broad EN/RO rows:

`app-navigation`, `guide-how-it-works`, `debate-workspace-menus`.

This does not make arbitrary source membership sufficient. The actual assertion must still require that the primary source is present in the production-derived proof context. Unrelated sources, missing/empty sources, duplicates, and proof-external sources remain failures.

Add a separate inert local-control discriminator:

- EN: `In an already open debate, what does the How it works control explain?`
- RO: `Într-o dezbatere deja deschisă, ce explică controlul Cum funcționează?`

For those narrower fixtures, primary authority remains only `guide-how-it-works` or `debate-workspace-menus`; `app-navigation` alone must fail. This keeps the public landing Method/Transcripts surface distinct from the control inside an already-open debate.

The new controls must also reject empty or generic non-answers. A useful broad fixture must name or explain the reviewed Method/Transcripts destination; a useful local fixture must explain the already-open-debate control. Preserve API/DOM equality, diagnostic attribution, language, action, privacy, injection, credential, session, pacing, and traffic assertions. Bind the changed matrix and verifier in a new harness digest and separate review; do not relabel LIVE8.

Exact harness write scope: new BIND17 copies of `matrix.mjs`, `pre-request-verifier.ts`, `controls.mjs`, and `verify-guide-harness.mjs`; new ROW_PROOF_BIND17 replay adapter; and their new evidence/manifest/receipt/review files. No product file is justified by this observed failure.

## Limits

The broad paired prompts are semantically ambiguous between the landing learning surface and the already-open-debate guide. Current English retrieval supplies guide/workspace sources, while Romanian retrieval supplies `app-navigation` first. Both can be useful; that bilingual difference alone is not a proved product defect. The retained answer was inspected against the reviewed projection, but this diagnosis does not claim that source membership automatically makes every future sentence useful.

Initial headroom arithmetic is historical only. No capacity read or retry was performed. Forgot remains unresolved and actionless. CP1 remains incomplete; this is not readiness or acceptance.
