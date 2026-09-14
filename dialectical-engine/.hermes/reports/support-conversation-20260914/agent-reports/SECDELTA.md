# SECDELTA reviewer self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Identity and boundary

- Node: `SECDELTA`; pass: architecture/security assessment before final review pass 1.
- Ticket: `t_29866275`; session: `/root/forgot_destination`; authority epoch: `1`.
- Frozen product revision: `43cf9386ea3c9e7c79523ec38debe63271d19292`; baseline: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`.
- Role: read-only reviewer. I did not edit product or Git state, call the relay, read private runtime logs, or launch/reload the stack.

## Case file

The assessment started from the already measured P1/P2/P3 paths, then narrowed to changed policy boundaries. The main efficiency gain was to avoid replaying the author’s broad suite and instead build a small matrix that exercises imported production functions with inert strings. This directly tests the claim boundary and emits machine-readable outcomes for reuse in regression coverage.

## Causes, evidence, and price

### The redaction vocabulary is narrower than the credential policy

FIX1 repaired the two examples that exposed the original bug, but the canonical redactor still has a password-only labelled-value grammar. It does not share the output policy’s credential vocabulary or normalization. Actual production-module probes preserved an invented control-obfuscated password and a short labelled OTP in the value passed to fake encryption/persistence, relay transit, E3 case snapshot, and advisory-summary transit.

**Price.** One green four-case unit table looked like closure while five adjacent members failed the independent matrix. The later assessment had to reconstruct the vocabulary twice and trace the same sinks again. Actual token usage and exact elapsed time are **UNAVAILABLE**.

**Upgrade.** Define one Support-specific credential-value recognizer with EN/RO inflection tables and normalization before matching. Apply it at each ingress boundary and generate both redaction and response-policy cases from one checked matrix. Pair each positive with a benign “forgot password” negative control.

### Policy negation was implemented as prefix presence instead of operation scope

The response policy splits a sentence at punctuation and a few adversatives, then considers every later operation negated when any negation appears earlier in that clause. It also omits common plural credential forms. Actual probes accepted EN/RO conjunction-based solicitation and direct plural solicitation; the answer service persisted/returned one accepted bypass and the advisory service persisted/projected its summary form.

**Price.** FIX3 added 49 assertions yet did not cover coordinated clauses or the noun inflection matrix. This produced another correction boundary after three earlier nodes and left a model-output channel able to solicit credentials.

**Upgrade.** Parse a small, explicit set of safe limitation templates or bind negation to the nearest operation/credential relation. Avoid a generic “negation exists somewhere before the verb” exemption. Generate singular/plural and conjunction/adversative pairs in both languages.

### The same noun/operation coupling creates safe-output refusals

The credential noun is detected over the whole answer while operations are evaluated clause by clause. A harmless account-name change sentence followed by a singular credential limitation is rejected in EN and RO. I nearly missed this because my first controls used plural nouns; those passed only because the plural forms were absent from the noun regex. Refining the probe to singular exposed the independent scope defect.

**Price.** A plausible explanation for live false refusals existed, but the live receipt did not correlate diagnostics to requests. Treating that inference as proof would have created false certainty. The direct synthetic case now proves the implementation defect without inventing live attribution.

**Upgrade.** Make the checked relationship local to one clause and require a credential term in that same clause. Keep an explicit safe corpus for prerequisites/limitations and record per-request diagnostic correlation in live evidence without raw model text.

### Prompt-only internal-ID policy is not an enforcement boundary

The model instruction prohibits identifiers in prose, while the parser checks identifiers only in structured arrays. `start-debate` was accepted, persisted and returned in answer prose and accepted in a summary. This is a text-contract failure, not a clickable exploit.

**Price.** LIVE3 already displayed this identifier, so the prompt consumed relay calls without ensuring the contract. The later reviewer had to distinguish raw text from action execution.

**Upgrade.** Derive a prose-deny set from the closed source/action/capability catalogs and screen both answer and summary text. Continue rendering navigation only from server-resolved action objects.

## What I nearly got wrong

- I first expected the plural cross-sentence controls to reproduce the whole-answer false positive. They passed because `passwords` and `parole` do not match the credential-term expression. The singular variants reproduced the separate false-positive class.
- I described the failed `pnpm exec tsx` attempts as a missing executable before reading the logs. The binary existed; its IPC socket creation was denied by the sandbox. The corrected evidence uses `node --import tsx` and the failed logs remain preserved.
- I did not equate accepted text with a clickable or executed exploit. The answer service and HTTP projection preserve text, but no auth/reset operation or browser navigation occurred.

## Dead ends and packet friction

- Re-running the 776-test author suite would not answer the changed boundary questions and was correctly excluded.
- The `tsx` CLI’s IPC helper failed four times before product import. A standard capture recipe using `node --import tsx` for one-shot TypeScript probes would avoid this repeated environmental cost.
- The packet’s named evidence set is comprehensive but large. A generated delta manifest listing changed security functions, previous findings, receipt hashes, and one probe command per boundary would reduce repeated reading.
- The live evidence records diagnostic categories without request correlation. This prevents a reviewer from turning a concrete parser false positive into a proven explanation of a live refusal.

## One-prompt machine upgrade

Generate a checked Support boundary manifest from source and requirements. For each untrusted source, enumerate normalization, credential vocabulary, classifier outcome, persistence sink, model transit, output parser, HTTP projection, and rendered action. Generate EN/RO tables that cross singular/plural inflections, labelled values, U+200B obfuscation, direct/adversative/conjunctive negation, and safe prerequisite sentences. One capture command should import the actual modules, execute the table against in-memory ports, and emit structured assertions for plaintext absence, refusal/acceptance, canonical persistence equality, safe diagnostics, and zero auth/reset calls. This turns the mission’s absolute prose rules into a repeatable finite regression while keeping the report honest about corpus limits.

## Measurements

- Product/Git/index/stack/provider/browser writes or calls: 0.
- Successful direct-import executions: 6 logs across 5 probe files; one policy matrix was expanded and rerun. Initial environment-only launcher failures: 4.
- Confirmed findings: 3 blocking classes and 1 non-blocking contract class for later integrated tiering; no checkpoint verdict supplied.
- Frozen start/end HEAD: `43cf9386ea3c9e7c79523ec38debe63271d19292`; dirty count: 0.
- Heavy lease released immediately after finite probes.
- Exact report, self-report and final probe hashes are recorded in the ticket handoff and main assessment.

## Skills actually read

- `superpowers:using-superpowers`
- `heartbeat-protocol`
- `heartbeat-reviewer`
- `superpowers:verification-before-completion`
- `superpowers:systematic-debugging`
