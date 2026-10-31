# V4 mock API

This is a small stand-in for the real DebateAIRO V3 API. It lets you click through the website (`apps/ui`) on your computer without the real API, the database or any AI.

It plays one person who is signed in (on the Plus plan, or on Free with a switch), has already agreed to everything (age check, sensitive-data notice, terms), and owns eight seeded debates. You can also start new debates: each one "runs" for 25 seconds and then shows a finished answer.

Every reply it sends is checked against the website's own contract rules (`packages/contract`). All seeded replies are checked once when it starts, and it refuses to start if one is wrong. Every reply is checked again just before it is sent.

It moved here from a scratch folder on 30 Oct 2026 (Perplexity plan, task W1-7) and gained: a Free person, the account memory of migration 0131, the web search's draft fields (sources, other pages, a failed search, a path with no search planned), dig suggestions, investigations with the reserve kept, and a "blocked until reset" room.

On 31 Oct 2026 (dig model revision, task W2-7) it gained the owner's new dig model and money rule: paths rewritten by digs (with "What the dig changed" and the verdict on the person's point of view), a dig trail three levels down, a debate paused at the month wall with Continue, a usage read where running work borrowed from tomorrow, a room where new starts wait for the reset, and a new question's share of today. See "The new dig model and the money rule" below.

## Files

| File | What it is |
|---|---|
| `server.ts` | The mock server (plain Node, no extra packages). |
| `seed.ts` | The seeded English debate (nuclear vs renewables), built from the website's own story sample (`apps/ui/lib/v3/storyFixture.ts`). |
| `web-draft.ts` | The shapes of the web search, dig suggestions and investigations, imported from the contract (W1-6), and how they would be held back from a contract that does not know them. See "Draft fields" below. |
| `web-seed.ts` | The made-up web pages of the seeded debates (all on `.example` sites; no real article is quoted). |
| `rewrite-seed.ts` | The new dig model's seeded rewrites, digs and dig trail, and the money rule's paused debate and borrow notice (task W2-7). |
| `check.ts` | Self-check. It reads every endpoint through the website's own code: the `/api` proxy, the typed client, and the V4 map builder. |

