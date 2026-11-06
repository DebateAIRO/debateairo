# V4 mock API

This is a small stand-in for the real DebateAIRO V3 API. It lets you click through the website (`apps/ui`) on your computer without the real API, the database or any AI.

It plays one person who is signed in (on the Plus plan, or on Free with a switch), has already agreed to everything (age check, sensitive-data notice, terms), and owns eight seeded debates. You can also start new debates: each one "runs" for 25 seconds and then shows a finished answer.

Every reply it sends is checked against the website's own contract rules (`packages/contract`). All seeded replies are checked once when it starts, and it refuses to start if one is wrong. Every reply is checked again just before it is sent.

It moved here from a scratch folder on 30 Oct 2026 (Perplexity plan, task W1-7) and gained: a Free person, the account memory of migration 0131, the web search's draft fields (sources, other pages, a failed search, a path with no search planned), dig suggestions, investigations with the reserve kept, and a "blocked until reset" room.

On 31 Oct 2026 (dig model revision, task W2-7) it gained the owner's new dig model and money rule: paths rewritten by digs (with "What the dig changed" and the verdict on the person's point of view), a dig trail three levels down, a debate paused at the month wall with Continue, a usage read where running work borrowed from tomorrow, a room where new starts wait for the reset, and a new question's share of today. See "The new dig model and the money rule" below.

On 31 Oct 2026 (R22 decision 29) it gained dynamic step 2: `POST /v1/asks/clarify` writes made-up clarifying questions. The end of the question picks the scene: `#none` (the AI could not help: no questions, only the person's own-words boxes), `#fail` (the call fails: the same), `#slow` (no answer past the page's 10-second limit: the same), `#purposeonly` (only the question about what the answer is for), `#nopurpose` (without it). Any other question gets two questions and that one.

