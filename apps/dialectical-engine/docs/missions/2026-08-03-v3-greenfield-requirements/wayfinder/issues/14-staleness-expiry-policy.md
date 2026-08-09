# 14 — Staleness/expiry + liveness policy

Type: grilling
Status: resolved
Blocked by: none

## Answer

V ruled (sitting #1, 2026-08-04): **DR-015** snapshot + wake + propagate +
badge (triggers AND class TTL wake leaves; V's child→parent rethinking
digests; visible staleness, never silent). **DR-016** composite retirement
(no queries N days AND no open triggers; archived not deleted; auto-revive;
isolation = UNDER-EXPLORED marker, not retirement). Full text in
[../decisions-ledger.md](../decisions-ledger.md).

## Question

1. What expiry or re-review policy applies to answers whose evidence goes
   stale? (The battery has revision TRIGGERS but no working decay mechanism —
   human decision #9.)
2. The liveness/removal threshold Hermes's seat asked V to set (the battery's
   self-cleaning liveness law needs a number): when is a question retired?

## Settles

Human decision #9 + the liveness threshold; constrains SETTLE stage rows and
the outcome-memory requirements. (Correction per Hermes lens F6: "no outcome
memory" is an engine AUDIT finding, NOT one of the replace-these-four indicted
semantics D1–D4 — see the numbered defect register in
[../GLOSSARY.md](../GLOSSARY.md). Whether its repair enters the race's victory
measures is ticket [15](15-race-victory-criteria.md)'s call.)

## Comments
