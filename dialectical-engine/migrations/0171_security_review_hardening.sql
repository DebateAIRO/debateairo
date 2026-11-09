-- 0171 · The security review's fixes in the database (test-site release R22; the security review of 3 Nov 2026).
--
-- Plain words. One drained step for every fix of the review that the database must make, F2 to F5. Each fix is named by its letter in every section
-- below, and the contract at the end checks each one's end state as the step applies. Once applied, this file is fixed: any later change is a step of its own.
-- It comes last in the chain, after 0170: it was built as 0154 and took this number at the merge of feat/2026-10-28-v4-initial (2026-11-09), whose 0154 to 0157 and 0170 came first.
-- F3. 0137's identity.join_public_investigation, the first public join, has had no caller in the code since 0147's join_public_tree took its place, yet the API's
--   billing role could still call it, and it writes an investigation in the first author's name. Its one grant is taken back. The function stays: 0137's
--   postcondition digests it, so a DROP would fail that step's receipt on every later migrate().
-- F4a. Each append-only guard of 0132 to 0147 let a row go "within the forget definer", and knew it by a setting the definer set for its own statements
--   (debateai.<scope>_forget: nine settings, read by ten guards). Any session may set any such setting for itself, so the tables' owner, a superuser, or any
--   later definer passed every guard with one SET LOCAL. The scope is now a row of the new identity.private_forget_scope, keyed by the transaction's own id
--   (pg_current_xact_id(): the top-level transaction's, also inside a savepoint), which only the two definers that open and close it write; no role may call
--   them or read the table. Every guard asks the third helper instead of the setting, and every definer that set one (the nine forget definers, 0139's
--   passage wipe, 0151's review purge) opens its scope and closes it again where it set and unset the setting. A setting opens nothing any more, and a scope
--   never reaches another transaction. 0080's legal and 0084's billing retention guards keep their setting: the billing purges set it by their SET
--   clauses, which 0130's verifier pins, and this step moves no billing function's grants, owner, definer flag or settings; no role holds UPDATE or
--   DELETE on those tables.
-- F4b. A reviewer's read of a public debate (0150's staff.read_public_review) opened the debate's sealed snapshot whatever had become of the debate since: made
--   private again, or published again under a new link. It now answers nothing, as for a link that never was, before it marks anything read, unless the link is
--   still its debate's current publication by the visibility log. A hidden debate still reads: a hold writes no visibility event. identity.public_review_material
--   is left as it is: its only callers are that door and staff.read_public_review_command, which hands back the log's revision and the hold, never the material.
-- F5. The owner-taking functions of 0131 to 0151 that the API's requests call took the owner the API named and believed it, so a connection on the API's
--   request login, with no session or with another's, could read and write any account's page memory, digs, pauses, purpose lines, reports and flags by
--   naming that account. The new identity.request_owner_matches(owner) answers whether the owner is the one the database itself sees for this connection:
--   the account of the live session it presented (0130's rls.context_owner_ref()), or, when it presented none, any owner for a login that holds 0130's
--   cross-account marker (the API's system logins, the runner, the scheduler: their sweeps name the owner a row of theirs holds) and none for any other
--   login. 0131's page_memory_run_owned, the ownership rule eighteen of them share, now asks it too; every other one the API's requests call refuses first
--   (REQUEST_OWNER_MISMATCH, 42501), but two plain readers, which answer as for nothing stored (0131's reading level and 0150's own contributions), and
--   0144's charge writer, which asks nothing (below). 0144's read_ask_clarify_spent and 0149's read_public_report_spent_by_funding, a person's own spend
--   totals, refuse too: each is a count that caps (the room, Continue, the clarify pool, the coarse fit, the usage page and the withdrawal add it into the
--   person's windows), so a total answered as 0 to a connection that is not the owner's would let that person spend more. Being plain SQL readers, each
--   becomes plpgsql to refuse as its first statement and then returns the total it read. Every caller reads them for the session's own account, inside its
--   request (the clarify pool reads a refusal as empty, and the room, Continue, the usage page and the withdrawal fail before they decide or write), or on
--   a login that holds the marker with no session (the runner's wall, the room's waker, the withdrawal command). 0144's charge writer is called after the
--   AI call was paid, so it still writes the site's ledger row whatever it is handed (0144's own rule: never a paid call uncounted), and it asks nothing
--   of the connection: it is the marker's alone now (below), so the API calls it on its system login, which presents no session, and an owner question
--   there could only leave a paid call out of its person's quota. The person is named before the call is paid, while the request's session is live: the
--   API reserves each call's charge id for its person through the new identity.reserve_ask_clarify_charge, on the request's own login, which refuses
--   (REQUEST_OWNER_MISMATCH) unless the helper agrees, and then no call is made, and refuses an id already reserved for another owner
--   (ASK_CLARIFY_CHARGE_TAKEN, 23505; the same owner's repeat reserves nothing new). The writer takes the reservation of that very charge for that very
--   owner, no older than an hour, and with none names the owner it is handed all the same, whatever session its connection presents, as a login that holds
--   the marker may name any owner; so its person's row is always written, and every paid call is in a person's quota.
--   So the reservation is what names the person, and the API makes no call it could not reserve. Nothing about the session is asked after the call, so
--   one that ended or whose token a step-up replaced while the call ran leaves the call in its person's quota, and a token that ended before reserves
--   nothing, so no call is made. The grant the API names is kept only when it is that person's own (0092's billing.internal_grant, which the writer's
--   owner owns and here only reads), by its configured event, and was running when the call was reserved (with no reservation, now): one that ended
--   while the call ran still holds the call it admitted, as a run's admitted call settles on its grant, and any other (another person's, made up, the
--   wrong event, half a pair, one ended before the reservation) leaves the call on the person's own plan, never refused, so the paid call is counted
--   and nothing latches the API's breaker, and no account fills a team's month by naming a member's grant. An hour is ample: the API records each call
--   within a minute of its reservation (its 8-second deadline aborts the call, a pool waits 5 s at most for a connection, production ends a statement at
--   30 s), so a reservation made with a token stolen and then revoked names no one past the hour. A reservation no charge takes goes once an hour old
--   with the next reservations anyone makes, or with the API's hourly sweep (the new identity.delete_ask_clarify_reservations_due, the cross-account
--   marker's alone, run outside any request), so none outlives about two hours. The site's day of spend is the system's to write. The three ledger
--   writers that name no debate, 0118's ledger.record_language_check_spend, 0128's ledger.record_question_check_spend and 0144's charge writer, took
--   any caller of debateai_runtime and any amount, so a request login with no session could fill today or tomorrow with one row and stop every paid
--   call on the site until that day ended, and a member's own session could charge their own running grant any amount. They move to the marker
--   (section 4): the API records each paid call through its site on its system login (apps/api/src/main.ts: X30 the language check, X31 the question
--   check, X32 the clarify charge), inside the request that paid for it, and probes each there at boot; the clarify reservation stays the request's.
--   So does the INSERT on the day's three tables, 0066's ledger.model_spend, 0083's holds and 0066's day reservations, which a request login could
--   write directly (a charge of any size on a debate of its own, a hold, a reservation of any day that never expires, where row security never
--   reached): their writers in a request were the system login's already (the room's hold on its decision pool, the daily guard's reservation in its
--   X23 frame), the synthesis check's charge goes through its site (X33), and the runner, the scheduler and the waker hold the marker. The definers
--   that write them do so as their owners, and section 5 finds one a request login may call: 0107's settlement of a funded debate's admitted call,
--   which asks the run's owner (below) and writes only the call its admission reserved. The room's count of the holds on the site's day reads every
--   account's (its X23 frame), as its day's spend does, where a request login counted its own alone. 0000's sequence counter, the one row every
--   event's position is drawn from, which debateai_runtime could set back with no row security so that every event appended next collided with one
--   already written, is written only through 0000's ledger.allocate_sequence(), a definer of the table's own owner now, with 0056's search path;
--   0000's work queue, granted UPDATE on the same line, stays as it is, as 0130's rule holds it to the connection's own debates. Still open, for a
--   step of its own: the logins that hold the marker may write the day at any size (the writers bound the day and the provider's name, not the
--   amount); 0123's spend waiver, which a request writes for a debate of its own, sets that debate's spend aside from its owner's windows while the
--   site's day still counts it; and the settlement watcher's and the evaluator's UPDATE on the counter (0015, 0023), logins no request holds. The run-keyed readers the API's answer read
--   calls on its request login, which took only a run and asked only whether it was live (0132's read_web_evidence, 0133's read_investigation_of_run,
--   0134's read_path_rewrites_of_run and read_web_plan, 0135's read_dig_picks_of_run, 0136's read_investigation_reports_of_run, 0138's
--   read_path_line_of_run, read_main_answer_updates_of_run and read_run_purpose_lines_of_run, 0139's read_web_shown_quotes, 0141's
--   read_path_suggestions_of_run), ask 0131's rule of the run's own owner instead, and the investigation's reader the helper of its member's owner, so
--   a debate that is not the connection's answers as for nothing stored (0132's evidence reader keeps its liveness question for the export worker's
--   login alone, which reaches it only through 0132's export reader, under its lease of one account's export, and whose role no request role holds);
--   they stay debateai_runtime's, as the answer read runs on that login, and it only ever names the owner's own debates to them (the debate it read
--   through 0130's row rule, the dig's parent and the investigation's digs, which 0134's rewrite turn and nested join keep to one owner; the rows
--   another account's public dig climbed onto the owner's line are read through the owner's own debate and opened under the dig's key, and the public
--   page reads 0147's and 0150's public readers, never these). 0147's record_public_material, the public copy the asks route and the report press write
--   on the request login, refuses (REQUEST_OWNER_MISMATCH) unless a dig's copy is keyed by the connection's own dig, by its run's own id, or a report's
--   copy is for a report still open on this publication and carrier that the connection's owner opened; a login that holds the marker passes the owner
--   half, the shape holds for every caller. 0147's read_public_path_line, the runner's reader of a public debate's whole line (the author's private
--   digs' turns and climbs, with their run ids, states, lineage and sealed texts, and held and refused public digs' rows), which the API's request
--   login calls only for a digger's own rewrite, handed any request login every row of any published debate's line; its one SELECT now keeps only
--   the rows of the connection's own runs, by each row's run's owner (a login that holds the marker reads every row, a run whose key is gone
--   included), so a request with no session, or another's, reads none, and the digger still reads its own row, refused or held. 0151's
--   settle_public_flag, which records the judge's verdict and hides a public debate on AGREE, believed the verdict of whoever called it, and 0151's
--   open_public_flag counted against limits its caller passed, so a request connection with its own live session could open its own flag on any
--   public debate never hidden before and settle it AGREE, which hid another account's debate until a person restored it. The settlement moves from
--   debateai_runtime to the marker (section 4): its one caller, the API's press, calls it after the judge, inside the reporter's request, on its
--   system login (the cross-account site X38), so no request login records a verdict, closes a flag or hides a debate; the reporter is the one the
--   opening named under the reporter's own session, and no settlement changes it. It still closes or hides only for a connection that presents the
--   reporter's own session or none (the system login presents none), and an AGREE now hides nothing for a report staff dismissed while the judge
--   ran: its verdict is recorded and it goes to a person. The opening counts against the lower of the limits it is handed and the site's
--   own: the new identity.public_flag_site_limits reads the abuseLimits row (R22 decision 18) sealed at the settings version of the release the
--   database names CURRENT (its key's r<N>; a SITE row, the same member for member in any version activated for it), so a request may tighten the
--   API's numbers and never loosen them, and a CURRENT release whose version holds no such row, or one whose three flag members are not whole
--   numbers from 1 to the schema's bound, refuses (PUBLIC_FLAG_LIMITS_UNRESOLVED, 55000), as an API whose own version holds none refuses to start
--   (while a release older than the row, which has no Report button of its own, is CURRENT, every opening refuses so, until the switch away from
--   it). No number of theirs is in this file. Still open, for a step of its own: a deployment that never switched to a release (a local one: a hosted site starts no debate
--   before its first switch) counts against the caller's numbers, as before; and a flag a request opens outside the press, which nothing then
--   settles, stays CHECKING, never judged and named to staff only in their queue, counting toward its debate's and the site's day of checks as a
--   press does, now within the site's own limits. The PUBLIC_FLAG_HIDDEN notice an automatic hide queues reaches staff: its claim, completion and
--   recipient (staff.claim_public_flag_notices and the two beside it) are the marker's now (below), so no request login can mark it delivered
--   unsent. The owner-taking functions older than 0131 the API's requests call
--   ask too, in place: 0126's removal notice and its question and 0040's lock of a request's own live runs, for an owner (its legacy asker's branch,
--   which names no owner, as it was), each answering as for nothing stored; and 0127's review state (its own spelling of the owner, the run's asker
--   id, kept as it is), which refuses (REQUEST_OWNER_MISMATCH) a connection that is not the owner's, as its rows are read as refusals (an open ask,
--   an approval or two asks leave the owner no ask), so no rows would read as never asked. A plain SQL reader, it becomes plpgsql to refuse first.
--   Its callers are the owner's own request (the review state's route and the answer index) and the export, on the system login with no session.
--   0128's two keepers of a threat report, which no product code calls and which let any runtime login file a report naming any
--   account and alert staff, are taken back. Left out on purpose: 0093's billing.read_internal_grant_spent and read_internal_grant_commitments,
--   billing functions whose grants 0130's verifier pins and whose bodies this step leaves alone: 0140's admission and staff's allowance page (0146)
--   read other members' totals through them as their owner, they hand back totals, never content, and a request must name a member's owner, grant
--   and configured event to read one. A funded debate's grant and configured event can be read by its run id through 0092's funding basis (left
--   alone, as a refusal, below), so only the member's owner ref, which 0130's row rule keeps from every request (the ownership events, 0092's charge
--   scopes and the account rows show a request its own alone, and 0092's billing.internal_grant is no request role's), stands between a request and
--   that member's totals: the census's test (below) finds no definer either request login may call that hands back an owner ref for the ids a
--   request can read, and no row of a relation it may read that holds one. A billing step of its own may split them. Left out too: the three
--   public readers left (core.run_is_published, read_public_dig_parent and read_public_tree_of_run), which answer only
--   for a debate public now, or a dig allowed on one, and hand back no content (whether it is public, its link, the ids of its runs); the deployment
--   metadata (a debate's release, its settings version, the newest run a re-admission made); staff's step-up, the sign-in challenge and the session
--   rotation, gated by the password, the factor and the receipts or tokens they are handed (the sign-in steps that hand out a stored secret or open
--   a session on the API's word move to the marker, below); and 0144's charge writer, which asks no owner: it is the marker's alone and runs after the
--   call was paid, so an owner question could only leave a paid call out of its person's quota, and the reservation, made on the request's own login and
--   refused unless the helper agrees, names the person (no request login may call it, so the census below names it in no list). The billing functions
--   keyed by a run or an owner that the request logins may call ask too, in their bodies, which 0130's verifier does not pin (it pins their grants,
--   owners, definer flag and settings, and this step moves none). 0140's
--   admission of a funded debate's provider call (billing.reserve_internal_provider_call) refuses (REQUEST_OWNER_MISMATCH) unless the helper agrees
--   to the run's owner, the one whose grant it charges (its charge scope's, else its latest ownership event's), before it locks or reads anything
--   of the grant, and 0107's settlement of an admitted call refuses the same of the owner of the call's own run, before it compares the call's frame
--   or writes the ledger row: so a request login with no session, or another's, can no longer admit provider bytes on a member's grant, nor settle
--   an admitted call at any amount and fill that grant's day, week and whole. Both run only in the runner (its provider gateway, on its login, which
--   holds the marker), as no request admits or settles a call. 0092's pin of a debate to a grant (record_internal_charge_scope) refuses any login
--   that does not hold the marker, so no request pins its own debate to another's grant: its one caller, the room, pins on its decision pool, the
--   API's system login. 0092's grant of a run and 0123's run state and person's grant answer as for nothing stored (null, UNAVAILABLE) unless the
--   helper agrees to the run's or the person's owner, so another account's grant amounts and caps are no request's to read; a request's own funded
--   ask reads its own debate's grant with its own session, and the runner's funding admission, the room's waker and the site line (the
--   cross-account site X22) read on their system logins. 0089's list of the owners billing stops for keeps only the rows whose owner it agrees
--   to, so a request login does not page through the owners whose erasure is pending or committed or whose account is age-frozen; every billing
--   sweep pages through it on the API's system login (the cross-account site X11), and the billing commands connect as that login. Left as they
--   are: 0093's eight-argument settlement, which no role may call since 0107, and billing's own purges of rows already due, which take no run or
--   owner and clamp the clock they are handed to now; and four refusals, whose true their callers act on, so an owner question would read a
--   connection that is not the owner's as not refused and turn each refusal into an allowance: 0089's and 0091's questions whether an owner's
--   erasure is pending or committed, or its account age-frozen (billing.owner_erasure_pending, owner_erasure_committed and owner_age_frozen: true
--   refuses a quote, a checkout, an upgrade, a card change and a cancel's revocation, refunds a payment that arrives, stops every renewal, resubmission
--   and dunning retry, ends the plan and revokes the saved cards), and 0092's funding basis of a debate (billing.read_run_funding_basis: its null
--   is a legacy or billing-off debate's, which the runner's funding admission admits and the room's waker starts on the subscription path). Each
--   answers any request login one boolean of an owner ref, or one debate's plan, or its grant's
--   ids, by the run id it names (a published debate's can be read, so its plan or grant ids can too), no amount and no content, as before this step;
--   every billing route and sweep asks them on the API's system login (X11), and the runner and the room's waker on theirs, where the question
--   would agree anyway; a request's own funded ask reads its own debate's.
--   The
--   engine's run-keyed functions older than 0131 the API's requests call ask too, in place: 0123's list of a debate's unstarted re-admissions, in its
--   owner's branch (its legacy asker's branch, the copies of a legacy debate, names no owner and stays as it was), and 0127's question whether a version
--   was approved ask of the run's latest owner, each answering as for nothing stored, and 0126's check result
--   writer asks of it inside its attempt match, so another account's attempt refuses before anything is written (a request may still store a verdict it
--   made up under an attempt of its own debate, which it may write: that is its own debate's record, and the database ties no publication to a check's
--   verdict). Those only the runner or the API's system login call move to the marker (below): 0120's recorded facts of a debate (0049's, restated),
--   0040's evaluator call check (the evaluator worker keeps its own grant) and 0126's inheritance writer. Three are left alone on purpose: 0040's
--   run_private_content_is_live, whether a run's content is live, one boolean of a run id, which the public report, the public copy's content trigger,
--   the erasure barriers and core.run_waiting_v ask of other accounts' debates on the request login and which the API's content leases ask directly, so
--   neither a question nor a move would keep its callers; 0040's ledger_entry_is_authenticated_scope, one boolean of a ledger row, which the
--   evaluator worker's ledger trigger asks with no marker and no session; and 0126's run_removed_by_synthesis_check, whether the check removed a
--   debate, a refusal: each of its callers hides or refuses a debate it answers true for (0127's review queue and the owner's ask for one, the
--   answer index and its count, the owner's answer read, the answer page's REMOVED state and the export), so an owner question would read a
--   connection that is not the owner's, and every connection of a legacy debate (it names no owner), as not removed, and turn each refusal into an
--   allowance; it answers one boolean of a run id and hands back nothing of the debate.
--   tests/integration/security-review-hardening-database.test.ts
--   censuses EVERY definer either request login (the production shapes api-runtime and api-authorization) may EXECUTE, with no name filter, each in
--   exactly one of four named lists: it asks the connection (0171's request_owner_matches or 0131's rule, 0130's context, a staff privilege token, or
--   the marker); it is gated by a secret, a token, a proof or its own transaction it is handed, never the connection (the sign-in, enrollment, recovery,
--   social, session and step-up family, the social sign-up's account, the staff token and action-proof ceremonies, the publication step-up grants, the
--   legacy claim, the three sign-up writers and the delivery overload); it is a public or site reader that hands back no account's private content; or
--   it is left alone on purpose, each with its one-line reason in that test, the same set as here: what this header leaves alone by name (billing's own
--   purges and its four refusals, 0093's two totals readers, 0040's two booleans and 0126's removal question, 0112's release of a claim, 0000's
--   allocator, 0085's hold question); the sign-in flows'
--   prunes of dead rows (0098's and 0100's challenges, 0101's social flows, 0099's prune of an account's dead TOTP addition and its list of at most five
--   accounts that have one, user ids alone); 0040's audit attempt of the transaction itself and the refusal audits (0040's failed login, step-up denial,
--   failed and duplicate registration and failed delivery record, 0042's rate limit refusal and 0080's country gate refusal), each of which appends one
--   DENY event, never a success, per attempt its own transaction began, and changes nothing of an account; the pending-account creators (0080's, 0095's
--   and 0096's wrappers), which make a new account under the id they are handed and nothing for a taken address, which they know by the blind index only
--   the API's key makes; 0097's question whether an owner's active account has a phone on file, one bit of an owner ref, which no product code asks now;
--   0128's hold of an erasing account's address on its threat reports, gated by the id of a prepared erasure; and 0152's measure of what a public check
--   used, a record of the site that holds no account's, which nothing reads to gate anything. Still open there, for a review of its own: a request login
--   may still append such a refusal event to any account's trail (two of them take a user id). A new, a removed or a newly reachable definer fails the
--   census, as does one that changes which list it belongs in. 0048's record of a provider's probe took any caller of debateai_runtime and any date, and
--   the API's ask-time discovery trusts it: it takes each provider's latest row (0040's latest_provider_probes, by probed_at) for healthy while that row
--   is HEALTHY and fresh, and probes every other provider again, one whose latest row is dated later than now included. So a request login with no
--   session could keep a provider the site configures on the panel, unprobed, with a HEALTHY row dated now, one freshness window per row written, or,
--   with a row dated later, outrank every probe the API records (each dated now) until that date, so that each ask's admission probed that provider
--   again (a paid call when the vendor is hosted). The writer moves from debateai_runtime to the marker (section 4), so it left the census: the API
--   records each probe its discovery makes through its site on its system login (apps/api/src/main.ts, X37), inside the request that asked, and reads
--   the latest rows on the request login, as before (0040's reader stays debateai_runtime's); the runner records its claim-time probes on its own login,
--   which holds the marker, and no other product code writes one. Still open, for a step of its own: a login that holds the marker may still date a
--   probe as it likes, as the API and the runner date theirs by their own clocks (a test of the busy model records its own an hour ahead of the
--   database), so bounding the date needs a margin for those clocks. The test also censuses the relations
--   either request login may INSERT, UPDATE or DELETE whose row security is off (billing.tool_order, scorecard.model_identity and
--   serve.publication_check_record, each append-only and content-free, and 0000's one-row ledger.sequence_allocator, whose PRIMARY KEY admits no second
--   row and whose UPDATE this step takes back), which a definer-only census cannot see, so a new such writable relation fails too. The functions only the runner
--   or the API's system login call, with no owner, on any account's rows, move from debateai_runtime, which the API's request logins hold (through
--   debateai_billing_runtime and debateai_authorization_runtime), to the marker, which only the system logins hold: the sweeps' readers and listers,
--   their settlements, wipes, marks and page writers, the runner's own steps of one debate, which take only its run, turn or report (its web
--   evidence, rewrites, turns, climbs, suggestions, month pause, closing's report and public dig writers, and their readers; the API calls five of
--   them, only ever on its system login), and staff's notice and alert loops, which the API drains only from its gated timers (0128's threat report
--   alerts, the account of the staff holder each goes to and the erasure of the reports due, and the claim, completion and recipient of 0142's team
--   limit notices, 0146's allowance notices, 0150's public review notices and 0151's flag notices), so a request login with no session no longer
--   claims a pending notice and marks it delivered unsent; 0151's flag settlement, which the API's press calls on its system login after the judge,
--   moves with them (above). So does 0088's staff alert outbox, which the staff runtime's dispatcher drains from its own gated timer, outside any
--   request, on the API pool's system login: its claim (0112 pinned its settings), the claim's key mapping, its settlement, the queue's status and
--   0090's reader of an invitee's channel, which needs a live claim's token, so a request login no longer claims a pending independent alert, with
--   its key user's audit token, and settles it DELIVERED on a forged receipt. 0112's release of a claim stays debateai_runtime's, as 0112's verifier
--   requires, and gives back only a live claim, which only the marker's claim hands out (section 5 checks both). So do 0100's consumer security
--   notice loop, a person's own takeover warnings (its claim, read, acknowledgement and failure, which only the API's erasure reconciler calls, from
--   its gated timer, on the authorization pool's system login; they were debateai_authorization_runtime's, so the authorization request login could
--   claim any person's warning and acknowledge it unsent), and the retention purges of rows already due, which the API runs only from its gated
--   timers: 0046's sign-in risk signals, 0126's removal notices and 0080's legal acceptance records (0094 made that one the API billing role's alone;
--   0130's verifier names no legal function, and the marker's other holders hold no right on the legal schema, so they can name it and not run it).
--   The main census above sees such a loop, but tells it from an owner-keyed writer only by what it asks, as its arguments name only a limit, a notice,
--   an alert or a claim; so the test keeps a loop census of the write-loops left (the three billing purges, the audit attempt, the three challenge
--   prunes, 0000's sequence allocator and 0112's release of a claim), and fails on a new one that asks nothing of the connection. The staff ceremonies and changes the API calls only through its staff repository, which main.ts builds on the request pool's
--   system login (the cross-account site X14), move as well: 0085's grant, an invitee's acceptance and the check of a staff context's capability
--   (0142's body), 0086's owned key ceremony (its start, 0142's body; its challenge read, failure and registration; its assertion, 0094's body),
--   the staff key reader, and 0088's mapping of a user to the audit token an alert is sealed for, which a staff change's alert intent asks inside the
--   staff member's request, now on the same site (apps/api/src/staff/runtime.ts, its mapping pool, the fourth X14 site). Each takes ids, a staff
--   context or a ceremony handle and asks nothing of the session, so a request login could start any person's key ceremony, read any active
--   account's audit token and ask any staff context's capability. Still open, for a step of its own: the owned ceremony's ELEVATION and ACTION
--   purposes are bound to the user and the ordinary session's id, never to the session token's hash the API holds, as the team page's reader is;
--   binding them needs a new signature. 0085's invite and disable, which the same repository calls, stay debateai_runtime's: each consumes an
--   action proof, which only the owned assertion (the marker's now) writes. The ones no code calls any more are taken back from every role, 0133's
--   mark of a closing's report among them (0136's report writer marks it as its owner), and 0046's reader of a recovery's sign-in risk signals
--   (gated by the recovery's handle; nothing reads the signals back), 0140's sum of every team-funded charge in a window (0144's body; staff's month
--   reader asks it as its owner) and 0085's first staff ceremonies, which 0086's owned ceremony replaced: the registration, invitation and owner
--   possession challenges, and the invitation's proof and the possession receipt, which 0094's owned assertion completes as their owner. 0085's
--   question whether an account is held or gone, one bit of any user id, is taken from debateai_runtime alone: the authorization runtime keeps it,
--   as the sign-in step-up asks it of the user row its login reads under 0130's row rule, and the owners of the definers that ask it of another
--   account keep theirs (section 5 checks both); it still answers the authorization login for any user id, which stays open. The marker's grants
--   also reach the API's authorization system login and the scheduler's liveness login, which hold the marker and call none of them, as they
--   reached them through debateai_runtime before. The account functions keyed by a user id that the API's requests call with their own session's
--   account ask too, in place: 0040's revocation of one session and of all of them, 0077's age check and its confirmation, 0078's consent and its
--   record, 0079's email settings and the email change's resend, 0085's reservation of a publication's event refs and its abandonment of a key
--   provision, and 0115's export status and the record of its download. Each took the user id the API named and believed it, so a request login
--   with any session or none read another account's age check, consent, export state and email addresses, revoked its sessions, recorded its
--   consent or its age, resent its pending change to the new address, reserved audit refs in its name, expired its key provision and audited a
--   download as its own. Each asks identity.request_owner_matches of that account's owner before it acts, so the readers answer as for nothing
--   stored (required, false, no row, NONE) and the writers change nothing of the account's and answer as they do for an account with nothing to
--   act on (false, 0, SESSION_NOT_FOUND, NONE, no refs; the revocations still audit their refusal, as they did), the download refusing as for a
--   link no longer valid (DATA_EXPORT_LINK_INVALID); every caller passes its
--   session's own account, inside its request, and the system logins, which hold the marker, still serve any account with no session. The three
--   sign-up writers, 0077's age check record at sign-up, 0095's region and 0125's Italy approval, which a sign-up makes before any session exists,
--   write only for an account their own transaction created: the account row's xmin must be pg_current_xact_id() (the top-level transaction's, also
--   asked inside a savepoint), as the API writes each in the transaction that creates the account (the age check inside 0080's, 0095's and 0096's
--   pending-account wrappers and 0101's social sign-up, or right after the creator without consent, in packages/db/src/identity.ts), by email or by a
--   social sign-up, outside any savepoint (a row a savepoint wrote carries the savepoint's own id, and no sign-up writes one so); an account made
--   earlier is refused as one not pending (AGE_CHECK_ACCOUNT_INVALID, REGION_ACCOUNT_INVALID, ITALY_APPROVAL_ACCOUNT_INVALID), on every login.
--   0085's record of a verification mail's delivery took any account's user id and wrote its delivery state and an audit event in its name. The API records each delivery through a same-name overload,
--   identity.record_verification_delivery_with_audit(uuid,text,timestamptz,boolean,text,jsonb), which takes the hash of the token the mail carried
--   and records nothing (false) unless it is one of the account's own verification credentials, used or not; 0085's own is taken back from
--   debateai_runtime and stays, no role's (nothing is dropped). The sign-in and recovery functions that hand out what proves a person, or open a
--   session or a recovery on the API's word, cannot be bound to a secret a request holds: a request login begins its own passkey challenge or
--   recovery with a token of its choosing, the API checks a passkey's signature (SQL checks no ECDSA or EdDSA), and a recovery code's stored hash
--   is argon2. So 0098's read_consumer_passkey_credential and complete_consumer_passkey_login (0099's body) and 0100's read_consumer_recovery_proof
--   and prove_consumer_recovery (0112's body) move from debateai_authorization_runtime to the marker, and 0040's consume_recovery_code_with_audit
--   (0112's body), which marked any account's saved code used, moves from debateai_runtime: the API calls each only through its repositories in
--   packages/db, inside the request, on its pool's system login (the cross-account site X36: the authorization pool's for the four, the API pool's
--   for the code; 0112's verifier pins their settings and owners, not their grants). The password, TOTP and recovery-code sign-ins (each gated by
--   its challenge token), the passkey challenge, the session rotation and staff's step-up are as they were. The census (F5, above) now reaches every
--   definer either request login may call, this step's names and the ones keyed by a user id alike, and names each: the ones keyed by a user id that
--   this step did not touch stay in the census's gated or left-alone list, each with its reason there, left for a review of their own (gated: the
--   sign-in, enrollment, recovery, social, session and step-up flows, each by the password, the factor, the bearer, the cap or the session token it is
--   handed; left alone: the refusal audits and the prune of a dead TOTP addition, F5 above), and 0085's hold question (above) stays open too.
-- F2. The owner decided that a dig, a debate dug from another, is never published: its question quotes its parent's and carries its parent's place,
--   time and purpose lines, which may be another person's or private. Nothing refused it: the owner's Publish took a dig like any debate. A dig is now
--   known by its own row of the new identity.dig_run, written by the statement that creates the dig's run: 0123's core.create_encrypted_run, the one
--   writer of every owner's run (a new ask's, direct or the room's START and WAIT, and a re-admission's), is patched below to take one more key of its
--   closed document, digRun (JSON true only; any other value refuses the document and writes nothing, as any other key does), which the API sends for
--   an ask with a parent or a public parent, and to write the row right after the run's ownership event; a run that re-admits a dig gets its own row
--   the same way. So no sign-out, step-up, failure or crash after the creation can leave a dig unmarked: a creation that fails writes neither. The row
--   names the dig's run alone, never its parent, so it stays when the parent is erased or changes hands; only the dig's own erasure (0131's
--   per-debate forget, patched below) or its account's (the cascade) takes it. The digs already there when this step applies are marked as it applies,
--   from the records they left (section 1). Still open: a dig made before this step that left no record at all cannot be told from any other debate,
--   as no run names its parent, so it stays unmarked; and the digs already published stay published (section 5 counts them as the step applies;
--   migrations/lineage/README.md says what the operator does about each), as unpublishing one here would write visibility events and destroy keys
--   outside the definers that own them. The new identity.run_is_dig(run) knows a dig by that row or by any of the four other records a dig may leave
--   (0135's picks, 0137's public contribution, 0133's place in an investigation under a parent, 0131's link to its parent), on the debate or on any it
--   re-admits (0123's run_supersession, back at most 16 runs, as core.resolve_run_ref goes forward). Both ways a snapshot is ever written refuse a
--   dig: 0085's serve.prepare_publication_key_provision (0099 patched it in place for the session's cap, and this patches that live body again) right
--   after its owner and live-content checks, and the transition publishes only under the PREPARED intent it writes; and 0137's
--   identity.claim_free_public_ask, which both steps of the Free debates' own publication (core.prepare_free_publication and core.publish_free_debate)
--   ask first, so a dig is never waiting for one. 0137's identity.read_free_debates_to_publish leaves digs out of the sweep too, and 0137's
--   identity.record_free_public_ask records no Free notice for a dig (NOT_OWNED), so none waits for ever. 0127's serve.ask_publication_review refuses
--   a dig (NOT_ALLOWED) before it consumes the grant or puts a request in the team's queue. The API asks first, through the new owner-scoped
--   identity.read_run_is_dig, and answers 409 DIG_NOT_PUBLISHABLE before it reads the answer, runs a check or makes a key, on its publish route and on
--   its ask for the team's approval; its visibility read tells the page. Its true refuses, so it asks F5's question of the connection first and fails
--   closed: a connection that is not the owner's (another account's session, or a request login with no session) reads every debate as a dig, one
--   constant that tells nothing of the debate, and the owner's session or a marker login with no session reads the debate's own answer, null where
--   0131's rule finds it not the owner's (another's, erased or inactive), which the grant's check asked before it refuses. Every caller is an
--   authenticated route on the request login, asking of the session's own owner, so only a session that changed mid-request reads a plain debate as
--   one (a 409 in place of a 404 or a publish: closed, never open). The key provision and the review ask refuse a dig whoever calls.
--
-- HOW AN EARLIER BODY CHANGES HERE. Never by restating it: section 3 reads the live definition (pg_get_functiondef), replaces one exact anchor that must be
-- found exactly as often as stated, and runs the result, as 0099 does; the function's owner, grants, definer flag, settings and volatility must come out
-- unchanged. Nothing earlier is dropped. Every earlier step whose postcondition digest this changes is declared in the manifest's amendsPostconditionsOf, with
-- the field function_definition also for a grant taken back or moved alone (the chain re-measures the step's whole digest, its grants included): 0112, 0115,
-- 0116, 0118, 0120, 0125, 0126, 0128, 0140, 0142, 0143, 0144, 0145, 0146, 0149 and 0153 (F5), 0123, 0127 and 0131 (F5, F2), 0137 (F3, F4a, F5, F2), 0150
-- (F4b, F5), and 0132, 0133, 0134, 0135, 0136, 0138, 0139, 0141, 0147 and 0151 (F4a, F5); 0140's entry holds its admission of a funded call too (F5,
-- billing), 0112's its recovery's proof and the use of a saved code, moved, and 0115's and 0125's the account bodies they digest (F5, accounts). 0040's
-- lock of a request's own runs (F5), 0085's key provision (F2), the billing bodies that ask now but 0140's (F5: 0089's, 0092's and 0107's,
-- older than the chain, and the two 0123 restated, which 0123's postcondition does not digest) and the account bodies older than the chain (F5:
-- 0040's, 0077's, 0078's, 0079's, 0085's and 0095's) are no chain step's: no earlier postcondition digests any, so this step's own does, as it does
-- the functions older than the chain whose grants it moves or takes back (F5: 0040's evaluator call check and 0048's probe writer, grants moved, and
-- 0046's, 0080's, 0085's, 0086's, 0088's, 0090's, 0098's and 0100's) and 0000's sequence allocator, a definer now (F5). No step's postcondition
-- digests the grants of the day's tables or the counter, which are older than the chain (0000, 0066, 0083).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it takes back and moves grants of 0000, 0040, 0046, 0048, 0066, 0080, 0083, 0085, 0086, 0088, 0090, 0098, 0100, 0112, 0116,
--                   0118, 0120, 0126, 0128 and of 0132 to 0153 (the day's tables' and the counter's among them), makes 0000's allocator a definer, adds an
--                   overload of 0085's verification delivery that the API calls in its place, redefines in place functions of 0040, 0077, 0078,
--                   0079, 0085, 0089, 0092, 0095, 0107, 0115, 0123, 0125, 0126, 0127 and of 0131 to 0151 the API, the runner and the erasure
--                   worker call (0123's writer of every owner's run, the billing functions keyed by a run or an owner and the account functions
--                   keyed by a user id among them), and marks the digs already there; R22 is a drained upload.
--   keeps-verifier  it adds no effective-capability verifier: it creates no billing relation or billing function, and changes no billing relation's
--                   or function's grants, owner, definer flag or settings, which lineage/verify-effective-capabilities-130.sql pins (it pins no
--                   billing body), so that verifier stays in force as it is. It adds the connection's question inside seven billing bodies
--                   (section 3, F5), and 0144's charge writer reads billing.internal_grant as that table's own owner; neither moves what it pins.

