# SECPREP case file — frozen Support security preparation

## Question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause 1 — “encrypted” was treated as equivalent to “safe to retain or relay”

The Support redactor recognizes token-shaped material, JWT-like values, and six-digit codes, but it does not recognize ordinary labelled credentials such as `My password is hunter2` or `Parola mea este hunter2`. The server then encrypts the unchanged text and marks it unredacted. A first password message takes the deterministic `REFUSE_ZONE` path and is stored. A second zone refusal triggers E3; case preparation decrypts the session transcript, copies it into a separately encrypted case snapshot, and sends the same transcript to the advisory summary model. Direct case replies use the same incomplete redactor.

**Price.** The primary Support response correctly avoids the answer model and reset APIs, yet the credential can still cross three later boundaries: session storage, case storage, and model summarization. The current route fixture proves the two-turn E3 trigger but uses only the phrase “Reset my password,” so it never tests a supplied credential value. The amended synthetic probe confirmed the full in-memory boundary chain; actual elapsed time and token usage are **UNAVAILABLE**.

**Upgrade.** Define a Support-specific supplied-credential grammar in English and Romanian and apply it before every Support persistence or relay boundary. Test labelled values with `:`, `=`, `is`, `este`, quotes, JSON-like forms, and surrounding punctuation. Preserve ordinary help phrases such as “I forgot my password.” Decrypt the resulting session and case records in the fixture and prove the supplied value is absent before allowing the summary relay to run.

## Cause 2 — the strict completion boundary protects answers, not all Support completions

`parseSupportDraft` and `validateSupportDraft` protect the answer model, but the advisory case-summary service calls the relay directly. Its only output policy collapses whitespace and limits the response to 80 words. A summary containing a credential, reset-success claim, raw or encoded link, markup, or secret-like value can therefore be encrypted and later returned by the case-token GET endpoint.

**Price.** The mission’s response-policy suite and mutation receipts are green while a second production model-output sink remains outside their scope. Reading test names alone would have missed it; tracing every `complete` call to storage and HTTP found it. A stub completion confirmed verbatim sealing, persistence, and case projection; no actual model call was made.

**Upgrade.** Treat summary as its own model-output channel under the owner credential prohibition and give it a purpose-specific strict schema and safe result. The summary fixture must inject hostile EN/RO output and assert that rejected bytes are absent from ciphertext plaintext, case GET JSON, logs, and any retry. A rejected summary must not fabricate a knowledge citation or become authoritative. Usage and relay-health accounting should remain truthful for a rejected-but-successful relay.

## Cause 3 — link screening checks visual raw forms, not canonical encodings

The answer screen rejects `https://`, `www.`, Markdown, HTML, and a slash path preceded by start/whitespace. It does not canonicalize percent encoding, and the slash-path branch does not match a protocol-relative string whose first slash is followed by `/` and whose second slash is preceded by `/`. The isolated parser probe confirmed acceptance of `//invalid.example/reset`, `https%3A%2F%2Finvalid.example/reset`, and `%2Fsettings` when the structured source/action fields were otherwise valid.

**Price.** Existing policy tests cover a raw URL and `/settings`, but not encoded or protocol-relative members. The omission makes a green suite look broader than it is and forces a later reviewer to reconstruct the regex semantics.

**Upgrade.** Normalize recognized encodings before screening, reject every protocol-relative form, and keep navigation exclusively in the closed action resolver. Record the probe corpus next to the policy so future prompt authors can name the whole attack class instead of a few examples.

## What I nearly got wrong

I initially reported that ordinary password text takes `REFUSE_SAFETY` and opens E2. The classifier actually matches the password zone rule first, producing `REFUSE_ZONE`; the first turn stores the text and the second zone refusal opens E3. I corrected the orchestrator immediately. The corrected two-turn chain is the durable finding.

I also nearly treated ciphertext as proof that credentials were harmless. Encryption protects the database at rest, but application code intentionally decrypts the same value for case snapshots and summarization.

