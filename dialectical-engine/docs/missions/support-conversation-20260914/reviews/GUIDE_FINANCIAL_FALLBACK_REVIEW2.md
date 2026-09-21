# GUIDE_FINANCIAL_FALLBACK_REVIEW2

Verdict: **PASS_FINANCIAL_REVIEWED_FALLBACK** at exact clean product revision `0d34f82f4a2188d0ce1db04655b693798ffd2169`.

The finite declared-family parity correction is complete. Financial model drafts continue to use the approved reviewed fallback without polarity interpretation. The delta adds only the closed missing table and its discriminators:

| Declared family | Covered normalized forms |
| --- | --- |
| payment / pay / paid | existing `pay-`, `paid`, `plat-`, `achit-` |
| purchase / buy / bought | existing `purchas-`, `buy-`, `cump-`; new `bought`, `achiz-` |
| billing | existing `bill-`; new `factur-` |
| transaction | existing `transaction-`; new `tranzact-` |
| charge | existing `charg-`; new bounded `debitare` / `debitat-` and `taxare` / `taxat-` |

Normalization removes Romanian accents before matching, so `achiziție`, `facturată`, `tranzacții`, `debitată`, and `taxată` reach the intended ASCII stems. The charge forms are bounded: bare `debit` does not match, and `tax-` requires `are` or `at`. The paired controls therefore preserve flow-rate `debit`, `taxonomie`, and `taxonomic`. The existing `plat(?!form)` continues to preserve `platform` / `platformă` while admitting `plată` forms.

The tests discriminate the new table rather than only asserting counts. Eleven exact financial forms fail before the correction and pass afterward. Direct controls preserve English `bought`, Romanian purchase/billing/transaction/charge variants, both singular and inflected forms, and the required nonfinancial near-neighbors. Ordinary Pricing navigation, creation-only and menu prose remain conversational.

Representative full-boundary evidence remains useful:

- Full44 EN/RO answer-service recovery includes the new Romanian `Facturarea...` draft and returns `ANSWER_GROUNDED` with `app-navigation`, no action and nonempty reviewed guidance.
- The real POST control uses `Tranzacția are loc în creatorul de dezbateri.`, returns HTTP 200 reviewed recovery, calls the model once, and persists `model_called=true` with `input_tokens=5`.
- The selected reviewed fallback states that Pricing is informational and sign-in precedes New debate. It does not invent a universal absence of payments, an action, a refusal, an empty answer, or human escalation.

## Retained dispositions

- **PASS**: deterministic fallback architecture; no financial polarity inference.
- **PASS**: finite English/Romanian family parity and required nonfinancial controls.
- **PASS**: useful full44 EN/RO guidance and real POST persistence/accounting.
- **PASS_RETAINED**: exact LIVE28 rejection, both ordering directions, modifier and benign-negative financial drafts.
- **PASS_RETAINED**: source/action admission and private-data, credential, injection and security precedence.
- **PASS_RETAINED**: strict44 KB `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af` and all attestations.
- **PASS_RETAINED**: Screenshot30 complete full-answer capture.
- **NOT_ESTABLISHED**: runtime, BIND32, actual31, capacity, readiness, completion and acceptance. Forgot remains unresolved/actionless and CP2 remains gated.

## Evidence and limits

- Author receipt SHA-256: `4ae2916588e6b7a8a0740e44902ee4e5b80d6036a5a95891b0cd43c6d3504c90`.
- Author consumption SHA-256: `8e0676e48029cffc667ddd99557909f88f18dee048d1d91c0b4dc3fcee058b1b`.
- Final affected-suite log SHA-256: `56f5b8ef9b346e32d8243e244b19dbdfd45755f83113af398ab5d5f26d100abc`.
- Policy result: 262/262; affected three-file result: 494/494.
- Indexed inputs: 27/27 hashes and byte counts verified.
- Product diff: exactly four scoped files; checkout is clean.
- Typecheck was not repeated; the 76-diagnostic baseline remains qualified only at the parent revision, while changed TypeScript compiled in the affected Vitest frame.
- Review traffic: runtime, browser, HTTP, status, capacity, database, Support and model all zero.

This PASS is limited to the closed declared-family table and directly introduced regressions. It does not authorize broader vocabulary expansion or make a runtime/readiness claim.
