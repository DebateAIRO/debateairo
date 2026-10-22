# Preview practice (all five AIs, before any upload)

## What this is, in plain words

The owner's rule: before ANY upload to the v3 preview, a practice with all five real AIs must pass:
GLM-5.3-Flash, DeepSeek-V4.1-Flash, MiMo-V2.6-Pro and Qwen3.8-Flash (through the DeepInfra spending gate) and
Claude Haiku 5.5 (through the Anthropic spending gate). Nothing is published, nothing reaches the site, and no
person's question is used.

The practice runs on the operator's Mac, from the candidate code in a worktree. It keeps everything in a throwaway
database that is deleted at the end. The only thing it shares with the live preview is the two spending gates on the
server, because only they hold the keys. The Mac never sees a key:

- a tiny relay (`gate-relay.py`) runs on the server as the runner account (uid 992), the account the gates answer;
- the Mac reaches the relay through two SSH-forwarded unix sockets;
- the relay copies bytes between the Mac's forward and the gate, and never reads them.

It spends real money from the same daily pots as the site, a little (see "Money and time").

Four modes:

- **formats**: every model is asked to do every job a few times (write a position, attack one, answer a cross
  exchange, sit on a panel, review a node, write the answer, check the answer, tell the story, check the story). The
  prompts come from the real prompt builders, with our own practice material (one English and one Romanian question;
  one statement carries an obvious fallacy so the judges' "fatal flags" are used). Each job is given the same kind
  of material the real debate gives it: the answer writer may cite every argued point, not only the winning one; the
  story covers two positions; the answer checker and the story read a written answer; the reviewer is asked about
  no link, one link and two links in turn. Each reply is checked by the job's own format check. It is fast to read:
  which model fails which job, and the exact problem. The five models work at the same time, each on its own jobs
  one after another (one call per model at a time, about a second apart), so a slow model no longer holds the others
  back: the run takes about as long as the slowest model's own jobs. `--sequential` sends one call at a time instead
  (the models taking turns, one job each), as before.
- **debate**: one whole practice debate (depth 1 by default, 2 allowed). It goes through the real ask path (health
  check of each model, start-of-debate estimate against what each gate says is left, role rotation, admission) and
  then the real runner, on the live register's exact settings. At the end: served answer, story, and every call's
  format check, time and tokens. With `--shape-policy` it runs the new debate shape instead (see "The new debate
  shape").
- **openings** (the debate-shape comparison, spec 2026-10-12 §2): on 12 fixed questions (6 Romanian, 6 English), the
  same AIs open each question four ways: **T** today's opening (every AI writes a full position, blind), **A** a
  snowball (the first AI lists points, each next AI sees them and adds only new ones), **B** blind lists (every AI
  lists points with no angle, then merge, one "what is missing?" round and choose) and **C** the angle map (one AI
  picks the angles, each AI lists points from its own angle, then merge, up to two "what is missing?" rounds and
  choose). The first AI changes from question to question. It is not a pass/fail test of the release: it collects the
  data the owners compare with their own method.
- **language**: the question-language practice (no debate, under $0.05). Nine fixed questions are each read the way the
  site will read them before a debate, and the report says which language each would be locked to. See "The question
  language".

Run **formats** first, then **debate**. Both must PASS. **openings** is separate: run it when the owners want the
comparison, never as a release check.

The practice works for both kinds of preview: the local-mode preview of today and the hosted preview with
NETOPIA's sandbox (`deploy/preview-release/v1/README.md`, "Hosted preview with NETOPIA sandbox billing"). The
practice reads which one it is from the exported settings; "Practising the hosted preview" below says what changes.

## Practising the hosted preview

Once the preview runs in hosted mode (runbook H6 onwards), the exported settings say
`DEBATEAI_DEPLOYMENT_MODE=hosted` and the live register is a version made by publish kit v3. The practice then
rehearses what the hosted server runs on the debate path:

- **the runner, as the hosted runner is composed**: each debate is held to the register's per-debate ceiling
  (`costEnvelopePolicy`), the story to its own ceiling (`storyCostEnvelopePolicy`), every AI call is priced from the
  settings' target prices, and a call refused for money moves to a cheaper AI as on the server;
- **the ask, as the hosted API takes it**: the room (the site's day and the waiting line) or, without the band, the
  daily guard; the hosted start-up checks of the register (the support and room budgets, billing readiness) refuse
  here when the hosted API would refuse to start on that version;
- **the hosted rules for the AI targets**: an `https` address and a price for every target.

What stays off the Mac, on purpose:

- **Billing is kept off in the practice**, whatever the register says. With billing on, a person's debate is held to
  the plan that person bought with NETOPIA's sandbox cards; the practice's throwaway person has bought nothing (a
  purchase needs NETOPIA, Quaderno and the server's key files, which the practice never touches), so it would run as an
  unpaid Free account and measure a made-up person instead of the release. The practice therefore asks the way the
  server asks with billing off (runbook H6): no plan wall, no charge on the person, no server-chosen plan. The register's
  billing row is still checked the way the hosted API checks it at start. Billing's own flows (checkout, NETOPIA's
  notify message, invoices, emails) are tested on the server with the sandbox cards (runbook H7, H8).
- **No NETOPIA, Quaderno or SmartBill call, no email, no key file.** The practice starts no billing route, no country
  gate and no mail; its ask goes straight to the ask application.
- **The country files and the billing settings** (`GEOIP_COUNTRY_DB_PATH`, `TOR_EXIT_LIST_PATH`, `NETOPIA_*`,
  `QUADERNO_*`, `SMARTBILL_*`, `OWNER_REPORT_EMAIL_PATH`) are server paths and sandbox addresses. S-2 does not copy
  them. If a settings file carries them anyway, the practice sets them aside unread and prints their names (never a
  value): `settings: server-only settings set aside unread (never opened, never sent): ...`. In a local-mode settings
  file they are refused, as before.
- **The site's day** is counted in the practice's own throwaway database, so it holds only this practice's spend. The
  real shared limit is still the two gates' daily pots.

What the practice prints and reports in hosted mode: `settings: hosted mode (...)` at the start; after the ask,
`hosted mode: the ask went through the room ...; billing is <on|off> in the register and kept off in the practice`;
`deployment` in report.json and a "Hosted mode" block in report.md (room or daily guard, billing in the register and
in the practice, the per-debate, per-day and per-story ceilings, the settings set aside). An ask the room would put in
line is reported as not admitted (`ADMISSION_REFUSED:ASK_WAITING_IN_LINE:<limit>`): the practice starts no waker.

One thing the practice shows that the server's start does not: a per-debate ceiling too low for even one call fails
the practice debate (`RUN_CEILING_BELOW_FIRST_CALL`), while the hosted start-up check for it
(`RUN_CEILING_BELOW_ONE_CALL`) cannot fire on the preview: it prices the plans' own models, none of which is a preview
model, and the preview has no scorecard in force. On the server such a version would start, then fail every debate.

What changes in the steps:

| Step | Hosted preview |
|---|---|
| S-0 | unchanged |
| S-1 | unchanged: the same read-only export; the newest version is the kit-v3 one the preview runs |
| S-2 | unchanged commands; `cut -d= -f1` shows `DEBATEAI_DEPLOYMENT_MODE` among the keys and the file says `hosted` (check with `grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' /root/practice/settings.env`, which must print 1) |
| S-3, S-5, S-7 | unchanged |
| S-4 | unchanged (the relay knows nothing of the mode) |
| S-6 | the same commands. A release that needs a new register version: add `--register-next --hosted-billing '<the same JSON the plan will get>'` (and the plan's `--checker`, `--role-rotation`, `--call-concurrency` choices as below) |

### `--register-next` on the hosted preview (publish kit v3)

On the server, a register version for the hosted preview is planned with `native-plan --operation plan
--hosted-billing '<JSON>'` (kit v3); a hosted preview's plan without it is refused there (`HOSTED_BILLING_REQUIRED`). The
practice takes the same inputs, checked by the release tool's own rules, and composes the next version with kit v3's
own code (`buildPreviewSourceRowsV3`, `composePreviewSnapshotV3`):

- `--hosted-billing '<JSON>'`: exactly the plan's value, for example
  `'{"billing":"off","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'`
  (use the owner's values; H7's is the same with `"billing":"on"`). It selects kit v3 and runs the practice in hosted
  mode, also on a local-mode settings file: that is how to practise the switch itself (runbook H6) before it happens.
- `--checker glm|deepseek` (deepseek only with `--deepseek-enabled-on-gate yes`), `--role-rotation on|off`,
  `--register-call-concurrency '<JSON>'`: the plan's `--checker`/`--deepseek-enabled-on-gate`, `--role-rotation` and
  `--call-concurrency`, same values. The practice's own `--call-concurrency A/B/...` is something else: it sets this
  practice's calls at once and is never written to a register.
- `--shape-policy FILE` with `--register-next --hosted-billing '<JSON>'`: the debate-shape row goes into kit v3's next
  version, as the plan's `--debate-shape '<the same policy as JSON>'` puts it there; give the plan the same policy. The
  new debate shape and the question language then run in hosted mode exactly as in local mode (the runner reads the
  row and its map fingerprint, the ask locks the question's language).
- With kit v3 the choices follow the PLAN's defaults, not the newest version's: the answer checker GLM, rotation on,
  the call-concurrency row carried unchanged. Give the practice exactly the flags you will give the plan; where a
  default moves a row away from what the preview runs now, the practice says so (`register-next: the newest version's
  answer checker is DeepSeek; without --checker deepseek ...`), and the server's proposal will show the same change.
- The changed rows it prints (and `register.codeNext` in report.json, with `composer:
  "preview-register-composer-v3"`, the hosted inputs and those notes) are the server proposal's `addedKeys` and
  `changedKeys`, except `nodeRuntimeVersion`, whose source reference the server measures again (so its hashes differ).
  For example, the first hosted version on register 12 with billing off adds `storyCostEnvelopePolicy` and changes
  `admissionPolicy` and `costEnvelopePolicy`; billing on over it changes `billingPolicy` alone.
- Without `--hosted-billing` the practice uses kit v2 exactly as before (the newest version's own checker and
  rotation), and refuses on a hosted preview (`PRACTICE_REGISTER_NEXT_HOSTED_BILLING_REQUIRED`).

```sh
HB='{"billing":"off","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}'
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question ro --register-next --hosted-billing "$HB" --out "$P/debate-report"
echo "exit: $?"
```

## The result

Each run writes `report.json` (everything, including the text of every reply that failed its format check, with
anything key-shaped blanked, at most 64 KiB each) and `report.md` (a short summary with no reply text) into the folder
given by `--out`. The folder must be outside the repository; the tool refuses a folder inside it, and a folder that
already holds another run's `samples.jsonl` (formats) or `openings.jsonl` (openings). Without `--out` it makes a fresh
folder under the system temp folder and prints its path.

Formats mode never loses a finished job: each one is written to `samples.jsonl` in the same folder the moment it
finishes (with the same content the report holds), and the report is built from that file at the end, and on every
other way out too (Ctrl-C, Ctrl-C again, the tool breaking midway). To build `report.json` and `report.md` again from
a folder's `samples.jsonl` (nothing is sent; no socket or acknowledgement needed):

```sh
node_modules/.bin/tsx tools/preview-practice/practice.ts report --out "$P/formats-report"
```

A debate's report also counts the "cannot assess" reviews and what was done about them (`investigations`, R2): how many
points one more AI was asked to look into ("asked") and what it found (holds, fails, dead end), or that its answer was
unavailable ("unavailable (call failed or money)": the call failed, or the money had run out; counted in "asked" too);
how many could not be looked into (no AI of another maker was left, the debate's cap was reached; an answer itself is
never investigated, nor a point that bears on no answer, so these add up to at most the "cannot assess" count); how
many investigations changed which answer leads ("standings moved"); and their money and time. A point a later copy set
aside after a crash is not counted (the time and money still include that copy's calls: that money was spent). On
engine 1 only the "cannot assess" count is not zero. The per-AI table names the investigator (`INVESTIGATOR`) and the
comparing judges (`VERDICT_JUDGE`) as their own steps.

A debate on engine 2 also carries the comparing judges' block (`judgeVotes`, `labels`, `judgesSeconds`,
`conditionalWinner`, R2): each judge's vote (which AI, the answer letter it chose, conditional or not, counted or why
not, the kind of question it named), the label and what triggered it, what today's label ladder would have said over the
same final strengths, and how long the judging took. Counts and codes only, never a judge's reasons. Which votes count is
counted again from the stored votes by the same code that chose the served answer (each answer lettered by its place in
the debate's plan; the stored "counted" column is only a hint and is never read); when that cannot be done honestly a
vote shows "not recounted" and `conditionalWinner` is null. Counts for the comparison (D1): `labels.label` is this
debate's label (add them up across reports for the label mix) and `conditionalWinner` says whether a conditional answer
won: a majority of the counted judges who chose the winning answer (the answers the judges grouped with it included)
called it conditional. That is a count, not the label rule: one conditional voter already makes a unanimous vote a
"Close call". Answer-check rejections and assumptions per answer come with R3, the reach check with R4. On engine 1 the
block is absent. A refused judge's or investigator's reply is re-checked with its own step's reading in the format
tables (the judge's letter checks need the letters it was shown, and are not re-run).

### The openings record (openings mode)

Every call is written to `openings.jsonl` in the `--out` folder the moment it finishes. Each line holds:

- the arm, the question and the step;
- the AI and its maker;
- exactly what the AI could see (blind, or the ids of the points it was shown) and its place in the plan;
- its times, its tokens (in, out, reasoning) and its cost;
- its format check, and how a slip was fixed (by the short patch follow-up or by a full re-ask);
- the reply itself, with anything key-shaped blanked, at most 64 KiB.

The first line names the AIs, the arms and the questions asked, each question with a short fingerprint of its exact
wording, so two runs can be compared question by question. After each arm of each question, one line holds what came
out: the angles, the points with who raised them, the merged answers, the chosen answers with their points for and
against and their strongest rival, the points raised but not chosen, and every fallback that was used.

`report.json` and `report.md` are built from `openings.jsonl` at the end, and on every other way out too (Ctrl-C,
Ctrl-C again, the tool breaking midway), as formats builds its report from `samples.jsonl`. They hold counts, cost,
time, slips and fallbacks per arm. They never hold a quality score: the comparison is the owners' own method, outside
this repository. When a gate stops or halts (or Ctrl-C is pressed once), the arm in progress finishes, it gets a
`STOPPED` note (its unsent calls are the stop, not the AIs' own fallbacks), and no new arm or question starts.
To build `report.json` and `report.md` again from a folder's `openings.jsonl` (nothing is sent; no socket or
acknowledgement needed), run `report --out` on that folder exactly as for formats: it reads `openings.jsonl` when the
folder holds one.

Arms `C2` and `C2N` (Task 17a, D5's comparison, named only with `--arms`; refused with `--dry`): the angle map on engine 2,
in the sealed wording (C2) and in wording N (C2N: the four answer-writing instructions name the failing forms, ids
`<id>.wording-n`, never sealed, practice only). Both are judged by the same sealed answer check. `report.json` `wording`
lists each question's debated answers word for word with the check's codes; `wordingTotals` and report.md give D1's
counts per wording (rejections by test, premise challenges exempt, assumptions per answer). The owner reads the answers
and marks the hedged or circular ones; the wording with fewer of them and fewer check rejections ships (as NEW sealed
ids, a later task). An arm that hits a practice refusal (the engine seal missing, or wording N's base no longer the
shipped text) ends at once with no map; report.md lists it under "Refused arms" with its code, its Wording N row counts it
as refused, and the run reads NOT_PROVEN (exit 30, `ARM_REFUSED:<arm>:<question>:<code>`), never PASS.

The owner's thinking levels (the settings' `thinking_levels` table, deploy/preview-auth-dev/v1/README.md) apply to
openings as to every other call: arm T's positions run at the `opening` step's level, and so do all the map's calls
(angles, lists, merge, gap, choose), since the map builds the opening; a repair inside a call runs at `slip_fix` when
the owner set it.

Before the real run, run it dry. `--dry` answers from a script: no socket, no settings, no acknowledgement, no
connection to a gate at all, and nothing is spent. It goes through every arm of all 12 questions in a few seconds,
with one repaired slip, one busy AI and the fallbacks, and ends PASS_WITH_WARNINGS (exit 10). Its report says "dry" in
its title; the costs in it are the price list's estimate for the script's made-up token counts, not money spent. The
block below makes its own fresh folder outside the repository:

```sh
O=$(mktemp -d /tmp/openings-dry.XXXXXX)
node_modules/.bin/tsx tools/preview-practice/practice.ts openings --dry --out "$O/report"
echo "exit: $?"
```

### The whole debate, word for word (debate mode, `--transcript`)

Add `--transcript` to a debate run to also get `transcript.json` in the same `--out` folder: every real prompt and
every real answer of the practice debate, so the owner can read exactly what each AI was asked and what it said.
Without the flag nothing more is written; with it, `report.json` and `report.md` stay exactly as they are.

It is written right after the debate ends, while the throwaway database and the debate's key still exist (both are
deleted a moment later), and it holds one JSON object:

- `run`: the run id, the question (id and text), the depth, the register version, the AIs on the panel (each with its
  maker), the ones that sat out, who wrote and checked the answer and the story, when the debate started and ended,
  how it ended, the served answer's summary and the story's outcome.
- `attempts`: every model call in the order the ledger recorded it (usually 150 to 250): which job (`family`,
  `callSiteKey`, `modelRole`), which AI (`providerRef`, `model`, `maker`), how it ended, its start, end and length in
  milliseconds, its tokens (input, output, reasoning, cached, as the vendor reported them), its cost (what the spend
  ledger charged and the price list's estimate), its format check (status, the check's own words, `code@path` issues,
  the tolerant repair it needed), whether it was the step's own ask, the short patch follow-up or the full re-ask
  (`replyForm`), the full prompt (`prompt.messages`: every message exactly as sent: the system message with the
  instruction text, the safety frame and the call's markers, then the material) and the full reply (`reply.content`:
  the AI's own text; `reply.vendorBody`: the vendor's whole reply body when that is what was stored, never a header;
  `reply.vendorUsage`).
- `structure`: the debate as the site reads it: `answer` (the positions with their text and makers, the judgements,
  the reviews, the edges, the served text and the verdict), `inspection` (the answer checker's record per piece of
  text), `story` (as stored; the story text when it is READY).
- `unavailable`: what the file could not hold and why (for example: the site's reader lists only positions that got a
  judgement, so a position with none is seen only in `attempts`).

`transcript.json` also holds `structure.engineGraph` (R2, both engines): every point the debate argued, the hidden
ones too; every link with the bearing its reviewer measured (null when not measured) and whether it is a cross-reply's
own support of its position; every review; every grader's own seven measures (`voices`, the author marked); each
investigation's result; whether engine 2's dispute factor lowered each point's score; and the base and final strengths
the engine served. It is what the `rescore` mode reads (no AI call). A grader reply its step's reader could not read
again is listed in `unreadVoices`, and `rescore` then leaves that debate out and says why.

Nothing is cut and model text is not blanked (the 64 KiB cap and the redaction of `report.json` do not apply). As a
safety net, every string still goes through the named key shapes (a PEM block, a bearer or authorization header, a
vendor key, a JWT, a `secret=`-style pair): the practice prints whether that blanked anything (`transcript: the
key-shape safety net changed nothing`). The generic "long run of letters" rule is not used here, because it would blank
every id in the file. No key, password, database address or setting is ever written. The file is written whole or not
at all, readable only by you. It can be several megabytes. It holds only our own practice question and the AIs' text
about it; keep it in `$P` with the reports.

The last line on the screen and the exit code say:

| Exit | Verdict | Meaning |
|---|---|---|
| 0 | PASS | Everything worked. The upload may go ahead. |
| 10 | PASS_WITH_WARNINGS | It worked, but some calls were refused as "too busy" and then recovered, or a model's 90th-percentile call took more than 2 minutes, or an AI's reply had the wrong format and a later try of the same call fixed it, by the short follow-up or the full re-ask (`FORMAT_REPAIRED:<model>:<how many>`, owner ruling 2026-10-12 "Fixed slips = warning"), or an AI was busy and sat out the rest after giving at least one accepted answer (`MODEL_BUSY_PARTLY:<model>:answered=<n>:skipped=<m>`, owner ruling 2026-10-12 "Keep GLM, it sits out"), or the story was served with the story checker's reservation after its rounds ran out (`STORY_RESERVED`, owner ruling 2026-10-12). Owner decides. |
| 20 | FAIL | A call ended without an accepted reply after its tries because of its format (`FORMAT_FAILED`), or one AI's first tries had the wrong format too often (`SLIP_RATE:<model>:<slips>/<answered calls>`: more than 1 in 10 of its answered calls, one slip always allowed), a call failed, the debate did not finish, no answer or no story (anything but READY or READY_WITH_RESERVATION), or a gate refused or halted. Do not upload. `failures` in report.json is the diagnosis. |
| 30 | NOT_PROVEN | It worked, but a model stayed busy (the AI company kept refusing its call as "too busy", not billed, or the model kept cooling off) and sat out before it gave a single accepted answer, or the practice paused a gate itself after four "could not reach the AI company" answers in a row, or the operator pressed Ctrl-C once, so some model was not tested to the end, or a debate asked for the new shape did not run it (`SHAPE_NOT_EXERCISED:<why>`, see "The new debate shape"). Run again later, or owner decides. |
| 40 | HARNESS_ERROR | The practice could not run (a start check refused, or the tool broke). Nothing about the release is known. |
| 50 | ABORTED | The practice started but did not reach its end (Ctrl-C a second time, or the tool broke midway). The report holds every job that finished, and lists whatever else it found. Run again. |

The format rule in plain words (owner ruling 2026-10-12, "Fixed slips = warning"): on the preview every step that
must answer in a fixed form gets a second try in the same call when its reply has the wrong form (the app tells the
AI exactly which part to fix). A slip a later try of the same call fixes is a warning, listed per AI. A call whose tries
all had the wrong form fails. Each AI may slip on its first try at most once, or at most 1 in 10 of its answered calls
when it answered more than 10: FAIL when slips > max(1, floor(answered / 10)). The small repairs the app makes itself
when it reads a reply (a code fence, prose around the answer, a straight quote inside a text, a missing closing bracket
at the very end of a reply that finished normally) are counted in the report as information, never as slips.

`repairsByKind` (LG-A): every repair made in code on an accepted reply, counted per AI and step (`opening`,
`pros_cons`, `cross_exchange`, `judge_panel`, `reviewer`, `answer_writer`, `answer_checker`, `story_writer`,
`story_checker`, `map`, `structure_repair`). `unrepaired`: every reply code could not repair, with its class
(STRUCTURE, CONTENT, CUT_OFF, EMPTY), its first issue, the follow-up the same call sent next (STRUCTURE = the cheap
structure-repair call on Haiku, PATCH, FULL, LENGTH_RETRY, or NONE), whether the call recovered, and its first 400
characters (report.json only). A call fixed by the structure-repair call is one call of the original AI, repaired: a
warning, never a failure. `report.md` shows the counts and the codes only.

`languageFollowUps` (the stray-letter rule, PR #194; information only): per AI, step and code, the replies refused for
text in another language or script (`TEXT_NOT_IN_QUESTION_LANGUAGE`, or `MAP_WRONG_LANGUAGE`, the map's name for the
same refusal), how many of them the same call asked again by the short follow-up, and how many of those follow-ups came
back accepted. Every admitted debate has it, so an empty list means none. `report.md` shows it as "Reply-language
refusals".

How a slip was fixed (patch follow-up, owner design 2026-10-12; information only, the verdict is the same either way).
When a reply was a readable answer with only some parts wrong, the app first sends a SHORT follow-up: the AI gets its
own answer back and is asked only for the wrong parts (for example `{"value_laden": true}`), which the app puts into
its answer and checks again. Only when that does not work (or the reply could not be read at all) does it ask the whole
question again (the full re-ask), which may take a third try. The report says which it was:

- each job (formats) or call (debate) try carries `replyForm`: `ORIGINAL` (the question itself), `PATCH` (the short
  follow-up) or `FULL` (the full re-ask), read from the exact prompt the app sent for that try (formats: as the app hands
  it over just before sending; debate: the prompt the runner stored for that try in the practice database);
- a REPAIRED job (formats) carries `repairKind`: `PATCH`, `FULL`, or `RESEND` (the question sent again unchanged, e.g.
  after a reply cut off for length);
- `slipsByModel.<model>` has `repairedByPatch`, `repairedByFullAsk` and `repairedOtherwise` (they add up to
  `repaired`), and `totals` has `formatRepairedByPatch`, `formatRepairedByFullAsk` and `formatRepairedOtherwise`
  (adding up to `formatRepaired`); report.md says "fixed by the same call (by patch n, by full re-ask m, otherwise k)".
  The warning keeps its form, `FORMAT_REPAIRED:<model>:<how many>`.
- In `failures`, a refused reply to the short follow-up (e.g. the AI sent its whole answer again: `PATCH_KEY_NOT_REQUESTED`)
  is listed too (debate: with `replyForm` `PATCH` and no re-check, since it holds only the parts asked for); formats
  shows each job's first wrong reply, the slip itself.
- A reply written in another language than the question's (2026-10-12: MiMo answered 10 of 71 replies in Polish,
  French, Spanish, Catalan, German, Portuguese or Chinese) is a slip like any other: its issues read
  `TEXT_NOT_IN_QUESTION_LANGUAGE@<member>` (e.g. `TEXT_NOT_IN_QUESTION_LANGUAGE@reasons`), and the short follow-up
  and the full re-ask carry that code, so the AI is asked for the same answer in the question's language.

The prompt cache (information only): the start of each prompt now stays the same from call to call, so the AI
companies can reuse it from their cache, cheaper and faster. `cacheByModel.<model>` (both modes) gives the calls each AI answered,
their input tokens, the part read from the cache (`cachedInputTokens`, as DeepInfra's `cached_tokens` and Anthropic's
`cache_read_input_tokens` report it), `callsReportingCache` (answers that reported a cached count at all) and
`cachedShare` (cached / input); report.md has one line per AI. Formats also shows `cachedInputTokens` per job and per
model and job. Input tokens count the way the app counts them: for Anthropic its cache reads and cache writes are
included (Anthropic's own `input_tokens` leaves them out). `cacheByModel` is read from the gates' answers as the
practice watches them; since length guidance LG-B the database keeps each call's cached count too
(`cached_input_tokens`), and the debate report's `tokensByModelAndStep.cachedShare` is read from there.

Calls at once (debate only, information only): `parallel` in report.json, "Calls at once" in report.md. It gives the
setting the runner ran with (`setting`, written the way `--call-concurrency` takes it, and where it came from: `source`
`FLAG` or `REGISTER`, and `registerRow` `SET` or `ABSENT`), each gate's number of calls at once as read at the start
(`gateSlotsAtStart.<gate>`: `slots`, and `read: false` when the gate could not be read, so it ran with 1), the most
calls that really went at once in the debate (`peakInFlight`), per model (`peakByModel`) and per gate (`peakByGate`),
how long each model's calls waited for a free slot in all (`waitedMsByModel`, milliseconds), the calls (`calls`), and
how many times a model's "too busy" refusal made one call wait and try again while the model's other calls waited for
it (`busyProbesByModel`).

### The free re-scoring (rescore mode, R2)

`rescore` reads every `transcript.json` under a folder again and asks no AI, spends nothing and opens no database:

```bash
node_modules/.bin/tsx tools/preview-practice/practice.ts rescore --transcripts "$P" --out "$P/rescore"
```

First it checks that the engine's own arithmetic gives back exactly the strengths each debate served (no more than
0.000000001 apart); a debate where it does not is listed as `PRACTICE_RESCORE_ENGINE1_MISMATCH` and not used. Then it scores
each debate with engine 2's honest scores and link rules, a "cannot assess" link counting at 0.5, 0.66, 0.75 and 1.0, each
with the investigations' outcomes applied and not, and writes `rescore.json` (every row) and `rescore.md` (counts and
letters only): which answer leads by honest final strength, the gaps, whether the lead differs from what engine 1 served
and from the start setting, and per debate how many investigations held, failed or stayed a dead end (`holds/fails/dead
end`: what the "applied" rows applied). At 1.0 a point an investigation found to hold and a dead end weigh the same (both
links at full weight); only a point found to fail still weighs less there (its disputed score). The comparing judges are not
asked (that needs AI calls). Under engine 2 the served answer is the comparing judges' choice, so the first check takes the
recorded served answer as theirs (never requiring it to lead by honest strength), and a change of the strength lead in the
sweep is not a change of the served answer (rescore.md says so too). A transcript written before R2 has no
engine graph: it is rebuilt from its answer and its calls when it can be, else listed as
`PRACTICE_RESCORE_INPUT_INCOMPLETE <what>`. `--engine-policy FILE` picks the settings the sweep starts from (default
`tools/preview-practice/engine-policy-start.json`). Exit 0 when every debate was rescored, 10 when some were listed, 20 when
a debate's served numbers could not be given back, 30 when nothing could be rescored.

### The judges' order (judge-order mode, R2b, owner ruling D3)

Do the comparing judges lean on the order they read the answers in? `judge-order` takes saved engine-2 debates (debate
mode with `--transcript`; their `transcript.json` holds the judges' recorded votes) and asks each judge that voted the
very prompt it was sent, once more, with the answers in reverse order (each keeps its letter):

```bash
node_modules/.bin/tsx tools/preview-practice/practice.ts judge-order --transcripts "$P" --out "$P/judge-order" \
  --settings "$S" --gate-status-deepinfra "$D" --gate-status-anthropic "$A"
```

It spends real money: one judge call per recorded vote (about half a cent to a cent each), two with `--control`, which
also asks the same prompt unchanged so a flip can be told from an AI that simply answers differently each time, plus
the repairs and retries a call may need (a reply in the wrong form is asked once more, a busy AI is tried again). Spend
stays inside the owner's test budget in force that day, and the paid run waits for the owner's go. `--dry` answers from
a script (every scripted judge picks the first answer shown) and spends nothing:

```bash
node_modules/.bin/tsx tools/preview-practice/practice.ts judge-order --dry --transcripts "$P" --out "$P/judge-order-dry"
```

Only the very prompt the judge read is sent again: a saved prompt that was redacted, no longer matches the fingerprint
recorded when it was sent, or does not show the recorded letter is not asked (its code is listed under "Not asked"). Any
vote not asked for a reason other than a judge that recorded no vote makes the verdict PASS_WITH_WARNINGS. A
`transcript.json` right under `--transcripts` is listed under that folder's name.

Per maker of the judge, `report.md` gives: the flip rate (the choice changed when the order was reversed; a move to
another answer inside the judge's own same-answer group, `same_as`, counts as a flip too), the same with
the order unchanged (`--control`), how often the choice was among the longest answers shown (both orders) beside the
rate chance alone would give, and how often the judge called its choice conditional (both orders). An answer's length
is the words of its answer, its case and its supporting points. Counts and codes only. These numbers go to the owner
before any rule that asks the judges in both orders; nothing here changes how a debate is judged, and `rescore` never
runs it.

### Tokens and words per AI and step (every debate, length guidance LG-B)

`report.json` carries `tokensByModelAndStep` and `lengthByModelAndStep`, and `report.md` shows them as two tables, one
row per AI and step (opening, pros_cons, cross_exchange, judge_panel, reviewer, answer_writer, answer_checker,
story_writer, story_checker, map, structure_repair, and UNMAPPED for a call of no step):
- tokens: how many tries (each try whose reply was stored; a call's retries count apart); thinking and answer tokens
  (p50 / p90 / max); the share of the input the vendor read from its cache; how many length retries thought one level
  lower because thinking had used up the answer's room; how many tries asked for more than the standard 32,768 tokens
  (the final writers' own maximum; a slow row's final writers keep 16,384 and are not counted here). Haiku's structure-repair
  tries are Haiku's own row (`structure_repair`): Haiku spent those tokens;
- words: the words each step was guided to (empty until a length row exists), how many replies were accepted, the
  words they wrote (median / p90 / max), the share longer than guided, how many replies were stopped at their allowance,
  and how many were refused for their form. A reply Haiku put back into its form counts for the AI and step that wrote
  it: the words are that AI's, copied word for word.
Nothing here is ever checked against anything: the owner reads it to tune each AI. `transcript.json` has the same
measures per call (`usage.answerTokens`, `guidedWords`, `actualWords`). Formats mode has no such tables; each try in its
`samples.jsonl` carries `tokenCeiling` (the bound it asked for) and `thinkingLevel` (the level it ran at).

### The new debate shape (debate mode, `--shape-policy`)

The new debate shape (spec 2026-10-12, Phase 2) is switched on by one register row, `debateShapePolicy`. The live
preview has no such row, so a practice debate runs today's shape unless you ask for the new one.

- `--shape-policy FILE` puts the row from FILE into the practice's own throwaway database, and only there:
  - The register is copied as always: every exported version, each proved by its hash.
  - With `--register-next` (see "Optional flags"): the row goes into this code's next version, which the preview
    publish kit composes in the throwaway database anyway. No other version is made. That version already holds this
    code's own contract hashes.
  - Without `--register-next`: ONE more version is published in the throwaway database. It holds the last exported
    version's rows with the debate-shape row added. If the export already holds a debate-shape row, the copy's row is
    replaced instead. That version also holds this code's own judge, composer, conformance and map contract hashes, in
    place of the live ones: the runner refuses the new shape unless the map hash is its own, and the hashes must
    describe what this code sends.
  - The practice asks and argues on that version: both the ask path and the runner read the row from it.
  - The export file is only read. The live register is never reached; the practice has no connection to the live
    database at all.
- Until the owners publish a register version that carries this code's prompt fingerprints (map `d46c0c12…`, judge
  `810d611a…`, answer checker `108f1b29…`, composer `879d2c5d…`; before length guidance LG-C the map was `25b4c106…`,
  the judge `aac53407…` and the checker `660ec7cb…`; the composer was `9a46af29…` until answer writer v4, 2026-10-15), every practice debate of this branch runs with `--register-next`, in either
  shape. Without it, a debate in today's shape is refused before it starts (HARNESS_ERROR
  `REGISTER_PROMPT_CONTRACT_HASH_MISMATCH`: the live register holds the older fingerprints), and the two shapes would
  not run on the same register rows.
- `tools/preview-practice/shape-policy-start.json` holds the owners' start values: rulings S5 to S8, with the angle map
  as the opening. A unit test keeps it equal to the start values in the code.
  - A file that does not pass the register's own check is refused before anything starts, with
    `PRACTICE_SHAPE_POLICY_INVALID`.
  - The refusal names only the place in the file that is wrong.
  - A file that switches the row off (`"enabled": false`, the preview's way back) is refused too: it could never run
    the new shape. The start-values file never holds `enabled` (absent means on).
- `--depth-mode fixed|adaptive`, `--scrutiny standard|deep|exhaustive` and `--answer-length short|standard|detailed`
  ask the practice debate with these settings, as the /new page sends them.
  - The ask path adjusts them for the plan exactly as the site does. The practice asks as a premium person with no plan
    id, so the `premium` sizes apply.
  - Each one left out is the site's default: adaptive, standard, standard.
  - Without a debate-shape row they would be ignored, so they are refused before any AI is asked, with
    `PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW`.
- Only debate reads these four flags. Every other mode refuses them, and a mistyped flag is refused before anything
  starts (`PRACTICE_FLAG_UNKNOWN`).

With the row, `report.json` gains a `shape` block, and `report.md` a "Debate shape" paragraph with no reply text. The
block holds:

- `source`: FLAG for `--shape-policy`, REGISTER for a register that already holds the row;
- `registerVersion`: the throwaway version the debate ran on. `report.json`'s `register` block names the same version;
  when the practice published its own version on top (`--shape-policy` without `--register-next`), that block keeps the
  export's newest version as `importedRegisterVersion`;
- `row`: ADDED or REPLACED; with `--register-next`, UNCHANGED when the export already held this very row (same value,
  same source);
- `asked`: the three settings as given;
- `storedDepthParams`: what the ask path stored for the run;
- `sizes`: the sizes frozen on the run's money receipt (plan, map AIs, answers, graders, close-call extra graders,
  points per answer, deeper points, gap rounds, the three settings, the opening);
- `opening`: the opening the debate used. It is `TODAYS_OPENING` when the map was unavailable, or gave fewer than two
  answers to argue, and each AI argued its own position, as today;
- `mapCallsByStep`: the map's calls by step (angles, list, merge, gap, choose, check), every try as the ledger recorded it;
- `chosenAnswers` and `alsoRaised`: how many different answers the map chose to argue, and how many points came up but
  were not debated. When fewer than two answers were chosen, the points are still counted here, but the story and the
  debate page show none of them (today's opening was argued instead);
- `mapMarks`: the map's fallback marks, with how often each came up (for example `ANSWERS_FILLED`);
- `panelCloseCallExtensions` and `scrutinyExtensions`: how many points had a close call that called for extra graders
  (counted even when an extra grader then failed), and how many points scrutiny examined further (one count per point,
  not per exchange);
- `notExercised`: why the new shape did not run, else null.

Engine 2 (`--engine-policy`, with `--length-policy` and `--shape-policy`): the map ends with one `MAP:check` call (another maker than the chooser's); `report.json` carries `answerCheck` (checked; rejected, and per test: not an answer, adding a fact, no cost named; exempt as premise challenges; replaced, dropped, kept, unavailable; assumptions per debated answer) and `mapFallbacks` (merge, choose: 0 or 1 per debate). Counts only: the checker's and the chooser's own verdicts, never code's.
The `answerCheck` block also carries two counts beside the tests: `emptyReasons`, how many empty reasons the checker
wrote in its refused tries (each is refused and asked again, so this counts slips, not outcomes; a structure-repair try
of an engine-2 map call is re-read with the readings of the call it repairs, since its own prompt names no map contract), and
`templateFillsDebated`, how many of the answers the run debated are the code's own last-resort template ("The opposite of
this answer: ..."). These are fills DEBATED: a template fill that the check replaced is not counted, though its
`ANSWERS_FILLED` mark stays in `mapMarks` (which counts fills MADE, from any source). The block's `mapCallsByStep` gains
`check`, and `report.md` gains an "answer check" line (engine 2 only) and a "map fallbacks" line.

Map calls also count everywhere else, like any other call:

- in `byModelAndSite`, as the site `MAP`;
- for the format rule.

With `--transcript`, `transcript.json` gains `structure.map`:

- the map's items: every point and candidate answer, with the AI that wrote it;
- the choice: the answers argued and the points also raised.

A debate asked for the new shape that did not run it is NOT_PROVEN (exit 30), with the reason
`SHAPE_NOT_EXERCISED:<why>`:

- `MAP_UNAVAILABLE_TODAYS_OPENING`: fewer than two map lists came back, so the opening fell back to today's (the map's
  stored choice says so even when no answer was served);
- `MAP_ANSWERS_NOT_ARGUED`: the map gave fewer than two answers to argue, so each AI argued its own opening, as today;
- `NO_MAP_STORED`: the run kept no map at all (it stopped before the map);
- `NO_SHAPE_ON_RECEIPT`: the run was admitted without the shape;
- `FACTS_UNREADABLE:<code>`: what the run did could not be read.

Without `--shape-policy`, on a register without the row, nothing changes: today's shape, and no `shape` block.

Switching the new shape on for the site is a separate set of owner steps, listed in the plans and not done by this
tool: publish a register version with this code's prompt fingerprints; run migration 0118 before the hosted mode;
keep the row out of force until the /new page's language pop-up (P2L Task 18) is deployed (L-POPUP-FIRST); fix the
re-claim bug first (task_205182c8); publish the support article (C-ARTICLE); and let running debates finish first.

To run the new shape, add the start values to S-6's debate command, which already runs with `--register-next` (see
above; S-3 first, as always):

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question ro --register-next --shape-policy tools/preview-practice/shape-policy-start.json --out "$P/debate-shape-report"
echo "exit: $?"
```

### Length guidance (debate mode, `--length-policy`)

- `--length-policy FILE` puts the length row from FILE into the practice's own throwaway database, and only there (with
  `--register-next`: into the code's next version, as the server's `--length-guidance` would). The file is checked by the
  register's own parser before anything is spent; a refusal names only the place that is wrong
  (`PRACTICE_LENGTH_POLICY_INVALID <path>`, `PRACTICE_LENGTH_POLICY_UNREADABLE`).
- `tools/preview-practice/length-policy-start.json` holds the owners' start values (spec 2026-10-15 §7).
- With the row, `--answer-length short|standard|detailed` works without `--shape-policy`.
- `report.json` gains a `length` block: where the row came from, the version, and the numbers the debate was admitted
  with. The guided-vs-actual words table fills its "guided" and "over guided" columns. A map row shows its guided words
  but no "over" share: a map call is told one target per part of each item, and its reply holds several items.
- A reply put back into its form by the structure call carries no guided words: it counts as accepted, but is left out
  of the guided median and the "over" share.
- Comparing levels (ruling L22): run the same question with two or three `--length-policy` files that differ only in the
  numbers being compared, one run at a time, within the daily test budget. Results are judged by the owners' private
  method, outside this repository, plus cost and time from the report.

### The engine row (debate mode, `--engine-policy`)

- `--engine-policy FILE` puts the engine row (`engineVersionPolicy`, spec 2026-10-15 engine redesign §3.3) from FILE
  into the practice's own throwaway database, and only there, in the same throwaway version as the `--shape-policy` and
  `--length-policy` rows (with `--register-next`: into the code's next version, as the server's plan would carry it).
  The file is checked by the register's own parser before anything is spent; a refusal names only the place that is
  wrong (`PRACTICE_ENGINE_POLICY_INVALID <path>`, `PRACTICE_ENGINE_POLICY_UNREADABLE`). A file with `"enabled": false`
  is refused too (`PRACTICE_ENGINE_POLICY_INVALID enabled`): it would run today's engine.
- Engine 2 reads its word targets from the length row, so `--engine-policy` needs `--length-policy` or a length row in
  the exported register; without either it is refused before anything is spent
  (`PRACTICE_ENGINE_REQUIRES_LENGTH_POLICY`). If the row is not in the version the debate runs on, the debate is
  refused before any AI is asked (`PRACTICE_ENGINE_POLICY_NOT_PUBLISHED`).
- `tools/preview-practice/engine-policy-start.json` holds the owners' start values (spec §3.4).
- In this phase the engine row changes only the story: it is told with story v4 (one shape, the pack's default; the
  checker says whether a problem is misleading; only a misleading problem starts round 2, which revises its own draft;
  a backup storyteller when the first cannot write at all). The rest of the debate is today's until the later phases.
- Example (S-6's debate command plus): `--length-policy tools/preview-practice/length-policy-start.json --engine-policy tools/preview-practice/engine-policy-start.json`.
- Every debate report now says which engine the run was admitted with (`report.json` `ask.engine`, from the run's own
  receipt) and, counts and codes only: `storyRounds` (per story round: the storyteller's model, `MISLEADING`,
  `WORDING_NOTE_ONLY`, `SATISFIED`, `NOT_SATISFIED` for today's checker, `NO_DRAFT`, `NO_VERDICT` or `VERDICT_UNREAD` (the
  checker answered through the short follow-up and its earlier reply could not be read), and whether the round revised
  its own draft), `storyBackups` (the first storyteller's model, the signal `UNREACHABLE`, `TOO_SLOW`,
  `OUT_OF_ROOM` or `UNUSABLE`, the backup's model, the outcome) and `storyReadyRate` (the stored stories by outcome, to
  sum over runs). The story tables `storyLengthByField` and `storyJsonBreaks` are described under "The story in words".
- A story or checker reply that Haiku's structure repair rescued counts for its own round (and its words for the AI
  whose call it repaired). The words table's `storyteller` row is the short story's sum; `storyLengthByField` splits it
  per field and adds the long version.

### Pinning the answer writer and the storyteller (debate mode)

- `--answer-writer-model <model>` and `--storyteller-model <model>` name the AI that writes the answer and the one that
  tells the story in this practice debate (one practice run is one question, so a pin per question is a flag per run).
  Each must be one of the preview's premium models (`PRACTICE_PIN_MODEL_INVALID <flag>` otherwise; the value typed is
  never repeated). Debate mode only.
- The pin works through the role rotation: the counts the rotation reads are shaped so it picks the pinned model; the
  checkers are still picked from another maker. The run's own role table is never written by the practice. With role
  rotation off in the practice register the run is refused before any AI is asked (`PRACTICE_PIN_NEEDS_ROLE_ROTATION`;
  with `--register-next`, give `--role-rotation on`).
- `report.json` gains `writerPins`: per pinned role, the pinned model, the model the run's pin names, the models that
  actually served the step (`servedBy`: the answered final-writer calls; the stored story's storyteller), and whether the
  pin held: only when the run's pin names the pinned model and the pinned model served the step. A pinned model that
  sat out cannot be picked, and a cost fallback or a backup storyteller serving instead is not the pinned model: either
  way the verdict is NOT_PROVEN with `PRACTICE_PIN_NOT_HELD:<ROLE>`.

### The question language (language mode, and debate's `--site-language`)

With the new shape on, the site fixes the language of each question before the debate starts (P2L):

- First eld, a small language reader on the server, reads the question. When it is sure the question is in the
  site's language, that is the language. On some sites eld is never trusted alone, because there it mixes up near
  neighbours (Romanian, English and Indonesian are among them): there the fast AI below always reads the question.
- Otherwise one short call to a fast AI (Haiku) reads it. If the question really mixes two languages, the person is
  offered the question written in one language (the pop-up), and can keep their own wording instead.
- With no fast AI (a signed-out person, or no paid AI), eld and the question's alphabet decide, else the site's
  language.

`language` mode checks this on ten fixed questions, with no debate and no database:

- For each question: eld's reading, the fast AI's reading (always asked here, so its reading is written down even when
  eld was sure), and one call to the AI that plans a debate's angles (the AIs take turns).
- The language is worked out exactly as the site does it. One question, `lang-zh-short`, is worked out as if there
  were no fast AI: its language must come from its alphabet. The fast AI is still asked, so its reading is written
  down.
- It writes `language.jsonl` (one line per question, never the question's text), `report.json` and `report.md`.
- It costs under $0.05 and takes about 5 to 20 minutes: the questions go one at a time, and the slower AIs take 30 to
  170 seconds to plan a question's angles.

| Id | Site | Must lock | Offer the rewrite |
|---|---|---|---|
| `lang-ro-plain` | ro | ro | no |
| `lang-ro-en-mix` | ro | ro | yes |
| `lang-en-on-ro` | ro | en | no |
| `lang-short-code` | en | en | no |
| `lang-sr-latn` | ro | sr-Latn | no |
| `lang-id` | id | id | no |
| `lang-ro-borrowed` | ro | ro | no |
| `lang-zh-short` | en | zh | no |
| `lang-ku-arab` | ar | ku | no |
| `lang-en-hukou` | en | en | no |

`lang-zh-short` is a short Chinese question, worked out as if there were no fast AI. `lang-ku-arab` is Kurdish
(Sorani) written in Arabic letters, asked on the Arabic site: it must lock Kurdish (`ku`).

`lang-en-hukou` is for the reply-language check's stray-letter rule (PR #194). The rule refuses Chinese, Japanese or
Korean letters written outside quotation marks into text in a language with another alphabet (English or Romanian, for
example), and the usual short follow-up asks the AI for that piece again. The practice debates so far asked about
nuclear power, buses, the euro, moving abroad and social media, so no AI had a reason to add such a term on purpose.
This one asks, in English, whether China should abolish its "hukou" household registration system, so an AI may well
write "hukou (户口)". At the next release, run the release's practice debate once with
`--question lang-en-hukou` (each paid run needs the owner's yes), and read "Reply-language refusals" in `report.md`.
The owners may reword it, but only in Latin letters: such letters in the question itself switch the rule off for the
whole debate.

The verdict:

- FAIL: a question locked to the wrong language, or the mixed question not offered a rewrite.
- FAIL: a rewrite offered on a question whose "Offer the rewrite" is "no" (`LANGUAGE_UNEXPECTED_OFFER`), even when
  the language is right. For example `lang-ro-borrowed`: borrowed words such as "startup" or "AI" never make a
  question mixed, so the site must not show the pop-up for it.
- NOT_PROVEN: the fast AI did not answer, so the language came from a fallback. Run it again later.
- PASS otherwise. Then the owners read each rewrite in `report.md`, where it stands beside the question, and decide
  whether it keeps the meaning.
- The planner's naming is recorded for the operator only: it never changes the verdict and never shows up as a mark
  on an answer.

The fast AI's settings come from the export's `questionLanguagePolicy` row when it has one (`--register-export`), else
from the code's start values. A row the site itself would refuse at start-up is refused here too, before anything is
sent: for example a reserved word in the owners' text, or a model or thinking level the Anthropic gate does not allow.

If you interrupt a language run (Ctrl-C), its report is still written. But `report --out` cannot rebuild a language
folder (it refuses with `PRACTICE_SAMPLES_LOG_MISSING`): run the mode again into a new folder instead.

A dry run first (scripted answers, nothing spent, no socket):

```sh
node_modules/.bin/tsx tools/preview-practice/practice.ts language --dry --out "$P/language-dry"
echo "exit: $?"
```

The real run (S-3 first, as always):

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts language --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --out "$P/language-report"
echo "exit: $?"
```

Debate mode, with a debate-shape row, also asks with a site language:

- `--site-language <code>`: one of the site's 35 languages. Left out, a language case asked by its id (for example
  `--question lang-sr-latn`) is asked on its own site from the table above, as the language mode asks it. Any other
  question is asked on its own language as the old guesser reads it, if the site has that language; else English.
- `--language-choice use|keep`: how the pop-up is answered when the ask offers a rewrite. The default is `keep`: the
  person keeps their own wording. With `use`, the debate argues the rewritten question, while `transcript.json` still
  names the case's own question.
- Both need a debate-shape row; without one they are refused before any AI is asked
  (`PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW`).
- `report.json` gains a `language` block, and `report.md` a "Question language" paragraph: the site language; the
  language locked, how and why; the language the debate was stored with; whether a rewrite was offered and used; and
  what the planner named (for the operator only).

The full practice debate on the mixed question, before the preview upload (S-8). It answers the pop-up with `use`, so
the rewrite is tried once. Like every practice debate of this release, it runs with `--register-next`: the release
needs a new register version (new prompts), and until the owners publish it the practice runs on this code's next
version (see `--register-next` under "Optional flags").

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --register-next --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question lang-ro-en-mix --site-language ro --language-choice use --shape-policy tools/preview-practice/shape-policy-start.json --transcript --out "$P/language-debate"
echo "exit: $?"
```

### The story in words (formats `--story-length`, and the story tables)

A debate run with `--length-policy` AND `--engine-policy` asks engine 2's story (v4): the storyteller and the story
checker are asked with story contracts v4; each short text of the story (the headline, the summary, the confidence
sentence, each path line, the "what would change it" text and each reason) gets a target length in words, the long
PDF version gets none, and the long version comes last after an empty example of the exact nesting. The story checker
is told the same targets. With `--length-policy` alone the story keeps today's v3, with no targets, except that the
also-raised claims are sent whole (LG-C part 2, Task 15).

- `formats --story-length` asks the formats mode's story jobs (`STORYTELLER`, `STORY_CHECKER`) as engine 2's story (v4),
  with the owners' start values (the length row's, for the premium plan at Standard, and the engine row's). It is the
  cheapest way to have every AI write and check one v4 story: `--lanes STORYTELLER,STORY_CHECKER --samples 2` gives each
  AI one English and one Romanian story and check. It is refused in every other mode.
- Every report with a story call has two more blocks, counts only: "Story length per AI and field" (the words each
  accepted story wrote in each short field and in the long version, beside its target; `-` without one) and
  "Storyteller replies that were not readable JSON" (by where they broke: after the long version began, before it, or
  unknown). `report.json` holds them as `storyLengthByField` and `storyJsonBreaks`.
- A story try sent as the short follow-up (its recorded form is PATCH: it holds only the parts the AI was asked to fix,
  not a whole story) is left out of both blocks: its words are not counted and it is not counted as a reply.

## Safety rules built in

- It refuses to start unless `PRACTICE_ACK=spends-real-money` is set and both forwarded sockets exist.
- It refuses to start unless root's fresh `status` of each gate says `active`, and unless each gate's count of
  "could not reach the AI company" answers in a row (the status field `unsent_streak`) is below three; the refusal
  prints the count it found. The gate itself halts at five. There is no daily cap: "too busy" refusals never stop a
  start. It also refuses unless each gate's own read-only "what is left today" answer says active and open.
- The settings file may hold only non-secret settings from an allow-list; a database address, a team list or
  anything key-shaped refuses. A hosted settings file may also carry the hosted API's country-file and billing
  settings: they are set aside unread (see "Practising the hosted preview").
- A busy model (formats mode): when the AI company refuses a model's call as "too busy" and refuses its one resend
  too (not billed), or the model is cooling off after such refusals (the gate refuses that model for a while, without
  contacting the AI company), only that model pauses. It waits out its cool-off (as long as the gate says when it
  names a time, never less; otherwise 1 minute, then 2, 4, 8 and at most 10 minutes for each wait in a row, the gate's
  own cool-off steps, a little longer at
  random), then the same job is tried again; the other models, on the same gate too, go on meanwhile, and the gate is
  not stopped for this. Each model may wait at most `--busy-wait-minutes` in all (default 30). Only when that time is
  used up is the model marked busy and its remaining jobs skipped (`SKIPPED_MODEL_BUSY`): a warning
  (`MODEL_BUSY_PARTLY`, PASS_WITH_WARNINGS) when it gave at least one accepted answer in the run, NOT_PROVEN when it
  gave none (owner ruling 2026-10-12, "Keep GLM, it sits out"); never FAIL. A
  model that came back and did all its jobs is proven; its refusals stay a warning (PASS_WITH_WARNINGS). The report
  lists per model how often it waited, how long in all, and whether it recovered. `--busy-wait-minutes 0` is the old
  rule: skip the rest at once. Ctrl-C cuts a wait short. In debate mode the runner makes a busy model sit out by
  itself (a warning when it gave at least one accepted answer before, NOT_PROVEN when it gave none or sat out from the
  start). The gate's own refusal "too many calls at once" never marks a model busy.
- The safety net on each gate, counted as the gate counts: the practice never sends to a gate again after 4
  answers in a row on it that were "could not reach the AI company" or an error the AI company answered without
  billing it and without saying it is busy (the gate's PROVIDER_ERROR_UNBILLED, e.g. Anthropic's 400, 404, 413 or 500:
  the gate counts both in the same run), counting from the count the gate already had at the start; the gate itself
  halts at 5 in a row. A vendor answer resets that count. "Too busy" refusals and cool-offs neither add to it nor reset
  it, as the gate's own count works. A gate that refuses or halts for any other reason also stops at once. "Too many
  calls at once" moves nothing. With several calls at once, a call is only sent while that count plus the calls still
  in flight on the gate stays within 4 (if every one of them failed, the gate would still not halt); otherwise it waits
  for one to come back. In formats mode a job whose calls all ended in such an unbilled error is a failed call (FAIL),
  never "busy".
- Start it with `node_modules/.bin/tsx` as in S-6, not `pnpm exec tsx`: on Ctrl-C pnpm quits at once (it sends the
  practice SIGTERM and gives up), so the terminal shows pnpm's exit 130 instead of the practice's own exit code. The
  practice still finishes and writes its report even then, but the exit code the release steps read is lost.
- Ctrl-C once: no new calls are sent, the calls in flight finish, the report is written (NOT_PROVEN unless something
  failed). Ctrl-C again within two seconds counts as the same press (pnpm and tsx pass the key press on again; pnpm's
  SIGTERM right after it too). A SIGTERM or SIGHUP at any other time quits at once and still writes the report
  (ABORTED). Ctrl-C
  again later quits at once and still writes the report from the finished jobs (ABORTED); avoid it: a call killed
  mid-flight can halt the gate.
- Formats mode: one call at a time per model, about a second apart (a slightly random gap, `--gap-ms`, default 1000),
  at most the gate's own number of calls at once per gate (root's status `max_concurrent_calls` when it names it, else
  4 for DeepInfra and 1 for Anthropic), and at most 5 calls at once in all (`--max-in-flight`). The relay must accept
  at least 3 more connections than `--max-in-flight` (S-4 starts it with `--max-connections 20`, enough for either
  mode); a relay that refuses a connection makes that call fail and stops the gate. `--sequential`: one call at a time, a 2-second gap.
- Debate mode: the runner sends a debate's AI calls at the same time, as the live preview does, within the
  call-concurrency setting: how many calls at once in the debate, how many to one model in the debate, and how many to
  one model across the runner (by vendor, with a `default`). Each gate's own number of calls at once
  (`max_concurrent_calls`, read from the gate at the start) is never passed: extra calls wait their turn on the Mac
  instead of being refused by the gate. A gate whose number cannot be read at the start runs with 1 call at a time, and
  the report says so. Without `--call-concurrency` the practice uses the live register's own setting, and one call at
  a time when the register has none (today's preview). `--call-concurrency 12/3/default=50,deepinfra=150,anthropic=50`
  sets it for this practice only; it is never written to any register. The relay must accept at least 3 more
  connections than the two gates' numbers added up: today 10 DeepInfra and 2 Anthropic calls at once, so at least 15
  (S-4 starts it with `--max-connections 20`); if a gate's `max_concurrent_calls` is raised, raise
  `--max-connections` with it.
- Debate mode with calls at the same time (`--call-concurrency`, or a register that has the setting): first make sure
  both gates run the gate code of this release (`deploy/preview-gate/v3/README.md` §"Redeploy (2026-10-12): calls on
  their way together count once"; the checks are in `deploy/preview-release/v1/README.md` "Publishing the
  call-concurrency row", Step 0). With the old gate code, one short network blip while 5 or more DeepInfra calls are
  on their way counts as 5 failures and halts the DeepInfra gate (`provider_unreachable`). If that happens, re-open it
  as that gate README's "Re-open after a halt" says (owner's yes).

## Money and time (rough)

- formats, default (5 models x 9 jobs x 2 samples): 90 jobs, about $0.10 to $0.30. The models go at the same time, so
  it takes about as long as the slowest model's 18 jobs: about 15 to 50 minutes (GLM, Qwen and MiMo take 30 to 170
  seconds a call), plus up to `--busy-wait-minutes` (default 30) when a model is busy. With `--sequential`, about 1
  to 2 hours, plus the same.
- openings, all 12 questions and all four arms: about 350 calls. Cost: roughly $0.5 to $1 in all, a planning
  estimate, not yet measured (the first real run's report gives the real figure). The tighter pot is Haiku's: the test
  budget is $5 a day for DeepInfra but only $1 a day for Haiku, so check Haiku's share in the first run's report before
  running again the same day. `report.md` shows each gate's spend by the gate's own count ("spent by the gate's count"
  on its line under "Gates"), and Haiku is the only AI on the Anthropic gate, so the `anthropic` line is Haiku's share. The steps of one arm go one after another, so it takes several hours (the slow models
  take 30 to 170 seconds a call). That is why S-6 runs it in two halves (see there). `--dry` spends nothing.
- debate, depth 1: up to about 230 calls, about $0.15 to $0.70, about 1 to 2 hours one call at a time. Depth 2: about
  350 calls, up to about 3 hours. Calls at the same time (`--call-concurrency`, or the register's setting) cost the
  same and should take less time; the report's "Calls at once" part shows how much the calls overlapped. The start-of-debate estimate needs much more room left in the pots than is actually spent (about
  $4 DeepInfra and $0.90 Anthropic left for depth 1), so run early in the Bucharest day.
- debate in the new shape (`--shape-policy`), depth 1: about $0.30 (spec 2026-10-12), with fewer calls than today's
  shape, plus one fast language check by Haiku on the Anthropic gate (about $0.00013). Its start-of-debate estimate may
  need more room than today's shape (the map's merge and choose steps are each counted in full on both gates): read
  the first new-shape run's admission figures (S-8, "Room the estimate needs").
- language: under $0.05, about 5 to 20 minutes.
- the whole-debate comparison (S-8): eight depth-1 debates over at least five days, after day 1's language mode and
  `lang-ro-en-mix` debate, about $1.9 to $4.3 in all with
  day 1's formats; a pair run again adds about $0.45 to $1, so allow up to about $6 for reruns.
- hosted preview: the same calls and cost; the debate is also held to the register's per-debate ceiling (the owner's
  value, suggested $3) and its story to the story ceiling ($0.05), as on the server.

## Operator steps

Placeholders are shell variables you set first. `PREVIEW_SSH` is your own ssh host alias for the preview server (from
your ssh config); this README never names a host.

### S-0, Mac: the worktree and its toolchain (once per worktree)

From the worktree's `dialectical-engine` folder:

```sh
pnpm install --frozen-lockfile --offline
pnpm run generate:contract
for d in node_modules/.pnpm/@embedded-postgres+darwin-arm64@*/node_modules/@embedded-postgres/darwin-arm64; do (cd "$d" && node scripts/hydrate-symlinks.js); done
shasum -a 256 tools/preview-practice/gate-relay.py
```

The digest printed must be `356f35eaf28764a3e17c2af5e2ec25360405c775331323177aac4e12ab409ce0` (the relay of the slow-answer ruling, 2026-10-12: it keeps a quiet connection
open 1,500 s and lets an in-flight call finish for up to 1,500 s, past the gate's 1,200 s vendor deadline and the app's
1,290 s socket timeout). Copy the relay to the server (the server checks the same digest in S-4):

```sh
scp tools/preview-practice/gate-relay.py "$PREVIEW_SSH:/home/ubuntu/gate-relay.py"
```

### S-1, server, root: export the live register (read-only)

The live register version is the runner's `REGISTER_VERSION`. The query only reads; the session is read-only.

```sh
install -d -o root -g root -m 0700 /root/practice
V=$(sed -n 's/^REGISTER_VERSION=//p' /etc/debateai-v3-preview/auth-dev-v1/runner.env)
echo "register version: $V"
runuser -u postgres -- env PGOPTIONS='-c default_transaction_read_only=on' psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -X -q -At -v ON_ERROR_STOP=1 -c "SELECT json_build_object('schema','preview-practice-register-export-v1','versions',(SELECT json_agg(json_build_object('register_version',register_version::text,'row_count',row_count,'sealed',sealed,'base_register_version',base_register_version::text,'publication_id',publication_id::text,'request_sha256',request_sha256::text,'snapshot_sha256',snapshot_sha256::text,'publication_kind',publication_kind,'recorded_at',recorded_at::text) ORDER BY register_version) FROM register.register_version WHERE register_version <= ${V}),'rows',(SELECT json_agg(json_build_object('register_version',register_version::text,'row_key',row_key,'value_json',value_json::text,'source_ref',source_ref) ORDER BY register_version,row_key) FROM register.register_row WHERE register_version <= ${V}))" > /root/practice/register-export.json
wc -c /root/practice/register-export.json
```

### S-2, server, root: export the allowed settings (no secret is copied)

Only these keys are copied; `grep` prints nothing on screen. `RELEASE_KEY` is not copied on purpose: the practice
names its release from the Mac checkout it runs (`r<REGISTER_VERSION>-<first 12 hex of git HEAD>`), and its runner and
its ask both use that one key (side-by-side spec §1, §3). A settings line `RELEASE_KEY=…` would win if one were added;
a hosted practice with neither a line nor a readable git HEAD refuses (`PRACTICE_SETTINGS_VALUE_INVALID: RELEASE_KEY`).

```sh
grep -E '^(PREVIEW_PROVIDER_TEST_CONFIG_JSON|PROVIDER_DISCOVERY_TARGETS_JSON|REGISTER_VERSION|DEBATEAI_DEPLOYMENT_MODE|NODE_ENV|CLAIM_MS|CLAIM_MARGIN_MS|MAX_RECOMPOSE|JUDGEMENT_NUMBER_KIND|JUDGEMENT_PRODUCER|PROPAGATION_NUMBER_KIND|PROPAGATION_PRODUCER|PROVIDER_PROBE_TIMEOUT_MS|PROVIDER_REF|VLLM_BASE_URL|VLLM_MODEL|VLLM_MAKER)=' /etc/debateai-v3-preview/auth-dev-v1/runner.env > /root/practice/settings.env
grep -E '^(STRANGER_SAMPLE_RATE|BATTERY_VERSION|SETTLEMENT_WATCH_HANDLE)=' /etc/debateai-v3-preview/auth-dev-v1/api.env >> /root/practice/settings.env
cut -d= -f1 /root/practice/settings.env
```

### S-3, server, root: each gate's status (repeat right before EACH practice run)

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 > /root/practice/deepinfra-status.json
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1 > /root/practice/anthropic-status.json
install -d -o ubuntu -g ubuntu -m 0700 /home/ubuntu/practice
install -o ubuntu -g ubuntu -m 0600 /root/practice/register-export.json /root/practice/settings.env /root/practice/deepinfra-status.json /root/practice/anthropic-status.json /home/ubuntu/practice/
```

### S-4, server, root: install and start the relay

The relay's two sockets belong to the group `ubuntu` (the ssh user's own group), mode `0660`, so the ssh user's
forward can open them; the relay runs with `ubuntu` as a supplementary group so it can give them that group. (Earlier
versions of this step named a group `debateai-practice`; it does not exist on the server, and the relay refuses an
unknown group, `GATE_RELAY_UNKNOWN_GROUP`. Nothing has to be created once per server.)

Each time: install the relay (the digest printed must be `356f35eaf28764a3e17c2af5e2ec25360405c775331323177aac4e12ab409ce0`, the one printed on the Mac in S-0), then start it
as the runner account, sandboxed: no network but unix sockets, read-only system, no new privileges, ends by itself
after 8 hours. It closes a connection only after 1,500 s with no bytes either way, and at its end (or a stop) lets a
call in flight finish for up to 1,500 s: a model call may take up to the gate's 1,200 s (slow answer, 2026-10-12).

```sh
install -d -o root -g root -m 0755 /usr/local/lib/debateai-practice
install -o root -g root -m 0644 /home/ubuntu/gate-relay.py /usr/local/lib/debateai-practice/gate-relay.py
sha256sum /usr/local/lib/debateai-practice/gate-relay.py
systemd-run --unit=debateai-preview-practice-relay --collect -p User=debateai-preview-runner -p Group=debateai-preview-runner -p SupplementaryGroups=ubuntu -p RuntimeDirectory=debateai-practice -p RuntimeDirectoryMode=0711 -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes -p PrivateDevices=yes -p PrivateNetwork=yes -p RestrictAddressFamilies=AF_UNIX -p IPAddressDeny=any -p CapabilityBoundingSet= -p AmbientCapabilities= -p RestrictSUIDSGID=yes -p LockPersonality=yes -p UMask=0077 -p RuntimeMaxSec=30600 -p TimeoutStopSec=1560 -p KillMode=mixed /usr/bin/python3 -I /usr/local/lib/debateai-practice/gate-relay.py --listen-dir /run/debateai-practice --group ubuntu --mode 0660 --max-connections 20 --lifetime-seconds 28800 --drain-seconds 1500 --idle-timeout-seconds 1500
systemctl status debateai-preview-practice-relay --no-pager
journalctl -u debateai-preview-practice-relay -o cat --no-pager
ls -l /run/debateai-practice
```

The journal must show one `"event": "start"` line and the folder two sockets, `srw-rw----` with group
`ubuntu`. A refusal prints one plain word (for example `GATE_RELAY_GATE_MISSING:anthropic`) and the unit
ends.

### S-5, Mac: forward the two sockets

A short private folder (macOS limits a socket path to 104 bytes), the settings copied down, then the forward. Leave
the `ssh -N` running in its own terminal.

```sh
D=$(mktemp -d /tmp/dp.XXXXXX)
P=$(mktemp -d /tmp/dpr.XXXXXX)
scp "$PREVIEW_SSH:/home/ubuntu/practice/*" "$P/"
ssh -N -o ExitOnForwardFailure=yes -o StreamLocalBindUnlink=yes -o StreamLocalBindMask=0177 -L "$D/deepinfra.sock:/run/debateai-practice/deepinfra.sock" -L "$D/anthropic.sock:/run/debateai-practice/anthropic.sock" "$PREVIEW_SSH"
```

### S-6, Mac: run formats, then debate (and openings, when the owners ask for it)

In a second terminal, from the worktree's `dialectical-engine` folder (set `D` and `P` to the same folders as in
S-5):

```sh
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --out "$P/formats-report"
echo "exit: $?"
```

Only after formats passes: repeat S-3 (fresh gate status) and copy the two status files down again, then run the
debate. Until the owners publish a register version that carries this code's prompt fingerprints, it runs with
`--register-next` (see "The new debate shape"): without it, the debate is refused before it starts.

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question ro --register-next --out "$P/debate-report"
echo "exit: $?"
```

The openings comparison (it spends real money from the test budget; see "Money and time"), all five AIs, in two
runs: first the 6 Romanian questions, then the 6 English ones, each into its own `--out` folder. Why two: the whole
comparison takes several hours and may outlast the relay, which S-4 starts with an 8-hour lifetime. Each half seats the
AIs exactly as one full run would (by each question's fixed place). Run it dry first (see "The openings record").

Before each half: repeat S-3 (fresh gate status) and copy the two status files down again. The Romanian half:

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts openings --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --questions ro-euro,ro-autobuze,ro-final-viata,ro-ciuperci,ro-strainatate,ro-hpv --out "$P/openings-report-ro"
echo "exit: $?"
```

Then the English half, after S-3 again. If the relay has ended meanwhile: on the server, as root, run S-4's
`systemd-run` line again, then its three check lines (the install and the sha256 check of S-4 are skipped: the
installed file is still there). Then on the Mac, first stop the earlier `ssh -N` (Ctrl-C in its terminal) and run S-5's
`ssh -N` line again in that same terminal (it puts the two sockets back in the same `D`; leave `D` and `P` as they
are):

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts openings --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --questions en-nuclear,en-four-day-week,en-phones-school,en-retirement-age,en-social-media-age,en-rent-caps --out "$P/openings-report-en"
echo "exit: $?"
```

Optional flags:

- formats: `--samples N` (1 to 10, default 2), `--gap-ms MS` (between one model's calls, default 1000; with
  `--sequential` between all calls, default 2000), `--max-in-flight N` (1 to 20, default 5), `--sequential`,
  `--busy-wait-minutes N` (0 to 240, default 30: how long in all one busy model may wait before its remaining jobs are
  skipped; 0 skips at once),
  `--models a,b` (model ids from the preview's roster), `--lanes JUDGE_POSITION,PANEL,...` (default all nine:
  JUDGE_POSITION, JUDGE_ATTACK, JUDGE_CROSS, PANEL, REVIEW, SYNTHESIZER, EVALUATOR, STORYTELLER, STORY_CHECKER).
  `--levels "<model>=<level>,...;..."` (the same jobs at several thinking levels, see S-6b).
- openings: `--dry` (scripted answers, nothing spent), `--questions ro-euro,en-rent-caps,...` (only the fixed ids:
  ro-euro, ro-autobuze, ro-final-viata, ro-ciuperci, ro-strainatate, ro-hpv, en-nuclear, en-four-day-week,
  en-phones-school, en-retirement-age, en-social-media-age, en-rent-caps; default all twelve), `--arms T,A,B,C`
  (default all four; they always run in the order T, A, B, C, C2, C2N; C2 and C2N run only when named, never with
  `--dry`, see "The openings record"), `--busy-wait-minutes N` and `--max-in-flight N` as in
  formats (with `--dry` a busy AI sits out at once unless `--busy-wait-minutes` is given). The questions themselves
  are fixed in the code and never read from the command line; a refused value is never repeated in the output.
  Any other flag is refused in openings (for example `--question`, `--models` or `--samples`), and `--settings` and
  the two `--gate-status-*` flags are refused with `--dry`, so a mistyped flag can never start the paid run.
- report: `report --out DIR` builds DIR/report.json and DIR/report.md again from DIR/openings.jsonl when DIR holds one
  (an openings run), else from DIR/samples.jsonl. `report --side-by-side FILE --out DIR` writes only
  DIR/side-by-side.html from a formats samples log (see S-6b).
- debate: `--depth 1|2`, `--question ro|en`, one of the comparison's ids (`ro-euro`, `ro-strainatate`, `en-nuclear`,
  `en-social-media-age`, see S-8) or a language case's id (for example `lang-en-hukou`, see "The question language"),
  `--call-concurrency A/B/default=N,deepinfra=N,anthropic=N` (A: calls at
  once in the debate, 1 to 64; B: calls at once to one model in the debate, 1 to 16; each N: calls at once to one model
  across the runner for that vendor, 1 to 1000, `default` required; for example `12/3/default=50,deepinfra=150,anthropic=50`;
  formats, openings and report refuse it), `--transcript` (also write `transcript.json`: every prompt and every answer, see "The whole
  debate, word for word" above), `--shape-policy FILE`, `--depth-mode fixed|adaptive`, `--scrutiny standard|deep|exhaustive`
  and `--answer-length short|standard|detailed` (see "The new debate shape"; debate only). The register is copied only
  through the register's own publication paths; an export holding a support-configuration version refuses
  (`PRACTICE_REGISTER_PATH_UNSUPPORTED`).
  `--register-next` practises a release that needs a NEW register version (new sealed prompts) before it is uploaded:
  the export is imported as always, then this checkout's next version is composed on its newest version by the
  preview publish kit itself (`buildPreviewSourceRowsV2` and `composePreviewSnapshotV2`, with the newest version's own
  checker choice, rotation switch and measured runtime), published on top in the throwaway database, and the debate
  runs on it. The settings file stays the live one (its `REGISTER_VERSION` must still be the export's newest version).
  The progress line and `report.json` (`register.codeNext`) name every row the next version changes: on the server,
  the publish proposal must show the same rows (plus `nodeRuntimeVersion`'s source reference, which the server
  measures again). A checkout that changes no row refuses (`PRACTICE_REGISTER_NEXT_UNSUPPORTED`). On the hosted
  preview, or to practise the switch to it, add `--hosted-billing '<JSON>'` (publish kit v3; see "`--register-next` on
  the hosted preview" above); `--checker`, `--deepseek-enabled-on-gate`, `--role-rotation` and
  `--register-call-concurrency` give the plan's other choices (with kit v2 they replace the newest version's).
  With `--shape-policy`, the debate-shape row goes into that next version too, with kit v2 or kit v3 alike (no other
  version is made), so `register.codeNext` also names `debateShapePolicy`, which the release's own publish leaves out
  unless the plan is given the same policy (`--debate-shape '<JSON>'`).
  `--site-language <code>`, `--language-choice use|keep` (default `keep`; see "The question language"; debate only, with
  a debate-shape row).
- language: `--dry` (scripted answers, nothing spent); `--register-export` (the fast AI's settings from its
  `questionLanguagePolicy` row, if any). Nothing else.

### S-6b, Mac: thinking levels side by side (formats, `--levels`)

`--levels` (formats mode only) asks the listed models every job once per listed thinking level (spec 2026-10-12
§4.8). Its value is `<model>=<level>,<level>,...;<model>=...`:

- each level must be on that model's reviewed menu (GLM: high, low; DeepSeek: high, low, none; MiMo: default, none;
  Qwen: default, low, medium, none; Haiku: high, medium, low), and each model must be in this run (`--models`, or the
  preview's roster without it). Anything else refuses before a gate is asked (`PRACTICE_LEVELS_INVALID`);
- a level listed twice is run twice (`high#1`, `high#2`): the gap between those two runs shows how much the results
  move by chance alone (the "chance band" line under the table in `report.md`);
- the runs take turns per job (A, B, C, then B, C, A, ...), one after another, never at once, so a slow or busy hour
  falls on every level alike. A busy model parks all its runs;
- each run sends only its own level (the server's per-step levels are left out: a pure A/B). A model not listed runs
  once, at the server's levels, as without `--levels`;
- each sample in `samples.jsonl` also carries its run, level, thinking tokens, whether a reply stopped at max_tokens,
  and its accepted answer (key-shaped strings blanked, at most 64 KiB). `report.json` gets a `levels` block and
  `report.md` a "Thinking levels" table: per model and run, answered / jobs, first try, repaired, format failed (a reply
  in the wrong format for good), call failed (the call itself failed or was refused, not billed), cut off, thinking
  median and total, time median / p90, cost per job and total, and over bar (this run alone over the slip bar;
  information only).

To read the answers themselves, side by side: `node_modules/.bin/tsx tools/preview-practice/practice.ts report --side-by-side "$P/levels-step-b/samples.jsonl" --out "$P/levels-page"` writes `$P/levels-page/side-by-side.html` from a finished run's samples log, sending nothing and writing no report files. Open it in a browser. It shows the four chosen jobs only (PANEL, SYNTHESIZER, STORYTELLER, REVIEW); `--lanes PANEL,SYNTHESIZER` names other jobs, checked the same way as in formats mode. Each model has its own block, and each job a block per sample and question, with one labelled column per run: the accepted answer (or why there is none), then its status, thinking tokens, time, cost in US dollars, and "cut off" when a reply stopped at the length limit. Its header explains the labels: "high#2" is the same level run a second time, so you can see what changes by chance alone; "default" is the AI's own setting; "none" means thinking is switched off. The file holds the answers, so keep it in `$P` with the reports; it has no script, every value on it is escaped, and it is readable only by you.

The tool does not count the testing day's budget itself: before a `--levels` run, read both gates' day spend (S-3)
and keep the day's total under the owner's limits. The run can be stopped at any time with Ctrl-C (the report is
still written).

Step A (spec 2026-10-12 §6, a few cents): does each level really work? One job, one question, every level once. Same
`D` and `P` as in S-5, fresh status files from S-3:

```sh
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --lanes PANEL --samples 1 --levels "zai-org/GLM-5.3-Flash=high,low;deepseek-ai/DeepSeek-V4.1-Flash=high,low,none;Qwen/Qwen3.8-Flash=default,medium,low,none;XiaomiMiMo/MiMo-V2.6-Pro=default,none;claude-haiku-5-5=high,medium,low" --out "$P/levels-step-a"
echo "exit: $?"
```

Step B (spec 2026-10-12 §6, the side-by-side run): all nine jobs, four samples of each job per run (the
English and the Romanian practice question, each twice), today's level run twice. The planned runs:

| AI | Level runs |
|---|---|
| GLM | high, high, low |
| DeepSeek | high, high, low, none |
| Qwen | default, default, medium, low, none |
| MiMo | default, default, none |
| Haiku | high, high, medium, low |

Take out of the `--levels` value any level Step A showed refused or ignored, then (fresh status files from S-3 again):

```sh
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --samples 4 --busy-wait-minutes 30 --levels "zai-org/GLM-5.3-Flash=high,high,low;deepseek-ai/DeepSeek-V4.1-Flash=high,high,low,none;Qwen/Qwen3.8-Flash=default,default,medium,low,none;XiaomiMiMo/MiMo-V2.6-Pro=default,default,none;claude-haiku-5-5=high,high,medium,low" --out "$P/levels-step-b"
echo "exit: $?"
```

That is 19 runs of 36 jobs, about 680 jobs. The verdict stays per model, with all of that model's runs counted
together (a slip fixed by the second try is a warning; a step failed for good, or more than 1 slip in 10 of the
model's answered calls, fails). Each run's own bar is shown, for the comparison only, in the levels table's "over
bar" column; its "answered / jobs" column shows the jobs a busy model skipped.

### S-6c, Mac: the LG-B proof (between the LG-B gates' phase 2 and the LG-B app upload)

Length guidance LG-B: the final writers now ask each model's own maximum (16,384 first on the slow rows GLM, MiMo and
Qwen), so the proof makes sure Haiku writes a story at least once, measures the storyteller's thinking one level lower
(OVERVIEW B-1), then runs one whole debate with every AI. It needs the LG-B gates on the server first, with their phase
2 done (`deploy/preview-gate/v3/README.md`, "Length guidance LG-B (2026-10-15): installing this change": both GOs name
`max_final_writer_calls`): with an older gate, or one without that slot, the app keeps its final writers at the
standard caps, and the proof proves nothing (the practice then prints `PREVIEW_FINAL_WRITER_TIER_UNREAD` for that
gate). From phase 2 until the app upload the live site refuses new debates, so run the proof right after phase 2 and
upload right after the proof. Same `D` and `P` as in S-5.

1. B-1 on the LOCAL copy only (the server's api.env and runner.env are not touched): after S-5's copy (`scp` brings
   `settings.env` down to `$P`; it exists on the Mac only then), merge the storyteller's one-level-lower levels into
   `$P/settings.env`'s `thinking_levels`, keeping every other entry and step, then check the table. "One level lower"
   means one level below the level the server's table gives the `story_writer` step TODAY: GLM `high` → `low`; Qwen
   `medium` → `low`; MiMo `default` → `none` (thinking off for the story); Haiku `high` → `medium` (Haiku's usual level
   on the preview is `medium`, but its `story_writer` step has a `high` override today, and B-1 lowers that override).
   DeepSeek gets no entry: its level today, `none`, is its lowest. The merge prints one line for each of the four
   storyteller entries it sets (the level before → the new one), nothing else. The checker must print `OK`, with
   `story_writer=low` for GLM and Qwen, `story_writer=none` for MiMo, `story_writer=medium` for Haiku, and every other
   override as before.

       python3 -I - "$P/settings.env" <<'PY'
       import json, sys
       path = sys.argv[1]
       KEY = "PREVIEW_PROVIDER_TEST_CONFIG_JSON"
       lines = open(path).read().split("\n")
       hits = [i for i, line in enumerate(lines) if line.startswith(KEY + "=")]
       assert len(hits) == 1, "exactly one config line"
       cfg = json.loads(lines[hits[0]][len(KEY) + 1:])
       table = cfg.setdefault("thinking_levels", {})
       B1 = {"zai-org/GLM-5.3-Flash": "low", "XiaomiMiMo/MiMo-V2.6-Pro": "none", "Qwen/Qwen3.8-Flash": "low", "claude-haiku-5-5": "medium"}
       for model, level in B1.items():
           steps = table.setdefault(model, {}).setdefault("steps", {})
           print(f"B-1: {model} story_writer {steps.get('story_writer')!r} -> {level!r} (local settings.env only)")
           steps["story_writer"] = level
       lines[hits[0]] = KEY + "=" + json.dumps(cfg, separators=(",", ":"), ensure_ascii=False)
       json.loads(lines[hits[0]][len(KEY) + 1:])
       open(path, "w").write("\n".join(lines))
       PY
       node_modules/.bin/tsx tools/preview-practice/check-thinking-levels.ts --settings "$P/settings.env"

2. Before EACH run below: repeat S-3 and copy ONLY the two status files down:

       scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"

   Never re-run S-5's full copy (`scp ".../practice/*"`) now: it would overwrite the merged `$P/settings.env` with the
   server's and drop B-1. Re-run the checker (step 1's last line) before each run; it must still show the four
   `story_writer` levels. Check: each gate `state` `active`; the
   DeepInfra GO's `daily_budget_usd` `"12.00"` and the Anthropic one's `"4.00"`; the Anthropic gate's
   `remaining_today_usd` at least $1.60 (a final writer's hold of $1.22 plus the run's Haiku calls); and each gate's
   `today_spend_usd` plus the run's rough cost inside the testing day's limits ($5 DeepInfra, $1 Haiku). Otherwise stop.
3. The formats run (Haiku writes a story at least once). It runs with `--sequential`: formats mode sends its calls
   without the runner's call queue, so with DeepSeek and MiMo both on final-writer jobs a second final writer would
   wait at the DeepInfra gate's one final-writer slot (up to 60 seconds) and be refused. One call at a time avoids
   that:

       PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --models claude-haiku-5-5,deepseek-ai/DeepSeek-V4.1-Flash,XiaomiMiMo/MiMo-V2.6-Pro --lanes SYNTHESIZER,EVALUATOR,STORYTELLER,STORY_CHECKER --samples 1 --sequential --out "$P/lg-b-formats"

4. The storyteller A/B (B-1 measured before the server's table changes; about $0.50): MiMo with thinking on and off,
   Haiku at high and medium, two samples each, each run sending only its own level (S-6b). Then the side-by-side page
   for the owner (`--side-by-side`, S-6b):

       PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --models XiaomiMiMo/MiMo-V2.6-Pro,claude-haiku-5-5 --lanes STORYTELLER --samples 2 --levels "XiaomiMiMo/MiMo-V2.6-Pro=default,none;claude-haiku-5-5=high,medium" --out "$P/lg-b-story-levels"
       node_modules/.bin/tsx tools/preview-practice/practice.ts report --side-by-side "$P/lg-b-story-levels/samples.jsonl" --lanes STORYTELLER --out "$P/lg-b-story-page"

5. The whole debate:

       PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question ro --transcript --out "$P/lg-b-debate"

Since R17 the live register carries this code's prompt seals and LG-B changes none, so the debate runs without
`--register-next`; add it only if the debate is refused with `REGISTER_PROMPT_CONTRACT_HASH_MISMATCH`. Pass: the
owner's bar (practice-pass-bar); in every report no gate stop and no gate refusal (`gates.<gate>.observed.stop` null,
`gateRefused` 0) and no failure naming `REQUEST_SCOPE_INVALID`, `RESERVATION_MISMATCH` or `PREVIEW_CALL_TIER_INVALID`;
Haiku's STORYTELLER sample answered, its first try asking 128,000 tokens at `medium`; no reply with zero visible words
after a "lower" retry; and the two tables filled for every AI that answered. The A/B has no pass bar of its own: it is
what the owner reads before the server's `story_writer` levels change.

### S-6d, Mac: engine 2's story in words (formats `--story-length`)

For the end-of-program practice (R1d Task 26, deferred); it spends real money.

From the worktree's `dialectical-engine` folder, with `D` and `P` as in S-5, after a fresh S-3:

    PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts formats --settings "$P/settings.env" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --lanes STORYTELLER,STORY_CHECKER --samples 2 --story-length --out "$P/story-length-formats"
    echo "exit: $?"

### S-8, Mac: the whole-debate comparison (today's shape and the new shape)

What it is, in plain words:

- The same four fixed questions are argued twice each, at depth 1 with all five AIs: once in today's shape and once in
  the new shape (the owners' start values). Both run with `--register-next`, so the two differ only by the
  debate-shape row (see "The new debate shape").
- Each run gets its own `--out` folder: `$P/compare/<question>/today` and `$P/compare/<question>/shape`.
- Each folder holds `report.json`, `report.md` and `transcript.json`.
- The tool only runs and records the debates.
  The results are judged by the owners' private method, outside this repository. Nothing in this README or in the
  tool is part of that method.

The four questions are fixed in the code (`practice-questions.ts`). Each one is word for word the openings question of
the same id, so the Phase 1 data lines up:

| Id | Language | Kind |
|---|---|---|
| `ro-euro` | Romanian | public policy |
| `ro-strainatate` | Romanian | personal decision |
| `en-nuclear` | English | contested fact |
| `en-social-media-age` | English | ethics |

**The working folder.** S-8 runs over several days. S-5's folder (`P=$(mktemp -d /tmp/dpr.XXXXXX)`) is a new one each
time and may be emptied when the Mac restarts, so S-8 keeps one folder of its own, in your home folder, outside the
repository. On day 1 only, run these two lines in place of S-5's `P=` line (if `mkdir` says the folder exists, an
earlier comparison is in it: choose another name and use it on every day):

```sh
P="$HOME/debate-shape-s8"
mkdir -m 700 "$P"
```

Every later day, in each terminal, run only the first of those two lines in place of S-5's `P=` line, then the rest of
S-5 as written: its `scp` copies the day's fresh settings and register export into the same folder (the settings hold
no key, see S-2). At the end of each day, keep a dated copy of the results somewhere else too:

```sh
cp -Rp "$P/compare" "$HOME/debate-shape-s8-compare-$(date +%Y-%m-%d)"
```

**The pass bar comes first** (the owner's rule: before any upload, a practice with all real AIs must pass):

1. Day 1: run S-3, then S-6's formats. It must PASS. For exit 10 the owner decides, as in the table above.
2. Then the language mode (above): first `--dry`, then the real run. It must PASS. A FAIL stops everything: nothing is
   uploaded. NOT_PROVEN: run it again later the same day, into a NEW `--out` folder. The first run's folder already
   holds its `language.jsonl`, so the mode refuses it (`PRACTICE_OUT_ALREADY_HOLDS_LANGUAGE`, nothing spent). For the
   second try, for example:

   ```sh
   scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
   PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts language --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --out "$P/language-report-2"
   echo "exit: $?"
   ```

   A third try goes into `"$P/language-report-3"`, and so on.
3. Then, the same day, one full practice debate on `lang-ro-en-mix` in the new shape (the command at the end of "The
   question language"). It must PASS, and its "Question language" paragraph must say the offer was made and the
   rewrite used. It costs about $0.30 and takes 1 to 2 hours, like one new-shape debate.
4. Day 2: run the first pair on `ro-euro`, today's shape first. Both debates must PASS:
   - today's shape is the release's practice debate, because the upload ships with the row absent, so the site keeps
     today's shape, and with a new register version carrying this code's three prompt fingerprints (P2b OWNER STEP
     PF-B13). That is why this debate runs with `--register-next` too: it practises that very version;
   - the new shape proves the shape.

   If either is FAIL, stop: nothing is uploaded and the comparison waits for a fix. These two runs are also the
   comparison's first pair.

**One pair a day after that:**

| Day | Pair | Order |
|---|---|---|
| 3 | `ro-strainatate` | new shape first |
| 4 | `en-nuclear` | today's shape first |
| 5 | `en-social-media-age` | new shape first |

Money and time, within the owners' daily test budget:

- **Cost per debate.** A depth-1 debate costs roughly $0.15 to $0.70 in today's shape and about $0.30 in the new shape,
  plus one fast language check by Haiku per new-shape debate (about $0.00013, on the Anthropic gate). Formats costs
  $0.10 to $0.30. The whole comparison is about $1.9 to $4.3 (four debates in each shape and day 1's formats),
  spread over at least five days. The language mode costs under $0.05 and the `lang-ro-en-mix` debate about $0.30, on
  day 1 after formats. A pair run again adds about $0.45 to $1, so keep room for reruns (up to about $6 in all).
- **Room the estimate needs.** The start-of-debate estimate needs more room left than a debate spends: about $4
  DeepInfra and $0.90 Anthropic for depth 1 in today's shape. So the second debate of a day may be refused at the ask.
  Then the report's first reason starts with `ADMISSION_REFUSED:`, and nothing but the AIs' health checks was spent.
  - The new shape's estimate may need more room (the map's merge and choose steps are each counted in full on both
    gates). Read the first new-shape run's admission figures before you plan the next day: whether it was admitted,
    and each gate's `remainingBefore` in `report.json`.
  - Run that debate first thing the next Bucharest day, into the same folder.
  - Note in your own log that the pair was split over two days.
- **Daily stop.** After every run, read the "spent by the gate's count" on each gate's line in `report.md`. Stop for
  the day once the day's runs add up to $4.50 DeepInfra or $0.90 Anthropic. Haiku is the only AI on the Anthropic gate,
  so its line is Haiku's share.
- **Time.** Both debates of a pair run with the same call setting: the same `--call-concurrency` value on both
  commands, or none on either. The commands below give none, so they use the register's own setting, which on today's
  preview is one call at a time: a debate then takes about 1 to 2 hours, so a pair fits in one relay lifetime (S-4: 8
  hours). With calls at the same time (for example `--call-concurrency 12/3/default=50,deepinfra=150,anthropic=50`
  added to both commands, only after the gate check under "Safety rules built in"), a whole debate in today's shape
  took 53 minutes when it was measured (2026-10-13). If the relay has ended, restart it as described under S-6.

Each run: set the question, repeat S-3 and copy the status files down, then run the two commands in the day's order.
Repeat S-3 and the `scp` line before the second command too.

```sh
Q=ro-euro
```

Today's shape:

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question "$Q" --register-next --transcript --out "$P/compare/$Q/today"
echo "exit: $?"
```

The new shape:

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question "$Q" --register-next --shape-policy tools/preview-practice/shape-policy-start.json --transcript --out "$P/compare/$Q/shape"
echo "exit: $?"
```

What to check after each run:

- **The verdict.** A FAIL or HARNESS_ERROR stops the comparison until it is understood. NOT_PROVEN means some AI sat
  out, or, for the new shape, the shape did not run (`SHAPE_NOT_EXERCISED`). Run that question's pair again on another
  day.
- **The new shape's report.md.** Its "Debate shape" paragraph must say the opening used was `ANGLE_MAP` and must list
  the chosen answers.
- **The story's note on the answers.** When the "Debate shape" paragraph says the new shape was not exercised because
  of `MAP_UNAVAILABLE_TODAYS_OPENING` or `MAP_ANSWERS_NOT_ARGUED`, or its map marks list `ANSWERS_FILLED` or
  `CHOOSE_QUOTA_FILLED`, the story owes the person one plain sentence on how the argued answers came about. Read the
  story in `transcript.json` (`structure.story`). It must say, in the question's language, either "We could not first
  gather every possible answer, so each AI argued the answer it found best." (for the first two codes) or "Some of the
  answers or points argued here were added to make sure enough options were tested." (for the last two). If the story
  leaves it out, note it for the owners with the question's id: it is a finding, not a verdict.

Keep `$P/compare` with the other reports (S-7 deletes only `$D`; `$P` here is the folder in your home folder, made on
day 1). It holds only our own practice questions and the AIs' text about them.

### S-7, stop and clean up

Mac: stop the `ssh -N` (Ctrl-C in its terminal), then:

```sh
rm -rf "$D"
```

Server, root: stop the relay (it lets a call in flight finish first), check both gates are still active with no new
halt, and remove the copies:

```sh
systemctl stop debateai-preview-practice-relay
journalctl -u debateai-preview-practice-relay -o cat --no-pager | tail -n 3
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py status --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1
rm -rf /root/practice /home/ubuntu/practice /home/ubuntu/gate-relay.py
```

Keep `$P` (the reports) as long as the owner wants them; it holds only our own practice text.

## Files

- `practice.ts`: the command (the seven modes: formats, debate, openings, language, report, rescore and judge-order; the
  start checks; the report).
- `practice-runner-composition.ts`, `practice-ask-composition.ts`: the runner and the ask path exactly as the two
  `main.ts` files compose them on the preview, in local or hosted mode (hosted: the money wiring, with billing kept off
  in the ask). `tests/unit/preview-practice-wiring-drift.test.ts` fails if they drift.
- `practice-lanes.ts`, `practice-formats.ts`: the jobs and the formats mode; `practice-levels.ts`: its `--levels`
  plan; `practice-side-by-side.ts`: the side-by-side page (`report --side-by-side`). `practice-debate.ts`,
  `practice-throwaway-db.ts`, `practice-register-import.ts`: the debate mode (`practice-debate.ts` also builds the
  report's two LG-A tables, `repairsByKind` and `unrepaired`); `practice-transcript.ts`: its `--transcript` file.
- `practice-engine-graph.ts`: the transcript's engine graph (A15, `structure.engineGraph`); `practice-rescore.ts`: the
  rescore mode (`rescore.json`, `rescore.md`).
- `practice-investigations.ts`: the report's investigations block (`investigations`, R2: the "cannot assess" reviews and
  what was done about them).
- `practice-judges.ts`: the report's comparing judges block (`judgeVotes`, `labels`, `judgesSeconds`,
  `conditionalWinner`, R2).
- `practice-judge-order.ts`: the judges' order practice (D3).
- `practice-shape.ts`: the debate-shape flags (`--shape-policy`, `--depth-mode`, `--scrutiny`, `--answer-length`), what
  the shape run did (the report's `shape` block, the transcript's `structure.map`).
- `practice-language.ts`: the question language: mode `language` (the ten cases, the lock as the site works it
  out, `language.jsonl`, the report) and debate mode's `--site-language` and `--language-choice`.
- `shape-policy-start.json`: the owners' start values for `--shape-policy`.
- `practice-length.ts`: the length flag (`--length-policy`), what the run was admitted with (the report's `length` block).
- `length-policy-start.json`: the owners' start values for `--length-policy`.
- `practice-pins.ts`: `--answer-writer-model`, `--storyteller-model` (the report's `writerPins`).
- `practice-story-length.ts`, `practice-story-rounds.ts`: the story tables (`storyLengthByField`, `storyJsonBreaks`) and
  the engine and story-round blocks (`ask.engine`, `storyRounds`, `storyBackups`, `storyReadyRate`).
- `practice-gate-observer.ts` (the watch and the brake), `practice-verdict.ts`, `practice-report.ts`,
  `practice-samples-log.ts` (samples.jsonl and the report rebuilt from it), `practice-concurrency.ts` (formats: models at once,
  the per-gate and overall limits), `practice-parallel.ts` (debate: `--call-concurrency` and the report's
  "Calls at once"), `practice-interrupt.ts` (Ctrl-C), `practice-redaction.ts`, `practice-settings.ts`,
  `practice-questions.ts`.
- `practice-tokens.ts`: the tokens and words per AI and step (length guidance LG-B, information only).
- `practice-openings.ts` (the openings run), `practice-openings-questions.ts` (the 12 fixed questions),
  `practice-openings-log.ts` (openings.jsonl and its report), `practice-openings-dry.ts` (`--dry`'s scripted gates).
  The map itself is the package `packages/map`. Tests: `tests/unit/map-*.test.ts`, `tests/unit/practice-openings*.test.ts`.
- `check-thinking-levels.ts`: the offline check of a `thinking_levels` table before any API or runner restart
  (deploy/preview-auth-dev/v1/README.md, "The optional `thinking_levels` table"; it sends nothing and needs no gate):
  `node_modules/.bin/tsx tools/preview-practice/check-thinking-levels.ts --settings "$P/candidate-settings.env"`.
  With `--print-line-up` it prints the value's line-up instead, as the publish kit's plan member `{"lineUp":{…}}`
  (side-by-side spec §13 addition D23; deploy/preview-auth-dev/v1/README.md, "Line-up and answer seats on the preview").
- `gate-relay.py` and `test_gate_relay.py` (run: `python3 tools/preview-practice/test_gate_relay.py`).
- Tests: `tests/unit/preview-practice.test.ts`, `tests/unit/preview-practice-hosted.test.ts` (hosted settings and the
  kit-v3 `--register-next`), `tests/unit/preview-practice-levels.test.ts`,
  `tests/unit/preview-thinking-levels-check.test.ts`,
  `tests/unit/preview-practice-shape.test.ts`,
  `tests/unit/preview-practice-language.test.ts`,
  `tests/unit/preview-practice-side-by-side.test.ts`,
  `tests/unit/preview-practice-transcript.test.ts`,
  `tests/unit/r2-practice-judge-order.test.ts`,
  `tests/unit/preview-practice-wiring-drift.test.ts`,
  `tests/unit/preview-practice-pins.test.ts`,
  `tests/unit/practice-story-length.test.ts`,
  `tests/unit/practice-story-rounds.test.ts`,
  `tests/unit/lg-a-practice-repairs.test.ts` (the two LG-A tables, the step keys, a structure-repair try read as its step),
  `tests/integration/preview-practice-run.test.ts` (both modes against the scripted gate doubles in
  `tests/support/preview-gate-stubs.ts`; no vendor is contacted).