The unit test `tests/unit/v4-mock-api.test.ts` checks the seed and the draft shapes without starting anything.

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
| `11111111-1111-4111-8111-111111111111` | **Finished**, the nuclear question, story ready. Answer id `aaaa1111-…`. | paid, searched | **open** (reopened by its dig 8888; report version 1 kept as an earlier version) |
| `22222222-2222-4222-8222-222222222222` | **Running forever** ("Is a four-day work week good for productivity and for workers?"). | – | open |
| `33333333-3333-4333-8333-333333333333` | **Waiting in line**. It is expected to start 20 minutes after the mock started. | – | open |
| `44444444-4444-4444-8444-444444444444` | **Failed** with `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM` (the website's "the AI models it needs were unavailable" sentence). | – | none |
| `55555555-5555-4555-8555-555555555555` | **Finished**, but its story says "still writing" for the first 40 seconds after the mock starts. Answer id `aaaa5555-…`. | paid, searched | open |
| `66666666-6666-4666-8666-666666666666` | **Finished**, asked on the **Free** plan. Answer id `aaaa6666-…`. | Free: not on this plan | closed (report version 1) |
| `77777777-7777-4777-8777-777777777777` | **Finished**, but its **web search failed**. Answer id `aaaa7777-…`. | failed | open |
| `88888888-8888-4888-8888-888888888888` | **Finished dig** of 1111, from the still-argued point `p:n-renew-storage`, quick look. Answer id `aaaa8888-…`. **Level 1**; it rewrote 1111's path n-renew (an AI suggestion, so no verdict). | paid, searched | member of 1111's |
| `d1000000-0000-4000-8000-000000000001` | **Finished dig** of 1111's path n-mix with the person's **own view** and their **edit** of a suggestion. Level 1. Answer id `aaaad100-…`. Its rewrite carries the verdict "helped this path and the main question". | paid, searched | member of 1111's |
| `d2000000-0000-4000-8000-000000000002` | **Finished dig of the dig** 8888 (its path n-renew), with the person's own view. **Level 2**. Answer id `aaaad200-…`. Verdict "did not help this path"; 1111's n-renew is marked "a dig further down changed part of this". | paid, searched | member of 1111's |
| `d3000000-0000-4000-8000-000000000003` | **Finished dig** of d200's path n-nuclear, thorough. **Level 3**. Answer id `aaaad300-…`. Its rewrite is **still writing**. | paid, searched | member of 1111's |
| `d4000000-0000-4000-8000-000000000004` | **Finished dig** of 1111's path n-nuclear (task W4-6). Level 1. Answer id `aaaad400-…`. Its rewrite **failed**: the path keeps its text, and the page says the dig's points and sources are below. | paid, searched | member of 1111's |
| `d5000000-0000-4000-8000-000000000005` | **Finished dig** of 1111's path n-smr (task W4-6). Level 1. Answer id `aaaad500-…`. Its rewrite is ready but **changed nothing** ("The dig didn't change this path."). | paid, searched | member of 1111's |
| `d1000000-0000-4000-8000-000000000010` | **Finished dig at the deepest level (10)**, hung under d300 (task W3-4). Answer id `aaaad110-…`. The six digs between levels 3 and 10 are not seeded: only its own answer says level 10, so its map offers no dig anywhere and shows the "deepest level" line. | paid, searched | member of 1111's |
| `e1000000-0000-4000-8000-000000000001` | **Paused at the month wall** (running; its planned calls and searches wait). Continue is refused until the switch `pause=CAN_CONTINUE`. | – | open |

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

How they are sent:

- **To the website** (the normal `/v1/...` addresses): a draft field is sent only when the contract's own schema accepts it. Since W1-6 merged it does, so the website gets the sources, `web`, `reserve` and `dig_share_percent`. Started against an older contract (`MOCK_ENGINE_DIR`), the mock holds them back and the website gets the older shape: no sources and no `web`, the BLOCKED room a plain `FULL`. `/__mock/state` says which are sent (`draft_fields_sent`).
- **In full**: put `/__mock/draft` before any `/v1/...` address, for example `http://127.0.0.1:4011/__mock/draft/v1/answers/aaaa1111-1111-4111-8111-111111111111`. These replies are checked against the draft schemas only.

**Since W1-6 merged:** the contract accepts these bodies and the website receives them; `web-draft.ts` imports the contract's schemas (W2-6). Check with `tests/unit/v4-mock-api.test.ts` and `check.ts`.

The seeded web cases (`web-seed.ts`):

- **Paid, searched** (1111, 5555, 8888, and new paid asks): paths n-mix, n-renew and n-nuclear were searched; **n-smr had no search planned** ("Whether these reactors will be cheap is a forecast; no published report can settle it yet."). Five sources sit under n-renew-cost, n-renew-battery (preview only, fewer readers), n-nuclear-build (two pages) and n-nuclear-clean (abstract only). Six other pages, four of them added to researched, one per outcome; dig suggestions of every kind and both sides.
- **Failed** (7777, and any new ask with `#webfail` in the question): every path `FAILED`, no sources, no other pages.
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
| `POST /v1/runs/:id/continue` | (draft route) | 409 `RUN_PAUSED_UNTIL_RESET` before the month reset, 200 `{"state":"CONTINUING"}` after it (switch `pause=CAN_CONTINUE`); setting `pause=` again pauses the run again |

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
| `MOCK_PLAN` / `plan=` | `PLUS` (default), `FREE` | The person's plan, as the room read and the usage read say it. |
| `MOCK_ROOM` / `room=` | `FITS` (default), `CLOSE`, `FULL`, `ALREADY_WAITING`, `BLOCKED`, `WAIT_RESET` | What the "is there room today" read (`GET /v1/asks/room`) says. `BLOCKED` is a FULL day with the reserve word `BLOCKED` ("blocked until {reset}"); against a contract older than W1-6 the website sees a plain `FULL`. `WAIT_RESET` is a FULL day whose new starts wait for the reset (`new_starts`, W2-7). |
| `MOCK_USAGE` / `usage=` | `NORMAL` (default), `BORROWED` | The usage read: as today, or after running work borrowed from tomorrow (W2-7). |
| `MOCK_PAUSE` / `pause=` | `UNTIL_RESET` (default), `CAN_CONTINUE` | Whether the paused debate `e100…` may continue yet (W2-7). Setting it pauses that debate again. |
| `MOCK_ASK` / `ask=` | `AUTO` (default), `ACCEPT`, `WAITING`, `ALREADY_WAITING`, `LANGUAGE_CHOICE` | What a new ask gets. `AUTO` follows the room: FULL, BLOCKED or WAIT_RESET makes asks wait in line, ALREADY_WAITING refuses with 422, anything else accepts. |
| `MOCK_PORT` | default `4011` | Port (always on 127.0.0.1). |
| `MOCK_RUN_SECONDS` | default `25` | How long a new debate "runs". |
| `MOCK_STORY_WRITING_SECONDS` | default `40` | How long run 5555's story says "still writing". |
| `MOCK_POSTED_STORY_SECONDS` | default `10` | How long a new debate's story says "still writing" after it finishes. |
| `MOCK_QUIET=1` | | Hides the per-request lines. |
| `MOCK_ENGINE_DIR` | path | Where `dialectical-engine` is. Not needed when the mock runs from this folder. |

A wrong value stops the start with a clear message, for example `MOCK_ROOM_INVALID: bogus (allowed: FITS, CLOSE, FULL, ALREADY_WAITING, BLOCKED)`.

## Endpoints it serves

| Endpoint | Reply |
|---|---|
| `GET /v1/session` | Signed in. |
| `GET /v1/auth/age-confirmation` | `confirmed` (the age check is not asked). |
| `GET`/`POST /v1/account/sensitive-data-consent` | `given` (no consent pop-up). |
| `GET /v1/account/legal-status`, `POST /v1/account/legal-accept` | Nothing to accept / 204. |
| `GET`/`POST /v1/account/reading-level` | The reading level (0131), null until saved. |
| `GET /v1/asks/room?…` | The plan (`PLUS` or `FREE`), settings version 20, answer length offered, word targets 300/700/1500. The debate-shape switch is left out (the contract allows only "on" or absent). The query is checked like the real API checks it. Draft: `reserve`, `dig_share_percent`. |
| `POST /v1/asks` | See above. |
| `GET /v1/billing/usage` | Day 14%, week 31%, month 9%; with `usage=BORROWED`, day 104% with a borrow notice. |
| `GET /v1/billing/plans` | The register's default plans (Free, Plus $20, Pro $50, Max $200). |
| `GET /v1/answers?limit=&offset=` | Finished debates, plus the open runs (running, waiting, failed). |
| `GET /v1/answers/:id[?version=1]` | The answer (version 1 only). Draft: sources and path research. |
| `GET /v1/answers/:id/story` | WRITING or READY, as described above. |
| `GET /v1/answers/:id/map` | 404, as for a debate made without the debate-shape setting. The website treats this as "no map view". |
| `GET /v1/answers/:id/disclosure` | A normal record (the planned AIs wrote and checked it, nothing was cut short). |
| `GET /v1/answers/:id/inspection`, `/ledger-digest`, `/nodes/:nodeId` | Simple valid replies (the classic debate page reads them). |
| `GET /v1/runs/:id`, `/answer`, `/visibility` | The run. Its answer appears once it is finished (404 before). It is private. |
| `GET`/`POST /v1/runs/:id/last-visit` | The last visit (0131): both null before a first visit. |
| `GET`/`POST /v1/runs/:id/dig-links` | The dig links (0131): the parent this debate was dug from, and the digs made from it. A child already dug from another debate gets 409 `DIG_LINK_CONFLICT`. |
| `GET /v1/runs/:id/investigation`, `POST …/investigation/close` | Draft routes, see "Draft fields". |
| `POST /v1/runs/:id/continue` | Draft route (W2-7): Continue on the month-paused debate. |
| `GET /v1/runs/:id/events` | A live event stream. For a finished or failed run it replays three events and closes. For an open run it stays open with a keep-alive every 15 s, and a new debate's stream sends "finished" after 25 s. |
| `GET /v1/geo/availability`, `/v1/public/ai-providers`, `/v1/public/debates`, `/v1/deployment` | Simple valid replies. |
| `POST /v1/auth/logout` | 204. The mock still says "signed in" afterwards. |
| `GET /readyz` | Ready (for the website's own `/readyz` check). |

An unknown run id gets 404 on every run route, as the real API answers a debate that is not yours.

Anything else gets a 404 `NOT_MOCKED` reply. The mock also prints a line like `[mock] GET /v1/billing/subscription 404 <- NOT MOCKED`, so you can see at once what the website asked for that is missing.

## Not mocked (the website may call these)

- **Billing pages**: subscription, invoices, charge status, card details and card change, checkout, quote, upgrade, downgrade, cancel, withdraw (`/settings`, `/pricing` buying, `/checkout`, `/settings/card`, `/cancel`, `/withdraw`).
- **Account and security settings**: sessions list, sign-in methods, social links, email change, recovery email, phone, data export, account erasure (`/settings`, `/settings/security`, `/export`).
- **Signing in and up for real**: login, register, password reset, MFA, social sign-in, age check (`/login`, `/sign-up`, `/recover`, …). The mock just says "signed in"; use `/api/__mock/sign-in` for the cookie.
- **Publishing**: publish and unpublish, the public debate page `/public/debate/<id>`, deleting a private debate.
- **The classic page's extra actions**: investigations (`POST /v1/answers/:id/investigations/:gap`) and unlinking memory.
- **"Add to researched"** (task W4-4): the seeded choices show every outcome, but there is no route to add one yet.
- **The support assistant** (`/v1/support/*`), the evaluator dev menu (`/v1/dev/evaluator`, shown only when `NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED` is on), and the staff pages (`/v1/admin/*`).

## Self-check

With the mock running, this reads every endpoint through the website's own proxy code and typed client, draws the seeded debates with the V4 map builder, and reads the draft fields. It does not start the website. It posts three asks (so three extra debates appear in the mock) and one dig past the deepest level (refused, so nothing appears), saves the reading level, records a last visit and a dig link, closes run 7777's investigation, switches the plan, the room and the usage and back, and continues the paused debate (then pauses it again). Since W2-7 it also reads the rewritten paths, the verdict and the dig trail.

```sh
cd dialectical-engine/apps/ui && ../../node_modules/.bin/tsx ../../tools/v4-mock-api/check.ts
```

`MOCK_URL` points it at another address (default `http://127.0.0.1:4011`). The last line is `ALL CHECKS PASSED`, or the number of checks that failed.
