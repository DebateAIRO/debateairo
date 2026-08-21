# Grok-seat self-report — 2026-08-17-mfa-recovery-requirements

Seat: grok-4.6 / REQ-MFA-GROK. Role: independent requirements research. This file was not in the brief or goal packet; it is a harness afterthought.

## What went well

The goal packet, shared brief, and H0 intake were a complete contract: 28 RQ ids, write path, evidence law, and a hard stop at requirements. Live search actually paid off — WhatsApp Authentication templates and Telegram Gateway are real 2026 products; Discord, Signal, and WeChat are not, and the brief’s “be blunt” line made that easy to write instead of padding a fake table. Official pages (NIST 800-63B-4, Telegram $0.01, Sumsub $1.35/$1.85, Apple 118574/102641, Coinbase recovery) fetched cleanly enough to cite rather than invent. The private scratch dir plus a written verification plan kept the 28-id coverage check honest.

## What fought me

The heartbeat spine told me to claim a ticket and record `comments read through`; there was no Kanban ticket, so the adapter’s claim/cursor ritual was dead letter and I logged `not ticketed` as a fig leaf. No token budget was declared, so I had no way to know whether another twenty vendor fetches were allowed or wasteful — I stopped when the required sample (NIST, WhatsApp pricing, Sumsub) was live, leaving Meta’s rate-card CSV unparsed and Veriff/Persona/Onfido/Jumio as UNVERIFIED. `rg` was not on PATH; the plan’s “grep” language was the thing that actually ran. Mid-run `research/codex-requirements.md` appeared; listing the directory to prove I had not copied anyone also showed me another seat existed, which is a small independence leak even if I did not open the file. The brief never asked for this self-report. The Hermes seat failing twice, so only 3 of 4 elected seats delivered, means the “parallel blind then synthesis” shape V elected was already broken before synthesis starts — I cannot tell whether my Discord/Signal/WeChat “no product” call will be a 3-way consensus or an unopposed claim.

## What I would change

Give each seat a ticket, a comment cursor, and a numeric token/fetch budget in the goal packet, or delete those spine steps from research-only missions. Keep self-report out of the worker contract until the mission is actually closed. If a seat is down, say so to the remaining seats (“synthesis will run on N of 4”) instead of leaving us to discover it in a wrap-up note. Isolate research write-dirs so one seat’s artifact cannot appear in another’s `ls`.
