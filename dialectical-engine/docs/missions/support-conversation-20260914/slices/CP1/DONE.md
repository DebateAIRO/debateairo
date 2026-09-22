# CP1 owner verification — approved Support interface

The owner has already approved the existing Support widget and `/help` desk as the interface of record. CP1 keeps that design and adds reviewed sources plus safe action controls inside it.

## Required screen/state inventory

- Signed-out compact Support widget: disclosure, EN/RO selector, conversation, safe actions, and immediate `Talk to a human`.
- Signed-out full `/help`: existing header/topics/status/conversation/details/shortcuts layout with the same reply/action contract.
- Signed-in versions of both surfaces: the same behavior plus existing consent-gated own-status controls.
- Grounded product answer: canonical escaped text, reviewed visitor-safe source labels, and only server-resolved first-party actions.
- Deterministic Forgot password guidance: existing verified flow action, no credential field in Support, and no Support-originated reset request.
- Unsafe model completion: short server-authored safe response; rejected secret/link/reset text is absent from the page and storage.
- Degraded/disabled/rate-limited/shredded states and human case flow: existing behavior retained.

## Manual verification script

Run this only on the reviewed integrated CP1 revision and the separately prepared repository-supported stack on disjoint ports. Do not stop or reuse the existing services on UI 3001, API 8790, or providers 8791–8796.

1. Open the full `/help` page at the preview URL. Confirm the established help-desk layout remains intact. The existing status block may still say `Debate engine`; status-label truth is a CP3 acceptance item and is not evidence for or against CP1.
2. In English ask, `How do I create a debate?` Expect current `/new` prerequisites/limitations, at least one reviewed source label, and a **Start a debate** first-party action.
3. Ask, `What can I change in Settings?` Expect sessions, consent preferences, legacy claim and account erasure; expect no claim that email, password, active MFA or deployment settings can be changed there.
4. Ask about export. Expect conditional JSON export and no Markdown/full-account export promise.
5. Switch to Romanian and ask equivalent creation and Settings questions. Expect Romanian text and labels with the same destinations and limitations.
6. Ask `Forgot password`, `I forgot my password`, and `Am uitat parola`. Expect the exact existing Forgot password action every time. Activate it by keyboard and pointer; expect only the verified first-party flow to open and no reset/credential submission from Support.
7. Open the compact widget and repeat one grounded question plus `Am uitat parola`. Expect the same canonical text/actions, disclosure, keyboard names and immediate human option in the compact layout.
8. Use `Talk to a human`. Expect the existing asynchronous case flow and the actual 48-hour SLA; do not expect a telephone call.
9. Inspect the captured boundary probe results. For malformed and credential/reset model completions, expect outcome `REFUSE_SAFETY`; expect the rejected text absent from decrypted storage, API JSON and rendered text, with zero auth/recovery calls, no rating or resolution credit, no E6/model-rejection-only E2, retained relay availability and recorded usage.
10. Record the preview URL, exact branch/revision, EN/RO results, action destinations, captured suite logs and remaining limitations in the checkpoint evidence.

The automated acceptance evidence must also show a valid session pinned to snapshot A answering only from A, and an unavailable A returning the exact 409 before model/persistence. The browser must create a B session and retry the redacted current request once, without a retry loop.

## Blocking evidence still required

The exact Forgot password URL or UI opener is unresolved at this requirements freeze, and the supported disjoint-port preview configuration is under separate investigation. Steps 1–10 cannot be reported complete until both prerequisites are evidenced. Silence, elapsed time, reviewer PASS or a working recovery backend does not satisfy either prerequisite.