-- 1. What this step adds: the helpers and the tables the patched bodies use ----------------------------------------------------------
-- F4b: whether a link is still its debate's current publication. True while the latest visibility event of the link's debate is PUBLISHED under this very link;
-- a hold changes nothing here (it writes no visibility event), a debate made private again or published under a new link answers false. Reads 0039's
-- tables, so it takes their owner, as core.public_review_snapshot does.
CREATE OR REPLACE FUNCTION core.publication_is_current(p_publication_ref uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE((SELECT latest.state = 'PUBLISHED' AND latest.publication_ref = p_publication_ref
    FROM (SELECT event.state, event.publication_ref FROM core.run_visibility_event AS event
      WHERE event.run_id = core.run_of_publication(p_publication_ref) ORDER BY event.at_seq DESC LIMIT 1) AS latest), false)
$$;

-- F4a: the forget scopes. One row while a definer's deletes run under a guard: the transaction's id and the guard's scope. Ids only. No role holds a right on
-- the table (section 2); only the two definers below write it, and a row of another transaction opens nothing, so a row left behind does no harm.
CREATE TABLE IF NOT EXISTS identity.private_forget_scope (
  transaction_id xid8 NOT NULL,
  scope text NOT NULL CONSTRAINT private_forget_scope_scope_check CHECK (scope IN ('web_evidence','investigation','dig_model','dig_picks','public_debate',
    'tree_updates','passage_retention','path_suggestions','public_tree')),
  CONSTRAINT private_forget_scope_pkey PRIMARY KEY (transaction_id, scope)
);
SELECT core.install_truncate_guard('identity.private_forget_scope');

-- A definer opens its scope right before the deletes its guard is to let through, and closes it right after them, where it set and unset the setting before.
-- pg_current_xact_id() is the top-level transaction's id, also inside a savepoint: the scope is the whole transaction's, and a savepoint rolled back takes it.
-- Opening twice is opening once.
CREATE OR REPLACE FUNCTION identity.open_forget_scope(p_scope text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO identity.private_forget_scope (transaction_id, scope) VALUES (pg_catalog.pg_current_xact_id(), p_scope) ON CONFLICT DO NOTHING
$$;
CREATE OR REPLACE FUNCTION identity.close_forget_scope(p_scope text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  DELETE FROM identity.private_forget_scope AS open_scope WHERE open_scope.transaction_id = pg_catalog.pg_current_xact_id() AND open_scope.scope = p_scope
$$;
-- The guards' question: is this scope open in this transaction? A transaction with no id yet has written nothing, so it has opened nothing: the read
-- assigns no id (pg_current_xact_id_if_assigned()).
CREATE OR REPLACE FUNCTION identity.forget_scope_open(p_scope text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM identity.private_forget_scope AS open_scope
    WHERE open_scope.transaction_id = pg_catalog.pg_current_xact_id_if_assigned() AND open_scope.scope = p_scope)
$$;

-- F5: whether `p_owner_ref` is the owner the database itself sees for this connection. With a live session presented (0130's context: the setting holds the
-- raw token of a live session, which only that session's holder knows), it is that session's account and no other. With none, a login that holds 0130's
-- cross-account marker (the API's system logins, the runner, the scheduler; a superuser counts as a member of every role) may name any owner, as its
-- sweeps do with the owner a row of theirs holds, and any other login names none: the API's request login with no session, an anonymous request, a
-- revoked or made-up token. session_user is the login, whatever role the connection set or this definer runs as.
CREATE OR REPLACE FUNCTION identity.request_owner_matches(p_owner_ref uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN context.owner_ref IS NOT NULL THEN COALESCE(context.owner_ref = p_owner_ref, false)
    ELSE pg_catalog.pg_has_role(session_user, 'debateai_rls_all_accounts', 'MEMBER') END
  FROM (SELECT rls.context_owner_ref() AS owner_ref) AS context
$$;
-- F5: the clarify charge's reservations. 0144's charge is written after its AI call was paid, when the request's session may have ended (a sign-out) or
-- had its token replaced (a step-up in another tab rotates it in place): so the person is named before the call, while the session is live, by one row
-- here, keyed by the charge id the call will be recorded under, which the charge takes as it is written. Ids and the time only. A call that is never
-- recorded (the vendor refused it, the day pot's gate stopped it, it was abandoned, its record failed) leaves its row, and the writer takes none older
-- than an hour (every call is recorded within a minute of its reservation, F5 above): once a row is an hour old, the next reservations anyone makes
-- take it (each takes up to 100 such rows of any owner, the oldest first, and adds one, so a backlog drains), and so does the API's hourly sweep
-- below, so no row waits for its own owner to come back, nor for anyone's next call. An erased account takes its rows (the cascade).
-- No role holds a right on the table (section 2); the reservation's writer and its sweep below and 0144's charge, which consumes it, are its owner's.
-- Not in the person's export: a row is a call's pending claim, gone with its charge or within about two hours, and the charge it leads to is exported
-- as its time (0144). Outside 0130's scope rule, as 0144's table: no request role can read it.
CREATE TABLE IF NOT EXISTS identity.ask_clarify_reservation (
  charge_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- The account's cascade finds its rows by the first, the reservation's prune and the sweep the hour-old ones of every owner by the second.
CREATE INDEX IF NOT EXISTS ask_clarify_reservation_owner ON identity.ask_clarify_reservation (owner_ref, reserved_at);
CREATE INDEX IF NOT EXISTS ask_clarify_reservation_reserved_at ON identity.ask_clarify_reservation (reserved_at);
SELECT core.install_truncate_guard('identity.ask_clarify_reservation');

-- F5: the reservation of one paid call's charge, which the API makes on the request's own connection right before the call. Refuses (23514, as 0144's
-- writer) a missing id or owner, and (REQUEST_OWNER_MISMATCH, 42501) an owner that is not the one the database sees for the connection, the rule above:
-- the account of the live session it presents, or any for a login that holds the marker. Then it takes up to 100 reservations of any owner that are an
-- hour old or older, the oldest first, passing over any another call holds, so no reservation waits on another. A charge id already reserved for this
-- owner reserves nothing new; one reserved for another owner is refused (ASK_CLARIFY_CHARGE_TAKEN, 23505) and left as it is. The API mints every id at
-- random, so only a bug, or a marker login that guessed a fresh id, meets that, and the API's breaker counts it as a reservation that failed.
CREATE OR REPLACE FUNCTION identity.reserve_ask_clarify_charge(p_charge_id uuid, p_owner uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_charge_id IS NULL OR p_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ASK_CLARIFY_CHARGE_INVALID'; END IF;
  IF NOT identity.request_owner_matches(p_owner) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;
  DELETE FROM identity.ask_clarify_reservation AS reservation WHERE reservation.charge_id IN (
    SELECT stale.charge_id FROM identity.ask_clarify_reservation AS stale
    WHERE stale.reserved_at <= pg_catalog.clock_timestamp() - interval '1 hour'
    ORDER BY stale.reserved_at LIMIT 100 FOR UPDATE SKIP LOCKED);
  INSERT INTO identity.ask_clarify_reservation (charge_id, owner_ref) VALUES (p_charge_id, p_owner) ON CONFLICT (charge_id) DO NOTHING;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM identity.ask_clarify_reservation AS held WHERE held.charge_id = p_charge_id AND held.owner_ref = p_owner) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='ASK_CLARIFY_CHARGE_TAKEN';
  END IF;
  RETURN 'RESERVED';
END
$$;
-- F5: the API's sweep of the reservations no charge took, which it runs from a gated hourly timer and once each time its release becomes current,
-- outside any request (so on its system login): the prune's rule with the same window, of every owner, the oldest first, past any another call holds,
-- at most as many as it is asked (1 to 1000; any other count is refused, 22023, before anything goes), and how many went. With it no reservation waits
-- for anyone's next call, so none outlives about two hours. It names no owner and takes any account's rows, so it is the cross-account marker's alone.
CREATE OR REPLACE FUNCTION identity.delete_ask_clarify_reservations_due(p_limit integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ASK_CLARIFY_RESERVATION_SWEEP_INVALID'; END IF;
  DELETE FROM identity.ask_clarify_reservation AS reservation WHERE reservation.charge_id IN (
    SELECT stale.charge_id FROM identity.ask_clarify_reservation AS stale
    WHERE stale.reserved_at <= pg_catalog.clock_timestamp() - interval '1 hour'
    ORDER BY stale.reserved_at LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$$;
-- F5: the Report button's limits as the database holds them, which 0151's opening counts against beside the API's: the abuseLimits row (R22 decision
-- 18) of the release the database names CURRENT (0123's reader), at that release's own settings version (its key's r<N>, which is its
-- REGISTER_VERSION; a SITE row, the same member for member in any version activated for it), as {person_hour, debate_day, site_day}. Null while no
-- release is CURRENT (a deployment that never switched: only a local one). A CURRENT release whose sealed version holds no such row, or one whose
-- three flag members are not whole numbers from 1 to the schema's bound (packages/register/src/abuse-limits.ts), refuses, as an API whose own
-- version holds none refuses to start. It names no number of the limits. No role may call it; the opening asks it as its owner.
CREATE OR REPLACE FUNCTION identity.public_flag_site_limits() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_release text; v_row jsonb;
BEGIN
  SELECT current_release.release_key INTO v_release FROM core.read_current_release() AS current_release;
  IF v_release IS NULL THEN RETURN NULL; END IF;
  SELECT r.value_json INTO v_row FROM register.register_row AS r JOIN register.register_version AS v ON v.register_version = r.register_version
  WHERE r.register_version = pg_catalog.substring(v_release, '^r([1-9][0-9]*)-')::bigint AND r.row_key = 'abuseLimits' AND v.sealed;
  IF v_row IS NULL OR v_row->>'kind' IS DISTINCT FROM 'ABUSE_LIMITS' OR EXISTS (SELECT 1
      FROM pg_catalog.unnest(ARRAY['flag_per_person_hour','flag_per_debate_day','flag_per_site_day']) AS member(name)
      WHERE pg_catalog.jsonb_typeof(v_row->member.name) IS DISTINCT FROM 'number' OR (v_row->>member.name) !~ '^(?:[1-9][0-9]{0,5}|1000000)$') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_FLAG_LIMITS_UNRESOLVED';
  END IF;
  RETURN pg_catalog.jsonb_build_object('person_hour', (v_row->>'flag_per_person_hour')::integer, 'debate_day', (v_row->>'flag_per_debate_day')::integer,
    'site_day', (v_row->>'flag_per_site_day')::integer);
END
$$;

-- F5: a verification mail's delivery, recorded for the token that mail carried. 0085's body, and one question before it touches the channel: the
-- token's hash is one of the account's own verification credentials (used or not: a late callback after the person clicked still names its mail).
-- Any other answers false and writes nothing, as a delivery for a frozen account does. 0085's own, which took any user id, stays, no role's.
CREATE OR REPLACE FUNCTION identity.record_verification_delivery_with_audit(p_user_id uuid, p_token_hash text, p_occurred_at timestamptz,
  p_success boolean, p_error_code text, p_source_context jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_channel record; v_account record; v_changed boolean;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  IF COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=p_user_id),false) THEN PERFORM identity.consume_runtime_audit_attempt(); RETURN false; END IF;
  SELECT channel.channel_binding_id,channel.user_id INTO v_channel
  FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id AND channel.channel_type='email'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_USER_NOT_FOUND'; END IF;
  SELECT * INTO v_account
  FROM identity.lock_account_t9_internal(v_channel.user_id,false);
  IF v_account.audit_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_USER_NOT_FOUND';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.verification_token_credential AS credential
      WHERE credential.channel_binding_id=v_channel.channel_binding_id AND credential.token_hash=p_token_hash) THEN
    PERFORM identity.consume_runtime_audit_attempt();
    RETURN false;
  END IF;
  -- A delivery callback may arrive after account PREPARE won the channel/user
  -- locks. Consume its one-shot audit attempt but do not touch the frozen
  -- channel or emit an account-linked delivery event.
  IF v_account.user_state NOT IN ('pending_verification','pending_mfa','active') THEN
    PERFORM identity.consume_runtime_audit_attempt();
    RETURN false;
  END IF;
  IF (p_success AND p_error_code IS NOT NULL)
    OR (NOT p_success AND COALESCE(p_error_code,'') !~ '^[A-Z][A-Z0-9_]{0,63}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='VERIFICATION_DELIVERY_OUTCOME_INVALID';
  END IF;
  UPDATE identity.channel_binding
  SET verification_last_sent_at=p_occurred_at,
    delivery_status=CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
    delivery_error=p_error_code
  WHERE identity.channel_binding.channel_binding_id=v_channel.channel_binding_id
    AND (
      verification_last_sent_at IS DISTINCT FROM p_occurred_at
      OR delivery_status IS DISTINCT FROM CASE WHEN p_success THEN 'sent' ELSE 'failed' END
      OR delivery_error IS DISTINCT FROM p_error_code
    )
  RETURNING true INTO v_changed;
  PERFORM identity.consume_runtime_audit_attempt();
  IF NOT COALESCE(v_changed,false) THEN RETURN false; END IF;
  PERFORM identity.append_runtime_audit_event_internal(
    v_account.audit_token,'identity.verification.sent',v_channel.channel_binding_id,
    clock_timestamp(),p_source_context,'ALLOW',p_success,p_error_code
  );
  RETURN true;
END;
$$;
-- F2: a dig's own row, one per dig, whatever else it leaves. The statement that creates the dig's run writes it (0123's core.create_encrypted_run,
-- patched in section 3), right after the run's ownership event, so a dig is a dig from its first statement, private or public, whatever its join
-- then answers. Ids and the time only, keyed on the dig's own run and naming no parent: the parent's erasure, or its changing hands, leaves it. The
-- dig's own erasure takes it (0131's per-debate forget, patched in section 3), and so does its account's (the cascade). No role holds a right on the
-- table (section 2); only the run's creation, the question below and the forget reach it, each as its owner. Outside 0130's scope rule, as 0131's
-- tables, since no request role can read it. Not in the person's export, like 0153's mark of a settled dig: the ids of the person's own debate and a
-- time.
CREATE TABLE IF NOT EXISTS identity.dig_run (
  run_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS dig_run_owner ON identity.dig_run (owner_ref);
SELECT core.install_truncate_guard('identity.dig_run');
-- F2: the digs already there as this step applies have only the records they left, and their parent's erasure takes two of them (the link, 0131,
-- and the place in an investigation, 0133), so each is marked here, once: every run with one of the four records, by its owner now (its latest
-- ownership event, as the row's cascade goes with that account), but a run already erased and an owner whose account is gone. A dig that left none
-- cannot be told from any other debate, as no run names its parent. Nothing published is touched (section 5 counts what was).
INSERT INTO identity.dig_run (run_id, owner_ref)
  SELECT dig.run_id, owner_now.owner_ref
  FROM (SELECT picks.run_id FROM identity.dig_pick_set AS picks
    UNION SELECT contribution.dig_run_id FROM identity.public_contribution AS contribution
    UNION SELECT member.run_id FROM identity.investigation_member AS member WHERE member.parent_run_id IS NOT NULL
    UNION SELECT link.child_run_id FROM identity.dig_link AS link) AS dig (run_id)
  CROSS JOIN LATERAL (SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = dig.run_id ORDER BY event.at_seq DESC LIMIT 1) AS owner_now
  WHERE EXISTS (SELECT 1 FROM identity."user" AS account WHERE account.owner_ref = owner_now.owner_ref)
    AND NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS erased WHERE erased.run_id = dig.run_id)
  ON CONFLICT (run_id) DO NOTHING;

-- F2: whether a debate is a dig: by its own row (above), or by any one of the four other records a dig may leave: its picks (0135, recorded for every
-- private dig and every public one that joined), its public contribution (0137, written when a public dig's tree join took), its place in an
-- investigation under a parent (0133; an investigation's root has none), its link to its parent (0131). The debate's own records, or those of a run it
-- re-admits: the ask waker's re-admission (0123's core.run_supersession, old run to new) makes a new run and copies none of them, so the question
-- follows the edges back, at most 16, the bound core.resolve_run_ref keeps going forward. The parent's erasure takes the link and the place but leaves
-- the row and the picks, so a dig stays a dig. Ids only. No role may call it; the definer below, 0123's run writer (for the run a re-admission
-- copies), 0085's key provision, 0127's review ask and 0137's Free reader, claim and notice ask it as their owners.
CREATE OR REPLACE FUNCTION identity.run_is_dig(p_run_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH RECURSIVE chain (run_id, hops) AS (
    SELECT p_run_id, 0 WHERE p_run_id IS NOT NULL
    UNION ALL
    SELECT edge.old_run_id, chain.hops + 1 FROM core.run_supersession AS edge JOIN chain ON edge.new_run_id = chain.run_id WHERE chain.hops < 16)
  SELECT EXISTS (SELECT 1 FROM chain WHERE
    EXISTS (SELECT 1 FROM identity.dig_run AS mark WHERE mark.run_id = chain.run_id)
    OR EXISTS (SELECT 1 FROM identity.dig_pick_set AS picks WHERE picks.run_id = chain.run_id)
    OR EXISTS (SELECT 1 FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = chain.run_id)
    OR EXISTS (SELECT 1 FROM identity.investigation_member AS member WHERE member.run_id = chain.run_id AND member.parent_run_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM identity.dig_link AS link WHERE link.child_run_id = chain.run_id))
$$;
-- F2: the API's question before it publishes a debate or offers to: is this debate of the owner's a dig? A refusal, so it fails closed: true, for every
-- debate, when the connection is not the owner's (F5's question, which answers alike for every run); else null when it is not the owner's by 0131's
-- rule, and the debate's own answer when it is.
CREATE OR REPLACE FUNCTION identity.read_run_is_dig(p_owner_ref uuid, p_run_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN NOT identity.request_owner_matches(p_owner_ref) THEN true
    WHEN identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN identity.run_is_dig(p_run_id) END
$$;

-- 2. Their owners and the exact grants -------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and functions their owners, as 0150 and 0153 do; touches no earlier object
DO $security_review_owner$
DECLARE v_core name; v_owner name; v_writer name; v_delivery name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_core FROM pg_catalog.pg_proc AS p WHERE p.oid = 'core.run_is_published(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION core.publication_is_current(uuid) OWNER TO %I', v_core);
  EXECUTE 'REVOKE ALL ON FUNCTION core.publication_is_current(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  -- F4a: 0115's export owner, which owns every guarded table, every definer that opens a scope and nine of the ten guards; the tenth, 0132's, is the
  -- migrator's, which is that same role ("owned by the migrator as 0115's export owner", lineage/README.md, 0131). The contract checks that each of them
  -- may call what it calls, so no grant is needed, and the step refuses to apply where one would be.
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.private_forget_scope OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON identity.private_forget_scope FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.open_forget_scope(text) OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.open_forget_scope(text) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.close_forget_scope(text) OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.close_forget_scope(text) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.forget_scope_open(text) OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.forget_scope_open(text) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  -- F5: the same owner, which owns page_memory_run_owned and every definer that asks but the staff-owned ones (0144's spend total, the clarify
  -- reservation, and 0092's grant of a run, 0123's run state and person's grant, 0107's settlement and 0140's admission: staff's, below), and may
  -- read 0130's context (the contract checks it).
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.request_owner_matches(uuid) OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.request_owner_matches(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  -- F5: the clarify charge's reservations, their writer and their sweep take 0144's charge writer's owner (debateai_staff_security_owner), so the charge
  -- that takes a reservation needs no grant on the table, and an erased account's cascade runs as that owner on its own table.
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_writer FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.ask_clarify_reservation OWNER TO %I', v_writer);
  EXECUTE 'REVOKE ALL ON identity.ask_clarify_reservation FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.reserve_ask_clarify_charge(uuid,uuid) OWNER TO %I', v_writer);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.reserve_ask_clarify_charge(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.delete_ask_clarify_reservations_due(integer) OWNER TO %I', v_writer);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.delete_ask_clarify_reservations_due(integer) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  -- F5: the site's flag limits take 0115's export owner, which owns 0151's opening, its one caller, so no grant is needed; the contract checks that
  -- it may read 0123's current release and the register's rows.
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.public_flag_site_limits() OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.public_flag_site_limits() FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  -- F5: the delivery's overload takes its original's owner (0085's), which owns the channel and the credential rows it reads and may call each
  -- helper it calls, as the original does (the contract checks it).
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_delivery FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.record_verification_delivery_with_audit(uuid,text,timestamptz,boolean,text,jsonb) OWNER TO %I', v_delivery);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.record_verification_delivery_with_audit(uuid,text,timestamptz,boolean,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  -- F2: the same owner for a dig's row, as 0131's dig links have, so 0131's forget, its own, takes the row; 0123's run writer, which writes it, is
  -- the migrator's, that same role (the contract checks that it may).
  EXECUTE pg_catalog.format('ALTER TABLE identity.dig_run OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON identity.dig_run FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  -- F2: the same owner, which owns the five tables the helper reads and 0137's Free reader, claim and notice that ask it; 0085's key provision,
  -- 0123's run writer and supersession edges and 0127's review ask are the migrator's, that same role (the contract checks that each may ask, and
  -- that the helper may read the edges).
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.run_is_dig(uuid) OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.run_is_dig(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_run_is_dig(uuid,uuid) OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.read_run_is_dig(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
END
$security_review_owner$;
-- F4b: staff's door calls it (staff.read_public_review is staff's own).
GRANT EXECUTE ON FUNCTION core.publication_is_current(uuid) TO debateai_staff_security_owner;
-- F5: the definers that ask and are not identity's own are staff's: 0144's spend total, the clarify reservation and the five billing definers that ask
-- (0092's grant of a run, 0123's run state and person's grant, 0107's settlement and 0140's admission), whose owners section 5 checks may ask.
GRANT EXECUTE ON FUNCTION identity.request_owner_matches(uuid) TO debateai_staff_security_owner;
-- F5: the API reserves a clarify call's charge on the request's own connection, as 0144 grants it the charge.
GRANT EXECUTE ON FUNCTION identity.reserve_ask_clarify_charge(uuid,uuid) TO debateai_runtime;
-- F2: the API's publish route, its ask for the team's approval and its visibility read ask on the request login, as the person's own request.
GRANT EXECUTE ON FUNCTION identity.read_run_is_dig(uuid,uuid) TO debateai_billing_runtime;
-- F5: the API's sweep of the reservations no charge took runs outside any request, on its system login: the marker's alone, as the sweeps' own steps
-- that section 4 moves.
GRANT EXECUTE ON FUNCTION identity.delete_ask_clarify_reservations_due(integer) TO debateai_rls_all_accounts;
-- F5: the API records a verification mail's delivery inside the request that sent the mail, on its request login, naming the mail's token, as
-- 0085 granted the original.
GRANT EXECUTE ON FUNCTION identity.record_verification_delivery_with_audit(uuid,text,timestamptz,boolean,text,jsonb) TO debateai_runtime;

-- 3. Earlier bodies patched in place -------------------------------------------------------------------------------------------------
-- One inventory: the function, the fix it serves, and each anchor with its replacement and how often the anchor stands in the live body. A function is read once,
-- every anchor of it is replaced in order, then it is run again; its oid, owner, grants, definer flag, settings and volatility must not move.
-- F4a's entries, in step order: each guard's reading of its setting becomes the question to its scope, and each definer's setting on and off become the
-- opening and the closing of the same scope, in the same places (0139's wipe opens two, as it set two).
-- F5's, in step order: 0040's lock of a request's own runs asks of an owner it is handed, beside its own check; 0123's list of a debate's unstarted
-- re-admissions asks, in its owner's branch, of the old run's latest owner (its legacy asker's branch names no owner and stays as it was); 0126's
-- removal notice and its question ask in their WHERE, and 0127's question whether a version was approved asks of the run's
-- latest owner beside what it finds, so each answers as for nothing stored (0126's question whether a debate was removed, a refusal, asks no owner);
-- 0126's check result writer asks of
-- the same owner inside its attempt match, so another account's attempt refuses as no attempt does, before anything is written; 0131's ownership rule
-- asks the session's owner beside its own questions; each other definer the API's requests call refuses as its first statement when the owner it is
-- handed is not the connection's; the two plain SQL readers (0131's reading level, 0150's own contributions) ask in their WHERE, so they answer as
-- for nothing stored; the run-keyed readers of 0132 to 0141 open with 0131's rule of the run's own owner where they opened with its liveness alone
-- (the evidence reader's liveness alone still for the export worker's login), and 0133's investigation of a run asks of its member's owner; 0144's
-- charge writer, right before its person's row and after the ledger row it always writes, takes the call's reservation (with none, the owner it is handed
-- is the person: it asks nothing of the connection), and keeps the grant it is handed only when it is the person's own and was running when the call was
-- reserved (one more variable for that time, and the grant set aside otherwise, so the person's row is their own plan's); 0127's review state and 0144's
-- and 0149's spend totals of a person, plain SQL readers, become plpgsql and refuse as their first statement (their one SELECT unchanged after it, its
-- answer returned);
-- 0147's public copy refuses right after its liveness check a copy that is not the
-- connection's own dig's or open report's, and 0147's reader of a public debate's line keeps, in its one SELECT, only the rows of the connection's
-- own runs (by each row's run's owner; every row for a login that holds the marker); 0151's flag opening, after its refusal, counts against the lower
-- of the limits it is handed and the site's own sealed row (one variable each, set from the site's reader right before the person's lock); and 0151's
-- flag settlement, the marker's alone now (section 4), still closes or hides only for a connection that presents its reporter's own session or none,
-- never hides for a report staff dismissed, and sends any other to a person. Then F5's billing entries, in step order: 0089's list of the owners
-- billing stops for keeps, in its WHERE, only the rows of an owner it is; 0092's grant of a run and 0123's run state answer as for nothing stored in
-- the guard they had, of the run's scope's owner (0089's and 0091's erasure and age questions and 0092's funding basis, refusals, ask no owner);
-- 0092's pin refuses,
-- as its first statement, a login without the marker; 0107's settlement, right after it finds the admitted call, refuses unless the owner of the call's
-- run is the connection's, before it compares the call's frame, locks or writes; 0123's person's grant answers nothing, right after its clock check,
-- before it locks the person; and 0140's admission, right after it knows the run's owner, refuses unless it is the connection's, before it locks the
-- owner or reads the grant.
-- Then F5's account entries, in step order: 0040's two revocations, 0077's age confirmation, 0079's resend and 0085's event refs ask of the account
-- they locked, in the guard that found it, so another's session revokes, confirms, resends or reserves nothing and answers as for an account with
-- nothing to act on; 0078's consent record asks in its session question, before it inserts; 0085's abandonment asks right after it locks the account,
-- before it expires the intent; 0077's age check, 0078's consent, 0079's settings and 0115's export status ask in their WHERE, of the user id's own
-- account, so they answer as for nothing stored; 0115's download record asks in the question that finds the export, so another's refuses as an
-- invalid link; and 0077's age check record at sign-up, 0095's region and 0125's Italy approval find the account only when this very transaction
-- wrote its row (its xmin), before they insert.
-- F2's: 0123's run writer takes a dig's mark as one more key of its closed document (JSON true or the document is refused, before anything is
-- written) and writes the dig's row right after the run's ownership event, for a run so marked or one that re-admits a dig; 0085's key provision
-- refuses a dig right after its owner and live-content checks, before it writes the link's tombstone and the intent; 0127's review ask refuses a dig
-- right before it consumes the grant and queues the request; 0137's Free reader leaves digs out beside its owner check, 0137's Free claim, which the
-- Free path's prepare and publish both ask first, answers that a dig waits for nothing (so each answers NOT_WAITING before it writes an intent, a
-- snapshot or an event), and 0137's Free notice answers NOT_OWNED for a dig beside its owner check; 0131's per-debate forget, after the links, takes the
-- erased debate's own dig row too, by its own run and never by its parent's, and counts it with the rest.
-- n1: reviewed replaces exact anchors in the live bodies of earlier functions, as 0099 does; each anchor is counted first, and owner, grants, definer and settings are checked unchanged
DO $security_review_patch$
DECLARE
  v_item jsonb; v_patch jsonb; v_target oid; v_before record; v_after record; v_definition text; v_old text; v_found integer;
BEGIN
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements($inventory$[
    {
      "fix": "F4b",
      "signature": "staff.read_public_review(jsonb,text,uuid)",
      "patches": [
        {
          "old": "IF core.public_review_snapshot(p_publication_ref) IS NULL THEN RETURN NULL; END IF;",
          "new": "IF core.public_review_snapshot(p_publication_ref) IS NULL OR NOT core.publication_is_current(p_publication_ref) THEN RETURN NULL; END IF;",
          "count": 1
        }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_web_evidence_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.web_evidence_forget', true) = 'on'", "new": "identity.forget_scope_open('web_evidence')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.forget_erased_debate_web_evidence(uuid)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.web_evidence_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('web_evidence');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.web_evidence_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('web_evidence');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_investigation_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.investigation_forget', true) = 'on'", "new": "identity.forget_scope_open('investigation')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.forget_erased_debate_investigation(uuid)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.investigation_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('investigation');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.investigation_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('investigation');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_dig_model_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.dig_model_forget', true) = 'on'", "new": "identity.forget_scope_open('dig_model')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.forget_erased_debate_dig_model(uuid)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.dig_model_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('dig_model');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.dig_model_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('dig_model');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_dig_pick_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.dig_picks_forget', true) = 'on'", "new": "identity.forget_scope_open('dig_picks')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.forget_erased_debate_dig_picks(uuid)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.dig_picks_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('dig_picks');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.dig_picks_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('dig_picks');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_investigation_report_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.investigation_forget', true) = 'on'", "new": "identity.forget_scope_open('investigation')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_public_debate_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.public_debate_forget', true) = 'on'", "new": "identity.forget_scope_open('public_debate')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.forget_erased_debate_public(uuid)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.public_debate_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('public_debate');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.public_debate_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('public_debate');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_tree_update_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.tree_updates_forget', true) = 'on'", "new": "identity.forget_scope_open('tree_updates')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.forget_erased_debate_tree_updates(uuid)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.tree_updates_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('tree_updates');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.tree_updates_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('tree_updates');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_passage_retention_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.passage_retention_forget', true) = 'on'", "new": "identity.forget_scope_open('passage_retention')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.wipe_debate_passages(uuid,text)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.web_evidence_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('web_evidence');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.passage_retention_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('passage_retention');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.web_evidence_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('web_evidence');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.passage_retention_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('passage_retention');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.forget_erased_debate_passages(uuid)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.passage_retention_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('passage_retention');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.passage_retention_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('passage_retention');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_path_suggestions_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.path_suggestions_forget', true) = 'on'", "new": "identity.forget_scope_open('path_suggestions')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.forget_erased_debate_path_suggestions(uuid)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.path_suggestions_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('path_suggestions');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.path_suggestions_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('path_suggestions');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.guard_public_tree_record()",
      "patches": [
        { "old": "pg_catalog.current_setting('debateai.public_tree_forget', true) = 'on'", "new": "identity.forget_scope_open('public_tree')", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.forget_erased_debate_public_tree(uuid)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.public_tree_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('public_tree');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.public_tree_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('public_tree');", "count": 1 }
      ]
    },
    {
      "fix": "F4a",
      "signature": "identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)",
      "patches": [
        { "old": "PERFORM pg_catalog.set_config('debateai.public_tree_forget', 'on', true);", "new": "PERFORM identity.open_forget_scope('public_tree');", "count": 1 },
        { "old": "PERFORM pg_catalog.set_config('debateai.public_tree_forget', 'off', true);", "new": "PERFORM identity.close_forget_scope('public_tree');", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "core.lock_owned_live_runs(uuid[],uuid,text)",
      "patches": [
        { "old": "    AND core.run_is_owned_by(run.run_id,p_owner_ref,p_legacy_asker_id)\n", "new": "    AND core.run_is_owned_by(run.run_id,p_owner_ref,p_legacy_asker_id)\n    AND (p_owner_ref IS NULL OR identity.request_owner_matches(p_owner_ref))\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "core.list_unstarted_readmissions(uuid)",
      "patches": [
        { "old": "  WHERE marked.readmitted_from_run_id = p_old_run_id\n", "new": "  WHERE marked.readmitted_from_run_id = p_old_run_id\n    AND identity.request_owner_matches((SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_old_run_id ORDER BY event.at_seq DESC LIMIT 1))\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "serve.take_synthesis_check_removal_notice(uuid)",
      "patches": [
        { "old": "WHERE owner_ref=p_owner_ref AND removed_at>clock_timestamp()-interval '90 days'", "new": "WHERE owner_ref=p_owner_ref AND removed_at>clock_timestamp()-interval '90 days' AND identity.request_owner_matches(p_owner_ref)", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "serve.synthesis_check_removal_notice_exists(uuid)",
      "patches": [
        { "old": "WHERE owner_ref=p_owner_ref AND removed_at>clock_timestamp()-interval '90 days'", "new": "WHERE owner_ref=p_owner_ref AND removed_at>clock_timestamp()-interval '90 days' AND identity.request_owner_matches(p_owner_ref)", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean)",
      "patches": [
        { "old": "      AND attempt.answer_id=p_answer_id AND attempt.answer_version=p_answer_version\n  ) THEN\n", "new": "      AND attempt.answer_id=p_answer_id AND attempt.answer_version=p_answer_version\n      AND identity.request_owner_matches((SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1))\n  ) THEN\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "serve.read_publication_review_state(uuid,uuid,uuid)",
      "patches": [
        { "old": " LANGUAGE sql\n", "new": " LANGUAGE plpgsql\n", "count": 1 },
        { "old": "AS $function$\n", "new": "AS $function$\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n  RETURN QUERY\n", "count": 1 },
        { "old": "\n$function$\n", "new": ";\nEND\n$function$\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "serve.publication_review_approved(uuid,uuid,integer)",
      "patches": [
        { "old": "      AND r.synthesis_origin_version=p_origin AND d.outcome='APPROVE'\n", "new": "      AND r.synthesis_origin_version=p_origin AND d.outcome='APPROVE'\n      AND identity.request_owner_matches((SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1))\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.page_memory_run_owned(uuid,uuid)",
      "patches": [
        { "old": "SELECT COALESCE(p_owner_ref IS NOT NULL AND p_run_id IS NOT NULL", "new": "SELECT COALESCE(p_owner_ref IS NOT NULL AND p_run_id IS NOT NULL AND identity.request_owner_matches(p_owner_ref)", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_page_reading_level(uuid)",
      "patches": [
        { "old": "WHERE level.owner_ref = p_owner_ref", "new": "WHERE level.owner_ref = p_owner_ref AND identity.request_owner_matches(p_owner_ref)", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.save_page_reading_level(uuid,text)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_web_researched(uuid,uuid,uuid)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_web_evidence(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT (CASE WHEN pg_catalog.pg_has_role(session_user, 'debateai_data_export_worker', 'MEMBER') THEN identity.web_evidence_run_owner(p_run_id) IS NOT NULL\n    ELSE identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) END) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_investigation_of_run(uuid)",
      "patches": [
        { "old": "WHERE member.run_id = p_run_id", "new": "WHERE member.run_id = p_run_id AND identity.request_owner_matches(member.owner_ref)", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.resume_paused_run(uuid,uuid)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_run_pause(uuid,uuid)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_path_rewrites_of_run(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_web_plan(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_dig_picks_of_run(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_investigation_reports_of_run(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_public_dig_picks(uuid,uuid,jsonb)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_run_purpose_lines(uuid,uuid)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_path_line_of_run(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_main_answer_updates_of_run(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_run_purpose_lines_of_run(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_web_shown_quotes(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_path_suggestions_of_run(uuid)",
      "patches": [
        { "old": "IF identity.web_evidence_run_owner(p_debate_run_id) IS NULL THEN RETURN NULL; END IF;", "new": "IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(p_debate_run_id), p_debate_run_id) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.continue_paused_run_in_release(uuid,uuid,text,bigint)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)",
      "patches": [
        { "old": "  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;\nBEGIN\n", "new": "  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;\n  v_admitted timestamptz;\nBEGIN\n", "count": 1 },
        { "old": "  BEGIN\n    INSERT INTO identity.ask_clarify_charge", "new": "  DELETE FROM identity.ask_clarify_reservation AS reservation WHERE reservation.charge_id = p_charge_id AND reservation.owner_ref = p_owner\n    AND reservation.reserved_at > pg_catalog.clock_timestamp() - interval '1 hour' RETURNING reservation.reserved_at INTO v_admitted;\n  v_admitted := COALESCE(v_admitted, pg_catalog.clock_timestamp());\n  IF NOT EXISTS (SELECT 1 FROM billing.internal_grant AS grant_row WHERE grant_row.grant_id = p_grant AND grant_row.configured_event_id = p_event\n      AND grant_row.owner_ref = p_owner AND grant_row.starts_at <= v_admitted AND grant_row.expires_at > v_admitted\n      AND (grant_row.revoked_at IS NULL OR grant_row.revoked_at > v_admitted)) THEN\n    p_grant := NULL;\n    p_event := NULL;\n  END IF;\n  BEGIN\n    INSERT INTO identity.ask_clarify_charge", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_ask_clarify_spent(uuid,timestamptz,timestamptz)",
      "patches": [
        { "old": " LANGUAGE sql\n", "new": " LANGUAGE plpgsql\n", "count": 1 },
        { "old": "AS $function$\n", "new": "AS $function$\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n  RETURN (\n", "count": 1 },
        { "old": "\n$function$\n", "new": ");\nEND\n$function$\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.open_public_report(uuid,uuid,uuid,boolean)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea)",
      "patches": [
        { "old": "  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;\n", "new": "  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;\n  IF NOT (CASE p_kind WHEN 'DIG' THEN p_material_id = p_run_id AND identity.request_owner_matches(v_owner)\n      WHEN 'REPORT' THEN EXISTS (SELECT 1 FROM identity.public_report AS report WHERE report.report_id = p_material_id AND report.carrier_run_id = p_run_id\n        AND report.publication_ref = p_publication_ref AND report.outcome IS NULL AND identity.request_owner_matches(report.writer_ref))\n      ELSE false END) THEN\n    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH';\n  END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_public_path_line(uuid)",
      "patches": [
        { "old": "    FROM jsonb_array_elements(identity.path_line_json(p_run_id, true)) WITH ORDINALITY AS entry(value, ordinality));", "new": "    FROM jsonb_array_elements(identity.path_line_json(p_run_id, true)) WITH ORDINALITY AS entry(value, ordinality)\n    WHERE identity.request_owner_matches(identity.web_evidence_run_owner((entry.value->>'run_id')::uuid)));", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean)",
      "patches": [
        { "old": " LANGUAGE sql\n", "new": " LANGUAGE plpgsql\n", "count": 1 },
        { "old": "AS $function$\n", "new": "AS $function$\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n  RETURN (\n", "count": 1 },
        { "old": "\n$function$\n", "new": ");\nEND\n$function$\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_own_public_contributions(uuid,uuid)",
      "patches": [
        { "old": "WHERE contribution.owner_ref = p_owner_ref AND p_owner_ref IS NOT NULL", "new": "WHERE contribution.owner_ref = p_owner_ref AND p_owner_ref IS NOT NULL AND identity.request_owner_matches(p_owner_ref)", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.open_public_flag(uuid,uuid,uuid,jsonb,integer,integer,integer)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 },
        { "old": "DECLARE v_held boolean; v_check boolean;\n", "new": "DECLARE v_held boolean; v_check boolean; v_limits jsonb; v_person_hour integer; v_debate_day integer; v_site_day integer;\n", "count": 1 },
        { "old": "  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-flag-person:' || p_owner_ref::text, 0));\n", "new": "  v_limits := identity.public_flag_site_limits();\n  v_person_hour := LEAST(p_person_hour, (v_limits->>'person_hour')::integer);\n  v_debate_day := LEAST(p_debate_day, (v_limits->>'debate_day')::integer);\n  v_site_day := LEAST(p_site_day, (v_limits->>'site_day')::integer);\n  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-flag-person:' || p_owner_ref::text, 0));\n", "count": 1 },
        { "old": ") >= p_person_hour THEN RETURN 'LIMITED'; END IF;", "new": ") >= v_person_hour THEN RETURN 'LIMITED'; END IF;", "count": 1 },
        { "old": ") < p_debate_day\n", "new": ") < v_debate_day\n", "count": 2 },
        { "old": ") < p_site_day;", "new": ") < v_site_day;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)",
      "patches": [
        { "old": "  v_state := CASE p_verdict WHEN 'NOT_FOUND' THEN 'NOT_FOUND' ELSE 'QUEUED' END;", "new": "  v_state := CASE WHEN p_verdict = 'NOT_FOUND' AND identity.request_owner_matches(v.reporter_ref) THEN 'NOT_FOUND' ELSE 'QUEUED' END;", "count": 1 },
        { "old": "  IF p_verdict = 'AGREE' AND identity.read_public_flag_target(v.publication_ref) IS NOT NULL", "new": "  IF p_verdict = 'AGREE' AND v.dismissed_at IS NULL AND identity.request_owner_matches(v.reporter_ref) AND identity.read_public_flag_target(v.publication_ref) IS NOT NULL", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "billing.pending_erasure_owner_refs(uuid,integer)",
      "patches": [
        { "old": "  WHERE (p_after IS NULL OR candidate.owner_ref>p_after)\n", "new": "  WHERE (p_after IS NULL OR candidate.owner_ref>p_after) AND identity.request_owner_matches(candidate.owner_ref)\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "billing.read_internal_allowance_for_run(uuid,timestamptz)",
      "patches": [
        { "old": "IF NOT FOUND OR v_scope.funding_kind='SUBSCRIPTION' THEN RETURN NULL; END IF;", "new": "IF NOT FOUND OR v_scope.funding_kind='SUBSCRIPTION' OR NOT identity.request_owner_matches(v_scope.owner_ref) THEN RETURN NULL; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)",
      "patches": [
        { "old": "\nBEGIN\n", "new": "\nBEGIN\n  IF NOT pg_catalog.pg_has_role(session_user, 'debateai_rls_all_accounts', 'MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)",
      "patches": [
        { "old": " IF NOT FOUND THEN RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_REQUIRED';END IF;\n", "new": " IF NOT FOUND THEN RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_REQUIRED';END IF;\n IF NOT identity.request_owner_matches((SELECT scope.owner_ref FROM billing.run_charge_scope AS scope WHERE scope.run_id=v_call.run_id)) THEN\n  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH';END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "billing.read_internal_run_state(uuid)",
      "patches": [
        { "old": "IF NOT FOUND OR v_scope.funding_kind<>'INTERNAL' THEN RETURN 'UNAVAILABLE';END IF;", "new": "IF NOT FOUND OR v_scope.funding_kind<>'INTERNAL' OR NOT identity.request_owner_matches(v_scope.owner_ref) THEN RETURN 'UNAVAILABLE';END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "billing.read_internal_allowance(uuid,timestamptz)",
      "patches": [
        { "old": "  IF p_now IS NULL OR NOT isfinite(p_now) THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TIME_INVALID'; END IF;\n", "new": "  IF p_now IS NULL OR NOT isfinite(p_now) THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TIME_INVALID'; END IF;\n  IF NOT identity.request_owner_matches(p_owner) THEN RETURN NULL; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)",
      "patches": [
        { "old": " IF v_owner IS NULL THEN SELECT owner_ref INTO v_owner FROM core.run_ownership_event WHERE run_id=p_run ORDER BY at_seq DESC LIMIT 1;END IF;\n", "new": " IF v_owner IS NULL THEN SELECT owner_ref INTO v_owner FROM core.run_ownership_event WHERE run_id=p_run ORDER BY at_seq DESC LIMIT 1;END IF;\n IF NOT identity.request_owner_matches(v_owner) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH';END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.revoke_session_with_audit(uuid,uuid,timestamptz,jsonb)",
      "patches": [
        { "old": "  IF v_audit_token IS NOT NULL THEN\n", "new": "  IF v_audit_token IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.revoke_all_sessions_with_audit(uuid,uuid,timestamptz,jsonb)",
      "patches": [
        { "old": "  IF v_audit_token IS NOT NULL THEN\n", "new": "  IF v_audit_token IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_age_check_outcome(uuid)",
      "patches": [
        { "old": "WHERE age.user_id=p_user_id)", "new": "WHERE age.user_id=p_user_id\n    AND identity.request_owner_matches((SELECT account.owner_ref FROM identity.\"user\" AS account WHERE account.user_id=p_user_id)))", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.confirm_account_age_with_audit(uuid,uuid,boolean,smallint,text,text,timestamptz,jsonb)",
      "patches": [
        { "old": "  IF v_account.audit_token IS NOT NULL THEN\n", "new": "  IF v_account.audit_token IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_registration_age_check(uuid,smallint,text,text,timestamptz)",
      "patches": [
        { "old": "    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'\n", "new": "    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'\n      AND identity_user.xmin=pg_catalog.pg_current_xact_id()::xid\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_sensitive_data_consent(uuid)",
      "patches": [
        { "old": "FROM identity.sensitive_data_consent AS consent WHERE consent.user_id=p_user_id)", "new": "FROM identity.sensitive_data_consent AS consent WHERE consent.user_id=p_user_id\n    AND identity.request_owner_matches((SELECT account.owner_ref FROM identity.\"user\" AS account WHERE account.user_id=p_user_id)))", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_sensitive_data_consent(uuid,uuid,text,text,timestamptz)",
      "patches": [
        { "old": "      AND identity_user.state='active'\n", "new": "      AND identity_user.state='active' AND identity.request_owner_matches(identity_user.owner_ref)\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_email_settings(uuid,uuid)",
      "patches": [
        { "old": "  WHERE account.user_id=p_user_id AND account.state='active'\n", "new": "  WHERE account.user_id=p_user_id AND account.state='active' AND identity.request_owner_matches(account.owner_ref)\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.resend_email_change_with_audit(uuid,uuid,text,timestamptz,bigint,jsonb)",
      "patches": [
        { "old": "  IF v_account.audit_token IS NOT NULL THEN\n", "new": "  IF v_account.audit_token IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.reserve_publication_event_refs(uuid,uuid,uuid,text,text)",
      "patches": [
        { "old": "  IF v_account.audit_token IS NULL THEN RETURN; END IF;\n", "new": "  IF v_account.audit_token IS NULL OR NOT identity.request_owner_matches(v_account.owner_ref) THEN RETURN; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "serve.abandon_publication_key_provision(uuid,uuid)",
      "patches": [
        { "old": "  IF v_account.owner_ref IS NULL THEN RETURN false; END IF;\n", "new": "  IF v_account.owner_ref IS NULL OR NOT identity.request_owner_matches(v_account.owner_ref) THEN RETURN false; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_registration_region(uuid,text,text)",
      "patches": [
        { "old": "    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'\n", "new": "    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'\n      AND identity_user.xmin=pg_catalog.pg_current_xact_id()::xid\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.read_data_export_status(uuid)",
      "patches": [
        { "old": "    WHERE e.user_id=p_user_id AND ((e.status IN", "new": "    WHERE e.user_id=p_user_id AND identity.request_owner_matches((SELECT account.owner_ref FROM identity.\"user\" AS account WHERE account.user_id=p_user_id))\n      AND ((e.status IN", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_data_export_download(uuid,uuid,jsonb)",
      "patches": [
        { "old": " AND e.status='SENT' AND e.expires_at>clock_timestamp();\n", "new": " AND e.status='SENT' AND e.expires_at>clock_timestamp()\n      AND identity.request_owner_matches(u.owner_ref);\n", "count": 1 }
      ]
    },
    {
      "fix": "F5",
      "signature": "identity.record_signup_italy_approval(uuid,jsonb)",
      "patches": [
        { "old": "  WHERE identity_user.user_id = p_user_id AND identity_user.state IN ('pending_verification','pending_mfa');\n", "new": "  WHERE identity_user.user_id = p_user_id AND identity_user.state IN ('pending_verification','pending_mfa')\n    AND identity_user.xmin = pg_catalog.pg_current_xact_id()::xid;\n", "count": 1 }
      ]
    },
    {
      "fix": "F2",
      "signature": "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)",
      "patches": [
        { "old": "'contentAttestationSecret','releaseKey'\n  ]::text[]", "new": "'contentAttestationSecret','releaseKey','digRun'\n  ]::text[]", "count": 1 },
        { "old": "    OR jsonb_array_length(p_battery_rows)>100 THEN\n", "new": "    OR jsonb_array_length(p_battery_rows)>100\n    OR (p_run ? 'digRun' AND p_run->'digRun' IS DISTINCT FROM 'true'::jsonb) THEN\n", "count": 1 },
        { "old": "  PERFORM core.append_run_ownership_event(v_run_id,p_owner_ref);\n", "new": "  PERFORM core.append_run_ownership_event(v_run_id,p_owner_ref);\n  IF p_run->'digRun' = 'true'::jsonb OR identity.run_is_dig((SELECT marked.readmitted_from_run_id FROM core.run_key_provision_intent AS marked\n      WHERE marked.run_id = v_run_id)) THEN\n    INSERT INTO identity.dig_run (run_id, owner_ref) VALUES (v_run_id, p_owner_ref) ON CONFLICT (run_id) DO NOTHING;\n  END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F2",
      "signature": "serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text)",
      "patches": [
        { "old": "OR NOT core.run_private_content_is_live(p_run_id) THEN\n    RETURN false;\n  END IF;\n", "new": "OR NOT core.run_private_content_is_live(p_run_id) THEN\n    RETURN false;\n  END IF;\n  IF identity.run_is_dig(p_run_id) THEN RETURN false; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F2",
      "signature": "serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)",
      "patches": [
        { "old": "  IF v_requests>=2 THEN RETURN 'NOT_ALLOWED'; END IF;\n", "new": "  IF v_requests>=2 THEN RETURN 'NOT_ALLOWED'; END IF;\n  IF identity.run_is_dig(p_run_id) THEN RETURN 'NOT_ALLOWED'; END IF;\n", "count": 1 }
      ]
    },
    {
      "fix": "F2",
      "signature": "identity.read_free_debates_to_publish(integer)",
      "patches": [
        { "old": "AND identity.web_evidence_run_owner(ask.run_id) IS NOT DISTINCT FROM ask.owner_ref", "new": "AND identity.web_evidence_run_owner(ask.run_id) IS NOT DISTINCT FROM ask.owner_ref AND NOT identity.run_is_dig(ask.run_id)", "count": 1 }
      ]
    },
    {
      "fix": "F2",
      "signature": "identity.claim_free_public_ask(uuid)",
      "patches": [
        { "old": "IF NOT FOUND OR v_ask.outcome IS NOT NULL OR", "new": "IF NOT FOUND OR v_ask.outcome IS NOT NULL OR identity.run_is_dig(p_run_id) OR", "count": 1 }
      ]
    },
    {
      "fix": "F2",
      "signature": "identity.record_free_public_ask(uuid,uuid)",
      "patches": [
        { "old": "IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN RETURN 'NOT_OWNED'; END IF;", "new": "IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) OR identity.run_is_dig(p_run_id) THEN RETURN 'NOT_OWNED'; END IF;", "count": 1 }
      ]
    },
    {
      "fix": "F2",
      "signature": "identity.forget_erased_debate_page_memory(uuid)",
      "patches": [
        { "old": "  v_links integer;\nBEGIN\n", "new": "  v_links integer;\n  v_marks integer;\nBEGIN\n", "count": 1 },
        { "old": "  RETURN v_visits + v_links;\n", "new": "  DELETE FROM identity.dig_run AS mark WHERE mark.run_id = p_run_id;\n  GET DIAGNOSTICS v_marks = ROW_COUNT;\n  RETURN v_visits + v_links + v_marks;\n", "count": 1 }
      ]
    }
  ]$inventory$::jsonb) LOOP
    v_target := pg_catalog.to_regprocedure(v_item->>'signature');
    IF v_target IS NULL THEN RAISE EXCEPTION 'SECURITY_REVIEW_0171_PATCH_MISSING %', v_item->>'signature'; END IF;
    SELECT p.proowner, p.proacl, p.prosecdef, p.proconfig, p.provolatile INTO v_before FROM pg_catalog.pg_proc AS p WHERE p.oid = v_target;
    v_definition := pg_catalog.pg_get_functiondef(v_target);
    FOR v_patch IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item->'patches') LOOP
      v_old := v_patch->>'old';
      v_found := (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))) / pg_catalog.length(v_old);
      IF v_found <> (v_patch->>'count')::integer OR pg_catalog.strpos(v_definition, v_patch->>'new') > 0 THEN
        RAISE EXCEPTION 'SECURITY_REVIEW_0171_PATCH_ANCHOR % (%): found % times', v_item->>'signature', v_item->>'fix', v_found;
      END IF;
      v_definition := pg_catalog.replace(v_definition, v_old, v_patch->>'new');
    END LOOP;
    EXECUTE v_definition;
    SELECT p.proowner, p.proacl, p.prosecdef, p.proconfig, p.provolatile INTO v_after FROM pg_catalog.pg_proc AS p WHERE p.oid = v_target;
    IF pg_catalog.to_regprocedure(v_item->>'signature') IS DISTINCT FROM v_target OR v_before IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_PATCH_AUTHORITY % (%)', v_item->>'signature', v_item->>'fix';
    END IF;
  END LOOP;
END
$security_review_patch$;

-- 4. Grants taken back, and grants moved -------------------------------------------------------------------------------------------------
-- F3: the legacy public join. No code calls it (packages/db no longer offers it); 0147's join_public_tree is the one public join.
REVOKE EXECUTE ON FUNCTION identity.join_public_investigation(uuid,uuid,uuid,text[],text,text) FROM debateai_billing_runtime;
-- F5: what no code calls any more, each replaced by a later function (0133's join by 0134's nested one, its closing by 0139's, its wipe by 0143's), read
-- through the no-owner readers the runner and the answer read use instead, or never called outside the tests; 0133's mark of a closing's report is
-- made only by 0136's report writer, as its owner; and 0128's two keepers of a threat report, which no product code calls (nothing keeps a report
-- yet) and which let any runtime login file a report naming any account, or none, and alert staff. Taken back from the one role each was granted to;
-- packages/db no longer offers them.
REVOKE EXECUTE ON FUNCTION identity.join_investigation(uuid,uuid,uuid,text[],text) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.close_investigation(uuid,uuid) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.read_investigation(uuid,uuid) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.read_reserve(uuid) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION identity.wipe_inactive_web_page_text(integer) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION identity.read_investigation_dig_levels(uuid,uuid) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.read_path_rewrites(uuid,uuid) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.read_paused_runs(uuid) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.read_public_report_spent(uuid,timestamptz,timestamptz) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION identity.read_path_line(uuid,uuid) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.read_main_answer_updates(uuid,uuid) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.close_public_investigation(uuid,uuid) FROM debateai_billing_runtime;
REVOKE EXECUTE ON FUNCTION identity.reopen_public_investigation(uuid,integer) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION identity.record_investigation_report(uuid,integer,uuid) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION staff.keep_threat_report(text,uuid) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION staff.keep_threat_report_with_email(text,uuid,text) FROM debateai_runtime;
-- F5: and the older ones no product code calls: 0046's reader of an open recovery's sign-in risk signals (gated by the recovery's handle, which never
-- leaves the API; nothing reads them), 0140's (0144's body) sum of every team-funded charge in any window, which only staff's own month reader asks,
-- as its owner, and 0085's first staff ceremonies, which 0086's owned ceremony replaced: the invitation's, the owner's possession and the key's
-- registration challenges, and the invitation's proof and the owner's possession receipt, which 0094's owned assertion completes as their owner.
-- Taken back from debateai_runtime, the one role each was granted to; packages/db no longer offers them.
REVOKE EXECUTE ON FUNCTION identity.read_authentication_risk_signals_for_recovery(uuid) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION staff.read_team_internal_spent(timestamptz,timestamptz) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION staff.begin_invitation_challenge(uuid,uuid,text,text,text) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION staff.begin_owner_possession_challenge(uuid,uuid,uuid,text,text,text,text) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION staff.begin_registration_challenge(uuid,uuid,text,text) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION staff.complete_invitation_proof(uuid,uuid,uuid,text,bigint,text,text) FROM debateai_runtime;
REVOKE EXECUTE ON FUNCTION staff.complete_owner_possession(uuid,uuid,uuid,text,bigint,text,text) FROM debateai_runtime;
-- F5: and 0085's record of a verification mail's delivery, which took any account's user id and wrote its delivery state and an audit event in its
-- name: the API records each delivery through the overload of section 1, which names the mail's own token. This one stays, no role's.
REVOKE EXECUTE ON FUNCTION identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb) FROM debateai_runtime;
-- F5: and 0085's question whether an account is held or gone, one bit of any user id, from debateai_runtime alone. The authorization runtime keeps its
-- grant: the sign-in step-up asks it of the user row the session's own login reads under 0130's row rule. The definers that ask it of another account
-- are its own owner's or hold their own grant. Nothing on the API's request pool, the runner or the scheduler calls it.
REVOKE EXECUTE ON FUNCTION identity.read_account_security_hold(uuid) FROM debateai_runtime;
-- F5: what only the runner (its web steps, replay, public tree and reports) or the API's sweeps outside any request (the public page, the Free debates'
-- publication, the review purge) call: from debateai_runtime, which the API's request login holds through debateai_billing_runtime (0093), to 0130's
-- marker, which the API's system logins, the runner and the scheduler hold and no request login may (the API's boot attestation refuses one that does).
REVOKE EXECUTE ON FUNCTION identity.read_web_page_texts(uuid,uuid[]) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_web_page_texts(uuid,uuid[]) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_free_debates_to_publish(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_free_debates_to_publish(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_web_reply_texts(uuid,uuid[]) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_web_reply_texts(uuid,uuid[]) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_material(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_material(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_dig_input(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_dig_input(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_answer_updates(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_answer_updates(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_reports_unwritten(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_reports_unwritten(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_checks_passed(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_checks_passed(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_page_owed(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_page_owed(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_reports_owed(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_reports_owed(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_free_debate_owner(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_free_debate_owner(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.delete_public_flag_words_due() FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.delete_public_flag_words_due() TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_review_purge_due(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_review_purge_due(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text) TO debateai_rls_all_accounts;
-- F5: and the sweeps' own steps, with no owner either, on any account's rows: their listers (the runner's rewrites owed, closings to report, debates
-- holding passages, researched pages waiting, public digs unsettled and climbs owed), their settlements, wipes and marks (a public dig's check, a page
-- added to researched, a Free debate's publication or refusal, a debate's passages and idle page texts, a public climb, a dig's tree), and the public
-- page's writers of the API's sweep (its copies, skips and reports). No request path calls any; the runner and the API's sweeps keep them through the
-- marker.
REVOKE EXECUTE ON FUNCTION identity.settle_web_researched(uuid,uuid,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.settle_web_researched(uuid,uuid,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_unwritten_path_rewrites(timestamptz,integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_unwritten_path_rewrites(timestamptz,integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_unreported_closings(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_unreported_closings(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.settle_public_contribution(uuid,text,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.settle_public_contribution(uuid,text,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION core.prepare_free_publication(uuid,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION core.prepare_free_publication(uuid,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.refuse_free_publication(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.refuse_free_publication(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_debates_holding_passages(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_debates_holding_passages(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.wipe_debate_passages(uuid,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.wipe_debate_passages(uuid,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.wipe_inactive_web_page_text_of_idle_debates(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.wipe_inactive_web_page_text_of_idle_debates(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_unsettled_web_researched(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_unsettled_web_researched(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_digs_unsettled(timestamptz,integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_digs_unsettled(timestamptz,integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_climbs_owed(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_climbs_owed(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.mark_public_climb_done(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.mark_public_climb_done(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_check_passed(uuid,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_check_passed(uuid,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_page_skip(uuid,uuid,text,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_page_skip(uuid,uuid,text,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_debate_report(uuid,integer,uuid,jsonb) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_debate_report(uuid,integer,uuid,jsonb) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.mark_dig_tree_settled(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.mark_dig_tree_settled(uuid) TO debateai_rls_all_accounts;
-- F5: and the runner's own steps of one debate, which take only its run, turn or report and ask nothing of the connection: its web evidence (0132's
-- searches, pages, readings, extracts, picks and packs, 0134's plan, 0139's shown quotes and reply texts), its dig level, rewrite turns, rewrites and
-- their material (0134, 0135), its path suggestions (0141), its climbs' turns and records (0138), its month pause and the pause's read (0134), 0143's
-- question whether its work is parked, its closing's wait, report version and spend window (0136), and a public dig's contribution, input, turns,
-- copies, report and the report's spend window (0137, 0147). The API calls five of them, only ever on its system login: the waker's list of stalled
-- starts asks the pause (packages/battery), the ask room's count of open work, on its decision pool, asks whether work is parked, the public page's
-- sweep reads a dig's next climb (0147) and records a report's check (0149), and the estimate's X21 read asks whether a dig is settled (0153). No
-- request path calls any.
REVOKE EXECUTE ON FUNCTION identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_web_picks(uuid,text,uuid[]) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_picks(uuid,text,uuid[]) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_dig_level_of_run(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_dig_level_of_run(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.take_path_rewrite_turn(uuid,uuid,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.take_path_rewrite_turn(uuid,uuid,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_path_rewrite_turn(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_path_rewrite_turn(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_run_pause_of_run(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_run_pause_of_run(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_investigation_waiting_of_run(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_investigation_waiting_of_run(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_closing_since_of_root(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_closing_since_of_root(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_contribution_of_run(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_contribution_of_run(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_path_update_turn(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_path_update_turn(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_path_climb_next(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_path_climb_next(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_web_shown_quote(uuid,uuid,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_shown_quote(uuid,uuid,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_web_reply_text(uuid,uuid,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_reply_text(uuid,uuid,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.run_work_is_parked(uuid,text,timestamptz) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.run_work_is_parked(uuid,text,timestamptz) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_dig_input(uuid,text,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_dig_input(uuid,text,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_climb_next(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_climb_next(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_public_report_charged_until(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_report_charged_until(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.dig_is_settled(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.dig_is_settled(uuid) TO debateai_rls_all_accounts;
-- F5: and the engine's older steps of one debate that only the runner or the API's system login calls, which take a run or an attempt and ask nothing
-- of the connection: 0120's recorded facts of a debate (its counts, register version and settled battery rows), which the runner's terminal
-- activation reads (packages/battery); 0040's evaluator call check, which the runner's provider gateway asks before an evaluator call (the evaluator
-- worker keeps its own grant of 0040, and 0040's ledger scope question asks it as its owner, so each login that asks that question still may); and
-- 0126's synthesis check inheritance writer, which the API's check worker calls only from its gated timer, on its system login. No request path calls
-- any.
REVOKE EXECUTE ON FUNCTION core.read_terminal_recorded_facts(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_terminal_recorded_facts(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION evaluator.provider_call_request_is_authorized(uuid,text,text,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION evaluator.provider_call_request_is_authorized(uuid,text,text,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid) TO debateai_rls_all_accounts;
-- F5: and staff's notice and alert loops, which name no run, owner or flag and take any pending row: 0128's threat report alerts (the account of
-- the staff holder each goes to, the erasure of the reports due, the claim and the completion), and the claim, the completion and the recipient of
-- 0142's team limit notices, 0146's allowance notices, 0150's public review notices and 0151's flag notices. A request login with no session could
-- claim every pending one and complete it as delivered, so none was sent. The API calls them only from its gated timers (the notice loop of
-- apps/api/src/staff/team-limit.ts, the threat report alerts and their hourly erasure), outside any request, where its pool routes every statement
-- to its system login. 0128's hold of an erasing account's address stays as it was: account erasure calls it, and it acts only for an erasure
-- prepared and not yet committed.
REVOKE EXECUTE ON FUNCTION staff.threat_report_recipient_user(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.threat_report_recipient_user(uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.erase_due_threat_reports() FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.erase_due_threat_reports() TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.claim_threat_report_alerts(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.claim_threat_report_alerts(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.complete_threat_report_alert(uuid,uuid,boolean) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_threat_report_alert(uuid,uuid,boolean) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.claim_team_limit_notices(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.claim_team_limit_notices(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.complete_team_limit_notice(uuid,uuid,boolean) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_team_limit_notice(uuid,uuid,boolean) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.team_limit_notice_user(uuid,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.team_limit_notice_user(uuid,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.claim_allowance_notices(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.claim_allowance_notices(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.complete_allowance_notice(uuid,uuid,boolean) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_allowance_notice(uuid,uuid,boolean) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.allowance_notice_user(uuid,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.allowance_notice_user(uuid,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.claim_public_review_notices(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.claim_public_review_notices(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.complete_public_review_notice(uuid,uuid,boolean) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_public_review_notice(uuid,uuid,boolean) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.public_review_notice_user(uuid,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.public_review_notice_user(uuid,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.claim_public_flag_notices(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.claim_public_flag_notices(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.complete_public_flag_notice(uuid,uuid,boolean) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_public_flag_notice(uuid,uuid,boolean) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.public_flag_notice_user(uuid,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.public_flag_notice_user(uuid,uuid) TO debateai_rls_all_accounts;
-- F5: and 0088's staff alert outbox, which the staff runtime's dispatcher drains from its own gated timer, outside any request, where the API's pool
-- routes it to its system login: its claim (0112 pinned its settings), the claim's key mapping, its settlement and the queue's status, and 0090's
-- reader of an invitee's channel, which needs a live claim's token. A request login with no session could claim every pending independent alert, with
-- its key user's audit token, settle it DELIVERED on a forged receipt, so the receiver never heard of the staff change, and read the invitee's sealed
-- address. 0112's release of a claim stays debateai_runtime's: 0112's verifier requires that grant, and it gives back only a live claim, which only
-- the claim hands out (section 5 checks both).
REVOKE EXECUTE ON FUNCTION staff.claim_alert_delivery(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.claim_alert_delivery(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.read_alert_key_mapping(uuid,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_alert_key_mapping(uuid,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.settle_alert_delivery(uuid,uuid,text,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.settle_alert_delivery(uuid,uuid,text,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.read_alert_delivery_status() FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_alert_delivery_status() TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.read_target_invitation_channel(uuid,uuid,uuid,uuid,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_target_invitation_channel(uuid,uuid,uuid,uuid,uuid) TO debateai_rls_all_accounts;
-- F5: and 0100's consumer security notice loop, a person's own takeover warnings (a method changed, codes regenerated, a recovery proved or completed,
-- a recovery code used): its claim, read, acknowledgement and failure, which only the API's erasure reconciler calls, from its gated timer, on the
-- authorization pool, which routes it outside any request to its system login. They were debateai_authorization_runtime's, so the authorization
-- request login with no session could claim any person's pending warning and acknowledge it unsent. The marker's other holders (the API's system
-- login, the runner, the scheduler's liveness login) call none of them; read, acknowledgement and failure need the claim's token besides.
REVOKE EXECUTE ON FUNCTION identity.claim_consumer_security_notices(integer) FROM debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.claim_consumer_security_notices(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_consumer_security_notice(uuid,uuid) FROM debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.read_consumer_security_notice(uuid,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.ack_consumer_security_notice(uuid,uuid) FROM debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.ack_consumer_security_notice(uuid,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.fail_consumer_security_notice(uuid,uuid,text) FROM debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.fail_consumer_security_notice(uuid,uuid,text) TO debateai_rls_all_accounts;
-- F5: and the retention purges of rows already due, which the API runs only from its gated timers, on its system login: 0046's sign-in risk signals,
-- 0126's removal notices and 0080's legal acceptance records (0094 made that one the API billing role's alone; 0130's verifier names no legal
-- function). Each takes only what is due (0080's clamps the time it is handed to now), so a request could only run it early; now it cannot run it.
-- The marker's other holders hold no right on the legal schema, so only the API's system login, which also holds the billing role, can name 0080's.
REVOKE EXECUTE ON FUNCTION identity.purge_expired_authentication_risk_signals(integer) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.purge_expired_authentication_risk_signals(integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION serve.purge_expired_synthesis_check_removal_notices() FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION serve.purge_expired_synthesis_check_removal_notices() TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION legal.purge_expired_acceptance(timestamptz) FROM debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION legal.purge_expired_acceptance(timestamptz) TO debateai_rls_all_accounts;
-- F5: and 0151's settlement of a flag, which records the judge's verdict and hides a public debate on AGREE, and believed the verdict of whoever called
-- it, so a request login with its own session settled its own flag AGREE and hid another account's debate. Its one caller is the API's press, after
-- the judge, inside the reporter's request, on its system login (apps/api/src/main.ts, the cross-account site X38); the reporter is the one the
-- opening named under that session, and a settlement never changes it.
REVOKE EXECUTE ON FUNCTION identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric) TO debateai_rls_all_accounts;
-- F5: and the staff ceremonies and staff changes the API calls only through its staff repository, which every staff route reaches on its system login
-- (apps/api/src/main.ts, the cross-account site X14): 0085's grant of a capability, an invitee's acceptance and the check of a staff context's
-- capability (0142's body), 0086's owned key ceremony (its start, 0142's body; its challenge read, failure and registration; its assertion, 0094's
-- body; the staff key reader) and 0088's mapping of a user to the audit token an alert is sealed for, which the alert intent of a staff change
-- asks inside the staff member's request, now through the same site. Each takes ids, a staff context or a ceremony handle and none asks the
-- session, so a request login could start any person's key ceremony, read any active account's audit token, and ask any staff context's capability.
REVOKE EXECUTE ON FUNCTION staff."grant"(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff."grant"(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.authorize_action(jsonb,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.authorize_action(jsonb,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.fail_owned_webauthn(uuid,uuid,uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.fail_owned_webauthn(uuid,uuid,uuid) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION staff.read_alert_user_mapping(uuid) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_alert_user_mapping(uuid) TO debateai_rls_all_accounts;
-- F5: and the site's day of spend, which only the system writes now. The three ledger writers that name no debate, 0118's language check, 0128's
-- question check and 0144's clarify charge (its ledger row, then its person's), took any caller of debateai_runtime and any amount, so a request
-- login with no session could fill today or tomorrow with one row and stop every paid call on the site until that day ended. The API calls each
-- only through its site (apps/api/src/main.ts: X30, X31 and X32), its system login, inside the request that paid for the call, and probes each
-- there; the clarify charge's reservation, which names the person while the session is live, stays the request's (section 2), and the API makes
-- no call it could not reserve.
REVOKE EXECUTE ON FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint) TO debateai_rls_all_accounts;
-- F5: and the sign-in and recovery steps that hand out what proves a person, or open a session or a recovery on the API's word, before any session:
-- 0098's reader of a passkey's stored credential and its sign-in completion (0099's body), 0100's reader of a recovery's stored proof and its proof
-- (0112's body), and 0040's use of a saved recovery code (0112's body). A request login begins its own challenge or recovery with a token of its
-- choosing, and the API checks the passkey's signature and the code's argon2 hash, so no secret the database is handed gates them: the authorization
-- request login with no session read any passkey's credential and any recovery's proof, completed a sign-in or a recovery as any account, and the API
-- login marked any account's code used. The API calls each only through its repositories, inside the request, on its pool's system login
-- (packages/db, the cross-account site X36). 0112's verifier pins their settings and owners, which stay; the authorization pool's system login and
-- the API's hold the marker, the request logins do not.
REVOKE EXECUTE ON FUNCTION identity.read_consumer_passkey_credential(text,text,text) FROM debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.read_consumer_passkey_credential(text,text,text) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.complete_consumer_passkey_login(jsonb,jsonb) FROM debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.complete_consumer_passkey_login(jsonb,jsonb) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.read_consumer_recovery_proof(text,integer) FROM debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.read_consumer_recovery_proof(text,integer) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.prove_consumer_recovery(jsonb,jsonb) FROM debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.prove_consumer_recovery(jsonb,jsonb) TO debateai_rls_all_accounts;
REVOKE EXECUTE ON FUNCTION identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb) TO debateai_rls_all_accounts;
-- F5: and 0048's record of a provider's probe, which took any caller of debateai_runtime and any date, though the API's ask-time discovery takes a
-- provider's latest row (0040's latest_provider_probes) for healthy while it is fresh: a request login with no session kept a provider on the panel
-- unprobed with a HEALTHY row dated now, or made every ask probe it again with one dated later. The API records each probe its discovery makes,
-- inside the asking request, on its pool's system login (apps/api/src/main.ts, the cross-account site X37), and reads the latest on the request
-- login, as 0040's reader stays debateai_runtime's; the runner records its claim-time probes on its own login, which holds the marker. No verifier
-- names it, and no step's postcondition digests it (this one does).
REVOKE EXECUTE ON FUNCTION core.record_provider_probe(uuid,text,text,text,text,text,timestamptz) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION core.record_provider_probe(uuid,text,text,text,text,text,timestamptz) TO debateai_rls_all_accounts;
-- F5: and the day's own tables, which a request login could write directly: 0066's ledger.model_spend (a charge of any size on a debate of the
-- session's own, as 0130's rule allows), 0083's holds and 0066's day reservations (which row security never covered, so any day, for ever). Their
-- writers in a request are the system login's already: the room's hold on its decision pool, the daily guard's reservation inside its X23 frame,
-- and the synthesis check's charge through its site (X33); the runner, the scheduler and the waker hold the marker. Every login that holds
-- debateai_runtime still reads them, as row security allows, and the definers that write them do so as their owners.
REVOKE INSERT ON ledger.model_spend FROM debateai_runtime;
GRANT INSERT ON ledger.model_spend TO debateai_rls_all_accounts;
REVOKE INSERT ON ledger.model_spend_hold FROM debateai_runtime;
GRANT INSERT ON ledger.model_spend_hold TO debateai_rls_all_accounts;
REVOKE INSERT ON ledger.model_spend_reservation FROM debateai_runtime;
GRANT INSERT ON ledger.model_spend_reservation TO debateai_rls_all_accounts;
-- F5: and 0000's sequence counter, the one row every event's position is drawn from, which debateai_runtime could UPDATE with no row security: a
-- request login set it back, and every event the site appended next collided with one already written. 0000's ledger.allocate_sequence() becomes
-- a definer of its owner, the table's owner, with 0056's search path, so every login that may call it still draws from it and none that holds
-- debateai_runtime may set the row itself (0000's INSERT stays: the one row's key, true and checked so, admits no other). core.work_item, granted UPDATE on the same line of 0000, stays: 0130's row security holds it to the
-- connection's own debates, and the enqueue's ON CONFLICT needs it (section 5 checks both).
ALTER FUNCTION ledger.allocate_sequence() SECURITY DEFINER;
REVOKE UPDATE ON ledger.sequence_allocator FROM debateai_runtime;

-- 5. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed --------------------------------------------------------------------
-- One list per promise of the sections above, each row naming its fix, then each fix's own checks under its letter.
DO $security_review_contract$
DECLARE
  v_core name; v_owner name; v_writer name; v_delivery name; v_counter_owner name; v_item record; v_role text; v_grantees text[]; v_definition text;
  v_proowner oid;
  v_published bigint;
  -- The six roles every 0131-to-0153 step refuses by name, beside PUBLIC: the request-facing roles are all here.
  v_roles text[] := ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime','debateai_erasure_runtime','debateai_replay','debateai_data_export_worker'];
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_core FROM pg_catalog.pg_proc AS p WHERE p.oid = 'core.run_is_published(uuid,uuid)'::regprocedure;
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_writer FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)'::regprocedure;
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_delivery FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb)'::regprocedure;

  -- Sections 1 and 2: every function this step adds is a definer pinned to pg_catalog, owned as its schema's objects are, and callable by exactly the roles named.
  FOR v_item IN SELECT * FROM (VALUES
      ('F4b', 'core.publication_is_current(uuid)', v_core, ARRAY['debateai_staff_security_owner']),
      ('F4a', 'identity.open_forget_scope(text)', v_owner, ARRAY[]::text[]),
      ('F4a', 'identity.close_forget_scope(text)', v_owner, ARRAY[]::text[]),
      ('F4a', 'identity.forget_scope_open(text)', v_owner, ARRAY[]::text[]),
      ('F5', 'identity.request_owner_matches(uuid)', v_owner, ARRAY['debateai_staff_security_owner']),
      ('F5', 'identity.reserve_ask_clarify_charge(uuid,uuid)', v_writer, ARRAY['debateai_runtime']),
      ('F2', 'identity.run_is_dig(uuid)', v_owner, ARRAY[]::text[]),
      ('F2', 'identity.read_run_is_dig(uuid,uuid)', v_owner, ARRAY['debateai_billing_runtime']),
      ('F5', 'identity.delete_ask_clarify_reservations_due(integer)', v_writer, ARRAY['debateai_rls_all_accounts']),
      ('F5', 'identity.public_flag_site_limits()', v_owner, ARRAY[]::text[]),
      ('F5', 'identity.record_verification_delivery_with_audit(uuid,text,timestamptz,boolean,text,jsonb)', v_delivery, ARRAY['debateai_runtime'])
    ) AS added(fix, signature, owner, grantees) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_item.signature)
        AND p.prosecdef AND p.proconfig = ARRAY['search_path=pg_catalog'] AND pg_catalog.pg_get_userbyid(p.proowner) = v_item.owner) THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT % definer %', v_item.fix, v_item.signature;
    END IF;
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT COALESCE(pg_catalog.pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC')::text), '{}') INTO v_grantees
    FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
    WHERE p.oid = pg_catalog.to_regprocedure(v_item.signature) AND a.grantee <> p.proowner;
    IF NOT (v_grantees @> v_item.grantees AND v_grantees <@ v_item.grantees) THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT % grants % %', v_item.fix, v_item.signature, v_grantees;
    END IF;
  END LOOP;

  -- Section 4: what no request role, and not PUBLIC, may call any more.
  FOR v_item IN SELECT * FROM (VALUES
      ('F3', 'identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)'),
      ('F5', 'identity.join_investigation(uuid,uuid,uuid,text[],text)'),
      ('F5', 'identity.close_investigation(uuid,uuid)'),
      ('F5', 'identity.read_investigation(uuid,uuid)'),
      ('F5', 'identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)'),
      ('F5', 'identity.read_reserve(uuid)'),
      ('F5', 'identity.wipe_inactive_web_page_text(integer)'),
      ('F5', 'identity.read_investigation_dig_levels(uuid,uuid)'),
      ('F5', 'identity.read_path_rewrites(uuid,uuid)'),
      ('F5', 'identity.read_paused_runs(uuid)'),
      ('F5', 'identity.read_public_report_spent(uuid,timestamptz,timestamptz)'),
      ('F5', 'identity.read_path_line(uuid,uuid)'),
      ('F5', 'identity.read_main_answer_updates(uuid,uuid)'),
      ('F5', 'identity.close_public_investigation(uuid,uuid)'),
      ('F5', 'identity.reopen_public_investigation(uuid,integer)'),
      ('F5', 'identity.record_investigation_report(uuid,integer,uuid)'),
      ('F5', 'staff.keep_threat_report(text,uuid)'),
      ('F5', 'staff.keep_threat_report_with_email(text,uuid,text)'),
      ('F5', 'identity.read_authentication_risk_signals_for_recovery(uuid)'),
      ('F5', 'staff.read_team_internal_spent(timestamptz,timestamptz)'),
      ('F5', 'staff.begin_invitation_challenge(uuid,uuid,text,text,text)'),
      ('F5', 'staff.begin_owner_possession_challenge(uuid,uuid,uuid,text,text,text,text)'),
      ('F5', 'staff.begin_registration_challenge(uuid,uuid,text,text)'),
      ('F5', 'staff.complete_invitation_proof(uuid,uuid,uuid,text,bigint,text,text)'),
      ('F5', 'staff.complete_owner_possession(uuid,uuid,uuid,text,bigint,text,text)'),
      ('F5', 'identity.read_web_page_texts(uuid,uuid[])'),
      ('F5', 'identity.read_free_debates_to_publish(integer)'),
      ('F5', 'identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)'),
      ('F5', 'identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)'),
      ('F5', 'identity.read_web_reply_texts(uuid,uuid[])'),
      ('F5', 'identity.read_public_material(uuid)'),
      ('F5', 'identity.read_public_dig_input(uuid)'),
      ('F5', 'identity.read_public_answer_updates(uuid)'),
      ('F5', 'identity.read_public_reports_unwritten(integer)'),
      ('F5', 'identity.read_public_checks_passed(integer)'),
      ('F5', 'identity.read_public_page_owed(integer)'),
      ('F5', 'identity.read_public_reports_owed(integer)'),
      ('F5', 'identity.read_free_debate_owner(uuid)'),
      ('F5', 'identity.delete_public_flag_words_due()'),
      ('F5', 'identity.read_public_review_purge_due(integer)'),
      ('F5', 'identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)'),
      ('F5', 'identity.settle_web_researched(uuid,uuid,text)'),
      ('F5', 'identity.read_unwritten_path_rewrites(timestamptz,integer)'),
      ('F5', 'identity.read_unreported_closings(integer)'),
      ('F5', 'identity.settle_public_contribution(uuid,text,uuid)'),
      ('F5', 'identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)'),
      ('F5', 'core.prepare_free_publication(uuid,uuid)'),
      ('F5', 'core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)'),
      ('F5', 'identity.refuse_free_publication(uuid)'),
      ('F5', 'identity.read_debates_holding_passages(integer)'),
      ('F5', 'identity.wipe_debate_passages(uuid,text)'),
      ('F5', 'identity.wipe_inactive_web_page_text_of_idle_debates(integer)'),
      ('F5', 'identity.read_unsettled_web_researched(integer)'),
      ('F5', 'identity.read_public_digs_unsettled(timestamptz,integer)'),
      ('F5', 'identity.read_public_climbs_owed(integer)'),
      ('F5', 'identity.mark_public_climb_done(uuid)'),
      ('F5', 'identity.record_public_check_passed(uuid,uuid)'),
      ('F5', 'identity.record_public_page_skip(uuid,uuid,text,text)'),
      ('F5', 'identity.record_public_debate_report(uuid,integer,uuid,jsonb)'),
      ('F5', 'identity.mark_dig_tree_settled(uuid)'),
      ('F5', 'identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)'),
      ('F5', 'identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)'),
      ('F5', 'identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)'),
      ('F5', 'identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)'),
      ('F5', 'identity.record_web_picks(uuid,text,uuid[])'),
      ('F5', 'identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)'),
      ('F5', 'identity.read_dig_level_of_run(uuid)'),
      ('F5', 'identity.take_path_rewrite_turn(uuid,uuid,text)'),
      ('F5', 'identity.read_path_rewrite_turn(uuid)'),
      ('F5', 'identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'),
      ('F5', 'identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)'),
      ('F5', 'identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)'),
      ('F5', 'identity.read_run_pause_of_run(uuid)'),
      ('F5', 'identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea)'),
      ('F5', 'identity.read_investigation_waiting_of_run(uuid)'),
      ('F5', 'identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)'),
      ('F5', 'identity.read_closing_since_of_root(uuid)'),
      ('F5', 'identity.read_public_contribution_of_run(uuid)'),
      ('F5', 'identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)'),
      ('F5', 'identity.read_path_update_turn(uuid)'),
      ('F5', 'identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'),
      ('F5', 'identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'),
      ('F5', 'identity.read_path_climb_next(uuid)'),
      ('F5', 'identity.record_web_shown_quote(uuid,uuid,jsonb,bytea)'),
      ('F5', 'identity.record_web_reply_text(uuid,uuid,jsonb,bytea)'),
      ('F5', 'identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea)'),
      ('F5', 'identity.run_work_is_parked(uuid,text,timestamptz)'),
      ('F5', 'identity.record_public_dig_input(uuid,text,jsonb,bytea)'),
      ('F5', 'identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)'),
      ('F5', 'identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'),
      ('F5', 'identity.read_public_climb_next(uuid)'),
      ('F5', 'identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)'),
      ('F5', 'identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)'),
      ('F5', 'identity.read_public_report_charged_until(uuid)'),
      ('F5', 'identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer)'),
      ('F5', 'identity.dig_is_settled(uuid)'),
      ('F5', 'core.read_terminal_recorded_facts(uuid)'),
      ('F5', 'evaluator.provider_call_request_is_authorized(uuid,text,text,text)'),
      ('F5', 'serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid)'),
      ('F5', 'staff.threat_report_recipient_user(uuid)'),
      ('F5', 'staff.erase_due_threat_reports()'),
      ('F5', 'staff.claim_threat_report_alerts(integer)'),
      ('F5', 'staff.complete_threat_report_alert(uuid,uuid,boolean)'),
      ('F5', 'staff.claim_team_limit_notices(integer)'),
      ('F5', 'staff.complete_team_limit_notice(uuid,uuid,boolean)'),
      ('F5', 'staff.team_limit_notice_user(uuid,uuid)'),
      ('F5', 'staff.claim_allowance_notices(integer)'),
      ('F5', 'staff.complete_allowance_notice(uuid,uuid,boolean)'),
      ('F5', 'staff.allowance_notice_user(uuid,uuid)'),
      ('F5', 'staff.claim_public_review_notices(integer)'),
      ('F5', 'staff.complete_public_review_notice(uuid,uuid,boolean)'),
      ('F5', 'staff.public_review_notice_user(uuid,uuid)'),
      ('F5', 'staff.claim_public_flag_notices(integer)'),
      ('F5', 'staff.complete_public_flag_notice(uuid,uuid,boolean)'),
      ('F5', 'staff.public_flag_notice_user(uuid,uuid)'),
      ('F5', 'staff.claim_alert_delivery(integer)'),
      ('F5', 'staff.read_alert_key_mapping(uuid,uuid)'),
      ('F5', 'staff.settle_alert_delivery(uuid,uuid,text,text)'),
      ('F5', 'staff.read_alert_delivery_status()'),
      ('F5', 'staff.read_target_invitation_channel(uuid,uuid,uuid,uuid,uuid)'),
      ('F5', 'identity.claim_consumer_security_notices(integer)'),
      ('F5', 'identity.read_consumer_security_notice(uuid,uuid)'),
      ('F5', 'identity.ack_consumer_security_notice(uuid,uuid)'),
      ('F5', 'identity.fail_consumer_security_notice(uuid,uuid,text)'),
      ('F5', 'identity.purge_expired_authentication_risk_signals(integer)'),
      ('F5', 'serve.purge_expired_synthesis_check_removal_notices()'),
      ('F5', 'legal.purge_expired_acceptance(timestamptz)'),
      ('F5', 'identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)'),
      ('F5', 'staff."grant"(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb)'),
      ('F5', 'staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb)'),
      ('F5', 'staff.authorize_action(jsonb,text)'),
      ('F5', 'staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)'),
      ('F5', 'staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb)'),
      ('F5', 'staff.fail_owned_webauthn(uuid,uuid,uuid)'),
      ('F5', 'staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb)'),
      ('F5', 'staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text)'),
      ('F5', 'identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text)'),
      ('F5', 'staff.read_alert_user_mapping(uuid)'),
      ('F5', 'ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)'),
      ('F5', 'ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)'),
      ('F5', 'identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)'),
      ('F5', 'identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb)'),
      ('F5', 'identity.read_consumer_passkey_credential(text,text,text)'),
      ('F5', 'identity.complete_consumer_passkey_login(jsonb,jsonb)'),
      ('F5', 'identity.read_consumer_recovery_proof(text,integer)'),
      ('F5', 'identity.prove_consumer_recovery(jsonb,jsonb)'),
      ('F5', 'identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb)'),
      ('F5', 'core.record_provider_probe(uuid,text,text,text,text,text,timestamptz)')
    ) AS taken(fix, signature) LOOP
    FOREACH v_role IN ARRAY v_roles LOOP
      IF pg_catalog.has_function_privilege(v_role, v_item.signature, 'EXECUTE') THEN
        RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT % still callable % %', v_item.fix, v_role, v_item.signature;
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
        WHERE p.oid = pg_catalog.to_regprocedure(v_item.signature) AND a.grantee = 0) THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT % still callable PUBLIC %', v_item.fix, v_item.signature;
    END IF;
  END LOOP;

  -- F3: no role but its owner holds the legacy join at all.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
      WHERE p.oid = 'identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)'::regprocedure AND a.grantee <> p.proowner) THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F3 join_public_investigation granted';
  END IF;

  -- F4a: the scope table is its owner's alone, as the guarded tables are, with the truncate guard; no role may read or write it, nor call a helper of it.
  IF (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class AS c WHERE c.oid = 'identity.private_forget_scope'::regclass) IS DISTINCT FROM v_owner
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS a
      WHERE c.oid = 'identity.private_forget_scope'::regclass AND a.grantee <> c.relowner)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.private_forget_scope'::regclass AND t.tgname = 'reject_truncate') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F4a scope table';
  END IF;
  FOREACH v_role IN ARRAY v_roles LOOP
    IF pg_catalog.has_table_privilege(v_role, 'identity.private_forget_scope', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.open_forget_scope(text)', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.close_forget_scope(text)', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.forget_scope_open(text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F4a reachable %', v_role;
    END IF;
  END LOOP;

  -- F4a: each of the ten guards asks its scope and reads no setting; each of the eleven definers that delete under a guard opens its scope, closes it after,
  -- and sets nothing; the owner of each may call what it calls (no grant is made for that: they are the helpers' owner).
  FOR v_item IN SELECT * FROM (VALUES
      ('identity.guard_web_evidence_record()', 'web_evidence', 'guard'),
      ('identity.guard_investigation_record()', 'investigation', 'guard'),
      ('identity.guard_dig_model_record()', 'dig_model', 'guard'),
      ('identity.guard_dig_pick_record()', 'dig_picks', 'guard'),
      ('identity.guard_investigation_report_record()', 'investigation', 'guard'),
      ('identity.guard_public_debate_record()', 'public_debate', 'guard'),
      ('identity.guard_tree_update_record()', 'tree_updates', 'guard'),
      ('identity.guard_passage_retention_record()', 'passage_retention', 'guard'),
      ('identity.guard_path_suggestions_record()', 'path_suggestions', 'guard'),
      ('identity.guard_public_tree_record()', 'public_tree', 'guard'),
      ('identity.forget_erased_debate_web_evidence(uuid)', 'web_evidence', 'definer'),
      ('identity.forget_erased_debate_investigation(uuid)', 'investigation', 'definer'),
      ('identity.forget_erased_debate_dig_model(uuid)', 'dig_model', 'definer'),
      ('identity.forget_erased_debate_dig_picks(uuid)', 'dig_picks', 'definer'),
      ('identity.forget_erased_debate_public(uuid)', 'public_debate', 'definer'),
      ('identity.forget_erased_debate_tree_updates(uuid)', 'tree_updates', 'definer'),
      ('identity.wipe_debate_passages(uuid,text)', 'web_evidence', 'definer'),
      ('identity.wipe_debate_passages(uuid,text)', 'passage_retention', 'definer'),
      ('identity.forget_erased_debate_passages(uuid)', 'passage_retention', 'definer'),
      ('identity.forget_erased_debate_path_suggestions(uuid)', 'path_suggestions', 'definer'),
      ('identity.forget_erased_debate_public_tree(uuid)', 'public_tree', 'definer'),
      ('identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)', 'public_tree', 'definer')
    ) AS scoped(signature, scope, kind) LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_item.signature::regprocedure);
    SELECT p.proowner INTO v_proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_item.signature::regprocedure;
    IF v_item.kind = 'guard' AND (pg_catalog.strpos(v_definition, pg_catalog.format('identity.forget_scope_open(%L)', v_item.scope)) = 0
        OR pg_catalog.strpos(v_definition, 'current_setting(') > 0
        OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.forget_scope_open(text)', 'EXECUTE')) THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F4a guard % %', v_item.signature, v_item.scope;
    END IF;
    IF v_item.kind = 'definer' AND (pg_catalog.strpos(v_definition, pg_catalog.format('PERFORM identity.open_forget_scope(%L);', v_item.scope)) = 0
        OR pg_catalog.strpos(v_definition, pg_catalog.format('PERFORM identity.close_forget_scope(%L);', v_item.scope))
          < pg_catalog.strpos(v_definition, pg_catalog.format('PERFORM identity.open_forget_scope(%L);', v_item.scope))
        OR pg_catalog.strpos(v_definition, 'set_config(') > 0
        OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.open_forget_scope(text)', 'EXECUTE')
        OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.close_forget_scope(text)', 'EXECUTE')) THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F4a definer % %', v_item.signature, v_item.scope;
    END IF;
  END LOOP;
  -- F4a: and no function anywhere still reads, sets or carries in its settings one of the nine settings.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND (p.prosrc ~ 'debateai\.[a-z_]+_forget' OR COALESCE(pg_catalog.array_to_string(p.proconfig, ' '), '') ~ 'debateai\.[a-z_]+_forget')) THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F4a setting still read';
  END IF;

  -- F5: the helper reads 0130's context as its owner, who may, and the marker by the login; it names the marker, never a login.
  v_definition := pg_catalog.pg_get_functiondef('identity.request_owner_matches(uuid)'::regprocedure);
  IF NOT pg_catalog.has_schema_privilege(v_owner, 'rls', 'USAGE') OR NOT pg_catalog.has_function_privilege(v_owner, 'rls.context_owner_ref()', 'EXECUTE')
    OR pg_catalog.strpos(v_definition, 'rls.context_owner_ref()') = 0
    OR pg_catalog.strpos(v_definition, 'pg_catalog.pg_has_role(session_user, ''debateai_rls_all_accounts'', ''MEMBER'')') = 0
    OR pg_catalog.to_regrole('debateai_rls_all_accounts') IS NULL THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 helper';
  END IF;
  -- F5: the clarify charge's reservations are the charge writer's owner's alone, with the truncate guard, going with the account; no role may read or
  -- write them; their writer refuses an owner that is not the connection's before it writes, then takes up to 100 hour-old rows of every owner, by
  -- their time's own index, so none waits for its owner, and refuses an id another owner holds; and its owner may ask the rule.
  v_definition := pg_catalog.pg_get_functiondef('identity.reserve_ask_clarify_charge(uuid,uuid)'::regprocedure);
  IF (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class AS c WHERE c.oid = 'identity.ask_clarify_reservation'::regclass) IS DISTINCT FROM v_writer
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS a
      WHERE c.oid = 'identity.ask_clarify_reservation'::regclass AND a.grantee <> c.relowner)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.ask_clarify_reservation'::regclass AND t.tgname = 'reject_truncate')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'identity.ask_clarify_reservation'::regclass AND k.contype = 'f'
      AND k.confrelid = 'identity."user"'::regclass AND k.confdeltype = 'c')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index AS i JOIN pg_catalog.pg_attribute AS a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = 'identity.ask_clarify_reservation'::regclass AND i.indnatts = 1 AND a.attname = 'reserved_at')
    OR pg_catalog.strpos(v_definition, E'\nBEGIN\n  IF p_charge_id IS NULL OR p_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE=''23514'', MESSAGE=''ASK_CLARIFY_CHARGE_INVALID''; END IF;\n  IF NOT identity.request_owner_matches(p_owner) THEN RAISE EXCEPTION USING ERRCODE=''42501'', MESSAGE=''REQUEST_OWNER_MISMATCH''; END IF;\n  DELETE FROM identity.ask_clarify_reservation AS reservation WHERE reservation.charge_id IN (\n    SELECT stale.charge_id FROM identity.ask_clarify_reservation AS stale\n    WHERE stale.reserved_at <= pg_catalog.clock_timestamp() - interval ''1 hour''\n    ORDER BY stale.reserved_at LIMIT 100 FOR UPDATE SKIP LOCKED);\n  INSERT INTO identity.ask_clarify_reservation (charge_id, owner_ref) VALUES (p_charge_id, p_owner) ON CONFLICT (charge_id) DO NOTHING;\n  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM identity.ask_clarify_reservation AS held WHERE held.charge_id = p_charge_id AND held.owner_ref = p_owner) THEN\n    RAISE EXCEPTION USING ERRCODE=''23505'', MESSAGE=''ASK_CLARIFY_CHARGE_TAKEN'';\n  END IF;\n  RETURN ''RESERVED'';\n') = 0
    OR NOT pg_catalog.has_function_privilege(v_writer, 'identity.request_owner_matches(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 reservation';
  END IF;
  -- F5: the API's sweep takes the prune's rows, by the same window, as many as it is asked and no more, and refuses any other count first.
  v_definition := pg_catalog.pg_get_functiondef('identity.delete_ask_clarify_reservations_due(integer)'::regprocedure);
  IF pg_catalog.strpos(v_definition, E'\nBEGIN\n  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE=''22023'', MESSAGE=''ASK_CLARIFY_RESERVATION_SWEEP_INVALID''; END IF;\n  DELETE FROM identity.ask_clarify_reservation AS reservation WHERE reservation.charge_id IN (\n    SELECT stale.charge_id FROM identity.ask_clarify_reservation AS stale\n    WHERE stale.reserved_at <= pg_catalog.clock_timestamp() - interval ''1 hour''\n    ORDER BY stale.reserved_at LIMIT p_limit FOR UPDATE SKIP LOCKED);\n  GET DIAGNOSTICS v_rows = ROW_COUNT;\n  RETURN v_rows;\n') = 0 THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 reservation sweep';
  END IF;
  -- No role a request may hold reads or writes the reservations, or may call the sweep (the marker's holders may: section 2's grant).
  FOREACH v_role IN ARRAY v_roles LOOP
    IF pg_catalog.has_table_privilege(v_role, 'identity.ask_clarify_reservation', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR pg_catalog.has_function_privilege(v_role, 'identity.delete_ask_clarify_reservations_due(integer)', 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 reservation reachable %', v_role;
    END IF;
  END LOOP;
  -- F5: what nothing calls is no role's at all, the marker's included; what only the workers call is the marker's alone.
  FOR v_item IN SELECT * FROM (VALUES
      ('identity.join_investigation(uuid,uuid,uuid,text[],text)', 'taken'),
      ('identity.close_investigation(uuid,uuid)', 'taken'),
      ('identity.read_investigation(uuid,uuid)', 'taken'),
      ('identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)', 'taken'),
      ('identity.read_reserve(uuid)', 'taken'),
      ('identity.wipe_inactive_web_page_text(integer)', 'taken'),
      ('identity.read_investigation_dig_levels(uuid,uuid)', 'taken'),
      ('identity.read_path_rewrites(uuid,uuid)', 'taken'),
      ('identity.read_paused_runs(uuid)', 'taken'),
      ('identity.read_public_report_spent(uuid,timestamptz,timestamptz)', 'taken'),
      ('identity.read_path_line(uuid,uuid)', 'taken'),
      ('identity.read_main_answer_updates(uuid,uuid)', 'taken'),
      ('identity.close_public_investigation(uuid,uuid)', 'taken'),
      ('identity.reopen_public_investigation(uuid,integer)', 'taken'),
      ('identity.record_investigation_report(uuid,integer,uuid)', 'taken'),
      ('staff.keep_threat_report(text,uuid)', 'taken'),
      ('staff.keep_threat_report_with_email(text,uuid,text)', 'taken'),
      ('identity.read_authentication_risk_signals_for_recovery(uuid)', 'taken'),
      ('staff.read_team_internal_spent(timestamptz,timestamptz)', 'taken'),
      ('staff.begin_invitation_challenge(uuid,uuid,text,text,text)', 'taken'),
      ('staff.begin_owner_possession_challenge(uuid,uuid,uuid,text,text,text,text)', 'taken'),
      ('staff.begin_registration_challenge(uuid,uuid,text,text)', 'taken'),
      ('staff.complete_invitation_proof(uuid,uuid,uuid,text,bigint,text,text)', 'taken'),
      ('staff.complete_owner_possession(uuid,uuid,uuid,text,bigint,text,text)', 'taken'),
      ('identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb)', 'taken'),
      ('identity.read_web_page_texts(uuid,uuid[])', 'moved'),
      ('identity.read_free_debates_to_publish(integer)', 'moved'),
      ('identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)', 'moved'),
      ('identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)', 'moved'),
      ('identity.read_web_reply_texts(uuid,uuid[])', 'moved'),
      ('identity.read_public_material(uuid)', 'moved'),
      ('identity.read_public_dig_input(uuid)', 'moved'),
      ('identity.read_public_answer_updates(uuid)', 'moved'),
      ('identity.read_public_reports_unwritten(integer)', 'moved'),
      ('identity.read_public_checks_passed(integer)', 'moved'),
      ('identity.read_public_page_owed(integer)', 'moved'),
      ('identity.read_public_reports_owed(integer)', 'moved'),
      ('identity.read_free_debate_owner(uuid)', 'moved'),
      ('identity.delete_public_flag_words_due()', 'moved'),
      ('identity.read_public_review_purge_due(integer)', 'moved'),
      ('identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)', 'moved'),
      ('identity.settle_web_researched(uuid,uuid,text)', 'moved'),
      ('identity.read_unwritten_path_rewrites(timestamptz,integer)', 'moved'),
      ('identity.read_unreported_closings(integer)', 'moved'),
      ('identity.settle_public_contribution(uuid,text,uuid)', 'moved'),
      ('identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)', 'moved'),
      ('core.prepare_free_publication(uuid,uuid)', 'moved'),
      ('core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)', 'moved'),
      ('identity.refuse_free_publication(uuid)', 'moved'),
      ('identity.read_debates_holding_passages(integer)', 'moved'),
      ('identity.wipe_debate_passages(uuid,text)', 'moved'),
      ('identity.wipe_inactive_web_page_text_of_idle_debates(integer)', 'moved'),
      ('identity.read_unsettled_web_researched(integer)', 'moved'),
      ('identity.read_public_digs_unsettled(timestamptz,integer)', 'moved'),
      ('identity.read_public_climbs_owed(integer)', 'moved'),
      ('identity.mark_public_climb_done(uuid)', 'moved'),
      ('identity.record_public_check_passed(uuid,uuid)', 'moved'),
      ('identity.record_public_page_skip(uuid,uuid,text,text)', 'moved'),
      ('identity.record_public_debate_report(uuid,integer,uuid,jsonb)', 'moved'),
      ('identity.mark_dig_tree_settled(uuid)', 'moved'),
      ('identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)', 'moved'),
      ('identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)', 'moved'),
      ('identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)', 'moved'),
      ('identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)', 'moved'),
      ('identity.record_web_picks(uuid,text,uuid[])', 'moved'),
      ('identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)', 'moved'),
      ('identity.read_dig_level_of_run(uuid)', 'moved'),
      ('identity.take_path_rewrite_turn(uuid,uuid,text)', 'moved'),
      ('identity.read_path_rewrite_turn(uuid)', 'moved'),
      ('identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)', 'moved'),
      ('identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)', 'moved'),
      ('identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)', 'moved'),
      ('identity.read_run_pause_of_run(uuid)', 'moved'),
      ('identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea)', 'moved'),
      ('identity.read_investigation_waiting_of_run(uuid)', 'moved'),
      ('identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)', 'moved'),
      ('identity.read_closing_since_of_root(uuid)', 'moved'),
      ('identity.read_public_contribution_of_run(uuid)', 'moved'),
      ('identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)', 'moved'),
      ('identity.read_path_update_turn(uuid)', 'moved'),
      ('identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)', 'moved'),
      ('identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)', 'moved'),
      ('identity.read_path_climb_next(uuid)', 'moved'),
      ('identity.record_web_shown_quote(uuid,uuid,jsonb,bytea)', 'moved'),
      ('identity.record_web_reply_text(uuid,uuid,jsonb,bytea)', 'moved'),
      ('identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea)', 'moved'),
      ('identity.run_work_is_parked(uuid,text,timestamptz)', 'moved'),
      ('identity.record_public_dig_input(uuid,text,jsonb,bytea)', 'moved'),
      ('identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)', 'moved'),
      ('identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)', 'moved'),
      ('identity.read_public_climb_next(uuid)', 'moved'),
      ('identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)', 'moved'),
      ('identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)', 'moved'),
      ('identity.read_public_report_charged_until(uuid)', 'moved'),
      ('identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer)', 'moved'),
      ('identity.dig_is_settled(uuid)', 'moved'),
      ('core.read_terminal_recorded_facts(uuid)', 'moved'),
      ('evaluator.provider_call_request_is_authorized(uuid,text,text,text)', 'moved'),
      ('serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid)', 'moved'),
      ('staff.threat_report_recipient_user(uuid)', 'moved'),
      ('staff.erase_due_threat_reports()', 'moved'),
      ('staff.claim_threat_report_alerts(integer)', 'moved'),
      ('staff.complete_threat_report_alert(uuid,uuid,boolean)', 'moved'),
      ('staff.claim_team_limit_notices(integer)', 'moved'),
      ('staff.complete_team_limit_notice(uuid,uuid,boolean)', 'moved'),
      ('staff.team_limit_notice_user(uuid,uuid)', 'moved'),
      ('staff.claim_allowance_notices(integer)', 'moved'),
      ('staff.complete_allowance_notice(uuid,uuid,boolean)', 'moved'),
      ('staff.allowance_notice_user(uuid,uuid)', 'moved'),
      ('staff.claim_public_review_notices(integer)', 'moved'),
      ('staff.complete_public_review_notice(uuid,uuid,boolean)', 'moved'),
      ('staff.public_review_notice_user(uuid,uuid)', 'moved'),
      ('staff.claim_public_flag_notices(integer)', 'moved'),
      ('staff.complete_public_flag_notice(uuid,uuid,boolean)', 'moved'),
      ('staff.public_flag_notice_user(uuid,uuid)', 'moved'),
      ('staff.claim_alert_delivery(integer)', 'moved'),
      ('staff.read_alert_key_mapping(uuid,uuid)', 'moved'),
      ('staff.settle_alert_delivery(uuid,uuid,text,text)', 'moved'),
      ('staff.read_alert_delivery_status()', 'moved'),
      ('staff.read_target_invitation_channel(uuid,uuid,uuid,uuid,uuid)', 'moved'),
      ('identity.claim_consumer_security_notices(integer)', 'moved'),
      ('identity.read_consumer_security_notice(uuid,uuid)', 'moved'),
      ('identity.ack_consumer_security_notice(uuid,uuid)', 'moved'),
      ('identity.fail_consumer_security_notice(uuid,uuid,text)', 'moved'),
      ('identity.purge_expired_authentication_risk_signals(integer)', 'moved'),
      ('serve.purge_expired_synthesis_check_removal_notices()', 'moved'),
      ('legal.purge_expired_acceptance(timestamptz)', 'moved'),
      ('identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)', 'moved'),
      ('staff."grant"(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb)', 'moved'),
      ('staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb)', 'moved'),
      ('staff.authorize_action(jsonb,text)', 'moved'),
      ('staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)', 'moved'),
      ('staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb)', 'moved'),
      ('staff.fail_owned_webauthn(uuid,uuid,uuid)', 'moved'),
      ('staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb)', 'moved'),
      ('staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text)', 'moved'),
      ('identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text)', 'moved'),
      ('staff.read_alert_user_mapping(uuid)', 'moved'),
      ('ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)', 'moved'),
      ('ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)', 'moved'),
      ('identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)', 'moved'),
      ('identity.read_consumer_passkey_credential(text,text,text)', 'moved'),
      ('identity.complete_consumer_passkey_login(jsonb,jsonb)', 'moved'),
      ('identity.read_consumer_recovery_proof(text,integer)', 'moved'),
      ('identity.prove_consumer_recovery(jsonb,jsonb)', 'moved'),
      ('identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb)', 'moved'),
      ('core.record_provider_probe(uuid,text,text,text,text,text,timestamptz)', 'moved')
    ) AS kept(signature, kind) LOOP
    SELECT COALESCE(pg_catalog.array_agg(DISTINCT COALESCE(pg_catalog.pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC')::text), '{}') INTO v_grantees
    FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
    WHERE p.oid = pg_catalog.to_regprocedure(v_item.signature) AND a.grantee <> p.proowner;
    -- The evaluator call check keeps the evaluator worker's own grant of 0040 beside the marker's.
    IF v_grantees IS DISTINCT FROM (CASE WHEN v_item.kind = 'moved' AND v_item.signature = 'evaluator.provider_call_request_is_authorized(uuid,text,text,text)'
        THEN ARRAY['debateai_evaluator_worker','debateai_rls_all_accounts'] WHEN v_item.kind = 'moved' THEN ARRAY['debateai_rls_all_accounts'] ELSE ARRAY[]::text[] END) THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 % grants % %', v_item.kind, v_item.signature, v_grantees;
    END IF;
  END LOOP;
  -- F5: 0112's release of an alert claim stays the runtime's alone, as 0112's verifier requires, and gives back only the live claim it is handed.
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT COALESCE(pg_catalog.pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC')::text), '{}') INTO v_grantees
  FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
  WHERE p.oid = 'staff.release_alert_delivery(uuid,uuid)'::regprocedure AND a.grantee <> p.proowner;
  IF v_grantees IS DISTINCT FROM ARRAY['debateai_runtime']
    OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('staff.release_alert_delivery(uuid,uuid)'::regprocedure), 's.claim_token IS DISTINCT FROM p_claim') = 0 THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 alert release %', v_grantees;
  END IF;
  -- F5: 0048's probe writer is the marker's alone (above), and 0040's reader of each provider's latest probe stays debateai_runtime's, as the API's
  -- discovery reads the latest probes on its request login.
  IF NOT pg_catalog.has_function_privilege('debateai_runtime', 'core.latest_provider_probes(text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 probe reader';
  END IF;
  -- F5: 0085's hold question is no longer debateai_runtime's; the authorization runtime and the owners of the definers that ask it keep theirs.
  v_grantees := ARRAY(SELECT DISTINCT COALESCE(pg_catalog.pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC')::text AS grantee
    FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
    WHERE p.oid = 'identity.read_account_security_hold(uuid)'::regprocedure AND a.grantee <> p.proowner ORDER BY grantee);
  IF v_grantees IS DISTINCT FROM ARRAY['debateai_authorization_runtime','debateai_backup_email_owner','debateai_mfa_recovery_owner','debateai_password_recovery_owner',
      'debateai_password_reset_owner','debateai_staff_security_owner']
    OR pg_catalog.has_function_privilege('debateai_runtime', 'identity.read_account_security_hold(uuid)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_billing_runtime', 'identity.read_account_security_hold(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 account hold %', v_grantees;
  END IF;
  -- F5: 0131's rule and each request-facing definer ask the session's owner, the definers that refuse as their first statement, and the owner of each
  -- may ask (staff's spend total and the clarify reservation by section 2's grants; 0144's charge writer asks nothing, below). The run-keyed readers ask
  -- 0131's rule of the run's own owner in place of the liveness question they opened with, so their owner may also call the rule; the web evidence's
  -- reader keeps its liveness question for the export worker's login alone, which reaches it only through 0132's export reader, under its lease, and
  -- which no request role holds; 0040's lock asks beside its own check, for an owner only; 0123's unstarted re-admissions and 0127's approval
  -- question ask once, of the run's latest owner (the re-admissions in their owner's branch, before the legacy asker's), and
  -- 0126's check result writer asks once, inside its attempt match, before it refuses a mismatch; 0127's review state and 0144's and 0149's spend
  -- totals, plain SQL before this step, are plpgsql that refuse as their first statement, ask nowhere else and then return what they read (their
  -- rows and totals are read as refusals and caps, so none answers as for nothing stored); the public copy refuses after its liveness check and before
  -- anything is looked up or written; the public line asks of each row's run's owner, after its publication question, and its owner may read that
  -- owner; the flag's opening refuses first, then compares every count with the lower of the limits it is handed and the site's own, read before
  -- the person's lock, and its owner may read the site's; the flag's settlement, the marker's alone (above), asks twice, for the close and the hide,
  -- hides only for a report no one dismissed, and refuses nothing.
  FOR v_item IN SELECT * FROM (VALUES
      ('core.lock_owned_live_runs(uuid[],uuid,text)', 'p_owner_ref', 'locks'),
      ('core.list_unstarted_readmissions(uuid)', '(SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_old_run_id ORDER BY event.at_seq DESC LIMIT 1)', 'run_owner'),
      ('serve.take_synthesis_check_removal_notice(uuid)', 'p_owner_ref', 'reader'),
      ('serve.synthesis_check_removal_notice_exists(uuid)', 'p_owner_ref', 'reader'),
      ('serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean)', '(SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1)', 'attempt'),
      ('serve.read_publication_review_state(uuid,uuid,uuid)', 'p_owner_ref', 'raises'),
      ('serve.publication_review_approved(uuid,uuid,integer)', '(SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1)', 'run_owner'),
      ('identity.page_memory_run_owned(uuid,uuid)', 'p_owner_ref', 'rule'),
      ('identity.read_page_reading_level(uuid)', 'p_owner_ref', 'reader'),
      ('identity.save_page_reading_level(uuid,text)', 'p_owner_ref', 'refuses'),
      ('identity.record_web_researched(uuid,uuid,uuid)', 'p_owner_ref', 'refuses'),
      ('identity.read_web_evidence(uuid)', 'p_run_id', 'exported'),
      ('identity.read_investigation_of_run(uuid)', 'member.owner_ref', 'member'),
      ('identity.resume_paused_run(uuid,uuid)', 'p_owner_ref', 'refuses'),
      ('identity.read_run_pause(uuid,uuid)', 'p_owner_ref', 'refuses'),
      ('identity.read_path_rewrites_of_run(uuid)', 'p_run_id', 'run'),
      ('identity.read_web_plan(uuid)', 'p_run_id', 'run'),
      ('identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)', 'p_owner_ref', 'refuses'),
      ('identity.read_dig_picks_of_run(uuid)', 'p_run_id', 'run'),
      ('identity.read_investigation_reports_of_run(uuid)', 'p_run_id', 'run'),
      ('identity.record_public_dig_picks(uuid,uuid,jsonb)', 'p_owner_ref', 'refuses'),
      ('identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea)', 'p_owner_ref', 'refuses'),
      ('identity.read_run_purpose_lines(uuid,uuid)', 'p_owner_ref', 'refuses'),
      ('identity.read_path_line_of_run(uuid)', 'p_run_id', 'run'),
      ('identity.read_main_answer_updates_of_run(uuid)', 'p_run_id', 'run'),
      ('identity.read_run_purpose_lines_of_run(uuid)', 'p_run_id', 'run'),
      ('identity.read_web_shown_quotes(uuid)', 'p_run_id', 'run'),
      ('identity.read_path_suggestions_of_run(uuid)', 'p_debate_run_id', 'run'),
      ('identity.continue_paused_run_in_release(uuid,uuid,text,bigint)', 'p_owner_ref', 'refuses'),
      ('identity.read_ask_clarify_spent(uuid,timestamptz,timestamptz)', 'p_owner', 'raises'),
      ('identity.open_public_report(uuid,uuid,uuid,boolean)', 'p_owner_ref', 'refuses'),
      ('identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea)', 'v_owner', 'material'),
      ('identity.read_public_path_line(uuid)', 'identity.web_evidence_run_owner((entry.value->>''run_id'')::uuid)', 'line'),
      ('identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean)', 'p_owner_ref', 'raises'),
      ('identity.read_own_public_contributions(uuid,uuid)', 'p_owner_ref', 'reader'),
      ('identity.open_public_flag(uuid,uuid,uuid,jsonb,integer,integer,integer)', 'p_owner_ref', 'opens'),
      ('identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)', 'v.reporter_ref', 'flag')
    ) AS checked(signature, owner_arg, kind) LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_item.signature::regprocedure);
    SELECT p.proowner INTO v_proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_item.signature::regprocedure;
    IF (v_item.kind NOT IN ('run', 'exported') AND pg_catalog.strpos(v_definition, pg_catalog.format('identity.request_owner_matches(%s)', v_item.owner_arg)) = 0)
      OR (v_item.kind IN ('run', 'exported') AND (pg_catalog.strpos(v_definition, pg_catalog.format(CASE v_item.kind
          WHEN 'run' THEN E'\nBEGIN\n  IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(%1$s), %1$s) THEN RETURN NULL; END IF;\n'
          ELSE E'\nBEGIN\n  IF NOT (CASE WHEN pg_catalog.pg_has_role(session_user, ''debateai_data_export_worker'', ''MEMBER'') THEN identity.web_evidence_run_owner(%1$s) IS NOT NULL\n'
            '    ELSE identity.page_memory_run_owned(identity.web_evidence_run_owner(%1$s), %1$s) END) THEN RETURN NULL; END IF;\n' END, v_item.owner_arg)) = 0
        OR pg_catalog.strpos(v_definition, pg_catalog.format('IF identity.web_evidence_run_owner(%s) IS NULL', v_item.owner_arg)) > 0
        OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.page_memory_run_owned(uuid,uuid)', 'EXECUTE')))
      OR (v_item.kind = 'exported' AND (pg_catalog.pg_has_role('debateai_runtime', 'debateai_data_export_worker', 'MEMBER')
        OR pg_catalog.pg_has_role('debateai_billing_runtime', 'debateai_data_export_worker', 'MEMBER')
        OR pg_catalog.pg_has_role('debateai_authorization_runtime', 'debateai_data_export_worker', 'MEMBER')))
      OR (v_item.kind IN ('run_owner', 'attempt') AND (pg_catalog.length(v_definition)
          - pg_catalog.length(pg_catalog.replace(v_definition, 'identity.request_owner_matches(', ''))) / pg_catalog.length('identity.request_owner_matches(') <> 1)
      OR (v_item.kind = 'run_owner' AND pg_catalog.strpos(v_definition, ' UNION') > 0
        AND pg_catalog.strpos(v_definition, 'identity.request_owner_matches(') > pg_catalog.strpos(v_definition, ' UNION'))
      OR (v_item.kind = 'attempt' AND (pg_catalog.strpos(v_definition, 'identity.request_owner_matches(') < pg_catalog.strpos(v_definition, 'FROM serve.synthesis_check_attempt AS attempt')
        OR pg_catalog.strpos(v_definition, 'identity.request_owner_matches(') > pg_catalog.strpos(v_definition, 'SYNTHESIS_CHECK_ATTEMPT_MISMATCH')))
      OR (v_item.kind = 'locks' AND pg_catalog.strpos(v_definition,
        E'    AND core.run_is_owned_by(run.run_id,p_owner_ref,p_legacy_asker_id)\n    AND (p_owner_ref IS NULL OR identity.request_owner_matches(p_owner_ref))\n') = 0)
      OR (v_item.kind = 'material' AND (pg_catalog.strpos(v_definition, 'identity.request_owner_matches(report.writer_ref)') = 0
        OR pg_catalog.strpos(v_definition, 'REQUEST_OWNER_MISMATCH') < pg_catalog.strpos(v_definition, 'THEN RETURN ''NOT_LIVE''')
        OR pg_catalog.strpos(v_definition, 'REQUEST_OWNER_MISMATCH') > pg_catalog.strpos(v_definition, 'FROM identity.public_material AS material WHERE material.material_id = p_material_id')))
      OR (v_item.kind = 'line' AND (pg_catalog.strpos(v_definition, E'WITH ORDINALITY AS entry(value, ordinality)\n    WHERE identity.request_owner_matches(identity.web_evidence_run_owner((entry.value->>''run_id'')::uuid)));') = 0
        OR pg_catalog.strpos(v_definition, 'IF core.current_publication_of_run(p_run_id) IS NULL') = 0
        OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.web_evidence_run_owner(uuid)', 'EXECUTE')))
      OR (v_item.kind = 'flag' AND ((pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, 'identity.request_owner_matches(v.reporter_ref)', '')))
          / pg_catalog.length('identity.request_owner_matches(v.reporter_ref)') <> 2
        OR pg_catalog.strpos(v_definition, 'REQUEST_OWNER_MISMATCH') > 0
        OR pg_catalog.strpos(v_definition, 'IF p_verdict = ''AGREE'' AND v.dismissed_at IS NULL AND identity.request_owner_matches(v.reporter_ref) AND ') = 0
        OR pg_catalog.strpos(v_definition, 'IF p_verdict = ''AGREE'' AND v.dismissed_at IS NULL')
          < pg_catalog.strpos(v_definition, 'SELECT * INTO v FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id FOR UPDATE;')))
      OR (v_item.kind = 'opens' AND (pg_catalog.strpos(v_definition, E'  v_limits := identity.public_flag_site_limits();\n') = 0
        OR pg_catalog.strpos(v_definition, E'  v_limits := identity.public_flag_site_limits();\n') > pg_catalog.strpos(v_definition, 'identity:public-flag-person:')
        OR pg_catalog.strpos(v_definition, ') >= v_person_hour THEN RETURN ''LIMITED''') = 0
        OR (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, ') < v_debate_day', ''))) / pg_catalog.length(') < v_debate_day') <> 2
        OR pg_catalog.strpos(v_definition, ') < v_site_day;') = 0
        OR v_definition ~ '\)\s*(>=|<)\s*p_(person_hour|debate_day|site_day)\M'
        OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.public_flag_site_limits()', 'EXECUTE')))
      OR (v_item.kind IN ('refuses', 'opens', 'raises') AND pg_catalog.strpos(v_definition, pg_catalog.format(E'\nBEGIN\n  IF NOT identity.request_owner_matches(%s) THEN RAISE EXCEPTION USING ERRCODE=''42501'', MESSAGE=''REQUEST_OWNER_MISMATCH''; END IF;\n', v_item.owner_arg))
        IS DISTINCT FROM pg_catalog.strpos(v_definition, E'\nBEGIN\n'))
      OR (v_item.kind = 'raises' AND (pg_catalog.strpos(v_definition, E' LANGUAGE plpgsql\n') = 0
        OR (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, 'identity.request_owner_matches(', ''))) / pg_catalog.length('identity.request_owner_matches(') <> 1
        OR pg_catalog.strpos(v_definition, E'END IF;\n  RETURN ') = 0))
      OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.request_owner_matches(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 asks % %', v_item.kind, v_item.signature;
    END IF;
  END LOOP;
  -- F5: 0144's charge writer, the marker's alone (above), asks nothing of the connection: it runs after the call was paid, so an owner question could
  -- only leave a paid call out of its person's quota. After the ledger row and right before its person's row, it takes the call's reservation for that
  -- very owner, made on the request's own login while the session was live (that one refuses unless the helper agrees), and with none names the owner
  -- it is handed, as a login that holds the marker may name any; it keeps the grant it is handed only when it is the person's own and was running when
  -- the call was reserved (its owner, which owns 0092's grants, may read them), and refuses nothing: 0144's one refusal of a malformed call stays its
  -- only RAISE.
  v_definition := pg_catalog.pg_get_functiondef('identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)'::regprocedure);
  SELECT p.proowner INTO v_proowner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)'::regprocedure;
  IF pg_catalog.strpos(v_definition, E'  DELETE FROM identity.ask_clarify_reservation AS reservation WHERE reservation.charge_id = p_charge_id AND reservation.owner_ref = p_owner\n    AND reservation.reserved_at > pg_catalog.clock_timestamp() - interval ''1 hour'' RETURNING reservation.reserved_at INTO v_admitted;\n  v_admitted := COALESCE(v_admitted, pg_catalog.clock_timestamp());\n  IF NOT EXISTS (SELECT 1 FROM billing.internal_grant AS grant_row WHERE grant_row.grant_id = p_grant AND grant_row.configured_event_id = p_event\n      AND grant_row.owner_ref = p_owner AND grant_row.starts_at <= v_admitted AND grant_row.expires_at > v_admitted\n      AND (grant_row.revoked_at IS NULL OR grant_row.revoked_at > v_admitted)) THEN\n    p_grant := NULL;\n    p_event := NULL;\n  END IF;\n  BEGIN\n    INSERT INTO identity.ask_clarify_charge') = 0
    OR pg_catalog.strpos(v_definition, E'  v_admitted timestamptz;\nBEGIN\n') = 0
    OR pg_catalog.strpos(v_definition, 'DELETE FROM identity.ask_clarify_reservation') < pg_catalog.strpos(v_definition, 'INSERT INTO ledger.model_spend')
    OR pg_catalog.strpos(v_definition, 'request_owner_matches') > 0
    OR pg_catalog.strpos(v_definition, 'REQUEST_OWNER_MISMATCH') > 0
    OR pg_catalog.strpos(v_definition, 'UNOWNED') > 0
    OR (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, 'RAISE', ''))) / pg_catalog.length('RAISE') <> 1
    OR NOT pg_catalog.has_table_privilege(v_proowner, 'identity.ask_clarify_reservation', 'DELETE')
    OR NOT pg_catalog.has_table_privilege(v_proowner, 'billing.internal_grant', 'SELECT') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 clarify charge';
  END IF;
  -- F5: the refusals left alone (the header's F5) ask no owner: an owner question would read a connection that is not the owner's as not refused. Each
  -- is a definer a request login may still call, as before.
  FOR v_item IN SELECT * FROM (VALUES
      ('serve.run_removed_by_synthesis_check(uuid)'),
      ('billing.owner_erasure_pending(uuid)'),
      ('billing.owner_age_frozen(uuid)'),
      ('billing.owner_erasure_committed(uuid)'),
      ('billing.read_run_funding_basis(uuid)')
    ) AS refusal(signature) LOOP
    IF pg_catalog.strpos(pg_catalog.pg_get_functiondef(v_item.signature::regprocedure), 'identity.request_owner_matches(') > 0
      OR NOT pg_catalog.has_function_privilege('debateai_billing_runtime', v_item.signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 refusal asks %', v_item.signature;
    END IF;
  END LOOP;
  -- F5: and no other identity definer the API's billing role may call with an owner believes it, the two spend readers of 0144 and 0149 included. But the two
  -- named here, which arrived with the merge of the V4 line and do believe the owner they are handed (0157's reader of a person's own statements of reasons and of
  -- their contribution's review state): this step does not change them, and a step of its own is to ask them. A new definer that is not named still refuses.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'identity' AND p.prosecdef AND p.proargnames && ARRAY['p_owner_ref','p_owner']::text[]
        AND pg_catalog.has_function_privilege('debateai_billing_runtime', p.oid, 'EXECUTE')
        AND p.oid NOT IN ('identity.read_own_moderation_statements(uuid)'::regprocedure, 'identity.read_own_contribution_review(uuid,uuid)'::regprocedure)
        AND p.prosrc !~ 'identity\.(request_owner_matches|page_memory_run_owned)\(') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 owner believed';
  END IF;
  -- F5: the site's day is the system's to write. No role a request may hold inserts into its three tables, the marker does, and the request-facing
  -- roles still read them; and no definer a request login may call writes them, but 0107's settlement of a funded debate's admitted call, which
  -- asks the run's owner (above) and writes only the call its admission reserved. The language, question and clarify writers are the marker's alone
  -- (the moved list above).
  FOREACH v_role IN ARRAY ARRAY['ledger.model_spend', 'ledger.model_spend_hold', 'ledger.model_spend_reservation'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.unnest(v_roles) AS candidate(role) WHERE pg_catalog.has_table_privilege(candidate.role, v_role, 'INSERT'))
      OR NOT pg_catalog.has_table_privilege('debateai_rls_all_accounts', v_role, 'INSERT')
      OR NOT pg_catalog.has_table_privilege('debateai_runtime', v_role, 'SELECT') THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 day table %', v_role;
    END IF;
  END LOOP;
  SELECT COALESCE(pg_catalog.array_agg(p.oid::regprocedure::text ORDER BY 1), '{}') INTO v_grantees FROM pg_catalog.pg_proc AS p
  WHERE p.prosecdef AND p.prosrc ~ 'INSERT INTO ledger\.model_spend(_hold|_reservation)?\M'
    AND (pg_catalog.has_function_privilege('debateai_billing_runtime', p.oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_authorization_runtime', p.oid, 'EXECUTE'));
  IF v_grantees IS DISTINCT FROM ARRAY['billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)'] THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 day writers %', v_grantees;
  END IF;
  -- F5: 0000's sequence counter is written only through its allocator, a definer of the table's own owner with 0056's search path, which keeps the
  -- callers it had; no role a request may hold updates or removes the row (0000's INSERT stays: the one row's key admits no other). 0000's work queue keeps its UPDATE, under 0130's rule of the connection's own debates
  -- for every such role that holds it, and no other policy of the table is theirs.
  SELECT pg_catalog.pg_get_userbyid(c.relowner) INTO v_counter_owner FROM pg_catalog.pg_class AS c WHERE c.oid = 'ledger.sequence_allocator'::regclass;
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT COALESCE(pg_catalog.pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC')::text), '{}') INTO v_grantees
  FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
  WHERE p.oid = 'ledger.allocate_sequence()'::regprocedure AND a.grantee <> p.proowner AND a.privilege_type = 'EXECUTE';
  IF (SELECT NOT p.prosecdef OR pg_catalog.pg_get_userbyid(p.proowner) IS DISTINCT FROM v_counter_owner
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']
      FROM pg_catalog.pg_proc AS p WHERE p.oid = 'ledger.allocate_sequence()'::regprocedure)
    OR v_grantees IS DISTINCT FROM ARRAY['debateai_evaluator_api','debateai_evaluator_worker','debateai_runtime','debateai_settlement_watch']
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_roles) AS candidate(role)
      WHERE pg_catalog.has_table_privilege(candidate.role, 'ledger.sequence_allocator', 'UPDATE,DELETE,TRUNCATE')) THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 sequence %', v_grantees;
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c WHERE c.oid = 'core.work_item'::regclass)
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_roles) AS candidate(role) JOIN pg_catalog.pg_policy AS policy ON policy.polrelid = 'core.work_item'::regclass
      WHERE pg_catalog.has_table_privilege(candidate.role, 'core.work_item', 'UPDATE')
        AND (0 = ANY (policy.polroles) OR EXISTS (SELECT 1 FROM pg_catalog.unnest(policy.polroles) AS holder(oid)
          WHERE pg_catalog.pg_has_role(candidate.role, holder.oid, 'MEMBER')))
        AND (policy.polname <> 'rls_account' OR NOT policy.polpermissive
          OR pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) IS DISTINCT FROM 'rls.owns_run(run_id)'
          OR pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) IS DISTINCT FROM 'rls.owns_run(run_id)')) THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 work queue';
  END IF;
  -- F5: the site's flag limits read 0123's CURRENT release and the register's sealed row as their owner, who may, and name no number of the limits.
  v_definition := pg_catalog.pg_get_functiondef('identity.public_flag_site_limits()'::regprocedure);
  IF NOT pg_catalog.has_function_privilege(v_owner, 'core.read_current_release()', 'EXECUTE')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'register.register_row', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'register.register_version', 'SELECT')
    OR pg_catalog.strpos(v_definition, 'FROM core.read_current_release() AS current_release') = 0
    OR pg_catalog.strpos(v_definition, 'r.row_key = ''abuseLimits'' AND v.sealed') = 0
    OR pg_catalog.strpos(v_definition, 'MESSAGE=''PUBLIC_FLAG_LIMITS_UNRESOLVED''') = 0 THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 flag limits';
  END IF;
  -- F5: the billing functions keyed by a run or an owner ask in their bodies, once each, where section 3 put the question, and the owner of each may
  -- ask the helper: the sweep's list keeps no other owner's row, the readers answer as for nothing stored, the pin is the marker's first, and the settlement and the admission refuse before they lock, compare or write anything. Each keeps its
  -- grants, owner, definer flag and settings (the patch block refused any move), which 0130's verifier, run right after this step, pins.
  FOR v_item IN SELECT * FROM (VALUES
      ('billing.pending_erasure_owner_refs(uuid,integer)', 'candidate.owner_ref>p_after) AND identity.request_owner_matches(candidate.owner_ref)', 'candidate.owner_ref'),
      ('billing.read_internal_allowance_for_run(uuid,timestamptz)', 'OR NOT identity.request_owner_matches(v_scope.owner_ref) THEN RETURN NULL; END IF;', 'v_scope.owner_ref'),
      ('billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)',
        E'\nBEGIN\n  IF NOT pg_catalog.pg_has_role(session_user, ''debateai_rls_all_accounts'', ''MEMBER'') THEN RAISE EXCEPTION USING ERRCODE=''42501'', MESSAGE=''REQUEST_OWNER_MISMATCH''; END IF;\n', NULL),
      ('billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)',
        E'''INTERNAL_PROVIDER_ADMISSION_REQUIRED'';END IF;\n IF NOT identity.request_owner_matches((SELECT scope.owner_ref FROM billing.run_charge_scope AS scope WHERE scope.run_id=v_call.run_id)) THEN\n',
        '(SELECT scope.owner_ref FROM billing.run_charge_scope AS scope WHERE scope.run_id=v_call.run_id)'),
      ('billing.read_internal_run_state(uuid)', 'OR NOT identity.request_owner_matches(v_scope.owner_ref) THEN RETURN ''UNAVAILABLE'';END IF;', 'v_scope.owner_ref'),
      ('billing.read_internal_allowance(uuid,timestamptz)', E'''INTERNAL_ALLOWANCE_TIME_INVALID''; END IF;\n  IF NOT identity.request_owner_matches(p_owner) THEN RETURN NULL; END IF;\n', 'p_owner'),
      ('billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)',
        E'ORDER BY at_seq DESC LIMIT 1;END IF;\n IF NOT identity.request_owner_matches(v_owner) THEN RAISE EXCEPTION USING ERRCODE=''42501'', MESSAGE=''REQUEST_OWNER_MISMATCH'';END IF;\n', 'v_owner')
    ) AS billing(signature, needle, owner_arg) LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_item.signature::regprocedure);
    SELECT p.proowner INTO v_proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_item.signature::regprocedure;
    IF pg_catalog.strpos(v_definition, v_item.needle) = 0
      OR (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, 'identity.request_owner_matches(', '')))
        / pg_catalog.length('identity.request_owner_matches(') <> (CASE WHEN v_item.owner_arg IS NULL THEN 0 ELSE 1 END)
      OR (v_item.owner_arg IS NOT NULL AND pg_catalog.strpos(v_definition, pg_catalog.format('identity.request_owner_matches(%s)', v_item.owner_arg)) = 0)
      OR (v_item.owner_arg IS NULL AND (pg_catalog.length(v_definition)
          - pg_catalog.length(pg_catalog.replace(v_definition, 'debateai_rls_all_accounts', ''))) / pg_catalog.length('debateai_rls_all_accounts') <> 1)
      OR (v_item.signature LIKE 'billing.reserve_%' AND pg_catalog.strpos(v_definition, 'identity.request_owner_matches(')
        > pg_catalog.strpos(v_definition, 'PERFORM identity.lock_security_subjects('))
      OR (v_item.signature LIKE 'billing.settle_%' AND (pg_catalog.strpos(v_definition, 'identity.request_owner_matches(')
          > pg_catalog.strpos(v_definition, 'INTERNAL_PROVIDER_FRAME_INVALID')
        OR pg_catalog.strpos(v_definition, 'INTERNAL_PROVIDER_FRAME_INVALID') > pg_catalog.strpos(v_definition, 'PERFORM pg_advisory_xact_lock(')))
      OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.request_owner_matches(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 billing asks %', v_item.signature;
    END IF;
  END LOOP;
  -- F5: and no billing definer a request login may call with a run or an owner believes it but the two spend readers left out on purpose (F5 above),
  -- 0088's withdrawal grant (0093's body), which the step-up grant's token it is handed gates, and the four refusals left alone (above).
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p
      WHERE p.pronamespace = 'billing'::regnamespace AND p.prosecdef AND p.proargnames && ARRAY['p_owner_ref','p_owner','p_run']::text[]
        AND (pg_catalog.has_function_privilege('debateai_billing_runtime', p.oid, 'EXECUTE')
          OR pg_catalog.has_function_privilege('debateai_authorization_runtime', p.oid, 'EXECUTE'))
        AND p.prosrc !~ 'identity\.request_owner_matches\(|pg_catalog\.pg_has_role\(session_user, ''debateai_rls_all_accounts'', ''MEMBER''\)'
        AND p.oid NOT IN ('billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)'::regprocedure,
          'billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)'::regprocedure, 'billing.consume_withdrawal_grant(uuid,uuid,uuid,text)'::regprocedure,
          'billing.owner_erasure_pending(uuid)'::regprocedure, 'billing.owner_age_frozen(uuid)'::regprocedure,
          'billing.owner_erasure_committed(uuid)'::regprocedure, 'billing.read_run_funding_basis(uuid)'::regprocedure)) THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 billing owner believed';
  END IF;

  -- F5: the account functions keyed by a user id ask in their bodies, once each, where section 3 put the question, of the account they are handed,
  -- and the owner of each may ask the helper; the three sign-up writers ask no session, and find the account only when this very transaction wrote its
  -- row. Each kept its grants, owner, definer flag and settings (the patch block refused any move).
  FOR v_item IN SELECT * FROM (VALUES
      ('identity.revoke_session_with_audit(uuid,uuid,timestamptz,jsonb)', 'IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN', 'v_account.owner_ref'),
      ('identity.revoke_all_sessions_with_audit(uuid,uuid,timestamptz,jsonb)', 'IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN', 'v_account.owner_ref'),
      ('identity.read_age_check_outcome(uuid)', E'WHERE age.user_id=p_user_id\n    AND identity.request_owner_matches(',
        '(SELECT account.owner_ref FROM identity."user" AS account WHERE account.user_id=p_user_id)'),
      ('identity.confirm_account_age_with_audit(uuid,uuid,boolean,smallint,text,text,timestamptz,jsonb)',
        'IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN', 'v_account.owner_ref'),
      ('identity.record_registration_age_check(uuid,smallint,text,text,timestamptz)',
        E'identity_user.state=''pending_verification''\n      AND identity_user.xmin=pg_catalog.pg_current_xact_id()::xid\n', NULL),
      ('identity.read_sensitive_data_consent(uuid)', E'WHERE consent.user_id=p_user_id\n    AND identity.request_owner_matches(',
        '(SELECT account.owner_ref FROM identity."user" AS account WHERE account.user_id=p_user_id)'),
      ('identity.record_sensitive_data_consent(uuid,uuid,text,text,timestamptz)', 'identity_user.state=''active'' AND identity.request_owner_matches(identity_user.owner_ref)',
        'identity_user.owner_ref'),
      ('identity.read_email_settings(uuid,uuid)', 'account.state=''active'' AND identity.request_owner_matches(account.owner_ref)', 'account.owner_ref'),
      ('identity.resend_email_change_with_audit(uuid,uuid,text,timestamptz,bigint,jsonb)', 'IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN',
        'v_account.owner_ref'),
      ('identity.reserve_publication_event_refs(uuid,uuid,uuid,text,text)',
        'IF v_account.audit_token IS NULL OR NOT identity.request_owner_matches(v_account.owner_ref) THEN RETURN; END IF;', 'v_account.owner_ref'),
      ('serve.abandon_publication_key_provision(uuid,uuid)',
        'IF v_account.owner_ref IS NULL OR NOT identity.request_owner_matches(v_account.owner_ref) THEN RETURN false; END IF;', 'v_account.owner_ref'),
      ('identity.record_registration_region(uuid,text,text)', E'identity_user.state=''pending_verification''\n      AND identity_user.xmin=pg_catalog.pg_current_xact_id()::xid\n', NULL),
      ('identity.read_data_export_status(uuid)', 'WHERE e.user_id=p_user_id AND identity.request_owner_matches(',
        '(SELECT account.owner_ref FROM identity."user" AS account WHERE account.user_id=p_user_id)'),
      ('identity.record_data_export_download(uuid,uuid,jsonb)', E'e.expires_at>clock_timestamp()\n      AND identity.request_owner_matches(u.owner_ref);', 'u.owner_ref'),
      ('identity.record_signup_italy_approval(uuid,jsonb)',
        E'(''pending_verification'',''pending_mfa'')\n    AND identity_user.xmin = pg_catalog.pg_current_xact_id()::xid;', NULL)
    ) AS account(signature, needle, owner_arg) LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_item.signature::regprocedure);
    SELECT p.proowner INTO v_proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_item.signature::regprocedure;
    IF pg_catalog.strpos(v_definition, v_item.needle) = 0
      OR (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, 'identity.request_owner_matches(', '')))
        / pg_catalog.length('identity.request_owner_matches(') <> (CASE WHEN v_item.owner_arg IS NULL THEN 0 ELSE 1 END)
      OR (v_item.owner_arg IS NOT NULL AND (pg_catalog.strpos(v_definition, pg_catalog.format('identity.request_owner_matches(%s)', v_item.owner_arg)) = 0
        OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.request_owner_matches(uuid)', 'EXECUTE')))
      OR (v_item.owner_arg IS NULL AND (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, 'pg_catalog.pg_current_xact_id()', '')))
        / pg_catalog.length('pg_catalog.pg_current_xact_id()') <> 1) THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 account asks %', v_item.signature;
    END IF;
  END LOOP;
  -- F5: the delivery's overload is its original's body with one question before it touches the channel, the mail's own token among the account's
  -- credentials, and its owner is the original's, which may read them (the original is no role's: above).
  v_definition := pg_catalog.pg_get_functiondef('identity.record_verification_delivery_with_audit(uuid,text,timestamptz,boolean,text,jsonb)'::regprocedure);
  SELECT p.proowner INTO v_proowner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.record_verification_delivery_with_audit(uuid,text,timestamptz,boolean,text,jsonb)'::regprocedure;
  IF pg_catalog.strpos(v_definition, 'credential.channel_binding_id=v_channel.channel_binding_id AND credential.token_hash=p_token_hash') = 0
    OR pg_catalog.strpos(v_definition, 'credential.token_hash=p_token_hash') > pg_catalog.strpos(v_definition, 'UPDATE identity.channel_binding')
    OR pg_catalog.strpos(v_definition, 'credential.token_hash=p_token_hash') < pg_catalog.strpos(v_definition, 'identity.lock_account_t9_internal(')
    OR pg_catalog.pg_get_userbyid(v_proowner) IS DISTINCT FROM v_delivery
    OR NOT pg_catalog.has_table_privilege(v_proowner, 'identity.verification_token_credential', 'SELECT') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 delivery %', pg_catalog.pg_get_userbyid(v_proowner);
  END IF;

  -- F2: each refusal stands in its body, and the owner of each may ask the helper (no grant is made for that: 0085's key provision and 0127's review
  -- ask are the migrator's, the helper's owner); the API's reader answers a dig, failing closed, for a connection that is not the owner's, and asks
  -- 0131's rule before the helper. The Free claim is the first question of both of the Free path's writers.
  FOR v_item IN SELECT * FROM (VALUES
      ('serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text)', E'END IF;\n  IF identity.run_is_dig(p_run_id) THEN RETURN false; END IF;\n'),
      ('serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)', E'END IF;\n  IF identity.run_is_dig(p_run_id) THEN RETURN ''NOT_ALLOWED''; END IF;\n'),
      ('identity.read_free_debates_to_publish(integer)', 'IS NOT DISTINCT FROM ask.owner_ref AND NOT identity.run_is_dig(ask.run_id)'),
      ('identity.claim_free_public_ask(uuid)', 'IF NOT FOUND OR v_ask.outcome IS NOT NULL OR identity.run_is_dig(p_run_id) OR'),
      ('identity.record_free_public_ask(uuid,uuid)', 'IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) OR identity.run_is_dig(p_run_id) THEN RETURN ''NOT_OWNED''; END IF;'),
      ('identity.read_run_is_dig(uuid,uuid)', E'WHEN NOT identity.request_owner_matches(p_owner_ref) THEN true\n    WHEN identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN identity.run_is_dig(p_run_id) END')
    ) AS refusing(signature, needle) LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_item.signature::regprocedure);
    SELECT p.proowner INTO v_proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_item.signature::regprocedure;
    IF pg_catalog.strpos(v_definition, v_item.needle) = 0
      OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.run_is_dig(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 refuses %', v_item.signature;
    END IF;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['core.prepare_free_publication(uuid,uuid)', 'core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)'] LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_role::regprocedure);
    IF pg_catalog.strpos(v_definition, 'v_owner := identity.claim_free_public_ask(p_run_id);') = 0
      OR pg_catalog.strpos(v_definition, 'v_owner := identity.claim_free_public_ask(p_run_id);') > pg_catalog.strpos(v_definition, 'INSERT INTO ') THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 Free path %', v_role;
    END IF;
  END LOOP;
  -- F2: the helper follows a re-admission back through 0123's edges, which its owner may read, at most 16.
  v_definition := pg_catalog.pg_get_functiondef('identity.run_is_dig(uuid)'::regprocedure);
  IF NOT pg_catalog.has_table_privilege(v_owner, 'core.run_supersession', 'SELECT')
    OR pg_catalog.strpos(v_definition, 'FROM core.run_supersession AS edge JOIN chain ON edge.new_run_id = chain.run_id WHERE chain.hops < 16') = 0 THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 re-admission';
  END IF;
  -- F2: in the key provision, after the owner's and the live content's checks, before the link's tombstone and the intent the transition needs.
  v_definition := pg_catalog.pg_get_functiondef('serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text)'::regprocedure);
  IF pg_catalog.strpos(v_definition, 'IF identity.run_is_dig(p_run_id) THEN RETURN false; END IF;')
      < pg_catalog.strpos(v_definition, 'OR NOT core.run_private_content_is_live(p_run_id) THEN')
    OR pg_catalog.strpos(v_definition, 'IF identity.run_is_dig(p_run_id) THEN RETURN false; END IF;')
      > pg_catalog.strpos(v_definition, 'INSERT INTO core.publication_ref_tombstone')
    OR pg_catalog.strpos(v_definition, 'INSERT INTO core.publication_ref_tombstone') = 0 THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 key provision order';
  END IF;
  -- F2: in the review ask, after the grant's and the request's checks, before the grant is consumed and the request is queued.
  v_definition := pg_catalog.pg_get_functiondef('serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)'::regprocedure);
  IF pg_catalog.strpos(v_definition, 'IF identity.run_is_dig(p_run_id) THEN RETURN ''NOT_ALLOWED''; END IF;')
      < pg_catalog.strpos(v_definition, 'IF v_requests>=2 THEN RETURN ''NOT_ALLOWED''; END IF;')
    OR pg_catalog.strpos(v_definition, 'IF identity.run_is_dig(p_run_id) THEN RETURN ''NOT_ALLOWED''; END IF;')
      > pg_catalog.strpos(v_definition, 'UPDATE identity.step_up_grant g SET consumed_at=clock_timestamp()')
    OR pg_catalog.strpos(v_definition, 'UPDATE identity.step_up_grant g SET consumed_at=clock_timestamp()')
      > pg_catalog.strpos(v_definition, 'INSERT INTO serve.publication_review_request') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 review order';
  END IF;
  -- F2: a dig's row is its owner's alone, as 0131's tables are, with the truncate guard, going with the account; no role may read or write it, and
  -- the question reads it.
  IF (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class AS c WHERE c.oid = 'identity.dig_run'::regclass) IS DISTINCT FROM v_owner
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS a
      WHERE c.oid = 'identity.dig_run'::regclass AND a.grantee <> c.relowner)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.dig_run'::regclass AND t.tgname = 'reject_truncate')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'identity.dig_run'::regclass AND k.contype = 'f'
      AND k.confrelid = 'identity."user"'::regclass AND k.confdeltype = 'c')
    OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('identity.run_is_dig(uuid)'::regprocedure), 'FROM identity.dig_run AS mark WHERE mark.run_id = chain.run_id') = 0 THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 dig row';
  END IF;
  FOREACH v_role IN ARRAY v_roles LOOP
    IF pg_catalog.has_table_privilege(v_role, 'identity.dig_run', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 dig row reachable %', v_role;
    END IF;
  END LOOP;
  -- F2: the run's creation writes a dig's row, once, right after the run's ownership event and before its key provision is completed, after the
  -- document's closed key list has taken the mark and refused any value but JSON true; its owner (0040's, the migrator) may write the row, ask the
  -- question and read the intent that names the run a re-admission copies; and its grant is still the content provision's alone.
  v_definition := pg_catalog.pg_get_functiondef('core.create_encrypted_run(jsonb,uuid,uuid,jsonb)'::regprocedure);
  SELECT p.proowner INTO v_proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'core.create_encrypted_run(jsonb,uuid,uuid,jsonb)'::regprocedure;
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT COALESCE(pg_catalog.pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC')::text), '{}') INTO v_grantees
  FROM pg_catalog.pg_proc AS p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
  WHERE p.oid = 'core.create_encrypted_run(jsonb,uuid,uuid,jsonb)'::regprocedure AND a.grantee <> p.proowner;
  IF pg_catalog.strpos(v_definition, E'''contentAttestationSecret'',''releaseKey'',''digRun''\n  ]::text[]') = 0
    OR pg_catalog.strpos(v_definition, E'OR (p_run ? ''digRun'' AND p_run->''digRun'' IS DISTINCT FROM ''true''::jsonb) THEN\n    RETURN false;') = 0
    OR (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, 'INSERT INTO identity.dig_run', '')))
      / pg_catalog.length('INSERT INTO identity.dig_run') <> 1
    OR pg_catalog.strpos(v_definition, 'INSERT INTO identity.dig_run (run_id, owner_ref) VALUES (v_run_id, p_owner_ref)')
      < pg_catalog.strpos(v_definition, 'PERFORM core.append_run_ownership_event(v_run_id,p_owner_ref);')
    OR pg_catalog.strpos(v_definition, 'INSERT INTO identity.dig_run (run_id, owner_ref) VALUES (v_run_id, p_owner_ref)')
      > pg_catalog.strpos(v_definition, 'IF NOT core.complete_run_key_provision(')
    OR pg_catalog.strpos(v_definition, 'OR (p_run ? ''digRun''') > pg_catalog.strpos(v_definition, 'INSERT INTO core.run_content_attestation_secret')
    OR NOT pg_catalog.has_table_privilege(v_proowner, 'identity.dig_run', 'INSERT')
    OR NOT pg_catalog.has_function_privilege(v_proowner, 'identity.run_is_dig(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_table_privilege(v_proowner, 'core.run_key_provision_intent', 'SELECT')
    OR v_grantees IS DISTINCT FROM ARRAY['debateai_content_provision'] THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 dig row at creation';
  END IF;
  -- F2: every dig that was there as this step applied, by any of its four records, is marked, but a run erased and an owner gone (section 1).
  IF EXISTS (SELECT 1 FROM (SELECT picks.run_id FROM identity.dig_pick_set AS picks
        UNION SELECT contribution.dig_run_id FROM identity.public_contribution AS contribution
        UNION SELECT member.run_id FROM identity.investigation_member AS member WHERE member.parent_run_id IS NOT NULL
        UNION SELECT link.child_run_id FROM identity.dig_link AS link) AS dig (run_id)
      CROSS JOIN LATERAL (SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = dig.run_id ORDER BY event.at_seq DESC LIMIT 1) AS owner_now
      WHERE EXISTS (SELECT 1 FROM identity."user" AS account WHERE account.owner_ref = owner_now.owner_ref)
        AND NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS erased WHERE erased.run_id = dig.run_id)
        AND NOT EXISTS (SELECT 1 FROM identity.dig_run AS mark WHERE mark.run_id = dig.run_id)) THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 dig row backfill';
  END IF;
  -- F2: the digs published before this step stay published; how many, for the operator's step (migrations/lineage/README.md).
  SELECT pg_catalog.count(DISTINCT snapshot.run_id) INTO v_published FROM serve.publication_snapshot AS snapshot
  WHERE core.publication_is_current(snapshot.publication_ref) AND identity.run_is_dig(snapshot.run_id);
  RAISE NOTICE 'SECURITY_REVIEW_0171 F2 % digs published before this step stay published: staff hide each through the public review''s HIDE, or its owner keeps it (migrations/lineage/README.md, 0171)', v_published;
  -- F2: 0131's per-debate forget takes the erased debate's own row, after its links, and no other (never one by its parent); its owner may.
  v_definition := pg_catalog.pg_get_functiondef('identity.forget_erased_debate_page_memory(uuid)'::regprocedure);
  IF pg_catalog.strpos(v_definition, E'  DELETE FROM identity.dig_run AS mark WHERE mark.run_id = p_run_id;\n  GET DIAGNOSTICS v_marks = ROW_COUNT;\n  RETURN v_visits + v_links + v_marks;') = 0
    OR pg_catalog.strpos(v_definition, 'DELETE FROM identity.dig_run') < pg_catalog.strpos(v_definition, 'DELETE FROM identity.dig_link')
    OR (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, 'identity.dig_run', ''))) / pg_catalog.length('identity.dig_run') <> 1
    OR NOT pg_catalog.has_table_privilege((SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.forget_erased_debate_page_memory(uuid)'::regprocedure),
      'identity.dig_run', 'DELETE') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F2 dig row forget';
  END IF;

  -- F4b: the reviewer's door asks whether the link is current before it marks anything read, and its owner may ask.
  v_definition := pg_catalog.pg_get_functiondef('staff.read_public_review(jsonb,text,uuid)'::regprocedure);
  IF pg_catalog.strpos(v_definition, 'NOT core.publication_is_current(p_publication_ref) THEN RETURN NULL;') = 0
    OR pg_catalog.strpos(v_definition, 'NOT core.publication_is_current(p_publication_ref) THEN RETURN NULL;') > pg_catalog.strpos(v_definition, 'identity.public_review_mark_read(') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F4b read_public_review';
  END IF;
  IF NOT pg_catalog.has_function_privilege((SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'staff.read_public_review(jsonb,text,uuid)'::regprocedure),
      'core.publication_is_current(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F4b owner';
  END IF;
END
$security_review_contract$;
