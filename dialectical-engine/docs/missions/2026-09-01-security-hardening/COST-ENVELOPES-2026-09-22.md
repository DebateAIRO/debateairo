# The spending ceilings — what they are set to now, and how the real numbers get sealed

*Operator record for owner ruling V-28 (finding DL4-F2), written by task 11 (BUDGET) on 2026-09-22. Task 14 folds this into the VPS kit.*

## What exists now

Two ceilings, both in money, both enforced in code:

| Ceiling | What it bounds | What happens when it is reached |
|---|---|---|
| Per run | What ONE debate may spend, across every vendor it touches | The call that would cross it is refused **before** it is made. The debate stops cleanly, keeps everything it has already produced, and is served as a components-only answer marked `ENVELOPE_EXHAUSTED`. It is not a crash. |
| Per day | What the WHOLE application may spend in one UTC day | No **new** debate starts until the next UTC day. Debates already under way finish — stopping one would throw away work already paid for. |

Both are enforced only in the **hosted** deployment. Local mode — the command-line relays and loopback model servers anyone can run on their own computer — is untouched and keeps the attempt ceiling it has always had. There is no money at stake there, and the subscription tools report no usage.

## The values in force today are TEMPORARY, and deliberately too small

| Setting | Value now | In dollars |
|---|---|---|
| `per_run_ceiling_micros` | 250 000 | 0.25 USD |
| `daily_ceiling_micros` | 2 000 000 | 2.00 USD |

These are development values, and the register row says so about itself: it carries `provisional: true` and a `provisional_reason` naming V-28.

They are **meant to stop things.** A normal full debate measured 114 model calls on 2026-09-17; at ordinary vendor prices that is dollars, not cents. So the first paid run will hit the per-run ceiling partway through, on purpose. That stop **is** the measurement: it produces a real spend figure, against a real vendor, for the price of a quarter. The daily ceiling of 2.00 USD is eight such runs — low enough that a mistake in the first days costs the price of a coffee, high enough that the per-run ceiling is what the first measurement exercises.

## How the real numbers get sealed

The rule the owner accepted, recorded in V-28:

- **per run** — about three times the measured cost of one normal debate;
- **per day** — what the owner is comfortable losing on a bad day.

The sequence is: build the mechanism (done) → the owner's first paid run under the temporary ceiling → seal the real values from what that run measured.

**Sealing is a NEW version of the register row, never an edit of this one.** A sealed value is superseded, not changed (mission constraint 5). The new version carries `provisional: false`, and the row above stays as the history of what the first paid run was run under. The row key is `costEnvelopePolicy`, in `packages/register/src/cost-envelope-policy.ts`.

## What a hosted deployment now refuses to start without

Start-up fails closed, with a named code, in each of these cases:

| Condition | Refusal code |
|---|---|
| The register version in force carries no `costEnvelopePolicy` row — the one an operator actually meets, by pinning an older `REGISTER_VERSION` | `COST_ENVELOPE_POLICY_UNRESOLVED` |
| That row exists but is malformed | `COST_ENVELOPE_POLICY_INVALID` |
| The admission row in force lacks any of the three support budgets | `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` |
| A provider target declares no price | `PROVIDER_TARGET_PRICE_REQUIRED` followed by the provider's name |
| A provider target declares a price of zero, which would bound nothing | `PROVIDER_TARGET_PRICE_ZERO` followed by the provider's name |
| This build ships no envelope row at all — a packaging fault, not a configuration one | `COST_ENVELOPES_NOT_SEALED` |

The first two are the ones an operator meets. The last is a build-integrity
check that runs before the database is opened; with a correctly packaged build it
cannot fire, and it is listed so that nobody reading a log has to guess what it
would mean.

And while a debate is running:

| Condition | Refusal code |
|---|---|
| The next call would cross the run's ceiling | `RUN_COST_ENVELOPE_MONEY_REACHED` |
| A new debate is asked for after the day's ceiling is reached | `DAILY_COST_ENVELOPE_REACHED` |
| A vendor answered but reported no usage figures | `PROVIDER_USAGE_UNREPORTED` |

The last one is why each hosted vendor must declare a price **and** report usage: a call whose cost cannot be read cannot be counted, and a cost that cannot be counted is not bounded by anything.

**What a debate does when one of these fires.** It stops where it is, keeps everything it has produced, and is served as a components-only answer that says why. That is true wherever the ceiling is reached — while the makers are still writing, while the debate is being expanded or reviewed, or at the very end while the answer is being composed. It is not an error, and nothing is thrown away. A vendor that reports no usage ends the debate the same clean way, under its own name, because that is the vendor's fault or the configuration's and not the asker's.

**When the ceiling stops a debate before its second maker has written** (the first maker's position exists and has been assessed by the panel; the second maker's first call was refused), the first maker's position is served, and the answer says two things about itself: the condition mark `ENVELOPE_EXHAUSTED`, whose record names the ceiling that fired (`RUN_COST_ENVELOPE_MONEY_REACHED`, `PROVIDER_USAGE_UNREPORTED` or `DAILY_COST_ENVELOPE_REACHED`), and the condition mark `SINGLE-LINEAGE`, whose record carries the same code as its reason — the answer rests on one maker's lineage because the others could not be afforded, not because only one maker was configured. No cross-maker review is bought for a debate that has been stopped, so the served position stands on the same footing as a single-maker debate's. Where two or more maker positions exist when the ceiling fires, the strongest is served and the others are disclosed as unserved, as in any other debate.

**A request that arrives after the day is spent** is answered `429` with a `Retry-After` header naming the next UTC midnight: it is a well-formed request that would succeed tomorrow, not a broken one.

## How close the ceiling is

The per-run ceiling is checked before each call, against what the run has spent so far plus the most that call could cost. That projection is deliberately generous about the question it can see, but it is a margin and not a guarantee: vendors bill for their own message scaffolding, a thinking model can bill reasoning tokens that its answer-length bound does not cover, and cached, long-context or image input can be priced above the flat rate configured with the target. The consequence is bounded — a run can go over by at most the shortfall of one call, because the next check is taken against the real amount the vendor then reported. Treat the ceiling as a ceiling with one last step over it, not as a limit that can be walked past.

## What an operator has to configure

Each provider target in `PROVIDER_DISCOVERY_TARGETS_JSON` carries its vendor's price, beside the base URL and the model, under two keys: `input_price_micros_per_million` and `output_price_micros_per_million`. Both are whole numbers of USD micro-units per million tokens — the unit vendors publish their prices in, so a vendor charging 3.00 USD per million input tokens is written as 3000000. Both keys or neither: input and output are priced differently, and half a price would under-count every call.

## Where the money is recorded

Every charged call writes one row to `ledger.model_spend` (migration 0066): which run, which vendor, which UTC day, how much, and the token counts it was billed from. The table is append-only and guarded against `TRUNCATE`, because it is the only record that a day's ceiling was reached. Both ceilings are read as sums over those rows, so there is one source of truth and a vendor's invoice can be reconciled against it.

Support-chat spend is **not** yet written there. The table and the daily sum are ready for it — a `spend_source` column distinguishes the two surfaces and the daily total takes every row — but the support chat keeps its own per-message accounting today (`support.message.cost_usd`, migration 0054, task 12's), and duplicating it here would produce two numbers for the same money. Wiring it in is one insert at the support transport's own seam and needs no further migration. Until it is wired, the daily ceiling bounds debate spend only; the support chat is separately bounded by its own daily call cap and per-source share.
