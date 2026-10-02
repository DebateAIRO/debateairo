# Paid plans Part 2 — the final review's open items

Part 2 ("payments, tax and invoices") merged into `dev` with billing switched **off**. Its final whole-part review
(eight area reviewers and a consolidating reviewer, 2 October 2026) found no Critical defect and nothing that matters
while billing is off, and 21 Important findings plus Minor ones that must be closed **before billing is switched on**.
Go-live checklist row 38 points here: billing stays off until every row below reads **closed**.

"Part 2b" is the follow-up pull request that fixes the code items; "owner", "counsel", "accountant" and "X0" (the
owner's xMoney sandbox recording) are the people or steps that decide the rest.

| Id | What | Who closes it | Status |
|---|---|---|---|
| P2-I1 | A forged notice could choose whose charge a payment pays; take the order only from xMoney's records | Part 2b (W1) | open |
| P2-I2 | A dispute reported as its own transaction is matched as a payment | Part 2b (W2) | open |
| P2-I3 | A rebill of a card-check (`auth`) order may only hold money | Part 2b (W14) and X0; A12 changes if X0 shows holds | open |
| P2-I4 | Refund, withdrawal and invoice paths do not refuse the other xMoney system | Part 2b (W3) | open |
| P2-I5 | The refund executor and credit notes trust the job queue; a billing-only database role | Part 2b (W4) for parts 1–2; owner (a new production principal) for part 3 | open |
| P2-I6 | The "payment already on its way" check can never match | Part 2b (W1) | open |
| P2-I7 | Dunning retries can cut xMoney's 30-minute wait | Part 2b (W5) | open |
| P2-I8 | A withdrawal after an upgrade refunds too little; Terms §13 lacks the credit share | Part 2b (W6) for the formula; counsel for Terms §13 | open |
| P2-I9 | The 14-day withdrawal window can close on a weekend or holiday | Part 2b (W6) for weekends; counsel for public holidays | open |
| P2-I10 | Scheduling an account deletion ended a paid plan at once | Part 2b (W7), as the owner ruled on 2 October 2026 | open |
| P2-I11 | Withdrawal confirmations: "refunded" before money moves, no acknowledgement, no owner alert | Part 2b (W9); counsel confirms the acknowledgement | open |
| P2-I12 | Billing mail does not follow an account email change | Part 2b (W8), as the owner ruled on 2 October 2026 | open |
| P2-I13 | Every buyer accepts a withdrawal sentence only EU/EEA/UK buyers can use | counsel and owner (a new consent text), then code | open |
| P2-I14 | Leaving a card page through the top bar keeps the card pages' looser security policy | Part 2b (W11) | open |
| P2-I15 | Never-paid checkout data is kept ten years and past erasure | counsel (a storage limit), then code | open |
| P2-I16 | A dead invoice, credit note or legal email alerts no one | Part 2b (W12) | open |
| P2-I17 | A dead invoice or credit-note job has no way back | Part 2b (W12) | open |
| P2-I18 | The daily money check fails all-or-nothing; failure signals missing from the runbook | Part 2b (W13) and X0 | open |
| P2-I19 | The runbook contradicts itself on where the sandbox run happens | Part 2b (W14): a separate throwaway server, as the owner ruled | open |
| P2-I20 | The sandbox-to-live switch swaps only four addresses | Part 2b (W14) | open |
| P2-I21 | Failed-payment emails blame the bank when no bank was asked | Part 2b (W10) | open |
| Minors | P2-M1, M3, M5, M11, M12, M14, M15, M16, M24, M27, M31, M32, M35, M42 | Part 2b (W15) | open |
| Minors | P2-M8, M9, M10, M18, M19, M20 | Part 2b (W5, W9, W10) | open |
| Minors | P2-M2 (refund status words), M17 (the renewal day sentence), M21, M25, M26, M28 (tax facts), M36 (one withdrawal address), M37 (pre-tax prices for EU consumers) | X0, owner, accountant or counsel | open |
| Later | P2-M4, M6, M7, M13, M22, M23, M29, M30, M33, M39, M40, M41, M43 | a later task; none blocks billing on alone, but each is decided before go-live | open |