On 1 Nov 2026 (R22, for the owner's click-test) it gained the final report as the website reads it: `GET /v1/runs/:id/investigation` serves report versions (the older shape stays at `/__mock/draft/v1/runs/:id/investigation`), `POST /v1/runs/:id/report` ("Write my report": about 8 seconds of "being written", then finished; `report=FAIL` makes it fail) and `POST /v1/runs/:id/reopen` ("Keep digging"). So the current version's PDF can be made against the mock, once the browser has the sign-in cookie. And a debate in Arabic, `a2000000-0000-4000-8000-000000000001`: its question and report are in Arabic (the rest of its map is the English seed), so the page offers Print in place of the PDF.

On 4 Nov 2026 (V4 screen review, dig-f1) the first debate gained its main answer, rewritten after its digs: version 1 while a change is still being written into it (45 seconds after the mock starts, `MOCK_MAIN_ANSWER_SECONDS`), then version 2.

## Files

| File | What it is |
|---|---|
| `server.ts` | The mock server (plain Node, no extra packages). |
| `seed.ts` | The seeded English debate (nuclear vs renewables), built from the website's own story sample (`apps/ui/lib/v3/storyFixture.ts`). |
| `web-draft.ts` | The shapes of the web search, dig suggestions and investigations, imported from the contract (W1-6), and how they would be held back from a contract that does not know them. See "Draft fields" below. |
| `web-seed.ts` | The made-up web pages of the seeded debates (all on `.example` sites; no real article is quoted). |
| `rewrite-seed.ts` | The new dig model's seeded rewrites, digs and dig trail, and the money rule's paused debate and borrow notice (task W2-7). |
| `live-seed.ts` | Draft (owner review 3 Nov, dig-d1 B): a running dig's steps and checked findings, for `GET /v1/runs/:id/progress` (switch `live=ON`). |
| `climb-seed.ts` | Draft (owner review 3 Nov, dig-f2): the played climb of the seeded level-3 dig up to the first debate (switch `climb=PLAY`). |
| `failed-seed.ts` | The owner's answers of 5 Nov (questions 3 A and 20 A): a debate with one failed dig per reason group, and a failed question whose draft view says it used some of the quota. |
| `plan-windows.ts` | Which quota windows the usage read names for each plan: Free the month alone, a paid plan its day, week and month (as the real API reads the register). |
| `quaderno-tax.ts` | Prices `GET /v1/billing/plans` through Quaderno itself when `MOCK_QUADERNO_API_KEY_PATH` is set: the API's own tax reader (`DisplayedTaxReader`) over the production Quaderno client. See "Tax from Quaderno" below. |
| `check.ts` | Self-check. It reads every endpoint through the website's own code: the `/api` proxy, the typed client, and the V4 map builder. |

The unit test `tests/unit/v4-mock-api.test.ts` checks the seed and the draft shapes without starting anything. `tests/unit/v4-mock-quaderno.test.ts` checks the Quaderno pricing against the acceptance fake of Quaderno.

## 1. Start the mock

Run it from the repository's `dialectical-engine` folder:

```sh
cd dialectical-engine && node_modules/.bin/tsx tools/v4-mock-api/server.ts
```

When it is ready it prints one line that starts with `{"mock":"ready"`. It listens on `http://127.0.0.1:4011`. Stop it with Ctrl+C.

## 2. Start the website against it

Use a second terminal, while the mock is running:

```sh
cd dialectical-engine/apps/ui && DIALECTICAL_API_BASE=http://127.0.0.1:4011 PORT=3011 NEXT_DIST_DIR=.next-v4mock node server.mjs --dev
```

Then open `http://127.0.0.1:3011/v4`.

Settings the development mode needs:

- Only `DIALECTICAL_API_BASE` is required. Both the `/api` proxy and the server-rendered pages read it.
- In `--dev`, nothing else is required. `RELEASE_KEY` may be left out (it is required only outside `--dev`). `DIALECTICAL_UI_HOST` defaults to `127.0.0.1`. `NEXT_PUBLIC_API_BASE` defaults to `/api`.
- Optional, not needed here: `NEXT_PUBLIC_VERDICT_FIRST_UI=true` (a banner on the classic debate page), `NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON` (preview site only), `TURNSTILE_SITE_KEY` (the anti-robot box on sign-up and sign-in, which the mock never needs).

Cautions, after the website has run in development mode:

- It changes `apps/ui/next-env.d.ts` and `apps/ui/tsconfig.json`. Put both back before committing: `git checkout -- apps/ui/next-env.d.ts apps/ui/tsconfig.json`.
- `.next-v4mock` is the website's build cache. Git does NOT ignore it (only `.next/` is ignored), so never commit it. Move it to the Trash when you finish testing.
- The development website is heavy. Do not run it next to other big jobs (tests, builds) on a 16 GB Mac.

### Signing in, for the server-drawn pages (optional)

The V4 pages (`/v4`, `/v4/debate/<id>`, `/v4/debate/<id>/report`) check the session from the browser, and the mock always says "signed in". So they work right away.

Some classic pages decide on the server, by looking for the session cookie: the home page `/` and the classic debate page `/debate/<id>`. To give the browser that cookie, open this address once: `http://127.0.0.1:3011/api/__mock/sign-in`. To remove it, open `http://127.0.0.1:3011/api/__mock/sign-out`.

This works in Chrome and Firefox, which allow secure cookies on `127.0.0.1`. Safari may refuse the cookie.

## Seeded debates

All the answers carry the same English debate: *"Should countries build new nuclear power, or put the money into renewables and storage?"* Only the question line, and the web case (see "Draft fields"), change between them.

| Run id | What you see | Web case | Investigation |
|---|---|---|---|
| `11111111-1111-4111-8111-111111111111` | **Finished**, the nuclear question, story ready. Answer id `aaaa1111-…`. Its main answer (rewritten after its digs) is still being rewritten for the first 45 seconds, then shows version 2: the map shows it without a reload, as news at the question. | paid, searched | **open** (reopened by its dig 8888; report version 1 kept as an earlier version) |
| `22222222-2222-4222-8222-222222222222` | **Running forever** ("Is a four-day work week good for productivity and for workers?"). | – | open |
| `33333333-3333-4333-8333-333333333333` | **Waiting in line**. It is expected to start 20 minutes after the mock started. | – | open |
| `44444444-4444-4444-8444-444444444444` | **Failed** with `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM` (the website's "the AI models it needs were unavailable" sentence). Its draft view says `quota_used: "NONE"` (owner review 3 Nov). Its page offers "Ask this again", which opens `/v4?again=4444…` with the question filled in. | – | none |
| `55555555-5555-4555-8555-555555555555` | **Finished**, but its story says "still writing" for the first 40 seconds after the mock starts. Answer id `aaaa5555-…`. | paid, searched | open |
| `66666666-6666-4666-8666-666666666666` | **Finished**, asked on the **Free** plan. Answer id `aaaa6666-…`. | Free: not on this plan | closed (report version 1) |
| `77777777-7777-4777-8777-777777777777` | **Finished**, but its **web search failed**. Answer id `aaaa7777-…`. | failed | open |
| `88888888-8888-4888-8888-888888888888` | **Finished dig** of 1111, from the still-argued point `p:n-renew-storage`, quick look. Answer id `aaaa8888-…`. **Level 1**; it rewrote 1111's path n-renew (an AI suggestion, so no verdict). | paid, searched | member of 1111's |
| `d1000000-0000-4000-8000-000000000001` | **Finished dig** of 1111's path n-mix with the person's **own view** and their **edit** of a suggestion. Level 1. Answer id `aaaad100-…`. Its rewrite carries the verdict "helped this path and the main question". | paid, searched | member of 1111's |
| `d2000000-0000-4000-8000-000000000002` | **Finished dig of the dig** 8888 (its path n-renew), with the person's own view. **Level 2**. Answer id `aaaad200-…`. Verdict "did not help this path"; 1111's n-renew is marked "a dig further down changed part of this". | paid, searched | member of 1111's |
| `d3000000-0000-4000-8000-000000000003` | **Finished dig** of d200's path n-nuclear, thorough. **Level 3**. Answer id `aaaad300-…`. Its rewrite is **still writing**, so the first debate's map keeps reading its answer every 15 s (dig-f2) until the switch `climb=PLAY` plays the rest of the climb up to it. | paid, searched | member of 1111's |
| `d4000000-0000-4000-8000-000000000004` | **Finished dig** of 1111's path n-nuclear (task W4-6). Level 1. Answer id `aaaad400-…`. Its rewrite **failed**: the path keeps its text, and the page says the dig's points and sources are below. | paid, searched | member of 1111's |
| `d5000000-0000-4000-8000-000000000005` | **Finished dig** of 1111's path n-smr (task W4-6). Level 1. Answer id `aaaad500-…`. Its rewrite is ready but **changed nothing** ("The dig didn't change this path."). | paid, searched | member of 1111's |
| `d1000000-0000-4000-8000-000000000010` | **Finished dig at the deepest level (10)**, hung under d300 (task W3-4). Answer id `aaaad110-…`. The six digs between levels 3 and 10 are not seeded: only its own answer says level 10, so its map offers no dig anywhere and shows the "deepest level" line. | paid, searched | member of 1111's |
| `e1000000-0000-4000-8000-000000000001` | **Paused at the month wall** (running; its planned calls and searches wait). Continue is refused until the switch `pause=CAN_CONTINUE`. | – | open |
| `f0000000-0000-4000-8000-000000000000` | **Finished**, with **seven digs that did not finish**, one for each reason group (owner's answers of 5 Nov, question 3 A; `failed-seed.ts`). Answer id `aaaaf000-…`. Each digs a place of its own (1, 2, 5 and 6 the whole paths n-mix, n-renew, n-nuclear and n-smr; 3 the open question on battery storage, 4 the first objection, 7 what would change the answer), asked word for word as the website asks it, so each panel offers "Try this dig again" (none reads as a dig that failed twice: see that with `dig=FAIL`). Each dig's panel, and its own page at `/v4/debate/f1000000-0000-4000-8000-00000000000N` (N = 1 to 7), says its reason about the dig: 1 stopped partway (draft view `quota_used: "SOME"`), 2 went wrong before it began, 3 the AIs were unavailable, 4 reached its limit before it could produce an answer (its run's own ceiling), 5 the paid plan ended while it waited, 6 set aside by an update, 7 an option it used is gone (all others `"NONE"`). | paid, searched | open (the seven digs) |
| `45000000-0000-4000-8000-000000000045` | **Failed**, stopped partway (question 20 A). Its draft view says `quota_used: "SOME"`, beside 4444's `"NONE"`: once the contract carries the field, its page says "The part that ran used some of your quota.". Until then that line, and "Nothing was taken for the failed try." on 4444, cannot be seen in place: today's contract refuses a run read that carries `quota_used`, so the normal view holds it back. | – | none |

Example pages: `http://127.0.0.1:3011/v4/debate/11111111-1111-4111-8111-111111111111` (the map) and `…/report` (the report). An answer id also opens these pages.

### What the seeded debate shows on the V4 map

This is the output of `check.ts`, drawn by the website's own map builder (`apps/ui/lib/v4/mapModel.ts`):

| Path (story position) | Fate | Points, with the trust word each one gets |
|---|---|---|
| `n-mix`: mostly renewables, plus some nuclear | HELD_UP | n-mix *sure for this case* (argued and agreed) · n-mix-firm *sure for this case* · n-mix-cost **sure** (looked up and agreed) · n-mix-land *not checked yet* (no review) |
| `n-renew`: renewables and storage only | PARTLY_HELD | n-renew *sure for this case* · n-renew-cost **sure** · n-renew-battery *sure for this case, but dated* (STALE, as of 2023-12-31) · n-renew-storage *still argued* (disputed) · n-renew-winter *sure for this case* |
| `n-nuclear`: nuclear first | FELL | n-nuclear **didn't hold** (its path fell) · n-nuclear-build **sure** · n-nuclear-clean **sure** |
| `n-smr`: wait for small modular reactors | SET_ASIDE | n-smr *not checked yet* · n-smr-cost *still argued* (the second AI could not check it) |

Open questions on the map: the two remaining objections, plus "what would change the answer". The last one carries the star.

Once the new "Sure" rule is built (task W2-6), n-mix-cost will read *sure for the case named*: its citation is remembered, not one of this debate's pages (`looked_up_checked: false`).

## Draft fields (web search, dig suggestions, investigations)

The shapes are task W1-6's (`packages/contract/src/web.ts`). W1-6 merged (`76e935bbd`), and since task W2-6 `web-draft.ts` imports them from the contract instead of carrying copies (the "Draft…" names stayed, so nothing else changed). The fields are still called "draft" below because the real API does not serve them yet (W3-3):

| Where | Draft field | What it holds |
|---|---|---|
| each point of an answer | `sources`, `looked_up_checked` | the checked extracts (id such as `S2-1`, a quote of at most 120 characters cut at a word edge, title, site, link, read depth `WHOLE` / `PREVIEW_ONLY` / `ABSTRACT_ONLY`, reader 1's one line with its language, the page's date, `fewer_readers`); whether the point rests on an extract of this debate (its locator is then that extract's id) |
| each answer | `web.paths` | per path: `search` (`SEARCHED`, `NO_SEARCH_PLANNED` with the planner's reason, `FAILED`, `NOT_ON_PLAN`, `SWITCHED_OFF`), other pages (title, site, link, read depth, one line, never a grade; `researched` once added: `READING`, `ADDS` with its quotes, `ADDS_NOTHING`, `FAILED`), and `suggestions` (`CONTRADICTING`, `UNDOCUMENTED`, `NEEDS_MORE_WEB`, `HELPS_MAIN_QUESTION` with a side `FOR` or `AGAINST`; each with its text and the places it rests on) |
| `GET /v1/asks/room` | `reserve`, `dig_share_percent` | `KEPT`: the person's one reserve is held (an investigation is open); `BLOCKED`: a FULL day until its reset. A read asked for a dig (`dig_parent`, `dig_mode`, `dig_picks` in the query) also says the dig's share of today, in steps of 5% (20% for a quick look, 35% for a thorough dig) |
| `POST /v1/asks` | `parent` | a dig names its parent run, the places it was dug from, its mode, and its picks (suggestions as sent, edited or not, and the person's own view) |
| `GET /v1/runs/:id/investigation` | (new route; W1-6 names no route yet) | the investigation the run belongs to: state `OPEN`/`CLOSED`, its digs (the 0131 link records), and every closing with its report version |
| `POST /v1/runs/:id/investigation/close` | (new route) | "Write my report": closes it and adds a report version |
| `GET /v1/answers` (each row) | `started_at`, `map_bar`, `changed_since_visit`, `dug_from` | the ask page's "Your maps" (owner's screen review, 3 Nov 2026): when an open question started ("Being looked into, started 14:00"), an answer's four-shade bar (`sure`, `sure_for_case`, `still_argued`, `didnt_hold`), whether its map changed since the person last opened it (here: no last visit recorded yet; the "New" dot), and the debate a dig was dug from (null for a first question). **The contract's rows are strict and do not name these yet, so the website never receives them**: the page shows the calm fallback (no time, no bar, no dot, and it reads each row's dig links). See them at `/__mock/draft/v1/answers?limit=50&offset=0`. |
| `GET /v1/runs/:id/investigation` | `report_share_percent` | the owner's screen review (3 Nov 2026, report-d1 A): roughly what share of today's quota writing the report uses, a whole percent in the dig share's steps of 5 (here always 5%), while a report can be asked for on a paid plan (nothing being written, and no finished version since the investigation was last reopened); never on Free, whose report comes from the small reserve. **The contract's read is strict and does not name it yet, so the website never receives it**: the strip "Write my report" turns into leaves the share line out. See it at `/__mock/draft/v1/runs/<id>/investigation?shape=reports` (the draft address without `?shape=reports` keeps the older shape). |

How they are sent:

- **To the website** (the normal `/v1/...` addresses): a draft field is sent only when the contract's own schema accepts it. Since W1-6 merged it does, so the website gets the sources, `web`, `reserve` and `dig_share_percent`. Started against an older contract (`MOCK_ENGINE_DIR`), the mock holds them back and the website gets the older shape: no sources and no `web`, the BLOCKED room a plain `FULL`. `/__mock/state` says which are sent (`draft_fields_sent`).
- **In full**: put `/__mock/draft` before any `/v1/...` address, for example `http://127.0.0.1:4011/__mock/draft/v1/answers/aaaa1111-1111-4111-8111-111111111111`. These replies are checked against the draft schemas only.

**Since W1-6 merged:** the contract accepts these bodies and the website receives them; `web-draft.ts` imports the contract's schemas (W2-6). Check with `tests/unit/v4-mock-api.test.ts` and `check.ts`.

The seeded web cases (`web-seed.ts`):

- **Paid, searched** (1111, 5555, 8888, and new paid asks): paths n-mix, n-renew and n-nuclear were searched; **n-smr had no search planned** ("Whether these reactors will be cheap is a forecast; no published report can settle it yet."). Five sources sit under n-renew-cost, n-renew-battery (preview only, fewer readers), n-nuclear-build (two pages) and n-nuclear-clean (abstract only). Six other pages, four of them added to researched, one per outcome; dig suggestions of every kind and both sides.
- **Failed** (7777, and any new ask with `#webfail` in the question): every path `FAILED`, no sources, no other pages.
- **"Add to researched"** (task W4-4, `POST /v1/runs/{id}/researched`): works on a paid debate's other pages (1111's n-mix has one untouched page, a guide, and n-nuclear more): READING at once, then the outcome about six seconds later; a guide adds nothing. With `plan=FREE` the page hides the button and the route refuses; with `room=FULL` it answers `WEB_RESEARCHED_WAITS_FOR_RESET`.
- **Free** (6666, and new asks with `plan_tier: "free"`): every path `NOT_ON_PLAN`, no sources; its suggestions never ask for a web search.

## The new dig model and the money rule (task W2-7)

The shapes are the contract's (`packages/contract/src/web.ts`, merged in W2-7), so the website receives them; against an older contract (`MOCK_ENGINE_DIR`) they are held back like the other draft fields.

| Where | Field | What it holds |
|---|---|---|
| each answer | `path_rewrites` | per rewritten path: `current` (the newest finished rewrite's line, summary and fate), `history` (newest last: each dig's rewrite with its state `WRITING` / `READY` / `READY_WITH_RESERVATION` / `FAILED`, "What the dig changed", the fate before, the verdict `view` or null, the dig's own paths with their lines and fates), `changed_below`; and `changed_since` (how many paths changed since the answer, or since report version n) |
| a dig's answer | `dig` | its parent, the path it rewrote, its places, its **level** (1-10), its picks with who wrote each (`AI_SUGGESTION`, `PERSON_EDITED`, `PERSON_OWN_VIEW`), and its rewrite |
| `GET /v1/asks/room` | `start_share_percent`, `new_starts` | a new question's share of today (15% in the mock); `BLOCKED_UNTIL_RESET` when the day is used up (switch `room=WAIT_RESET`) |
| `GET /v1/billing/usage` | `borrowed` | with `usage=BORROWED`: the day reads 104% and running work used 4% of tomorrow's allowance |
| `GET /v1/runs/:id` | `month_pause` | on run `e100…`: `until` (the next month) and `can_continue` |
| `GET /v1/runs/:id` | `quota_used` (owner review 3 Nov; NOT in the contract yet) | on a failed run: `NONE` (nothing was taken from the person's quota) or `SOME`. Only the draft view shows it; once the contract carries it, a failed question says "Nothing was taken for the failed try." (NONE) or "The part that ran used some of your quota." (SOME), and a failed dig says "Nothing was taken from your quota for this." (NONE only). Seeded: 4444 `NONE`, 4500…45 `SOME`, and the seven failed digs of f000 |
| `POST /v1/runs/:id/continue` | (draft route) | 409 `RUN_PAUSED_UNTIL_RESET` before the month reset, 200 `{"state":"CONTINUING"}` after it (switch `pause=CAN_CONTINUE`); setting `pause=` again pauses the run again |

**The quota's windows (owner's screen review, 3 Nov 2026: read-f19, public-f14, map-f33, map-f9):** two more fields that are NOT in the contract yet, so, like `started_at`, they are sent on the draft view (`/__mock/draft/v1/…`) and on the normal view only once the contract's own (strict) schema accepts them (they never make a read fall back and lose its shares or its month pause):

| Where | Field | What it holds |
|---|---|---|
| `GET /v1/asks/room` | `share_scope` | the window the read's share (`start_share_percent` or `dig_share_percent`) is measured against, the one that will actually stop the person: `PERSON_MONTH` on Free (`plan=FREE`), `PERSON_DAY` otherwise. The website then says "of this month" / "of this week"; without it, it says what the server measures today (Free: the month, else today) |
| `GET /v1/runs/:id` | `question_share` | on a running or settled run: `{ scope, percent }`, what this question (with its digs) has used of that window (11% in the mock), for the map's "This question: 11% of today" |

**The waiting card's start time (owner's screen review, 3 Nov 2026, journey-d2):** `GET /v1/runs/:id` may carry `started_at`, when the question started (ISO), so the card says "Started 14:31" on any device and after a reload. It is NOT in the contract yet (the run read's schema is strict), so today it is sent only on the draft view (`/__mock/draft/v1/runs/:id`), and on the normal view only once the contract's own schema accepts it. Seeded: the running run `2222…` (started 4 minutes before the mock), the paused run `e100…`, every settled run and every new ask that runs; a run waiting to start (`3333…`) has none.

Every dig keeps its points and its answer text (owner Q-D13). The mock's digs still have a story, but since task W4-6 the website never reads a dig's story: a dig's map is drawn from its rewrite's own paths (each with its line and fate), or from the positions it argued while its rewrite is still being written.

Since task W4-6 the first debate's map shows all four rewrite states: n-mix and n-renew **rewritten**, n-nuclear **failed** (dig d400), n-smr **no change** (dig d500); and **rewriting** one level down, on d200's n-nuclear (dig d300). "Paths changed since your report (version 1): 2." stays: a failed rewrite and one that changed nothing are not counted.

## A new debate from the page (POST /v1/asks)

- **Since task W3-4:** a dig that names its `parent` gets its parent's level + 1, and its answer says so in its `dig` part (its places, its level, and each pick with who wrote it: the person's own view, an AI suggestion as written, or the person's edit of one). A dig that would go past level 10 gets **409 `DIG_TOO_DEEP`** (`level_max: 10`), and nothing starts.

- Each ask the page sends is printed on the mock's standard output as one JSON line, `{"mock":"ask", "valid":…, "outcome":…, "run_ref":…, "body":{…}}`, so you can check exactly what was sent. To see only those lines, start the mock with `| grep '"mock":"ask"'` at the end of the command. The per-request lines go to the error output, so they are not caught by that filter.
- An ask that breaks the contract's ask rules (or whose draft `parent` breaks the draft rules) gets a 400 reply, and its line says `"valid":false` with the reasons. A `parent` naming an unknown run gets 404.
- A valid ask gets a new run id. The run reads "running" for 25 seconds, then "finished". Its answer is the nuclear debate with your question line. Its story says "still writing" for 10 more seconds, then ready.
- A new question opens its own investigation. A dig, whether it names its `parent` in the ask (the draft way) or the page records the link after start (`POST /v1/runs/<parent>/dig-links`, today's way), joins its parent's investigation and reopens it if it was closed.
- Put `#mix` anywhere in the question to get the "your question mixes languages" offer (409 QUESTION_LANGUAGE_CHOICE_NEEDED). Answering the offer goes through.

## Switches

Set these when starting the mock, or change them live by opening `http://127.0.0.1:4011/__mock/set?room=FULL&ask=WAITING&plan=FREE` (the same address also works through the website as `/api/__mock/set?...`). `/__mock/state` shows the current switches, every run with its state and timings, the investigations, the dig links and the reading level.

| Setting | Values | Effect |
|---|---|---|
| `MOCK_PLAN` / `plan=` | `PLUS` (default), `FREE` | The person's plan, as the room read and the usage read say it. On `FREE` the usage read names the month alone (`plan-windows.ts`), so the header's circle opens one bar. |
| `MOCK_ROOM` / `room=` | `FITS` (default), `CLOSE`, `FULL`, `ALREADY_WAITING`, `BLOCKED`, `WAIT_RESET` | What the "is there room today" read (`GET /v1/asks/room`) says. `BLOCKED` is a FULL day with the reserve word `BLOCKED` ("blocked until {reset}"); against a contract older than W1-6 the website sees a plain `FULL`. `WAIT_RESET` is a FULL day whose new starts wait for the reset (`new_starts`, W2-7). |
| `MOCK_USAGE` / `usage=` | `NORMAL` (default), `BORROWED` | The usage read: as today, or after running work borrowed from tomorrow (W2-7). |
| `MOCK_PAUSE` / `pause=` | `UNTIL_RESET` (default), `CAN_CONTINUE` | Whether the paused debate `e100…` may continue yet (W2-7). Setting it pauses that debate again. |
| `MOCK_ASK` / `ask=` | `AUTO` (default), `ACCEPT`, `WAITING`, `ALREADY_WAITING`, `LANGUAGE_CHOICE` | What a new ask gets. `AUTO` follows the room: FULL, BLOCKED or WAIT_RESET makes asks wait in line, ALREADY_WAITING refuses with 422, anything else accepts. |
| `MOCK_REPORT` / `report=` | `OK` (default), `FAIL` | Whether the next report written comes out finished or failed. |
| `MOCK_DIG` / `dig=` | `SETTLE` (default), `FAIL`, `PAUSE` | How a NEW dig ends (owner review 3 Nov): it finishes; it runs its time and then fails "stopped partway" (its draft view says `quota_used: "SOME"`), so "Try this dig again" and, after a second failure, "This keeps failing" can be seen; or it pauses at the month wall at once (its card reads "Dig · paused until …", and once `pause=CAN_CONTINUE` its panel's Continue lets it finish). |
| `MOCK_LIVE` / `live=` | `OFF` (default), `ON` | Draft (owner review 3 Nov, dig-d1 B): `ON` serves a running dig's steps and checked findings at `GET /v1/runs/:id/progress` (`live-seed.ts`), so a dig's panel shows "Finding sources › Reading › Checking › Writing what changed" and each finding as it passes; `OFF` answers 404 there, as today's API does, and the panel shows the one calm line. |
| `MOCK_CLIMB` / `climb=` | `SEED` (default), `PLAY` | Draft (owner review 3 Nov, dig-f2; `climb-seed.ts`): `PLAY` plays, from that moment, the rest of the climb of the seeded level-3 dig `d300…` up to the first debate (each level 10 s: d300's own rewrite, then 8888's path, then 1111's `n-renew`). The first debate's map shows the change without a reload, and stops reading again once it has landed. Setting `PLAY` again plays it again from now. |
| `MOCK_PUBLIC` / `public=` | `OPEN` (default), `ONGOING`, `REPORT_WRITING`, `TOO_DEEP`, `REPORT_STUCK` | What a public debate's presses get: see "Public debates" (Refusals, and "A report that never arrives"). |
| `MOCK_PUBLIC_STATE` / `publicstate=` | `PRIVATE` (default), `WILL_BE_PUBLIC`, `BEING_CHECKED`, `PUBLISHED`, `KEPT_PRIVATE` | Every question's public state (its visibility read): see "Public debates" ("The globe line on your own map"). |
| `MOCK_PUBLIC_DIG_SHARE` / `publicdigshare=` | `OFF` (default), `ON` | Draft (public-d3 A, public-f11): `ON` makes a room read with no dig parent carry a quick dig's share (`dig_share_percent`, 20%) instead of a new question's, so a public page's dig box shows "Dig here · up to 20%" and its period line ("of today · you can still finish your report"). The real API cannot say a dig's share on someone else's public debate yet (server need). While it is `ON`, the ask page shows no share of its own (one estimate per read). |
| `session=` | `IN` (default), `OUT` | A stranger (`OUT`): see "Public debates" ("A stranger", and "A sign-in that ended during a wait"). |
| `subscription=RESET` | | Puts the Plus subscription back inside its 14 days after a withdrawal, so the withdrawal can be clicked again. |
| `MOCK_REPORT_SECONDS` | default `8` | How long "Write my report" reads as being written. |
| `MOCK_PORT` | default `4011` | Port (always on 127.0.0.1). |
| `MOCK_RUN_SECONDS` | default `25` | How long a new debate "runs". |
| `MOCK_STORY_WRITING_SECONDS` | default `40` | How long run 5555's story says "still writing". |
| `MOCK_POSTED_STORY_SECONDS` | default `10` | How long a new debate's story says "still writing" after it finishes. |
| `MOCK_MAIN_ANSWER_SECONDS` | default `45` | How long run 1111's main answer says a change is still being written into it, before version 2 shows. |
| `MOCK_QUADERNO_API_KEY_PATH` | path | A file holding a Quaderno API key: every country's tax on the pricing page then comes from Quaderno. See "Tax from Quaderno" below. Unset: the mock's own table. |
| `MOCK_QUADERNO_BASE_URL` | default `https://sandbox-quadernoapp.com/api` | Which Quaderno it asks. |
| `MOCK_QUIET=1` | | Hides the per-request lines. |
| `MOCK_ENGINE_DIR` | path | Where `dialectical-engine` is. Not needed when the mock runs from this folder. |

A wrong value stops the start with a clear message, for example `MOCK_ROOM_INVALID: bogus (allowed: FITS, CLOSE, FULL, ALREADY_WAITING, BLOCKED)`.

## Tax from Quaderno

Without a key, the pricing page's tax comes from the mock's own table: each EU country's standard VAT and Texas's sales tax, and "No tax added" everywhere else. With a Quaderno key, every country the page asks for is priced by Quaderno itself, exactly as the real API does it: the API's own tax reader (`apps/api/src/billing/displayed-tax.ts`) over the production Quaderno client (`packages/tax-quaderno`), once per paid plan, in that country's currency, with the postal code in the US and Canada. An answer is kept for six hours; a place Quaderno cannot price shows the price before tax with "+ tax where it applies" and is asked again after a minute.

1. In your Quaderno **sandbox** account, copy the private API key (Settings, API keys).
2. Put it in a file of its own, kept as the API keeps its keys (one line, the file `0600`, its folder `0700`, both yours):

   ```sh
   mkdir -m 700 ~/.quaderno-sandbox && (umask 077 && pbpaste > ~/.quaderno-sandbox/api-key)
   ```

3. Start the mock with it:

   ```sh
   cd dialectical-engine && MOCK_QUADERNO_API_KEY_PATH=~/.quaderno-sandbox/api-key node_modules/.bin/tsx tools/v4-mock-api/server.ts
   ```

   The ready line then says `"plans_tax":"QUADERNO"` (else `"TABLE"`). A key file it cannot read stops the start with `MOCK_QUADERNO_API_KEY_PATH_INVALID`.

Quaderno adds a country's tax only where the account has a tax registration there (Settings, Tax jurisdictions); everywhere else it answers "not registered" and the card says "No tax added". So the page shows what that account would charge, not every country's rate. A failed answer is logged on the mock's error output as `billing.plans.tax_unavailable` with Quaderno's code.

## Endpoints it serves

| Endpoint | Reply |
|---|---|
| `GET /v1/session` | Signed in. |
| `GET /v1/account/email` | `maria@example.com`: the V4 header's round account button shows "M" (401 with `session=OUT`). |
| `GET /v1/auth/age-confirmation` | `confirmed` (the age check is not asked). |
| `GET`/`POST /v1/account/sensitive-data-consent` | `given` (no consent pop-up). |
| `GET /v1/account/legal-status`, `POST /v1/account/legal-accept` | Nothing to accept / 204. |
| `GET /v1/account/moderation-statements` | One statement of reasons (0157): a staff hide of the seeded debate, on a report, held for review. |
| `GET`/`POST /v1/account/reading-level` | The reading level (0131), null until saved. |
| `GET /v1/asks/room?…` | The plan (`PLUS` or `FREE`), settings version 20, answer length offered, word targets 300/700/1500. The debate-shape switch is left out (the contract allows only "on" or absent). The query is checked like the real API checks it. Draft: `reserve`, `dig_share_percent`. |
| `POST /v1/asks` | See above. |
| `GET /v1/billing/usage` | Day 14%, week 31%, month 9%; with `usage=BORROWED`, day 104% with a borrow notice. |
| `GET /v1/billing/plans` | The register's default plans (Free, Plus $20, Pro $50, Max $200). With no `?country=` there is no place yet, so the paid cards show the price before tax and ask for the country. With `?country=` the plans come in that country's currency (lei in Romania, euro in the euro countries, dollars elsewhere, as the register says) and each total includes its tax: each EU country's standard VAT (21% in Romania, 19% in Germany, 21% in the Czech Republic, 25% in Croatia, and so on), none added outside the EU (with `MOCK_QUADERNO_API_KEY_PATH`, whatever Quaderno answers instead). The US and Canada also need `?postal_code=` (a Texas ZIP such as 75201 adds 6.25%); a missing one, or one that does not fit the country's format (the kernel's own check), is asked for again. |
| `GET /v1/billing/subscription`, `GET /v1/billing/invoices` | Plus in euro, subscribed four days ago, inside its 14-day withdrawal window (none on `plan=FREE`); no invoices. After a withdrawal it reads WITHDRAWN. |
| `POST /v1/billing/subscription/withdraw` | The signed-in session withdraws with an empty body, no step-up (OUG 34/2014 art. 11^1, owner ruling 2026-11-04): a €18.00 refund, once; again, 409 `NOT_SUBSCRIBED`. A body with anything in it gets 400 `MALFORMED_REQUEST`. |
| `GET /v1/answers?limit=&offset=` | Finished debates, plus the open runs (running, waiting, failed). Draft: the shelf's row parts (see "Draft fields"). |
| `GET /v1/answers/:id[?version=1]` | The answer (version 1 only). Draft: sources and path research. |
| `GET /v1/answers/:id/story` | WRITING or READY, as described above. |
| `GET /v1/answers/:id/map` | 404, as for a debate made without the debate-shape setting. The website treats this as "no map view". |
| `GET /v1/answers/:id/disclosure` | A normal record (the planned AIs wrote and checked it, nothing was cut short). |
| `GET /v1/answers/:id/inspection`, `/ledger-digest`, `/nodes/:nodeId` | Simple valid replies (the classic debate page reads them). |
| `GET /v1/runs/:id`, `/answer`, `/visibility` | The run. Its answer appears once it is finished (404 before). It is private, except a finished Free question (6666, and new asks with `plan_tier: "free"`), which is public (`PUBLISHED`, as a Free debate is once its check passed), so the report's "This question is public, so your report will be public too." can be seen (report-f15); `#private` in a Free question plays one its check kept private. `/__mock/set?publicstate=…` (see "Public debates") sets every question's public state for the click-test and wins while it is not `PRIVATE`. |
| `GET`/`POST /v1/runs/:id/last-visit` | The last visit (0131): both null before a first visit. |
| `GET`/`POST /v1/runs/:id/dig-links` | The dig links (0131): the parent this debate was dug from, and the digs made from it. A child already dug from another debate gets 409 `DIG_LINK_CONFLICT`. |
| `GET /v1/runs/:id/investigation`, `POST …/investigation/close` | Draft routes, see "Draft fields". |
| `POST /v1/runs/:id/continue` | Draft route (W2-7): Continue on the month-paused debate. |
| `GET /v1/runs/:id/progress` | Draft route (owner review 3 Nov, dig-d1 B): a dig's steps and the findings that passed their checks, `{run_ref, steps, now, findings: [{finding_id, text, trust, passed_at}]}`. Only with `live=ON`, only for a dig, never for one that failed; otherwise 404, as today's API (which has no such route). With a web search: Finding sources, Reading, Checking, Writing what changed; on Free or after a failed search: Arguing for and against, Checking, Writing what changed (and never "Sure" on Free). |
| `GET /v1/runs/:id/events` | A live event stream. For a finished or failed run it replays three events and closes. For an open run it stays open with a keep-alive every 15 s, and a new debate's stream sends "finished" after 25 s. |
| `GET /v1/geo/availability`, `/v1/public/ai-providers`, `/v1/public/debates`, `/v1/deployment` | Simple valid replies. |
| `POST /v1/auth/logout` | 204. The mock still says "signed in" afterwards. |
| `GET /readyz` | Ready (for the website's own `/readyz` check). |

An unknown run id gets 404 on every run route, as the real API answers a debate that is not yours.

Anything else gets a 404 `NOT_MOCKED` reply. The mock also prints a line like `[mock] POST /v1/billing/checkout 404 <- NOT MOCKED`, so you can see at once what the website asked for that is missing.

## Public debates (decisions 13, 16 and 22)

Made-up debates from `public-seed.ts`, read at `GET /v1/public/debates/:id`. The public page is drawn on the server, so it needs nothing but the mock.

| Page | What you see |
|---|---|
| `/public/debate/f1000000-0000-4000-8000-000000000001` | A changed main answer (the first answer one click away), one contribution by "Quiet Heron" on a path, the dig's own path under it, one report. |
| `/public/debate/f1000000-0000-4000-8000-000000000002` | The author's name went ("a contributor"), no dig on it: "Write a report" is refused (the first author has left). |

- **Dig here** (a path, or the dig's own path): `POST /v1/asks` with `public_parent`, sent only after the site's 10-second Undo (owner screen review, public-f11). The person stays on the page; a card under the path says the dig is running (public-d2 A). The dig's own page says "checking", and about 10 seconds after the run finishes either it changes the public page (the dig's answer then carries its new text as `contribution.rewrite`, so the card shows before and after, new words underlined), or, with `#refuse` in the view, it stays private, or, with `#confirm` in the view, it goes on the page and changes nothing ("Confirmed: the answer holds."). The card reads it again when you come back to the tab.
- **The path's own suggestions as chips** (public-d2 A, DRAFT field `dig_suggestions`): `/__mock/draft/v1/public/debates/f1000000-0000-4000-8000-000000000001` carries two for "Free fares for everyone" (one dug near on 28 Oct, which opens that dig's result) and one for "Better service first". The contract's public read is strict and does not name the field yet, so the website does not receive it and its dig box shows no chips.
- **The globe line on your own map** (public-f26, journey-f20): `/__mock/set?publicstate=PUBLISHED` makes every debate of yours answer its visibility read as public (the first public debate's page), so the map and the report show "Public · See its page · Copy link", and the own-view box and the tray say what goes public. `WILL_BE_PUBLIC`, `BEING_CHECKED` and `KEPT_PRIVATE` are DRAFT stages (`public_stage`, at `/__mock/draft/v1/runs/<id>/visibility` only); the website gets PRIVATE for them and shows nothing. `PRIVATE` (the default) goes back.
- **Write a report**: `POST /v1/public/debates/:id/report` answers 202; the new version appears on the page about 8 seconds later.
- **The digger's states**, seeded: `c1000000-0000-4000-8000-000000000001` CHECKING, `…002` ON_THE_PAGE, `…003` KEPT_PRIVATE, `…004` REMOVED_AFTER_REVIEW, at `/v4/debate/<id>`.
- **The Report button (decision 35)**: on `/public/debate/<ref>`, a claim with "hide" in it hides (the pretend check), one with "#person" goes to a person, anything else gets the line every refusal shares ("We have not acted on this report…"). The form sends `good_faith: true`, and the mock refuses a press without it as the API does. The queue shows on the team panel.
- **A debate under review (decision 33)**: the team page's panel reads from the mock, but a passkey cannot be pressed here, so `/__mock/review?ref=<public ref>&step=HIDE` does what Confirm does (then `step=REMOVE_DIG`, `step=CORRECT&pointer=/story_short/summary&text=New words`, `step=REPUBLISH`). `/public/debate/<ref>` shows the plain under-review line while hidden, then the page with its "changed after review" line and the Report link.
- **Refusals**: `/__mock/set?public=ONGOING` (a report waits), `public=REPORT_WRITING` and `public=TOO_DEEP` (a dig is refused), `public=OPEN` (back to normal), `room=FULL` (a used-up limit), more than three views with `plan=FREE`.
- **A report that never arrives** (public-f9): `/__mock/set?public=REPORT_STUCK`, then "Write a report": the press is accepted, the "Being written" card stays, its checks slow down and pause in a hidden tab, and after 10 minutes it says it is taking longer than usual, with "Check again". A report that could not be written cannot be shown yet: the public debate's contract is strict and has no field for it (server need, `report_writing`).
- **The answer-first page** (public-d1): the first debate's tree is published, so each path shows its trust word and bar, a row unfolds its findings (one with a checked page and its source), "For" and "Against" show the strongest point on each side, the still-argued point is the star, and "Explore the map" opens the own map read-only.
- **A stranger**: `/__mock/set?session=OUT` shows a sign-in link in place of each press; `session=IN` to go back. The V4 pages then send you to sign in, as they do for a stranger, with the way back to the same page (`/login?next=…`). The room read, the usage read, the account reads, the subscription and invoice reads and the withdrawal are refused (401) as the real API refuses them, so the ask page shows a stranger no quota share and no "% of your quota used".
- **A sign-in that ended during a wait** (wait-f1): open a debate that is still running while signed in, then `/__mock/set?session=OUT`. Its reads are now refused (401), and the waiting card says "Please sign in again to see your question." with a Sign in button that comes back to the same question.

**The Free notice**: `/__mock/set?plan=FREE`, then open `/v4` or `/new`: the notice shows before each Start press, and an ask that showed it sends `free_public_notice` (`/__mock/state` counts them as `free_notices`). Any paid plan shows no notice.

## Not mocked (the website may call these)

- **Billing pages**: charge status, card details and card change, checkout, quote, upgrade, downgrade, cancel (`/pricing` buying, `/checkout`, `/settings/card`, `/cancel`). The subscription, invoices and the withdrawal in Settings are mocked.
- **Account and security settings**: sessions list, sign-in methods, social links, email change, recovery email, phone, data export, account erasure (`/settings`, `/settings/security`, `/export`).
- **Signing in and up for real**: login, register, password reset, MFA, social sign-in, age check (`/login`, `/sign-up`, `/recover`, …). The mock just says "signed in"; use `/api/__mock/sign-in` for the cookie.
- **Publishing**: publish, the list of public debates, deleting a private debate. The public debate page itself is mocked (see "Public debates").
- **The classic page's extra actions**: investigations (`POST /v1/answers/:id/investigations/:gap`) and unlinking memory.
- **The support assistant** (`/v1/support/*`), the evaluator dev menu (`/v1/dev/evaluator`, shown only when `NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED` is on), and the staff pages (`/v1/admin/*`).

## Self-check

With the mock running, this reads every endpoint through the website's own proxy code and typed client, draws the seeded debates with the V4 map builder, and reads the draft fields. It does not start the website. It posts six asks (so six extra debates appear in the mock), two of them digs on a public debate and one with the Free notice, presses one report and one dig past the deepest level (refused, so nothing appears), saves the reading level, records a last visit and a dig link, closes run 7777's investigation, switches the plan, the room and the usage and back, and continues the paused debate (then pauses it again). Since W2-7 it also reads the rewritten paths, the verdict and the dig trail.

```sh
cd dialectical-engine/apps/ui && ../../node_modules/.bin/tsx ../../tools/v4-mock-api/check.ts
```

`MOCK_URL` points it at another address (default `http://127.0.0.1:4011`). The last line is `ALL CHECKS PASSED`, or the number of checks that failed.