## Dead ends and packet friction

- The immutable snapshot path is fail-closed in the inspected production composition: session creation pins the current version, and a missing stored version returns 409 before admission or persistence. Re-reading every corpus article would not improve this security preparation.
- Preview ports, marker, exact environment, file custody, and supervisor cleanup already have durable receipts. Re-running the stack would duplicate a completed infrastructure experiment and contend with the UI lease.
- The original packet prohibited probes while asking for concrete candidates, so the first handoff could only preserve hypotheses. Its section 5 amendment later authorized exact synthetic validation. One explicit parser-permission sentence in the initial packet would avoid the extra handoff and reactivation.
- I inspected the existing correctness-preparation document while looking for the local artifact format. I did not import its candidate conclusions into this security preparation, but that unnecessary read weakens ideal lens blindness and should be avoided by giving each seat a small artifact template.

## One-prompt machine upgrade

Generate a checked Support dataflow manifest before dispatch. It should enumerate every untrusted source, every redaction step, every model call by purpose, every persistence sink, every HTTP projection, the applicable policy function, and one synthetic hostile member per boundary. The review prompt can then require a mechanical source-to-sink matrix: input credential → session → case snapshot → summary relay; answer completion → parser → cipher → HTTP; summary completion → policy → cipher → case GET. Pair that manifest with a single leased command that runs the exact hostile fixtures, emits decrypted-byte absence assertions and relay/auth/reset spy counts, and stamps the frozen revision. This would have exposed the unprotected summary path without a second manual search and would turn “every model completion” into an executable inventory rather than prose.

## Measurements

- Frozen revision: `58fbaa7d5535dad89b479b98776cf2b8e88b978e`; base: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`.
- Static paths traced: classifier, deterministic guidance, route admission, answer response policy, cipher/redactor, escalation, case snapshot/summary/access, PostgreSQL rating/status/key coverage, KB loader/snapshot/navigation, API target ratifier, runner profile/environment/process, and Hermes relay custody.
- Product/Git/index writes: 0. Builds/stacks/providers/browsers: 0. Credentials/reset/account operations: 0. Three direct imported-module probes used only in-memory ports, fake encryption, stub completion, and synthetic nonfunctional sentinels.
- Confirmed boundary classes: 3. Clickability, real database/HTTP composition, real relay behavior, and final integrated severity remain **UNVERIFIED**.
- Actual elapsed time and token usage: **UNAVAILABLE**.

## Validation amendment receipts

- P1, `SECPREP-P1-input-case.log`, SHA256 `5924d79a4b110d418c06f980035cca5133b1d833d78270f238ec3eb51bc49c2b`: `classifications=["REFUSE_ZONE","REFUSE_ZONE"]`, `escalation="E3"`, `redacted=false`, two fake-persisted user plaintexts retained the sentinel, and both case snapshot and summary transit contained it.
- P2, `SECPREP-P2-summary.log`, SHA256 `26729c6f3220d5e886230a05a7e450f88c07661731ee3b6555f9a63cb8983bec`: the hostile stub summary was passed unchanged to sealing, persisted with status `DONE`, and projected unchanged by case access.
- P3, `SECPREP-P3-links-r2.log`, SHA256 `c7082264629c9cae358b5f8310f1b777529e6f99ba5d28d7c3b6caed38ee8474`: protocol-relative URL, percent-encoded HTTPS URL, and encoded path each returned `ACCEPT` from the actual parser plus validator. The first attempt, `SECPREP-P3-links.log`, SHA256 `1410662905e0da035e0a6c902317908f16ad1577e6ca3ee70e00e315d9393b5f`, stopped before import on the known sandbox `tsx` IPC `EPERM`; the identical normal-local retry succeeded.
- The amendment used one meaningful hostile probe per candidate and did not spend the released lease on separate safe-negative executions. Existing focused tests retain benign response-policy coverage; the regression-transfer notes name the required supplied-secret, summary, and link negative controls explicitly.
