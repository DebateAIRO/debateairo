# Opening the test server as dezbatere.ro, and closing it again

This is the owner's runbook for the test server (the "preview kit" in this folder). It starts with the preparation
for the upload and ends with every lock closed again. Read part 0 and the order rules first. Then do the parts in order.

## 0. What this is

The test server is locked on purpose. There are six locks:

1. **The name.** The website and the API answer only as the test name (v3-preview.dezbatere.ro).
2. **The team.** Only the accounts on the team list may start debates, and only they may buy a plan (with the release
   that carries part 6b this holds on NETOPIA's sandbox too; before it, any signed-in account could buy a test plan
   there).
3. **Mail.** Mail goes only to the four allow-listed addresses.
4. **Payments.** Only NETOPIA's sandbox is admitted: test cards, no real money.
5. **The site password.** Caddy (the web server in front of the website) asks every visitor for a password.
   There are two exceptions. The NETOPIA review window (5.8) lets strangers read the public pages. Part 6b takes the
   password off on dezbatere.ro while payments are still NETOPIA's sandbox: strangers may then sign up and use the
   Free plan, and only the accounts you list may buy test plans. 6b is the one way the password comes off before real
   payments.
6. **The old release's files.** The release before this one knows none of the new settings. You can go back to it only
   with every lock closed, and only while LIVEAFTER (7.12) says no real-payment record would be lost (part 9).

"Closed" means: the server behaves exactly as it does today. The release you upload is closed by default.

Each lock opens with one server setting and closes again by putting that setting back. The code checks every setting
when the API, the website or the runner starts (the runner is the program that runs the debates). A wrong or half-made
setting stops that service, and the journal names the setting with a short code. Part 10 lists every code.

## How to use this document

**Words.**
- *The website* is the part people see; *the API* is the part the website talks to; *the runner* runs the debates.
- *The release* is the code you upload; `$LABEL` is its name on the server.
- *The test name* is v3-preview.dezbatere.ro; *the main name* is dezbatere.ro.
- *The egress proxy* is a small program that lets the API reach only the payment companies, and nothing else on the
  Internet.
- *A drop-in* is a small extra file next to a systemd service file. It changes one line of the service without
  editing the service file itself.
- *The release guide* is `deploy/preview-release/v1/README.md`.
- *The upload folder* is the folder on your Mac at exactly the commit you upload (REV), made in the preparation (1.8).
- *M1, M2, M8* are mails to the buyer: M1 is the confirmation (with the Terms the account accepted, as a file, when they
  are the launch texts: 7.8), M2 the receipt, M8 the mail that confirms a withdrawal's refund. *O2_REFUND_DUE*,
  *O2_WITHDRAWAL* and *O3* are mails to you: O2_REFUND_DUE is a refund you must make in NETOPIA's admin; O2_WITHDRAWAL
  is a withdrawal whose refund you must settle by hand; O3 is a billing job that failed for good (for example an invoice
  SmartBill refused).
- *A bcrypt hash* is the scrambled form of the site password that Caddy keeps. The password itself is never stored.
- *A stranger* is a browser that sends no site password and holds no sign-in cookie of this site.
- *The NETOPIA review window* (5.8) lets strangers read the public pages of dezbatere.ro; everything else keeps the
  site password.
- *The point of sale (POS)* is your shop's entry in NETOPIA's admin; NETOPIA approves card payments for it.
- *The shop id* is the short number in the logo code on NETOPIA's admin page **Identitate vizuală** (the digits of
  `secret="…"`, 1.1). Despite that word, it is not a secret.
- *A Next.js page request* is the website's own background request when it moves to another page (Next.js is the
  website's framework).
- *A listed account* (6b) is an account that may buy test plans while asks are open with `everyone-with-listed-buyers`:
  an account on the team line (`PREVIEW_TEAM_USER_IDS_JSON`), or, on a release that carries it, an account you allowed
  on the Team page. *The list* is the team line together with *the Team page's list*, the box "Who may buy while
  payments are in test mode" on the Team page, which you change with your security key and no restart (6b.3). The
  Team page's list comes with the release that carries the database step 0186; before that release, the list is the
  team line alone, changed with BUYERS (6b.3b).

**How to run a server step.** Each block that starts with `set -euo pipefail` is one script. There are two ways to
run one: the ordinary way, and the detached run.

*The ordinary way* (every step while the site is up, unless its text says otherwise):
1. On the server, as root, remove the last step's file and open an empty one:
   `rm -f /root/ms-step.sh; nano /root/ms-step.sh`. nano must show an empty file. If it shows any text, stop.
2. Paste the whole block. Save (Ctrl-O, Enter) and close (Ctrl-X).
3. Run it: `bash /root/ms-step.sh`.
4. Read the last line. It says `<STEP>_DONE`, or `<STEP>_NOT_DONE: <why>`.

*The detached run* (every downtime step of the upload, DR2 to DR6 and SWAP, both ways back, rbD-A and rbD-B, and
every repair block of part 2's repair map). A step run the ordinary way lives in your ssh window: if the connection
drops or the window closes, the script and the tools it runs stop where they stand, and most downtime steps cannot
simply be run again. A detached run is handed to systemd, outside the window. It writes everything it prints into a
log file, and it goes on to its end when the window is lost. (`nohup` is not enough: the tools that are node programs
still stop when the window closes.)
1. On the server, as root, set the last step's log aside, remove the last step's file and open an empty one. The line
   first checks that no detached step still runs; if one does, it says so and does nothing else:
   `[ -z "$(systemctl list-units 'ms-step-*' --no-legend --state=active,activating,deactivating)" ] || { echo "a step still runs: read its log first"; false; } && { [ ! -e /root/ms-step.log ] || mv /root/ms-step.log "/root/ms-step-$(date -u +%Y%m%dT%H%M%S).log"; } && rm -f /root/ms-step.sh && nano /root/ms-step.sh`.
   nano must show an empty file. Paste the whole block, fill in its `<…>` values, save and close. A detached step
   cannot ask you anything while it runs: values such as DR5's `YES` are typed into the file before it starts.
2. Start it. This line too refuses while another detached step still runs:
   `[ -z "$(systemctl list-units 'ms-step-*' --no-legend --state=active,activating,deactivating)" ] || { echo "a step still runs: read its log first"; false; } && U=ms-step-$(date -u +%H%M%S) && systemd-run --unit="$U" --collect --setenv=HOME=/root -p StandardOutput=append:/root/ms-step.log /bin/bash /root/ms-step.sh && echo "$U started"`.
   It prints the unit's name and `<name> started` at once, and gives the prompt back. Its error lines go into the same
   log. If you start the same file again without step 1, the new lines come after the old ones, so the last line is
   always the newest run's.
3. Watch it: `tail -n +1 -f /root/ms-step.log`. When the last line is the step's own `<STEP>_DONE` or
   `<STEP>_NOT_DONE: …`, press Ctrl-C. Ctrl-C stops only the watching, never the step.
4. Read the last line, as above.

If the window is lost during a detached run, open a new one, connect, `sudo -i`, then:
- `systemctl list-units 'ms-step-*' --all --no-legend`: a line means the step still runs. Wait, and run it again until it
  prints nothing.
- `tail -n 40 /root/ms-step.log`: the step's last lines.

The step went on by itself. Never paste a downtime step a second time without reading its log first. The earlier
steps' logs stay as `/root/ms-step-<time>.log`. TRYDETACH (1.8) tries this way once on the server, before the
downtime, with nothing at stake.

After `<STEP>_NOT_DONE`, run nothing more. Read the reason. Do what the text under the block says, or ask. Every
script checks first and changes things last, so a script that stops early has changed nothing, unless its message
says otherwise. If a script stops with no `<STEP>_…` line at all (and, for a detached run, nothing still runs), treat
it as `<STEP>_NOT_DONE` and ask.

**Typing a value.** A few steps ask you to type a key, a label or an address. Type it at the prompt. Keys are not shown
while you type, and nothing you type goes on a command line. Never paste a key, a password or an address into a chat
with Claude.

**Amounts on the screen.** Any line that shows a daily pot, a spend, a price or a charge stays on your screen: never
paste it into a chat, a GitHub issue or a pull request. Such lines come from GATES and the scripts that call it (the
day's spend of each spending gate), each gate's own `status` lines, POTS and the Amazon gate's range of pots (1.8 and
part 2), the practice (its closing line `team limit: … charged …`, the gate and ceiling lines of its `report.md`, the
`PRE_START` lines of its `start-month.jsonl`, and S-7's two status lines), WITHDRAWOTHER, REFUNDDONE, and the tax
summary of EFACTURA. The practice's folder `$P` on your Mac holds your figures from the server too: keep it private.
When you ask for help, give the step's last line, and say which step it was. For the practice, give its verdict words
only (for example `PRACTICE_VERDICT PASS`), also where the practice guide says to report in the chat.

**`<…>` in a block** is a value you fill in before you run it. `rNN` is the upload's number, as in the release guide.

**"To confirm on the server"** marks a step this document could not check against the code. Do it slowly, and ask
if the server shows something else.

## The order

| Part | What | The site | The way back |
|---|---|---|---|
| 1 | before the upload: the companies, DNS, mail, old debates, your numbers; the preparation (1.8): the checks, the staging, the practice | unchanged | nothing to undo |
| 2 | the upload day, every lock closed: the gates, the checks, your yes, the downtime, the proofs after it (the step before Start goes on) | the release guide's downtime | the release guide's way back, and part 2's repair map |
| 3 | your sandbox payment test, on the test name, behind the password | unchanged | close the sandbox records |
| 4 | mail: allow-list on the new path, then open | password on | MAIL_CLOSE |
| 5 | the main name, and your staff key on it (5.7) | password on | NAME5 |
| 5.8 | the NETOPIA review window: the public pages without the password (after NAME4), then NETOPIA's review (5.8b) | public pages open; sign-in, sign-up, debates and buying behind the password | REVIEW_CLOSE (or PWON) |
| 5.9 | public debates: publishing switched on (after 5.7), still behind the site password | password on; public debates readable by those who know it | PUBOFF stops the public pages; what was public stays recorded (5.9b) |
| 6 | friends' test with test payments (it may run while NETOPIA reviews) | password on | ASKS_CLOSE |
| 6b | the whole site open while payments are NETOPIA's sandbox: anyone may sign up and ask on the Free plan, only the accounts you list may buy test plans (after part 5 and 5.7, on a release that carries it; before you enrol the point of sale, 5.8b step 3) | open | PWON, then ASKS_CLOSE |
| 7 | real payments (only after NETOPIA's approval and the signed contract; 6b closed first; if anyone outside the team had the site password, a new one first) | password on | PAY_BACK |
| 8 | opening to everyone: asks, then the password off (only once your staff key works on dezbatere.ro, 5.7) | open | PWON, ASKS_CLOSE |
| 9 | closing everything again | closed | – |
| 10 | every named refusal code | – | – |

**The upload day, and the days after.** Part 1 ends with the preparation (1.8): the server's names and staging, the
practice, and the checks that need no downtime. It runs the day before the upload, or earlier on the upload day
itself. One test debate after the switch serves both SB13b and the proof of the step before Start. Parts 2 to 5, up to and including the review window (5.8), fit in the upload day: the upload, your
sandbox test, mail, the name, your staff key there (5.7) and the window. The upload switches the step before Start on
(part 2). It also brings the spending gate for one more AI model, OpenAI's GPT-6 Luna, served by Amazon: its steps are
LUNAROW, before the practice (1.8), and in part 2 (the gates before SB3, two things at SB4, BEDROCK_ENV after DR1 and
the proof and fence steps, GATEREADY and GATELIVE before your yes). Luna itself is switched on later, on a day of
its own (the release guide's piece 4), not on the upload day. Real payments do not fit in the upload day: NETOPIA's
point of sale is not enrolled yet, and four of NETOPIA's steps remain:
1. you enrol the point of sale in NETOPIA's admin and tick its conditions, once the window is open (5.8b);
2. NETOPIA checks your identity;
3. NETOPIA checks your shop's profile, and looks at https://dezbatere.ro without a password;
4. the contract.

They take as long as NETOPIA takes. Part 7 begins only after NETOPIA's approval and the signed contract, days after the
upload, with no new upload. Meanwhile the window stays open, and a friends' test with test payments (part 6) may run
behind the password. Or, on a release that carries it, the whole site opens with part 6b instead of both, before you
enrol the point of sale.

These can also hold you up:
- Mail opens only when SES shows Production access. Amazon's review can take up to a day, so ask for it the day
  before (1.4).
- Cancel your own sandbox plans: a cancelled plan does not block real payments. The account that holds it cannot buy a
  live plan until that plan's month ends, so pay with another team account (7.2). A sandbox purchase as a Romanian
  buyer blocks real payments for about 14.6 hours. A payment page that anyone left unfinished blocks them for up to
  24 hours (3.2, 6).
- ANAF's answer to an invoice or a credit note can take hours. Record it when it comes (7.9).
- The refund of the first real payment may be recorded only the next day (7.10). Going back to the sandbox (7.11)
  waits for it and for its credit note.

It is fine to end the upload day with the review window open and payments still on NETOPIA's sandbox: that is the
state 5.8 leaves. Part 7, on its own day, leaves real payments on, behind the site password, with asks for the team
only. Do all staff work (Hide now) on the test name before the rename (1.6): a staff key belongs to one name, so from
the rename on nobody can use the staff screens until their staff key is enrolled again under dezbatere.ro (5.7). Part
8 (opening to everyone) waits for that. On a server whose staff screens are off (STAFFCHECK, 1.6) there is no staff
work to do before the rename: Hide now first comes back with 5.7 (STAFFMAIN, then REKEY).

**A friends' test while NETOPIA reviews.** NETOPIA's steps leave days between the upload and part 7, so a friends'
test (part 6) fits there, behind the site password, with the review window open. Close it before part 7: ASKS_CLOSE,
then PAY0 (7.1) until it prints all zeros, then a new site password (PWNEW, 7.0), as the order rules say.

**The whole site open before real payments (6b).** The upload of a release that carries it comes first. Then, with the
site answering as dezbatere.ro, your staff key working there (5.7) and mail open (4.3), ASKS_OPEN with
`V=everyone-with-listed-buyers` behind the password, then PWOFF1, the hand edit and PWOFF2 (part 8's steps). Strangers
sign up and use the Free plan; only the accounts on the list may buy test plans; nobody needs the site password. Then
you enrol the point of sale (5.8b). Before part 7 it closes again (6b.6). Part 6b says all of it.

**If NETOPIA approves before you have had a friends' test,** part 7 comes first. Skip 7.0 only if nobody outside the
team has had the site password. If NETOPIA's tester had it (5.8b), run PWNEW (7.0) first. Friends can then come in
while payments are real: run ASKS_OPEN
(6.1) with the line `V=everyone`, and stop there, so the site password stays on. They use the Free plan. Tell them
not to press **Abonați-vă și plătiți** (Subscribe and pay): payments are real, a plan one of them buys renews every
month until they cancel it in Settings, and PAY_BACK waits for it. Tell them too that, once publishing is on (5.9), a finished Free debate can go
public by itself, to everyone inside the site password, and that nobody can take it down by hand until your staff
key works on dezbatere.ro (5.7). When your own refund and its credit note are
recorded, run ASKS_CLOSE (6.3), then PAY_BACK (7.11), then part 6 as written, with test payments. Before real payments
go on a second time, that friends' test closes and the site password changes (7.0), as the order rules say.

**The order rules.** The code enforces most of them; the scripts check the rest before they change anything.
- **Mail before the name.** With today's mail plan (v1), the API refuses to start on the main name
  (`PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN`). Part 4 comes first.
- **The name before real payments.** NETOPIA's return and notice addresses are made from the name the API answers as,
  at the moment of each payment. Take real payments only on the name they will stay on.
- **The friends' test and 6b close before real payments.** The API refuses `everyone-with-test-payments` and
  `everyone-with-listed-buyers` with live payments (`PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX`,
  `PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_NOT_SANDBOX`). The friends knew the site password (and NETOPIA's tester may
  have, 5.8b), so it changes before real payments (PWNEW, 7.0). 6b gives the password to nobody.
- **`everyone` needs real payments.** The API refuses `everyone` while billing runs on NETOPIA's sandbox
  (`PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING`): anyone could pay with the public test card and get real AI credit. With
  billing off it is refused too (`PREVIEW_ASKS_OPEN_TO_BILLING_OFF`): without plans, an account's only limit is its
  share of the site's day, so a few accounts could use up the whole day.
- **Who may buy.** Only an account on the team line may start a purchase (a checkout or a plan upgrade), with two
  exceptions: under `everyone` with real payments anyone signed in may buy, and under `everyone-with-test-payments`
  (the friends' test, behind the site password) anyone signed in may buy a test plan. Under
  `everyone-with-listed-buyers` (6b) anyone signed in may ask, and the team line, with the Team page's list on a
  release that carries it, is the list of who may buy. Anyone else is refused at the last button
  (`PREVIEW_TEAM_ONLY`); nothing is charged or written. The Team page's list counts only then: with asks closed, in
  the friends' test and with real payments the API never reads it. The order page and its price
  stay open to every signed-in account. A release older than the one that carries 6b checks buying only while payments
  are real: on the sandbox it lets any signed-in account buy.
- **Asks and mail close only behind the password.** ASKS_CLOSE and MAIL_CLOSE refuse whenever the Log in page does not
  ask for the site password, whatever the payments. With the site open, closing asks would leave people who signed up
  on an open site where their questions are refused (paying customers among them while payments are real), and
  closing mail would leave strangers unable to finish a sign-up and buyers outside the allow-list with no confirmation
  (M1, with the Terms) and no receipt (M2). PWON first, so the site closes as a whole.
- **The site password comes off last:** after mail is open, after real payments work, after your staff key works on
  dezbatere.ro (5.7), and after asks are open to everyone. **The one exception is 6b:** the password may come off
  before real payments only with `everyone-with-listed-buyers` in both files and in the running API's line, with
  payments on NETOPIA's sandbox (no `PREVIEW_LIVE_PAYMENTS` line), on dezbatere.ro, with the Owner's staff key working
  there (5.7), with mail open (4.3), with the four spending gates active and with the review window closed. PWOFF1
  checks each. What still waits for real payments and part 8: buying for anyone signed in (`everyone`), real money,
  and invoices.
- **Public debates only after 5.7, behind the password, and outside an upload.** PUBON (5.9) refuses while the staff
  screens are off or no staff key of the Owner works under the name the site answers as (nobody could hide a public
  debate by hand), while the site does not ask for the password, and while the AI check for publication and reports
  is off. Never run PUBON or PUBOFF from an upload's preparation (1.8, SB1) to its end: PRECHECK holds the old
  release's files to SB1's copies, and the way back starts the old release from them. Publishing is no lock: the
  site password decides who can read a public debate, and closing everything (part 9) leaves publishing as it is.
- **6b only on a release that carries it.** An older API refuses `everyone-with-listed-buyers` at start
  (`PREVIEW_ASKS_OPEN_TO_INVALID`), and an older API lets any signed-in account buy on the sandbox. So 6b opens only
  once the upload that brought it is over and you would no longer go back to the release before it; while 6b is
  open, a later upload keeps the same value and the same list in both releases (5.6). Before you go back to a release
  older than the one that carries 6b: PWON, then ASKS_CLOSE.
- **NETOPIA's logo comes only with an upload.** Its line (`NETOPIA_LOGO_ID`) goes into the new release's own website
  file in the release guide's SB5d, right after DR1; no step of this document adds it, and it never goes into an
  older release's file. It changes nothing in Caddy, so it does not depend on the site password or the name.
- **The NETOPIA review window: only on the main name, only with the password on.** REVIEW_OPEN (5.8) runs after
  NAME4, on the Caddyfile NAME3 put in place, and never during an upload. While it is open, NAME5, PWOFF1 and SIGNUPS
  refuse; REVIEW_CLOSE and PWON close it. Every script that checks whether the site password is on does it on the Log
  in page (`/login`). The window never opens that page, so those scripts work with the window open or closed.
- **Never open or close a lock during an upload**, from SB3 to the end of DR6 (or SB13), and never while a second
  release is staged or draining. Changing the list of buyers (BUYERS, 6b) counts as changing a lock: the upload copies
  the list into the new release's files, and the two releases must hold the same one. Adding an account on the Team
  page's list waits too, from SB3 until the upload is over (5.6); removing one there works at any time. The locks'
  names file below stops you when a release is staged or draining. Only
  the brakes (a), (b) and (b2) of 6.5 may run during an upload: the gates' `stop`, PWON (the site password back) and
  REVIEW_CLOSE (the review window closed). The gates' new code and the Amazon gate of part 2 restart gates and run
  `activate`: they are no brakes, so they run before SB3, never in this window. One exception, and only this one:
  when GATEREADY prints `MISSING (piece 2): the Amazon gate's service is not running` after a reboot, and
  `systemctl show -p Result,NRestarts debateai-preview-bedrock-budget` shows `Result=success` and `NRestarts=0`, run
  `systemctl start debateai-preview-bedrock-budget`, then GATEREADY again. In any other case, stop and ask.

---

## 1. Before the upload (nothing on the test site changes)

### 1.1 The payment companies (in their websites)

**NETOPIA, live admin.** Skip these checks for now: NETOPIA's point of sale is not enrolled yet. You enrol it once the
public pages are open (5.8b). NETOPIA then checks your identity and the site, and sends the contract. Do the checks
below after NETOPIA's approval, before part 7.
- Check: the live point of sale (POS) is approved, the contract is signed, live card payments and saved-card
  (recurring) payments are switched on, and the RON settlement form is signed.
- Write down the live POS signature (five groups of four characters).
- Generate the live API key. Keep it for part 7.3.
- Save NETOPIA's live public key for payment notices as `/root/netopia-live-public.pem` on the server. Ask NETOPIA to
  confirm its SHA-256 fingerprint. Do not assume it is the key in their shop plugins.
- The live POS must name dezbatere.ro: real payments run only on the main name (PAY_SWITCH refuses on the test name).
  If it names the test name, ask NETOPIA to change it before part 7.

**SmartBill Cloud.**
- Integrări → API: the account e-mail, the API token and the exact form of the company CIF.
- Configurare → Serii: the invoice series (1 to 16 letters or digits), agreed with the accountant.
- Configurare → Cote TVA: "Normala".
- Configurare → e-Factura: switched on, "imediat după emitere", with SPV working.

**Quaderno.** The LIVE account label (the part before `.quadernoapp.com` in `https://<label>.quadernoapp.com/api`) and
a live private API key.

If NETOPIA has not approved yet, stop part 7 here. The same release can open payments on a later day, with no new
upload.

**NETOPIA's logo.** NETOPIA asks for its logo on the site. Its admin shows the shop id already, before the point of
sale is enrolled: open the page **Identitate vizuală** (visual identity). It shows a few lines of code for the logo;
the shop id is the digits between the quotes of `secret="…"` in them. For example, `secret="12345"` means the shop id
`12345`. Write down only the digits. Despite that word, it is not a secret: every visitor's browser sees it. The upload
puts it in the new release's website file (SB5d, part 2). Once the new release runs (from DR6 of the upload), the full
footer and the checkout's card step show NETOPIA's own picture (its logo with the Visa and Mastercard marks), loaded
from NETOPIA's server, while billing is on. It needs no file of yours and no Caddy change, so skip the release guide's
PM1, SB5b, MT1, PM2 and MT2, and add no `PAYMENT_MARKS_AVAILABLE` line. Part 5 waits for the logo check (LOGOCHECK,
part 2), and NETOPIA's review looks for the logo (5.8b).

### 1.2 The SmartBill proof, on your Mac (it reads only; it writes nothing)

Open Terminal. Type `bash` and press Enter first: the `read -s -p` line below works in bash, not in zsh. Then go to the
project folder (`dialectical-engine`, with the packages installed) and run:

```sh
( umask 077; read -rs -p 'SmartBill e-mail:token (hidden): ' V && echo && printf '%s\n' "$V" > ~/sb-live.txt ); unset V
D=$(mktemp -d); chmod 0700 "$D"
zsh -lic "node_modules/.bin/tsx tools/billing/record-connector.ts smartbill --credentials-file $HOME/sb-live.txt --cif 45935221 --series <SERIES> --capture-dir $D"
```

Use neither `--allow-writes` nor `--draft`: every SmartBill write is a numbered fiscal document. Without them the tool
makes two reads only.

You should see exactly:
- `CONNECTOR_STEP=tax-list:OK`
- `CONNECTOR_STEP=series-list:OK`
- `CONNECTOR_CAPTURE=<folder>/smartbill-capture-<number>.json`

Then read the capture:

```sh
jq '.steps[] | {step, outcome, status: [.exchanges[].response.status], body: [.exchanges[].response.body]}' "$D"/smartbill-capture-*.json
```

The tax list must show "Normala" at 21. The series list must show your series.

If you see `INVOICE_SERVICE_REFUSED` with `SMARTBILL_HTTP_401` (or 400): the CIF form or the token is wrong. Run the
same line with `--cif RO45935221`. If only that form works, the code's CIF form must change before the upload. That
change is not in this release: stop part 7 and ask.

Afterwards: `rm -P ~/sb-live.txt; rm -r "$D"`.

### 1.3 The main name: DNS, Cloudflare and Turnstile

**Read first.** Steps (b) and (c) point dezbatere.ro at this server. From then until part 5.1, dezbatere.ro shows an
error, because Caddy has no site for it yet. You may do (b) to (e) at the start of part 5 instead, the same day.

(a) Look at today's records, on your Mac (nothing changes):

```sh
dig +short dezbatere.ro A; dig +short www.dezbatere.ro A; dig +short CAA dezbatere.ro; dig +short v3-preview.dezbatere.ro A; dig +short v3-preview.dezbatere.ro AAAA
```

Before (b), note what the DNS rows of dezbatere.ro and www.dezbatere.ro hold today, and the Worker's custom domains
(a screenshot of each Cloudflare page is enough). No later step brings them back: closing the name (5.5) keeps it
pointed at this server, and un-preparing it leaves dezbatere.ro with no site at all.

(b) In Cloudflare → Workers & Pages, open the `dezbatere` Worker → Settings → Domains & Routes. Remove every custom
domain or route on dezbatere.ro or www.dezbatere.ro. Remove any tunnel (cloudflared) CNAME for those names. Stop any
automatic Worker build that would attach them again.

(c) In Cloudflare → DNS, add an A record for `dezbatere.ro` and one for `www.dezbatere.ro`, with the same address
v3-preview has. Add AAAA records only if v3-preview has one. Proxy status: **DNS only** (grey cloud). TTL: 5 minutes.
Leave the MX and TXT records alone. The CAA record must be absent, or allow `letsencrypt.org` (and `zerossl.com`).

(d) In Cloudflare → Turnstile, open the widget whose site key is `0x4AAAAAAFNg9KPm2tECytqZ`. Under Hostname
management, add `dezbatere.ro` and keep `v3-preview.dezbatere.ro`. Do not rotate the secret. (Doing (d) alone, today,
changes nothing.)

(e) Wait until all four print the server's address:

```sh
dig +short dezbatere.ro @1.1.1.1; dig +short dezbatere.ro @8.8.8.8; dig +short www.dezbatere.ro @1.1.1.1; dig +short www.dezbatere.ro @8.8.8.8
```

### 1.4 Mail that reaches people's inboxes

These checks change nothing on the server. Do them as root.

**Today's mail failures.** First find the running API:

```sh
systemctl list-units --no-legend --plain 'debateai-preview-api@*'
```

Put the name it shows (for example `debateai-preview-api@<label>.service`) in the two lines below:

```sh
journalctl -u '<the API unit>' -o cat --no-pager --since -30d | grep -E 'AUTH_MAIL_DELIVERY_FAILED|OUTBOUND_MAIL_REFUSED|_MAIL_FAILED' | tail -20
journalctl -u '<the API unit>' -o cat --no-pager --since -30d | grep -c AUTH_MAIL_DELIVERY_FAILED
```

Expect account-mail failures with `code=SENDMAIL_EXIT_1`. Today's v1 mail plan refuses every account mail
(verification, recovery address, e-mail change, security notices). That stays so after the upload; the v2 plan of
part 4 fixes it. Write down the count: part 4.3 looks at it again.

**What sends the mail.**

```sh
dpkg -S /usr/sbin/sendmail
postconf -n | grep -E '^(myhostname|myorigin|relayhost|smtp_sasl_auth_enable|smtp_tls_security_level|non_smtpd_milters|message_size_limit) '
postconf -h message_size_limit
```

The first line must name `postfix`; otherwise stop and ask. The last must print 0, or at least 12582912 (12 MiB, the
size a billing mail with the Terms PDF may reach).

**If `relayhost` is Amazon SES** (`[email-smtp.<region>.amazonaws.com]:587`): in the SES console for that region, the
Account dashboard must say **Production access**, not Sandbox. In the sandbox SES delivers only to verified addresses,
so open mail would reach nobody. Request production access at once: Amazon's review can take up to a day. Under
Identities, `dezbatere.ro` must be Verified, with DKIM Successful (Easy DKIM). SES's largest message size must cover
12 MiB.

**If `relayhost` is empty** (Postfix sends directly):

```sh
timeout 5 bash -c 'exec 3<>/dev/tcp/gmail-smtp-in.l.google.com/25' && echo open || echo blocked
```

It must say `open`. `dig +short -x <the server's IPv4>` must equal `myhostname`, and `dig +short A <myhostname>` must
give the same IPv4. Note: the Privacy Policy says Amazon SES sends account e-mails. Sending directly makes that sentence
untrue. The Privacy Policy is part of the release, so only an upload changes it: decide before this upload. Either
this upload carries the changed text, in English and in the other languages, or mail stays on the allow-list (4.2 at
most) until a later upload does. Ask before SB1.

**DNS for mail** (on your Mac):
- `dig +short TXT dezbatere.ro | grep -i v=spf1` must show exactly ONE `v=spf1` record. It must include the relay
  (`include:amazonses.com` for SES) and whatever your office mail already uses. Extend it; never replace it.
- `dig +short TXT _dmarc.dezbatere.ro` must show at least `v=DMARC1; p=none; rua=mailto:<your address>`.
- `dig +short MX dezbatere.ro`.
- For DKIM: `dig +short CNAME <token>._domainkey.dezbatere.ro` for each of the three Easy DKIM tokens shown on the SES
  identity page (or your signer's selector).

**A test send through the same Postfix**, to your own Gmail and your own Yahoo address:

```sh
set -euo pipefail
# MAILTEST: two plain test mails from noreply@dezbatere.ro through this server's Postfix, then their delivery lines.
read -r -p 'Your Gmail address: ' GM < /dev/tty; read -r -p 'Your Yahoo address: ' YH < /dev/tty
for TO in "$GM" "$YH"; do printf 'From: noreply@dezbatere.ro\r\nTo: %s\r\nSubject: dezbatere.ro delivery test\r\n\r\nPlain test, no link.\r\n' "$TO" | /usr/sbin/sendmail -i -f noreply@dezbatere.ro -- "$TO" || { echo "MAILTEST_NOT_DONE: sendmail refused a test mail (its message is above): ask"; exit 1; }; done
sleep 30
journalctl --since -5min --no-pager | grep -E 'postfix/(smtp|error|bounce).*status=' || true
echo MAILTEST_DONE
exit 0
```

Expect `status=sent (250 …)` twice. In Gmail open "Show original"; in Yahoo open "View raw message". Both must show SPF
pass, DKIM pass with `d=dezbatere.ro` and DMARC pass, and the mail must be in the Inbox, not in Spam. Invite nobody
until both pass.

### 1.5 The mail plan, checked exactly as the new API will read it

**Why.** From this release on, the API reads `/etc/debateai-v3-preview/auth-dev-v1/mail-plan.json` every time it
starts. Today a broken plan only makes every mail fail. After the upload it stops the API from starting, inside the
upload's downtime. So check it now, and once more on the upload day, right before DR1 (part 2).

```sh
set -euo pipefail
# MAILPLAN: mail-plan.json and its folder, read exactly as the new API's start check reads them. Nothing changes.
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }
D=/etc/debateai-v3-preview/auth-dev-v1; P=$D/mail-plan.json
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "MAILPLAN_NOT_DONE: release-check.mjs status refused (above)"; exit 1; }
CL=$(jq -r '[.releases[] | select(.state == "CURRENT") | .label] | if length == 1 then .[0] else "" end' <<<"$ST")
[ -n "$CL" ] || { echo "MAILPLAN_NOT_DONE: the release table does not name exactly one current release"; exit 1; }
UIDN=$(ps -o uid= -p "$(systemctl show -p MainPID --value "debateai-preview-api@$CL")" | tr -d ' ' || true)
[ -n "$UIDN" ] && [ "$UIDN" != 0 ] || { echo "MAILPLAN_NOT_DONE: the running API's user id is unread"; exit 1; }
[ "$(stat -c %U "$D")" = root ] && [ $(( 0$(stat -c %a "$D") & 022 )) = 0 ] && [ "$(readlink -f "$D")" = "$D" ] || { echo "MAILPLAN_NOT_DONE: $D is not root's, is writable by group or others, or is reached through a link"; exit 1; }
[ ! -L "$P" ] && [ "$(stat -c '%U %a %h %F' "$P")" = 'root 644 1 regular file' ] || { echo "MAILPLAN_NOT_DONE: $P is not a root-owned 0644 regular file with one link"; exit 1; }
SZ=$(stat -c %s "$P"); [ "$SZ" -ge 1 ] && [ "$SZ" -le 4096 ] || { echo "MAILPLAN_NOT_DONE: $P is empty or larger than 4 KiB"; exit 1; }
[ -z "$(grep -oE '"[A-Za-z]+"[[:space:]]*:' "$P" | tr -d ' \t' | sort | uniq -d)" ] || { echo "MAILPLAN_NOT_DONE: a key appears twice in $P"; exit 1; }
jq -e --argjson uid "$UIDN" '(keys == ["apiUid","mailFrom","publicAppUrl","recipientPolicy","schema","transportTimeoutMs"]) and .schema=="preview-auth-dev-mail-v1" and .apiUid==$uid and .apiUid!=0 and .mailFrom=="noreply@dezbatere.ro" and .publicAppUrl=="https://v3-preview.dezbatere.ro" and .transportTimeoutMs==5000' "$P" >/dev/null || { echo "MAILPLAN_NOT_DONE: the plan's keys or values are not today's v1 plan for this API"; exit 1; }
[ "$(grep -cx 'MAIL_FROM=noreply@dezbatere.ro' "$D/api-$CL.env" || true)" = 1 ] || { echo "MAILPLAN_NOT_DONE: the API file's MAIL_FROM is not the plan's sender"; exit 1; }
echo MAILPLAN_DONE
exit 0
```

Expect `MAILPLAN_DONE`. If a check fails, fix the file before the upload. Write the fixed file elsewhere first, then
put it in place:
`install -o root -g root -m 0644 <fixed file> /etc/debateai-v3-preview/auth-dev-v1/mail-plan.json.new && mv -f /etc/debateai-v3-preview/auth-dev-v1/mail-plan.json.new /etc/debateai-v3-preview/auth-dev-v1/mail-plan.json`.
Never change `transportTimeoutMs`: it must stay 5000.

### 1.6 The old test debates, and the staff screens

Debates cannot be deleted: the database refuses to delete a debate's rows, by design. What strangers and friends can
see is only the list of **published** test debates (none on this server until publishing is switched on, 5.9). Hiding is the supported way to take one down. Only the staff
screens (the Team page, `/admin/team`) can hide a debate by hand; the public Report button can also hide one by itself
(5.1b). No menu links to the Team page: type its address after the name the site answers as, for example
https://v3-preview.dezbatere.ro/admin/team (before the rename) or https://dezbatere.ro/admin/team (after it).

**First, see whether the staff screens are on.** STAFFCHECK only reads. Run it before the upload:

```sh
set -euo pipefail
# STAFFCHECK: whether the staff screens are on in the running API's file (read-only; prints names and counts, never a key).
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }
E=/etc/debateai-v3-preview/auth-dev-v1
RELS=/opt/debateai-v3-preview/releases
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "STAFFCHECK_NOT_DONE: release-check.mjs status refused (above): ask"; exit 1; }
CL=$(jq -r '[.releases[] | select(.state == "CURRENT") | .label] | if length == 1 then .[0] else "" end' <<<"$ST" || true)
[ -n "$CL" ] || { echo "STAFFCHECK_NOT_DONE: the release table does not name exactly one current release, or did not read (above): ask"; exit 1; }
F=$E/api-$CL.env
[ -f "$F" ] || { echo "STAFFCHECK_NOT_DONE: $F is missing: ask"; exit 1; }
echo "the running API's file: $F (the API is $(systemctl is-active "debateai-preview-api@$CL" || true))"
grep -E '^(PUBLIC_APP_URL|STAFF_ACCESS_POLICY_VERSION|STAFF_WEBAUTHN_ORIGIN|STAFF_WEBAUTHN_RP_ID)=' "$F" || true
P=$(grep -c '^STAFF_ACCESS_POLICY_VERSION=' "$F" || true); P1=$(grep -cx 'STAFF_ACCESS_POLICY_VERSION=1' "$F" || true); P2=$(grep -cx 'STAFF_ACCESS_POLICY_VERSION=2' "$F" || true)
AL=$(grep -c '^INTERNAL_ALLOWANCE_' "$F" || true)
echo "team allowance lines: $AL"
# The AI check for publication and reports goes through the Anthropic gate: the release must carry that way, and the API file must name the gate's socket.
GS=$(sed -n 's/^PREVIEW_PROVIDER_TEST_CONFIG_JSON=//p' "$F" | jq -r '.anthropic_budget_socket // empty' 2>/dev/null | grep -c . || true)
GR=0; [ ! -f "$RELS/auth-dev-candidate-$CL-api/dialectical-engine/apps/api/src/publication-check/gate-transport.ts" ] || GR=1
if [ "$GR/$GS" = 1/1 ]; then echo "the AI check for publication and reports: on, through the Anthropic gate (6b.1's AICHECK reads whether the gate lets it through)"
elif [ "$GR" = 1 ]; then echo "the AI check for publication and reports: off: the API file names no Anthropic gate socket"
else echo "the AI check for publication and reports: off: this release has no way to it (a release that sends it through the Anthropic gate brings it)"; fi
if [ "$P/$P2" = 1/1 ]; then
  echo "staff tools are on: do your staff work now (1.6); after a rename, enrol your staff key again under the new name (5.7)"
  [ "$AL" = 0 ] || echo "the file has team allowance lines: they need the staff tools on, so never run STAFFOFF here"
elif [ "$P" = 0 ] || [ "$P/$P1" = 1/1 ]; then
  echo "staff tools are off: Hide now does not exist on this server now; skip step 2 below (after the rename, STAFFMAIN and REKEY, 5.7, put them on)"
else
  echo "STAFFCHECK_NOT_DONE: the policy line is not one line STAFF_ACCESS_POLICY_VERSION=1 or =2: ask"; exit 1
fi
echo STAFFCHECK_DONE
exit 0
```

Read the lines just before `STAFFCHECK_DONE`:
- `staff tools are on`: the file holds `STAFF_ACCESS_POLICY_VERSION=2`, and the two staff name lines
  (`STAFF_WEBAUTHN_ORIGIN`, `STAFF_WEBAUTHN_RP_ID`) name the name the site answers as. Do the steps below. If the next
  line says `the file has team allowance lines`, never run STAFFOFF on this server: the staff screens then stay on
  through the rename (5.1b). The count line above it (`team allowance lines: 0`) is not a warning.
- `staff tools are off`: Hide now does not exist on this server now. Skip step 2 below. Hide now comes back only with
  5.7, after the rename: STAFFMAIN puts the staff screens on under dezbatere.ro, then REKEY lets you enrol your staff
  key there. STAFFMAIN needs the upload's tools-folder swap (SWAP) and its database step (migration 0184), and the two
  staff name lines and the three staff alert lines once each in the API file. STAFFON (5.5b) is no way round: it
  works only on a server where STAFFOFF once took the staff screens off. Until 5.7 a published debate stays public
  behind the site password; if one must not, ask.

`the AI check for publication and reports` is the AI check that lets a finished Free debate go public and that reads
each press of the public Report button (5.1b says why it matters; both need publishing on, 5.9). It is Claude Haiku 5.5 through the Anthropic gate:
the API holds no key for it, and the API file's `SUPPORT_MODEL_TARGET_JSON` plays no part on this server (it stays
absent). The line says `on, through the Anthropic gate` when the running release sends the check that way and the API
file names the gate's socket. Otherwise it says `off:` and why; before the upload of a release that sends the check
through the gate, `off: this release has no way to it` is expected. `on` means the API will ask the gate; whether the
gate lets it through, AICHECK (6b.1) reads.

**Why now** (when STAFFCHECK said `staff tools are on`). A staff key belongs to one site name. The one you enrolled
works only on the test name. After the rename nobody's staff key works until the staff screens are on under
dezbatere.ro and the key is enrolled again there (5.7: about half an hour, and it needs you at the server and at the
browser). **This is your last chance for staff work (Hide now, reports, publication reviews) until then.**

Do this **before DR2** of the upload, while the old release still runs on the test name:
1. Sign in. Open the home page's **Public** tab. Read every published debate.
2. If one should not be public: tell the team first (each hide e-mails the debate's author). Then open
   https://v3-preview.dezbatere.ro/admin/team (the Team page; no menu links to it) → **Public debates under review**
   (Dezbateri publice în curs de verificare): paste the debate's public link into **The debate's public link** (Linkul
   public al dezbaterii), press **Open** (Deschide), then **Hide now** (Ascunde acum). The panel lists only hidden
   debates, so the link is the way to a public one. Each hide needs the staff hardware key, and the staff key you have now works only on the test name.
3. If the Team page shows open reports, settle them now too. Publication reviews (**Publication reviews**, Cereri de
   publicare) open from the link on the Team page once your key is verified. Settling usually needs the team tools unlocked: if the page says
   `Team tools are locked…` (in step 2 or 3), run UNLOCK (5.7, step 3) as root. It unlocks them for one hour and ends
   with `UNLOCK_DONE` once the unlock has written its first "ready" row; `UNLOCK_NOT_DONE` says why not.
   If the Team page also shows **Threat reports** (Rapoarte despre amenințări) with unread ones, read and decide them
   now: this upload removes that screen and its mail for good, so before DR2 is the last moment anyone can read a kept
   report. A report nobody reads is deleted by itself 30 days after it was kept. After the upload the Team page's
   invite form still offers the permission "Read threat reports"; it opens nothing.
4. Optional: you, and anyone on the team who wants to, can delete your own private test debates with "Delete private
   debate…" on the classic page `/debate/<id>`. A delete is permanent.

**Optional: the staff records, counted.** STAFFDB only reads, and prints no names and no addresses:

```sh
set -euo pipefail
# STAFFDB: the staff records, counted (read-only; prints no names and no addresses).
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
SA=$(psqlq "SELECT count(*) FROM staff.subject WHERE state = 'ACTIVE'") || { echo "STAFFDB_NOT_DONE: the database is unreadable: ask"; exit 1; }
OW=$(psqlq "SELECT count(*) FROM staff.owner_designation WHERE active") || { echo "STAFFDB_NOT_DONE: the database is unreadable: ask"; exit 1; }
KS=$(psqlq "SELECT concat_ws(' ', f.relying_party_id, f.credential_origin, count(*)) FROM identity.mfa_factor f JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id = f.mfa_factor_id WHERE f.state = 'active' GROUP BY f.relying_party_id, f.credential_origin") || { echo "STAFFDB_NOT_DONE: the database is unreadable: ask"; exit 1; }
echo "active staff members: $SA; Owner: $OW"
echo "staff keys (name, origin, how many):"; printf '%s\n' "$KS"
echo STAFFDB_DONE
exit 0
```

You should see `Owner: 1` and one key line for the test name, like
`v3-preview.dezbatere.ro https://v3-preview.dezbatere.ro 1`. The last number counts the staff keys: 1 or more is
fine. If STAFFCHECK said `staff tools are off`, `Owner: 0` and no key line are normal too. A warning about `/root` is
harmless. Anything else: ask.

### 1.7 Your numbers (decide them; write no amounts here)

**The site's numbers** live in `/etc/debateai-v3-preview/hosted-billing-v1.json` (root, 0600):
- `dailyCeilingMicros` (the whole site, per day) and `perRunCeilingMicros` (one debate);
- `askRoomReads`;
- `billingPlans`: for each plan its `net_prices`, `monthly_credit_micros`, `reserve_micros`, `finish_overflow_micros`,
  `day_bp` and `week_bp`;
- `abuseLimits`: `clarify_per_hour`, `clarify_per_day`, `flag_per_person_hour`, `flag_per_debate_day`,
  `flag_per_site_day`.

Rules of thumb: Free's `monthly_credit_micros` well below the day ceiling (Free has no day cap, so one account could
otherwise use the whole day). The day ceiling at or below what the gate pots leave for debates, so people meet the
gentle "wait in line" message before the hard "try tomorrow".

**What a changed plan limit does to people who already have a plan.** A plan's limits here are its
`monthly_credit_micros`, `day_bp` and `week_bp` (the day and week caps are shares of the credit, so a changed credit
changes them too), its `reserve_micros` and its `finish_overflow_micros`. Each person's month keeps the numbers it
started with; a paid month starts at the first payment and at each renewal date, a Free month at the account's own day
of the month. With made-up numbers:
- **A lower limit** reaches each person when their own next month starts, never before. A day cap of 11 that an upload
  makes 5: someone whose month began before the upload keeps 11 until that month ends, and no day already used is
  counted again. Someone who buys the plan after the upload has 5 from their first day. The same holds for the month
  credit (nobody is stopped in a month they already started, and no running debate pauses), for the week cap, and for
  Free. The Terms still ask two things of you that the product does not do by itself: tell people before a limit
  gets tighter (section 12), and ask them to accept the new Terms at their next sign-in before a lower limit applies to
  them (section 14). A later Terms version that makes people accept again at sign-in does not reach the accounts made
  before the launch texts (yours and the team's): the version numbers they accepted are higher than the launch ones.
  Ask before you count on it for them.
- **A higher limit** reaches everyone on the plan at the switch. The days before it keep the number they had.
- **A day or week cap added where the plan had none** is a lower limit: it starts with each person's own next month.
  One taken away is a higher limit.
- **A higher limit cannot be taken back inside a month.** If an upload raises a limit and a later upload publishes
  the lower number again, everyone whose month saw the higher number keeps it until their next month starts. The same
  holds for a switch back to the release before after a side-by-side upload. It does not hold for rbD-B, this
  runbook's own way back: rbD-B puts the database back as it was, and the old numbers are back for everyone. Check a
  raise twice before you publish it.
- **A refund** on cancelling or withdrawing is measured against the credit the person's month had on the day they
  cancelled or withdrew: the one it started with, or a higher one published since. A credit you lower later never makes
  a refund smaller.
- **The reserve.** A raised `reserve_micros` does not make new questions stop earlier in a month already started. Final
  answers are paid from the site's reserve of the day, so in such a month a final answer may take the month past its
  credit by the difference. A lower reserve reaches everyone at once.
- **Someone who changed plan this month** has a month credit stored at that moment. It stays as it is until their next
  month, after a raise too.
- **During a side-by-side switch**, a debate still running on the release before is measured by the same rule. A
  release from before this rule existed measures the debates it still finishes against its own numbers.
- **Accounts that exist when numbers change** keep the numbers their month started with, like everyone else. This
  includes your own account and every test account: after an upload that publishes lower numbers, each of them still
  has the larger ones until its own next month starts, at most about 31 days. An account created after the switch has
  the new numbers from its first day.
- **The Amazon gate (OpenAI's GPT-6 Luna)** is no plan limit: what this upload does for it, and what you decide first,
  is in part 2. Its pot and its daily number of calls go into its GO on the server, like the other gates' (below).
- **The first upload that carries this rule.** The release before it does not know the rule. If you go back to that
  release (the release guide's way back), it measures everyone against its own numbers at once, as before; "cannot be
  taken back inside a month" holds only between releases that both carry the rule.

**The gate pots** (the spending gates in front of each AI company) are set in each gate's GO file: `daily_budget_usd`,
`max_paid_posts_per_day`, `max_concurrent_calls`, `open_days`; and in `/etc/debateai-v3-preview/provider-budget-caps-v1.json`:
`max_go_budget_usd` and `team_total_budget_usd` (the hard fuse). They can change any day with a new GO, then the
gate's `stop` and `activate`, as each gate's README says (`deploy/preview-gate/v3/`).

**How an upload treats these numbers (the release guide's SB3).** The file is your own record; the site runs on the
numbers of the live settings version. An upload publishes a new version. Its numbers are the live ones, except the
inputs you name at the top of SB3:
- `NEWNUM`: the inputs to take from the file, for example `NEWNUM='billingPlans'`. Empty means no number changes.
- `LIMITS`: whenever a plan's limits change, up or down: the plans, for example `LIMITS='PLUS'`.

SB3 compares the file with the live numbers and prints one line per input, and per plan: `SAME`, or `DIFFERENT` with
`higher`, `lower` or `changed`. It never prints an amount. Then it stops, with nothing written, unless your two lists
are exactly what differs:
- an input that differs and is not in `NEWNUM` stops it: no number is published by accident, and none is skipped
  without a word;
- an input in `NEWNUM` that does not differ stops it too;
- a plan whose limits change, up or down, stops it until you name the plan in `LIMITS`; a plan named there without
  need stops it too.

**Never edit the file in place.** A file that no longer reads as JSON makes every step print an error instead of its
numbers. Copy it, edit the copy, check the copy, then put it in place: the four lines are in the release guide under
SB3, "Editing the owner's file". Do it before SB2 (the practice runs with the file's numbers).

**What a change does to people who already have a plan.** The release guide has the full list under SB3; in short:
- A new **price** never touches a renewal: someone who already pays keeps the price they bought at (Terms section
  12), after a rise and after a cut. There is no tool yet that moves existing subscribers to a new price; when you want
  that, it must be built, with the 30 days' notice the Terms promise. One trap: an upgrade that was shown at the old
  price by a release that does not yet save that price, and paid after the switch, is renewed at the new price. **So
  do not change plan prices in this upload** (the release running today does not save it); change them in a later
  one.
- **A plan's limits**: what a lower or a higher limit does to the people already on the plan is said once, above
  ("What a changed plan limit does to people who already have a plan"). SB3 stops until you name the plan in
  `LIMITS`, for a limit that goes lower and for one that goes higher:
  - naming a plan whose limit goes **lower**, or whose line says `changed` (the reserve, Free's gauges, a member
    the tool does not read), is your statement that you told the people on that plan first (Terms
    section 12), or that nobody holds it. The product sends no notice, and it has no step where people accept the
    change at their next sign-in (Terms section 14);
  - naming a plan whose limit goes **higher** is your statement that you checked the number twice: it cannot be taken
    back for a month.

  For each plan you name, SB3 prints `HELD` or `nobody holds it now` (test purchases count; it prints no count).
  `HELD` is also printed for a plan someone was on earlier and has since left, so it can be wrong only towards
  caution; `nobody holds it now` is firm at that moment, and people can still buy until DR2.
- Free's gauges are read from the live version for everyone: a change reaches everybody at the switch.
- The day's ceiling, `askRoomReads` and `abuseLimits` are site-wide; they reach everyone at the switch. A new
  per-debate ceiling applies to debates asked after the switch.

**When the file is behind.** If a per-debate ceiling was changed by a settings activation, the file still holds the
old value and SB3 says `DIFFERENT perRunCeilingMicros`. Do not name it. Run the release guide's SB3c with
`KEEP='perRunCeilingMicros'`: it writes the live value into the file and keeps the file as it was in the upload's
archive folder. SB3c is also how you undo an edit of a file that still reads as JSON.

**If the file changes after SB2** (by your edit or by SB3c), run SB2 again before SB3. The practice is the only start
of the new code on those numbers before DR6, and at DR6 the site is down.

**Going back after new numbers were published.** This runbook's upload is a drained one: at DR6 the release before is
retired, so there is no switch back to it. The numbers come back in one of two ways only:
- rbD-B, the drained upload's own way back: it puts back the database as it was at DR3, with the old numbers, and
  loses everything written since (sign-ups, debates, payments). The old numbers are back for everyone at once;
- SB3c with `SRC`, then the next upload with those inputs named in `NEWNUM`. It loses nothing and takes one more
  upload. It is an upload like any other: a limit it lowers again reaches each person from their own next month.

The release guide says both under "The numbers on the drained path". After a side-by-side upload there is a third
way while the release before is still there (WB2). If that upload had raised limits, WB2 does not take the raise back
from the people whose month saw it: they keep the higher number until their own next month.

**A release older than this step** cannot publish changed numbers: its SB3 needs `NEWNUM` and `LIMITS` empty and the
file equal to the live numbers.

To look before SB3, run this read-only comparison after SB1 and before SB2. It prints one line per input; SB3 itself
prints the same per plan and member:

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# SITEINPUTS: hosted-billing-v1.json against the live settings version's numbers. Prints SAME or DIFFERENT per input, never a value.
AV=$(cat "$S/active-before"); OSITE=${OKEY%%-*}; OSITE=${OSITE#r}
if [ "$AV" = "$OSITE" ]; then FROM=$S/native-plan.before.json; else FROM=/opt/debateai-v3-preview/artifacts/settings-v$AV/native-plan-verify.json; fi
[ -f "$FROM" ] || { echo "SITEINPUTS_NOT_DONE: $FROM is missing: ask"; exit 1; }
[ "$(jq -r .billing <<<"$HB_ON")" = on ] || { echo "SITEINPUTS_NOT_DONE: hosted-billing-v1.json does not read as JSON (put its last good copy back): ask"; exit 1; }
for K in billing dailyCeilingMicros perRunCeilingMicros askRoomReads billingPlans abuseLimits; do
  if [ "$(jq -cS --arg k "$K" 'def norm: if type == "number" then . + 0 elif type == "array" then map(norm) elif type == "object" then map_values(norm) else . end; .hostedBilling[$k] | norm' "$FROM")" = "$(jq -cS --arg k "$K" 'def norm: if type == "number" then . + 0 elif type == "array" then map(norm) elif type == "object" then map_values(norm) else . end; .[$k] | norm' <<<"$HB_ON")" ]; then echo "SAME $K"; else echo "DIFFERENT $K"; fi
done
echo SITEINPUTS_DONE
exit 0
```

Every line `SAME`: leave `NEWNUM` and `LIMITS` empty; SB3 publishes the live numbers, which are your file's. A line
`DIFFERENT`: decide before SB3 whether that input is a change you mean (name it in `NEWNUM`) or the file being behind
(SB3c). `DIFFERENT billing` is never a number change: stop and ask.

### 1.8 The preparation: the day before, or earlier on the upload day

Everything here runs with the site up, and nothing on the site changes. It runs the day before the upload, or earlier
on the upload day itself; do it in this order either way. Each step names its block and the last line it must print.
On any other last line, run nothing more, and ask. With publishing on (5.9), run PUBBACKUP (5.9, step 4) first, before
SB1: this upload's cold copy holds the database only, not the keys of the public debates (5.9a).

The practice spends from the gates' daily pots (a day is a Bucharest day). On the same day, the practice and the test
debate after the switch (part 2: it serves both SB13b and the proof of the step before Start) share the same pots.
POTS (step 9) and the gates' own refusals say whether room is left. A test debate refused for lack of room waits for
the next day: the site is up and correct meanwhile, and only that proof waits. Each legal text's day follows its own
rule in every case (step 3, and the release guide's section "The legal texts' day"): one the live site already carries
keeps its day, and a new version takes the upload day.

**REV, the commit you upload.** REV is taken once, after every change for this upload is merged into dev. On the Mac:
`git fetch origin dev && git rev-parse refs/remotes/origin/dev`. It prints 40 characters. From then until DR6 nothing
new is uploaded: a later merge into dev does not change REV. Type it in full wherever a step asks for it (step 1 below,
the Mac check, SB1).

**1. A folder on the Mac at exactly REV (the upload folder).** In Terminal, go to your copy of the code (the folder
that holds `dialectical-engine`), and run, with your own new folder's path and REV filled in:

```sh
git fetch origin dev
git worktree add --detach <a new folder> <REV>
git -C <the new folder> rev-parse HEAD
git -C <the new folder> status --porcelain
```

The third line must print REV; the fourth must print nothing. Then install the packages there: the practice guide's
S-0 (`tools/preview-practice/README.md`), run in the new folder's `dialectical-engine` folder; its digest line must be
the one S-0 names. From here on that `dialectical-engine` folder is *the upload folder*: every Mac step of this
document runs there (the legal check, the Mac check, the practice, and REVIEW_MACTEST in 5.8a). If `status --porcelain`
ever prints a line there, a file was edited: make a new folder. The way back is `git worktree remove <the new folder>`.

**2. The ssh name for the server (once).** The practice and the staging copy files between the Mac and the server
through an ssh name of your own (`PREVIEW_SSH` in the practice guide). If you have none yet, add it by hand to
`~/.ssh/config` on the Mac, with the server's address and your login there:

```
Host <a name you choose>
    HostName <the server's address>
    User <your login on the server>
```

Then run `ssh <the name> true`. The first time, ssh shows the server's key fingerprint and asks whether to go on.
Before you type `yes`, compare it with what the server prints for `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`,
run in a root session on the server that you already trust. Type `yes` only if the two are the same; otherwise stop and
ask. From then on `ssh <the name> true` prints nothing. Use that name wherever the guides say `PREVIEW_SSH`.

**3. The legal texts, on the Mac.** This server's upload path never runs the legal check, so run it yourself, in the
upload folder:

```sh
git rev-parse HEAD
zsh -lic 'pnpm legal:release-check'
```

The first line must be REV; if it is not, stop and ask. The last line must start `Legal texts: ready for release.` If
it says `NOT ready for release`, stop and ask: the lines above it say what is missing (for example a translation of the
Terms or the Privacy Policy that is older than the English text), and only a new commit fixes that.

The Terms and the Privacy Policy each name their version and the day it takes effect. The day follows a rule for each
text on its own (the release guide's section "The legal texts' day", `deploy/preview-release/v1/README.md`): a text
whose current version the live site already carries keeps its day, and a new version takes the upload day, because it
goes live on the site at DR6. Today the Terms 1.1 and the Privacy Policy 1.1 are on the live site and keep 24 November
2026; a newer version of either takes the upload day. This upload carries the Terms 1.1, which keep 24 November 2026,
and the Privacy Policy 1.2, a new version, which takes the upload day. Check both, in the same folder:

```sh
grep -Ho 'Version [0-9.]* · Effective [0-9]* [A-Za-z]* 20[0-9]*' apps/ui/legal/en/terms-of-service.md apps/ui/legal/en/privacy-policy.md
```

It prints one line for each text, with its version and its day written out (day, month name, year). Compare each with
the same text on the live site (`/terms` and `/privacy`). The same version must show the same day. A newer version
must show the upload day. If a line shows anything else, or the upload moves to another day while a new version waits,
stop and ask: the day is part of the texts, so a new day needs a new commit (the release guide's section says how). At
your first sign-in after the upload, neither you nor the team is asked to accept the texts again: your earlier
acceptances count.

**4. The Mac check, on REV.** In the upload folder: `zsh -lic 'node tools/upload-check/run.mjs --rev <REV>'`. It tries
on the Mac three things the server does during an upload (the release guide's "Before an upload: the Mac check" says
which, and what it needs). It can take a while: it first waits until the Mac has memory free. The last line must be
`ALL PASSED`. `NOT PASSED`, or any other end: stop and ask.

**5. TRYDETACH: the detached run, tried once on the server.** The downtime steps of the upload day run as detached
runs ("How to run a server step", at the start of this document). This step proves, with nothing at stake, that a step
run that way goes on when the ssh window closes. Run it as a detached run:

```sh
set -euo pipefail
# TRYDETACH: the detached run tried on this server: one line, a minute's wait, a second line, all written to the log while the ssh window is closed. Nothing changes.
echo "TRYDETACH started at $(date -u +%H:%M:%S) UTC, as $(id -un), on $(systemctl --version | sed -n 1p)"
sleep 60
echo "TRYDETACH still ran at $(date -u +%H:%M:%S) UTC, after the window was closed"
echo TRYDETACH_DONE
exit 0
```

As soon as `tail` shows the first line, close the Terminal window itself (do not press Ctrl-C). Wait two minutes. Open
a new window, connect to the server, `sudo -i`, then run `systemctl list-units 'ms-step-*' --all --no-legend` (it must
print nothing: the step is over) and `tail -n 40 /root/ms-step.log`. Expect the `started` line, the `still ran` line,
then `TRYDETACH_DONE`. If the second line is missing, a detached run does not protect a step on this server: stop, and
ask before part 2.

**6. SB1** (the release guide's "Drained upload on the template layout" starts with SB1 to SB4). `NN` is the next plain
number after the highest `r<number>-names.sh` in `/root/preview-archive` (a name with a second part, like `r22-1`, or
with a word, does not count); `REV` is the one above, typed in full. Nothing else is typed: SB1 finds the pnpm store
the staging starts from by itself (the live release's own copy, else the store its upload's names file names) and
prints `pnpm store for A3: <path>`. If that store is gone (its release was archived), SB1 stops and says so: ask.
Expect `SB1_DONE`. Nothing live changes. Then run SITEINPUTS (1.7), and settle your numbers before the practice.

**7. The staging.** As the release guide says under SB1, in this order: A2 (its Mac half makes the bundle; `OREV` is
the names file's `OREV=` line, read on the server with `sed -n 's/^OREV=//p' /root/preview-archive/rNN-names.sh` and
typed on the Mac), A3, A4, SB1b (in place of A5), A6 and A7. Each is a block of the release guide that ends with its
own `_DONE` line, `A2_DONE` first and `A7_DONE` last. Run A3, A4, A6 and A7 as detached runs ("How to run a server
step"), not with `nohup`: a closed window would stop them half way, and A3 then refuses to run again. The staging
changes nothing live.

**8. SHAPEON: the row of the step before Start** (the release guide's section "The step before Start, switched on in
the upload"). It reads the live settings version's debate-shape row and checks what the step needs: the row switched
on, the engine row in force, two models or more on each plan's line-up and no Luna there, and no scorecard row. It adds
only the start values, taken from this release's own code, and proves that nothing else changed. It writes two
one-line files into the upload's archive folder: `shape-on.json`, the row SB3 publishes on the upload day, and
`shape-base.json`, the row as it is today (the step's own way back), plus a copy of `shape-on.json` for the practice.
Expect a line like `shape row: base <n> bytes, with the start step <m> bytes; only startStep added; the release's
parser: accepted`, then `SHAPEON_DONE`. On `SHAPEON_NOT_DONE`, its line names what is missing: ask. Nothing changed.

**9. POTS: do four Anthropic calls at once fit, and the Amazon gate's range** (same section). It only reads. Expect
the Anthropic gate's GO as it is, as one JSON line:
`Anthropic GO now: {"provider":"anthropic","max_concurrent_calls":2,"max_final_writer_calls":1}`, then the Amazon gate's
range of pots (on your screen only), the line `four calls at once fit the Anthropic pot: yes`, then `POTS_DONE`.
- `four calls at once fit the Anthropic pot: no`: decide before the upload day. Either raise the Anthropic gate's pot
  (`deploy/preview-gate/v3/README.md`, "Change the daily budget or another limit"; the figures typed on the server
  only), then run POTS again (a higher Anthropic pot leaves less room for the Amazon gate's); or go with two calls at
  once: the step works, only slower, and piece 1 then changes only the Anthropic gate's code (part 2, step 3). Your yes
  before DR2 says which.
- `NO ROOM` for the Amazon gate: decide before the upload day which other gate's pot is lowered (the release guide's
  "Before piece 1, have ready" says how, and what a lower pot does).

Write nothing of the range down outside the server: you type the Amazon gate's figures in part 2, step 3, on the
server only.

POTS answers only what it says: whether the Anthropic gate can hold four calls at once inside its pot, and which
Amazon pots fit. It does not price a debate. Whether one debate at the widest choice (for example a paid plan's dig at
its widest How wide, with web search) fits each gate's daily pot is first asked by STEPCHECK, after the downtime
(part 2, step 24): no step before the downtime can ask it, because that check needs the new settings version
published and the new release pinned, and both happen at DR5. So `yes` here does not promise STEPCHECK's pass. POTS
weighs money only. A gate's daily number of calls is `max_paid_posts_per_day` in its GO file: the API weighs it when
someone asks a question, against the calls the gate says are left today, and the gate itself refuses every call past
it (`DAILY_CALL_LIMIT_REACHED`).

**10. MAILTIME: how long this release's mail program takes to load.** From this release on, each mail's program loads
its code afresh, inside the 4.5 seconds each mail has. This times the load on this server, in the staged release
folder, and sends nothing: it hands the program an empty mail, which it refuses. Run it on an idle server: not while
A3, A6 or A7, the practice or another heavy step runs, and not right after one, while the server is still busy from
it. A busy server makes the load slower, and that is not what this step measures.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# MAILTIME: how long this release's mail program takes to load on this server, timed on an empty mail it refuses. Nothing is sent; nothing changes.
F=$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs
[ -f "$F" ] || { echo "MAILTIME_NOT_DONE: $F is missing (the staging first)"; exit 1; }
FROM=$(sed -n 's/^MAIL_FROM=//p' "$E/api-$OLABEL.env")
[ -n "$FROM" ] || { echo "MAILTIME_NOT_DONE: the running API's file has no MAIL_FROM line: ask"; exit 1; }
# The program refuses every failure with the same word, also before it loads anything: these two make an early refusal unlikely.
runuser -u "$AU" -- test -r "$E/mail-plan.json" || { echo "MAILTIME_NOT_DONE: the API's user cannot read mail-plan.json: ask"; exit 1; }
grep -qF "const FROM = '$FROM';" "$CAPI/dialectical-engine/deploy/preview-mail/v4-20261005/sendmail-owned-preview.mjs" || { echo "MAILTIME_NOT_DONE: MAIL_FROM is not the mail program's own sender: ask"; exit 1; }
T0=$(date +%s%N)
OUT=$(cd / && runuser -u "$AU" -- "$N" "$F" -i -t -f "$FROM" < /dev/null 2>&1 || true)
T1=$(date +%s%N)
grep -q PREVIEW_MAIL_REFUSED <<<"$OUT" || { printf '%s\n' "$OUT" | tail -n 5 | cut -c1-300; echo "MAILTIME_NOT_DONE: the mail program did not end with its refusal (lines above): ask"; exit 1; }
T=$(( (T1 - T0) / 1000000 ))
echo "the mail program loads in $T ms; each mail has 4500 ms in all"
[ "$T" -le 2000 ] || { echo "MAILTIME_NOT_DONE: the load takes more than 2 seconds: ask before part 2"; exit 1; }
echo MAILTIME_DONE
exit 0
```

Expect the time line (well under 4 seconds), then `MAILTIME_DONE`. Above 2 seconds the step stops. One stop right
after the website builds (A6, A7) only says the server was still busy: wait a few minutes, with nothing else running,
and run MAILTIME again. If it then prints `MAILTIME_DONE`, go on. If it stops again on the idle server: ask. A time of
a few milliseconds means the program refused before it loaded anything, so nothing was timed: ask. After the
upload, a mail that runs out of time shows as `SENDMAIL_EXIT_1` or `SENDMAIL_TIMEOUT` (4.2).

**11. The practice** (it spends real money from the gates' day). Run it as the release guide's SB2 says (its commands
live there), with the practice guide's steps, in this order:
- Server, as root: S-1, S-2, S-3, S-3b and S-4. S-4 starts the relay with the web-search socket only when the
  practice's own `settings.env` (S-2's copy) names `perplexity_budget_socket`.
- Mac: S-5. Its `scp` brings SHAPEON's copy of the row down with the other files, and S-3b's
  `hosted-billing.json`, from which SB2's `HB_ON` line is made (run that line first, in the same terminal). Then, in S-6's second terminal,
  where you set `P` to S-5's folder: LUNAROW (the release guide's Amazon section). Expect `settings.env: 7 model
  addresses, Luna's row last`, then `LUNAROW_DONE`. Without it the practice stops at once with
  `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH` (nothing is spent).
- Mac: the line-up file, then `formats` with it, as SB2 says. Expect `PRACTICE_VERDICT PASS`.
- Before each of the debate runs below: S-3 again on the server (a fresh gate status), and its copy down again, as SB2
  says.
- Mac: SB2's debate with the row (`--shape-policy "$P/shape-on.json"`). Expect `PRACTICE_VERDICT PASS` (or
  `PASS_WITH_WARNINGS`). Its line `practising on this code's next version` lists the rows the next version changes
  and adds: they must be the ones SB3 publishes on the upload day, `debateShapePolicy` among them. Luna sits out.
- Mac: SB2's run with the step before Start on the Free plan (three paths). Expect `PRACTICE_VERDICT PASS`, and one
  `PRE_START` line in `$P/start-month/start-month.jsonl` (read it on your screen: it holds amounts).
- Mac: SB2's run on the Plus plan (five paths), only when the practice's `settings.env` names
  `perplexity_budget_socket`. Expect `PRACTICE_VERDICT PASS`.
- Then S-7, on both sides: the relay stopped, and both gates still active (its two status lines are on your screen
  only).

The practice runs on the gates' old code (piece 1 comes in part 2), with the Anthropic gate still at two calls
at once: its runs before Start are slower, not refused. A new S-2 copy, or S-5's `scp` run again, brings the six-row
`settings.env` back: run LUNAROW again after it. If your numbers file changes after the practice (1.7), run the
practice again before SB3. A second practice has no row file, because S-7 removed the practice folder and SHAPEON
runs only once: after S-3 and before S-5, run on the server SHAPEON's `install … /home/ubuntu/practice/shape-on.json` line again
(the release guide's SHAPEON block), as root, after `. /root/preview-archive/rNN-names.sh`. Part 2 says what the practice proves, and what it does not ("What was tried before the
downtime").

**12. STAFFHBA: the staff recovery login's line in the database's access file**
(`deploy/preview-lifecycle/v1/README.md`, STAFFHBA). REKEY (5.7) connects as that login after the rename, and the
database lets it in only with that line. STAFFHBA keeps a copy of the file, adds the one line above the catch-all
`local all all reject`, checks the file for errors and reloads the database (no restart). Run it before the downtime,
so the upload's cold copy (DR3) holds the line. Expect `STAFFHBA_DONE`. Its way back is the copy it kept and a reload,
as that guide says. REKEYCHECK (5.7) reads the line again after the upload.

**Before part 2 starts** you have seen, in this order: REV in the upload folder with nothing edited,
`Legal texts: ready for release.` with each text's day right (its live day for a version the site carries, the upload
day for a new one: the release guide's section "The legal texts' day"), `ALL PASSED`, `TRYDETACH_DONE` after a closed
window, `SB1_DONE`, the staging up to `A7_DONE`, `SHAPEON_DONE`, `POTS_DONE` (and your decision if it said `no` or `NO
ROOM`), `MAILTIME_DONE`, the practice's `PRACTICE_VERDICT PASS` lines with the rows matching, S-7's gates active, and
`STAFFHBA_DONE`. If one is missing, part 2 waits.

---

## 2. The upload day, with every lock closed

Upload with the release guide's "Drained upload on the template layout". SB1, the staging and the practice (SB2) ran
in the preparation (1.8). Then come the gates, SB3 and SB4, DR1 and the steps after it, your yes, the downtime (DR2 to
DR6), and the checks after it. Do not restate or change the recipe. Every lock stays closed during it: add no
`PREVIEW_ASKS_OPEN_TO`, no `PREVIEW_LIVE_PAYMENTS` and no other `PUBLIC_APP_URL` to any env file, leave
`mail-plan.json` as the v1 file, install no new drop-in (two exceptions: the Amazon gate's units and address drop-in,
piece 2; the restore fence's drop-in, FENCEDIR), and keep the site password on. Never add a new setting to the old
release's own files: a release older than this code refuses a key it does not know, and a way back starts it from its
own files.

**The step before Start is switched on in this upload.** From DR6 on, a signed-in person who asks a question sees,
after **Next** (Mai departe), a card **What we'll look into** (Ce vom cerceta): the AIs suggest paths to look into, the
person picks, then presses **Start investigating** (Începeți investigația). The settings version this upload publishes
carries the step: SHAPEON (1.8) built its row from the live row with only the start values added, and SB3 publishes
it. What that means today:
- At SB3, and when you read the delta (step 6), `debateShapePolicy` is among the changed rows, and A9's watch line
  names it. That is expected this once: the change is your choice. This release's own code moves two more watched
  rows, `admissionPolicy` and `billingPolicy`; step 6 says what each must show.
- In piece 1 the Anthropic gate goes from two calls at once to four (POTS said in the preparation whether its pot carries
  them).
- After DR6 come three proofs: STEPCHECK, a team member's test debate through the step, and STEPPROOF (steps 24 to
  28).
- If STEPCHECK or STEPPROOF shows the step off for a plan, the site still works: that plan's debates run as before,
  without the card, and nothing is undone. The fix is a settings activation on a later day.

**This upload also brings the Amazon gate**: the spending gate for OpenAI's GPT-6 Luna, which Amazon serves (the
release guide's section "The Amazon Bedrock gate: the upload that brings it", and
`deploy/preview-gate/v3/README-bedrock.md`). Luna itself is not switched on in this upload: that is the release
guide's piece 4, on a day of its own, after the upload. What the upload needs for the gate, in order: Luna's address
in the practice's settings (LUNAROW, in the preparation); the gates' new code and the Amazon gate before SB3; two
more things at SB4; Luna's address in the new release's files after DR1 and the proof and fence steps (BEDROCK_ENV); and GATEREADY and GATELIVE
before your yes. Web search needs no step of its own: DR1 copies the web-search gate's socket line from the running
release's API and runner files.

**How the steps run today.** Before the downtime, run each server step the ordinary way, except PRECHECK (a detached
run, step 14). From DR2 to DR6, and for every repair block and way back, use the detached run only ("How to run a
server step"). Each step below names the last line it must print. On any other last line, run nothing more: read the
text under that step, or the repair map (after step 23), or ask. Never put a `.before-…` copy back by hand. After any
`_NOT_DONE` from DR1 to SB5d, ask.

### 2.1 Before the downtime (the site is up)

**1. The texts' days are still right** (Mac, the upload folder). Run the date line of 1.8, step 3, again. A version
the live site already carries must show its live day (in this upload the Terms 1.1: 24 November 2026), and a new
version must show today (in this upload the Privacy Policy 1.2; the release guide's section "The legal texts' day",
`deploy/preview-release/v1/README.md`). If a line shows another day, stop before piece 1 and ask. PRECHECK (step 14)
reads both texts by the same rule. In this upload it prints `legal day: terms-of-service 1.1, in the live release,
keeps 24 November 2026` and `legal day: privacy-policy 1.2, new in this release, takes <today>`. Its `legal-date`
subject stops it only when a text does not carry that day; a new day then needs a new commit (the release guide's
section says how).

**2. GATESBEFORE** (server; the release guide's "Before piece 1"). It only reads: each older gate's start checks, run
by hand as systemd would run them, then its state and its calls in flight. Expect one line per gate, `<gate>: start
checks ok; state active; in flight 0`, then `GATESBEFORE_DONE`. On `GATESBEFORE_NOT_DONE`, its line names the gate and
what to do: repair it with that gate's own steps before piece 1, or ask.

**3. Pieces 1 and 2: the gates' new code, and the Amazon gate** (server; the release guide's pieces 1 and 2). Before
SB3, never later: from SB3 to the end of DR6 only the brakes may run (the order rules). These steps restart the gates,
run `activate`, and install the Amazon gate's units and its address drop-in (one of the two exceptions to "install no
new drop-in"). Have ready first:
- your two figures for the Amazon gate's GO (its daily pot and its daily number of calls), typed only on the server
  (install step 5; write them nowhere else). The pot is written with exactly two decimals and at most two digits
  before the point; the calls are a whole number from 1 to 5000, with no comma or space. A pot above the caps file's
  per-GO cap is refused at `init` (`ROOT_GO_INVALID`); a calls figure that breaks the step's `jq` line leaves an empty
  GO (`ROOT_GO_REQUIRED`). Install step 5's first block prints on your screen the range of pots `activate` accepts, as
  POTS did in the preparation: below it `activate` refuses `CONCURRENCY_EXCEEDS_BUDGET`, above it
  `TEAM_TOTAL_BUDGET_EXCEEDED`. A `NO ROOM` was settled in the preparation (1.8, step 9);
- a quiet hour, and your yes for the gates' restarts.

The AWS console work (`README-bedrock.md`, install step 0: Luna's subscription and quota, the key, a budget alert, an
AWS account e-mail address someone reads) is for Luna's own day. The upload does not wait for it.

Then, in one root shell (`sudo -i`), as the release guide's pieces 1 and 2 say:
- the DeepInfra and Perplexity gates on this release's gate code: `deploy/preview-gate/v3/README.md`, "Redeploy
  (2026-10-12)", steps 1 to 6, for each;
- the Anthropic gate: Redeploy steps 1 to 3, then `README-anthropic.md`'s "V4 start step (2026-11): four calls at once
  and this release's gate code": its step 2 in place of Redeploy step 4 (expect `["claude-haiku-5-5"]`, `4` and `1`),
  and its step 3 in place of Redeploy steps 5 and 6. Piece 1 changes no limit, except the Anthropic gate's calls at
  once (2 to 4) on the upload that switches the step on. Do not restart the running release's runner: it keeps the two
  calls it read at its start, which is safe, and the new runner reads four at DR6. If `activate` refuses
  `CONCURRENCY_EXCEEDS_BUDGET` (POTS makes it unexpected), do what `README-anthropic.md` says for that refusal, which
  brings the gate back on two calls, then ask before you go on. If you chose two calls at once (POTS said `no`): the
  gate README's Redeploy step 4 (the two hashes only) in place of the Anthropic guide's step 2, then that guide's step
  3;
- then README-bedrock's install step 3a: expect `active` three times, then `1` six times. A missing `active` line:
  stop and ask;
- then the Amazon gate: README-bedrock's install steps 1 to 3, 5, 6 and 7. **Do not put the Amazon key in now**
  (install step 4): it goes in on Luna's own day, after the notice when it is owed and after the gate's watchers start,
  right before your first probe (README-bedrock's "Switch it on"). Once the key and Luna's address are both in, the
  site checks Luna through the gate at every question someone asks, which is a real paid call; without the key nothing
  is sent to Amazon or charged, and debates run as before.

Each gate's `activate` (Redeploy step 6; the Amazon gate's install step 6) must show, in its own output,
`"provider": "<that gate>"`, `"state": "active"` and `"window_open": true`. A line with `"status": "refused"` means
stop, whatever `status` shows afterwards.

**If the window closes in the middle of piece 1:** open a new root shell and run GATES4 (step 4) first: it says which
gate is not active, or not on this release's code. Set `G` and `GO` again from the release guide's table of piece 1,
and `R` as piece 1 says, then finish that gate's steps. Never paste Redeploy step 1 again: it would copy the half-new
state as if it were the old one. If you must go back instead ("To go back" in the gate guide), the right copy folder is
that gate's `/root/preview-archive/redeploy-<time>-<gate folder>` whose time is just before the `halted_at` its
`status` prints. An Amazon install cut between its steps 6 and 7: run step 7.

**4. GATES4** (the release guide's Amazon section). Expect four lines `<gate>: gate code this release; state active`,
then `GATES4_DONE`. Go on to SB3 only then. If the upload stops after this step, the running release keeps serving,
but its settings activations are refused until this release is uploaded (the release guide's "The way back" in that
section). Between here and your yes, look at your mail now and then: a gate that could not start mails you after four
tries. Do not restart the server between piece 2 and your yes (the Amazon gate does not start at boot yet); a restart
for system updates is a day of its own.

**5. SB3, with the step before Start and your numbers.** At the top of SB3 set `STARTSTEP='yes'`: SB3 then publishes
SHAPEON's row. Expect `debate shape: only the start step added`, then the delta line with `debateShapePolicy` among
`changedKeys` (with the rows this release's code moves), then `SB3_DONE`. Anything else: run nothing more; before your
yes, SB3b sets this plan aside; ask.

Your numbers (1.7): SB3 publishes a number from `hosted-billing-v1.json` only where you name it in `NEWNUM` (and a plan
whose limits change, up or down, in `LIMITS`), and stops when the file differs anywhere you did not name. SITEINPUTS
(1.7) shows the same before SB3, one line per input. For an upload that changes no number, leave both lists empty. Two
rules for this upload: change no plan price in it (1.7, the trap with upgrades), and when `NEWNUM` is not empty, your
yes before DR2 names the inputs in it, and for each plan in `LIMITS`: when its limit goes lower or is said to have
changed, either that nobody holds it or the date its people were told; when its limit goes higher, that you checked
the number twice.

**6. The delta, read by you.** In a root shell, paste as one block: first `. /root/preview-archive/rNN-names.sh` (its
own first line: the lines below read `$ART`), then A9's two lines (the release guide's "A9. The owner reads the
delta"). They print each changed row, old against new, then the watch line. On this upload the watch line must be
`STOP: admissionPolicy billingPolicy debateShapePolicy` and nothing else. SB3 has already said, in its three
`watched row …` lines, how each of them changes, with names and counts only:
- `admissionPolicy`: members added only (the request budgets of this release's new pages), none removed, none changed;
- `billingPolicy`: `changed [withdrawal_countries: +7 -0]` and nothing else: the 14-day withdrawal right now covers
  seven more countries the site serves;
- `debateShapePolicy`: `members added [startStep]` and nothing else: the step before Start, your choice.

A fourth row on the watch line, a removed member, or another changed member is a stop: SB3b sets the plan
aside; ask. Note the `deltaSha256`: your yes names it, and DR5's `YES` is that hash in full.

**7. SB4, twice.** On this upload SB4 stops twice, and both stops are expected.
- **The first run** prints the changed operator files (`LIFECYCLE_FILES`): the first 20 names, then `and <n> more`. The
  full list is on the Mac, in the upload folder:
  `git diff --name-only <OREV> <REV> -- deploy/preview-auth-dev deploy/preview-lifecycle deploy/preview-release`, where
  `<OREV>` is the live release's commit, the names file's `OREV=` line (1.8, step 7). Review them. The same run stops
  on `GATE_ROWS_N1` with `changed since the switch: review <digest>`: the DeepInfra and Anthropic gates' files changed
  in piece 1, and GATES4 was your review of those files. Copy that digest between the quotes of `GRR=''` at the top of
  SB4. SB4 knows only those two gates; GATES4 is the review of the Perplexity and the Amazon gates' files. The first
  run's last line must be `SB4_NOT_DONE: DRAINED_PATH, and BAD too: <names>: …`, with `GATE_ROWS_N1` and
  `LIFECYCLE_FILES` as the only names. Any other name there: stop and ask.
- **The second run**, with `GRR` filled in and `LIFE=yes`, prints `changed (reviewed): <n> files`, and its last line
  must be `SB4_NOT_DONE: DRAINED_PATH (expected on a drained upload): no other check is BAD: use "Drained upload on
  the template layout"`. That is the one expected `_NOT_DONE` of the day: go on.

Two other stops can come in either run:
- **The release lock is full.** Before the release check, SB4 reads whether the lock has room for this release's pin
  (at DR5, inside the downtime). If not, it stops with nothing changed:
  `SB4_NOT_DONE: the release lock is full (…): archive <label> first with SB15 (PREV='<label>', …), then run SB4
  again`. Run the release guide's SB15 with that label, on your yes (the site stays up), then SB4 again. It never
  names the release you would go back to, the one the Turnstile relay runs from, or the one that holds the package
  store this upload started from; if none is left, its line says so: ask.
- **`NO_MAINTENANCE` with `reboot required`.** A system update on the server wants a restart. Only SB4's release check
  reads that flag: nothing else in the upload, and not the switch, reads it, so every step works the same with it.
  Whether you go on with the restart still owed, or restart the server first, on a day of its own, and run SB4 again,
  is your decision (step 4: no restart between piece 2 and your yes). SB4's last line then names `NO_MAINTENANCE` and
  ends with a sentence that says so, but only when the other names on it are `GATE_ROWS_N1` and `LIFECYCLE_FILES`;
  with any other name there, that name is the stop: ask. To go on, type `later` between the quotes of `REBOOT=''` at
  the top of SB4 and run it again: it prints `NO_MAINTENANCE: reboot required is not counted …`, and its last line is
  the expected one, with `but NO_MAINTENANCE (reboot required), not counted (REBOOT=later)` before `: use`. To restart
  first: ask (no step here restarts the server, and after a restart some services must be started by hand). Before you
  choose, read whether the server restarts by itself after its daily upgrade: in a root shell,
  `apt-config shell AR Unattended-Upgrade::Automatic-Reboot` (it changes nothing) prints `AR='true'` when it does, and
  then it may restart on its own with the restart owed: ask. `maintenance pending` instead, or any other new name: stop
  and ask.

Two notes on the files: the restore fence's drop-in is installed by FENCEDIR (step 10), not by the tools-folder swap;
and the swap (SWAP, step 21) changes nothing in Caddy.

**8. MAILPLAN once more, right before DR1.** Run MAILPLAN (1.5) again immediately before DR1, and stop the upload
unless it prints `MAILPLAN_DONE`. A plan that changed since the preparation makes the new API refuse to start at DR6,
inside the downtime (`PREVIEW_API_STARTUP_REFUSED PREVIEW_MAIL_…`). The release guide's own steps do not check this.

**9. DR1** (the three new env files, copied from the running release's). Expect `DR1_DONE`.

**10. FENCEDIR, SB5c and H11 step 2, in this order** (the release guide's H11 step 1, SB5c, H11 step 2). The new API
refuses to start without `UI_API_PROOF_PATH` and `RESTORE_FENCE_PATH` in `api-<LABEL>.env`, and the new website
without `DIALECTICAL_UI_API_PROOF_PATH` in `ui-<LABEL>.env`. These three steps make the fence folder (and its drop-in)
and write those lines. Expect `FENCEDIR_DONE`, `SB5C_DONE`, then `H11_DONE`. They come before BEDROCK_ENV, which
compares the files with the copy it keeps. PRECHECK (step 14) proves the lines before your yes; AFTERDR6 (step 25)
reads the fence's state after the switch.

**11. BEDROCK_ENV** (the release guide's piece 3). It adds the Amazon gate's socket and Luna's address to the new
release's API and runner files; the old release's files do not change. Expect `api-<LABEL>.env: 7 model addresses,
the Amazon socket named`, the same line for `runner-<LABEL>.env`, then `BEDROCK_ENV_DONE`.

**12. SB5d: NETOPIA's logo** (1.1), with the shop id. Expect `SB5D_DONE`. Skip PM1, SB5b, MT1, PM2 and MT2. LOGOCHECK
comes after the downtime (step 29).

**13. UNFINISHED** (below, under "The unfinished sign-ups"). The new release deletes sign-ups that were never
finished. UNFINISHED counts the ones it deletes at DR6, and your yes before DR2 names that count. Expect the count
line, then `UNFINISHED_DONE`.

**14. PRECHECK, as a detached run** (the release guide's drained section, after DR1). It only reads everything the new
release, the database steps and the way back need that can be read with the site up: the new files' proof and fence
lines and their modes, the fence folder against every key store and key file (`overlaps: 0`), publication's state,
the logins, owners and schema the database steps expect, the data folder (no links, no part outside it), free space
for the cold copy, that the API's, the runner's and the scheduler's logins have no connection limit, and the texts'
date. Run it detached: that also shows, before the downtime, that the database tools (`runuser`, `psql`) work in a
detached run. Expect one line per subject, then `PRECHECK_DONE`. On `PRECHECK_NOT_DONE`, the line names the subject:
nothing changed and the site is up. Give no yes; ask. PRECHECK also prints when the system's daily upgrade timer fires
next: do not give the yes within an hour before that time. DR2 refuses while a system upgrade runs (wait, then DR2
again).

**15. GATEREADY** (the release guide's Amazon section). It only reads what is on disk: each gate's files, their
hashes and their state, the Amazon gate's unit, and the new release's two files. Expect four lines `<gate> gate: code
this release; state active; window open true`, two lines `<service>-<LABEL>.env: 7 model addresses; Luna's address
there; the Amazon socket named; this release's start check of the addresses: accepted 7`, then `GATEREADY_DONE`. On
`GATEREADY_NOT_DONE` its last line names what is missing (`piece 1`, `piece 2`, `piece 3` or `ask`) and the `MISSING`
lines above it say which gate or file. Nothing has changed and the site is up. You are inside the window where only the
brakes may run (the order rules), so:
- `piece 3`: run BEDROCK_ENV, then GATEREADY again;
- `MISSING (piece 2): the Amazon gate's service is not running` after a reboot: the one exception of the order rules
  (run `systemctl show -p Result,NRestarts debateai-preview-bedrock-budget`; with `Result=success` and `NRestarts=0`,
  run `systemctl start debateai-preview-bedrock-budget`, then GATEREADY again);
- anything else under `piece 1`, `piece 2` or `ask`: no yes and no downtime. Do not redeploy, restart or `activate` a
  gate now: stop and ask.

**16. GATELIVE** (the release guide's Amazon section, right after GATEREADY). GATEREADY reads files; GATELIVE asks each
running gate what the new API will ask it, as the new API's user, and changes nothing. Expect one line per gate,
`<gate>: service active; socket there; asked as the API: state active; window open true; calls at once <n>; models
<k>` (no amount), then
`GATELIVE_DONE`. On `GATELIVE_NOT_DONE`: no yes; ask.

**What was tried before the downtime, and what was not.** Read this before your yes. Tried: the practice (on the
Mac, with billing off: this code's ask and the runner's wiring on the live settings plus this code's next version, the
new debate-shape row, and the step's calls before Start through the real DeepInfra and Anthropic gates); the Mac check
(the tools folder, an install and a website build, every database step on an empty database, the production logins'
roles); SB3's plan, which writes nothing; and PRECHECK, GATEREADY and GATELIVE, which read the new files, the
database's shape and the gates as the new API will. Not tried anywhere: this release's database steps on the real data
(PRECHECK reads what they need, but a database function changed by hand would still surprise them); the new API's
start stages (the stage table under step 23); the tools-folder swap (SWAP); the switch; and the pot check of the step
before Start (does one widest debate fit each gate's daily pot), which runs only at STEPCHECK, after the upload. These meet the server for
the first time inside the downtime. That is why every downtime step runs detached, and why the repair map exists.

**17. Your yes before DR2.** Give it in the live chat, fresh, right before DR2, and only after `GATELIVE_DONE`. Besides
what the release guide's yes names (the downtime, the cold copy, the migrations, the publish with its delta hash, and
the commit with its release key), it names:
- `PRECHECK_DONE`, `GATEREADY_DONE` and `GATELIVE_DONE`;
- the `deltaSha256` you noted (step 6), and that its `debateShapePolicy` change switches the step before Start on;
- the Anthropic gate's calls at once after piece 1: four (or two, if POTS said `no` and you chose two);
- the UNFINISHED count, for example "UNFINISHED: 37";
- your numbers, when `NEWNUM` is not empty (step 5).

For the Amazon gate, it also says that no Privacy Policy section 14 notice is owed at this upload: Amazon receives
nothing until Luna is switched on, and only your and the team's accounts exist. Your own test sign-ups (4.3) do not
count as accounts outside the team; a friend's or NETOPIA's tester's would. If someone outside the team already has an
account, ask before the yes. Amazon's dated Register row comes with this release, and from DR6 the AI providers page
lists Amazon while Luna stays off. Before Luna is switched on (the release guide's piece 4), if any account outside the
team exists by then, the notice goes out first (by e-mail and in the product, naming Amazon and what it will receive),
and the Amazon key and Luna wait until the time to object has passed.

### 2.2 The downtime (each step a detached run)

From DR2 until DR6 ends the site is down. Run each step as a detached run and read its log's last line. **If the
window is lost** inside any of them: reconnect, `sudo -i`, and read the log ("How to run a server step"). The step
went on by itself. Never paste a downtime step a second time without reading its log first.

**18. DR2.** Expect `DR2_DONE`. While a system upgrade runs, DR2 refuses with nothing stopped: wait, then DR2 again.
Never restart the old runner by hand: if DR2 stops, its line says whether anything was
stopped, and the repair map says what comes next.

**19. DR3** (the cold copy). Expect `DR3_DONE`. If it stops after it stopped the database side, its line says the
database is STOPPED or partly up: DBBACK (the repair map).

**20. DR4** (the database steps). Expect `DR4_DONE`. If it stops, its log has a line `ledger <count>|<newest name>`.
Compare it with SB1's (`bash -c '. /root/preview-archive/rNN-names.sh; cat "$S/ledger-before"; cat "$S/new-migrations.txt"'`
prints SB1's line, then this release's steps in order):

| The `ledger` line in DR4's log | What it means | Next (a detached run) |
|---|---|---|
| the same as SB1's | nothing was applied | DR4AGAIN, or rbD-A |
| a count between SB1's and SB1's plus all of this release's steps | the steps stopped at the next name in `new-migrations.txt` | DR4AGAIN only when the log shows `[MIGRATION_LOCK_RETRY]` lines or the window was lost; otherwise rbD-B (ask first) |
| SB1's count plus all of this release's steps, with the newest name | everything was applied; only the proposal was refused | ask |

Why a step stopped is in DR4's log (the operator's error lines) and in `journalctl -u debateai-preview-postgresql`:
PostgreSQL writes a failing statement to no other log.

**21. SWAP** (the tools-folder swap, between DR4 and DR5). Expect `SWAP_DONE`. It puts this release's operator tools
in place of the old ones, which it keeps in the upload's archive folder; when the tools are already this release's it
says so and ends `SWAP_DONE`.

**22. DR5.** Type the `deltaSha256` of your yes, in full, into its `YES` line before you start it. Expect `DR5_DONE`.

**23. DR6.** Expect `DR6_DONE`: the downtime ends. At DR6 the new API reads `mail-plan.json` before anything else of
the API runs; its journal shows `PREVIEW_MAIL_MODE {"mode":"legacy","origin":"https://v3-preview.dezbatere.ro"}`
before `PREVIEW_API_STARTED`.

If DR6 stops because a service did not start, read why before anything else. Paste this one line, with rNN filled in
(it reads the upload's names file, so `$LABEL` is the new release):

```sh
bash -c '. /root/preview-archive/rNN-names.sh; for S in runner api ui; do echo "== $S"; journalctl -u "debateai-preview-$S@$LABEL" -n 80 -o cat --no-pager | grep -E "STARTUP_REFUSED|PRESTART_REFUSED|PREVIEW_MAIL_MODE|api.boot.failed|STOPPED_ON_FAILURE" | cut -c1-300; done'
```

A refused API start shows a line `{"event":"api.boot.failed","stage":"<stage>"}`, then a bare
`PREVIEW_API_STARTUP_REFUSED`: the stage says what it is about. The refusals come one at a time, so fixing one can
show the next.

| Stage, or line | What it is about | Then |
|---|---|---|
| `ui-api-proof` | the proof line in the new API file, or its proof file (SB5c) | DR6AGAIN, then LATELINES, then DR6 |
| `restore-fence-path` | the fence line in the new API file (H11 step 2), or a fence folder above a key store or key file | the line missing: DR6AGAIN, then LATELINES, then DR6; the overlap: ask |
| `restore-fence` | the fence folder itself | DR6AGAIN, then FENCEDIR, then DR6 |
| `corpus-kek`, `publication-secret-domains`, `database-roles`, `publication-key-store`, `publication-key-cleanup` | publication's keys and its clean-up login: with publishing on (5.9) the new release starts on the same corpus key, key store and clean-up login as the old one, whose lines DR1 copied unchanged (5.9a) | ask |
| `outbound-mail-policy`, `outbound-mail-store`, or a `PREVIEW_MAIL_…` code | the mail plan (1.5) | ask |
| `pre-start-writer` | the database step that records the charges before Start | ask |
| `preview-live-payments`, `preview-asks-open`, `saved-question-key-store` | payments, asks, or the saved questions' keys | ask |
| a bare `PREVIEW_UI_STARTUP_REFUSED` (the website) | first the website's proof line or proof file (SB5c) | DR6AGAIN, then LATELINES, then DR6 |
| `PREVIEW_LIFECYCLE_PRESTART_REFUSED`, or any other stage | a start rule outside this table | ask |

DR6AGAIN always comes first: after a refused start the new units keep trying to start by themselves for about two
minutes, and DR6AGAIN stops them. Where the table says "ask", stop and ask before you choose the way back.

**If a downtime step stops: the repair map.** With the site down, follow this table. Every repair block runs as a
detached run. They are in the release guide's "Drained upload on the template layout", except FENCEDIR (its H11 step 1)
and WB4 (its "The way back, side by side"). What the last column names is
"stop and ask", even with the site down: never improvise there. After any way back, run GATES4.

| What stopped | Read first | Repair block | Then | Stop and ask when |
|---|---|---|---|---|
| any downtime step, the window lost | the log, and whether the step still runs | none: the step went on | what its last line says | the log ends with no step line, and nothing runs |
| DR2 | its last line | none | nothing was stopped (the line says so): fix the cause, then DR2 again; otherwise rbD-A | rbD-A stops |
| DR3, before it stopped the database side (its line does not say STOPPED) | its last line | none | rbD-A (the old release starts again) | rbD-A stops |
| DR3, after the database side was stopped | the last line; `systemctl is-active debateai-preview-postgresql debateai-preview-hatchet debateai-preview-hatchet-gateway` | DBBACK | `cold copy: complete and checked`: DR4, or rbD-A; `cold copy: partial, moved into …`: DR3 again, or rbD-A | Hatchet's address is not in the gateway's allow list; the gateway witness is not PASS |
| DR4 | the `ledger` line against SB1's (the table under step 20); `[MIGRATION_LOCK_RETRY]` lines | DR4AGAIN (a lock wait, a lost window, or nothing applied) | DR4AGAIN's own last checks, then SWAP | a named step refusal (a `_DRIFT` or another code): rbD-B; everything applied but refused |
| SWAP | its log | SWAP again (it skips what is already this release's) | DR5 | the folders still differ after the swap |
| DR5 | the log's last printed line | DR5RESUME: before `PUBLISHED_<V>` it sets the unpublished files aside and says to run DR5 again; after it, it finishes DR5's lines | DR5 again, or DR6 | a refused publish; a version mismatch; a refused launch plan, pin or stage; the old release's entry changed |
| DR6, a service did not start | the three journals and the stage table (step 23) | DR6AGAIN first, then LATELINES or FENCEDIR (or none) | DR6 | any stage the table sends to "ask"; a fence overlap |
| DR6, the switch refused before it wrote | the switch's line | DR6AGAIN, then fix what it names, when that is a gate service that is not running | DR6 | anything else (a gate's `activate` is no brake) |
| DR6, the switch `bad`, or its outcome unknown | WB4's first two lines (the release guide) | WB4 with the word `drained`, then DR6TAIL | STEPCHECK, then AFTERDR6 (step 24 on) | WB4 refuses |
| rbD-A or rbD-B | its log | none | – | always: ask. Never run rbD-B a second time |
| a second attempt with the same number, after a way back | – | AGAINSAME (before DR2, site up) | PRECHECK, GATEREADY, GATELIVE, a new yes, DR2 | free space is short; the old release is not the current one |

WB4 takes the word `drained` as its argument: save it as the step file and start it with `… /bin/bash
/root/ms-step.sh drained` at the end of the start line.

### 2.3 After DR6 (the site is up, behind the password, asks closed)

**24. STEPCHECK** (the release guide's "The step before Start, switched on in the upload"), first after `DR6_DONE`. It
reads the active settings version's row (the step is in it, and on), the engine row, the line-ups (two models or more,
no Luna), the database step of the charges before Start, then runs the settings check of the active version. Expect
`the step can run on every plan, and one widest debate fits each gate's daily pot`, then `STEPCHECK_DONE`.
- `STEPCHECK_NOT_DONE: the step is in the row but <codes>: …` names codes of two kinds:
  - `START_STEP_UNREACHABLE:<plan>:…` (for example `…:ONE_MAKER`): the step is off for that plan, and the site works
    without it there; nothing is to undo. Go on with the upload's checks and ask. The fix is a settings activation on
    a later day (the engine row, or a line-up with two makers), never during an upload.
  - `GATE_POT_BELOW_ONE_DEBATE:<gate>:…` or `GATE_POT_UNANSWERED:<gate>`: the step is on, and one widest debate does
    not fit that gate's daily pot, or that gate did not answer: ask. After the gate, the code names the choice that
    does not fit: the plan, `question` or `dig`, the depth, the paths, and `web` when it searches (for example
    `…:dig:d2:p<paths>:web`, a paid plan's dig at depth 2, at its widest How wide, with web search). The hint under
    it gives the two ways out, both your decision and both after the upload: raise that gate's pot, or narrow How wide
    for that plan. POTS (1.8, step 9) could not have seen this: it never prices a debate.
- If the step is on but its calls fail on the site (the paths never come, or the card shows errors), its own way back
  is a later settings version with the old row (`shape-base.json`), as that section says. Ask first.

**25. AFTERDR6** (the release guide's drained section). It only reads. Expect `restore fence: INITIALISED 1`,
`backup timer: active`, `old release: RETIRED`, `boot target: the new pair`, the runner's line, then `AFTERDR6_DONE`.
On `AFTERDR6_NOT_DONE`: ask.

**26. The test debate, through the step.** One debate serves both SB13b and the proof of the step. A team member (or
you), with a team account, behind the site password (asks are closed, so only the team can ask): sign in, open the
page to ask a question (`/v4`), type a question, press **Next** (Mai departe). The card **What we'll look into** (Ce
vom cerceta) must appear, with paths the AIs suggest. Keep the paths it picked, or pick others, press **Start
investigating** (Începeți investigația), and wait until the 5-second **Undo** (Anulați) has passed. The debate's page
opens. Note its id: the last part of its address (`/v4/debate/<id>`). No card after **Next**: go on with step 27, then
ask (STEPCHECK and STEPPROOF say why).

**27. SB13b.** Expect `SB13B_DONE`. A line that says the debate is still READY: run SB13b again in a minute.
`SB13B_NOT_DONE: the test debate FAILED: ask`: ask.

**28. STEPPROOF** (same section as STEPCHECK), with the debate's id from step 26 in its `RID=''` line. It only reads.
Expect `start paths: MENU width <w> paths <n>`, then `STEPPROOF_DONE`. `STEPPROOF_NOT_DONE: the test debate did not go
through the step: ask`: the site works; ask.

**29. LOGOCHECK** (the release guide). It only reads, and must end with `LOGOCHECK_DONE`: part 5 waits for it.

**30. MONTHNUMBERS.** To keep each person's month on the numbers it started with, the new API and runner read the
database's record of release switches through a function this release adds (migration `0185_release_history.sql`).
SB13b's team debate may be paid from a team grant, which never reads that record, so check it once by hand. The check
is read-only: it asks the record as the API's login and as the runner's login, and wants the new release as its last
line.

  ```sh
  set -euo pipefail
  . /root/preview-archive/rNN-names.sh
  # MONTHNUMBERS: both logins can read the record of release switches, and its last line is the new release. Read-only.
  for LOGIN in debateai_prod_api_runtime debateai_prod_runner_runtime; do
    LAST=$(runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAtq -c "SET ROLE $LOGIN; SELECT release_key FROM core.read_release_history() ORDER BY event_seq DESC LIMIT 1" | tail -n 1) || { echo "MONTHNUMBERS_NOT_DONE: $LOGIN cannot read the record of switches: ask"; exit 1; }
    [ "$LAST" = "$KEY" ] || { echo "MONTHNUMBERS_NOT_DONE: $LOGIN reads '$LAST' as the last switch, not $KEY: ask"; exit 1; }
    echo "OK $LOGIN"
  done
  echo MONTHNUMBERS_DONE
  exit 0
  ```

You should see `OK` for both logins, then `MONTHNUMBERS_DONE`. Then, signed in as a Free or paid account that is not
paid from a team grant, open the page that shows your usage, or ask one question: it must answer as usual. A
`MONTHNUMBERS_NOT_DONE` line, or a refused question there while team debates work: stop and ask. This block was
written on the Mac and has not been run on the server yet.

**31. The unfinished sign-ups' pass.** Read its lines in the new API's journal, as "After DR6" under "The unfinished
sign-ups" says (below).

**32. One classic PDF report.** Open one older debate's classic page (`/debate/<id>`) and press **Download full report
(PDF)** (Descărcați raportul complet (PDF)). The PDF must download. This release makes the report in a new way inside
the website's sandbox, and nothing else tries it before real people do. If it fails, the site stays up: read the
website's journal for `[STORY_REPORT_WORKER_ENDED]` or `[STORY_REPORT_RENDER_FAILED]`, and ask.

**33. The step is proven on.** The upload is done. Go on with part 3.

Later, on the Mac: the release guide's SB13c, so the next upload's SB4 finds the N-1 baseline on this release. Its pull
request starts the N-1 check, which is expected to be red while drained steps are new (the check's own text says why).

**Notes for the day.**
- **The new SAME lines.** DR1's `same` still runs the old tools, so it prints no new line. After SWAP,
  `lc release-env.mjs same --labels "$LABEL" --slots "$SLOT"` also prints `OK SAME_UI_API_PUBLIC_APP_URL:<LABEL>`,
  `OK SAME_API_RUNNER_PREVIEW_ASKS_OPEN_TO:<LABEL>`, `OK VALID_PREVIEW_ASKS_OPEN_TO:<LABEL>` and
  `OK UI_NETOPIA_LOGO_ID:<LABEL>`. With two labels it also prints `OK SAME_PUBLIC_APP_URL`, `OK SAME_API_PAYMENT_SYSTEM`
  and `OK SAME_PREVIEW_ASKS_OPEN_TO`.
- **The sandbox start counts one more thing.** The API's sandbox start also counts open live payment work. This
  database never took a live payment, so the count is 0 and the API starts as before.
- **Caddy's health check.** This upload does not change Caddy. Its two-slot health check is still the transition's (the
  edge secret in the probe, a 1-second limit, out after one miss); nothing is worse than today. It changes only with
  its own reviewed step, written for this server's Caddyfile, and run before NAME1 (5.1): after NAME1, every kept copy
  pins the old lines (NAME2, NAME3, NAME5, NAME1_BACK, REVIEW_OPEN, PWOFF2 and PWON compare or restore them).
- **Until Luna's own day: the Amazon gate unused.** Its window closes 31 days after its `activate` (piece 2). With no
  key, no call reaches it, so it stays `active` with `window_open` false, and ASKS_OPEN (6.1, 8.1) refuses then: run
  its `stop` line, then its `activate` line (6.5). After a reboot nothing starts it (its start at boot comes with Luna's
  day); that changes nothing for the debates, and `systemctl start debateai-preview-bedrock-budget` starts it. Put the
  key's end date in your calendar: a key past its end date stops the Amazon gate (`README-bedrock.md`, "A new key").

**The unfinished sign-ups (UNFINISHED).** From this release on, a sign-up not finished within 24 hours is deleted.
Not finished means the account still waits for its e-mail link to be opened (`pending_verification`) or for its second
factor (`pending_mfa`). Today nothing deletes such an account, so it keeps its e-mail address and its public name
(pseudonym) for good. Signing up again with that address shows the usual answer ("If this address can be registered,
verification instructions will arrive. Check your spam folder."), and no mail ever comes. While today's v1 mail plan
refuses every account mail (1.4), every sign-up on this server waits like that.

**What happens at DR6.** As soon as the new release becomes current, its API deletes every sign-up already due: still
unfinished, begun at least 24 hours ago, and every e-mail link it was sent has run out (a link lasts at most 24 hours,
so a link sent again late keeps its sign-up a little longer). The oldest go first, at most 1,000 at once; any more go
1,000 at a time every ten minutes. Each one goes with its pseudonym and its key folder on the server; what stays is one
audit line and the record of the Terms it accepted, as for a deleted account. Its address can sign up again at once.
An account that was ever active is never touched. From then on the API does the same every ten minutes, for each
sign-up that turns 24 hours old.

Run it before your yes (part 2, step 13), while the old release still runs. It only reads, and prints a count only:

```sh
set -euo pipefail
# UNFINISHED: how many unfinished sign-ups the new release deletes at its first start (read-only; prints a count, no names and no addresses).
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
N=$(psqlq "SELECT count(*) FROM identity.\"user\" AS account WHERE account.state IN ('pending_verification','pending_mfa') AND account.created_at <= clock_timestamp() - interval '24 hours' AND NOT EXISTS (SELECT 1 FROM identity.channel_binding AS channel JOIN identity.verification_token_credential AS link ON link.channel_binding_id = channel.channel_binding_id WHERE channel.user_id = account.user_id AND link.expires_at > clock_timestamp())") || { echo "UNFINISHED_NOT_DONE: the database is unreadable: ask"; exit 1; }
[ -n "$N" ] || { echo "UNFINISHED_NOT_DONE: the database gave no count: ask"; exit 1; }
echo "unfinished sign-ups the new release deletes at its first start (DR6): $N"
echo UNFINISHED_DONE
exit 0
```

Expect the count line, then `UNFINISHED_DONE`. Name the count in your yes before DR2, for example "UNFINISHED: 37".
The number can grow a little before DR6: a sign-up that turns 24 hours old in between goes too. If the count surprises
you (it is larger than the sign-ups you know of), ask before DR2. Someone among them who still wants an account signs
up again with the same address once mail reaches them: after MAIL_ALLOW (4.2) for the four allow-listed addresses,
after MAIL_OPEN (4.3) for everyone else. Before that, a new sign-up gets no mail either: it waits again, and goes 24
hours later. If you ever go back with rbD-B, part 9 says what happens to these sign-ups.

**After DR6**, look for the pass's lines in the new API's journal. Paste this one line, with rNN filled in:
`bash -c '. /root/preview-archive/rNN-names.sh; journalctl -u "debateai-preview-api@$LABEL" -o cat --no-pager | grep -E "signup[.]unfinished_expired|UNFINISHED_SIGNUP_EXPIRY_PENDING"'`.
- `{"event":"signup.unfinished_expired","expired":<n>,"keys":<n>,"failed":0}`: a pass that deleted something.
  `expired` counts the sign-ups that went, `keys` their key folders. The first line's `expired` should be your count
  (at most 1,000, and a little more if more turned 24 hours old before DR6). With a count of 0, expect no line.
- `[UNFINISHED_SIGNUP_EXPIRY_PENDING]`: a pass did not finish (then the line above it says `"failed"` more than 0, or
  there is none). What it left stays due, and the next pass, ten minutes later, tries again. The site keeps running.
  If the line shows on two passes in a row, ask.

---

## 3. After the upload: your sandbox test, on the test name, behind the password

### 3.0 The locks' names file

Every script from here on reads one file: `/root/preview-archive/main-site/names.sh`. It reads the upload's names file,
checks that its release is the one current release, and defines the names and small helpers the scripts use. All the
copies these steps keep go into `/root/preview-archive/main-site`, so they survive a later upload.

Fill in `rNN` (the upload you just did; to run it again, read "LOCKS0 again" below first), then run:

```sh
set -euo pipefail
# LOCKS0: the locks' names file and their folder; run again, the file is written anew from this guide and the file before is kept. Nothing live changes.
NAMES=/root/preview-archive/rNN-names.sh                  # the upload's names file (after a later upload: that one's); left as rNN when the names file exists: its first line stays
M=/root/preview-archive/main-site
if [ -e "$M/names.sh" ]; then
  FIRST=$(head -n 1 "$M/names.sh")
  if [ "$NAMES" = /root/preview-archive/rNN-names.sh ]; then
    printf '%s\n' "$FIRST" | grep -qxE '\. /root/preview-archive/r[0-9][0-9a-z-]*-names\.sh' || { echo "LOCKS0_NOT_DONE: the first line of $M/names.sh does not read an upload's names file (nothing changed): fill in rNN, or look"; exit 1; }
    NAMES=${FIRST#. }
  fi
  [ -f "$NAMES" ] || { echo "LOCKS0_NOT_DONE: $NAMES is missing (nothing changed): fill in rNN"; exit 1; }
  KB=$M/names.sh.before-$(date -u +%Y%m%dT%H%M%SZ)
  [ ! -e "$KB" ] || { echo "LOCKS0_NOT_DONE: $KB exists (nothing changed): run LOCKS0 again a second later"; exit 1; }
  cp -p "$M/names.sh" "$KB" || { echo "LOCKS0_NOT_DONE: the names file before was not kept (nothing changed): ask"; exit 1; }
  echo "the names file is written anew from this guide; its first line reads $NAMES, and the file before is kept beside it"
fi
[ -f "$NAMES" ] || { echo "LOCKS0_NOT_DONE: $NAMES is missing (fill in rNN)"; exit 1; }
install -d -o root -g root -m 0700 "$M"
for D in name mail asks pay password; do install -d -o root -g root -m 0700 "$M/$D"; done
umask 077
{ printf '. %s\n' "$NAMES"; cat <<'EOF'
M=/root/preview-archive/main-site
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "NAMES_NOT_DONE: release-check.mjs status refused (above): ask"; exit 1; }
[ "$(jq -r '[.releases[] | select(.state == "CURRENT") | .label] | join(" ")' <<<"$ST")" = "$LABEL" ] || { echo "NAMES_NOT_DONE: $LABEL is not the one current release: put the newest upload's names file in the first line of $M/names.sh"; exit 1; }
[ "$(jq '[.releases[] | select(.state == "STAGED" or .state == "DRAINING")] | length' <<<"$ST")" = 0 ] || { echo "NAMES_NOT_DONE: a release is staged or draining (an upload is under way): wait until it is over"; exit 1; }
A=$E/api-$LABEL.env; UF=$E/ui-$LABEL.env; RF=$E/runner-$LABEL.env
API=debateai-preview-api@$LABEL; WEB=debateai-preview-ui@$LABEL; RUN=debateai-preview-runner@$LABEL
MP=$E/mail-plan.json; MR=$E/mail-recipient.json; B=/etc/debateai-v3-preview/billing
EG=/opt/debateai-v3-preview/operator/egress-v1; EGU=debateai-preview-egress.service
TDROP=/etc/systemd/system/debateai-preview-turnstile.service.d/20-public-origin.conf
EDROP=/etc/systemd/system/debateai-preview-egress.service.d/50-live-payments.conf
GPX=/opt/debateai-v3-preview/operator/perplexity-budget-v1; PPX=/var/lib/debateai-v3-preview/provider-perplexity-authority-v1
GBR=/opt/debateai-v3-preview/operator/bedrock-budget-v1; PBR=/var/lib/debateai-v3-preview/provider-bedrock-authority-v1
HOST=$(sed -n 's|^PUBLIC_APP_URL=https://||p' "$A")
case "$HOST" in v3-preview.dezbatere.ro|dezbatere.ro) ;; *) echo "NAMES_NOT_DONE: $A does not name one of the two names exactly once: look"; exit 1;; esac
KEYS='^(NETOPIA_API_BASE_URL|NETOPIA_POS_SIGNATURE|NETOPIA_API_KEY_PATH|NETOPIA_IPN_KEYS_PATH|QUADERNO_API_BASE_URL|QUADERNO_API_KEY_PATH|SMARTBILL_API_BASE_URL|SMARTBILL_CREDENTIALS_PATH|SMARTBILL_SERIES|OWNER_REPORT_EMAIL_PATH|PREVIEW_LIVE_PAYMENTS)='
inv() { journalctl -o cat --no-pager _SYSTEMD_INVOCATION_ID="$(systemctl show -p InvocationID --value "$1")"; }
said() { [ "$(inv "$API" | grep -c "$@" || true)" -gt 0 ]; }
apistart() { local t i; sleep 1; t=$(date +%s); systemctl reset-failed "$API" 2>/dev/null || true; systemctl reset-failed "$WEB" 2>/dev/null || true; systemctl restart "$API" || echo 'systemctl restart of the API returned non-zero'
  for i in $(seq 1 80); do [ "$(journalctl -u "$API" --since "@$t" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; [ "$(systemctl is-active "$API" || true)" = failed ] && break; sleep 3; done
  journalctl -u "$API" --since "@$t" -o cat --no-pager | grep -E 'PREVIEW_LIFECYCLE_PRESTART_REFUSED|PREVIEW_MAIL_MODE|api\.boot\.failed|api\.preview\.asks_open|PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED' | cut -c1-300 || true
  [ "$(journalctl -u "$API" --since "@$t" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" = 0 ] && [ "$(journalctl -u "$API" --since "@$t" -o cat --no-pager | grep -c '^PREVIEW_API_STARTED ' || true)" -gt 0 ] && [ "$(systemctl is-active "$API" || true)" = active ] || { echo "the API did not start (systemctl is-active of the API: $(systemctl is-active "$API" || true))"; return 1; }; }
apiup() { local i c=000; apistart || return 1
  for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$UIP/login" || true); [ "$c" = 200 ] && break; [ "$(systemctl is-active "$WEB" || true)" = failed ] && break; sleep 3; done
  [ "$c" = 200 ] || { echo "the API started, but the website does not answer its Log in page (systemctl is-active of the website: $(systemctl is-active "$WEB" || true))"; return 2; }; }
webup() { local t i c=000; sleep 1; t=$(date +%s); systemctl reset-failed "$WEB" 2>/dev/null || true; systemctl restart "$WEB" || echo 'systemctl restart of the website returned non-zero'
  for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$UIP/login" || true); [ "$c" = 200 ] && break; [ "$(systemctl is-active "$WEB" || true)" = failed ] && break; sleep 3; done
  journalctl -u "$WEB" --since "@$t" -o cat --no-pager | grep -E 'PREVIEW_LIFECYCLE_PRESTART_REFUSED|PREVIEW_UI_STARTUP_REFUSED' | cut -c1-300 || true
  [ "$c" = 200 ] && [ "$(journalctl -u "$WEB" --since "@$t" -o cat --no-pager | grep -cE 'PREVIEW_UI_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" = 0 ] && [ "$(systemctl is-active "$WEB" || true)" = active ] || { echo "the website did not start (its Log in page answered $c; systemctl is-active of the website: $(systemctl is-active "$WEB" || true))"; return 1; }; }
upfail() { if [ "$1" = 2 ]; then printf 'the API started on %s, but the website did not answer its Log in page (the line above)' "$2"; else printf 'the API refused %s (its code is above)' "$2"; fi; }
relay() { local p; p=$(systemctl show -p MainPID --value debateai-preview-turnstile); [ "${p:-0}" != 0 ] && tr '\0' '\n' < "/proc/$p/environ" | grep '^PUBLIC_APP_URL=' || true; }
loc() { curl -sI "$1" | tr -d '\r' | tr 'A-Z' 'a-z' | grep '^location:' || true; }
notify() { curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' "https://$1/api/v1/billing/netopia/notify" || true; }
hsts() { curl -s -o /dev/null -D - -X POST -H 'Content-Type: application/json' --data '{}' "https://$1/api/v1/billing/netopia/notify" | tr -d '\r' | tr 'A-Z' 'a-z' | grep '^strict-transport-security:' || true; }
order() { cad adapt --config "$1" --adapter caddyfile 2>/dev/null | jq -r --arg h "$2" '[.apps.http.servers[].routes[] | select(.match[0].host[0]==$h) | .handle[] | .. | objects | select(has("handler")) | .handler] | join(" > ")'; }
nblock() { awk -v site="$2 {" '{t=$0; sub(/^[ \t]+/,"",t)} !s&&$0==site{s=1;next} s&&!p&&t=="@netopia_notify {"{p=1} p{print t; d+=gsub(/\{/,"{",t)-gsub(/\}/,"}",t); if(t=="handle @netopia_notify {")h=1; if(h&&d==0)exit}' "$1"; }
gates() { printf 'deepinfra '; gs "$GD" "$PD" | jq -c '{state, window_open, today_spend_usd, remaining_today_usd}'; printf 'anthropic '; gs "$GAN" "$PAN" | jq -c '{state, window_open, today_spend_usd, remaining_today_usd}'; printf 'perplexity '; gs "$GPX" "$PPX" | jq -c '{state, window_open, today_spend_usd, remaining_today_usd}'; printf 'bedrock '; gs "$GBR" "$PBR" | jq -c '{state, window_open, today_spend_usd, remaining_today_usd}'; }
gatesok() { [ "$(gs "$GD" "$PD" | jq -r '"\(.state) \(.window_open)"')" = 'active true' ] && [ "$(gs "$GAN" "$PAN" | jq -r '"\(.state) \(.window_open)"')" = 'active true' ] && [ "$(gs "$GPX" "$PPX" | jq -r '"\(.state) \(.window_open)"')" = 'active true' ] && [ "$(gs "$GBR" "$PBR" | jq -r '"\(.state) \(.window_open)"')" = 'active true' ]; }
RUNAPI() { systemd-run --quiet --pipe --wait --collect --uid="$AU" --gid="$AGRP" --property=EnvironmentFile="$A" --setenv=NODE_USE_ENV_PROXY=1 --setenv=HTTPS_PROXY=http://127.0.0.1:3180 "--setenv=NO_PROXY=localhost,127.0.0.1,[::1],$HOST" --working-directory="$CAPI/dialectical-engine" "$N" --import tsx "$@"; }
modecheck() { ( cd "$CAPI/dialectical-engine" && "$N" --input-type=module -e "const m=await import('./deploy/preview-auth-dev/v1/start-check-payments.mjs'); const r=await import('./deploy/preview-auth-dev/v1/startup-refusals.mjs'); await m.assertEgressIsLive({quadernoHost:process.argv[1]+'.quadernoapp.com'}).then(()=>console.log('egress: live'),e=>console.log('egress:',r.namedRefusal(e)??'refused'))" "$1" ); }
put_secret() { runuser -u "$AU" -- /bin/sh -c 'umask 077; f=$1; [ ! -e "$f" ] || { echo "$f exists: stop" >&2; exit 1; }; IFS= read -r v && [ -n "$v" ] && printf "%s\n" "$v" > "$f.new" && mv -n "$f.new" "$f" && echo "saved $f"' sh "$1"; }
swap() { ( set -euo pipefail; umask 077; { grep -vE "$KEYS" "$A"; cat "$1"; } > "$A.new"; chown --reference="$A" "$A.new"; chmod --reference="$A" "$A.new"; mv "$A.new" "$A"; [ -z "$(grep -oE '^[A-Z_][A-Z0-9_]*=' "$A" | sort | uniq -d)" ] && echo swapped ); }
livedrop() { install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview-egress.service.d; printf '[Service]\nExecStart=\nExecStart=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node %s/egress-proxy.mjs --quaderno-live-account %s\n' "$EG" "$1" > "$EDROP"; chmod 0644 "$EDROP"; systemctl daemon-reload; systemctl restart "$EGU" || echo 'systemctl restart of the egress proxy returned non-zero'; sleep 2; }
sandboxdrop() { rm -f "$EDROP"; systemctl daemon-reload; systemctl restart "$EGU" || echo 'systemctl restart of the egress proxy returned non-zero'; sleep 2; }
KP=/etc/debateai-v3-preview/api/corpus-kek.bin; PS=/var/lib/debateai-v3-preview/api/publication-keys; PUB=$M/pub; KF=$PUB/keys.env; LF=$PUB/cleanup.line; BF=$PUB/backup-folder
CLN=debateai_prod_api_publication_cleanup; PDROP=/etc/systemd/system/debateai-preview-api@.service.d/zzzzzzzzzz-keys-publication.conf
pubstate() { if [ "$(grep -c '^PUBLICATION_ENABLED=true$' "$1" || true)" = 1 ]; then echo A; elif [ "$(grep -c '^CORPUS_KEK_PATH=' "$1" || true)" -ge 1 ] && [ "$(grep -c '^PUBLICATION_KEY_STORE_PATH=' "$1" || true)" -ge 1 ]; then echo B; else echo C; fi; }
keyok() { [ -f "$KP" ] && [ ! -L "$KP" ] && [ ! -L "${KP%/*}" ] && [ "$(stat -c '%a %U %h %s' "$KP")" = "600 $AU 1 32" ] && [ "$(stat -c '%a %U' "${KP%/*}")" = "700 $AU" ]; }
storeok() { [ -d "$PS" ] && [ ! -L "$PS" ] && [ "$(stat -c '%a %U %G' "$PS")" = "700 $AU $AGRP" ]; }
storewrite() { local p; for p in $(systemctl show -p ReadWritePaths --value "$API"); do p=${p#-}; p=${p#+}; case "$PS/" in "${p%/}/"*) return 0;; esac; done; return 1; }
keyfiles() { find "$PS" -type f -name publication-key.v1.json 2>/dev/null | grep -c . || true; }
povl() { case "$1/" in "$2/"*) return 0;; esac; case "$2/" in "$1/"*) return 0;; esac; return 1; }
pubapart() { local k v f; for k in KEK_PATH BLIND_INDEX_KEY_PATH AUDIT_SOURCE_IP_SALT_PATH SUPPORT_KEK_PATH RECORDS_KEY_PATH KEK_PREVIOUS_PATH SUPPORT_KEK_PREVIOUS_PATH UI_API_PROOF_PATH NETOPIA_API_KEY_PATH NETOPIA_IPN_KEYS_PATH QUADERNO_API_KEY_PATH SMARTBILL_CREDENTIALS_PATH OWNER_REPORT_EMAIL_PATH USER_DEK_STORE_PATH AUDIT_KEY_STORE_PATH DATA_EXPORT_STORE_PATH BILLING_NOTICE_SPOOL_PATH; do v=$(sed -n "s/^$k=//p" "$A"); [ -n "$v" ] || continue; if povl "$v" "$KP" || povl "$v" "$PS"; then printf '%s ' "$k"; fi; done; f=$(sed -n 's/^RESTORE_FENCE_PATH=//p' "$A"); if [ -z "$f" ] || povl "${f%/*}" "$PS" || povl "${f%/*}" "${KP%/*}"; then printf '%s ' RESTORE_FENCE_PATH; fi; }
pubrole() { psqlq "SELECT coalesce((SELECT concat_ws(' ', CASE WHEN NOT r.rolcanlogin THEN 'cannot-sign-in' END, CASE WHEN r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls THEN 'special-powers' END, CASE WHEN NOT pg_has_role(r.oid, 'debateai_publication_cleanup', 'USAGE') THEN 'no-cleanup-role' END, CASE WHEN pg_has_role(r.oid, 'debateai_runtime', 'MEMBER') OR pg_has_role(r.oid, 'debateai_authorization_runtime', 'MEMBER') THEN 'runtime-member' END, CASE WHEN NOT (has_function_privilege(r.oid, 'serve.claim_publication_key_cleanup(integer)', 'EXECUTE') AND has_function_privilege(r.oid, 'serve.complete_publication_key_cleanup(uuid,uuid,text)', 'EXECUTE') AND has_function_privilege(r.oid, 'serve.claim_publication_key_provision_cleanup(integer)', 'EXECUTE') AND has_function_privilege(r.oid, 'serve.complete_publication_key_provision_cleanup(uuid,uuid)', 'EXECUTE')) THEN 'no-cleanup-functions' END, CASE WHEN coalesce((SELECT bool_or(has_function_privilege(r.oid, p.oid, 'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'core' AND p.proname = 'transition_run_publication' AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, uuid, uuid, uuid, text, text, uuid, text, jsonb, timestamp with time zone, uuid, uuid, uuid'), false) THEN 'may-publish' END, CASE WHEN has_table_privilege(r.oid, 'serve.publication_key_cleanup_intent', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN 'cleanup-table-rows' END) FROM pg_roles r WHERE r.rolname = '$CLN'), 'missing')"; }
pubhba() { psqlq "SELECT coalesce((SELECT concat_ws(' ', auth_method, address, netmask) FROM pg_hba_file_rules WHERE error IS NULL AND type = 'hostssl' AND database && ARRAY['all', 'debateai'] AND user_name && ARRAY['all', '$1'] ORDER BY rule_number LIMIT 1), 'none')"; }
pubcounts() { psqlq "SELECT concat_ws(' ', (SELECT count(*) FROM serve.publication_snapshot), (SELECT count(*) FROM (SELECT DISTINCT ON (run_id) state FROM core.run_visibility_event ORDER BY run_id, at_seq DESC) v WHERE v.state = 'PUBLISHED'), (SELECT count(*) FROM serve.publication_snapshot s WHERE NOT EXISTS (SELECT 1 FROM serve.publication_key_cleanup_intent c WHERE c.publication_ref = s.publication_ref AND c.completed_at IS NOT NULL)), (SELECT count(*) FROM identity.free_public_ask WHERE outcome IS NULL), (SELECT count(*) FROM identity.free_public_ask WHERE outcome = 'PUBLISHED'), (SELECT count(*) FROM identity.free_public_ask WHERE outcome = 'REFUSED'), (SELECT count(*) FROM serve.publication_key_cleanup_intent WHERE completed_at IS NULL), (SELECT count(*) FROM serve.publication_key_provision_intent), (SELECT count(*) FROM core.run_visibility_event) + (SELECT count(*) FROM core.publication_ref_tombstone))"; }
staffkey() { psqlq "SELECT count(*) FROM staff.owner_designation d JOIN staff.subject s USING (staff_id) JOIN identity.mfa_factor f ON f.user_id = s.user_id JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id = f.mfa_factor_id WHERE d.active AND s.state = 'ACTIVE' AND m.user_id = f.user_id AND f.factor_type = 'passkey' AND f.state = 'active' AND f.verified_at IS NOT NULL AND f.backup_eligible = false AND f.backup_state = false AND f.user_verification_required AND f.relying_party_id = '$HOST' AND f.credential_origin = 'https://$HOST'"; }
aion() { [ -f "$CAPI/dialectical-engine/apps/api/src/publication-check/gate-transport.ts" ] && [ -n "$(sed -n 's/^PREVIEW_PROVIDER_TEST_CONFIG_JSON=//p' "$A" | jq -r '.anthropic_budget_socket // empty' 2>/dev/null || true)" ]; }
mailmode() { inv "$API" | sed -n 's/^PREVIEW_MAIL_MODE {"mode":"\([a-z-]*\)".*/\1/p' | tail -n 1; }
pubbackup() { [ -n "$1" ] && [ -d "$1" ] && [ ! -L "$1" ] && [ "$(stat -c '%a %U' "$1")" = '700 root' ] && ( cd "$1" && sha256sum -c --quiet online.sha256 > /dev/null 2>&1 ) && [ "$(tar -tf "$1/online-keys.tar" 2>/dev/null | grep -cxF -e "${KP#/}" -e "${PS#/}/" || true)" = 2 ] && tar -xOf "$1/online-keys.tar" "${KP#/}" 2>/dev/null | cmp -s - "$KP"; }
pubprobe() { ( cd "$CAPI/dialectical-engine" && runuser -u "$AU" -- /usr/bin/env -i PATH=/usr/bin:/bin "$N" --import tsx --input-type=module -e 'const { default: pg } = await import("pg"); const { assertPublicationCleanupDatabaseRole: check } = await import("./packages/db/src/publication.ts"); let t = ""; for await (const c of process.stdin) t += c; const m = /^PUBLICATION_CLEANUP_DATABASE_URL=(\S+)$/.exec(t.trim()); if (m === null) { console.log("no line to try"); process.exit(1); } const code = (e) => /^[A-Z0-9_]{1,40}$/.test(String(e?.code)) ? e.code : "no code"; const pool = new pg.Pool({ connectionString: m[1], max: 1, connectionTimeoutMillis: 5000 }); let out = "accepted"; try { (await pool.connect()).release(); } catch (e) { out = e?.code === "28P01" ? "the database refuses its password" : e?.code === "28000" ? "pg_hba.conf does not let it in" : "it does not connect (" + code(e) + ")"; } if (out === "accepted") { try { await check(pool); } catch (e) { out = "it signs in, but the API role check refuses it" + (e?.message === "PUBLICATION_CLEANUP_DATABASE_ROLE_INVALID" ? "" : " (" + code(e) + ")"); } } await pool.end().catch(() => {}); console.log(out); process.exitCode = out === "accepted" ? 0 : 1;' ) < "$1"; }
EOF
} > "$M/names.sh.new"
chmod 0600 "$M/names.sh.new"
mv -f "$M/names.sh.new" "$M/names.sh"
. "$M/names.sh"
echo "release $LABEL (key $KEY, slot $SLOT); the API answers as $HOST"
echo LOCKS0_DONE
exit 0
```

Expect the release line, then `LOCKS0_DONE`. **After a later upload**, edit only the first line of
`/root/preview-archive/main-site/names.sh` to name that upload's names file (`nano` that file), or run LOCKS0 again
with that upload's `rNN` filled in. If any later script says `NAMES_NOT_DONE`, that first line is the usual cause.

**LOCKS0 again.** When the names file exists already, LOCKS0 keeps a copy of it beside it
(`names.sh.before-<time>`) and writes it anew from this guide: with `rNN` left as it is, the first line stays the one
the file had; with `rNN` filled in, it names that upload. Nothing live changes. Run it when a step says the names file
is from an earlier version of this guide: NAME3 and NAME5 (5.3, 5.5) need its `apistart`, and stop before they stop
anything when the file has none; every step that restarts only the API (MAIL_ALLOW, MAIL_OPEN, MAIL_CLOSE, STAFFOFF,
STAFFON, STAFFMAIN, ASKS_OPEN, ASKS_CLOSE, BUYERS, PAY_SWITCH, PAY_BACK, PUBON and PUBOFF) needs its `upfail`, and stops, with nothing changed,
when the file has none. On a server whose names file was written before `upfail` came, run LOCKS0 once, with `rNN`
left as it is, before the next of those steps, NAME3 or NAME5. Every step of 5.9 (public debates) needs the names
file's publishing helpers (`pubprobe` and the others below), and stops, with nothing changed, when the file has none:
run LOCKS0 once more, with `rNN` left as it is, before the first of them.

If LOCKS0's last line is `NAMES_NOT_DONE`, the file was written already. Fix what the line names (when it names the
release: the first line of the file, with `nano`, or LOCKS0 again with the right `rNN`), then run CLOSED (3.1). A
`NAMES_NOT_DONE: a release is staged or draining` right after this upload means DR6's last lines did not all run
(after WB4, DR6TAIL): ask.

What the helpers do, in short:
- `apistart` restarts the API and waits for its start line (or its refusal), and nothing more; when the API did not
  start, it says so (`the API did not start …`). `apiup` is `apistart`, then, because the website restarts with its
  API, it waits for the website's Log in page too, and fails if the website does not answer it within about two
  minutes (`the API started, but the website does not answer its Log in page …`). It fails with code 1 when the API
  did not start, and with code 2 when the API started and the website did not answer. `webup` restarts the website
  alone and waits for the same page (`the website did not start …` when it does not answer). Each first clears
  systemd's count of recent starts, of both the API and the website: systemd refuses a fifth start of either within
  15 minutes, and a way back must never be refused for that.
- `upfail` words a step's last line from `apiup`'s code: `the API refused <what> (its code is above)` for 1,
  `the API started on <what>, but the website did not answer its Log in page (the line above)` for 2. So the last line
  never says the API refused a setting it took.
- Why both: the website's unit is bound to its API (`BindsTo=` and `After=` the API, in
  `deploy/preview-lifecycle/v1/systemd/debateai-preview-ui@.service.d/50-lifecycle.conf`). Restarting the API restarts
  a website that runs, but a website that was stopped stays stopped: systemd passes a restart on only to a unit that
  is running. So a step that restarts only the API, while the website runs, uses `apiup`. A step that stops the
  website and the API first (NAME3 and NAME5) uses `apistart`, then `webup`: `apiup` would wait for a website nothing
  starts, and fail although the API had started. The same holds for the way back of a step that restarts only the
  API: when the API refused, systemd stopped the website with it (or the website itself failed), so after the file
  before is back the step starts the API alone and then the website (`apistart`, then `webup`), never `apiup` again.
- `inv` shows a service's journal since its last start; `said` asks whether the API's journal since its last start
  holds a line.
- `gates` shows the four spending gates (DeepInfra, Anthropic, Perplexity, Amazon Bedrock); `gatesok` says whether all
  four are active with their window open.
- `RUNAPI` runs one of the API's billing tools as the API's user, with the API's settings.
- `modecheck` asks the egress proxy which form it runs in; `swap` replaces the payment lines of the API file;
  `livedrop` and `sandboxdrop` put the egress proxy in its live or its sandbox form.
- Publishing's (5.9), each only reading: `KP`, `PS`, `PUB`, `KF`, `LF`, `BF`, `CLN` and `PDROP` are its names (the
  corpus key, the key store, its folder of copies, the two kept lines, the kept clean-up line, the newest backup's
  name, the clean-up login and the store's drop-in). `pubstate` says A, B or C for an API file as the release guide's
  PRECHECK does. `keyok` and `storeok` check the corpus key and the store as the code checks them; `storewrite` asks
  whether the API's unit may write the store; `keyfiles` counts the publication keys in it; `pubapart` names any key,
  store or the restore fence that the two would overlap (the code refuses each). `pubrole` names what the API's role
  check would refuse in the clean-up login (nothing, when all is right); `pubhba` reads the first `pg_hba.conf` line
  that would let a login in; `pubcounts` counts the database's publications; `staffkey` counts the Owner's working
  staff keys under the name the site answers as (PWOFF1's count); `aion` says whether the AI check for publication
  and reports is on (STAFFCHECK's rule); `mailmode` reads the running API's mail mode; `pubbackup` checks one backup
  folder of PUBBACKUP; `pubprobe` tries a clean-up line as the API will: as the API's user, with the release's own
  role check, printing one plain answer and never the line.

### 3.1 Check that every lock is closed (read-only)

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# CLOSED: every lock is closed (read-only).
OPEN=''; flag() { echo "NOT CLOSED: $1"; OPEN=yes; }
[ "$HOST" = v3-preview.dezbatere.ro ] && [ "$(grep -cx 'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro' "$UF" || true)" = 1 ] || flag 'the name: an env file does not name the test name'
[ ! -e "$TDROP" ] && [ "$(relay)" = 'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro' ] || flag 'the name: the Turnstile relay'
[ "$(cat "$A" "$RF" | grep -c '^PREVIEW_ASKS_OPEN_TO=' || true)" = 0 ] && [ "$(grep -c '^PREVIEW_TEAM_USER_IDS_JSON=' "$A" || true)" = 1 ] && [ "$(grep -c '^PREVIEW_TEAM_USER_IDS_JSON=' "$RF" || true)" = 1 ] || flag 'the team: the env files'
[ "$(inv "$API" | grep -c '"event":"api.preview.asks_open"' || true)" = 0 ] || flag 'the team: the running API says asks are open'
! grep -qx 'PREVIEW_ASKS_OPEN_TO=everyone-with-listed-buyers' "$A" "$RF" && [ "$(inv "$API" | grep -c '"event":"api.preview.listed_buyers"' || true)" = 0 ] || flag 'the team: asks are open with listed buyers (6b): PWON, then ASKS_CLOSE'
[ ! -s "$M/asks/names.sh" ] || [ "$( . "$M/asks/names.sh"; grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$ASKS_ARCHIVE/api-$ASKS_LABEL.env.before-open" 2>/dev/null || true)" = "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$A" || true)" ] || flag 'the team: the team line is not the one kept before asks were last opened (ASKS_CLOSE puts it back)'
said -xF 'PREVIEW_MAIL_MODE {"mode":"legacy","origin":"https://v3-preview.dezbatere.ro"}' || flag 'mail: the running API does not say mode legacy'
[ "$(jq -r .schema "$MP")" = preview-auth-dev-mail-v1 ] || flag 'mail: mail-plan.json is not the v1 file'
[ "$(grep -c '^PREVIEW_LIVE_PAYMENTS=' "$A" || true)" = 0 ] && grep -qxE 'NETOPIA_API_BASE_URL=https://secure(-sandbox|\.sandbox)\.netopia-payments\.com' "$A" && [ ! -e "$EDROP" ] || flag 'payments: not the sandbox'
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login")" = 401 ] || flag 'the site password: /login does not answer 401'
! grep -qE 'review_locked|review_quiet|review window begin' "$C" || flag 'the site password: the NETOPIA review window is open (REVIEW_CLOSE, 5.8)'
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" > "$M/same-closed.txt" || flag 'a SAME check is BAD (look at the file named below)'
grep -qx "OK SAME_UI_API_PUBLIC_APP_URL:$LABEL" "$M/same-closed.txt" && grep -qx "OK VALID_PREVIEW_ASKS_OPEN_TO:$LABEL" "$M/same-closed.txt" || flag 'the tools folder does not carry the new SAME checks (the tools-folder swap of the upload, SWAP)'
# The Team page's list of approved buyers (6b.3), on a database that holds it: a count to read, never a flag, because the API reads that list only while 6b is open.
LT=$(psqlq "SELECT to_regclass('staff.preview_buyer_event') IS NOT NULL" 2>/dev/null || true); LN=''
[ "$LT" != t ] || LN=$(psqlq "SELECT count(*) FROM (SELECT DISTINCT ON (user_id) kind FROM staff.preview_buyer_event ORDER BY user_id, revision DESC) l WHERE l.kind = 'ADDED'" 2>/dev/null || true)
printf '%s\n' "$LN" | grep -qxE '[0-9]+' || LN='did not read'
[ "$LT" = f ] || echo "accounts on the Team page's list of approved buyers: $LN (inert while asks are closed)"
[ -z "$OPEN" ] || { echo "CLOSED_NOT_DONE: a lock is not closed (above; SAME output: $M/same-closed.txt): ask"; exit 1; }
echo CLOSED_DONE
exit 0
```

Expect `CLOSED_DONE`. Run it again whenever you want to know that everything is closed. On a database that holds the
Team page's list of approved buyers (6b.3), one line before it says how many accounts are on that list. They count for
nothing while asks are closed, so the line is never a flag; but ASKS_OPEN with `everyone-with-listed-buyers` refuses
until the list is empty again (6.1).

### 3.2 The sandbox payment test (optional, before real payments)

First, the billing check (it charges nothing):

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# SANDBOXCHECK: the billing check on NETOPIA's sandbox (no card is charged).
grep -qxE 'NETOPIA_API_BASE_URL=https://secure(-sandbox|\.sandbox)\.netopia-payments\.com' "$A" || { echo "SANDBOXCHECK_NOT_DONE: the API file does not name NETOPIA's sandbox"; exit 1; }
RUNAPI apps/api/src/billing/check-cli.ts || true
echo SANDBOXCHECK_DONE
exit 0
```

Among the ticks you should see:
- "NETOPIA_API_BASE_URL is NETOPIA's sandbox: payments made here are tests, and no card is really charged."
- "Quaderno's sandbox and a .invalid SmartBill address go with NETOPIA's sandbox, so no real invoice can be issued."

Then buy, in the browser, behind the site password:
1. Use a **separate** allow-listed test account. Never the account you will use for the real payment (part 7.2).
2. Open `/pricing`. The **test-mode note** shows there while payments run on the sandbox. It also shows on the
   checkout's card step, in Settings → Update card, and on the landing page's price line. It goes away by itself when
   payments go live.
3. Choose Plus. Choose the United States as the country, answer "yes" to the residence question, and pick a state the
   checkout accepts.
4. On NETOPIA's sandbox page, pay with the test card `9900 0048 1022 5098`, any future expiry, CVV `111`.
5. Expect: the plan active; the confirmation (M1) and the receipt (M2) at that inbox; the card in Settings; the invoice
   in Quaderno's sandbox.

Two rules:
- **Never buy as a Romanian buyer here.** Its SmartBill job blocks the live start for about 14.6 hours.
- **Never leave a NETOPIA page unfinished.** The site's button **Abonați-vă și plătiți** (Subscribe and pay) already
  places the order before NETOPIA's page opens. An open checkout blocks the live start for up to 24 hours. If it
  happens, start a new checkout on the same account and finish it.

### 3.3 Closing the sandbox records (before real payments)

List what is still open:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# SANDBOXLIST: the sandbox plans still open (read-only).
psqlq "SELECT s.owner_ref, s.subscription_id, s.kind, s.at FROM billing.subscription_latest_v s JOIN billing.subscription_event c ON c.subscription_id = s.subscription_id AND c.kind = 'CREATED' WHERE c.data->>'payment_environment' = 'sandbox' AND s.kind NOT IN ('ENDED','WITHDRAWN','ERASURE_STOPPED') ORDER BY s.at"
echo SANDBOXLIST_DONE
exit 0
```

A plan you cancelled still shows here, usually with kind `CANCEL_REQUESTED` (or `CARD_SAVED`, if its card arrived
after the cancel). That is closed enough for real payments: PAY0 and the live start do not count it. A plan with kind `CREATED` is a payment page someone left unfinished: it ends by
itself about 24 hours after its `at` time.

- **Your own sandbox accounts** (the ones from earlier sandbox purchases too): sign in to each and **Cancel** in
  Settings. Cancel is the quickest way. **Withdraw** (within 14 days of the purchase) also works, but it adds a
  sandbox refund to make and record.
- **A refund handed to you** (an O2_REFUND_DUE mail): refund exactly that amount in NETOPIA's **sandbox** admin. If it
  is not recorded by itself, record it with the script below. Fill in the charge reference and the exact amount from
  that mail. Run it first without `--confirm` (it only shows what it would record). Then run it again with a space and
  `--confirm` added right after the amount's closing `'`, before the `||`.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# REFUNDDONE: record a refund you made in NETOPIA's admin. First without --confirm, then with it.
RUNAPI apps/api/src/billing/refund-done-cli.ts --charge '<the charge reference from the O2_REFUND_DUE mail>' --amount '<the exact amount from that mail, two digits after a dot>' || { echo "REFUNDDONE_NOT_DONE: the tool refused (its code is the line above): ask"; exit 1; }
echo REFUNDDONE_DONE
exit 0
```

- **Someone else's sandbox plan**, within 14 days of its purchase: tell them first. Then find the account and record
  the withdrawal. The script asks for their address.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# WITHDRAWOTHER: record a sandbox withdrawal for another account (tell them first).
read -r -p 'Their account address: ' ADDR < /dev/tty
OR=$(printf '%s\n' "$ADDR" | RUNAPI apps/api/src/billing/withdraw-cli.ts --owner-of-email | sed -n 's/^owner_ref: //p' || true); unset ADDR
printf '%s\n' "$OR" | grep -qxE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || { echo "WITHDRAWOTHER_NOT_DONE: no account with that address"; exit 1; }
RUNAPI apps/api/src/billing/withdraw-cli.ts --owner "$OR" || { echo "WITHDRAWOTHER_NOT_DONE: the tool refused (its code is the line above). WITHDRAWAL_WINDOW_CLOSED: their 14 days are over, so only they can cancel. NOT_SUBSCRIBED: that account has no running sandbox plan, so there is nothing to withdraw (check the address you typed). Any other code: ask"; exit 1; }
echo WITHDRAWOTHER_DONE
exit 0
```

Expect one line that says the withdrawal is recorded and the plan has ended, then `WITHDRAWOTHER_DONE`. A debate of
theirs that is still running does not hold it up: the withdrawal is recorded at once. If the line says a refund made
in NETOPIA's admin touched a payment, ask before you refund anything. Then settle its refund as above. After 14 days
only they can cancel.

Never write billing rows by hand: the tables only take new rows. Do all of this before any account is deleted.

---

## 4. Mail

The v2 mail plan has two modes. **allow-list**: every mail family goes only to the four allow-listed addresses, as
today, but on the new, working path. **open**: each mail goes to its own address, when the API's own address rule
accepts it (the same rule as at sign-up). The mail program reads the plan at every mail; each step restarts the API so
its start check runs and its mode line shows.

### 4.1 Keep the way back (once)

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# MAIL_KEEP: the v1 mail plan kept as the way back. Nothing live changes.
said -xF 'PREVIEW_MAIL_MODE {"mode":"legacy","origin":"https://v3-preview.dezbatere.ro"}' || { echo "MAIL_KEEP_NOT_DONE: the running API does not say mail mode legacy on the test name"; exit 1; }
[ "$(jq -r .schema "$MP")" = preview-auth-dev-mail-v1 ] || { echo "MAIL_KEEP_NOT_DONE: mail-plan.json is not the v1 file"; exit 1; }
[ ! -e "$M/mail/mail-plan.v1.json" ] || { echo "MAIL_KEEP_NOT_DONE: $M/mail/mail-plan.v1.json exists (look first)"; exit 1; }
cp -p "$MP" "$M/mail/mail-plan.v1.json"
cmp -s "$MP" "$M/mail/mail-plan.v1.json" || { echo "MAIL_KEEP_NOT_DONE: the copy differs from the live file"; exit 1; }
sha256sum "$MP" "$M/mail/mail-plan.v1.json"
echo MAIL_KEEP_DONE
exit 0
```

Expect two equal digests, then `MAIL_KEEP_DONE`. Write the digest down: part 9 checks it.

### 4.2 Allow-list on the new path (still the test name, still behind the password)

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# MAIL_ALLOW: mail plan v2 "allow-list": the same four addresses as today, every mail family on the new path.
declare -F upfail >/dev/null || { echo "MAIL_ALLOW_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then MAIL_ALLOW"; exit 1; }
[ -s "$M/mail/mail-plan.v1.json" ] && cmp -s "$MP" "$M/mail/mail-plan.v1.json" || { echo "MAIL_ALLOW_NOT_DONE: the live plan is not the kept v1 file (MAIL_KEEP first)"; exit 1; }
CG=$(jq -r .recipientPolicy.clientGid "$MP")
[ "$(stat -c '%U %g %a %h' "$MR")" = "root $CG 640 1" ] && [ "$(stat -c %s "$MR")" -le 1024 ] || { echo "MAIL_ALLOW_NOT_DONE: $MR is not root:<clientGid> 0640 with one link and at most 1 KiB"; exit 1; }
( umask 022; jq -c --arg o "https://$HOST" '.schema="preview-auth-dev-mail-v2" | .recipients="allow-list" | .publicAppUrl=$o' "$M/mail/mail-plan.v1.json" > "$M/mail/mail-plan.v2-allow-list.json" )
{ install -o root -g root -m 0644 "$M/mail/mail-plan.v2-allow-list.json" "$MP.new" && mv -f "$MP.new" "$MP" && cmp -s "$M/mail/mail-plan.v2-allow-list.json" "$MP"; } || { echo "MAIL_ALLOW_NOT_DONE: the allow-list plan was not put in place (nothing restarted): ask"; exit 1; }
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the allow-list plan'); { install -o root -g root -m 0644 "$M/mail/mail-plan.v1.json" "$MP.new" && mv -f "$MP.new" "$MP"; } || { echo "MAIL_ALLOW_NOT_DONE: $WHY, and the v1 file could not be put back: ask at once"; exit 1; }; { apistart && webup; } || { echo "MAIL_ALLOW_NOT_DONE: $WHY; the v1 file is back, but the API or the website did not start on it either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "MAIL_ALLOW_NOT_DONE: $WHY; the v1 file is back, and the API and the website started on it"; exit 1; fi
said -xF "PREVIEW_MAIL_MODE {\"mode\":\"allow-list\",\"origin\":\"https://$HOST\"}" || { echo "MAIL_ALLOW_NOT_DONE: no allow-list mode line: ask"; exit 1; }
echo MAIL_ALLOW_DONE
exit 0
```

The API restarts: pages that need the API fail for a minute or more (`apiup` waits up to about 4 minutes for the API,
then up to about 2 more for the website). The same holds for every step that restarts the API. Expect the line
`PREVIEW_MAIL_MODE {"mode":"allow-list",…}`, then `MAIL_ALLOW_DONE`.

Test it with your own allow-listed account:
1. Ask for a password reset (the reset family).
2. Change a security setting, or enrol the hardware key again (a security notice, the account family).

Both mails must arrive. If one does not, the API's journal shows `AUTH_MAIL_DELIVERY_FAILED … code=SENDMAIL_EXIT_1`
or `code=SENDMAIL_TIMEOUT`. `SENDMAIL_EXIT_1` means the plan refused the mail, or, with a correct plan, that the mail
program ran out of time (MAILTIME, 1.8, timed its load before the upload); `SENDMAIL_TIMEOUT` is the time case past 5
seconds. Ask before you run MAIL_CLOSE (4.4): it puts the v1 plan back, and the rename (part 5) refuses v1.

### 4.3 Open mail

Before this step, run the failure count of 1.4 again. Account mail that the API still retries may go out at once, to
real addresses, when mail opens.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# MAIL_OPEN: mail plan v2 "open": each mail to its own address.
declare -F upfail >/dev/null || { echo "MAIL_OPEN_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then MAIL_OPEN"; exit 1; }
! said '^PREVIEW_MAIL_MODE {"mode":"open",' || { echo "MAIL_OPEN_NOT_DONE: mail is open already (MAIL_OPEN ran before): nothing to do"; exit 1; }
said '^PREVIEW_MAIL_MODE {"mode":"allow-list",' || { echo "MAIL_OPEN_NOT_DONE: the running API is not in mode allow-list (MAIL_ALLOW first)"; exit 1; }
cp -p "$MP" "$M/mail/mail-plan.before-open.json"
( umask 022; jq -c --arg o "https://$HOST" '.schema="preview-auth-dev-mail-v2" | .recipients="open" | del(.recipientPolicy) | .publicAppUrl=$o' "$M/mail/mail-plan.v1.json" > "$M/mail/mail-plan.v2-open.json" )
{ install -o root -g root -m 0644 "$M/mail/mail-plan.v2-open.json" "$MP.new" && mv -f "$MP.new" "$MP" && cmp -s "$M/mail/mail-plan.v2-open.json" "$MP"; } || { echo "MAIL_OPEN_NOT_DONE: the open plan was not put in place (nothing restarted): ask"; exit 1; }
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the open plan'); { install -o root -g root -m 0644 "$M/mail/mail-plan.before-open.json" "$MP.new" && mv -f "$MP.new" "$MP"; } || { echo "MAIL_OPEN_NOT_DONE: $WHY, and the allow-list file could not be put back: ask at once"; exit 1; }; { apistart && webup; } || { echo "MAIL_OPEN_NOT_DONE: $WHY; the allow-list file is back, but the API or the website did not start on it either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "MAIL_OPEN_NOT_DONE: $WHY; the allow-list file is back, and the API and the website started on it"; exit 1; fi
said -xF "PREVIEW_MAIL_MODE {\"mode\":\"open\",\"origin\":\"https://$HOST\"}" || { echo "MAIL_OPEN_NOT_DONE: no open mode line: ask"; exit 1; }
echo MAIL_OPEN_DONE
exit 0
```

Expect `PREVIEW_MAIL_MODE {"mode":"open",…}`, then `MAIL_OPEN_DONE`.

Test it:
1. Make a NEW Gmail address and a NEW Yahoo address that are not on the allow-list.
2. Sign up with each, behind the site password.
3. The verification mail must reach the Inbox (not Spam), and its link must finish the sign-up.
4. "Show original" / "View raw message" must show SPF, DKIM (`d=dezbatere.ro`) and DMARC pass.
5. Then start the deletion of both test accounts in Settings (it runs 7 days later). They are your own test sign-ups:
   for the Amazon notice (part 2) they are not accounts outside the team.

If either test fails: run MAIL_CLOSE (4.4). Take the site password off only after both pass.

### 4.4 Closing mail again (no upload needed)

On the test name this puts the kept v1 file back. On the main name (v1 is refused there) it puts the v2 allow-list
plan for the main name.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# MAIL_CLOSE: mail back to the allow-listed addresses.
declare -F upfail >/dev/null || { echo "MAIL_CLOSE_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then MAIL_CLOSE"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login" || true)" = 401 ] || { echo "MAIL_CLOSE_NOT_DONE: the Log in page does not ask for the site password (the site is open, or not answering); nothing changed: PWON first"; exit 1; }
[ -s "$M/mail/mail-plan.v1.json" ] || { echo "MAIL_CLOSE_NOT_DONE: no kept v1 file: ask"; exit 1; }
cp -p "$MP" "$M/mail/mail-plan.before-close.json"
if [ "$HOST" = v3-preview.dezbatere.ro ]; then W=$M/mail/mail-plan.v1.json; WANT='PREVIEW_MAIL_MODE {"mode":"legacy","origin":"https://v3-preview.dezbatere.ro"}'
else ( umask 022; jq -c --arg o "https://$HOST" '.schema="preview-auth-dev-mail-v2" | .recipients="allow-list" | .publicAppUrl=$o' "$M/mail/mail-plan.v1.json" > "$M/mail/mail-plan.v2-allow-list-main.json" ); W=$M/mail/mail-plan.v2-allow-list-main.json; WANT="PREVIEW_MAIL_MODE {\"mode\":\"allow-list\",\"origin\":\"https://$HOST\"}"; fi
{ install -o root -g root -m 0644 "$W" "$MP.new" && mv -f "$MP.new" "$MP" && cmp -s "$W" "$MP"; } || { echo "MAIL_CLOSE_NOT_DONE: the closed plan was not put in place (nothing restarted): ask"; exit 1; }
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the closed plan'); { install -o root -g root -m 0644 "$M/mail/mail-plan.before-close.json" "$MP.new" && mv -f "$MP.new" "$MP"; } || { echo "MAIL_CLOSE_NOT_DONE: $WHY, and the plan before could not be put back: ask at once"; exit 1; }; { apistart && webup; } || { echo "MAIL_CLOSE_NOT_DONE: $WHY; the plan before is back, but the API or the website did not start on it either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "MAIL_CLOSE_NOT_DONE: $WHY; the plan before is back, and the API and the website started on it: ask"; exit 1; fi
said -xF "$WANT" || { echo "MAIL_CLOSE_NOT_DONE: the mode line is not the closed one: ask"; exit 1; }
echo MAIL_CLOSE_DONE
exit 0
```

The mail program reads the plan at every mail, so closing applies from the very next mail. MAIL_CLOSE runs only with
the site password on (PWON first), whatever the payments: on an open site, strangers could no longer finish a sign-up
(no verification mail), and a buyer outside the allow-list would get no M1 and no M2.

---

## 5. The main name (dezbatere.ro)

Before you start: the upload is finished and proven (DR6 and SB13b done, the old release retired), the release guide's
LOGOCHECK ended with `LOGOCHECK_DONE`, **mail is on the v2 plan** (part 4.2 or 4.3), and social sign-in is not set up
(NAME2 stops if the API file has `SOCIAL_SOCKET_PATH`: its relay's callbacks name the test name). If you did not do
1.3 (b) to (e), do them now. If the names file was written before it had `upfail`, run LOCKS0 again first (3.0,
"LOCKS0 again"): NAME3 and NAME5 stop, with nothing stopped, until it has `apistart`, and STAFFOFF, STAFFON and
STAFFMAIN, with nothing changed, until it has `upfail`.

This upload does not change Caddy. Its two-slot health check is still the transition's (the edge secret in the probe, a
1-second limit, out after one miss); nothing is worse than before. It changes only with its own reviewed step, written
for this server's Caddyfile, and run before NAME1: after NAME1, every kept copy pins the old lines (NAME2, NAME3,
NAME5, NAME1_BACK, REVIEW_OPEN, PWOFF2 and PWON compare or restore them). Decide before NAME1 whether that step comes
first.

NAME3 and NAME5 restart the Turnstile relay, so its program must be where the relay's unit says. NAME2 (5.2) reads
that path first and stops if the file is missing or not root's.

**The staff screens and the rename.** **Run REKEYCHECK (5.7) first, whatever STAFFCHECK (1.6) said, while the site
still answers as the test name.** It only reads. It says whether this server can enrol a staff key again after the
rename. If it says `NOT READY`, ask before you rename: nothing else looks at this until REKEY, when your staff key
already does not work. Its database line comes from STAFFHBA, in the upload's preparation (1.8); a missing line is added
only by a reviewed step like STAFFHBA, best before an upload's DR3, so that the cold copy holds it.

If STAFFCHECK (1.6) said `staff tools are on`:
- The first time this server is renamed, run STAFFOFF (5.1b) after NAME1C and right before NAME2, and put the staff
  screens on again with STAFFMAIN (5.7) after the rename.
- The exception: if STAFFCHECK said `the file has team allowance lines`, never run STAFFOFF (it refuses). The staff
  screens then stay on through the rename; NAME2 and NAME3 work that way too, and 5.1b says what it means.
- Either way NAME2 and NAME3 move the API file's two staff name lines with the name, and you enrol your staff key
  again under dezbatere.ro (5.7).

Pick a quiet minute for STAFFOFF and for NAME3 (each restarts the API): nothing being admitted, no checkout open.

**What closing keeps.** The prepared state (NAME1) stays after you close the name again: dezbatere.ro then redirects
to the test name, and NETOPIA's payment notices on dezbatere.ro still reach the site. NETOPIA does not follow
redirects, so a payment started under dezbatere.ro is still recorded after closing. Keep the prepared state (and its
DNS and certificate) for months after real payments ran on the main name.

**The HTTPS rule.** The website itself sends a header that would make browsers use HTTPS on every name under
dezbatere.ro for a year (`includeSubDomains`), with no way to take it back. Every dezbatere.ro block below replaces it
with `max-age=31536000` without `includeSubDomains`. Browsers that open dezbatere.ro keep "HTTPS only" for dezbatere.ro
itself for a year, but for no other name.

Caddy runs with `admin off`: it is always restarted, never reloaded (about a second, or a few).

### 5.1 Prepare the name (the site behaves as before)

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# NAME1: dezbatere.ro prepared and closed: Caddy answers it, passes NETOPIA's notices through and redirects the rest to the test name.
grep -q publicSiteOf "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/environment.mjs" || { echo "NAME1_NOT_DONE: this release does not carry the name lock"; exit 1; }
[ "$HOST" = v3-preview.dezbatere.ro ] || { echo "NAME1_NOT_DONE: the API already answers as $HOST"; exit 1; }
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" > "$M/name/same-before-main.txt" || { cat "$M/name/same-before-main.txt"; echo "NAME1_NOT_DONE: a SAME check is BAD today: look"; exit 1; }
grep -qx "OK SAME_UI_API_PUBLIC_APP_URL:$LABEL" "$M/name/same-before-main.txt" || { echo "NAME1_NOT_DONE: the tools folder does not carry the name checks (the upload's tools-folder swap, SWAP, first)"; exit 1; }
[ -e "$M/name/Caddyfile.before-dezbatere" ] || cp -a "$C" "$M/name/Caddyfile.before-dezbatere"
cmp "$C" "$M/name/Caddyfile.before-dezbatere" || { echo "NAME1_NOT_DONE: the live Caddyfile is not the copy kept in $M/name: look"; exit 1; }
! grep -qE '^(https?://)?(www\.)?dezbatere\.ro[ ,{]' "$C" || { echo "NAME1_NOT_DONE: a dezbatere.ro block exists already: look"; exit 1; }
[ "$(grep -c '^v3-preview\.dezbatere\.ro {$' "$C" || true)" = 1 ] && [ "$(grep -cE '^[[:space:]]*@netopia_notify \{$' "$C" || true)" = 1 ] || { echo "NAME1_NOT_DONE: the live Caddyfile is not the recorded shape (one v3-preview block, one notify handle): look"; exit 1; }
N0=$(notify v3-preview.dezbatere.ro); echo "a test notice on the test name is answered $N0"
case "$N0" in 000|30?|401) echo "NAME1_NOT_DONE: the test name does not pass a NETOPIA notice to the site today: look"; exit 1;; esac
printf '%s\n' "$N0" > "$M/name/notify-code.before-dezbatere"
( umask 022; { cat "$C"; cat <<'EOF'

dezbatere.ro {
    tls {
        protocols tls1.2 tls1.3
    }
    header {
        Strict-Transport-Security "max-age=31536000"
        -Server
    }
    route {
        @netopia_notify {
            method POST
            path /api/v1/billing/netopia/notify
        }
        handle @netopia_notify {
            request_body {
                max_size 1MB
            }
            reverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {
                import debateai_slots
                header_up Host v3-preview.dezbatere.ro
                header_up X-Forwarded-For {remote_host}
                header_up X-Forwarded-Proto https
                header_up X-Debateai-Edge-Secret {file./etc/debateai-v3-preview/ui-edge.caddy.secret}
                header_up -Authorization
            }
        }
        redir https://v3-preview.dezbatere.ro{uri} 302
    }
}

www.dezbatere.ro {
    tls {
        protocols tls1.2 tls1.3
    }
    redir https://v3-preview.dezbatere.ro{uri} 302
}

http://dezbatere.ro, http://www.dezbatere.ro {
    redir https://dezbatere.ro{uri} 308
}
EOF
} > "$M/name/Caddyfile.phase1" )
P1=$(nblock "$M/name/Caddyfile.phase1" dezbatere.ro || true); [ -n "$P1" ] && [ "$(nblock "$M/name/Caddyfile.before-dezbatere" v3-preview.dezbatere.ro)" = "$P1" ] || { echo "NAME1_NOT_DONE: the new notice pass-through is not the live one (compare the two notify handles): look"; exit 1; }
cad validate --config "$M/name/Caddyfile.phase1" --adapter caddyfile >/dev/null 2>&1 || { echo "NAME1_NOT_DONE: caddy validate refused the prepared file"; exit 1; }
{ install -o root -g root -m 0644 "$M/name/Caddyfile.phase1" "$C.new" && mv "$C.new" "$C" && cmp -s "$M/name/Caddyfile.phase1" "$C"; } || { echo "NAME1_NOT_DONE: the prepared Caddyfile was not put in place (Caddy not restarted): ask"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
[ "$(systemctl is-active caddy || true)" = active ] || { { install -o root -g root -m 0644 "$M/name/Caddyfile.before-dezbatere" "$C.new" && mv "$C.new" "$C"; } || { echo "NAME1_NOT_DONE: Caddy did not come back, and the Caddyfile before could not be put back: ask at once"; exit 1; }; systemctl restart caddy || true; sleep 3; [ "$(systemctl is-active caddy || true)" = active ] || { echo "NAME1_NOT_DONE: the Caddyfile before is back, but Caddy did not start on it either: the site is DOWN: ask at once"; exit 1; }; echo "NAME1_NOT_DONE: Caddy did not come back on the prepared file; the file before is back and Caddy restarted on it"; exit 1; }
echo NAME1_DONE
exit 0
```

Expect `a test notice on the test name is answered 503` (or another code that is not 000, 30x or 401), then
`NAME1_DONE`. Then wait a minute (Caddy fetches the dezbatere.ro certificate) and run the checks:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# NAME1C: the prepared name, checked (read-only). Each line prints nothing when it holds.
BAD=''
[ "$(loc 'https://dezbatere.ro/x?y=1')" = 'location: https://v3-preview.dezbatere.ro/x?y=1' ] || { echo 'CHECK_FAILED: dezbatere.ro does not redirect to the test name'; BAD=yes; }
[ "$(loc 'https://www.dezbatere.ro/x?y=1')" = 'location: https://v3-preview.dezbatere.ro/x?y=1' ] || { echo 'CHECK_FAILED: www.dezbatere.ro does not redirect to the test name'; BAD=yes; }
[ "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://dezbatere.ro/)" = '308 https://dezbatere.ro/' ] || { echo 'CHECK_FAILED: http://dezbatere.ro'; BAD=yes; }
[ "$(curl -s -o /dev/null -w '%{http_code}' https://v3-preview.dezbatere.ro/)" = 401 ] || { echo 'CHECK_FAILED: the test name no longer asks for the site password'; BAD=yes; }
N0=$(cat "$M/name/notify-code.before-dezbatere"); [ "$(notify dezbatere.ro)" = "$N0" ] && [ "$(notify v3-preview.dezbatere.ro)" = "$N0" ] || { echo 'CHECK_FAILED: a NETOPIA notice is not passed through on both names'; BAD=yes; }
[ "$(hsts dezbatere.ro)" = 'strict-transport-security: max-age=31536000' ] || { echo 'CHECK_FAILED: dezbatere.ro sends another HTTPS-only header (or two)'; BAD=yes; }
echo | openssl s_client -connect dezbatere.ro:443 -servername dezbatere.ro 2>/dev/null | openssl x509 -noout -subject -enddate || true
[ -z "$BAD" ] || { echo "NAME1C_NOT_DONE: a check failed (above)"; exit 1; }
echo NAME1C_DONE
exit 0
```

The `openssl` line must show a dezbatere.ro certificate. If TLS fails, read `journalctl -u caddy -n 50 --no-pager`:
the cause is DNS, CAA, or ports 80/443.

**Undoing NAME1** (only while no payment was ever started under dezbatere.ro, because this drops its notice
pass-through):

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# NAME1_BACK: today's Caddyfile back (the name no longer prepared).
cmp -s "$C" "$M/name/Caddyfile.phase1" || { echo "NAME1_BACK_NOT_DONE: the live Caddyfile is not the prepared one: ask"; exit 1; }
{ install -o root -g root -m 0644 "$M/name/Caddyfile.before-dezbatere" "$C.new" && mv "$C.new" "$C" && cmp -s "$M/name/Caddyfile.before-dezbatere" "$C"; } || { echo "NAME1_BACK_NOT_DONE: the Caddyfile before was not put in place (Caddy not restarted): ask"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3; [ "$(systemctl is-active caddy || true)" = active ] || { echo "NAME1_BACK_NOT_DONE: Caddy did not come back: ask at once"; exit 1; }
echo NAME1_BACK_DONE
exit 0
```

### 5.1b The staff screens off for the rename (STAFFOFF; the careful way the first time)

**The first time this server is renamed, run this step,** after NAME1C and right before NAME2. If STAFFCHECK (1.6)
said `staff tools are off`, skip it.

**Why.** The rename itself no longer needs it: NAME2 and NAME3 move the two staff name lines with the name. But the
API has never started on this server with the staff screens on under dezbatere.ro, and only the server can show
whether it does.
- With the staff screens **off** for the rename, that first start is STAFFMAIN (5.7). If the API refuses there,
  STAFFMAIN puts the file back by itself, the site keeps answering as dezbatere.ro, and only the staff screens wait.
- With the staff screens **on** through the rename, that first start is NAME3. If the API refuses there, the way out
  is NAME5: the whole rename undone, a few minutes down. Then run STAFFOFF, and NAME2 and NAME3 again.

Keep the staff screens on through the rename only when STAFFMAIN has already ended with `STAFFMAIN_DONE` on this
server once (a later rename), or when STAFFCHECK said `the file has team allowance lines` (STAFFOFF refuses then). If
the rename was already done with the staff screens off, go to 5.7: STAFFMAIN puts them on under dezbatere.ro.

**What it does.** STAFFOFF takes the one line `STAFF_ACCESS_POLICY_VERSION=2` out of the API file. Nothing else in
the API file, the runner's file or the website's file depends on it, and the SAME checks do not read it. Then it
restarts the API, still on the test name, so you see that the API starts without the line before anything is renamed.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# STAFFOFF: the staff screens off, on the test name: the one line STAFF_ACCESS_POLICY_VERSION=2 taken out of the API file (a copy kept), then the API restarts (a minute or more down). If the API refuses, the file before comes back.
# The NETOPIA review window (5.8) opens only on dezbatere.ro, and this step runs only on the test name, so with the window open it refuses.
declare -F upfail >/dev/null || { echo "STAFFOFF_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then STAFFOFF"; exit 1; }
K=$M/name/api-$LABEL.env.before-staffoff-$(date -u +%Y%m%dT%H%M%SZ)
[ "$HOST" = v3-preview.dezbatere.ro ] || { echo "STAFFOFF_NOT_DONE: the API already answers as $HOST; nothing changed: ask"; exit 1; }
P=$(grep -c '^STAFF_ACCESS_POLICY_VERSION=' "$A" || true); AL=$(grep -c '^INTERNAL_ALLOWANCE_' "$A" || true)
if [ "$P" = 0 ] || { [ "$P" = 1 ] && grep -qx 'STAFF_ACCESS_POLICY_VERSION=1' "$A"; }; then
  [ "$AL" = 0 ] || { echo "STAFFOFF_NOT_DONE: the API file has no line STAFF_ACCESS_POLICY_VERSION=2 but has team allowance lines; nothing changed: ask"; exit 1; }
  echo "the API file has no line STAFF_ACCESS_POLICY_VERSION=2: the staff screens are off already; nothing changed"
  echo STAFFOFF_DONE
  exit 0
fi
[ "$P" = 1 ] && grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" || { echo "STAFFOFF_NOT_DONE: the API file's policy line is not one line STAFF_ACCESS_POLICY_VERSION=1 or =2; nothing changed: ask"; exit 1; }
[ "$AL" = 0 ] || { echo "STAFFOFF_NOT_DONE: the API file has team allowance lines, which the API refuses without the policy line; nothing changed: ask"; exit 1; }
cp -p "$A" "$K" || { rm -f "$K"; echo "STAFFOFF_NOT_DONE: the copy $K was not kept; nothing changed: ask"; exit 1; }
{ ( umask 077; sed '/^STAFF_ACCESS_POLICY_VERSION=2$/d' "$A" > "$A.new" ) && chown --reference="$A" "$A.new" && chmod --reference="$A" "$A.new"; } || { rm -f "$A.new" "$K"; echo "STAFFOFF_NOT_DONE: the new file was not written; nothing changed: ask"; exit 1; }
[ "$(diff "$A" "$A.new" | grep -c '^[<>]' || true)" = 1 ] && [ "$(diff "$A" "$A.new" | grep -cx '< STAFF_ACCESS_POLICY_VERSION=2' || true)" = 1 ] || { rm -f "$A.new" "$K"; echo "STAFFOFF_NOT_DONE: not a one-line removal; nothing changed: ask"; exit 1; }
mv "$A.new" "$A" || { rm -f "$A.new" "$K"; echo "STAFFOFF_NOT_DONE: the new file was not put in place; nothing changed: ask"; exit 1; }
echo "taken out: STAFF_ACCESS_POLICY_VERSION=2 (the file before is $K); the API restarts without it"
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the file without the line'); { cp -p "$K" "$A.new" && mv "$A.new" "$A"; } || { echo "STAFFOFF_NOT_DONE: $WHY, and the file before could not be put back (it is $K): the site is DOWN: ask at once"; exit 1; }; { apistart && webup; } || { echo "STAFFOFF_NOT_DONE: $WHY; the file before is back, but the API or the website did not start on it either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "STAFFOFF_NOT_DONE: $WHY; the file before is back, and the API and the website started on it, with the staff screens on: ask"; exit 1; fi
echo STAFFOFF_DONE
exit 0
```

Expect the `taken out` line, the API's start lines (`PREVIEW_API_STARTED …`), then `STAFFOFF_DONE`.
- It restarts the API on the test name, behind the password (a minute or more down). From then on the staff screens
  are off. NAME3 later moves the name and the API file's two staff name lines; the policy line stays out.
- It changes nothing in the database: the staff records, the staff keys, the Owner role and the audit history stay.
- If it says `the staff screens are off already`, nothing changed: go on with NAME2.
- If it stops on `team allowance lines`, run nothing more and ask.
- If it stops with `the file before is back, and the API and the website started on it`, the staff screens are still
  on and nothing else changed. The start of the line says which one did not come up without the policy line: `the API
  refused …` or `the API started on …, but the website did not answer …`. Run nothing more and ask.
- If NAME2 then stops for another reason and you will not rename today, run STAFFON (5.5b). It puts the staff screens
  back on the test name. (If STAFFOFF said `the staff screens are off already`, there is nothing to put back.)
- The way back is STAFFON (5.5b) on the test name, and STAFFMAIN (5.7) on dezbatere.ro.

**While the staff screens are off**, nobody can:
- hide a published debate by hand (Hide now);
- settle a report the AI check did not accept, or decide a publication review;
- invite, grant or disable a staff member, or change the team limit (the Team page, `/admin/team`);
- read the staff audit page.

These wait in the database; nothing is lost. This holds on both names, during the friends' test (part 6) and while
payments are real (part 7). The site password keeps it small: only people who know it can see a published debate.

**What still happens by itself:**
On this server the first two points need publishing on (5.9): until PUBON, no debate is public, no Free debate goes
public, and the Report button has nothing to act on.
- **Free debates go public.** On the Free plan, a finished debate goes public by itself when two AI checks allow it,
  in this order: the end-of-debate check (below), then the AI check for publication. The page tells the person this
  before they ask. When STAFFCHECK (1.6) says `the AI check for publication and reports: off`, or a check cannot answer
  (the Anthropic gate refuses the call, is halted or busy, or its day is used up), nothing goes public: the finished
  debate stays private and waits. The API tries its check again by itself, a minute after a failure, then after longer
  and longer waits, up to an hour. No staff screen lists a Free debate that waits for a check, and no staff member can
  publish one by hand: it goes public by itself once the checks allow it, however many older Free debates wait (the
  point on the waiting list below). The person is not told that it waits. A debate whose own check keeps failing is tried again
  less and less often. The API makes its checks one at a time, contributions and reports included, so a check that
  runs long (up to two minutes on a busy gate) delays the others by that much; after one end-of-debate check fails,
  the other Free debates that need one wait for the API's next try, about 15 seconds later.
- **The Report button.** It needs no staff. If the same AI check agrees with a report, the debate hides at once (once
  per debate). If it finds nothing on the page that bears the report out, the report is closed by itself and the
  person who sent it is told so. When the check is off, does not answer within its 20 seconds, or is unsure, the report
  waits for a person, and nobody can act on it until the staff screens come back.
- **The end-of-debate check.** It runs on this server too, through the Anthropic gate, whenever the AI check above is
  on (STAFFCHECK, 1.6). Claude Haiku 5.5 reads each finished debate's conclusion for the four things the Terms
  (section 8) name. By itself:
  - A finished debate's answer is held ("checking") until the check answers: usually a few seconds, and never more
    than two minutes after the debate finished, however busy the gate. If the check cannot answer in that time (the
    gate refused it, was busy, or its day is used up), the answer shows unchecked, nothing is deleted, and the check
    runs again when the owner presses Publish, or, for a Free debate, when the API next tries to make it public. An
    answer that comes later can no longer flag or delete anything.
  - A debate it finds touching "tendencies to suicide or harming other people" is deleted for good, with no person
    involved. The Terms (section 9) say so, and the owner sees the notice the site shows ("Am șters această
    dezbatere", in English "We deleted this debate"). Nobody can bring it back.
  - Any of its other flags means that the owner's Publish of that debate needs a staff approval. The owner presses
    **Cereți aprobarea** ("Ask for approval") on the debate's page. A staff member with the Publication reviews
    permission decides on the **Publication reviews** page (Cereri de publicare), which opens from the link on the Team
    page once the staff key is verified (1.6, step 3). That works only while the staff screens are on and your staff
    key works under the name the site answers as: STAFFCHECK says `staff tools are on`, and after the rename only once
    5.7 is done. Until then the request waits, and nobody can decide it.
  - A Free debate waits for that approval too. Its own way to the public page (the first point above) asks this check
    first: a clear answer, or a flag that a staff approval covers, lets it go on to the AI check for publication. A
    Free debate this check flagged is never refused for good: it stays private and waits, and once a staff member
    approves it, it goes public on a later try of the API (usually within a minute; longer while the checks wait after
    a failure or the gate is busy) if the AI check for publication allows it.
    Its owner sees nothing of this on the debate's page (`/v4/debate/<id>`): no flag, no "waiting" and no **Cereți
    aprobarea**. Only the older page `/debate/<id>`, which no V4 page links to, shows the flag and the button. So
    unless you tell the owner, nobody asks, and the debate stays private.
  - The API looks at the waiting Free debates 100 at a time. Each try goes on from where the one before stopped, and
    after the newest it starts again from the oldest. A flagged one stays on that list until it is approved, and so
    does one whose deletion cannot finish yet. However many of them wait, every waiting debate is looked at once in
    each round of the list (one try for each 100 that wait), so a newer one is never held back by them. A flagged one
    a staff member approved goes public on its next turn, with nobody pressing anything. AICHECK's `Free debates` line (6b.1) counts them among the
    waiting: if that count keeps rising while none went public in the last day, ask.
  - A debate that is already public when this check asks for its deletion is deleted too, its public page first, when
    its owner's account is active. This can happen to a debate that went public before the check existed. On the
    API's next erasure pass (every 30 seconds) its page and its line in the public list go, and the API's log says
    `[SYNTHESIS_CHECK_PUBLIC_DEBATE_TAKEN_DOWN]` once. The next pass of the publication key cleanup (also every 30
    seconds) destroys the key of its public page, and the pass after that deletes the debate as any other. Its owner
    sees "We deleted this debate". Nothing is asked of you.
  - What other people put on that page goes with it. A dig still running on it is kept private and stays its
    person's, and a report being written on it stops. The copies of the page made for digs and reports are deleted,
    also those of an earlier page of the same debate. Each person's own digs stay theirs. Nobody but the owner is
    told. A person whose dig had changed the page still reads "This changed the public page." on their dig, with a
    link to a page that is gone: the site has no line yet that says the page was deleted.
    A debate that staff had hidden before the check deleted it still shows as hidden on the staff Public tab. Do not
    press "Put back" on it: its page is gone and stays gone, and the people who had a part on it would be told that
    their part is back on the page.
  - When it is not deleted, or waits:
    - The owner's account is being closed (its deletion has started), or was frozen by the age check. Then the debate
      is not deleted and its page stays public, and no log line says so. A closing account's own deletion takes the
      page down only if the owner chose to delete their public debates too. If you learn of such a debate, ask. Hide
      now can take the page down only while the staff screens are on (STAFFCHECK says `staff tools are on`, and after
      the rename only once 5.7 is done).
    - Someone is digging or reporting on the page at that moment, or a publish of it is still running. It is tried
      again on the next pass, with no log line.
    - The API's log repeats a line every 30 seconds: `[SYNTHESIS_CHECK_ERASURE_WAITING] PUBLISHED` (the owner's
      account keeps no sign-in at all, so the page cannot be taken down),
      `[SYNTHESIS_CHECK_ERASURE_WAITING] OWNERSHIP_MOVED` (the debate changed owner) or
      `[SYNTHESIS_CHECK_ERASURE_WAITING] LEGACY_PLAINTEXT_RETAINED` (the debate is stored unencrypted). Ask.
    - The API's log says `[SYNTHESIS_CHECK_PUBLIC_DEBATE_TAKEDOWN_FAILED]` with a five-character code: one debate
      could not be taken down, and the others still were. `[SYNTHESIS_CHECK_PUBLIC_DEBATE_TAKEDOWN_PENDING]`: no
      debate could be taken down on that pass. Both are tried again every 30 seconds. If one repeats, ask, and give
      the code.
- **Staff mails.** You still get the mails that say a report waits, or that a debate was hidden
  by itself. You cannot open them in the app until the staff screens come back. That is expected. (The threat report
  screen and its mail are gone since this upload: 1.6.)

**Never open the site to everyone (part 8) while the staff screens are off, or while no staff key works under
dezbatere.ro.** PWOFF1 (8.2) refuses in both cases.

### 5.2 Prepare the switch (nothing live changes)

This makes four things in `/root/preview-archive/main-site/name`: the two env files for the main name, the Turnstile
relay's drop-in, the main Caddyfile and the main mail plan.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# NAME2: the switch prepared: env copies, the relay drop-in, the main Caddyfile, the main mail plan. Nothing live changes.
# The NETOPIA review window (5.8) opens only on dezbatere.ro, after the rename, so with the window open this step refuses (the API answers as dezbatere.ro).
[ "$HOST" = v3-preview.dezbatere.ro ] || { echo "NAME2_NOT_DONE: the API already answers as $HOST"; exit 1; }
[ "$(grep -c '^DEBATEAI_DEPLOYMENT_MODE=hosted$' "$A" || true)" = 1 ] || { echo "NAME2_NOT_DONE: the API is not in hosted mode (it would refuse PREVIEW_MAIN_ORIGIN_NOT_HOSTED)"; exit 1; }
SN=$(grep -cE '^STAFF_WEBAUTHN_(ORIGIN|RP_ID)=' "$A" || true)
[ "$SN" = 0 ] || { [ "$SN" = 2 ] && [ "$(grep -cx 'STAFF_WEBAUTHN_ORIGIN=https://v3-preview.dezbatere.ro' "$A" || true)" = 1 ] && [ "$(grep -cx 'STAFF_WEBAUTHN_RP_ID=v3-preview.dezbatere.ro' "$A" || true)" = 1 ]; } || { echo "NAME2_NOT_DONE: the API file's two staff name lines do not name the test name exactly once each: ask"; exit 1; }
if grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A"; then
  [ "$SN" = 2 ] && [ -f "$CAPI/dialectical-engine/migrations/0184_staff_rekey_permit.sql" ] && [ -f "$L/rekey-staff-key.mjs" ] || { echo "NAME2_NOT_DONE: the staff screens are on, but this release or the tools folder cannot enrol a staff key under a new name: run STAFFOFF (5.1b) first"; exit 1; }
  [ "$(psqlq "SELECT count(*) FROM pg_proc WHERE oid = to_regprocedure('staff.arm_rekey(uuid,text,text,text)')" || true)" = 1 ] || { echo "NAME2_NOT_DONE: the staff screens are on, but the database does not hold the staff re-key step, so no staff key could be enrolled under dezbatere.ro: ask, or run STAFFOFF (5.1b) first"; exit 1; }
  [ "$(psqlq "SELECT COALESCE((SELECT auth_method FROM pg_hba_file_rules WHERE error IS NULL AND type = 'local' AND database && ARRAY['all', 'debateai'] AND user_name && ARRAY['all', 'debateai_prod_staff_recovery'] ORDER BY rule_number LIMIT 1), 'none')" || true)" = scram-sha-256 ] || { echo "NAME2_NOT_DONE: the staff screens are on, but the database's pg_hba.conf does not admit debateai_prod_staff_recovery on the local socket with scram-sha-256, so REKEY (5.7) could not arm a permit under dezbatere.ro: ask, or run STAFFOFF (5.1b) first"; exit 1; }
  echo "the staff screens are on: they move to dezbatere.ro with the name, and every staff key must be enrolled again there (5.7) after NAME3; if the API refuses at NAME3, run NAME5, then STAFFOFF (5.1b), then NAME2 and NAME3 again"
fi
[ "$(grep -c '^SOCIAL_SOCKET_PATH=' "$A" || true)" = 0 ] || { echo "NAME2_NOT_DONE: social sign-in is set up and its relay's callbacks name the test name, so every provider button would vanish on dezbatere.ro: ask"; exit 1; }
TK=$(grep '^TURNSTILE_SITE_KEY=' "$UF" || true); [ -z "$TK" ] || [ "$TK" = 'TURNSTILE_SITE_KEY=0x4AAAAAAFNg9KPm2tECytqZ' ] || { echo "NAME2_NOT_DONE: the website file's site key is not the listed one (it would refuse PREVIEW_ORIGIN_SITE_KEY_MISMATCH)"; exit 1; }
[ "$(jq -r .schema "$MP")" = preview-auth-dev-mail-v2 ] || { echo "NAME2_NOT_DONE: mail-plan.json is still v1 (part 4.2 first; the API would refuse PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN)"; exit 1; }
cmp -s "$C" "$M/name/Caddyfile.phase1" || { echo "NAME2_NOT_DONE: the live Caddyfile is not the prepared one (NAME1 first): look"; exit 1; }
for SVC in api ui; do F=$E/$SVC-$LABEL.env
  [ "$(grep -c '^PUBLIC_APP_URL=' "$F" || true)" = 1 ] && [ "$(grep -cx 'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro' "$F" || true)" = 1 ] || { echo "NAME2_NOT_DONE: $F does not name the test name exactly once"; exit 1; }
  [ -e "$M/name/$SVC-$LABEL.env.before-main" ] || cp -p "$F" "$M/name/$SVC-$LABEL.env.before-main"
  ( umask 077; sed -e 's|^PUBLIC_APP_URL=https://v3-preview\.dezbatere\.ro$|PUBLIC_APP_URL=https://dezbatere.ro|' -e 's|^STAFF_WEBAUTHN_ORIGIN=https://v3-preview\.dezbatere\.ro$|STAFF_WEBAUTHN_ORIGIN=https://dezbatere.ro|' -e 's|^STAFF_WEBAUTHN_RP_ID=v3-preview\.dezbatere\.ro$|STAFF_WEBAUTHN_RP_ID=dezbatere.ro|' "$F" > "$M/name/$SVC-$LABEL.env.main" )
  W=2; [ "$SVC" != api ] || W=$((2 + 2 * SN))
  [ "$(diff "$F" "$M/name/$SVC-$LABEL.env.main" | grep -c '^[<>]' || true)" = "$W" ] && [ "$(grep -cx 'PUBLIC_APP_URL=https://dezbatere.ro' "$M/name/$SVC-$LABEL.env.main" || true)" = 1 ] || { echo "NAME2_NOT_DONE: the $SVC copy does not change exactly the name line (and, in the API file, its two staff name lines)"; exit 1; }
done
[ "$SN" = 0 ] || { [ "$(grep -cx 'STAFF_WEBAUTHN_ORIGIN=https://dezbatere.ro' "$M/name/api-$LABEL.env.main" || true)" = 1 ] && [ "$(grep -cx 'STAFF_WEBAUTHN_RP_ID=dezbatere.ro' "$M/name/api-$LABEL.env.main" || true)" = 1 ]; } || { echo "NAME2_NOT_DONE: the API copy's staff name lines do not name dezbatere.ro exactly once each"; exit 1; }
[ "$(grep -c 'v3-preview\.dezbatere\.ro' "$M/name/ui-$LABEL.env.main" || true)" = 0 ] || { echo "NAME2_NOT_DONE: the website copy still names the test name somewhere: ask"; exit 1; }
[ ! -e "$TDROP" ] || { echo "NAME2_NOT_DONE: $TDROP exists already: look"; exit 1; }
[ "$(systemctl cat debateai-preview-turnstile | grep -cE '^[[:space:]]*EnvironmentFile=' || true)" = 0 ] || { echo "NAME2_NOT_DONE: the installed relay unit reads an EnvironmentFile, which would win over the drop-in: look"; exit 1; }
[ "$(systemctl cat debateai-preview-turnstile | grep -cE '^[[:space:]]*Environment=.*PUBLIC_APP_URL=' || true)" = 1 ] || { echo "NAME2_NOT_DONE: the relay unit does not set PUBLIC_APP_URL in exactly one Environment= line: look"; exit 1; }
[ "$(relay)" = 'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro' ] || { echo "NAME2_NOT_DONE: the running relay does not answer as the test name today: look"; exit 1; }
RP=$(systemctl show -p ExecStart --value debateai-preview-turnstile | tr ' ;' '\n\n' | grep -m1 'siteverify-relay\.mjs' | sed -e 's/^argv\[\]=//' -e 's/^path=//' || true); RR=$(readlink -f "$RP" 2>/dev/null || true)
[ -n "$RP" ] && [ -n "$RR" ] && [ "$(stat -c '%U %F' "$RR" 2>/dev/null || true)" = 'root regular file' ] && [ $(( 0$(stat -c %a "$RR") & 022 )) = 0 ] || { echo "NAME2_NOT_DONE: the relay's program (${RP:-not named in its unit}) is missing, not root's regular file, or writable by others; NAME3 and NAME5 restart the relay: ask"; exit 1; }
[ "$RR" = "$RP" ] || case "$RR" in /opt/debateai-v3-preview/releases/*) echo "NAME2_NOT_DONE: the relay reaches its program through a link into a release folder ($RR): ask"; exit 1;; esac
RW=$(systemctl show -p WorkingDirectory --value debateai-preview-turnstile || true); RWR=$(readlink -f "${RW#!}" 2>/dev/null || true)
[ -z "$RW" ] || { [ -n "$RWR" ] && [ -d "$RWR" ]; } || { echo "NAME2_NOT_DONE: the relay's working folder ($RW) is missing; NAME3 and NAME5 restart the relay: ask"; exit 1; }
echo "the Turnstile relay runs $RR${RWR:+, in $RWR}: never archive or remove the folders that hold them"
( umask 022; printf '[Service]\nEnvironment=PUBLIC_APP_URL=https://dezbatere.ro\n' > "$M/name/20-public-origin.conf" )
[ "$(grep -cE '^[[:space:]]*@netopia_notify \{$' "$M/name/Caddyfile.before-dezbatere" || true)" = 1 ] || { echo "NAME2_NOT_DONE: not one notify handle"; exit 1; }
( umask 022; sed 's/v3-preview\.dezbatere\.ro/dezbatere.ro/g' "$M/name/Caddyfile.before-dezbatere" > "$M/name/Caddyfile.renamed"; cat >> "$M/name/Caddyfile.renamed" <<'EOF'

www.dezbatere.ro {
    tls {
        protocols tls1.2 tls1.3
    }
    redir https://dezbatere.ro{uri} 302
}

http://www.dezbatere.ro {
    redir https://dezbatere.ro{uri} 302
}

v3-preview.dezbatere.ro {
    tls {
        protocols tls1.2 tls1.3
    }
    route {
        @netopia_notify {
            method POST
            path /api/v1/billing/netopia/notify
        }
        handle @netopia_notify {
            request_body {
                max_size 1MB
            }
            reverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {
                import debateai_slots
                header_up Host dezbatere.ro
                header_up X-Forwarded-For {remote_host}
                header_up X-Forwarded-Proto https
                header_up X-Debateai-Edge-Secret {file./etc/debateai-v3-preview/ui-edge.caddy.secret}
                header_up -Authorization
            }
        }
        redir https://dezbatere.ro{uri} 302
    }
}

http://v3-preview.dezbatere.ro {
    redir https://dezbatere.ro{uri} 302
}
EOF
)
OB=$(order "$M/name/Caddyfile.before-dezbatere" v3-preview.dezbatere.ro || true); [ -n "$OB" ] && [ "$OB" = "$(order "$M/name/Caddyfile.renamed" dezbatere.ro)" ] || { echo "NAME2_NOT_DONE: the renamed main block does not keep the live handler order"; exit 1; }
( umask 022; awk '{print} $0=="dezbatere.ro {"{n++; print "\theader {"; print "\t\tStrict-Transport-Security \"max-age=31536000\""; print "\t\t-Server"; print "\t}"} END{if(n!=1)exit 1}' "$M/name/Caddyfile.renamed" > "$M/name/Caddyfile.main" ) || { echo "NAME2_NOT_DONE: there is not exactly one dezbatere.ro block"; exit 1; }
[ "$(diff "$M/name/Caddyfile.renamed" "$M/name/Caddyfile.main" | grep -c '^>' || true)" = 4 ] && [ "$(diff "$M/name/Caddyfile.renamed" "$M/name/Caddyfile.main" | grep -c '^<' || true)" = 0 ] || { echo "NAME2_NOT_DONE: the HTTPS header group is not the only addition"; exit 1; }
MB=$(nblock "$M/name/Caddyfile.main" dezbatere.ro || true); [ -n "$MB" ] && [ "$(nblock "$M/name/Caddyfile.main" v3-preview.dezbatere.ro)" = "$MB" ] || { echo "NAME2_NOT_DONE: the old name's notice pass-through is not the main one"; exit 1; }
[ "$(grep -c 'respond /readyz 404' "$M/name/Caddyfile.main")" = 1 ] || { echo "NAME2_NOT_DONE: not one readiness refusal"; exit 1; }
cad validate --config "$M/name/Caddyfile.main" --adapter caddyfile >/dev/null 2>&1 || { echo "NAME2_NOT_DONE: caddy validate refused the main file"; exit 1; }
cp -p "$MP" "$M/name/mail-plan.before-main.json"
( umask 022; jq -c '.publicAppUrl="https://dezbatere.ro"' "$MP" > "$M/name/mail-plan.main.json" )
diff "$M/name/Caddyfile.before-dezbatere" "$M/name/Caddyfile.main" || true
echo NAME2_DONE
exit 0
```

NAME2 also prints where the Turnstile relay runs its program from, and its working folder (`the Turnstile relay runs
…, in …`). NAME3 and NAME5 restart that relay, so both must stay there. If either path is inside a release folder
under `/opt/debateai-v3-preview/releases/`, that release folder must stay as it is: never archive it (the release
guide's SB15) and never remove it by hand. Moving the relay out of the release folders is a later day's reviewed step.

**Read the last diff before you go on.** Only host names, the four HTTPS-header lines and the blocks added at the end
may differ. Anything else: stop and ask. The rename changes the site address, `@wrongHost`, the `@wrongOrigin` check,
every `header_up Host` (the 127.0.0.1:3090 listener's too) and the old `http://` block. It leaves the
`/etc/debateai-v3-preview` paths alone. The old name redirects with 302, never 308: a remembered permanent redirect
would loop after closing.

### 5.3 The switch (a few minutes down)

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# NAME3: the site answers as dezbatere.ro: env files, the relay drop-in, Caddy and the mail plan, in one stop window.
# The NETOPIA review window (5.8) opens only after the rename, so with the window open this step refuses before it stops anything (the live Caddyfile is not NAME1's).
cmp -s "$C" "$M/name/Caddyfile.phase1" || { echo "NAME3_NOT_DONE: the live Caddyfile is not the prepared one (nothing was stopped): look"; exit 1; }
[ ! -e "$TDROP" ] || { echo "NAME3_NOT_DONE: $TDROP exists (nothing was stopped): look"; exit 1; }
SN=$(grep -cE '^STAFF_WEBAUTHN_(ORIGIN|RP_ID)=' "$A" || true)
for SVC in api ui; do W=2; [ "$SVC" != api ] || W=$((2 + 2 * SN)); [ "$(diff "$E/$SVC-$LABEL.env" "$M/name/$SVC-$LABEL.env.main" | grep -c '^[<>]' || true)" = "$W" ] || { echo "NAME3_NOT_DONE: $SVC-$LABEL.env changed since NAME2 (nothing was stopped): run NAME2 again"; exit 1; }; done
cmp -s "$MP" "$M/name/mail-plan.before-main.json" || { echo "NAME3_NOT_DONE: mail-plan.json changed since NAME2 (nothing was stopped): run NAME2 again"; exit 1; }
MMODE=$(jq -r .recipients "$M/name/mail-plan.before-main.json" 2>/dev/null || true)
case "$MMODE" in allow-list|open) ;; *) echo "NAME3_NOT_DONE: the kept mail plan has no v2 mode (nothing was stopped): run NAME2 again"; exit 1;; esac
declare -F apistart >/dev/null || { echo "NAME3_NOT_DONE: the names file is from an earlier version of this guide (no apistart; nothing was stopped): run LOCKS0 (3.0) again, then NAME3"; exit 1; }
systemctl stop "$WEB" "$API" || { echo "NAME3_NOT_DONE: systemctl stop of the website and API failed: run NAME5 now"; exit 1; }
for SVC in api ui; do F=$E/$SVC-$LABEL.env; { cp "$M/name/$SVC-$LABEL.env.main" "$F.new" && chown --reference="$F" "$F.new" && chmod --reference="$F" "$F.new" && mv "$F.new" "$F"; } || { echo "NAME3_NOT_DONE: $SVC-$LABEL.env was not replaced: the site is DOWN: run NAME5 now"; exit 1; }; done
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" || { echo "NAME3_NOT_DONE: a SAME check is BAD (above): the site is DOWN: run NAME5 now"; exit 1; }
{ install -d -o root -g root -m 0755 "$(dirname "$TDROP")" && install -o root -g root -m 0644 "$M/name/20-public-origin.conf" "$TDROP"; } || { echo "NAME3_NOT_DONE: the relay's drop-in was not put in place: the site is DOWN: run NAME5 now"; exit 1; }
systemctl daemon-reload || true; systemctl restart debateai-preview-turnstile || echo 'systemctl restart of the relay returned non-zero'; sleep 2
[ "$(relay)" = 'PUBLIC_APP_URL=https://dezbatere.ro' ] || { echo "NAME3_NOT_DONE: the running relay does not answer as dezbatere.ro: the site is DOWN: run NAME5 now"; exit 1; }
{ install -o root -g root -m 0644 "$M/name/Caddyfile.main" "$C.new" && mv "$C.new" "$C" && cmp -s "$M/name/Caddyfile.main" "$C"; } || { echo "NAME3_NOT_DONE: the main Caddyfile was not put in place: the site is DOWN: run NAME5 now"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3; [ "$(systemctl is-active caddy || true)" = active ] || { echo "NAME3_NOT_DONE: Caddy did not come back: the site is DOWN: run NAME5 now"; exit 1; }
{ install -o root -g root -m 0644 "$M/name/mail-plan.main.json" "$MP.new" && mv -f "$MP.new" "$MP" && cmp -s "$M/name/mail-plan.main.json" "$MP"; } || { echo "NAME3_NOT_DONE: the main mail plan was not put in place: the site is DOWN: run NAME5 now"; exit 1; }
# Both were stopped, and a restart of the API does not start a stopped website: the API alone first, then the website.
apistart || { echo "NAME3_NOT_DONE: the API did not start (the line above names the setting): the site is DOWN: run NAME5 now"; exit 1; }
webup || { echo "NAME3_NOT_DONE: the API started, but the website did not (the line above names the setting): the site is DOWN: run NAME5 now"; exit 1; }
said -xF "PREVIEW_MAIL_MODE {\"mode\":\"$MMODE\",\"origin\":\"https://dezbatere.ro\"}" || { echo "NAME3_NOT_DONE: the API's mail line is not mode $MMODE on dezbatere.ro: run NAME5 now"; exit 1; }
echo NAME3_DONE
exit 0
```

Expect the SAME list (all `OK`, with `OK SAME_UI_API_PUBLIC_APP_URL:<LABEL>`), the API's lines (`PREVIEW_MAIL_MODE
{…"origin":"https://dezbatere.ro"}` with the same mode as before, `PREVIEW_API_STARTED …`), then `NAME3_DONE`. The
runner reads no public name and is not restarted. NAME3 starts the API alone (`apistart`), then the website (`webup`):
both were stopped, and restarting the API does not start a stopped website (3.0, "Why both"). So `NAME3_NOT_DONE: the
API did not start` means the API itself did not start, and `NAME3_NOT_DONE: the API started, but the website did not`
means the website did not.

`NAME3_NOT_DONE: the names file is from an earlier version of this guide` comes before anything is stopped: the site
is as it was. Run LOCKS0 (3.0) again, with `rNN` left as it is, then NAME3.

If a refusal line shows, part 10 says what it means. Whatever it says: run NAME5 at once, then read it calmly. While
the API is refused, systemd tries it again every 30 seconds; NAME5 stops that.

### 5.4 The checks after the switch

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# NAME4: the main name, checked (read-only). Each line prints nothing when it holds.
BAD=''; chk() { echo "CHECK_FAILED: $1"; BAD=yes; }
[ "$HOST" = dezbatere.ro ] || chk 'the API file does not name dezbatere.ro'
[ "$(relay)" = 'PUBLIC_APP_URL=https://dezbatere.ro' ] || chk 'the running relay'
[ "$(curl -s -o /dev/null -w '%{http_code}' https://dezbatere.ro/login)" = 401 ] || chk 'dezbatere.ro does not ask for the site password'
[ "$(loc 'https://www.dezbatere.ro/x?y=1')" = 'location: https://dezbatere.ro/x?y=1' ] || chk 'www'
[ "$(loc https://v3-preview.dezbatere.ro/settings)" = 'location: https://dezbatere.ro/settings' ] || chk 'the old name does not redirect'
[ "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://dezbatere.ro/)" = '308 https://dezbatere.ro/' ] || chk 'http://dezbatere.ro'
N0=$(cat "$M/name/notify-code.before-dezbatere"); [ "$(notify dezbatere.ro)" = "$N0" ] && [ "$(notify v3-preview.dezbatere.ro)" = "$N0" ] || chk 'a NETOPIA notice is not passed through on both names'
[ "$(hsts dezbatere.ro)" = 'strict-transport-security: max-age=31536000' ] || chk 'dezbatere.ro sends another HTTPS-only header (or two)'
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3090/readyz)" = 200 ] || chk 'readiness'
[ -z "$BAD" ] || { echo "NAME4_NOT_DONE: a check failed (above): run NAME5, then ask"; exit 1; }
echo NAME4_DONE
exit 0
```

Then, by hand:
1. The HTTPS header behind the password. Run
   `curl -s -o /dev/null -D - -u '<the site user>' https://dezbatere.ro/login | tr -d '\r' | tr 'A-Z' 'a-z' | grep '^strict-transport-security:'`.
   curl asks for the password; never put it on the command line. It must print exactly one line,
   `strict-transport-security: max-age=31536000`, with no `includesubdomains`.
2. The billing check on the new name: run SANDBOXCHECK (3.2) again, or PAY_PROVE (7.7) when payments are live. The
   notify line must pass.
3. In the browser, with the site password: sign in at https://dezbatere.ro/login with password and authenticator code.
   Everyone signs in again after the rename (sign-in cookies belong to a name).
4. **Your passkey.** Passkeys belong to a name, so the old one does not work on dezbatere.ro. Add your hardware key
   again: Settings → Security → **Create a passkey** (Creați o cheie de acces). In the confirm card choose
   **Password · 6-digit authentication code** (Parolă · Cod de autentificare din 6 cifre), not **Use a passkey**
   (Folosiți o cheie de acces): the old passkey fails on the new name. Type your password and code. The page goes on by
   itself after the sixth digit; if it does not, press **Confirm action** (Continuați). A new card shows **Create a
   passkey** (Creați o cheie de acces) again: press it within five minutes, then touch the key. If the browser refuses
   the key, ask. Keep the old entry until the name is final: after NAME5 only the old one works. Remove it later with
   its Remove button, your password and your code.
5. **Your staff key.** A staff key belongs to one name too, and the one you enrolled works only on the test name. Do
   5.7 now, or later the same day: it enrols your staff key again under dezbatere.ro. Until then the Team page
   (https://dezbatere.ro/admin/team) cannot verify you: **Verify security key for team access** (Verifică cheia de securitate pentru accesul echipei) ends
   with "The action could not be completed…" (Acțiunea nu a putut fi finalizată…), or is greyed out if the staff
   screens are off. That is expected. Your ordinary passkey (step 4) is separate, and it works. Part 8 waits for
   5.7: once the site is open to everyone, Hide now is the only way you can take a published debate down yourself.
6. Open `/sign-up` and see the Turnstile check pass.
7. Start one team question and check it is not cut at 55 seconds.

### 5.5 The way back (close the name; it stays prepared)

A few minutes down, like the switch (the API's start alone takes a minute or more). It works from any state NAME3
left. It starts nothing until both env files name the test name and every SAME check is OK. It refuses, with nothing
stopped, while the site is open to everyone (PWON first), while the NETOPIA review window is open (REVIEW_CLOSE or
PWON first, 5.8) or while payments are real (PAY_BACK first): part 9's order. It also refuses, with nothing stopped,
when the names file is from an earlier version of this guide: run LOCKS0 (3.0) again, with `rNN` left as it is, then
NAME5. Once it has stopped the website and the API, every `NAME5_NOT_DONE` up to the website's start means the site is
down: ask at once. Like NAME3, it starts the API alone, then the website, and its last lines say which did not start.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# NAME5: the site answers as the test name again; dezbatere.ro stays prepared (redirect and notice pass-through).
[ -s "$M/name/Caddyfile.phase1" ] && [ -s "$M/name/notify-code.before-dezbatere" ] || { echo "NAME5_NOT_DONE: a kept file is missing; nothing was stopped: ask"; exit 1; }
! cmp -s "$C" "$M/password/Caddyfile.open" || { echo "NAME5_NOT_DONE: the site is open to everyone: PWON first (part 9 order); nothing was stopped"; exit 1; }
! grep -qE 'review_locked|review_quiet|review window begin' "$C" || { echo "NAME5_NOT_DONE: the NETOPIA review window is open: REVIEW_CLOSE (5.8) or PWON first (part 9 order); nothing was stopped"; exit 1; }
! grep -qx 'PREVIEW_LIVE_PAYMENTS=real-money' "$A" || { echo "NAME5_NOT_DONE: payments are real on this name: PAY_BACK first (part 9 order); nothing was stopped"; exit 1; }
MMODE=$(jq -r 'if .schema == "preview-auth-dev-mail-v1" then "legacy" else .recipients end' "$MP" 2>/dev/null || true)
case "$MMODE" in legacy|allow-list|open) ;; *) echo "NAME5_NOT_DONE: mail-plan.json does not read as a mail plan; nothing was stopped: ask"; exit 1;; esac
SOK=no; [ "$(grep -cE '^STAFF_WEBAUTHN_(ORIGIN|RP_ID)=' "$A" || true)" = 2 ] && [ "$(grep -cxE 'STAFF_WEBAUTHN_ORIGIN=https://(v3-preview\.)?dezbatere\.ro' "$A" || true)" = 1 ] && [ "$(grep -cxE 'STAFF_WEBAUTHN_RP_ID=(v3-preview\.)?dezbatere\.ro' "$A" || true)" = 1 ] && SOK=yes
[ "$SOK" = yes ] || ! grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" || { echo "NAME5_NOT_DONE: the staff screens are on, but the API file's two staff name lines do not each name one of the two names exactly once; nothing was stopped: ask"; exit 1; }
declare -F apistart >/dev/null || { echo "NAME5_NOT_DONE: the names file is from an earlier version of this guide (no apistart; nothing was stopped): run LOCKS0 (3.0) again, then NAME5"; exit 1; }
systemctl stop "$WEB" "$API" || { echo "NAME5_NOT_DONE: systemctl stop of the website and API failed: the site may be DOWN: ask at once"; exit 1; }
for SVC in api ui; do F=$E/$SVC-$LABEL.env
  { ( umask 077; sed -e 's|^PUBLIC_APP_URL=https://dezbatere\.ro$|PUBLIC_APP_URL=https://v3-preview.dezbatere.ro|' -e 's|^STAFF_WEBAUTHN_ORIGIN=https://dezbatere\.ro$|STAFF_WEBAUTHN_ORIGIN=https://v3-preview.dezbatere.ro|' -e 's|^STAFF_WEBAUTHN_RP_ID=dezbatere\.ro$|STAFF_WEBAUTHN_RP_ID=v3-preview.dezbatere.ro|' "$F" > "$F.new" ) && chown --reference="$F" "$F.new" && chmod --reference="$F" "$F.new" && mv "$F.new" "$F"; } || { echo "NAME5_NOT_DONE: $SVC-$LABEL.env was not rewritten: the site is DOWN: ask at once"; exit 1; }
  [ "$(grep -c '^PUBLIC_APP_URL=' "$F" || true)" = 1 ] && [ "$(grep -cx 'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro' "$F" || true)" = 1 ] || { echo "NAME5_NOT_DONE: $F does not name the test name exactly once (compare it with $M/name/$SVC-$LABEL.env.before-main): the site is DOWN: ask at once"; exit 1; }
done
[ "$SOK" = no ] || { [ "$(grep -cx 'STAFF_WEBAUTHN_ORIGIN=https://v3-preview.dezbatere.ro' "$A" || true)" = 1 ] && [ "$(grep -cx 'STAFF_WEBAUTHN_RP_ID=v3-preview.dezbatere.ro' "$A" || true)" = 1 ]; } || { echo "NAME5_NOT_DONE: the API file's staff name lines do not name the test name exactly once each: the site is DOWN: ask at once"; exit 1; }
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" || { echo "NAME5_NOT_DONE: a SAME check is BAD (above): the site is DOWN: ask at once"; exit 1; }
rm -f "$TDROP"; systemctl daemon-reload || true; systemctl restart debateai-preview-turnstile || echo 'systemctl restart of the relay returned non-zero'; sleep 2
[ "$(relay)" = 'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro' ] || { echo "NAME5_NOT_DONE: the running relay does not answer as the test name: the site is DOWN: ask at once"; exit 1; }
cp -p "$C" "$M/name/Caddyfile.before-name5-$(date -u +%Y%m%dT%H%M%SZ)" || true
{ install -o root -g root -m 0644 "$M/name/Caddyfile.phase1" "$C.new" && mv "$C.new" "$C" && cmp -s "$M/name/Caddyfile.phase1" "$C"; } || { echo "NAME5_NOT_DONE: the prepared Caddyfile was not put in place: the site is DOWN: ask at once"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3; [ "$(systemctl is-active caddy || true)" = active ] || { echo "NAME5_NOT_DONE: Caddy did not come back: the site is DOWN: ask at once"; exit 1; }
if [ "$(jq -r .publicAppUrl "$MP")" = https://dezbatere.ro ]; then
  ( umask 022; jq -c '.publicAppUrl="https://v3-preview.dezbatere.ro"' "$MP" > "$M/name/mail-plan.back.json" )
  { install -o root -g root -m 0644 "$M/name/mail-plan.back.json" "$MP.new" && mv -f "$MP.new" "$MP" && cmp -s "$M/name/mail-plan.back.json" "$MP"; } || { echo "NAME5_NOT_DONE: the mail plan for the test name was not put in place: the site is DOWN: ask at once"; exit 1; }
fi
# Both were stopped, and a restart of the API does not start a stopped website: the API alone first, then the website.
apistart || { echo "NAME5_NOT_DONE: the API did not start (the line above names the setting): the site is DOWN: ask at once"; exit 1; }
webup || { echo "NAME5_NOT_DONE: the API started, but the website did not (the line above names the setting): the site is DOWN: ask at once"; exit 1; }
said -xF "PREVIEW_MAIL_MODE {\"mode\":\"$MMODE\",\"origin\":\"https://v3-preview.dezbatere.ro\"}" || { echo "NAME5_NOT_DONE: the API's mail line is not mode $MMODE on the test name: ask"; exit 1; }
N0=$(cat "$M/name/notify-code.before-dezbatere"); [ "$(notify v3-preview.dezbatere.ro)" = "$N0" ] && [ "$(notify dezbatere.ro)" = "$N0" ] || { echo "NAME5_NOT_DONE: a NETOPIA notice is not passed through on both names: look at the Caddyfile"; exit 1; }
[ "$(loc 'https://dezbatere.ro/x?y=1')" = 'location: https://v3-preview.dezbatere.ro/x?y=1' ] || { echo "NAME5_NOT_DONE: dezbatere.ro does not redirect to the test name"; exit 1; }
echo NAME5_DONE
exit 0
```

The env edit reverses only the name line and, in the API file, the two staff name lines, so other edits made since
are kept. The mail plan keeps its mode and goes
back to the test name; the script checks that the API's mail line says the same mode. The prepared Caddyfile has the
site password. NAME5 puts back the Caddyfile NAME1 made, so any Caddyfile change made after NAME1 is gone; the live
file it replaced is kept as `/root/preview-archive/main-site/name/Caddyfile.before-name5-<time>`.
Passkeys added on dezbatere.ro do not work on the test name: sign in with password and authenticator. The old
passkey entry works there again if you kept it; otherwise add the key as in 5.4, step 4. NAME5 moves the API file's
two staff name lines back with the name and leaves the policy line as it is. So if the staff screens were on, they
are on again on the test name, and the staff key you first enrolled there works again (a staff key enrolled under
dezbatere.ro stays in the database and works again after the next NAME3). If they were off, they stay off; STAFFON
(5.5b) puts them on, on a server where STAFFOFF once took them off; otherwise ask. To un-prepare the name later, run
NAME1_BACK, then remove the DNS records and the Turnstile hostname. Un-preparing leaves dezbatere.ro with no site at
all: what it showed before, you noted in 1.3 (a).

### 5.5b The staff screens back on the test name (STAFFON)

Run it only while the site answers as the test name: before NAME3, or after NAME5 (which waits for PAY_BACK while
payments are real). It puts the line `STAFF_ACCESS_POLICY_VERSION=2` back and restarts the API (a minute or more
down). If the API refuses, the file before comes back and the API restarts on it. It works on this release and on any
later one, as long as STAFFOFF once took the line out on this server.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# STAFFON: the staff screens back on the test name: the line STAFF_ACCESS_POLICY_VERSION=2 back into the API file, then the API restarts.
# The NETOPIA review window (5.8) opens only on dezbatere.ro, and this step runs only on the test name, so with the window open it refuses.
declare -F upfail >/dev/null || { echo "STAFFON_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then STAFFON"; exit 1; }
K=$M/name/api-$LABEL.env.before-staffon-$(date -u +%Y%m%dT%H%M%SZ)
[ "$HOST" = v3-preview.dezbatere.ro ] || { echo "STAFFON_NOT_DONE: the API answers as $HOST; on dezbatere.ro the step is STAFFMAIN (5.7); nothing changed"; exit 1; }
P=$(grep -c '^STAFF_ACCESS_POLICY_VERSION=' "$A" || true)
if [ "$P" = 1 ] && grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A"; then echo "the API file holds STAFF_ACCESS_POLICY_VERSION=2 already: the staff screens are on; nothing changed"; echo STAFFON_DONE; exit 0; fi
[ "$P" = 0 ] || { echo "STAFFON_NOT_DONE: the API file has a policy line that is not STAFF_ACCESS_POLICY_VERSION=2; nothing changed: ask"; exit 1; }
ls "$M"/name/api-*.env.before-staffoff* >/dev/null 2>&1 || { echo "STAFFON_NOT_DONE: $M/name holds no copy kept by STAFFOFF, so STAFFOFF never took the staff screens off on this server; nothing changed: ask"; exit 1; }
[ "$(grep -cx 'STAFF_WEBAUTHN_ORIGIN=https://v3-preview.dezbatere.ro' "$A" || true)" = 1 ] && [ "$(grep -cx 'STAFF_WEBAUTHN_RP_ID=v3-preview.dezbatere.ro' "$A" || true)" = 1 ] || { echo "STAFFON_NOT_DONE: the staff name lines do not name the test name exactly once; nothing changed: ask"; exit 1; }
for SK in STAFF_INDEPENDENT_ALERT_CONFIG_PATH STAFF_ALERT_OPERATOR_MODULE_PATH STAFF_ALERT_OPERATOR_MODULE_SHA256; do [ "$(grep -c "^$SK=" "$A" || true)" = 1 ] || { echo "STAFFON_NOT_DONE: the API file does not hold $SK exactly once; nothing changed: ask"; exit 1; }; done
[ -z "$(tail -c1 "$A")" ] || { echo "STAFFON_NOT_DONE: $A does not end in a newline; nothing changed: ask"; exit 1; }
cp -p "$A" "$K" || { rm -f "$K"; echo "STAFFON_NOT_DONE: the copy $K was not kept; nothing changed: ask"; exit 1; }
{ ( umask 077; { cat "$A"; printf 'STAFF_ACCESS_POLICY_VERSION=2\n'; } > "$A.new" ) && chown --reference="$A" "$A.new" && chmod --reference="$A" "$A.new"; } || { rm -f "$A.new"; echo "STAFFON_NOT_DONE: the new file was not written; nothing changed: ask"; exit 1; }
[ "$(diff "$A" "$A.new" | grep -c '^[<>]' || true)" = 1 ] && [ "$(diff "$A" "$A.new" | grep -cx '> STAFF_ACCESS_POLICY_VERSION=2' || true)" = 1 ] || { rm -f "$A.new"; echo "STAFFON_NOT_DONE: not a one-line addition; nothing changed: ask"; exit 1; }
mv "$A.new" "$A" || { rm -f "$A.new"; echo "STAFFON_NOT_DONE: the new file was not put in place; nothing changed: ask"; exit 1; }
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the file with the staff screens on'); { cp -p "$K" "$A.new" && mv "$A.new" "$A"; } || { echo "STAFFON_NOT_DONE: $WHY, and the file before could not be put back (it is $K): the site is DOWN: ask at once"; exit 1; }; { apistart && webup; } || { echo "STAFFON_NOT_DONE: $WHY; the file before is back, but the API or the website did not start on it either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "STAFFON_NOT_DONE: $WHY; the file before is back, and the API and the website started on it: ask"; exit 1; fi
echo STAFFON_DONE
exit 0
```

Expect the API's start lines, then `STAFFON_DONE`. Your old staff key works again on the test name, and STAFFOFF can
run again later. If it says `the staff screens are on`, nothing changed and nothing is wrong. If you ran STAFFON
between NAME2 and NAME3, run NAME2 again before NAME3: NAME3 refuses an API file changed since NAME2.
Never put the policy line back by hand while the site answers as dezbatere.ro: use STAFFMAIN (5.7), which also moves
the two staff name lines. With the lines naming the other name the API refuses to start
(`PREVIEW_STAFF_ORIGIN_MISMATCH`).

### 5.6 Later uploads, while the main name is open

- The release guide's `derive` copies `PUBLIC_APP_URL` byte for byte, so a new release's files name the same name, and
  `SAME_PUBLIC_APP_URL` refuses two live releases on different names.
- `derive` copies the staff lines the same way, so a new release starts with the staff screens as they were (on or
  off) and with the same two staff name lines. This document's NAME2 moves those two lines with the name whether the
  staff screens are on or off. A rename done with an earlier version of this document, after STAFFOFF, left them
  naming the test name; STAFFMAIN (5.7) moves them then. Either way STAFFMAIN is what puts the screens on under
  dezbatere.ro: never put the policy line back by hand there (`PREVIEW_STAFF_ORIGIN_MISMATCH`).
- For SB1b and A5, compare the website's build values with
  `rel build-env --origin https://dezbatere.ro --models <stage> --release-key "$KEY"`. Without `--origin` the report
  holds the test name's values. The website build itself does not change: one build serves both names.
- In the release guide's commands that name the host (curl, jq, `NO_PROXY`), write dezbatere.ro by hand instead of
  v3-preview.dezbatere.ro.
- From NAME1 on, change nothing in the Caddyfile by hand: NAME2 and NAME1_BACK refuse a changed file, and NAME5 puts
  back the copy NAME1 made. Only the steps of this document change it (NAME3, REVIEW_OPEN, REVIEW_CLOSE, PWOFF2, PWON,
  SIGNUPS). Ask first. NETOPIA's logo needs no Caddy change: a later upload carries its line by itself.
- The NETOPIA review window (5.8) stays open through a later upload: no upload step reads or changes the Caddyfile
  after NAME1, and nobody can buy through the window. During the drained upload's downtime the open pages show an
  error, to NETOPIA's reviewer too, so do not upload while NETOPIA is reviewing. After SB13b, change the first line
  of names.sh to the new upload (end of 3.0), then run REVIEW_OPEN again: with the window open it only checks, now
  against the new release's pages.
- While 6b is open (asks open with `everyone-with-listed-buyers`), `derive` copies the value and the team line, which
  is the list of buyers, into the new release's files byte for byte, and SB5's (or DR1's) SAME checks hold both
  releases to the same value and the same list. Never run BUYERS from SB3 to the end of the upload. On the
  side-by-side path the site may stay open: both releases carry 6b. On the drained path run PWON before DR2: the site
  is down from DR2 to DR6 anyway, and rbD-B would lose everything strangers write after DR3. After SB13b, change the
  first line of names.sh (end of 3.0); after a drained upload run PWOFF1, the hand edit and PWOFF2 again; then
  OPENCHECK (6b.4).
- The Team page's list of approved buyers (6b.3) is in the database, not in the files: `derive` and SAME have nothing
  to copy, and both releases of a side-by-side upload read the same list at every pay button. Removing an account
  there works at any time, during an upload too. Adding one waits from SB3 until the upload is over (SB14, or the day
  you decide not to go back), like BUYERS. The reason is its security alert: an addition sends one to your alert
  address within a minute or two, as does a removal made while the team tools are unlocked, and a release older than
  the one that carries the list does not know that alert. Its alert sender runs only while its release is the current
  one, so during the upload it never touches the alert; but after a way back to it (WB2) it would drop an alert still
  waiting to go out. So, before any WB2 to such a release, check that the alert of every addition, and every removal
  made with the tools unlocked, that day has arrived; if one has not, wait a few minutes, then ask. After such a way
  back, accounts you allowed on the Team page are refused at the pay button (the team line still buys), that
  release's Team page has no box for the list, and its audit history on the Team page shows an error while the list's
  changes are in it. The list stays in the database and counts again, while 6b is open, once a release that carries
  it is the current one.
- If you watch a later upload's switch from the Mac (the release guide's SB13 watcher), write `machine dezbatere.ro`
  in `~/.config/debateai-preview.netrc` and `https://dezbatere.ro/login` in the watch line.
- While payments are real, 7.12 adds two rules to every later upload. Once real payments were ever on, its LIVEAFTER
  rule holds before any rbD-B.

### 5.7 The staff screens on dezbatere.ro, and your staff key there

Do this once the site answers as dezbatere.ro (NAME4 done), behind the site password, on the release that carries
this document. It takes about half an hour. You need the server (as root), a browser, your password, your
authenticator and your hardware key. It works while payments are real; STAFFMAIN restarts the API, so pick a quiet
minute with no checkout open.

Do it before you open the NETOPIA review window (5.8) if you can. It works with the window open too: STAFFMAIN and
REKEY never touch Caddy, and the Team page stays behind the site password. But while STAFFMAIN restarts the API, the
open pages show an error, to NETOPIA's reviewer too.

The upload brings this step's tool (`deploy/preview-lifecycle/v1/rekey-staff-key.mjs`); SB4's operator review covers
it with the other changed files (part 2). STAFFMAIN and REKEY need the upload's tools-folder swap (SWAP) and its
database step (migration 0184), and the two staff name lines and the three staff alert lines once each in the API
file; REKEY also needs the database line STAFFHBA adds (1.8). Each checks that first, and REKEYCHECK (below) says so
before the day.

**What happens, in plain words.**
- A staff key belongs to one site name. The one you enrolled belongs to the test name, so on dezbatere.ro the Team
  page (https://dezbatere.ro/admin/team; no menu links to it, so type the address) cannot verify you.
- The site never lets an account that is already staff add a staff key with password and code alone. Otherwise a
  thief with your password and your phone could add a key of their own and act as the Owner.
- So the server's operator (you, as root) first says yes for one person and one key. That yes is a **permit**. It
  lasts 15 minutes and works once. It is tied to one sign-in: the one whose **sign-in code** you read in your own
  browser and type on the server. Example: your browser shows `Sign-in code: 3f9a1c2e`; you type `3f9a1c2e` when
  REKEY asks; REKEY says the permit is for the sign-in that began at 10:02 and ends at 10:20. Any other sign-in to
  your account, even one made with the right password and code, has another code and cannot use the permit.
- With the permit you add the key on the Team page. The site writes the key change in the staff audit history and
  sends its key-change alert to the security alert address set on this server.

**Before the day: is the server ready?** REKEYCHECK only reads. Run it after the upload and before the rename,
whatever STAFFCHECK (1.6) said:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# REKEYCHECK: whether this server can do 5.7 (read-only): the release, the tools folder, the database step, the database's own rule for the login REKEY uses, and whether the team unlock (step 3) can write.
# The NETOPIA review window (5.8) may be open: this step only reads.
BAD=''; NB=0; chk() { echo "NOT READY: $1"; NB=$((NB + 1)); [ -n "$BAD" ] || BAD=$1; }
[ -f "$CAPI/dialectical-engine/migrations/0184_staff_rekey_permit.sql" ] || chk 'this release does not carry the staff re-key (the upload first)'
[ -f "$L/rekey-staff-key.mjs" ] || chk "the tools folder does not carry rekey-staff-key.mjs (the upload's tools-folder swap first)"
[ "$(psqlq "SELECT count(*) FROM pg_proc WHERE oid = to_regprocedure('staff.arm_rekey(uuid,text,text,text)')" || true)" = 1 ] || chk "the database does not hold the staff re-key step (the upload's database step first)"
HB=$(psqlq "SELECT COALESCE((SELECT auth_method FROM pg_hba_file_rules WHERE error IS NULL AND type = 'local' AND database && ARRAY['all', 'debateai'] AND user_name && ARRAY['all', 'debateai_prod_staff_recovery'] ORDER BY rule_number LIMIT 1), 'none')" || true)
[ "$HB" = scram-sha-256 ] || chk "the database's pg_hba.conf does not admit debateai_prod_staff_recovery on the local socket with scram-sha-256 (the first rule that matches it says: ${HB:-unreadable}): ask"
# The team unlock writes its ready row either as its own login, from the dedicated user debateai-readiness (the lifecycle guide, install step 7 a-e), or with its fallback (step 7 f), never both. The own login is tried the way the unlock starts its helper: that user's uid and gid, no other group, no environment, no password.
TU=debateai-preview-team-unlock
[ "$(systemctl show -p LoadState --value "$TU" 2>/dev/null || true)" = loaded ] || chk "the team unlock's unit is not installed (the lifecycle guide, install step 6): ask"
FB=$(systemctl show -p ExecStart "$TU" 2>/dev/null | grep -c 'PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login' || true)
OWN=''; RU=$(id -u debateai-readiness 2>/dev/null || true); RG=$(id -g debateai-readiness 2>/dev/null || true)
if [ -z "$RU" ] || [ -z "$RG" ] || [ "$RU" = 0 ] || [ "$RG" = 0 ]; then OWN='the dedicated user debateai-readiness is missing, or has uid or gid 0 (step 7 b)'
else
  AO=$(setpriv --reuid="$RU" --regid="$RG" --clear-groups --inh-caps=-all --no-new-privs -- /usr/bin/env -i "$N" "$L/readiness-writer-actor.mjs" < /dev/null 2>&1 || true)
  PO=$(setpriv --reuid="$RU" --regid="$RG" --clear-groups --inh-caps=-all --no-new-privs -- /usr/bin/env -i /usr/lib/postgresql/18/bin/psql -w --host=/run/debateai-v3-preview/postgresql --port=5434 --username=debateai_staff_readiness_writer -d debateai -XAtc 'SELECT session_user, current_user' 2>&1 || true)
  if [ "$AO" != '{"schema":"preview-lifecycle-readiness-v1","ok":false,"code":"STAFF_READINESS_INPUT_REFUSED"}' ]; then OWN="debateai-readiness cannot start the unlock's helper (it said: $(printf '%s\n' "$AO" | head -n 1 | cut -c1-160); step 7 b)"
  elif [ "$PO" != 'debateai_staff_readiness_writer|debateai_staff_readiness_writer' ]; then OWN="debateai-readiness, with no other group, does not get in as debateai_staff_readiness_writer (psql said: $(printf '%s\n' "$PO" | head -n 1 | cut -c1-200); the socket folder is $(stat -c '%a %U:%G' /run/debateai-v3-preview/postgresql 2>/dev/null || echo unreadable); step 7 e says what each answer means)"; fi
fi
if [ "$FB" = 0 ]; then [ -z "$OWN" ] || chk "the team unlock cannot write as its own login: $OWN. Until it can, install the unlock's fallback (the lifecycle guide, install step 7 f), then run REKEYCHECK again"
elif [ -z "$OWN" ]; then chk "the team unlock's fallback is installed, but its own login works, so the unlock would refuse to start (STAFF_WRITER_FALLBACK_NOT_NEEDED): move the fallback out (the lifecycle guide, install step 7 f, back to the default), then run REKEYCHECK again"; fi
echo "the API answers as $HOST; policy line: $(grep -x 'STAFF_ACCESS_POLICY_VERSION=.*' "$A" || echo none); staff name lines: $(grep -E '^STAFF_WEBAUTHN_(ORIGIN|RP_ID)=' "$A" | tr '\n' ' ' || true)"
[ -z "$BAD" ] || { echo "REKEYCHECK_NOT_DONE: $BAD$([ "$NB" = 1 ] || echo " (and $((NB - 1)) more NOT READY line(s) above)")"; exit 1; }
if [ "$FB" = 0 ]; then echo "the team unlock writes as its own login: in 5.7, UNLOCK (step 3) comes before REKEY (step 4)"; else echo "the team unlock writes with its fallback: in 5.7, REKEY (step 4) comes first, then UNLOCK (step 3) right after REKEY_DONE"; fi
echo REKEYCHECK_DONE
exit 0
```

Expect the line about the API file, the line on the team unlock (which of the two orders 5.7 takes: below, step 3),
then `REKEYCHECK_DONE`. If it says the database's `pg_hba.conf` does not admit the login: ask, before the day.
REKEY connects to the database as the staff recovery login, on the database's local
socket, with a password that exists for three minutes; the database lets that login in only if its `pg_hba.conf`
holds the line `local debateai debateai_prod_staff_recovery scram-sha-256` (it is in
`deploy/postgres/pg_hba.conf.template`) above any broader `local` line. STAFFHBA
(`deploy/preview-lifecycle/v1/README.md`), run in the upload's preparation (1.8), adds that line with a copy of the file,
a check for errors and a reload, so the upload's cold copy holds it. If REKEYCHECK still says the line is missing, ask. Do not edit that file alone.

**The team unlock, before the day.** A new staff key needs the team tools unlocked (step 3), and the unlock writes its
"ready" row in one of two ways (the lifecycle guide, `deploy/preview-lifecycle/v1/README.md`, install step 7):
- **Its own login**, `debateai_staff_readiness_writer`, which needs the database's batch step, the dedicated user
  `debateai-readiness`, two lines in `pg_hba.conf` and `pg_ident.conf`, and a socket folder that lets that user in.
  The unlock starts its helper as that user's own uid and gid with no other group, so REKEYCHECK logs in exactly so.
- **Its fallback**, a drop-in that makes the unlock use the staff recovery login with a temporary password, as REKEY
  does. It needs the same `pg_hba.conf` line as REKEY, and it refuses to start once the own login works.

`NOT READY: the team unlock cannot write as its own login: …` names what failed (the user, the helper, or the login,
with psql's own answer and the socket folder's mode); install the fallback (step 7 f) and run REKEYCHECK again.
`NOT READY: the team unlock's fallback is installed, but its own login works …`: move the fallback out (step 7 f, back to
the default). Either is a change to the server: do it before the day, and only the step the line names.

**1. The staff screens on (skip if they are on already).** If the rename was done with the staff screens on, they are
on already and STAFFMAIN says so. If it was done after STAFFOFF, STAFFMAIN puts the line
`STAFF_ACCESS_POLICY_VERSION=2` back. The two staff name lines already name dezbatere.ro when this document's NAME2
did the rename; when an earlier version of this document did it, they still name the test name, and STAFFMAIN moves
them first.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# STAFFMAIN: the staff screens on, on dezbatere.ro: the API file's two staff name lines name dezbatere.ro and the line STAFF_ACCESS_POLICY_VERSION=2 is in it (a copy kept), then the API restarts (a minute or more down). If the API refuses, the file before comes back.
# The NETOPIA review window (5.8) may be open: this step changes the API file and restarts the API, never Caddy. While the API restarts, the open pages show an error.
declare -F upfail >/dev/null || { echo "STAFFMAIN_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then STAFFMAIN"; exit 1; }
K=$M/name/api-$LABEL.env.before-staffmain-$(date -u +%Y%m%dT%H%M%SZ)
[ "$HOST" = dezbatere.ro ] || { echo "STAFFMAIN_NOT_DONE: the API answers as $HOST; on the test name the step is STAFFON (5.5b), on a server where STAFFOFF once ran; nothing changed"; exit 1; }
[ -f "$CAPI/dialectical-engine/migrations/0184_staff_rekey_permit.sql" ] && [ -f "$L/rekey-staff-key.mjs" ] || { echo "STAFFMAIN_NOT_DONE: this release, or the tools folder, does not carry the staff re-key (the upload first, with its tools-folder swap); nothing changed"; exit 1; }
[ "$(psqlq "SELECT count(*) FROM pg_proc WHERE oid = to_regprocedure('staff.arm_rekey(uuid,text,text,text)')" || true)" = 1 ] || { echo "STAFFMAIN_NOT_DONE: the database does not hold the staff re-key step (the upload's database step first); nothing changed: ask"; exit 1; }
[ "$(grep -c '^STAFF_WEBAUTHN_ORIGIN=' "$A" || true)" = 1 ] && [ "$(grep -c '^STAFF_WEBAUTHN_RP_ID=' "$A" || true)" = 1 ] || { echo "STAFFMAIN_NOT_DONE: the API file does not hold each of the two staff name lines exactly once; nothing changed: ask"; exit 1; }
P=$(grep -c '^STAFF_ACCESS_POLICY_VERSION=' "$A" || true)
if [ "$P" = 1 ] && grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A"; then
  grep -qx 'STAFF_WEBAUTHN_ORIGIN=https://dezbatere.ro' "$A" && grep -qx 'STAFF_WEBAUTHN_RP_ID=dezbatere.ro' "$A" || { echo "STAFFMAIN_NOT_DONE: the policy line is in the file but the staff name lines do not name dezbatere.ro; nothing changed: ask"; exit 1; }
  echo "the staff screens are on under dezbatere.ro already; nothing changed"; echo STAFFMAIN_DONE; exit 0
fi
[ "$P" = 0 ] || { echo "STAFFMAIN_NOT_DONE: the API file has a policy line that is not STAFF_ACCESS_POLICY_VERSION=2; nothing changed: ask"; exit 1; }
{ grep -qx 'STAFF_WEBAUTHN_ORIGIN=https://v3-preview.dezbatere.ro' "$A" && grep -qx 'STAFF_WEBAUTHN_RP_ID=v3-preview.dezbatere.ro' "$A"; } || { grep -qx 'STAFF_WEBAUTHN_ORIGIN=https://dezbatere.ro' "$A" && grep -qx 'STAFF_WEBAUTHN_RP_ID=dezbatere.ro' "$A"; } || { echo "STAFFMAIN_NOT_DONE: the two staff name lines do not both name the test name, nor both dezbatere.ro; nothing changed: ask"; exit 1; }
for SK in STAFF_INDEPENDENT_ALERT_CONFIG_PATH STAFF_ALERT_OPERATOR_MODULE_PATH STAFF_ALERT_OPERATOR_MODULE_SHA256; do [ "$(grep -c "^$SK=" "$A" || true)" = 1 ] || { echo "STAFFMAIN_NOT_DONE: the API file does not hold $SK exactly once; nothing changed: ask"; exit 1; }; done
[ -z "$(tail -c1 "$A")" ] || { echo "STAFFMAIN_NOT_DONE: $A does not end in a newline; nothing changed: ask"; exit 1; }
cp -p "$A" "$K" || { rm -f "$K"; echo "STAFFMAIN_NOT_DONE: the copy $K was not kept; nothing changed: ask"; exit 1; }
{ ( umask 077; { sed -e 's|^STAFF_WEBAUTHN_ORIGIN=https://v3-preview\.dezbatere\.ro$|STAFF_WEBAUTHN_ORIGIN=https://dezbatere.ro|' -e 's|^STAFF_WEBAUTHN_RP_ID=v3-preview\.dezbatere\.ro$|STAFF_WEBAUTHN_RP_ID=dezbatere.ro|' "$A"; printf 'STAFF_ACCESS_POLICY_VERSION=2\n'; } > "$A.new" ) && chown --reference="$A" "$A.new" && chmod --reference="$A" "$A.new"; } || { rm -f "$A.new"; echo "STAFFMAIN_NOT_DONE: the new file was not written; nothing changed: ask"; exit 1; }
D=$(diff "$A" "$A.new" | grep -c '^[<>]' || true)
{ [ "$D" = 1 ] || [ "$D" = 5 ]; } && [ "$(diff "$A" "$A.new" | grep -cx '> STAFF_ACCESS_POLICY_VERSION=2' || true)" = 1 ] && [ "$(diff "$A" "$A.new" | grep '^<' | grep -cvE '^< STAFF_WEBAUTHN_(ORIGIN|RP_ID)=' || true)" = 0 ] && [ "$(grep -cx 'STAFF_WEBAUTHN_ORIGIN=https://dezbatere.ro' "$A.new" || true)" = 1 ] && [ "$(grep -cx 'STAFF_WEBAUTHN_RP_ID=dezbatere.ro' "$A.new" || true)" = 1 ] || { rm -f "$A.new"; echo "STAFFMAIN_NOT_DONE: the new file is not the policy line added and, at most, the two staff name lines moved; nothing changed: ask"; exit 1; }
mv "$A.new" "$A" || { rm -f "$A.new"; echo "STAFFMAIN_NOT_DONE: the new file was not put in place; nothing changed: ask"; exit 1; }
echo "in the API file: the staff name lines name dezbatere.ro and STAFF_ACCESS_POLICY_VERSION=2 is back (the file before is $K); the API restarts"
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the file with the staff screens on'); { cp -p "$K" "$A.new" && mv "$A.new" "$A"; } || { echo "STAFFMAIN_NOT_DONE: $WHY, and the file before could not be put back (it is $K): the site is DOWN: ask at once"; exit 1; }; { apistart && webup; } || { echo "STAFFMAIN_NOT_DONE: $WHY; the file before is back, but the API or the website did not start on it either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "STAFFMAIN_NOT_DONE: $WHY; the file before is back, and the API and the website started on it: ask"; exit 1; fi
echo STAFFMAIN_DONE
exit 0
```

Expect the `in the API file` line, the API's start lines (`PREVIEW_API_STARTED …`), then `STAFFMAIN_DONE`. If it says
`already`, nothing changed. If it stops with `the file before is back, and the API and the website started on it`, the
staff screens are still off and nothing else changed: run nothing more and ask. The way back is NAME5 (it moves the name and the
staff name lines back together); to have the staff screens off again on dezbatere.ro, ask.

**2. Sign in, and read your sign-in code.** Sign in at https://dezbatere.ro/login with your password and
authenticator code (if you are signed in already, that sign-in is fine). Open Settings → **Active sessions** (Sesiuni
active). The row **Current session** (Sesiunea actuală) shows a line that begins `Sign-in code: ` (`Codul acestei
sesiuni: ` in Romanian), followed by eight characters, digits and the letters a to f, for example `3f9a1c2e`. Write
those eight down: REKEY asks for them. The code is not a
secret, but it must be the one this browser shows; never take it from a message or from anyone else. Keep this
browser signed in until the key is enrolled: if you sign out or sign in again, the code changes and the permit ends.
If the list shows an **Other session** (Altă sesiune) you do not recognise, press its **Revoke** (Revocați) and
change your password after this step; it cannot use the permit either way.

**3. Unlock the team tools (UNLOCK).** A new staff key is one of the things that need them unlocked; the unlock keeps
them unlocked for one hour. The order depends on REKEYCHECK's line on the team unlock:
- `writes as its own login`: run UNLOCK now, then step 4.
- `writes with its fallback`: do step 4 (REKEY) first. Right after `REKEY_DONE`, run UNLOCK, then step 5 within the
  permit's 15 minutes. The fallback uses the same staff recovery login REKEY opens, so the two never run at once:
  REKEY refuses while the fallback runs.

Do not take `systemctl is-active` alone as the sign that the tools are unlocked. The unlock is active for about a
minute while it checks the release, and its start line `PREVIEW_TEAM_TOOLS_UNLOCKED` comes before its first database
call: an unlock that cannot write stops a moment later with `PREVIEW_TEAM_TOOLS_LOCKED` and `"outcome":"FAILED"`. The
sign is the first "ready" row it writes, which the Team page needs. UNLOCK starts the unlock (or finds it running) and
waits for that row, at most five minutes. As root:

```sh
set -euo pipefail
# UNLOCK: the team tools unlocked for one hour (the team unlock started, or found running), then checked: it must write a fresh ready row and still run. Nothing else changes.
U=debateai-preview-team-unlock
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
[ "$(systemctl show -p ExecStart "$U" 2>/dev/null | grep -c 'PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login' || true)" = 0 ] || echo "the team unlock uses its fallback (the lifecycle guide, install step 7 f): in 5.7 it runs right after REKEY_DONE, never before REKEY"
if [ "$(systemctl is-active "$U" || true)" = active ]; then
  T=$(date -d "$(systemctl show -p ActiveEnterTimestamp --value "$U")" +%s 2>/dev/null || date +%s); echo "the team unlock runs already: nothing started; checking it"
else
  T=$(date +%s); sleep 1; systemctl reset-failed "$U" 2>/dev/null || true; systemctl start "$U" || true
fi
R=''
for i in $(seq 1 60); do
  sleep 5
  J=$(journalctl -u "$U" --since "@$T" -o cat --no-pager 2>/dev/null | grep -E '"event":"PREVIEW_TEAM_TOOLS_(UNLOCKED|LOCKED)"' || true)
  if grep -q '"event":"PREVIEW_TEAM_TOOLS_LOCKED"' <<<"$J"; then R=$(grep '"event":"PREVIEW_TEAM_TOOLS_LOCKED"' <<<"$J" | tail -n 1 | jq -r '.reason // .outcome // "no reason given"' 2>/dev/null || echo unreadable); break; fi
  S=$(systemctl is-active "$U" || true); case "$S" in active|activating) ;; *) R="the unit is $S"; break;; esac
  if grep -q '"event":"PREVIEW_TEAM_TOOLS_UNLOCKED"' <<<"$J" && [ "$(psqlq "SELECT count(*) FROM staff.independent_alert_readiness WHERE published_at >= to_timestamp($T) AND valid_until > clock_timestamp()" || true)" = 1 ]; then
    echo "the team tools are unlocked until $(grep '"event":"PREVIEW_TEAM_TOOLS_UNLOCKED"' <<<"$J" | tail -n 1 | jq -r '.until // "?"' 2>/dev/null || echo '?') (UTC); they lock again by themselves then, or at  systemctl stop $U"
    echo UNLOCK_DONE; exit 0
  fi
done
journalctl -u "$U" --since "@$T" -o cat --no-pager 2>/dev/null | tail -n 5 | cut -c1-300 || true
if [ -n "$R" ]; then
  case "$R" in
    STAFF_READINESS_*|STAFF_DB_HOST_REFUSED) W='the unlock cannot write as its own login: run REKEYCHECK (5.7), which names the step to do (the lifecycle guide, install step 7), then UNLOCK again';;
    STAFF_WRITER_FALLBACK_NOT_NEEDED) W='its own login works, so its fallback refuses to start: move the fallback out (the lifecycle guide, install step 7 f), then UNLOCK again';;
    STAFF_JIT_*) W='its fallback could not open or keep the staff recovery login (REKEY holds it for up to three minutes): wait three minutes, then UNLOCK again; if it says this twice, ask';;
    *) W='ask, and give this line and the lines above';;
  esac
  echo "UNLOCK_NOT_DONE: the team unlock stopped ($R): $W"; exit 1
fi
echo "UNLOCK_NOT_DONE: the team unlock runs, but wrote no fresh ready row within five minutes: run  systemctl stop $U , then ask"
exit 1
```

Expect `the team tools are unlocked until …`, then `UNLOCK_DONE`, usually within two minutes. `UNLOCK_NOT_DONE` says
why and what to do. An unlock that can neither write as its own login nor use a fallback looks active for about a
minute, then stops with a `STAFF_READINESS_…` reason (for example `STAFF_READINESS_USER_MISSING` when the dedicated
user does not exist, or `STAFF_READINESS_DATABASE_UNAVAILABLE` when that user cannot reach the database's socket):
REKEYCHECK names the step to do.

**4. Arm the permit.**

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# REKEY: the operator's yes for ONE new staff key of the Owner account, under the name the site answers as: one permit in the database (15 minutes, one use, for the sign-in whose code you type). Nothing restarts; no file changes.
# The NETOPIA review window (5.8) may be open: this step changes neither Caddy nor the API.
grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" || { echo "REKEY_NOT_DONE: the staff screens are off (STAFFMAIN first); nothing changed"; exit 1; }
[ -f "$L/rekey-staff-key.mjs" ] || { echo "REKEY_NOT_DONE: the tools folder does not carry rekey-staff-key.mjs (the upload's tools-folder swap first); nothing changed"; exit 1; }
[ "$(psqlq "SELECT COALESCE((SELECT auth_method FROM pg_hba_file_rules WHERE error IS NULL AND type = 'local' AND database && ARRAY['all', 'debateai'] AND user_name && ARRAY['all', 'debateai_prod_staff_recovery'] ORDER BY rule_number LIMIT 1), 'none')" || true)" = scram-sha-256 ] || { echo "REKEY_NOT_DONE: the database's pg_hba.conf does not admit debateai_prod_staff_recovery on the local socket with scram-sha-256 (REKEYCHECK says the same), so the tool cannot connect; adding the line is a reviewed change: ask; nothing changed"; exit 1; }
UA=$(systemctl is-active debateai-preview-team-unlock || true)
if [ "$(systemctl show -p ExecStart debateai-preview-team-unlock 2>/dev/null | grep -c 'PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login' || true)" != 0 ]; then
  [ "$UA" != active ] || { echo "REKEY_NOT_DONE: the team unlock runs on its fallback writer, which holds the login this step needs: run  systemctl stop debateai-preview-team-unlock , run REKEY again, then UNLOCK (step 3) right after REKEY_DONE; nothing changed"; exit 1; }
  echo "the team unlock uses its fallback writer: run UNLOCK (step 3) right after REKEY_DONE"
else
  [ "$UA" = active ] || { echo "REKEY_NOT_DONE: the team tools are locked: run UNLOCK (step 3) until it ends with UNLOCK_DONE, then REKEY again; nothing changed"; exit 1; }
fi
read -r -p 'The sign-in code your browser shows under Current session (8 characters): ' SC
SC=$(printf '%s' "$SC" | tr -d '[:space:]' | tr 'A-F' 'a-f')
[[ "$SC" =~ ^[0-9a-f]{8}$ ]] || { echo "REKEY_NOT_DONE: a sign-in code is eight characters, digits and the letters a to f (step 2); nothing changed"; exit 1; }
echo "arming the permit (up to a minute; the tool checks the release before it opens the database login)"
RC=0; OUT=$( ( ulimit -c 0; lc rekey-staff-key.mjs arm-owner "$SC" ) 2>/dev/null ) || RC=$?
EV=$(jq -r '.event // empty' <<<"$OUT" 2>/dev/null || true); RR=$(jq -r '.roleReset' <<<"$OUT" 2>/dev/null || true)
at() { TZ=Europe/Bucharest date -d "$1" '+%H:%M:%S Bucharest time' 2>/dev/null || echo "$1"; }
CL=''; if [ "$RR" = false ]; then if lc unlock-team-tools.mjs reset >/dev/null 2>&1; then CL='the staff recovery login had stayed open; it is closed now'; else CL='the staff recovery login stayed open and closing it failed too (it stops working by itself within three minutes)'; fi; fi
if [ "$EV" != PREVIEW_STAFF_REKEY_ARMED ]; then
  R=$(jq -r '.reason // empty' <<<"$OUT" 2>/dev/null || true)
  case "${R:-none}" in
    STAFF_REKEY_KEY_PRESENT) W='the Owner account already has a staff key that works under this name: there is nothing to arm; go to step 6';;
    STAFF_REKEY_SESSION_REQUIRED) W='no open sign-in of the Owner account has this code: read it again in your browser (step 2; signing in again changes it), then run REKEY again';;
    STAFF_REKEY_PERMIT_ACTIVE) W='a permit is armed already and not used: do step 5 now, or wait until it ends (15 minutes after it was armed) and run REKEY again';;
    STAFF_REKEY_TARGET_INVALID) W='the database has no single active Owner account in good standing (active, e-mail verified, authenticator on, not held, not being deleted): ask';;
    STAFF_JIT_OPEN_REFUSED) W='the staff recovery login could not be opened (another tool may hold it): wait three minutes and run REKEY again; if it says this twice, ask';;
    STAFF_SCREENS_OFF|STAFF_NAME_MISMATCH|PUBLIC_NAME_REFUSED) W='the API file does not have the staff screens on under the name the API answers as: STAFFMAIN first';;
    *) W='ask, and give this line';;
  esac
  echo "REKEY_NOT_DONE: ${R:-the tool gave no answer}: $W; no permit was armed${CL:+; $CL}"
  exit 1
fi
echo "the permit is armed for $(jq -r .name <<<"$OUT"): it is for the sign-in with code $SC, which began at $(at "$(jq -r .signInStartedAt <<<"$OUT")"), and it ends at $(at "$(jq -r .expiresAt <<<"$OUT")")"
OS=$(jq -r '.otherSignIns // 0' <<<"$OUT" 2>/dev/null || echo 0); [ "$OS" = 0 ] || echo "note: the account has $OS other sign-in(s) open now; they cannot use the permit; if you do not recognise them in Settings, revoke them and change your password"
[ -z "$CL" ] || echo "$CL"
[ "$RR" = true ] || [ "$CL" = 'the staff recovery login had stayed open; it is closed now' ] || { echo "REKEY_NOT_DONE: the permit is armed, but the staff recovery login is not closed: ask before step 5"; exit 1; }
echo REKEY_DONE
exit 0
```

Expect the question for the code, the `the permit is armed` line, then `REKEY_DONE`. The line names the code you
typed, when that sign-in began and when the permit ends: do step 5 before then. A `note:` line about other sign-ins
is not an error; step 2 says what to do about one you do not recognise.

After `REKEY_NOT_DONE`, the line says what to do, and whether a permit was armed. The script closes the staff
recovery login itself if the tool left it open, and says so.

**5. Enrol the key (within 15 minutes, in the browser of step 2, without signing out in between).**
1. Open https://dezbatere.ro/admin/team, the Team page (type the address: no menu links to it). Open **Security key
   setup and recovery** (Configurarea cheilor și recuperarea accesului).
2. Under **Register security key** (Înregistrează cheia de securitate), type your **Account password** (Parola
   contului) and the **Authenticator code** (Codul autentificatorului) your phone shows now. Press **Register
   security key**.
3. The browser asks for the key: plug it in and touch it. If the browser asks which key or passkey to use, choose
   the hardware key (USB security key), not the phone or the computer.
4. The page shows **Verified public credential ID: …** (ID-ul public al cheii verificate: …). The key is enrolled.
   The key-change alert goes to the security alert address set on this server.

If the page says "The action could not be completed…" (Acțiunea nu a putut fi finalizată…): the password or the code
was wrong, or the permit ended, was used already, or is for another sign-in than this browser's. Try once more with the next
authenticator code (each try needs a new one). If it says the same, run REKEY again (step 4): it arms a new permit,
or says one is still armed (then wait until its end time). If the page says "Security key verification unavailable
or cancelled…", the browser's key prompt was closed or timed out; the permit is used by then, so run REKEY again. If
the page says "Team tools are locked…" (Instrumentele echipei sunt blocate…), run UNLOCK (step 3) and try again
within the 15 minutes. If the browser refuses the key twice, ask.

**6. Verify, and check.** On the Team page press **Verify security key for team access** (Verifică cheia de
securitate pentru accesul echipei) and touch the key. The page now shows your access. In **Public debates under
review** (Dezbateri publice în curs de verificare), paste a published debate's public link into **The debate's public
link** (Linkul public al dezbaterii) and press **Open** (Deschide): check that it shows **Hide now** (Ascunde acum),
and do not press it unless you mean it. While no debate is public (before 5.9), skip this check. Then, as root, run STAFFDB (1.6)
again: expect a key line for the new name, like `dezbatere.ro https://dezbatere.ro 1`, beside the old one for the
test name.

**7. Lock the team tools again** when you are done: `systemctl stop debateai-preview-team-unlock` (they lock by
themselves after one hour anyway).

**Good to know.**
- The permit is for one key. To add a second key under dezbatere.ro afterwards, use the Team page with the first one
  (it asks you to touch the key you already have). REKEY refuses while a key works under the name.
- The key you enrolled on the test name stays in the database. It works again if the site ever goes back to the test
  name (NAME5), and it is no use to anyone on dezbatere.ro.
- Another staff member needs the same permit, named by their account id and their own sign-in code
  (`rekey-staff-key.mjs arm-user <id> <code>`): ask.
- While a permit is armed and unused (15 minutes at most), the rule "a new staff key needs the server's operator"
  rests on the permit and on the website's own server process, as it does for a person's very first staff key.
- If you lose the key and no key works under the name, this is not the step: REKEY refuses while the database still
  holds the lost key as working. Ask.
- **To confirm on the server:** STAFFMAIN and REKEY were tested on throwaway files, against a test database and with
  stand-ins for the server's parts, not on this server. Three things only the server can show: that the API starts
  with the staff screens on under dezbatere.ro (STAFFMAIN puts the file back if it does not; with the staff screens
  left on through the rename that first start is NAME3, and the way out is NAME5, 5.1b), that the database's
  `pg_hba.conf` lets the staff recovery login in on the local socket (REKEYCHECK and REKEY check it), and where the
  key-change alert mail arrives. The first time, do each step slowly, and ask if a line differs from the ones above.

### 5.8 The NETOPIA review window (the public pages without the password)

NETOPIA approves card payments only after it has looked at https://dezbatere.ro in public, with no password, and made
a test payment. This step lets anyone read the public pages of dezbatere.ro. Everything else keeps asking for the site
password: sign-in, sign-up, debates and buying. 5.8b says what to check on the open site, and when to ask NETOPIA.
On a release that carries it, part 6b opens the whole site instead, with no password anywhere; while 6b is open the
window is not needed and stays closed (REVIEW_CLOSE comes before PWOFF1).

**Before you start:** do 5.8a first, on your Mac (below REVIEW_CLOSE): REVIEW_MACTEST must end with
`REVIEW_MACTEST_DONE` both times, on the recorded file and on the copy of the server's live Caddyfile. Then check: NAME4 passed and you did the checks by hand of 5.4; billing is on (`/pricing`
exists); the site password is on; no upload is running. Do 5.7 (your staff key) first if you can: STAFFMAIN restarts
the API, and with the window open the open pages would show an error meanwhile.

**What opens, for reading only:** the home page, `/pricing`, `/terms` and `/privacy` (with their versions pages),
`/legal`, `/cookies`, `/providers`, `/ai-transparency`, `/privacy/us-health-data`, `/cancel` and `/withdraw`, and the
files these pages load (scripts, fonts, the icon, the ANPC badge). NETOPIA's logo needs nothing from the window: the
visitor's browser loads it from NETOPIA's own server. The form on `/cancel` works too: it mails a link only to an
account that has a plan. While the window is open, every answer tells search engines not to list the page.

**For whom:** a browser that sends no site password and holds no sign-in cookie of this site. You and the team, once
you type the password, see the site exactly as before.

**What stays behind the password:** sign-in, sign-up, password reset, the checkout, Settings, every debate (published
ones too), help, the staff screens and the rest of the API. A visitor who presses Log in, Start, a plan's button or
Settings gets the browser's password box; its Cancel shows an empty page. Tell NETOPIA this (5.8b).

**What does not change:** NETOPIA's payment notices, the HTTPS rule, the API, the website and their settings. While
payments run on NETOPIA's sandbox, the home page and the plans page keep their test-mode note ("Test mode: payments on
this site are not real…").

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# REVIEW_OPEN: the NETOPIA review window. On dezbatere.ro a stranger may read the public pages and send the two /cancel requests without the site password; everything else still asks for it. Every check runs before the change; Caddy restarts (about a second); then about a hundred checks from outside, and on any failed check the file before comes back. Run again while the window is open, it only checks and changes nothing.
TS=$(date -u +%Y%m%dT%H%M%SZ); U=https://dezbatere.ro
# The review window's marks, and how its lines come out again (the same lines in REVIEW_OPEN, REVIEW_CLOSE, PWON and REVIEW_MACTEST).
RV=/root/preview-archive/main-site/review; RK=$RV/Caddyfile.before-window; RW=$RV/Caddyfile.window
WB='# review window begin: the public pages answer strangers without the site password; REVIEW_CLOSE takes these lines out'; WE='# review window end'
wopen() { grep -qE 'review_locked|review_quiet|review window begin' "$1"; }
wstrip() { awk -v b="$WB" -v e="$WE" '{ t = $0; sub(/^[ \t]+/, "", t) } t == b { s = 1; n++; next } s && t == e { s = 0; next } s { next } t == "basic_auth @review_locked {" { print substr($0, 1, length($0) - length(t)) "basic_auth {"; c++; next } { print } END { if (n != 1 || s || c != 1) exit 1 }' "$1"; }
# What the window opens. A stranger is a request that sends no password and no site cookie. A stranger may read the public pages and the files they load (GET or HEAD, the raw request line exactly one of these addresses, with at most a plain query) and send the two /cancel requests (POST, exactly these two addresses). Raw means as sent: no dot segment, no double slash, no capital letter and no escaped slash can turn a closed address into an open one.
PAT='^(/|/pricing|/terms|/terms/versions|/terms/versions/[0-9a-f]+|/privacy|/privacy/versions|/privacy/versions/[0-9a-f]+|/privacy/us-health-data|/legal|/cookies|/providers|/ai-transparency|/cancel|/withdraw|/icon[.]svg|/consumer-protection/anpc-sal[.]png|/payment-marks/(netopia|visa|mastercard)[.]svg|/_next/static(/([A-Za-z0-9_~-]|%5[BbDd])([A-Za-z0-9._~-]|%5[BbDd])*)+)([?][A-Za-z0-9._~%+=&-]*)?$'
STRANGER='{http.request.header.Authorization} == "" && !({http.request.header.Cookie}.matches("(?i)__host-debateai-"))'
PAGE='({http.request.method} == "GET" || {http.request.method} == "HEAD") && {http.request.orig_uri}.matches("'"$PAT"'")'
CANCEL='{http.request.method} == "POST" && ({http.request.orig_uri} == "/api/v1/billing/cancel-link" || {http.request.orig_uri} == "/api/v1/billing/cancel-by-token")'
QUIETURI='{http.request.header.RSC} == "1" || {http.request.orig_uri} == "/api/v1/session" || {http.request.orig_uri} == "/api/v1/geo/availability" || {http.request.orig_uri} == "/favicon.ico" || {http.request.orig_uri} == "/apple-touch-icon.png" || {http.request.orig_uri} == "/apple-touch-icon-precomposed.png"'
PUB="$STRANGER && (($PAGE) || ($CANCEL))"
QUIET="$STRANGER && ($QUIETURI) && !($PAGE)"
wlines() {
  printf '%s%s\n' "$1" "$WB" \
    "$1" 'header X-Robots-Tag "noindex, nofollow"' \
    "$1" '# A stranger'"'"'s background request for a closed address (a Next.js page request, the account and help checks, the browser'"'"'s own icon requests) gets a plain 401 without the password box, so no box opens over a public page.' \
    "$1" '@review_quiet expression `'"$QUIET"'`' \
    "$1" 'respond @review_quiet 401' \
    "$1" '# The password below is skipped only for a stranger reading a public page or its files, or sending one of the two /cancel requests.' \
    "$1" '@review_locked not expression `'"$PUB"'`' \
    "$1" "$WE" \
    "$1" 'basic_auth @review_locked {'
}
# The robots header the Caddyfile may send already (the same lines in REVIEW_OPEN, REVIEW_MACTEST, PWOFF1 and PWOFF2). It prints none; group, when the one robots line is exactly X-Robots-Tag "noindex, nofollow" in a plain header group after the password, inside the dezbatere.ro block (a server's own file can have it from when the server was set up); or other, for any other robots line, which every step refuses.
robots() { awk '{ t = $0; sub(/^[ \t]+/, "", t) } $0 == "dezbatere.ro {" { s = 1 } s && $0 == "}" { s = 0 } s && t ~ /^basic_auth([ \t]|$)/ { a = 1 } s && g && t == "}" { g = 0 } tolower(t) ~ /x-robots-tag/ { n++; if (s && a && g && t == "X-Robots-Tag \"noindex, nofollow\"") k++ } s && a && t == "header {" { g = 1 } END { print (n == 0 ? "none" : (n == 1 && k == 1 ? "group" : "other")) }' "$1"; }
code() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$@" || true; }
heads() { { curl -s -o /dev/null -m 15 -D - "$@" || true; } | tr -d '\r' | tr 'A-Z' 'a-z'; }
box() { heads "$@" | grep -c '^www-authenticate: basic' || true; }
body() { curl -s -m 15 "$@" || true; }
BAD=''; bad() { echo "CHECK_FAILED: $1"; BAD=yes; }
# The probes, from this server to its own public name, without the password unless a line says otherwise.
probes() {
  local P X CC ST V SC D
  # Open to a stranger.
  for P in / '/?tab=public' /pricing '/pricing?country=RO' /terms '/terms?lang=ro' /terms/versions /privacy '/privacy?lang=ro' /privacy/versions /privacy/us-health-data /legal /cookies /providers /ai-transparency /cancel /withdraw /icon.svg /consumer-protection/anpc-sal.png; do [ "$(code "$U$P")" = 200 ] || bad "$P does not answer 200 without the password"; done
  [ "$(code -I "$U/terms")" = 200 ] || bad "HEAD /terms does not answer 200"
  [ "$(code -H 'Cookie: debateai.locale=ro' "$U/terms")" = 200 ] || bad "the language cookie closes /terms"
  [ "$(body -H 'Accept-Language: ro-RO,ro;q=0.9' "$U/" | grep -c '<html lang="ro"' || true)" -gt 0 ] || echo "LOOK: a browser that prefers Romanian does not get the home page in Romanian (the window does not decide this): ask before you write to NETOPIA"
  for P in / '/?tab=public'; do [ "$(body "$U$P" | grep -c 'data-landing-section' || true)" -gt 0 ] || bad "$P is not the signed-out home page"; done
  [ "$(body -H 'x-matched-path: /settings' -H 'x-invoke-path: /settings' "$U/" | grep -c 'data-landing-section' || true)" -gt 0 ] || bad "a routing header changes what / shows"
  ST=$(body "$U/terms" | grep -oE '/_next/static/[A-Za-z0-9._~/%-]+[.]js' | head -n 1 || true); [ -n "$ST" ] && [ "$(code "$U$ST")" = 200 ] || bad "the first script of /terms does not load"
  for D in terms privacy; do V=$(body "$U/$D/versions" | grep -oE "/$D/versions/[0-9a-f]{64}" | head -n 1 || true)
    if [ -n "$V" ]; then [ "$(code "$U$V")" = 200 ] || bad "$V does not answer 200"; else echo "no earlier $D text is linked from /$D/versions (nothing to check there)"; fi; done
  [ "$(code -H 'RSC: 1' "$U/terms")" != 401 ] || bad "a Next.js page request for /terms is stopped by the window"
  # Closed: the password box.
  for P in /login /sign-up /settings /settings/security /checkout '/checkout?plan=PLUS' /checkout/return /new /v4 /help /export /admin/team /recover /reset-password /enroll-mfa /verify-email /social/complete /public/debate/x /debate/x /robots.txt /TERMS /Pricing /terms/ /terms. '/terms%2e' '/pricing?next=/settings' /api/v1/billing/plans /api/v1/auth/sessions /api/v1/session/ /payment-marks/amex.svg /_next/data/x/settings.json '/_next/image?url=%2Ficon.svg&w=64&q=75'; do [ "$(code "$U$P")" = 401 ] && [ "$(box "$U$P")" = 1 ] || bad "$P does not ask for the password"; done
  # Written to look like an open address, sent exactly as written: never answered by the website.
  for P in //terms /terms/../login /settings/.. '/settings/%2e%2e' '/settings%2F..' /_next/static/../../login '/_next/static/%2e%2e/%2e%2e/login' '/_next/static/..%2f..%2flogin' '/pricing/..%2Fsettings' '/terms/versions/..%2F..%2Fsettings'; do CC=$(code --http1.1 --path-as-is "$U$P"); case "$CC" in 401|400) ;; *) bad "$P, sent as written, answers $CC";; esac; done
  CC=$(code --http1.1 --request-target "$U/terms" "$U/"); case "$CC" in 401|400) ;; *) bad "the absolute form of /terms answers $CC";; esac
  # Every other method, and every other POST.
  for X in POST PUT DELETE PATCH OPTIONS; do [ "$(code -X "$X" --data '' "$U/terms")" = 401 ] || bad "$X /terms does not ask for the password"; done
  [ "$(code -X POST -H 'Next-Action: 0' -H 'Content-Type: text/plain' --data '[]' "$U/pricing")" = 401 ] || bad "a server-action POST to /pricing does not ask for the password"
  for P in /api/v1/auth/login /api/v1/auth/register /api/v1/support/messages /api/v1/billing/checkout '/api/v1/billing/cancel-link?x=1'; do [ "$(code -X POST -H 'Content-Type: application/json' -H "Origin: $U" --data '{}' "$U$P")" = 401 ] || bad "POST $P does not ask for the password"; done
  # A request that is not a stranger's goes to the password.
  SC="__Host-debateai-session=$(printf 'A%.0s' $(seq 1 43))"
  [ "$(code -H "Cookie: $SC" "$U/?tab=public")" = 401 ] && [ "$(box -H "Cookie: $SC" "$U/?tab=public")" = 1 ] || bad "a made-up session cookie on /?tab=public does not ask for the password"
  [ "$(code -H 'Cookie: debateai.locale=ro; __host-DebateAI-x=1' "$U/terms")" = 401 ] || bad "a site cookie written in other letters does not ask for the password"
  [ "$(code -H 'Authorization: Basic Og==' "$U/")" = 401 ] || bad "a wrong password on / is not refused"
  # A stranger's background requests: a plain 401 without the password box.
  for P in /api/v1/session /api/v1/geo/availability /favicon.ico; do [ "$(code "$U$P")" = 401 ] && [ "$(box "$U$P")" = 0 ] || bad "$P is not a plain 401"; done
  [ "$(code -H 'RSC: 1' "$U/settings")" = 401 ] && [ "$(box -H 'RSC: 1' "$U/settings")" = 0 ] || bad "a Next.js page request for /settings is not a plain 401"
  [ "$(code -H 'RSC: 1' -H 'Next-Router-Prefetch: 1' "$U/new")" = 401 ] && [ "$(box -H 'RSC: 1' -H 'Next-Router-Prefetch: 1' "$U/new")" = 0 ] || bad "a Next.js prefetch of /new is not a plain 401"
  # The two /cancel requests reach the API, which refuses an empty form (400); another site is refused (403).
  for P in /api/v1/billing/cancel-link /api/v1/billing/cancel-by-token; do CC=$(code -X POST -H 'Content-Type: application/json' -H "Origin: $U" --data '{}' "$U$P")
    case "$CC" in 400) ;; 2??|401|000|5??) bad "an empty /cancel request to $P answers $CC, not the API's 400";; *) echo "LOOK: an empty /cancel request to $P answers $CC, not 400: send the /cancel form by hand (5.8)";; esac; done
  [ "$(code -X POST -H 'Content-Type: application/json' -H 'Origin: https://example.invalid' --data '{}' "$U/api/v1/billing/cancel-link")" = 403 ] || bad "a /cancel request from another site is not refused"
  # No open answer sets a site cookie; the robots and HTTPS headers.
  for P in / /pricing /terms /cancel; do [ "$(heads "$U$P" | grep -c '^set-cookie: __host-debateai-' || true)" = 0 ] || bad "$P sets a site cookie"; done
  [ "$(heads -X POST -H 'Content-Type: application/json' -H "Origin: $U" --data '{}' "$U/api/v1/billing/cancel-link" | grep -c '^set-cookie: __host-debateai-' || true)" = 0 ] || bad "the /cancel request sets a site cookie"
  [ "$(heads "$U/" | grep -cx 'x-robots-tag: noindex, nofollow' || true)" = 1 ] || bad "/ does not send the robots header exactly once"
  [ "$(heads "$U/" | grep '^strict-transport-security:' || true)" = 'strict-transport-security: max-age=31536000' ] || bad "/ sends another HTTPS-only header (or two)"
  # What the window must leave as it was.
  [ "$(notify "$HOST")" = "$(cat "$M/name/notify-code.before-dezbatere")" ] || bad "a NETOPIA notice is not passed through as before"
  [ "$(code "$U/readyz")" = 404 ] || bad "/readyz is not refused"
  [ "$(code http://127.0.0.1:3090/readyz)" = 200 ] || bad "the edge's readiness"
}
[ "$HOST" = dezbatere.ro ] || { echo "REVIEW_OPEN_NOT_DONE: the API answers as $HOST; the window opens only on dezbatere.ro, after NAME4; nothing changed"; exit 1; }
if wopen "$C"; then
  [ -s "$RW" ] && cmp -s "$C" "$RW" || { echo "REVIEW_OPEN_NOT_DONE: the window's lines are in the live Caddyfile, but it is not the file REVIEW_OPEN put in place: run REVIEW_CLOSE, then ask"; exit 1; }
  echo "the review window is open already: checks only, nothing changes"
  probes
  [ -z "$BAD" ] || { echo "REVIEW_OPEN_NOT_DONE: a check failed with the window open (above): run REVIEW_CLOSE now, then ask"; exit 1; }
  echo REVIEW_OPEN_DONE; exit 0
fi
cmp -s "$C" "$M/name/Caddyfile.main" || { echo "REVIEW_OPEN_NOT_DONE: the live Caddyfile is not the one NAME3 put in place (the password off, a sign-up rule, or another change since); nothing changed: ask"; exit 1; }
[ ! -e "$M/password/Caddyfile.before-open" ] && [ ! -e "$M/password/Caddyfile.open" ] || { echo "REVIEW_OPEN_NOT_DONE: PWOFF1's copies exist (the password is off, or PWOFF1 ran without PWOFF2): PWON first; nothing changed"; exit 1; }
[ -s "$M/name/notify-code.before-dezbatere" ] || { echo "REVIEW_OPEN_NOT_DONE: NAME1's notice code is missing; nothing changed: ask"; exit 1; }
for P in / /terms /login; do [ "$(code "$U$P")" = 401 ] || { echo "REVIEW_OPEN_NOT_DONE: $P does not ask for the site password now; nothing changed: ask at once"; exit 1; }; done
for P in /pricing /cancel /withdraw /terms /privacy /legal; do [ "$(code "http://127.0.0.1:$UIP$P")" = 200 ] || { echo "REVIEW_OPEN_NOT_DONE: the website does not serve $P (billing off, or the website is down); nothing changed: ask"; exit 1; }; done
[ "$(grep -cx 'dezbatere\.ro {' "$C" || true)" = 1 ] && [ "$(grep -cE '^[[:space:]]*basic_auth([[:space:]]|$)' "$C" || true)" = 1 ] && [ "$(grep -cE '^[[:space:]]*basic_auth \{$' "$C" || true)" = 1 ] || { echo "REVIEW_OPEN_NOT_DONE: the live Caddyfile has not one dezbatere.ro block with one basic_auth line, written basic_auth {; nothing changed: ask"; exit 1; }
DL=$(grep -nx 'dezbatere\.ro {' "$C" | cut -d: -f1); DE=$(awk -v s="$DL" 'NR > s && $0 == "}" { print NR; exit }' "$C"); BL=$(grep -nE '^[[:space:]]*basic_auth \{$' "$C" | cut -d: -f1)
[ -n "$DE" ] && [ "$BL" -gt "$DL" ] && [ "$BL" -lt "$DE" ] || { echo "REVIEW_OPEN_NOT_DONE: the basic_auth line is not inside the dezbatere.ro block; nothing changed: ask"; exit 1; }
[ "$(sed -n "$((BL - 1))p" "$C" | sed 's/^[[:space:]]*//')" = 'respond @wrongOrigin "ORIGIN_REFUSED" 403' ] && [ "$(sed -n "$((BL + 1))p" "$C" | sed 's/^[[:space:]]*//')" = '{$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}' ] || { echo "REVIEW_OPEN_NOT_DONE: the lines around basic_auth are not the recorded ones (the origin check before it, the caddy.env pair inside it); nothing changed: ask"; exit 1; }
I=$(sed -n "${BL}p" "$C" | sed -E 's/^([[:space:]]*).*$/\1/'); [ -n "$I" ] || { echo "REVIEW_OPEN_NOT_DONE: the basic_auth line has no indentation; nothing changed: ask"; exit 1; }
# A robots header the file sends already must be exactly the window's own value, in the header group after the password: the window's line then sets the same header again, and it is still sent once (the probes check it).
[ "$(robots "$C")" != other ] || { echo "REVIEW_OPEN_NOT_DONE: the live Caddyfile has a robots line other than X-Robots-Tag \"noindex, nofollow\" in the header group after the password; nothing changed: ask"; exit 1; }
install -d -o root -g root -m 0700 "$RV"
[ ! -e "$RK" ] && [ ! -e "$RW" ] || { echo "REVIEW_OPEN_NOT_DONE: copies of an earlier window are in $RV; nothing changed: run REVIEW_CLOSE (it moves them aside), then REVIEW_OPEN again"; exit 1; }
cp -p "$C" "$RK"
stop() { rm -f "$RK" "$RW" "$RW.lines" "$RW.undo"; echo "REVIEW_OPEN_NOT_DONE: $1; nothing changed"; exit 1; }
wlines "$I" > "$RW.lines"
awk -v n="$BL" -v f="$RW.lines" 'NR == n { while ((getline l < f) > 0) print l; next } { print }' "$RK" > "$RW"
chmod 0644 "$RW"
diff "$RK" "$RW" || true
[ "$(diff "$RK" "$RW" | grep -c '^[0-9]' || true)" = 1 ] && [ "$(diff "$RK" "$RW" | sed -n 's/^<[[:space:]]*//p')" = 'basic_auth {' ] && [ "$(diff "$RK" "$RW" | sed -n 's/^>[[:space:]]*//p')" = "$(sed 's/^[[:space:]]*//' "$RW.lines")" ] || stop "the window's file does not change exactly the basic_auth line and add the window's lines before it"
{ wstrip "$RW" > "$RW.undo" && cmp -s "$RW.undo" "$RK"; } || stop "taking the window's lines out again does not give back today's Caddyfile byte for byte"
cad validate --config "$RW" --adapter caddyfile >/dev/null 2>&1 || stop "caddy validate refused the window's file"
O1=$(order "$RK" "$HOST" || true); O2=$(order "$RW" "$HOST" || true)
echo "handlers, before: $O1"; echo "handlers, window: $O2"
[ "$(grep -o authentication <<<"$O1" | grep -c . || true)" = 1 ] && [ "$O2" = "${O1/authentication/headers > static_response > authentication}" ] || stop "the window's file changes the handler order beyond its two new handlers"
AX=$(cad adapt --config "$RW" --adapter caddyfile 2>/dev/null | jq -r --arg h "$HOST" 'def ex: if type == "object" then .expr else . end; [.apps.http.servers[].routes[] | select(.match[0].host[0] == $h) | .. | objects | select(has("handle"))] as $r | [$r[] | select(any(.handle[]?; .handler? == "authentication"))] as $a | [$r[] | select(any(.handle[]?; .handler? == "static_response" and ((.status_code // "") | tostring) == "401"))] as $q | if ($a | length) == 1 and ($a[0].match | length) == 1 and ($a[0].match[0] | keys) == ["not"] and ($a[0].match[0].not | length) == 1 and ($a[0].match[0].not[0] | keys) == ["expression"] and ($q | length) == 1 and ($q[0].match | length) == 1 and ($q[0].match[0] | keys) == ["expression"] then ($a[0].match[0].not[0].expression | ex), ($q[0].match[0].expression | ex) else "SHAPE" end' || true)
[ "$AX" = "$PUB"$'\n'"$QUIET" ] || stop "Caddy does not read the window's two rules exactly as written"
cmp -s "$C" "$RK" || stop "the live Caddyfile changed while this ran"
rm -f "$RW.undo"
back() {
  { install -o root -g root -m 0644 "$RK" "$C.new" && mv "$C.new" "$C" && cmp -s "$RK" "$C"; } || { echo "REVIEW_OPEN_NOT_DONE: $1, and the Caddyfile before could not be put back (it is $RK): run REVIEW_CLOSE now, then ask at once"; exit 1; }
  systemctl restart caddy || true; sleep 3
  [ "$(systemctl is-active caddy || true)" = active ] && [ "$(code "$U/")" = 401 ] && [ "$(code "$U/terms")" = 401 ] || { echo "REVIEW_OPEN_NOT_DONE: $1; the Caddyfile before is back, but Caddy is not active on it or / and /terms do not ask for the password: the site may be DOWN: ask at once"; exit 1; }
  mv "$RK" "$RK.failed-$TS"; mv "$RW" "$RW.failed-$TS"; rm -f "$RW.lines"
  echo "REVIEW_OPEN_NOT_DONE: $1; the Caddyfile before is back, and every page asks for the password again"; exit 1
}
{ install -o root -g root -m 0644 "$RW" "$C.new" && mv "$C.new" "$C" && cmp -s "$RW" "$C"; } || back "the window's file was not put in place"
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
[ "$(systemctl is-active caddy || true)" = active ] || back "Caddy did not start on the window's file"
probes
[ -z "$BAD" ] || back "a check failed (above)"
rm -f "$RW.lines"
HP=$(body "$U/")
echo "NETOPIA's logo on the open home page: $(grep -oE 'src="https://mny[.]ro/np-black-0[.]svg[?]id=[0-9]+"' <<<"$HP" | grep -c . || true) time(s) for the light theme, $(grep -oE 'src="https://mny[.]ro/np-white-0[.]svg[?]id=[0-9]+"' <<<"$HP" | grep -c . || true) for the dark (1 and 1: shown; 0 and 0: this release has no logo id: ask before you enrol the point of sale, 5.8b)"
echo "the plans page shows the test-mode note: $(body "$U/pricing" | grep -c 'Test mode:' || true) time(s)"
echo "open now to strangers: the home page, /pricing, Terms and Privacy with their versions, /legal, /cookies, /providers, /ai-transparency, /privacy/us-health-data, /cancel and /withdraw, their files, and the /cancel form"
echo REVIEW_OPEN_DONE
exit 0
```

Expect the diff (one `< basic_auth {` line and the window's lines), the two handler lines, and a line that says nothing
is linked from `/terms/versions` (its one entry, version 1.0, is `/terms` itself). Then three information lines:
NETOPIA's logo `1 time(s) for the light theme, 1 for the dark`; the test-mode note `1` or more `time(s)` while payments
are on NETOPIA's sandbox (0 once real payments are on, 7.6); what is open now. Then `REVIEW_OPEN_DONE`. A 0 for either
logo, or for the note while payments are on the sandbox: ask before 5.8b. A `LOOK:` line changes nothing: read it, and
ask before you write to NETOPIA. On a later run, with the window open, expect `the review window is open already: checks
only, nothing changes`, the `/terms/versions` line and `REVIEW_OPEN_DONE`.

The live Caddyfile may send the robots header already: a server's own file can have `X-Robots-Tag "noindex, nofollow"`
in the `header {` group after the `basic_auth` block, from when the server was set up. REVIEW_OPEN goes on then: the
window's own robots line sets the same value, and the probes check that `/` sends it once. Any other robots line in the
file stops REVIEW_OPEN before it changes anything.

If it says `REVIEW_OPEN_NOT_DONE`, read the reason:
- On the first run (the window was closed), a failed check puts the file before back, and every page asks for the
  password again. Ask.
- On a later run (it printed `the review window is open already`), nothing changes and the window stays open, with a
  check failing. Run REVIEW_CLOSE at once, then ask.

**Then by hand**, in a private window that never had the site password: Chrome and Safari on the Mac, and the phone
on mobile data.
1. Open https://dezbatere.ro. You must see no password box: not while the page loads, not while you scroll, and not
   in the next minute.
2. Open every page link in the footer, and the Privacy Policy's versions page (`/privacy/versions`) with its one entry,
   version 1.0 (its Read link; no earlier version exists yet, and the page says so). Each opens with no password box,
   except Settings (Setări), which shows the password box as Log in does. The phone and
   e-mail links open your phone and mail apps; the NETOPIA, ANPC and DB-IP links open those sites. **Report a problem**
   (Raportați o problemă) is no page: it opens your mail program with a draft to the company's address, as does the
   **Tell us** (Scrieți-ne) link in the home page's Beta sentence.
3. Look at the page's language: Romanian if your browser's first language is Romanian, English otherwise. Then choose
   another language with the language button at the bottom of the page: the page comes back in that language, and the
   next page you open stays in it.
4. Accept or decline the cookie bar: it goes away, and no password box appears.
5. Press Log in: exactly one password box; its Cancel shows an empty page.
6. On `/pricing`, press a plan's button: the password box.
7. On `/cancel`, send your own address (one the mail plan reaches). The page says "If a plan exists for this address,
   we've sent a link." (in Romanian: "Dacă există un abonament pentru această adresă, am trimis un link."). The mail
   comes only if that account has a plan.
8. In a normal window, with the password: sign in and open Settings. Everything is as before.

If a password box appears by itself: write down the page you were on and what you had just done, press Cancel, run
REVIEW_CLOSE, then ask, with those two facts.

**Then try both ways back once:** REVIEW_CLOSE, then REVIEW_OPEN; PWON, then REVIEW_OPEN. Each ends with its `…_DONE`
line.

**Running REVIEW_OPEN again** while the window is open changes nothing: it only runs the checks (a minute or two). Run
it after a later upload, once SB13b has passed and you have changed the first line of
`/root/preview-archive/main-site/names.sh` to the new upload (end of 3.0); after PWNEW; and every morning while
NETOPIA reviews.

**Closing the window:** REVIEW_CLOSE, below, or PWON (8.4), which closes it too. Both work at any time, even during an
upload. When the contract is signed, ask NETOPIA whether it still needs to see the site without the password. Close
the window when it says no, and at the latest before part 8 or part 9.

```sh
set -euo pipefail
# REVIEW_CLOSE: the NETOPIA review window closed: its lines come out of the live Caddyfile and Caddy restarts (about a second); every page asks for the site password again. It reads no names file, so it works at any time, even during an upload.
C=/etc/debateai-v3-preview/public/Caddyfile; TS=$(date -u +%Y%m%dT%H%M%SZ)
# The review window's marks, and how its lines come out again (the same lines in REVIEW_OPEN, REVIEW_CLOSE, PWON and REVIEW_MACTEST).
RV=/root/preview-archive/main-site/review; RK=$RV/Caddyfile.before-window; RW=$RV/Caddyfile.window
WB='# review window begin: the public pages answer strangers without the site password; REVIEW_CLOSE takes these lines out'; WE='# review window end'
wopen() { grep -qE 'review_locked|review_quiet|review window begin' "$1"; }
wstrip() { awk -v b="$WB" -v e="$WE" '{ t = $0; sub(/^[ \t]+/, "", t) } t == b { s = 1; n++; next } s && t == e { s = 0; next } s { next } t == "basic_auth @review_locked {" { print substr($0, 1, length($0) - length(t)) "basic_auth {"; c++; next } { print } END { if (n != 1 || s || c != 1) exit 1 }' "$1"; }
# Closing the window (the same lines in REVIEW_CLOSE and PWON): its lines come out of the live Caddyfile, the result is compared with the copy REVIEW_OPEN kept, put in place, and Caddy restarts. If Caddy does not start, the file with the window comes back.
wclose() {
  local S=$RV/Caddyfile.without-window-$TS L=$RV/Caddyfile.with-window-$TS P
  install -d -o root -g root -m 0700 "$RV"
  { wstrip "$C" > "$S" && ! wopen "$S" && [ "$(grep -cE '^[[:space:]]*basic_auth \{$' "$S" || true)" = 1 ]; } || { echo "$1_NOT_DONE: the window's lines do not come out of the live Caddyfile cleanly (edited by hand?); nothing changed, the window is still open: ask at once"; exit 1; }
  if [ -s "$RK" ] && cmp -s "$S" "$RK"; then echo "without the window, the Caddyfile is the one before REVIEW_OPEN, byte for byte"
  elif [ -s "$RK" ]; then echo "without the window, the Caddyfile differs from the copy REVIEW_OPEN kept; only the window's lines come out. The differences:"; diff "$RK" "$S" || true
  else echo "the copy REVIEW_OPEN kept is missing; only the window's lines come out"; fi
  cp -p "$C" "$L"
  { install -o root -g root -m 0644 "$S" "$C.new" && mv "$C.new" "$C" && cmp -s "$S" "$C"; } || { echo "$1_NOT_DONE: the Caddyfile without the window was not put in place (it is $S; Caddy was not restarted, the window is still open): ask at once"; exit 1; }
  systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
  if [ "$(systemctl is-active caddy || true)" != active ]; then
    { install -o root -g root -m 0644 "$L" "$C.new" && mv "$C.new" "$C"; } || true; systemctl restart caddy || true; sleep 3
    echo "$1_NOT_DONE: Caddy did not start without the window; the file with the window is back and Caddy is $(systemctl is-active caddy || true) (active: the window is still open; anything else: the site is DOWN): ask at once"; exit 1
  fi
  for P in / /terms /login; do [ "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://dezbatere.ro$P" || true)" = 401 ] || { echo "$1_NOT_DONE: Caddy runs without the window, but https://dezbatere.ro$P does not ask for the password: ask at once"; exit 1; }; done
  for P in "$RK" "$RW"; do if [ -e "$P" ]; then mv "$P" "$P.closed-$TS"; fi; done
  echo "the review window is closed: every page asks for the site password again"
}
if ! wopen "$C"; then for F in "$RK" "$RW"; do if [ -e "$F" ]; then mv "$F" "$F.closed-$TS"; fi; done; echo "the review window is not open; nothing changed"; echo REVIEW_CLOSE_DONE; exit 0; fi
wclose REVIEW_CLOSE
echo REVIEW_CLOSE_DONE
exit 0
```

Expect `without the window, the Caddyfile is the one before REVIEW_OPEN, byte for byte`, then
`the review window is closed: every page asks for the site password again`, then `REVIEW_CLOSE_DONE`. If it shows
differences instead, something changed the Caddyfile while the window was open: the window is closed anyway, and the
change is kept. Ask. The file with the window stays in `/root/preview-archive/main-site/review/` as
`Caddyfile.with-window-<time>`.

**While the window is open:**
- NAME5, PWOFF1 and SIGNUPS refuse: close the window first.
- PWNEW, ASKS_OPEN, ASKS_CLOSE, MAIL_CLOSE, PAY_SWITCH and PAY_BACK work as written: they check the password on the
  Log in page, which the window never opens.
- REKEYCHECK, STAFFMAIN and REKEY (5.7) work as written: they never touch Caddy. NAME2, NAME3, STAFFOFF and STAFFON
  refuse, as they do whenever the site answers as dezbatere.ro.
- CLOSED says `NOT CLOSED: the site password: the NETOPIA review window is open (REVIEW_CLOSE, 5.8)`.
- A later upload leaves the window as it is (5.6). Do not upload while NETOPIA is reviewing.

### 5.8a Trying the window on the Mac first (REVIEW_MACTEST)

On the Mac, in Terminal: run `brew install caddy` once, then `caddy version`, and write down what it prints. On the
server, run `/usr/bin/caddy version`. If the two differ, go on: REVIEW_OPEN repeats the Caddy checks on the server and
stops before any change if they fail there. In the upload folder (1.8, step 1), `git rev-parse HEAD` must print the
commit you uploaded (SB1's `REV`), and `git status --porcelain` must print nothing; if not, ask. If the website runs on your Mac, stop it first: it uses ports 3100 and
3200, which the test needs. Save the block below the way you save a server step, but on the Mac, outside the project
folder: `rm -f ~/review-mactest.sh; nano ~/review-mactest.sh`, paste, Ctrl-O, Enter, Ctrl-X. Then run
`bash ~/review-mactest.sh <the full path of the dialectical-engine folder>`. Expect `file checks passed: …`, the
handler lines, `ok` lines, and `REVIEW_MACTEST_DONE`. Any `FAIL` or `REVIEW_MACTEST_NOT_DONE`: do not open the window
on the server; ask.

That run tries the file this guide records and rebuilds. The server's own file can differ from it (its indentation, a
header group that sends the robots header already, Caddy's own rule for the payment marks), and REVIEW_OPEN changes the
server's file. So run it a second time, on a copy of the server's live Caddyfile, after NAME4 and before REVIEW_OPEN:
1. On the server, as root: `sha256sum /etc/debateai-v3-preview/public/Caddyfile`. Write down the first eight characters.
2. On the Mac, in Terminal: `ssh <PREVIEW_SSH> 'sudo -n cat /etc/debateai-v3-preview/public/Caddyfile' > ~/Caddyfile.live`
   (your ssh name of 1.8, step 2), then `shasum -a 256 ~/Caddyfile.live`. Its first eight characters must be the ones
   you wrote down; if not, take the copy again. The file holds no secret: only the names of the values in `caddy.env`
   (`{$PREVIEW_BASIC_AUTH_USER}`, `{$PREVIEW_BASIC_AUTH_HASH}`, `{$PREVIEW_ACME_EMAIL}`) and the path of the edge
   secret's file, never the values. Still, keep it on the Mac only, outside the project folder.
3. Run `bash ~/review-mactest.sh <the full path of the dialectical-engine folder> ~/Caddyfile.live`. Expect
   `the file under test: …Caddyfile.live …`, the same lines as above, and `REVIEW_MACTEST_DONE`. Any `FAIL` or
   `REVIEW_MACTEST_NOT_DONE`: do not open the window; ask.

The copy is tested exactly as it is, with two local changes in the test's own folder: the global `admin off` line is
followed by local ports and a local certificate authority, and root's payment-mark folder is a stand-in file. Where the
server's file serves the three payment marks itself (Caddy's own rule, from root's folder), the test expects
`/payment-marks/netopia.svg` from that stand-in; where it passes them to the website, from the website.

```bash
#!/usr/bin/env bash
# REVIEW_MACTEST: the review window tried on the Mac, before the server. The recorded dezbatere.ro Caddyfile is rebuilt with the kit's own caddy-slots.mjs and NAME2's rename; given a copy of the server's live Caddyfile as the second argument, that copy is tested instead. REVIEW_OPEN's lines are added by the same lines of code, and REVIEW_OPEN's file checks run. Then Caddy validates and adapts both files, and a local Caddy in front of two echo servers is probed with curl: with the window, without it, and after its lines come out again. Everything is written in a new temporary folder, removed at the end; nothing is installed or trusted.
set -euo pipefail
REPO=$(cd "${1:?usage: bash review-mactest.sh <the dialectical-engine folder> [a copy of the live Caddyfile of the server]}" && pwd)
LIVE=${2:-}
nd() { echo "REVIEW_MACTEST_NOT_DONE: $1"; exit 1; }
T=$(mktemp -d); CP=''; UPS=''; FAILS=0
cleanup() { if [ -n "$CP" ]; then kill "$CP" 2>/dev/null || true; fi; for P in $UPS; do kill "$P" 2>/dev/null || true; done; rm -rf "$T"; }
trap cleanup EXIT
# The review window's marks, and how its lines come out again (the same lines in REVIEW_OPEN, REVIEW_CLOSE, PWON and REVIEW_MACTEST).
RV=/root/preview-archive/main-site/review; RK=$RV/Caddyfile.before-window; RW=$RV/Caddyfile.window
WB='# review window begin: the public pages answer strangers without the site password; REVIEW_CLOSE takes these lines out'; WE='# review window end'
wopen() { grep -qE 'review_locked|review_quiet|review window begin' "$1"; }
wstrip() { awk -v b="$WB" -v e="$WE" '{ t = $0; sub(/^[ \t]+/, "", t) } t == b { s = 1; n++; next } s && t == e { s = 0; next } s { next } t == "basic_auth @review_locked {" { print substr($0, 1, length($0) - length(t)) "basic_auth {"; c++; next } { print } END { if (n != 1 || s || c != 1) exit 1 }' "$1"; }
# What the window opens. A stranger is a request that sends no password and no site cookie. A stranger may read the public pages and the files they load (GET or HEAD, the raw request line exactly one of these addresses, with at most a plain query) and send the two /cancel requests (POST, exactly these two addresses). Raw means as sent: no dot segment, no double slash, no capital letter and no escaped slash can turn a closed address into an open one.
PAT='^(/|/pricing|/terms|/terms/versions|/terms/versions/[0-9a-f]+|/privacy|/privacy/versions|/privacy/versions/[0-9a-f]+|/privacy/us-health-data|/legal|/cookies|/providers|/ai-transparency|/cancel|/withdraw|/icon[.]svg|/consumer-protection/anpc-sal[.]png|/payment-marks/(netopia|visa|mastercard)[.]svg|/_next/static(/([A-Za-z0-9_~-]|%5[BbDd])([A-Za-z0-9._~-]|%5[BbDd])*)+)([?][A-Za-z0-9._~%+=&-]*)?$'
STRANGER='{http.request.header.Authorization} == "" && !({http.request.header.Cookie}.matches("(?i)__host-debateai-"))'
PAGE='({http.request.method} == "GET" || {http.request.method} == "HEAD") && {http.request.orig_uri}.matches("'"$PAT"'")'
CANCEL='{http.request.method} == "POST" && ({http.request.orig_uri} == "/api/v1/billing/cancel-link" || {http.request.orig_uri} == "/api/v1/billing/cancel-by-token")'
QUIETURI='{http.request.header.RSC} == "1" || {http.request.orig_uri} == "/api/v1/session" || {http.request.orig_uri} == "/api/v1/geo/availability" || {http.request.orig_uri} == "/favicon.ico" || {http.request.orig_uri} == "/apple-touch-icon.png" || {http.request.orig_uri} == "/apple-touch-icon-precomposed.png"'
PUB="$STRANGER && (($PAGE) || ($CANCEL))"
QUIET="$STRANGER && ($QUIETURI) && !($PAGE)"
wlines() {
  printf '%s%s\n' "$1" "$WB" \
    "$1" 'header X-Robots-Tag "noindex, nofollow"' \
    "$1" '# A stranger'"'"'s background request for a closed address (a Next.js page request, the account and help checks, the browser'"'"'s own icon requests) gets a plain 401 without the password box, so no box opens over a public page.' \
    "$1" '@review_quiet expression `'"$QUIET"'`' \
    "$1" 'respond @review_quiet 401' \
    "$1" '# The password below is skipped only for a stranger reading a public page or its files, or sending one of the two /cancel requests.' \
    "$1" '@review_locked not expression `'"$PUB"'`' \
    "$1" "$WE" \
    "$1" 'basic_auth @review_locked {'
}
# The robots header the Caddyfile may send already (the same lines in REVIEW_OPEN, REVIEW_MACTEST, PWOFF1 and PWOFF2). It prints none; group, when the one robots line is exactly X-Robots-Tag "noindex, nofollow" in a plain header group after the password, inside the dezbatere.ro block (a server's own file can have it from when the server was set up); or other, for any other robots line, which every step refuses.
robots() { awk '{ t = $0; sub(/^[ \t]+/, "", t) } $0 == "dezbatere.ro {" { s = 1 } s && $0 == "}" { s = 0 } s && t ~ /^basic_auth([ \t]|$)/ { a = 1 } s && g && t == "}" { g = 0 } tolower(t) ~ /x-robots-tag/ { n++; if (s && a && g && t == "X-Robots-Tag \"noindex, nofollow\"") k++ } s && a && t == "header {" { g = 1 } END { print (n == 0 ? "none" : (n == 1 && k == 1 ? "group" : "other")) }' "$1"; }
# 1. The recorded live file of the test name (LIVE_PREVIEW in tests/unit/preview-release-caddy-slots.test.ts).
EDGE='header_up X-Debateai-Edge-Secret {file./etc/debateai-v3-preview/ui-edge.caddy.secret}'
printf '%b\n' '# Protected preview only.' '{' '\temail {$PREVIEW_ACME_EMAIL}' '\tadmin off' '\tauto_https disable_redirects' '\tlog {' '\t\toutput discard' '\t}' '}' '' \
  'v3-preview.dezbatere.ro {' '\ttls {' '\t\tprotocols tls1.2 tls1.3' '\t}' '\troute {' \
  '\t\t@wrongHost not host v3-preview.dezbatere.ro' '\t\trespond @wrongHost "NOT_FOUND" 404' \
  '\t\t@netopia_notify {' '\t\t\tmethod POST' '\t\t\tpath /api/v1/billing/netopia/notify' '\t\t}' \
  '\t\thandle @netopia_notify {' '\t\t\trequest_body {' '\t\t\t\tmax_size 1MB' '\t\t\t}' '\t\t\treverse_proxy 127.0.0.1:3100 {' \
  '\t\t\t\theader_up Host v3-preview.dezbatere.ro' '\t\t\t\theader_up X-Forwarded-For {remote_host}' '\t\t\t\theader_up X-Forwarded-Proto https' "\t\t\t\t$EDGE" '\t\t\t\theader_up -Authorization' '\t\t\t}' '\t\t}' \
  '\t\t@wrongOrigin expression `{http.request.header.Origin} != "" && {http.request.header.Origin} != "https://v3-preview.dezbatere.ro"`' \
  '\t\trespond @wrongOrigin "ORIGIN_REFUSED" 403' '\t\tbasic_auth {' '\t\t\t{$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}' '\t\t}' \
  '\t\theader {' '\t\t\tCache-Control "no-store"' '\t\t\t-Server' '\t\t}' '\t\trequest_body {' '\t\t\tmax_size 1MB' '\t\t}' \
  '\t\treverse_proxy 127.0.0.1:3100 {' '\t\t\theader_up Host v3-preview.dezbatere.ro' '\t\t\theader_up X-Forwarded-For {remote_host}' '\t\t\theader_up X-Forwarded-Proto https' "\t\t\t$EDGE" '\t\t\theader_up -Authorization' '\t\t}' \
  '\t}' '}' '' 'http://v3-preview.dezbatere.ro {' '\tredir https://v3-preview.dezbatere.ro{uri} 308' '}' > "$T/Caddyfile.recorded"
# 2. The two slots, by the kit's own code (the release guide's T). PM2's payment-marks rule is not added (this guide's uploads skip PM2); a server that has it from an earlier upload is tried with its live copy, the second argument.
cat > "$T/build.mjs" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const [repo, dir] = process.argv.slice(2);
const slots = await import(`${repo}/deploy/preview-release/v1/caddy-slots.mjs`);
writeFileSync(`${dir}/Caddyfile.two-slot`, slots.transformCaddyfile(readFileSync(`${dir}/Caddyfile.recorded`, 'utf8')));
JS
zsh -lic "node '$T/build.mjs' '$REPO' '$T'" || nd "the kit's caddy-slots.mjs did not build the two-slot file"
# 3. NAME2: the rename and the HTTPS header group (MAIN-SITE.md 5.2); the result stands for NAME3's Caddyfile.main.
sed 's/v3-preview\.dezbatere\.ro/dezbatere.ro/g' "$T/Caddyfile.two-slot" > "$T/Caddyfile.renamed"
awk '{print} $0=="dezbatere.ro {"{n++; print "\theader {"; print "\t\tStrict-Transport-Security \"max-age=31536000\""; print "\t\t-Server"; print "\t}"} END{if(n!=1)exit 1}' "$T/Caddyfile.renamed" > "$T/Caddyfile.main" || nd "the renamed file has not exactly one dezbatere.ro block"
# The copy of the server's live Caddyfile, when given, is the file under test instead: it is the file REVIEW_OPEN reads, and it may differ from the recorded one (its indentation, a header group, Caddy's own payment-marks rule).
if [ -n "$LIVE" ]; then
  [ -f "$LIVE" ] && [ -s "$LIVE" ] || nd "$LIVE is not a file with something in it: give the copy of the server's live Caddyfile (5.8a)"
  cp "$LIVE" "$T/Caddyfile.main"
  echo "the file under test: $LIVE (the copy of the server's live Caddyfile)"
else
  echo "the file under test: the recorded file, rebuilt"
fi
# 4. REVIEW_OPEN's lines, by the same code, and REVIEW_OPEN's file checks.
C=$T/Caddyfile.main; RK=$T/Caddyfile.before-window; RW=$T/Caddyfile.window; HOST=dezbatere.ro
cp -p "$C" "$RK"
[ "$(grep -cx 'dezbatere\.ro {' "$RK" || true)" = 1 ] && [ "$(grep -cE '^[[:space:]]*basic_auth([[:space:]]|$)' "$RK" || true)" = 1 ] && [ "$(grep -cE '^[[:space:]]*basic_auth \{$' "$RK" || true)" = 1 ] || nd "the file has not one dezbatere.ro block with one basic_auth line, written basic_auth { (a copy from before NAME3?)"
BL=$(grep -nE '^[[:space:]]*basic_auth \{$' "$RK" | cut -d: -f1); DL=$(grep -nx 'dezbatere\.ro {' "$RK" | cut -d: -f1); DE=$(awk -v s="$DL" 'NR > s && $0 == "}" { print NR; exit }' "$RK")
[ -n "$DE" ] && [ "$BL" -gt "$DL" ] && [ "$BL" -lt "$DE" ] || nd "the basic_auth line is not inside the dezbatere.ro block"
[ "$(sed -n "$((BL - 1))p" "$RK" | sed 's/^[[:space:]]*//')" = 'respond @wrongOrigin "ORIGIN_REFUSED" 403' ] && [ "$(sed -n "$((BL + 1))p" "$RK" | sed 's/^[[:space:]]*//')" = '{$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}' ] || nd "the lines around basic_auth are not the recorded ones"
RB=$(robots "$RK"); [ "$RB" != other ] || nd "the file has a robots line other than X-Robots-Tag \"noindex, nofollow\" in the header group after the password: REVIEW_OPEN refuses it too"
echo "the robots header in the file before the window: $RB (none, or group: sent already by the header group after the password)"
I=$(sed -n "${BL}p" "$RK" | sed -E 's/^([[:space:]]*).*$/\1/')
wlines "$I" > "$RW.lines"
awk -v n="$BL" -v f="$RW.lines" 'NR == n { while ((getline l < f) > 0) print l; next } { print }' "$RK" > "$RW"
[ "$(diff "$RK" "$RW" | grep -c '^[0-9]' || true)" = 1 ] && [ "$(diff "$RK" "$RW" | sed -n 's/^<[[:space:]]*//p')" = 'basic_auth {' ] && [ "$(diff "$RK" "$RW" | sed -n 's/^>[[:space:]]*//p')" = "$(sed 's/^[[:space:]]*//' "$RW.lines")" ] || nd "the window's file is not exactly the window's lines"
wstrip "$RW" > "$T/Caddyfile.undone" && cmp -s "$T/Caddyfile.undone" "$RK" || nd "taking the window's lines out again does not give back the file before, byte for byte"
wopen "$RW" && ! wopen "$RK" || nd "wopen does not tell the two files apart"
echo "file checks passed: one diff hunk ($(diff "$RK" "$RW" | grep '^[0-9]')), and the undo gives back the file before, byte for byte"
# 5. Caddy itself.
for P in caddy jq python3 curl lsof openssl; do command -v "$P" >/dev/null || nd "$P is missing (the file checks above passed): for caddy or jq, run brew install $P, then run this again; for anything else, ask"; done
for PORT in 3090 3100 3200 18080 18443; do if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then nd "port $PORT is in use (stop the local website first)"; fi; done
echo "caddy on this Mac: $(caddy version) (compare with /usr/bin/caddy version on the server)"
TP=$(openssl rand -hex 16)
export PREVIEW_BASIC_AUTH_USER=mactest PREVIEW_ACME_EMAIL=test@example.invalid XDG_CONFIG_HOME="$T/config" XDG_DATA_HOME="$T/data"
PREVIEW_BASIC_AUTH_HASH=$(caddy hash-password --plaintext "$TP"); export PREVIEW_BASIC_AUTH_HASH
cad() { caddy "$@"; }
order() { cad adapt --config "$1" --adapter caddyfile 2>/dev/null | jq -r --arg h "$2" '[.apps.http.servers[].routes[] | select(.match[0].host[0]==$h) | .handle[] | .. | objects | select(has("handler")) | .handler] | join(" > ")'; }
for F in "$RK" "$RW"; do cad validate --config "$F" --adapter caddyfile >/dev/null 2>&1 || { cad validate --config "$F" --adapter caddyfile 2>&1 | tail -n 5; nd "caddy validate refused $(basename "$F")"; }; done
O1=$(order "$RK" "$HOST" || true); O2=$(order "$RW" "$HOST" || true); echo "handlers, before: $O1"; echo "handlers, window: $O2"
[ "$(grep -o authentication <<<"$O1" | grep -c . || true)" = 1 ] && [ "$O2" = "${O1/authentication/headers > static_response > authentication}" ] || nd "the handler order differs beyond the window's two handlers (REVIEW_OPEN's check must change with it)"
AX=$(cad adapt --config "$RW" --adapter caddyfile 2>/dev/null | jq -r --arg h "$HOST" 'def ex: if type == "object" then .expr else . end; [.apps.http.servers[].routes[] | select(.match[0].host[0] == $h) | .. | objects | select(has("handle"))] as $r | [$r[] | select(any(.handle[]?; .handler? == "authentication"))] as $a | [$r[] | select(any(.handle[]?; .handler? == "static_response" and ((.status_code // "") | tostring) == "401"))] as $q | if ($a | length) == 1 and ($a[0].match | length) == 1 and ($a[0].match[0] | keys) == ["not"] and ($a[0].match[0].not | length) == 1 and ($a[0].match[0].not[0] | keys) == ["expression"] and ($q | length) == 1 and ($q[0].match | length) == 1 and ($q[0].match[0] | keys) == ["expression"] then ($a[0].match[0].not[0].expression | ex), ($q[0].match[0].expression | ex) else "SHAPE" end' || true)
[ "$AX" = "$PUB"$'\n'"$QUIET" ] || { cad adapt --config "$RW" --adapter caddyfile 2>/dev/null | jq -c '.. | objects | select(has("handle")) | select(any(.handle[]?; .handler? == "authentication" or .handler? == "static_response")) | .match' || true; nd "Caddy does not read the window's two rules as written (what it reads is above; REVIEW_OPEN's check must change with it)"; }
echo "caddy validate, the handler order and the two rules: as REVIEW_OPEN expects"
# 6. Local copies: local ports, a local certificate authority that nothing trusts, the edge secret here, and a stand-in for root's payment-mark folder (Caddy's own payment-marks rule serves it in a server's live file). The global admin off line is found however it is indented.
printf 'mactest\n' > "$T/edge.secret"
mkdir -p "$T/payment-marks"; printf '%s\n' '<svg xmlns="http://www.w3.org/2000/svg"><title>mactest mark</title></svg>' > "$T/payment-marks/netopia.svg"
wstrip "$RW" > "$T/Caddyfile.after-close"
for F in before-window window after-close; do
  awk -v t="$T" '{ gsub("/etc/debateai-v3-preview/ui-edge.caddy.secret", t "/edge.secret"); gsub("/etc/debateai-v3-preview/public/payment-marks", t "/payment-marks"); print }
    $0 ~ /^[ \t]*admin off$/ { print "\tlocal_certs"; print "\tskip_install_trust"; print "\thttp_port 18080"; print "\thttps_port 18443" }' "$T/Caddyfile.$F" > "$T/local.$F"
  [ "$(grep -cx "$(printf '\t')https_port 18443" "$T/local.$F" || true)" = 1 ] || nd "the $F file has not one global admin off line, so its local copy would not get local ports"
done
# 7. Two echo servers for the two slots: 200 with the request line they received, exactly as received.
cat > "$T/echo.py" <<'PY'
import http.server, sys
class Echo(http.server.BaseHTTPRequestHandler):
    def answer(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n:
            self.rfile.read(n)
        body = ("UPSTREAM %s %s\n" % (self.command, self.path)).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)
    do_GET = do_HEAD = do_POST = do_PUT = do_DELETE = do_OPTIONS = do_PATCH = answer
    def log_message(self, *args):
        pass
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Echo).serve_forever()
PY
python3 -I "$T/echo.py" 3100 & UPS="$UPS $!"
python3 -I "$T/echo.py" 3200 & UPS="$UPS $!"
H=dezbatere.ro; B=https://dezbatere.ro:18443
start() {
  if [ -n "$CP" ]; then kill "$CP" 2>/dev/null || true; wait "$CP" 2>/dev/null || true; CP=''; fi
  caddy run --config "$T/local.$1" --adapter caddyfile > "$T/caddy-$1.log" 2>&1 & CP=$!
  for i in $(seq 1 60); do [ "$(curl -sk --resolve "$H:18443:127.0.0.1" -m 2 -o /dev/null -w '%{http_code}' "$B/readyz" || true)" = 404 ] && return 0; sleep 0.5; done
  tail -n 20 "$T/caddy-$1.log"; nd "the local Caddy did not answer on the $1 file"
}
probe() { # probe <want> <method> <path> [curl options]; want: open, mark, box, quiet, trick, refused, caddy404
  # mark: open, and answered either by the website (no payment-marks rule in the file) or by Caddy's own payment-marks rule from the stand-in file.
  local want=$1 m=$2 p=$3 c ch up; shift 3
  if [ "$m" = HEAD ]; then set -- -I "$@"; else set -- -X "$m" "$@"; fi
  : > "$T/body"; : > "$T/head"
  c=$(curl -sk --resolve "$H:18443:127.0.0.1" -m 15 -o "$T/body" -D "$T/head" -w '%{http_code}' "$@" "$B$p" || true)
  ch=$(tr -d '\r' < "$T/head" | grep -ci '^www-authenticate: basic' || true)
  up=$(head -c 9 "$T/body" || true)
  case "$want" in
    open) [ "$c" = 200 ] && { [ "$m" = HEAD ] || [ "$up" = 'UPSTREAM ' ]; } ;;
    mark) [ "$c" = 200 ] && { [ "$up" = 'UPSTREAM ' ] || cmp -s "$T/body" "$T/payment-marks/netopia.svg"; } ;;
    box) [ "$c" = 401 ] && [ "$ch" = 1 ] && [ "$up" != 'UPSTREAM ' ] ;;
    quiet) [ "$c" = 401 ] && [ "$ch" = 0 ] && [ "$up" != 'UPSTREAM ' ] ;;
    trick) { [ "$c" = 401 ] || [ "$c" = 400 ]; } && [ "$up" != 'UPSTREAM ' ] ;;
    refused) [ "$c" = 403 ] ;;
    caddy404) [ "$c" = 404 ] && [ "$up" != 'UPSTREAM ' ] ;;
    *) false ;;
  esac && { echo "ok    $want $m $p"; return 0; }
  echo "FAIL  $want $m $p: answered $c, password box $ch, $( [ "$up" = 'UPSTREAM ' ] && head -n 1 "$T/body" || echo 'not passed on')"; FAILS=$((FAILS + 1))
}
same() { # same <method> <path as sent> <request line the echo server must see>
  local got; got=$(curl -sk --resolve "$H:18443:127.0.0.1" -m 15 -X "$1" "$B$2" | head -n 1 || true)
  if [ "$got" = "UPSTREAM $1 $3" ]; then echo "ok    the website gets $3 as sent"; else echo "FAIL  the website gets '$got' for $2"; FAILS=$((FAILS + 1)); fi
}
J='Content-Type: application/json'; OR='Origin: https://dezbatere.ro'; SC="Cookie: __Host-debateai-session=$(printf 'A%.0s' $(seq 1 43))"
# 8. The window open.
start window
for P in / '/?tab=public' /pricing '/pricing?country=RO&postal_code=10001' /terms '/terms?lang=ro' /terms/versions /terms/versions/0123abcd /privacy /privacy/versions /privacy/versions/0123abcd /privacy/us-health-data /legal /cookies /providers /ai-transparency /cancel /withdraw '/icon.svg?a1b2c3' /_next/static/chunks/main-1a2b.js /_next/static/media/a34f-s.p.woff2 /_next/static/chunks/app/terms/versions/%5Bsha256%5D/page-1a2b.js /consumer-protection/anpc-sal.png '/terms?_rsc=1ld0r'; do probe open GET "$P"; done
probe open HEAD /
probe open GET /terms -H 'RSC: 1' -H 'Next-Router-State-Tree: %5B%22%22%5D'
probe open GET /terms -H 'Cookie: debateai.locale=ro'
probe mark GET /payment-marks/netopia.svg
for P in /api/v1/billing/cancel-link /api/v1/billing/cancel-by-token; do probe open POST "$P" -H "$J" -H "$OR" --data '{}'; done
probe refused POST /api/v1/billing/cancel-link -H "$J" -H 'Origin: https://example.invalid' --data '{}'
same GET '/terms?lang=ro' '/terms?lang=ro'
same GET /_next/static/chunks/app/terms/versions/%5Bsha256%5D/page-1a2b.js /_next/static/chunks/app/terms/versions/%5Bsha256%5D/page-1a2b.js
for P in /login /sign-up /settings /settings/security /checkout '/checkout?plan=PLUS' /checkout/return /new /v4 /help /export /admin/team /recover /reset-password /enroll-mfa /verify-email /social/complete /public/debate/x /debate/x /robots.txt /TERMS /Pricing /terms/ /terms. '/terms%2e' '/pricing?next=/settings' '/pricing?x=a:b' /api/v1/billing/plans /api/v1/auth/sessions /api/v1/session/ '/api/v1/session?x=1' /payment-marks/amex.svg /_next/data/x/settings.json '/_next/image?url=%2Ficon.svg&w=64&q=75' /_next/static /_next/static/; do probe box GET "$P"; done
for P in //terms /terms/../login /settings/.. '/settings/%2e%2e' '/settings%2F..' /_next/static/../../login '/_next/static/%2e%2e/%2e%2e/login' '/_next/static/..%2f..%2flogin' '/_next/static/.hidden' '/pricing/..%2Fsettings' '/terms/versions/..%2F..%2Fsettings' '/terms/versions/%2e%2e'; do probe trick GET "$P" --http1.1 --path-as-is; done
probe trick GET / --http1.1 --request-target 'https://dezbatere.ro/terms'
for X in POST PUT DELETE PATCH OPTIONS; do probe box "$X" /terms --data ''; done
probe box POST /pricing -H 'Next-Action: 0' -H 'Content-Type: text/plain' --data '[]'
for P in /api/v1/auth/login /api/v1/auth/register /api/v1/support/messages /api/v1/billing/checkout '/api/v1/billing/cancel-link?x=1'; do probe box POST "$P" -H "$J" -H "$OR" --data '{}'; done
probe box GET '/?tab=public' -H "$SC"
probe box GET /terms -H 'Cookie: debateai.locale=ro; __host-DebateAI-x=1'
probe box GET / -H 'Authorization: Basic Og=='
probe box GET /login -u 'mactest:wrong'
for P in /api/v1/session /api/v1/geo/availability /favicon.ico /apple-touch-icon.png; do probe quiet GET "$P"; done
probe quiet GET /settings -H 'RSC: 1'
probe quiet GET /new -H 'RSC: 1' -H 'Next-Router-Prefetch: 1'
probe box GET /settings -H 'RSC: 1' -H "$SC"
probe open GET /login -u "mactest:$TP"
probe open GET /settings -H 'RSC: 1' -u "mactest:$TP"
probe open GET /api/v1/session -u "mactest:$TP"
probe open POST /api/v1/billing/netopia/notify -H "$J" --data '{}'
probe caddy404 GET /readyz
RB=$(curl -skI --resolve "$H:18443:127.0.0.1" -m 15 "$B/" | tr -d '\r' | grep -ci '^x-robots-tag: noindex, nofollow$' || true)
if [ "$RB" = 1 ]; then echo "ok    the robots header, once, on /"; else echo "FAIL  the robots header on / ($RB)"; FAILS=$((FAILS + 1)); fi
# 9. The window closed: the file before it, then the file after its lines came out (byte for byte the same).
cmp -s "$T/Caddyfile.after-close" "$RK" || { echo "FAIL  the file after closing is not the file before"; FAILS=$((FAILS + 1)); }
for F in before-window after-close; do
  start "$F"
  for P in / /pricing /terms /cancel /consumer-protection/anpc-sal.png /api/v1/session /api/v1/geo/availability; do probe box GET "$P"; done
  probe box GET /settings -H 'RSC: 1'
  probe box POST /api/v1/billing/cancel-link -H "$J" -H "$OR" --data '{}'
  probe open GET /login -u "mactest:$TP"
  probe open POST /api/v1/billing/netopia/notify -H "$J" --data '{}'
  probe caddy404 GET /readyz
done
[ "$FAILS" = 0 ] || nd "$FAILS probe(s) failed (above)"
echo REVIEW_MACTEST_DONE
```

### 5.8b NETOPIA's review: the list, the point of sale, and the days after

Do this once REVIEW_OPEN ended with `REVIEW_OPEN_DONE` and the checks by hand of 5.8 passed, or once the whole site is
open with 6b (OPENCHECK ended with `OPENCHECK_DONE` and the checks by hand of 6b.2 passed). With 6b, steps 2, 4 and 5
below have their own words for it: the whole site is open, sign-up, sign-in, debates and the order page included.

**1. Check NETOPIA's list on the open site.** NETOPIA looks for each of these before it approves. Open every address
in a private window that never had the site password, from a Romanian connection (on the phone: mobile data).

| NETOPIA asks for | Where | What must be there |
|---|---|---|
| a description of the service | https://dezbatere.ro/ | what the site does and how, and the line "Abonamentele plătite pornesc de la … pe lună, cu taxe incluse" (English: "Paid plans start at … a month, tax included") |
| the plans, with prices in RON and "Taxe incluse" | https://dezbatere.ro/pricing | in Romanian, each paid plan's price in RON, followed by "Taxe incluse (…%, …)" |
| company details and contact | the footer of every page above, and https://dezbatere.ro/legal (footer: "Datele firmei și contact", Company details and contact) | the company's name, registered office, CUI, trade register number, telephone and e-mail |
| the Terms | https://dezbatere.ro/terms (footer: "Termenii serviciului") | the whole text, version 1.0 |
| who sells | https://dezbatere.ro/terms, section 1 | its first sentence names the company that runs the site |
| the Privacy Policy (GDPR) | https://dezbatere.ro/privacy (footer: "Politica de confidențialitate (GDPR)") | the whole text |
| delivery, cancellation and refunds | https://dezbatere.ro/terms#legal-section-12 (footer: "Livrarea serviciului", Delivery) and https://dezbatere.ro/cancel (footer: "Anularea unui abonament", Cancel a plan) | Terms section 12 names delivery, cancelling and refunds; `/cancel` shows its form |
| withdrawal | https://dezbatere.ro/withdraw (footer: "Retragere din contract", Withdraw from contract) | the two steps in Settings, the e-mail route and the model form |
| HTTPS | every address above | the browser's padlock; http://dezbatere.ro goes on to https://dezbatere.ro |
| NETOPIA's logo | the footer of the home page and of `/pricing` | NETOPIA's picture with the Visa and Mastercard marks; a click opens netopia-payments.com |
| the ANPC badge | the footer of every page above ("Protecția consumatorilor", Consumer protection) | ANPC's badge; a click opens ANPC's page |

If anything is missing or wrong: stop here and ask. Do not tick NETOPIA's boxes yet.

**2. The question for NETOPIA.** Buying is closed to strangers: the checkout, sign-up and sign-in ask for the site
password. Ask NETOPIA how it wants to make its test payment while that is so: for example, you pay while NETOPIA
watches, or NETOPIA's tester gets the site password from you in a one-to-one message (never in a group, an e-mail
thread or a chat with Claude). If NETOPIA's tester gets the password, change it before part 7 (PWNEW, 7.0), as after a
friends' test; the tester's sign-up also needs open mail (4.3). A plan NETOPIA's tester buys here is a sandbox plan
like a friend's. Withdraw it with WITHDRAWOTHER (3.3) within 14 days of its purchase, once NETOPIA says its test is
over and you have told its tester, and close its records before part 7 (7.1). After 14 days only NETOPIA's tester can
cancel it (Settings or `/cancel`), and part 7 waits until they do. You may ask this early, even before the upload, so
the answer comes in time.

**With 6b open,** nobody needs the site password, NETOPIA's tester included, so PWNEW (7.0) is not needed on NETOPIA's
account. Its tester signs up like anyone else (the bot check, the e-mail link, a second factor). Its test payment can
go one of three ways; ask NETOPIA which it wants:
- (a) You list its tester. Ask NETOPIA for the address its tester will sign up with, and for the billing country the
  tester will choose. Once the tester has signed up, allow that address on the Team page (6b.3), with the team tools
  unlocked; nothing restarts. On a release before the Team page's list, run BUYERS (6b.3b) with that address instead,
  in the same quiet minutes as the other accounts you list (each BUYERS run is one restart of the API). The tester
  then buys with the test card the test-mode note prints, with no password anywhere.
- (b) You pay with your own listed account while NETOPIA watches.
- (c) NETOPIA accepts that buying stays closed until the contract. Its tester then sees the whole order page and, at
  the last button, the sentence "Buying a plan is open only to invited accounts for now. You can keep using the Free
  plan."

Never list the tester when it will buy as a Romanian buyer: a sandbox purchase as a Romanian buyer blocks real
payments for about 14.6 hours (its SmartBill job, 3.2). If NETOPIA's tester must buy from Romania, ask first. A plan
the tester buys is a sandbox plan like a friend's: withdraw it with WITHDRAWOTHER (3.3) within 14 days of its
purchase, once NETOPIA says its test is over and you have told its tester; then take the tester off the list
(**Remove** on the Team page, 6b.3; or BUYERS with `W=remove` for a tester BUYERS listed, 6b.3b).

**3. Enrol the point of sale.** Only now, with the window open or with 6b open: NETOPIA may look at once, and must not
find a password box. In NETOPIA's admin, enrol the point of sale for https://dezbatere.ro and tick its conditions. NETOPIA then checks
your identity, checks your shop's profile (it looks at the open site), and sends the contract.

**4. What to tell NETOPIA** (in your own words, with the enrolment):
- The site is https://dezbatere.ro.
- The home page, the plans with prices, the Terms and the Privacy Policy (each with its versions page), the company
  details and contact page, the cookie policy, the AI model providers, the AI transparency notice, Cancel and Withdraw
  can be read without a password.
- With the review window: sign-in, account creation, debates and the order page ask for an access password for now.
  They open to everyone later, after the contract.
- With 6b, instead of the line above: no page of the site asks for an access password; anyone can create an account,
  sign in, read the debates and use the Free plan, and every signed-in account can see the whole order page. While
  payments are in test mode, only accounts we invite can buy a plan; any other account is told so at the last button,
  and nothing is charged. Say which of the three ways of step 2 you offer for NETOPIA's test payment.
- Card payments run on NETOPIA's test system (sandbox) until NETOPIA switches live payments on, and the home page and
  the plans page say so: "Mod de test: plățile de pe acest site nu sunt reale și nu se iau bani" (in English: "Test
  mode: payments on this site are not real and no money is taken").
- A browser that prefers Romanian gets the site in Romanian; the language button at the bottom of every page
  switches.
- The site is in Beta, and the home page says so; **Raportați o problemă** (Report a problem), in every page's footer,
  opens the visitor's own mail program with a draft to the company's e-mail address.
- Your question of step 2, if NETOPIA has not answered it yet.

**5. While NETOPIA reviews** (days):
- The window stays open, across days and Caddy restarts.
- Upload nothing (5.6).
- Run REVIEW_OPEN again every morning while NETOPIA reviews. With the window open it only checks. With 6b open, run
  OPENCHECK (6b.4) instead.
- A friends' test (part 6) may run: friends use the site password. With 6b open there is no part 6: friends sign up
  like anyone else, and you list the ones who may buy (6b.3).
- NETOPIA's test payment goes as NETOPIA answered step 2. If its answer needs a step this document does not have, ask.

**6. After NETOPIA's approval and the signed contract:** NETOPIA switches live and saved-card (recurring) payments on.
Then come the NETOPIA checks of 1.1 and part 7, on a later day. Every part-7 script works with the window open, and at
PAY_SWITCH the test-mode note leaves the open pages by itself. Close the window as 5.8 says ("Closing the window").
With 6b open, close it before part 7 as 6b.6 says: PAY_SWITCH refuses while the site is open or asks are open.

### 5.9 Public debates: publishing switched on, behind the site password

**In plain words.** Today nothing on this server can become public. The API file's `PUBLICATION_ENABLED` line is not
`true`, and the file names no key for public debates, so the API says `[PUBLICATION_CUSTODY_NOT_CONFIGURED]` in its
journal at every start. The home page's **Public** tab (Dezbateri publice) stays empty, no finished Free debate goes
public, nobody can press Publish, and the Report button has nothing to act on.

Switching publishing on changes this for the people who know the site password:
- A Free debate **started from then on** goes public by itself once it has finished, when the end-of-debate check and
  then the AI check for publication allow it (5.1b says how each works). The line its asker already sees under the
  question box, "On the Free plan your question and its debate are public. Don't include personal details." (În planul
  Gratuit, întrebarea dvs. și dezbaterea ei sunt publice. Nu includeți date personale.), becomes true.
- An owner can make any other debate of theirs public with **Publish…** (Publicați…) on its older page `/debate/<id>`,
  after a tick box and a security check. No V4 page has this button.
- Public debates are listed on the home page's **Public** tab and read at `/public/debate/<id>`. On one, a signed-in
  person can dig, write a report on their own allowance, and press **Report a problem** (Raportați o problemă).
- A dig on a public debate goes public too: once its AI check allows it, it changes that public page for everyone,
  under the digger's pseudonym, and it cannot be taken back (the Terms say so). A dig of a private debate stays
  private.
- More mail goes out, through the same mail plan as other account mail: statements of reasons and answers to the
  people who report (the EU's Digital Services Act asks for both), and notices to the staff. In allow-list mode (4.2)
  they reach only the four allow-listed addresses; a refused one is tried again and given up after 20 tries.
- Deleting an account keeps its public debates and takes its pseudonym off them, as the Terms say. A data export holds
  the reports the person sent.

For you, the Owner: on the Team page (`/admin/team`), **Public debates under review** (Dezbateri publice în curs de
verificare) and the reports have something to act on, with your staff key (5.7). That panel lists only the hidden
debates: to reach **Hide now** (Ascunde acum) for a public one, you paste its public link into the panel (step 7.5).
The AI checks use more of the Anthropic gate's day, and the keys of public debates live in a new key store on the
server, which a backup must hold (step 4).

**What does not change.** The site password stays on: only people who know it can read a public debate. Someone with
the password but no account sees no list on the home page, but can open a public debate whose address they have. The
NETOPIA review window (5.8) never opens a debate. Asks, payments, the mail settings, the name, and the website's and
the runner's files stay as they are. No upload is needed.

**The debates that exist already.** None of them goes public by itself, not even a Free debate that finishes after the
switch: a Free debate is marked to go public only when it is started while publishing is on. Free debates started
before the switch showed the line above, but they stay private; only their owner's Publish makes one public. A dig of
a private debate never goes public, the ones that exist already included: only a dig on a public debate changes a
public page (above).

**What cannot be undone once a debate has been public.**
- Its owner cannot take it back: the site has no "unpublish", for one debate or for all. Only staff **Hide now** (5.7),
  or the Report button's AI check when it agrees with a report (5.1b), takes it off the list and its page, and the
  end-of-debate check may delete it (5.1b).
- Anyone who read it may have kept a copy.
- Deleting its owner's account keeps it public, without the pseudonym.
- Its key stays in the key store and in every backup made after it.
- Switching publishing off (5.9b) only stops the public pages: every public debate stays recorded as public, and
  switching on again shows them again.

**Who does what.** Every server step below is yours: you run it as root, the ordinary way ("How to run a server
step"), because only you have the server. None asks you to type a key or a password: the scripts make the corpus key
and the clean-up login's password on the server, and no script shows either of them, to you or to anyone. The tries
in the browser (step 7) are yours too: they need your accounts behind the site password, and only you decide what may
become public. Claude runs nothing on the server.

**Before you start.**
- No upload is under way or being prepared: not from an upload's preparation (1.8, where SB1 copies the API file) to
  its end (part 2, step 33). PRECHECK holds the old release's files to SB1's copies, and the way back starts the old
  release from them.
- LOCKS0 (3.0) ran with this version of the guide, so the names file has publishing's helpers. Every step below stops,
  with nothing changed, without them.
- 5.7 is done: the staff screens are on, and your staff key works under the name the site answers as. Without it,
  nobody can hide a public debate by hand. PUBON refuses.
- STAFFCHECK (1.6) says `the AI check for publication and reports: on`, and AICHECK (6b.1) ends with `AICHECK_DONE`.
  Without the check nothing can pass it. PUBON refuses while it is off.
- The site password is on. PUBON refuses otherwise.

**Your decisions, before you start.**
1. Whether to switch on now at all. Once one debate has been public, the list above holds.
2. What to tell people. Those whose Free debates were started before the switch saw the line that Free debates are
   public, and theirs stay private. Anyone who digs on a public debate changes that page for everyone, under their
   pseudonym, for good, once the dig's check allows it.
3. Mail: statements of reasons and answers to reports reach a friend only in open mode (4.3), or when the friend's
   address is one of the four allow-listed ones.
4. How often to run PUBBACKUP again (step 4): each public debate's key is only on the server until the next one.
5. Whether a copy of those backups should also be kept off the server. They hold every key of the site, so that is a
   decision of its own: ask.

**1. Where the server stands (PUBCHECK).** It only reads. Run it first, and again whenever you want to know where
publishing stands.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PUBCHECK: where the server stands for public debates (read-only): the API file's publication lines, the corpus key, the key store and the API's permission to write it, the clean-up login and its line, the backup, the staff screens, the AI check, mail, the site password and what the database holds. Prints names, states, counts and yes or no, never a key, a password or an address.
declare -F pubprobe >/dev/null || { echo "PUBCHECK_NOT_DONE: the names file is from an earlier version of this guide (no pubprobe); nothing changed: run LOCKS0 (3.0) again, then PUBCHECK"; exit 1; }
TODO=''; todo() { case " $TODO " in *" $1 "*) ;; *) TODO="$TODO $1";; esac; }
first() { echo "first, elsewhere in this guide: $1"; }
BAD=''; bad() { echo "NOT AS THE CODE NEEDS: $1"; BAD=yes; }
ST=$(pubstate "$A")
case "$ST" in A) W='on';; B) W='off, with the keys kept (5.9b)';; *) W='off, nothing of it set up';; esac
echo "release $LABEL; publishing in the API file: $W (state $ST; lines: PUBLICATION_ENABLED $(grep -c '^PUBLICATION_ENABLED=' "$A" || true), CORPUS_KEK_PATH $(grep -c '^CORPUS_KEK_PATH=' "$A" || true), PUBLICATION_KEY_STORE_PATH $(grep -c '^PUBLICATION_KEY_STORE_PATH=' "$A" || true), PUBLICATION_CLEANUP_DATABASE_URL $(grep -c '^PUBLICATION_CLEANUP_DATABASE_URL=' "$A" || true))"
grep -q PUBLICATION_CLEANUP_DATABASE_URL "$CAPI/dialectical-engine/packages/register/src/runtime-environment.ts" || bad "this release does not know the publication settings"
grep -q "'CORPUS_KEK_PATH'" "$L/backup.mjs" && grep -q '^export function scramSha256Verifier' "$L/jit-creator-actor.mjs" || bad "the tools folder lacks the backup of the corpus key or the password helper (the upload's tools-folder swap)"
[ "$(grep -c '^CONTENT_ENCRYPTION_ENABLED=' "$A" || true)" = 1 ] && grep -qx 'CONTENT_ENCRYPTION_ENABLED=true' "$A" || bad "the API file does not hold CONTENT_ENCRYPTION_ENABLED=true once, and publishing needs it"
[ "$(grep -c '^PUBLICATION_ENABLED=' "$A" || true)" -le 1 ] && [ "$(grep -c '^PUBLICATION_ENABLED=' "$A" || true)" = "$(grep -cxE 'PUBLICATION_ENABLED=(true|false)' "$A" || true)" ] || bad "the API file's PUBLICATION_ENABLED line is not one line =true or =false"
[ "$(grep -c '^CORPUS_KEK_PREVIOUS_PATH=' "$A" || true)" = 0 ] || bad "the API file holds CORPUS_KEK_PREVIOUS_PATH (a change of the corpus key, which no step of this guide makes)"
for KV in "CORPUS_KEK_PATH=$KP" "PUBLICATION_KEY_STORE_PATH=$PS"; do [ "$(grep -c "^${KV%%=*}=" "$A" || true)" = 0 ] || grep -qxF "$KV" "$A" || bad "the API file's ${KV%%=*} line names another path than this guide's"; done
[ "$(dirname "$(sed -n 's/^KEK_PATH=//p' "$A")")" = "${KP%/*}" ] && [ ! -L "${KP%/*}" ] && [ "$(stat -c '%a %U' "${KP%/*}")" = "700 $AU" ] || bad "${KP%/*} is not the API's own 0700 key folder, the one its KEK_PATH names"
if [ ! -e "$KP" ]; then echo "corpus key: not made yet"; todo PUBKEYS; elif keyok; then echo "corpus key: made, as the code needs (the API's user, 0600, 32 bytes, one link, in its 0700 folder)"; else bad "the corpus key $KP is there, but is not the API user's 0600 file of 32 bytes with one link"; fi
[ -d "${PS%/*}" ] && [ ! -L "${PS%/*}" ] || bad "${PS%/*} is not a folder"
if [ ! -e "$PS" ]; then echo "key store: not made yet"; todo PUBKEYS; elif storeok; then echo "key store: made, as the code needs (the API's user and group, 0700), with $(keyfiles) publication keys in it"; else bad "the key store $PS is there, but is not the API's 0700 folder"; fi
AP=$(pubapart); [ -z "$AP" ] || bad "the corpus key or the key store is not apart from: $AP(the code refuses that)"
if storewrite; then echo "the API may write the key store: yes"; else echo "the API may write the key store: no"; todo PUBKEYS; fi
[ -s "$KF" ] && [ "$(grep -c '' "$KF")" = 2 ] && grep -qxF "CORPUS_KEK_PATH=$KP" "$KF" && grep -qxF "PUBLICATION_KEY_STORE_PATH=$PS" "$KF" || todo PUBKEYS
RB=$(pubrole) || { echo "PUBCHECK_NOT_DONE: the database is unreadable: ask"; exit 1; }
if [ -z "$RB" ]; then echo "the clean-up login: there, and the API's role check would accept its roles and grants"; else bad "the clean-up login $CLN is not as the API's role check needs ($RB): changing its grants is a reviewed step"; fi
HB=$(pubhba "$CLN" || echo unread); HR=$(pubhba debateai_prod_api_runtime || echo unread)
if [ "$HB" = "$HR" ] && [ "${HB%% *}" = scram-sha-256 ]; then echo "pg_hba.conf lets the clean-up login in as it lets the API's own login in: yes"; else bad "pg_hba.conf does not let the clean-up login in as it lets the API's own login in"; fi
echo "the clean-up login: password set $(psqlq "SELECT CASE WHEN rolpassword IS NULL THEN 'no' ELSE 'yes' END FROM pg_authid WHERE rolname = '$CLN'" || echo unread); its password ends $(psqlq "SELECT CASE WHEN rolvaliduntil IS NULL OR rolvaliduntil = 'infinity' THEN 'never' WHEN rolvaliduntil <= clock_timestamp() THEN 'already' ELSE 'at a later date' END FROM pg_roles WHERE rolname = '$CLN'" || echo unread); signed in now $(psqlq "SELECT count(*) FROM pg_stat_activity WHERE usename = '$CLN'" || echo unread)"
if grep -q '^PUBLICATION_CLEANUP_DATABASE_URL=' "$A"; then W=$(pubprobe <(grep '^PUBLICATION_CLEANUP_DATABASE_URL=' "$A") || true); echo "the API file's clean-up line, tried as the API uses it: $W"; [ "$W" = accepted ] || bad "the API file's clean-up line is not accepted"
elif [ -s "$LF" ]; then W=$(pubprobe "$LF" || true); echo "the clean-up line PUBLOGIN kept, tried as the API will use it: $W"; [ "$W" = accepted ] || todo PUBLOGIN
else echo "the clean-up line: not made yet"; todo PUBLOGIN; fi
OB=$(cat "$BF" 2>/dev/null || true)
if pubbackup "$OB"; then echo "the newest PUBBACKUP holds this corpus key and the key store: yes; publication keys made since then: $(find "$PS" -type f -name publication-key.v1.json -newer "$OB/online.sha256" 2>/dev/null | grep -c . || true)"; else echo "a PUBBACKUP that holds this corpus key and the key store: no"; todo PUBBACKUP; fi
if grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" && [ "$(staffkey || echo 0)" -ge 1 ] 2>/dev/null; then echo "the staff screens, and a working staff key of the Owner under $HOST: yes"; else first "5.7: the staff screens on, and your staff key working under $HOST (until then nobody can hide a public debate by hand)"; fi
GST=$(gs "$GAN" "$PAN" 2>/dev/null | jq -r '"\(.state), window open \(.window_open)"' 2>/dev/null || true)
if aion; then echo "the AI check for publication and reports: on, through the Anthropic gate (the gate: ${GST:-did not read}; AICHECK, 6b.1, reads more)"; else first "STAFFCHECK (1.6): the AI check for publication and reports is off, so nothing could pass it"; fi
MM=$(mailmode || true); echo "mail: ${MM:-did not read} (statements of reasons and answers to reports go out like other account mail)"
PW=$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login" || true)
if [ "$PW" = 401 ]; then echo "the site password: on"; else first "PWON (8.4): the site does not ask for the password (its Log in page answered $PW), and publishing goes on only behind it"; fi
C=$(pubcounts) || { echo "PUBCHECK_NOT_DONE: the database is unreadable: ask"; exit 1; }
read -r NS NP NE FW FP FR CO PO EV <<<"$C"
echo "the database: publications ever made $NS (public now, hidden ones included, $NP); Free debates waiting to go public $FW, gone public $FP, kept private $FR; key clean-ups waiting $CO; publications being made $PO"
T=''; for S in PUBKEYS PUBLOGIN PUBBACKUP; do case " $TODO " in *" $S "*) T="$T $S";; esac; done; [ "$ST" = A ] || T="$T PUBON"
if [ -n "$T" ]; then echo "still to do, in this order:$T"; else echo "publishing is on, and nothing of 5.9 is left to do"; fi
[ -z "$BAD" ] || { echo "PUBCHECK_NOT_DONE: something is not as the code needs (the NOT AS THE CODE NEEDS lines above); no step of 5.9 changes it: ask"; exit 1; }
echo PUBCHECK_DONE
exit 0
```

On this server today expect `publishing in the API file: off, nothing of it set up (state C; …)`, `corpus key: not made
yet`, `key store: not made yet`, `the API may write the key store: no` (or `yes`), the clean-up login `there, and the
API's role check would accept its roles and grants`, `the clean-up line: not made yet`, `still to do, in this order:
PUBKEYS PUBLOGIN PUBBACKUP PUBON`, then `PUBCHECK_DONE`. Read the other lines:
- `first, elsewhere in this guide: …` names what another part of this guide must do before PUBON: 5.7, STAFFCHECK
  and AICHECK, or PWON. PUBKEYS, PUBLOGIN and PUBBACKUP may run before it: they change nothing on the site.
- `NOT AS THE CODE NEEDS: …` means the server is not as this section expects, in a way no step here changes (for
  example the clean-up login's grants, `pg_hba.conf`, or `CONTENT_ENCRYPTION_ENABLED`). The last line is then
  `PUBCHECK_NOT_DONE`: ask, and give that line.
- `the clean-up login: password set …` says whether the login had a password before PUBLOGIN (no guide records one),
  whether it ends, and how many sessions it has now (0 before PUBON; up to 4 after it).
- `the database: …` is all 0 before the switch. After it, it counts what went public.

**2. The corpus key and the key store (PUBKEYS).** The corpus key is the one key that locks the keys of every public
debate. The script makes it as 32 random bytes, written as the API's user straight into its file, so nobody sees it:
`/etc/debateai-v3-preview/api/corpus-kek.bin`, mode `0600`, beside the API's other keys in its own `0700` folder. The
code refuses a corpus key with any other owner, mode, size or a second name (its support-keys check at start wants
exactly `0600`, also with a custody group set), and one with the bytes of another key.
The key store is an empty folder, `/var/lib/debateai-v3-preview/api/publication-keys`, the API's own, `0700`: the API
writes one key file into it for each debate that goes public. Both lie apart from every other key and store, and
outside the restore fence's folder (`…/api/restore-fence`), neither inside it nor above it: the code refuses
otherwise, and the script checks the same rule first. The API may write only the folders its unit lists; when its
unit does not list the store, the script adds a drop-in that lists it, `zzzzzzzzzz-keys-publication.conf`, and
reloads systemd. The running API is unchanged until its next start (PUBON). Run it again at any time: it never makes a
key that exists, and changes nothing that is already right.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PUBKEYS: the corpus key and the publication key store, made on the server for the API's user (nobody sees the key), apart from every other key and outside the restore fence's folder, and the API's permission to write the store from its next start. Nothing restarts; nothing on the site changes.
declare -F pubprobe >/dev/null || { echo "PUBKEYS_NOT_DONE: the names file is from an earlier version of this guide (no pubprobe); nothing changed: run LOCKS0 (3.0) again, then PUBKEYS"; exit 1; }
[ -n "${AU:-}" ] && [ "$AU" != root ] && [ -n "${AGRP:-}" ] || { echo "PUBKEYS_NOT_DONE: the names file names no API user, or root; nothing changed: ask"; exit 1; }
[ "$(dirname "$(sed -n 's/^KEK_PATH=//p' "$A")")" = "${KP%/*}" ] && [ ! -L "${KP%/*}" ] && [ "$(stat -c '%a %U' "${KP%/*}")" = "700 $AU" ] || { echo "PUBKEYS_NOT_DONE: ${KP%/*} is not the API's own 0700 key folder, the one its KEK_PATH names; nothing changed: ask"; exit 1; }
[ -d "${PS%/*}" ] && [ ! -L "${PS%/*}" ] || { echo "PUBKEYS_NOT_DONE: ${PS%/*} is not a folder; nothing changed: ask"; exit 1; }
for KV in "CORPUS_KEK_PATH=$KP" "PUBLICATION_KEY_STORE_PATH=$PS"; do [ "$(grep -c "^${KV%%=*}=" "$A" || true)" = 0 ] || grep -qxF "$KV" "$A" || { echo "PUBKEYS_NOT_DONE: the API file's ${KV%%=*} line names another path than this guide's; nothing changed: ask"; exit 1; }; done
AP=$(pubapart); [ -z "$AP" ] || { echo "PUBKEYS_NOT_DONE: the corpus key or the key store would not be apart from: $AP(the code refuses that); nothing changed: ask"; exit 1; }
[ -d "${PDROP%/*}" ] || { echo "PUBKEYS_NOT_DONE: the API's template drop-in folder is missing (this is not the template layout); nothing changed: ask"; exit 1; }
[ ! -e "$KP.new" ] || { echo "PUBKEYS_NOT_DONE: $KP.new exists (an earlier run stopped half-way); nothing changed: ask"; exit 1; }
if [ -e "$KP" ]; then
  keyok || { echo "PUBKEYS_NOT_DONE: $KP is there, but is not the API user's 0600 file of 32 bytes with one link; nothing changed: ask"; exit 1; }
  echo "corpus key: there already, as the code needs; it is never made again"
else
  runuser -u "$AU" -- /bin/sh -c 'umask 0177; set -C; head -c 32 /dev/urandom > "$1.new" && mv -n "$1.new" "$1"' sh "$KP" || { rm -f "$KP.new"; echo "PUBKEYS_NOT_DONE: the corpus key was not made: ask"; exit 1; }
  keyok || { echo "PUBKEYS_NOT_DONE: the corpus key was made, but is not the API user's 0600 file of 32 bytes with one link: ask"; exit 1; }
  echo "corpus key: made in $KP (the API's user, 0600, 32 bytes, one link); nobody saw it"
fi
for K in KEK_PATH BLIND_INDEX_KEY_PATH AUDIT_SOURCE_IP_SALT_PATH SUPPORT_KEK_PATH RECORDS_KEY_PATH; do V=$(sed -n "s/^$K=//p" "$A"); [ -z "$V" ] || ! cmp -s "$V" "$KP" || { echo "PUBKEYS_NOT_DONE: the corpus key holds the same bytes as the key $K names: ask"; exit 1; }; done
if [ -e "$PS" ]; then
  storeok || { echo "PUBKEYS_NOT_DONE: $PS is there, but is not the API's 0700 folder: ask"; exit 1; }
  echo "key store: there already, with $(keyfiles) publication keys in it"
else
  install -d -o "$AU" -g "$AGRP" -m 0700 "$PS" && storeok || { echo "PUBKEYS_NOT_DONE: the key store was not made as the API's 0700 folder: ask"; exit 1; }
  echo "key store: made in $PS (the API's user and group, 0700, empty)"
fi
if storewrite; then echo "the API may write the key store already: no drop-in needed"
else
  { ( umask 022; printf '%s\n' '# The publication key store (MAIN-SITE.md 5.9, PUBKEYS): under ProtectSystem=strict the API writes only the folders its unit names. The leading "-" keeps the unit starting where the folder does not exist. It adds this one path and nothing else.' '[Service]' "ReadWritePaths=-$PS" > "$PDROP.new" ) && mv -f "$PDROP.new" "$PDROP" && systemctl daemon-reload; } || { rm -f "$PDROP.new"; echo "PUBKEYS_NOT_DONE: the drop-in was not put in place, or the reload failed: ask"; exit 1; }
  storewrite || { echo "PUBKEYS_NOT_DONE: after the drop-in and the reload, the API's unit still does not list $PS as a write path: ask"; exit 1; }
  echo "the API may write the key store from its next start (the drop-in $PDROP; the running API is unchanged)"
fi
{ install -d -o root -g root -m 0700 "$PUB" && ( umask 077; printf 'CORPUS_KEK_PATH=%s\nPUBLICATION_KEY_STORE_PATH=%s\n' "$KP" "$PS" > "$KF.new" ) && mv -f "$KF.new" "$KF"; } || { echo "PUBKEYS_NOT_DONE: the two lines were not kept in $KF: ask"; exit 1; }
echo "the two lines for the API file are kept in $KF (PUBBACKUP and PUBON read them)"
echo PUBKEYS_DONE
exit 0
```

Expect the `corpus key: made …` and `key store: made …` lines, one line about the API's permission, the line about the
two kept lines, then `PUBKEYS_DONE`. Run again, it says `there already` for both. A `PUBKEYS_NOT_DONE` that says `nothing
changed` changed nothing; any other one: ask before anything else. The way back, before PUBON: none is needed. The key
and the empty store are read by nothing while the API file does not name them; to take the drop-in out again, ask.

**3. The clean-up login's password and its line (PUBLOGIN).** The API uses a login of its own,
`debateai_prod_api_publication_cleanup`, to destroy the key of a public debate that comes down or is deleted. The login
exists, its line in `pg_hba.conf` exists, and PUBCHECK reads whether its roles and grants are as the API's start check
needs them. No guide records that it was ever given a password, and none records how the API's other logins first got
theirs. What is known:
- each of the API's logins is one line in the API file, all of one form: the login, its password, and the server's own
  database over TLS on the server's loopback (the runner's guide, `deploy/preview-auth-dev/v1/README.md`, gives the same
  form for the runner's login);
- the one password this guide's tools set on this server, the staff recovery login's (5.7), is made on the server and
  reaches the database only as a SCRAM verifier, never as the password itself
  (`deploy/preview-lifecycle/v1/jit-creator-actor.mjs`);
- the production password tool (`pnpm db:provision-principals`) cannot run on this server, and it would change every
  login's password (the release guide's H0).

So PUBLOGIN does it the way 5.7 does:
1. makes a new random password on the server, which nobody sees or types;
2. writes the line `PUBLICATION_CLEANUP_DATABASE_URL=…`: the API's own `DATABASE_URL`, with only the login and the
   password changed, into a root-only file beside this guide's other copies (`clean-up line` below);
3. sends the database only the SCRAM verifier of that password (with the same helper as 5.7), with no end date, as
   the database's `postgres` administrator, with statement logging off for that one statement;
4. tries the line as the API will use it: as the API's user, with the release's own role check (`pubprobe`).

It changes nothing else on the login: no grant, no role. Nothing restarts, and nothing on the site changes: the API
uses the line only from PUBON on. Run again, it changes nothing while its kept line still signs in; once the API file
names the line (after PUBON), it only tries it and never changes the password.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PUBLOGIN: a new password for the clean-up login, made on the server and sent to the database only as a SCRAM verifier (nobody sees or types it), and its line for the API file, kept root-only; then the line is tried as the API will use it. Nothing restarts; nothing on the site changes.
declare -F pubprobe >/dev/null || { echo "PUBLOGIN_NOT_DONE: the names file is from an earlier version of this guide (no pubprobe); nothing changed: run LOCKS0 (3.0) again, then PUBLOGIN"; exit 1; }
[ -f "$CAPI/dialectical-engine/packages/db/src/publication.ts" ] && grep -q '^export function scramSha256Verifier' "$L/jit-creator-actor.mjs" || { echo "PUBLOGIN_NOT_DONE: this release or the tools folder lacks what this step uses (the upload, with its tools-folder swap); nothing changed: ask"; exit 1; }
RB=$(pubrole) || { echo "PUBLOGIN_NOT_DONE: the database is unreadable; nothing changed: ask"; exit 1; }
[ -z "$RB" ] || { echo "PUBLOGIN_NOT_DONE: the clean-up login is not as the API's role check needs ($RB); changing its grants is a reviewed step; nothing changed: ask"; exit 1; }
HB=$(pubhba "$CLN" || echo unread); HR=$(pubhba debateai_prod_api_runtime || echo unread)
[ "$HB" = "$HR" ] && [ "${HB%% *}" = scram-sha-256 ] || { echo "PUBLOGIN_NOT_DONE: pg_hba.conf does not let the clean-up login in as it lets the API's own login in; nothing changed: ask"; exit 1; }
if grep -q '^PUBLICATION_CLEANUP_DATABASE_URL=' "$A"; then
  W=$(pubprobe <(grep '^PUBLICATION_CLEANUP_DATABASE_URL=' "$A") || true)
  [ "$W" = accepted ] || { echo "PUBLOGIN_NOT_DONE: the API file names the clean-up login already, and its line is not accepted ($W); nothing changed: ask"; exit 1; }
  echo "the API file names the clean-up login already, and its line signs in and passes the API's role check: nothing changed"; echo PUBLOGIN_DONE; exit 0
fi
install -d -o root -g root -m 0700 "$PUB"
if [ -e "$LF" ]; then
  W=$(pubprobe "$LF" || true)
  if [ "$W" = accepted ] && [ "$(stat -c '%a %U %h' "$LF")" = "600 root 1" ]; then echo "the clean-up line is kept already, and it signs in and passes the API's role check: nothing changed"; echo PUBLOGIN_DONE; exit 0; fi
  mv "$LF" "$LF.not-accepted-$(date -u +%Y%m%dT%H%M%SZ)"; echo "the clean-up line kept before is not accepted ($W): it is set aside, and a new password is made"
fi
[ "$(psqlq "SELECT count(*) FROM pg_stat_activity WHERE usename = '$CLN'" || true)" = 0 ] || { echo "PUBLOGIN_NOT_DONE: something is signed in as the clean-up login now; nothing changed: ask"; exit 1; }
rm -f "$LF.new"
( umask 077; "$N" --input-type=module - "$A" "$LF.new" "$L/jit-creator-actor.mjs" <<'JS' | runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAtq -v ON_ERROR_STOP=1 -f - > /dev/null ) || { rm -f "$LF.new"; echo "PUBLOGIN_NOT_DONE: the password was not set (the API file's DATABASE_URL is not one line for the API's own login, or the database refused): ask"; exit 1; }
import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [api, out, actor] = process.argv.slice(-3);
const { scramSha256Verifier } = await import(pathToFileURL(actor).href);
const lines = readFileSync(api, 'utf8').split('\n').filter(line => line.startsWith('DATABASE_URL='));
if (lines.length !== 1) process.exit(2);
const url = new URL(lines[0].slice('DATABASE_URL='.length));
if (url.username !== 'debateai_prod_api_runtime') process.exit(3);
const password = randomBytes(32).toString('hex');
url.username = 'debateai_prod_api_publication_cleanup';
url.password = password;
const fd = openSync(out, 'wx', 0o600);
try { writeSync(fd, `PUBLICATION_CLEANUP_DATABASE_URL=${url.href}\n`); fsyncSync(fd); } finally { closeSync(fd); }
const verifier = scramSha256Verifier(Buffer.from(password, 'utf8'));
process.stdout.write(["SET log_statement = 'none';", 'SET log_min_duration_statement = -1;', "SET log_min_error_statement = 'panic';", "SET password_encryption = 'scram-sha-256';",
  `ALTER ROLE debateai_prod_api_publication_cleanup PASSWORD '${verifier}' VALID UNTIL 'infinity';`, ''].join('\n'));
JS
mv -n "$LF.new" "$LF"
[ ! -e "$LF.new" ] && [ "$(stat -c '%a %U %h' "$LF")" = "600 root 1" ] && [ "$(grep -c '' "$LF")" = 1 ] && grep -qE '^PUBLICATION_CLEANUP_DATABASE_URL=postgres(ql)?://' "$LF" || { echo "PUBLOGIN_NOT_DONE: the new password is set, but its line was not kept as $LF: run PUBLOGIN again (it makes another one)"; exit 1; }
W=$(pubprobe "$LF" || true)
[ "$W" = accepted ] || { echo "PUBLOGIN_NOT_DONE: the new password is set and its line kept, but the line is not accepted ($W): ask"; exit 1; }
echo "the clean-up login: a new password, never shown; its line is kept in $LF (root, 0600); it signs in as the API will, and passes the API's role check"
echo PUBLOGIN_DONE
exit 0
```

Expect the `the clean-up login: a new password …` line, then `PUBLOGIN_DONE`. The answers its try can give:
`accepted`; `the database refuses its password`; `pg_hba.conf does not let it in`; `it signs in, but the API role
check refuses it` (with a code when the check could not even read what it reads, for example `42501` for a login
without the clean-up role); `it does not connect (<code>)`. Anything but `accepted`: ask, and give the line. The password is
in the kept line only, and from PUBON on in the API file; nobody needs to know it, and no step ever prints it. The
way back, before PUBON: none is needed. Nothing uses the login until the API file names it.

**4. A backup that holds the new key and store (PUBBACKUP).** The rule: **the corpus key and the key store are in a
checked backup before the first debate goes public.** Without the corpus key, no public debate can be read again. The
nightly backup and an upload's cold copy (DR3) hold the database only. The one existing step that also copies key
stores is the online backup (`backup.mjs --online`, the release guide's SB7), which copies every database, the roles
and every key store the API files name; it runs only in a side-by-side upload, and this guide's uploads are drained.
PUBBACKUP runs that same tool, now, on the API file and the two lines PUBKEYS kept, into a new root-only folder under
`/root/preview-archive/main-site/pub/`. Nothing stops. PUBON refuses until the newest PUBBACKUP holds this very corpus
key and the store. How to check it at any time: PUBCHECK's line `the newest PUBBACKUP holds this corpus key and the key
store: yes`.

Each debate that goes public later gets its own key in the store, after this backup: PUBCHECK and PUBAFTER count the
keys made since the newest PUBBACKUP. Run PUBBACKUP again whenever you want them in a backup too, and always in an
upload's preparation (5.9a). Each run writes a new folder and deletes nothing. A backup holds every key of the site
and every database: it stays root-only on this server, and it is no off-site copy.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PUBBACKUP: the online backup (every database, the roles, and the key stores the API file and PUBKEYS's two lines name, the corpus key and the publication key store among them), each file checked, into a new root-only folder. Nothing stops; nothing on the site changes.
declare -F pubprobe >/dev/null || { echo "PUBBACKUP_NOT_DONE: the names file is from an earlier version of this guide (no pubprobe); nothing changed: run LOCKS0 (3.0) again, then PUBBACKUP"; exit 1; }
[ -s "$KF" ] && [ "$(grep -c '' "$KF")" = 2 ] && grep -qxF "CORPUS_KEK_PATH=$KP" "$KF" && grep -qxF "PUBLICATION_KEY_STORE_PATH=$PS" "$KF" || { echo "PUBBACKUP_NOT_DONE: $KF is not the two lines PUBKEYS keeps (PUBKEYS first); nothing changed"; exit 1; }
keyok && storeok || { echo "PUBBACKUP_NOT_DONE: the corpus key or the key store is not as PUBKEYS makes them (PUBKEYS first); nothing changed"; exit 1; }
grep -q "'CORPUS_KEK_PATH'" "$L/backup.mjs" || { echo "PUBBACKUP_NOT_DONE: the tools folder's backup does not copy the corpus key (the upload's tools-folder swap); nothing changed: ask"; exit 1; }
HC=$(psqlq "SELECT count(*) FROM pg_database WHERE datname = 'hatchet'") || { echo "PUBBACKUP_NOT_DONE: the database is unreadable; nothing changed"; exit 1; }
if [ "$HC" = 1 ]; then runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d hatchet -XAt -c 'SELECT 1' >/dev/null || { echo "PUBBACKUP_NOT_DONE: the postgres administrator cannot connect to the hatchet database (the release guide's SB7 says why); nothing changed: ask"; exit 1; }; fi
SIZE=$(du -sm /var/lib/postgresql/18/v3-preview 2>/dev/null | cut -f1 || true); AVAIL=$(df --output=avail -BM /root | tail -1 | tr -dc 0-9)
[ -n "$SIZE" ] && [ -n "$AVAIL" ] && [ "$AVAIL" -gt $((SIZE + 2048)) ] || { echo "PUBBACKUP_NOT_DONE: not enough free space under /root for a backup ($AVAIL MB free; the database folder is ${SIZE:-unread} MB, and the backup needs that and 2 GB more at most); nothing changed: ask"; exit 1; }
OB=$PUB/backup-$(date -u +%Y%m%dT%H%M%SZ)
[ ! -e "$OB" ] || { echo "PUBBACKUP_NOT_DONE: $OB exists: run PUBBACKUP again a second later; nothing changed"; exit 1; }
install -d -o root -g root -m 0700 "$PUB" "$OB"
BK=$(lc backup.mjs --online "$OB" --env "$A" --env "$KF" 2>&1) || { printf '%s\n' "$BK" | cut -c1-300; echo "PUBBACKUP_NOT_DONE: the online backup failed (KEYS_FAILED: a key changed while it was read: run PUBBACKUP again); what it wrote stays in $OB, unused"; exit 1; }
jq -c '{event, databases, keys, files: [.files[] | {name, bytes}]}' <<<"$BK"
[ "$(jq -r .event <<<"$BK")" = PREVIEW_ONLINE_BACKUP_OK ] && [ "$(jq -r '[.keys[] | select(. == "CORPUS_KEK_PATH" or . == "PUBLICATION_KEY_STORE_PATH")] | length' <<<"$BK")" = 2 ] || { echo "PUBBACKUP_NOT_DONE: the backup did not report OK with the corpus key and the key store in it: ask"; exit 1; }
pubbackup "$OB" || { echo "PUBBACKUP_NOT_DONE: the backup's files do not match its sums, or it does not hold this corpus key and the key store: ask"; exit 1; }
{ ( umask 077; printf '%s\n' "$OB" > "$BF.new" ) && mv -f "$BF.new" "$BF"; } || { echo "PUBBACKUP_NOT_DONE: the backup is good, but its name was not kept in $BF: ask"; exit 1; }
echo "the backup in $OB holds the corpus key and the key store ($(keyfiles) publication keys in the store now), every database and the roles"
echo PUBBACKUP_DONE
exit 0
```

Expect one line with the backup's databases, the names of the keys it holds (`CORPUS_KEK_PATH` and
`PUBLICATION_KEY_STORE_PATH` among them) and its files with their sizes in bytes, then `the backup in …`, then
`PUBBACKUP_DONE`. `KEYS_FAILED` means a key store changed while the tool read it (for example a new account's key, or a
debate that went public at that moment): run PUBBACKUP again. Any other `PUBBACKUP_NOT_DONE`: ask. To restore from such a backup is a step of its own, which no
guide has yet: ask.

**5. The switch (PUBON).** It checks everything above once more, keeps a copy of the API file, and puts the four
lines in it: `PUBLICATION_ENABLED=true` in place of the line that is there now, and the corpus key's, the key store's
and the clean-up login's lines that PUBKEYS and PUBLOGIN kept. Then the API restarts (a minute or more of error pages;
pick a quiet minute). If the API refuses, or the website does not come back, the file before comes back by itself,
and the API and the website start on it again, with publishing off. After publishing was switched off by PUBOFF with
the keys kept (5.9b), PUBON only puts `PUBLICATION_ENABLED=true` back.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PUBON: publishing switched on in the running release's API file: PUBLICATION_ENABLED=true and, the first time, the corpus key's, the key store's and the clean-up login's lines (a copy kept), then the API restarts (a minute or more down). If the API refuses, the file before comes back.
declare -F upfail >/dev/null || { echo "PUBON_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then PUBON"; exit 1; }
declare -F pubprobe >/dev/null || { echo "PUBON_NOT_DONE: the names file is from an earlier version of this guide (no pubprobe); nothing changed: run LOCKS0 (3.0) again, then PUBON"; exit 1; }
K=$PUB/api-$LABEL.env.before-pubon-$(date -u +%Y%m%dT%H%M%SZ)
ST=$(pubstate "$A")
if [ "$ST" = A ]; then
  for P in PUBLICATION_ENABLED CORPUS_KEK_PATH PUBLICATION_KEY_STORE_PATH PUBLICATION_CLEANUP_DATABASE_URL; do [ "$(grep -c "^$P=" "$A" || true)" = 1 ] || { echo "PUBON_NOT_DONE: publishing is on in the API file, but $P is not there exactly once; nothing changed: ask"; exit 1; }; done
  echo "publishing is on already; nothing changed"; echo PUBON_DONE; exit 0
fi
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login" || true)" = 401 ] || { echo "PUBON_NOT_DONE: the site does not ask for the password: publishing goes on only behind it (PWON, 8.4, first); nothing changed"; exit 1; }
grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" && [ "$(staffkey || echo 0)" -ge 1 ] 2>/dev/null || { echo "PUBON_NOT_DONE: the staff screens are off, or the Owner has no working staff key under $HOST, so nobody could hide a public debate by hand: 5.7 first; nothing changed"; exit 1; }
aion || { echo "PUBON_NOT_DONE: the AI check for publication and reports is off (STAFFCHECK, 1.6), so nothing could pass it; nothing changed: ask"; exit 1; }
grep -q PUBLICATION_CLEANUP_DATABASE_URL "$CAPI/dialectical-engine/packages/register/src/runtime-environment.ts" || { echo "PUBON_NOT_DONE: this release does not know the publication settings; nothing changed: ask"; exit 1; }
[ "$(grep -c '^CONTENT_ENCRYPTION_ENABLED=' "$A" || true)" = 1 ] && grep -qx 'CONTENT_ENCRYPTION_ENABLED=true' "$A" || { echo "PUBON_NOT_DONE: the API file does not hold CONTENT_ENCRYPTION_ENABLED=true once, which publishing needs; nothing changed: ask"; exit 1; }
[ "$(grep -c '^PUBLICATION_ENABLED=' "$A" || true)" = "$(grep -cx 'PUBLICATION_ENABLED=false' "$A" || true)" ] && [ "$(grep -c '^PUBLICATION_ENABLED=' "$A" || true)" -le 1 ] || { echo "PUBON_NOT_DONE: the API file's PUBLICATION_ENABLED line is not one line PUBLICATION_ENABLED=false; nothing changed: ask"; exit 1; }
[ "$(grep -c '^CORPUS_KEK_PREVIOUS_PATH=' "$A" || true)" = 0 ] || { echo "PUBON_NOT_DONE: the API file holds CORPUS_KEK_PREVIOUS_PATH; nothing changed: ask"; exit 1; }
[ -s "$KF" ] && [ "$(grep -c '' "$KF")" = 2 ] && grep -qxF "CORPUS_KEK_PATH=$KP" "$KF" && grep -qxF "PUBLICATION_KEY_STORE_PATH=$PS" "$KF" || { echo "PUBON_NOT_DONE: $KF is not the two lines PUBKEYS keeps (PUBKEYS first); nothing changed"; exit 1; }
[ -s "$LF" ] && [ "$(stat -c '%a %U %h' "$LF")" = "600 root 1" ] && [ "$(grep -c '' "$LF")" = 1 ] && grep -qE '^PUBLICATION_CLEANUP_DATABASE_URL=postgres(ql)?://' "$LF" || { echo "PUBON_NOT_DONE: the clean-up line is not kept as PUBLOGIN keeps it (PUBLOGIN first); nothing changed"; exit 1; }
if [ "$ST" = B ]; then
  for P in CORPUS_KEK_PATH PUBLICATION_KEY_STORE_PATH PUBLICATION_CLEANUP_DATABASE_URL; do [ "$(grep -c "^$P=" "$A" || true)" = 1 ] || { echo "PUBON_NOT_DONE: the API file keeps the keys' lines, but $P is not there exactly once; nothing changed: ask"; exit 1; }; done
  cmp -s <(grep -E '^(CORPUS_KEK_PATH|PUBLICATION_KEY_STORE_PATH)=' "$A" | LC_ALL=C sort) <(LC_ALL=C sort "$KF") && cmp -s <(grep '^PUBLICATION_CLEANUP_DATABASE_URL=' "$A") "$LF" || { echo "PUBON_NOT_DONE: the publication lines the API file keeps are not the ones PUBKEYS and PUBLOGIN kept; nothing changed: ask"; exit 1; }
  MODE=again
elif [ "$(grep -cE '^(CORPUS_KEK_PATH|PUBLICATION_KEY_STORE_PATH|PUBLICATION_CLEANUP_DATABASE_URL)=' "$A" || true)" = 0 ]; then MODE=first
else echo "PUBON_NOT_DONE: the API file holds some of the publication lines but not all of them; nothing changed: ask"; exit 1; fi
keyok && storeok || { echo "PUBON_NOT_DONE: the corpus key or the key store is not as PUBKEYS makes them (PUBKEYS first); nothing changed"; exit 1; }
storewrite || { echo "PUBON_NOT_DONE: the API's unit does not list the key store as a write path (PUBKEYS first); nothing changed"; exit 1; }
AP=$(pubapart); [ -z "$AP" ] || { echo "PUBON_NOT_DONE: the corpus key or the key store is not apart from: $AP(the code refuses that); nothing changed: ask"; exit 1; }
W=$(pubprobe "$LF" || true); [ "$W" = accepted ] || { echo "PUBON_NOT_DONE: the clean-up line is not accepted ($W): PUBLOGIN again; nothing changed"; exit 1; }
pubbackup "$(cat "$BF" 2>/dev/null || true)" || { echo "PUBON_NOT_DONE: no PUBBACKUP holds this corpus key and the key store (PUBBACKUP first); nothing changed"; exit 1; }
[ "$(stat -c '%a %U' "$A")" = "640 root" ] && [ -z "$(tail -c1 "$A")" ] || { echo "PUBON_NOT_DONE: $A is not root's 0640 file ending in a newline; nothing changed: ask"; exit 1; }
cp -p "$A" "$K" || { rm -f "$K"; echo "PUBON_NOT_DONE: the copy $K was not kept; nothing changed: ask"; exit 1; }
{ ( umask 077; { grep -v '^PUBLICATION_ENABLED=' "$A"; printf 'PUBLICATION_ENABLED=true\n'; [ "$MODE" = again ] || cat "$KF" "$LF"; } > "$A.new" ) && chown --reference="$A" "$A.new" && chmod --reference="$A" "$A.new"; } || { rm -f "$A.new" "$K"; echo "PUBON_NOT_DONE: the new file was not written; nothing changed: ask"; exit 1; }
WANT='PUBLICATION_ENABLED '; [ "$MODE" = again ] || WANT='CORPUS_KEK_PATH PUBLICATION_CLEANUP_DATABASE_URL PUBLICATION_ENABLED PUBLICATION_KEY_STORE_PATH '
[ "$(diff "$A" "$A.new" | sed -n 's/^> \([A-Z_]*\)=.*/\1/p' | LC_ALL=C sort | tr '\n' ' ')" = "$WANT" ] && [ "$(diff "$A" "$A.new" | grep '^<' | grep -cvx '< PUBLICATION_ENABLED=false' || true)" = 0 ] && [ "$(grep -cx 'PUBLICATION_ENABLED=true' "$A.new" || true)" = 1 ] && [ -z "$(grep -oE '^[A-Z_][A-Z0-9_]*=' "$A.new" | sort | uniq -d)" ] || { rm -f "$A.new" "$K"; echo "PUBON_NOT_DONE: the new file is not the publishing lines added and, at most, the line PUBLICATION_ENABLED=false taken out; nothing changed: ask"; exit 1; }
mv "$A.new" "$A" || { rm -f "$A.new" "$K"; echo "PUBON_NOT_DONE: the new file was not put in place; nothing changed: ask"; exit 1; }
echo "in the API file: publishing on ($([ "$MODE" = again ] && echo 'the kept lines stay' || echo 'with the corpus key, the key store and the clean-up login'); the file before is $K); the API restarts"
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the file with publishing on'); { cp -p "$K" "$A.new" && mv "$A.new" "$A"; } || { echo "PUBON_NOT_DONE: $WHY, and the file before could not be put back (it is $K): the site is DOWN: ask at once"; exit 1; }; { apistart && webup; } || { echo "PUBON_NOT_DONE: $WHY; the file before is back, but the API or the website did not start on it either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "PUBON_NOT_DONE: $WHY; the file before is back, and the API and the website started on it, with publishing off: run PUBCHECK, then ask"; exit 1; fi
! said -F '[PUBLICATION_CUSTODY_NOT_CONFIGURED]' && ! said -F '[PUBLICATION_KEY_CLEANUP_NOT_CONFIGURED]' || { echo "PUBON_NOT_DONE: the API started, but its journal says publishing is not set up: run PUBAFTER, then ask"; exit 1; }
echo PUBON_DONE
exit 0
```

Expect the `in the API file: publishing on …` line, the API's start lines (`PREVIEW_API_STARTED …`), then `PUBON_DONE`.
- Every `PUBON_NOT_DONE` that says `nothing changed` changed nothing: do what it names, or ask.
- `the file before is back, and the API and the website started on it, with publishing off`: the site runs as before.
  A refusal of the publication lines often shows only a bare `PREVIEW_API_STARTUP_REFUSED`, with a stage line before
  it or none (part 10). Run PUBCHECK, which reads most of what the start checks, then ask, and give both last lines.
- `the site is DOWN`: ask at once.
- From `PUBON_DONE` on, publishing is on. Run PUBAFTER next.

**6. After the switch (PUBAFTER).** It only reads. Run it right after PUBON, again after the tries of step 7, and on
any later day you want to know how publishing goes.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PUBAFTER: publishing after the switch (read-only): the API's start and its clean-up passes since, the key and the store, the staff screens, the AI check, mail, and what the database and the key store hold, as counts. Prints names, states, counts and yes or no, never a key, a password or an address.
declare -F pubprobe >/dev/null || { echo "PUBAFTER_NOT_DONE: the names file is from an earlier version of this guide (no pubprobe); nothing changed: run LOCKS0 (3.0) again, then PUBAFTER"; exit 1; }
[ "$(pubstate "$A")" = A ] || { echo "PUBAFTER_NOT_DONE: the API file does not have publishing on (PUBON first)"; exit 1; }
NO=''; nope() { echo "not as expected: $1"; NO=yes; }
[ "$(systemctl is-active "$API" || true)" = active ] && said -F 'PREVIEW_API_STARTED ' || nope "the API is not running, or its journal has no start line since its last start"
! said -F '[PUBLICATION_CUSTODY_NOT_CONFIGURED]' && ! said -F '[PUBLICATION_KEY_CLEANUP_NOT_CONFIGURED]' || nope "the API's journal says publishing is not set up"
P=$(inv "$API" | grep -cF '[PUBLICATION_KEY_CLEANUP_PENDING]' || true); G=$(inv "$API" | grep -cF '[PUBLIC_PAGE_WORK_PENDING]' || true)
echo "since the API's start: failed passes of the key clean-up $P (one every 30 seconds), failed passes of the public pages $G (one every 15 seconds)"
[ "$P" = 0 ] || nope "a pass of the key clean-up failed"
keyok && storeok && storewrite || nope "the corpus key, the key store, or the API's permission to write it is not as PUBKEYS makes them"
echo "the clean-up login: signed in now $(psqlq "SELECT count(*) FROM pg_stat_activity WHERE usename = '$CLN'" || echo unread) (at most 4)"
if grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" && [ "$(staffkey || echo 0)" -ge 1 ] 2>/dev/null; then echo "the staff screens, and a working staff key of the Owner under $HOST: yes"; else nope "the staff screens are off, or the Owner has no working staff key under $HOST (5.7): nobody can hide a public debate by hand"; fi
GST=$(gs "$GAN" "$PAN" 2>/dev/null | jq -r '"\(.state), window open \(.window_open)"' 2>/dev/null || true)
if aion; then echo "the AI check for publication and reports: on (the Anthropic gate: ${GST:-did not read}; AICHECK, 6b.1, says what the checks did)"; else nope "the AI check for publication and reports is off (STAFFCHECK, 1.6): nothing can pass it"; fi
MM=$(mailmode || true); echo "mail: ${MM:-did not read}"
C=$(pubcounts) || { echo "PUBAFTER_NOT_DONE: the database is unreadable: ask"; exit 1; }
read -r NS NP NE FW FP FR CO PO EV <<<"$C"
echo "the database: publications ever made $NS (public now, hidden ones included, $NP); Free debates waiting to go public $FW, gone public $FP, kept private $FR; key clean-ups waiting $CO; publications being made $PO"
KC=$(keyfiles); echo "publication keys in the store: $KC; the database expects $NE"
[ "$KC" = "$NE" ] || echo "the two differ: a publication may be under way; run PUBAFTER again in a minute, and if they still differ, ask"
OB=$(cat "$BF" 2>/dev/null || true)
if pubbackup "$OB"; then echo "publication keys made since the newest PUBBACKUP: $(find "$PS" -type f -name publication-key.v1.json -newer "$OB/online.sha256" 2>/dev/null | grep -c . || true) (PUBBACKUP again puts them in a backup)"; else nope "no PUBBACKUP holds this corpus key and the key store"; fi
[ -z "$NO" ] || { echo "PUBAFTER_NOT_DONE: something is not as expected (the lines above): ask"; exit 1; }
echo PUBAFTER_DONE
exit 0
```

Right after PUBON expect: no `not as expected` line, `failed passes of the key clean-up 0`, the counts all 0, `publication
keys in the store: 0; the database expects 0`, `publication keys made since the newest PUBBACKUP: 0`, then
`PUBAFTER_DONE`. Later the counts grow with what goes public. `failed passes of the public pages` above 0 now and then
is the API's own retry; if it grows on every run, ask. `failed passes of the key clean-up` above 0: ask. Its journal
line is `[PUBLICATION_KEY_CLEANUP_PENDING]`.

**7. Try it by hand, behind the password.** In your browser, with the site password typed, signed in.
1. **The Public tab.** The home page's **Public** tab (Dezbateri publice) shows its list, empty at first. It must not
   say "Published debates are temporarily unavailable." (Dezbaterile publicate sunt temporar indisponibile.): if it
   does, ask.
2. **A Free debate goes public.** Use an account of yours or the team's that sees the Free line under the question box
   ("On the Free plan your question and its debate are public. Don't include personal details."). If no account of
   the team sees it, skip this try: an account with a team grant or a paid plan has no Free debate. Ask a short
   question with nothing personal in it, and remember: it goes public for good. Let the debate finish. Then, usually
   within a few minutes: the debate's page (`/v4/debate/<id>`) shows **Public** · **See its page** (Publică · Vedeți
   pagina ei); the **Public** tab lists it; and **See its page** opens it at `/public/debate/<id>`. The API looks
   every 15 seconds; it waits up to 30 minutes for the debate's short story; after a failed check it waits a minute,
   then longer, up to an hour.
   - "Kept private: it did not pass the check, so it has no public page." (A rămas privată: nu a trecut verificarea,
     așa că nu are pagină publică.): the AI check for publication refused it, for good. That is the check working.
   - Nothing after an hour: run PUBAFTER and AICHECK (6b.1). If AICHECK shows no `UNAVAILABLE` line, the end-of-debate
     check may have flagged it: its owner sees the flag and **Cereți aprobarea** only on `/debate/<id>` (5.1b). Ask.
3. **Publish** (only for a debate you want public for good). Open the older page `/debate/<id>` of a debate of yours
   that is not public and not a dig (a paid plan's debate, or one from before the switch). Its box now shows
   "Private — only your account can read this debate." (Privată — doar contul dumneavoastră poate citi această
   dezbatere.) and **Publish…** (Publicați…); before the switch it showed neither. Seeing that is the try. Only if you
   want that debate public for good: press **Publish…**, read the warning, tick "I understand and want to publish this
   debate." (Înțeleg și doresc să public această dezbatere.), pass the security check, and press **Publish publicly**
   (Publicați pentru toată lumea). Expect "Published. Anyone with the link can read it, and search engines may index
   it." (search engines cannot reach it while the site password is on). "This debate needs our approval before it can
   be published." means the end-of-debate check flagged it (5.1b).
4. **The Report button.** On a public debate's page, **Report a problem** (Raportați o problemă) opens a small form.
   Look at it, then press Cancel. Send a report only if something on a page must be looked at: its check may hide the
   debate at once, and its answer is a mail. 6b.2 (step 4) has a test report with a claim that is plainly not on the
   page, if you want one.
5. **Staff.** Copy the address of a public debate's page (`/public/debate/<id>`). On the Team page (`/admin/team`), in
   **Public debates under review** (Dezbateri publice în curs de verificare), paste it into **The debate's public
   link** (Linkul public al dezbaterii) and press **Open** (Deschide). The panel lists only hidden debates, so this is
   the way to a public one. The page shows "Public. Anyone can read it now." (Publică. Oricine o poate citi acum.) and
   **Hide now** (Ascunde acum). Do not press it unless you mean it.

Then run PUBAFTER again: its counts show what went public.

**To confirm on the server.** These steps were tested on throwaway files, with stand-ins for the server's parts, not
on this server. Only the server can show: that the API starts with the publication lines (PUBON puts the file before
back if it does not); that the API's unit lists the store as a write path after PUBKEYS; that the clean-up login signs
in with its new password through `pg_hba.conf`'s line (PUBLOGIN tries it); and the online backup's size and time.
The first time, do each step slowly, and ask if a line differs from the ones above.

### 5.9a Later uploads, and the way back, with publishing on

- **The upload carries the lines by itself.** DR1's `derive` copies every line of the API file into the new release's
  file byte for byte, except the release's own lines, so the new release starts with publishing on, with the same
  corpus key, key store and clean-up login. No step of the upload adds or changes them, and none may: no SAME check
  compares these lines between the two releases, so a hand change would go unseen. PRECHECK prints
  `publication state A`.
- **Before the upload: PUBBACKUP**, in the preparation (1.8), before SB1. The drained upload has no online backup, and
  its cold copy (DR3) and the nightly backup hold the database only, not the key store. A side-by-side upload's SB7
  copies the key store too.
- **At DR6** the new API's first start reads the same key, store and login (the stages `corpus-kek`,
  `publication-secret-domains`, `database-roles`, `publication-key-store`, `publication-key-cleanup` and
  `support-keys`). A refusal there is in part 2's stage table: ask.
- **rbD-A** starts the old release from its own file. That file holds the lines (they went in while it ran), so the
  public debates are served as before.
- **rbD-B** puts back DR3's copy of the database only. Everything about public debates written after DR3 is lost from
  the database: a debate that went public, a hide, a report. The keys made since stay in the key store, and nothing
  removes them. A debate taken down or deleted since DR3 comes back as public in the database, without its key, so
  its page does not open. rbD-B also marks the restore fence: the public library stays held (the **Public** tab empty,
  every public page closed) until you release the hold, after you have re-applied what happened since the copy (the
  release guide's H11, step 4). If anything went public, or came down, since DR3: ask before rbD-B.
- **A release older than the one before** is never a way back in this guide.

### 5.9b Switching publishing off again (PUBOFF)

**What is possible.** The site has no way to make every public debate private again. PUBOFF stops the public pages:
the **Public** tab comes back empty, a public page answers "not found", nobody sees Publish, and the Report button has
nothing to act on. It never touches the debates themselves. What it does with the lines depends
on what the database holds:
- **No debate was ever published** (the database has no publication and the key store no key): it takes the four
  lines out and puts back `PUBLICATION_ENABLED=false`. The server is back where it was before PUBON. The corpus key, the
  empty store, the drop-in, the kept lines and the clean-up login's password stay, unused: PUBON can use them again.
- **A debate was ever published**: it changes only `PUBLICATION_ENABLED=true` to `=false`, and keeps the corpus key's,
  the store's and the clean-up login's lines. Taking them out too would leave the database with keys nothing can
  destroy: every deletion of an account or a debate that ever had a public page would wait for ever.

**What it leaves behind, once a debate was published.**
- Every debate that was public stays recorded as public, with its key. PUBON shows them all again.
- Every Free debate that was started while publishing was on and has not gone public yet still waits. When publishing
  comes on again, it goes public then, however old it is, if the checks allow it.
- While publishing is off: nobody can hide a debate (Hide now, the reports and the public review need it on); the
  six-month removal of reports' words and sealed originals does not run; a person cannot read their full statements of
  reasons; and a data export that holds a report the person sent fails.
- The next upload's PRECHECK stops with `BAD (publication)`: its state B (both key lines, publishing not on) needs a
  reviewed check before an upload. Ask before that upload.

PUBOFF is no brake for one debate: Hide now (5.7) is. It restarts the API (a minute or more down). If the API refuses,
the file before comes back, with publishing on.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PUBOFF: publishing switched off again in the running release's API file (a copy kept), then the API restarts. With no debate ever published it takes the four lines out; once one was, it keeps the keys' and the clean-up login's lines, so deletions and the key clean-up go on. If the API refuses, the file before comes back.
declare -F upfail >/dev/null || { echo "PUBOFF_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then PUBOFF"; exit 1; }
declare -F pubprobe >/dev/null || { echo "PUBOFF_NOT_DONE: the names file is from an earlier version of this guide (no pubprobe); nothing changed: run LOCKS0 (3.0) again, then PUBOFF"; exit 1; }
K=$PUB/api-$LABEL.env.before-puboff-$(date -u +%Y%m%dT%H%M%SZ)
ST=$(pubstate "$A")
[ "$ST" != C ] || { echo "publishing is off already, and the API file names none of its keys; nothing changed"; echo PUBOFF_DONE; exit 0; }
[ "$ST" != B ] || { echo "publishing is off already; the API file keeps the keys' and the clean-up login's lines (5.9b); nothing changed"; echo PUBOFF_DONE; exit 0; }
for P in PUBLICATION_ENABLED CORPUS_KEK_PATH PUBLICATION_KEY_STORE_PATH PUBLICATION_CLEANUP_DATABASE_URL; do [ "$(grep -c "^$P=" "$A" || true)" = 1 ] || { echo "PUBOFF_NOT_DONE: publishing is on, but $P is not in the API file exactly once; nothing changed: ask"; exit 1; }; done
C=$(pubcounts) || { echo "PUBOFF_NOT_DONE: the database is unreadable; nothing changed: ask"; exit 1; }
read -r NS NP NE FW FP FR CO PO EV <<<"$C"
KC=$(keyfiles)
[ "$(stat -c '%a %U' "$A")" = "640 root" ] && [ -z "$(tail -c1 "$A")" ] || { echo "PUBOFF_NOT_DONE: $A is not root's 0640 file ending in a newline; nothing changed: ask"; exit 1; }
cp -p "$A" "$K" || { rm -f "$K"; echo "PUBOFF_NOT_DONE: the copy $K was not kept; nothing changed: ask"; exit 1; }
if [ "$NS/$PO/$EV/$KC" = 0/0/0/0 ]; then
  MODE=clean; WANT='PUBLICATION_ENABLED=false'; GONE=4
  { ( umask 077; { grep -vE '^(PUBLICATION_ENABLED|CORPUS_KEK_PATH|PUBLICATION_KEY_STORE_PATH|PUBLICATION_CLEANUP_DATABASE_URL)=' "$A"; printf 'PUBLICATION_ENABLED=false\n'; } > "$A.new" ) && chown --reference="$A" "$A.new" && chmod --reference="$A" "$A.new"; } || { rm -f "$A.new" "$K"; echo "PUBOFF_NOT_DONE: the new file was not written; nothing changed: ask"; exit 1; }
else
  MODE=keep; WANT='PUBLICATION_ENABLED=false'; GONE=1
  { ( umask 077; sed 's/^PUBLICATION_ENABLED=true$/PUBLICATION_ENABLED=false/' "$A" > "$A.new" ) && chown --reference="$A" "$A.new" && chmod --reference="$A" "$A.new"; } || { rm -f "$A.new" "$K"; echo "PUBOFF_NOT_DONE: the new file was not written; nothing changed: ask"; exit 1; }
fi
[ "$(diff "$A" "$A.new" | sed -n 's/^> //p')" = "$WANT" ] && [ "$(diff "$A" "$A.new" | grep -c '^<' || true)" = "$GONE" ] && [ "$(diff "$A" "$A.new" | grep '^<' | grep -cvE '^< (PUBLICATION_ENABLED=true|CORPUS_KEK_PATH=|PUBLICATION_KEY_STORE_PATH=|PUBLICATION_CLEANUP_DATABASE_URL=)' || true)" = 0 ] && [ -z "$(grep -oE '^[A-Z_][A-Z0-9_]*=' "$A.new" | sort | uniq -d)" ] || { rm -f "$A.new" "$K"; echo "PUBOFF_NOT_DONE: the new file is not only the publication lines changed; nothing changed: ask"; exit 1; }
mv "$A.new" "$A" || { rm -f "$A.new" "$K"; echo "PUBOFF_NOT_DONE: the new file was not put in place; nothing changed: ask"; exit 1; }
if [ "$MODE" = clean ]; then echo "in the API file: publishing off, and its four lines out, as no debate was ever published (the file before is $K); the API restarts"; else echo "in the API file: publishing off; the keys' and the clean-up login's lines stay, as debates were published, $NS ever and $NP public now (the file before is $K); the API restarts"; fi
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the file with publishing off'); { cp -p "$K" "$A.new" && mv "$A.new" "$A"; } || { echo "PUBOFF_NOT_DONE: $WHY, and the file before could not be put back (it is $K): the site is DOWN: ask at once"; exit 1; }; { apistart && webup; } || { echo "PUBOFF_NOT_DONE: $WHY; the file before is back, but the API or the website did not start on it either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "PUBOFF_NOT_DONE: $WHY; the file before is back, and the API and the website started on it, with publishing on: ask"; exit 1; fi
if [ "$MODE" = clean ]; then
  C=$(pubcounts) || { echo "PUBOFF_NOT_DONE: publishing is off, but the database is unreadable, so it is not known whether a debate went public meanwhile: ask"; exit 1; }
  read -r NS NP NE FW FP FR CO PO EV <<<"$C"
  [ "$NS/$PO/$EV/$(keyfiles)" = 0/0/0/0 ] || { echo "PUBOFF_NOT_DONE: a debate went public while publishing was being switched off, and the API file now names no key for it: ask at once"; exit 1; }
else
  ! said -F '[PUBLICATION_CUSTODY_NOT_CONFIGURED]' && ! said -F '[PUBLICATION_KEY_CLEANUP_NOT_CONFIGURED]' || { echo "PUBOFF_NOT_DONE: the API started with publishing off, but its journal says the keys are not set up: ask"; exit 1; }
  echo "kept: $NP debates recorded as public, $FW Free debates waiting; the next upload's PRECHECK stops on state B: ask before it (5.9b)"
fi
echo PUBOFF_DONE
exit 0
```

Expect the `in the API file: publishing off …` line, the API's start lines, the `kept:` line when debates were
published, then `PUBOFF_DONE`. `publishing is off already` changed nothing. On `the file before is back, and the API
and the website started on it, with publishing on`: publishing is still on; ask. `a debate went public while
publishing was being switched off`: ask at once, before any other step. To switch on again: PUBON (step 5), which
reads the kept lines.

---

## 6. Friends' test, with test payments

`PREVIEW_ASKS_OPEN_TO=everyone-with-test-payments` lets any signed-in account start debates while payments are NETOPIA's
sandbox. **The site password stays on the whole time.** Friends get the site password from you, in person or in a
one-to-one message (never in a group, an e-mail thread, or a chat with Claude). This value only ever runs with the
password on. To open the whole site without the password before real payments, use 6b instead: the two never run
together (the files hold one asks line), and ASKS_OPEN (6.1) is the step for both.

**Before you open:** mail is open (part 4.3; friends need the verification mail to sign up), payments are the sandbox
with billing on, and you have read 6.4 (what bounds spending) and 6.5 (the brakes). Do 5.7 first if you can, so
your staff key works on dezbatere.ro and you can hide a debate by hand during the test. If you have not, tell
friends that on the Free plan a finished debate goes public by itself when the AI checks allow it (5.1b), once
publishing is on (5.9), and that nobody can take it down by hand for now.

**If friends buy test plans.** Every open sandbox plan blocks the live start (part 7), so decide this first:
- Friends may buy test plans only if you withdraw each friend's sandbox plan with WITHDRAWOTHER (3.3) within 14 days
  of its purchase, and before ASKS_CLOSE. Tell them first. After 14 days only the friend can cancel, and the live
  start refuses (`BILLING_OTHER_SYSTEM_RECORDS_OPEN`) until they do.
- Friends must never buy as Romanian buyers: each SmartBill job blocks the live start for about 14.6 hours.
- A payment page left unfinished blocks real payments for up to 24 hours. Whoever presses **Abonați-vă și plătiți**
  (Subscribe and pay) and then closes NETOPIA's page leaves an open checkout. Only that person can end it sooner, by
  finishing a new checkout. Tell friends who will not buy never to press that button. SANDBOXLIST (3.3) shows such a
  plan with kind `CREATED`; it stops counting in PAY0 about 24 hours after its `at` time. If one is open, plan the
  real payment for the next day.
- The simpler way: a friends' test with no purchases, and nobody pressing that button.

### 6.1 Open asks

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# ASKS_OPEN: every signed-in account may start debates (V below). The runner's file says the same; only the API restarts.
V=everyone-with-test-payments                             # part 6 (friends' test); part 6b: V=everyone-with-listed-buyers; part 8: V=everyone
declare -F upfail >/dev/null || { echo "ASKS_OPEN_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then ASKS_OPEN"; exit 1; }
case "$V" in everyone|everyone-with-test-payments|everyone-with-listed-buyers) ;; *) echo "ASKS_OPEN_NOT_DONE: V is not one of the three values"; exit 1;; esac
! grep -q '^PREVIEW_ASKS_OPEN_TO=' "$A" "$RF" || { echo "ASKS_OPEN_NOT_DONE: already open: ASKS_CLOSE first"; exit 1; }
grep -q '^PREVIEW_TEAM_USER_IDS_JSON=' "$A" || { echo "ASKS_OPEN_NOT_DONE: no team line to keep"; exit 1; }
# With everyone-with-listed-buyers the team line stays in both files as the list of buyers: one line, the same in both, a JSON list.
NB=''; LT=''; if [ "$V" = everyone-with-listed-buyers ]; then
  [ "$(grep -c '^PREVIEW_TEAM_USER_IDS_JSON=' "$A")" = 1 ] && [ "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$A")" = "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$RF" || true)" ] || { echo "ASKS_OPEN_NOT_DONE: the API and runner files do not hold the same one team line; nothing changed: ask"; exit 1; }
  NB=$(sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$A" | jq -r 'if type == "array" then length else empty end' 2>/dev/null || true)
  [ -n "$NB" ] || { echo "ASKS_OPEN_NOT_DONE: the team line is not a JSON list; nothing changed: ask"; exit 1; }
  # The Team page's list of approved buyers (6b.3), on a database that holds it, must be empty: an account allowed there in an earlier opening would otherwise buy again with no new approval.
  LT=$(psqlq "SELECT to_regclass('staff.preview_buyer_event') IS NOT NULL" || true); LN=0
  case "$LT" in t) LN=$(psqlq "SELECT count(*) FROM (SELECT DISTINCT ON (user_id) kind FROM staff.preview_buyer_event ORDER BY user_id, revision DESC) l WHERE l.kind = 'ADDED'" || true);; f) ;; *) LN='';; esac
  printf '%s\n' "$LN" | grep -qxE '[0-9]+' || { echo "ASKS_OPEN_NOT_DONE: the Team page's list of approved buyers does not read (the database did not answer); nothing changed: ask"; exit 1; }
  [ "$LN" = 0 ] || { echo "ASKS_OPEN_NOT_DONE: $LN account(s) allowed on the Team page in an earlier opening are still on its list; nothing changed: remove them on the Team page (Who may buy while payments are in test mode; removing works while the team tools are locked), then ASKS_OPEN again"; exit 1; }
fi
for F in "$A" "$RF"; do [ -z "$(tail -c1 "$F")" ] || { echo "ASKS_OPEN_NOT_DONE: $F does not end in a newline"; exit 1; }; done
gatesok || { gates; echo "ASKS_OPEN_NOT_DONE: a spending gate is not active with its window open (above)"; exit 1; }
[ "$(inv "$API" | grep -c '"event":"api.release.no_site_cap"' || true)" = 0 ] || { echo "ASKS_OPEN_NOT_DONE: the running API has no ask room (it would refuse PREVIEW_ASKS_OPEN_TO_WITHOUT_ROOM)"; exit 1; }
PAY=none; if grep -qxE 'NETOPIA_API_BASE_URL=https://secure(-sandbox|\.sandbox)\.netopia-payments\.com' "$A"; then PAY=sandbox; elif grep -qx 'NETOPIA_API_BASE_URL=https://secure.netopia-payments.com/api' "$A"; then PAY=live; fi
echo "payments: $PAY"
case "$V/$PAY" in everyone-with-test-payments/sandbox|everyone-with-listed-buyers/sandbox|everyone/live) ;; *) echo "ASKS_OPEN_NOT_DONE: $V does not go with payments $PAY (part 10: PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING, ..._BILLING_OFF, ..._TEST_PAYMENTS_NOT_SANDBOX, ..._LISTED_BUYERS_NOT_SANDBOX)"; exit 1;; esac
[ "$V" != everyone-with-listed-buyers ] || { [ "$HOST" = dezbatere.ro ] && [ "$(grep -c '^PREVIEW_LIVE_PAYMENTS=' "$A" || true)" = 0 ]; } || { echo "ASKS_OPEN_NOT_DONE: everyone-with-listed-buyers opens only on dezbatere.ro with no live payments line (the API answers as $HOST; nothing changed): part 5 first"; exit 1; }
[ "$V" = everyone ] || [ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login")" = 401 ] || { echo "ASKS_OPEN_NOT_DONE: the site password is off; $V is set only behind it: PWON first"; exit 1; }
AS=$M/asks/open-$(date -u +%Y%m%dT%H%M%SZ); install -d -o root -g root -m 0700 "$AS"
for F in "$A" "$RF"; do cp -p "$F" "$AS/$(basename "$F").before-open"; done
( umask 077; printf 'ASKS_ARCHIVE=%s\nASKS_LABEL=%s\nASKS_AT=%s\n' "$AS" "$LABEL" "$(date -u +%s)" > "$M/asks/names.sh" )
back() { for F in "$A" "$RF"; do cp -p "$AS/$(basename "$F").before-open" "$F"; done; }
for F in "$A" "$RF"; do ( umask 077; if [ "$V" = everyone-with-listed-buyers ]; then cat "$F"; else grep -v '^PREVIEW_TEAM_USER_IDS_JSON=' "$F"; fi > "$F.new"; printf 'PREVIEW_ASKS_OPEN_TO=%s\n' "$V" >> "$F.new" ); chown --reference="$F" "$F.new"; chmod --reference="$F" "$F.new"; mv "$F.new" "$F"; done
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" || { back; echo "ASKS_OPEN_NOT_DONE: a SAME check is BAD (above); both files are back, nothing restarted"; exit 1; }
[ "$(grep -cx "PREVIEW_ASKS_OPEN_TO=$V" "$A")" = 1 ] && [ "$(grep -cx "PREVIEW_ASKS_OPEN_TO=$V" "$RF")" = 1 ] || { back; echo "ASKS_OPEN_NOT_DONE: the two files do not both say the value; both are back"; exit 1; }
if [ "$V" = everyone-with-listed-buyers ]; then [ "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$A")" = "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$AS/$(basename "$A").before-open")" ] && [ "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$RF" || true)" = "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$A")" ]; else ! grep -q '^PREVIEW_TEAM_USER_IDS_JSON=' "$A" "$RF"; fi || { back; echo "ASKS_OPEN_NOT_DONE: the team line is not as it must be (with everyone-with-listed-buyers the one line it was, the same in both files; with the other two values none); both are back"; exit 1; }
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the files with asks open'); back; { apistart && webup; } || { echo "ASKS_OPEN_NOT_DONE: $WHY; both files are back, but the API or the website did not start on them either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "ASKS_OPEN_NOT_DONE: $WHY; both files are back, and the API and the website started on them"; exit 1; fi
said -xF "{\"event\":\"api.preview.asks_open\",\"to\":\"$V\"}" || { echo "ASKS_OPEN_NOT_DONE: no asks_open line: ask"; exit 1; }
[ -z "$NB" ] || said -xF "{\"event\":\"api.preview.listed_buyers\",\"count\":$NB}" || { echo "ASKS_OPEN_NOT_DONE: the API does not say the $NB listed buyers the files hold: ask"; exit 1; }
[ -z "$NB" ] || echo "listed buyers: $NB (the team line)"
[ -z "$NB" ] || [ "$LT" != t ] || [ ! -f "$CAPI/dialectical-engine/apps/api/src/staff/preview-buyers.ts" ] || echo "the Team page's list of approved buyers: empty; from now on you allow buyers there (6b.3)"
echo ASKS_OPEN_DONE
exit 0
```

Expect `payments: sandbox`, the SAME list, the API's lines with `{"event":"api.preview.asks_open","to":"everyone-with-test-payments"}`,
then `ASKS_OPEN_DONE`. With `V=everyone-with-listed-buyers` (6b) expect `payments: sandbox`, the SAME list, the
API's lines with `{"event":"api.preview.asks_open","to":"everyone-with-listed-buyers"}`, then `listed buyers: <how
many>` (the API's own line is `{"event":"api.preview.listed_buyers","count":<how many>}`; it counts the team line
only), on a release that carries the Team page's list `the Team page's list of approved buyers: empty; …`, then
`ASKS_OPEN_DONE`.

**With `V=everyone-with-listed-buyers` (6b).** The team line stays in both files: from now on it is the list of
buyers, and at first it holds the team. The runner checks the line's form at its start but never uses it to decide
whose debates run. The step refuses, with nothing changed, unless payments are NETOPIA's sandbox, the API answers as
dezbatere.ro, and the Log in page still asks for the site password: 6b sets the value behind the password, and only
PWOFF1 and PWOFF2 take the password off afterwards. `same` does not look at the payment system: a value on another
payment system is refused by the API's start (`PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_NOT_SANDBOX`), and the step then
puts both files back.

On a database that holds the Team page's list of approved buyers (6b.3), the step also refuses, with nothing changed,
while any account is still on that list: `ASKS_OPEN_NOT_DONE: <how many> account(s) allowed on the Team page in an
earlier opening are still on its list …`. The list counts for nothing while asks are closed, but from this opening on
it would count again, and those accounts could buy with no new approval and no new alert. So every opening starts from
the team, as before. Open the Team page, press **Remove** on each row and touch your key: removing works while the team
tools are locked, so no UNLOCK is needed. Then run ASKS_OPEN again. On a release without the Team page's list (after a
way back), there is no box to remove them with: ask.

If it stops with `a spending gate is not active with its window open` and the gates' lines show `bedrock` with
`"state":"active","window_open":false`, the Amazon gate's 31 days are over while Luna is still off (part 2, "Until
Luna's own day"). With your yes, run the Amazon gate's `stop` line, then its `activate` line (6.5; `activate` alone
refuses a gate that is still `active`), then ASKS_OPEN again.

The runner needs no restart. Its file already says open, and its start rule acts only when it starts. At its next
start it prints `{"kind":"DEBATEAI_RUNNER_STARTUP","event":"PREVIEW_ASKS_OPEN","to":"<value>"}` and fails only a
debate that no account owns. Keep `/root/preview-archive/main-site/asks`: closing reads the team line from it.

### 6.2 Test it

1. Sign in with an account that is not on the team. Ask a short question. The debate must start.
2. Watch the spend:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# GATES: the four spending gates (read-only).
gates
echo GATES_DONE
exit 0
```

### 6.3 Close asks (always before real payments)

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# ASKS_CLOSE: only the team may start debates, or buy, again: the team line kept before the opening comes back, in place of a list of buyers too. Edits the current release's two files, so it works after any later upload.
declare -F upfail >/dev/null || { echo "ASKS_CLOSE_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then ASKS_CLOSE"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login" || true)" = 401 ] || { echo "ASKS_CLOSE_NOT_DONE: the Log in page does not ask for the site password (the site is open, or not answering); nothing changed: PWON first"; exit 1; }
[ -s "$M/asks/names.sh" ] || { echo "ASKS_CLOSE_NOT_DONE: $M/asks/names.sh is missing (asks were never opened by ASKS_OPEN): ask"; exit 1; }
. "$M/asks/names.sh"                                      # ASKS_ARCHIVE, ASKS_LABEL
grep -q '^PREVIEW_ASKS_OPEN_TO=' "$A" "$RF" || { echo "ASKS_CLOSE_NOT_DONE: asks are not open in this release's files"; exit 1; }
TL=$(grep -m1 '^PREVIEW_TEAM_USER_IDS_JSON=' "$ASKS_ARCHIVE/api-$ASKS_LABEL.env.before-open") || { echo "ASKS_CLOSE_NOT_DONE: no kept team line: ask"; exit 1; }
for F in "$A" "$RF"; do [ -z "$(tail -c1 "$F")" ] || { echo "ASKS_CLOSE_NOT_DONE: $F does not end in a newline"; exit 1; }; done
AC=$M/asks/close-$(date -u +%Y%m%dT%H%M%SZ); install -d -o root -g root -m 0700 "$AC"
for F in "$A" "$RF"; do cp -p "$F" "$AC/$(basename "$F").before-close"; done
back() { for F in "$A" "$RF"; do cp -p "$AC/$(basename "$F").before-close" "$F"; done; }
for F in "$A" "$RF"; do ( umask 077; grep -v -e '^PREVIEW_ASKS_OPEN_TO=' -e '^PREVIEW_TEAM_USER_IDS_JSON=' "$F" > "$F.new"; printf '%s\n' "$TL" >> "$F.new" ); chown --reference="$F" "$F.new"; chmod --reference="$F" "$F.new"; mv "$F.new" "$F"; done
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" || { back; echo "ASKS_CLOSE_NOT_DONE: a SAME check is BAD (above); both files are back, nothing restarted"; exit 1; }
! grep -q '^PREVIEW_ASKS_OPEN_TO=' "$A" "$RF" && [ "$(grep -c '^PREVIEW_TEAM_USER_IDS_JSON=' "$A")" = 1 ] && [ "$(grep -c '^PREVIEW_TEAM_USER_IDS_JSON=' "$RF")" = 1 ] || { back; echo "ASKS_CLOSE_NOT_DONE: the two files do not both hold the team line without the open line; both are back"; exit 1; }
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the files with asks closed'); back; { apistart && webup; } || { echo "ASKS_CLOSE_NOT_DONE: $WHY; both files are back, but the API or the website did not start on them either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "ASKS_CLOSE_NOT_DONE: $WHY; both files are back, and the API and the website started on them"; exit 1; fi
! said '"event":"api.preview.asks_open"' || { echo "ASKS_CLOSE_NOT_DONE: the API still says open: ask"; exit 1; }
! said '"event":"api.preview.listed_buyers"' || { echo "ASKS_CLOSE_NOT_DONE: the API still lists buyers: ask"; exit 1; }
echo "open work now: $(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")"
# The Team page's list of approved buyers (6b.3), on a database that holds it: it counts for nothing from this restart on, and stays until you remove its accounts.
LT=$(psqlq "SELECT to_regclass('staff.preview_buyer_event') IS NOT NULL" 2>/dev/null || true); LN=''
[ "$LT" != t ] || LN=$(psqlq "SELECT count(*) FROM (SELECT DISTINCT ON (user_id) kind FROM staff.preview_buyer_event ORDER BY user_id, revision DESC) l WHERE l.kind = 'ADDED'" 2>/dev/null || true)
printf '%s\n' "$LN" | grep -qxE '[0-9]+' || LN='did not read'
[ "$LT" = f ] || echo "accounts still on the Team page's list of approved buyers: $LN (they count for nothing now; the next opening with listed buyers waits until you remove them there)"
echo ASKS_CLOSE_DONE
exit 0
```

**What closing stops:** new questions, clarifying questions, the start step, starts from saved questions; the waiting
and stalled debates of non-team accounts (they are recorded failed and shown as "not started"); at the runner's next
start, their queued work; and every checkout or plan upgrade by an account not on the team (403 `PREVIEW_TEAM_ONLY`):
while payments are real, and, with the release that carries 6b, on NETOPIA's sandbox too. After 6b, the accounts you
listed with BUYERS are on the team line no more: the line kept before the opening comes back, so none of them
becomes an account that may ask. The accounts you allowed on the Team page were never on the team line: their
approvals stop counting at this restart, because the API reads that list only while 6b is open, and they stay on the
list, with their dates, until you remove them there. ASKS_CLOSE prints how many are left; the next ASKS_OPEN with
`everyone-with-listed-buyers` refuses until none is (6.1). A plan any of them bought goes on until it is withdrawn or
cancelled (3.3).

ASKS_CLOSE runs only with the site password on (PWON first), whatever the payments: with the site open, closing asks
alone would leave the people who signed up (paying customers among them, while payments are real) on an open site
where their questions are refused. Put the password back first, so the site closes as a whole.

**What closing does not stop:** a non-team account's debates already handed to the runner (the `open work now`
count), unless the runner starts again before they run; "Continue" on a debate (re-opening one that failed on our
side, or one paused at the month limit); "Write my report", and the API's own carry-on step, which writes reports by
itself. These stay bounded by that person's allowance and the site's day. Putting the password back
stops their own requests, but not the carry-on step. Only each gate's `stop` stops every paid call.

**The runner needs no restart.** It applies its start rule only to the work queued at the moment it starts, never
while it runs, so a restart with nothing queued changes nothing. The API that ASKS_CLOSE restarted already refuses new
questions from accounts not on the team. `open work now` counts the debates handed to the runner at that moment;
closing does not stop those (above).

**Closing the friends' test.** After ASKS_CLOSE, run SANDBOXLIST (3.3) and settle every refund. The friends' test is
closed only when PAY0 (7.1; it only reads) prints all zeros. Change the site password the friends had (PWNEW, 7.0)
before 7.2.

### 6.4 What bounds spending (setting names only; your figures)

For everyone together, per day:
- each gate GO's `daily_budget_usd`, `max_paid_posts_per_day`, `max_concurrent_calls` and `open_days`;
- the caps file's `max_go_budget_usd` and `team_total_budget_usd` (the hard fuse);
- `dailyCeilingMicros` and `perRunCeilingMicros` of the published site version;
- the site's cap of 8 debates at once, and the worst-case estimate before each start.

For each account:
- with billing on: Free's `monthly_credit_micros`, `reserve_micros` and `finish_overflow_micros`, and the paid plans'
  `day_bp` and `week_bp`;
- 2 debates at once per person;
- the code's limits on questions (20 an hour), start-step calls, language checks and publication checks;
- `abuseLimits`: `clarify_per_hour`, `clarify_per_day` and the `flag_*` limits.

Nothing limits one person who signs up with many e-mail addresses. The day ceilings still hold, but that person can use
up the day for everyone.

### 6.5 The brakes, fastest first

(a) **Stop all spending:** each gate's `stop`. Stopping the Anthropic gate alone also refuses every new question.

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/perplexity-budget-v1/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-perplexity-authority-v1
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/bedrock-budget-v1/preview_budget_authority.py stop --private /var/lib/debateai-v3-preview/provider-bedrock-authority-v1
```

Open them again with each gate's `activate`:

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1 --go /etc/debateai-v3-preview/provider-anthropic-go-v1.json
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 --go /etc/debateai-v3-preview/provider-deepinfra-go-v3.json
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/perplexity-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-perplexity-authority-v1 --go /etc/debateai-v3-preview/provider-perplexity-go-v1.json
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/bedrock-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-bedrock-authority-v1 --go /etc/debateai-v3-preview/provider-bedrock-go-v1.json
```

(b) **Close the site to strangers:** PWON (part 8.4), when the password is off or the NETOPIA review window (5.8) is
open. PWON closes both.

(b2) **Close only the review window:** REVIEW_CLOSE (5.8). It reads no names file, so it works at any time.

(c) **Stop sign-ups only** (for when the password is off): a Caddy rule that answers 503 to the three sign-up
requests. People see a plain error; it is an emergency brake. While the password is on, only people who know it can
sign up, so (c) is rarely needed then.

Never edit the live Caddyfile itself. Make an edited copy, and let SIGNUPS put it in place:
1. Copy the live file: `cp -p /etc/debateai-v3-preview/public/Caddyfile /root/preview-archive/main-site/password/Caddyfile.signups`.
2. Open the copy: `nano /root/preview-archive/main-site/password/Caddyfile.signups`. Add these five lines in the
   public route of the site block, **before** its main `reverse_proxy`, and change nothing else (to confirm on the
   server: where exactly, and that `cad validate` accepts it):

```caddyfile
        @signup {
            method POST
            path /api/v1/auth/register /api/v1/auth/social/signup/complete /api/v1/auth/resend-verification
        }
        respond @signup 503
```

3. Run SIGNUPS:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# SIGNUPS: your edited copy of the Caddyfile (the sign-up rule added, or taken out again) checked, then put in place; Caddy restarts.
# While the password is off, the copy PWON and NAME5 compare with moves with it. If Caddy does not start, the file before comes back.
W=$M/password/Caddyfile.signups; O=$M/password/Caddyfile.open; TS=$(date -u +%Y%m%dT%H%M%SZ); PREV=$M/password/Caddyfile.before-signups-$TS
[ -s "$W" ] || { echo "SIGNUPS_NOT_DONE: $W is missing (make the edited copy first; nothing changed)"; exit 1; }
! grep -qE 'review_locked|review_quiet|review window begin' "$C" || { echo "SIGNUPS_NOT_DONE: the NETOPIA review window is open, so sign-ups already ask for the site password and this brake is not needed; nothing changed"; exit 1; }
OFF=no; if [ -e "$O" ]; then cmp -s "$C" "$O" || { echo "SIGNUPS_NOT_DONE: the live Caddyfile is not the copy PWOFF2 put in place (between PWOFF1 and PWOFF2?); nothing changed: ask"; exit 1; }; OFF=yes; fi
[ ! -e "$M/password/Caddyfile.before-open" ] || ! cmp -s "$C" "$M/password/Caddyfile.before-open" || { echo "SIGNUPS_NOT_DONE: PWOFF1 ran but the password is still on: finish PWOFF2, or run PWON to drop its copies, then run this again; nothing changed"; exit 1; }
RULE=$(printf '%s\n' '@signup {' 'method POST' 'path /api/v1/auth/register /api/v1/auth/social/signup/complete /api/v1/auth/resend-verification' '}' 'respond @signup 503')
diff "$C" "$W" || true
ADD=$(diff "$C" "$W" | sed -n 's/^>[[:space:]]*//p' || true); DEL=$(diff "$C" "$W" | sed -n 's/^<[[:space:]]*//p' || true)
if [ "$ADD" = "$RULE" ] && [ -z "$DEL" ]; then WHAT=added; elif [ "$DEL" = "$RULE" ] && [ -z "$ADD" ]; then WHAT='taken out'; else echo "SIGNUPS_NOT_DONE: the copy does not add or take out exactly the five lines of the rule (nothing changed)"; exit 1; fi
[ "$(diff "$C" "$W" | grep -c '^[0-9]' || true)" = 1 ] || { echo "SIGNUPS_NOT_DONE: the five lines are not together in one place (nothing changed)"; exit 1; }
cad validate --config "$W" --adapter caddyfile >/dev/null 2>&1 || { echo "SIGNUPS_NOT_DONE: caddy validate refused the copy (nothing changed)"; exit 1; }
cp -p "$C" "$PREV"
{ install -o root -g root -m 0644 "$W" "$C.new" && mv "$C.new" "$C" && cmp -s "$W" "$C"; } || { echo "SIGNUPS_NOT_DONE: the copy was not put in place; Caddy was not restarted: ask"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
if [ "$(systemctl is-active caddy || true)" != active ]; then
  { install -o root -g root -m 0644 "$PREV" "$C.new" && mv "$C.new" "$C"; } || { echo "SIGNUPS_NOT_DONE: Caddy did not start, and the file before could not be put back (it is $PREV): the site is DOWN: ask at once"; exit 1; }
  systemctl restart caddy || true; sleep 3
  [ "$(systemctl is-active caddy || true)" = active ] || { echo "SIGNUPS_NOT_DONE: the file before is back, but Caddy did not start on it either: the site is DOWN: ask at once"; exit 1; }
  echo "SIGNUPS_NOT_DONE: Caddy did not start on the copy; the file before is back and Caddy restarted on it"; exit 1
fi
if [ "$OFF" = yes ]; then { cp -p "$C" "$O" && cmp -s "$C" "$O"; } || { echo "SIGNUPS_NOT_DONE: the rule is $WHAT, but $O was not updated, so PWON would refuse: ask at once"; exit 1; }; fi
mv "$W" "$W.$TS"
SC=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' "https://$HOST/api/v1/auth/register" || true)
echo "the rule is $WHAT; a test sign-up request is answered $SC"
if [ "$OFF" = yes ]; then case "$WHAT/$SC" in added/503) ;; added/*) echo "SIGNUPS_NOT_DONE: the rule is in the live Caddyfile, but a test sign-up is answered $SC, not 503, so sign-ups go on (the five lines are not where Caddy reaches them): if sign-ups must stop now, run PWON (brake b); then ask"; exit 1;; 'taken out/503') echo "SIGNUPS_NOT_DONE: the rule is taken out, but a test sign-up is still answered 503: ask"; exit 1;; esac; fi
echo SIGNUPS_DONE
exit 0
```

Expect the diff (the five lines), then `the rule is added; a test sign-up request is answered 503` (with the password
off), then `SIGNUPS_DONE`. With the password off, SIGNUPS checks that 503 itself: if the rule is in but the answer
is not 503, the lines are in a place Caddy does not reach, and it says `SIGNUPS_NOT_DONE`. With the password on, the
answer may be the password's 401, which says nothing about the rule, so the script does not check it then. **To take
(c) off**, do the same three steps, but in step 2 delete the same five lines instead. PWON (b) works with (c) in or
out: it puts back the Caddyfile that PWOFF1 kept. If you added (c) before PWOFF1, it is still in after PWON; take it
out with SIGNUPS.

(d) **Asks back to the team only:** ASKS_CLOSE (6.3). It runs only with the password on, so when the site is open
PWON (b) comes first.

(e) **One account may buy no more** (only while 6b is open): **Remove** on its row of the Team page's list (6b.3) and
your key. Nothing restarts, and it works while the team tools are locked. For an account BUYERS put on the team line,
or on a release before the Team page's list, BUYERS (6b.3b) with `W=remove`. Either way it stops that account's new
checkouts and upgrades; a plan it holds goes on until it is withdrawn or cancelled (3.3). To stop all buying by anyone
outside the team at once, use PWON (b): then only the team, who know the site password, can reach the site (a payment
page opened earlier can still be paid for up to a day).

(a), (b) and (b2) work at any time, even during an upload, and so does **Remove** on the Team page. (c), (d) and
BUYERS do not: wait until the upload is over. Their names file stops them only once the new release is staged, not
from the start of the upload, so do not count on it.

To see spend: GATES (6.2), and the gates' halt e-mails.

---

## 6b. The whole site open before real payments, buying only for listed accounts

`PREVIEW_ASKS_OPEN_TO=everyone-with-listed-buyers` lets any signed-in account start debates while payments are
NETOPIA's sandbox, and lets only the accounts on the team line (`PREVIEW_TEAM_USER_IDS_JSON`) buy, and, on a release
that carries it, the accounts you allow on the Team page. With it, and only with it, the site password comes off on
dezbatere.ro before real payments: strangers sign up and use the Free plan, and only the accounts you list can buy test
plans. Nobody needs the site password, friends and NETOPIA's tester included. Part 6's friends' test and 6b never run
together.

**What each visitor can do while 6b is open.**
- **Someone with no account** reads every page, with no password box anywhere, and can sign up: the bot check, the
  e-mail link and a second factor before the first sign-in, as always.
- **A signed-in account that is not listed** asks questions on the Free plan, within the Free plan's allowance and the
  site's day; reports debates; uses Settings, `/cancel` and `/withdraw`. It sees the prices, the test-mode note and the
  whole order page with its price. At the last button (**Abonați-vă și plătiți**, Subscribe and pay; or the upgrade's
  pay button in Settings) it is refused with the sentence "Buying a plan is open only to invited accounts for now. You
  can keep using the Free plan." (403 `PREVIEW_TEAM_ONLY`). Nothing is charged or written, and no NETOPIA page opens.
- **A listed account** may do all of that, and may also buy a test plan on NETOPIA's sandbox with the test card the
  test-mode note prints. It then gets that plan's allowance. Its plan is a sandbox plan: it blocks real payments until
  it ends (3.3, 7.1).
- **You and the team** are listed from the opening (the team line becomes the list), so you can buy test plans too.
  Hide now works with your staff key (5.7).

**Why buying stays closed to strangers.** The test card is printed on the site for everyone, and a plan bought with it
carries a paid plan's real AI allowance. Only the API's buyer rule stands between a stranger and that allowance.
OPENCHECK (6b.4) checks every morning that it held.

**The list.** It has two parts.
- The team line, the same in the API and the runner files (the runner checks its form at its start but never uses it
  to decide whose debates run). At the opening it holds the team, and it stays the team: ASKS_CLOSE puts back the team
  line kept before the opening, so no account you listed only to buy becomes an account that may ask.
- The Team page's list, in the database, on a release that carries it (the release with the database step 0186): the
  box "Who may buy while payments are in test mode" on the Team page (https://dezbatere.ro/admin/team). Only you, the
  Owner, see it and change it, each change with your security key; nothing restarts, and the API reads it at the
  moment someone presses the pay button (6b.3). It counts only while 6b is open; it starts empty at each opening
  (ASKS_OPEN refuses otherwise, 6.1). An account on it buys only while it is active: a suspended account cannot buy,
  stays in the box with **Remove**, and can buy again if it becomes active again, unless you remove it.

The list holds at most `PREVIEW_TEAM_MAX_MEMBERS` accounts, the team included, its two parts together: that is the
cap's name in the code (`packages/providers/src/preview-test.ts`). The Team page refuses an account past it, and BUYERS
and OPENCHECK read it from the running release. If the API cannot read the Team page's list at the pay button, it refuses
the purchase of an account not on the team line (503 `PREVIEW_BUYERS_UNAVAILABLE`; the page says "Something went wrong.
Please try again."), and nothing is charged or written; the team line still buys. An empty list (`[]` on the team
line, and nobody on the Team page's list) means nobody may buy.

**Before the release that carries the Team page's list.** It ships in an upload of its own, side by side with no
downtime (its database step only adds, so the release before it keeps running on the new database). Until that
release is uploaded, the list is the team line alone, and BUYERS (6b.3b) adds or removes one account at a time, each
change one restart of the API (an error page for a minute or more). After it is uploaded, you add and remove buyers on
the Team page; BUYERS is left only to take off an account an earlier BUYERS run put on the team line.

### 6b.1 Before you open

**The code.** The value exists only in a release that carries it. An older API refuses it at start
(`PREVIEW_ASKS_OPEN_TO_INVALID`), and an older API lets any signed-in account buy on the sandbox. So:
- the upload of that release comes first (the release guide), with its downtime: not while NETOPIA is looking at the
  site (5.6);
- open 6b only once that upload is over: SB13b passed, the first line of names.sh names the new upload (end of 3.0),
  and you have decided not to go back to the release before it (side by side: WB2 is still possible after SB14; if
  you ever use it, PWON and ASKS_CLOSE come first; drained: you would no longer choose rbD-B);
- while 6b is open, go back to an older release only after PWON, then ASKS_CLOSE; a way back from the release that
  carries the Team page's list to the release before it (both carry 6b) needs neither, but has its own rule (5.6: the
  alerts of the day's additions arrived first);
- the sentence an account that is not listed sees (`billing.checkout.invitedBuyersOnly`) is written in English first
  and translated into Romanian before a release: check that the release you uploaded carries the Romanian words, or
  Romanian pages show it in English.

**What must be done already.**
- The site answers as dezbatere.ro (NAME4), and your staff key works there (5.7). PWOFF1 checks the staff screens and
  the Owner's working staff key in the database.
- Mail is open (4.3): strangers need the verification mail to sign up. PWOFF1 checks the plan file and the API's mode
  line.
- Billing is on, and payments are NETOPIA's sandbox (no `PREVIEW_LIVE_PAYMENTS` line).
- The four spending gates are active with their window open (GATES, 6.2).
- The AI check for publication and reports can go through the Anthropic gate: AICHECK (end of 6b.1) ends with
  `AICHECK_DONE`, or you have decided to open without it (decision 1 below).
- With your staff key working, you have read the **Public** tab and used Hide now on anything that must not stay
  public (Free debates go public by themselves once publishing is on, 5.9 and 5.1b).
- Public debates: publishing is on (5.9), or you have decided to open without it (decision 7 below). The Free line
  under the question box and the Terms tell people that a finished Free debate is public; while publishing is off,
  none is, and the Report button has nothing to act on.
- NETOPIA's logo shows (LOGOCHECK, part 2).
- The security review's host-side fixes (NV-51, NV-55's port reservation, NV-56, NV-57) are applied or recorded, as
  part 7's "Before you start" says: the site meets strangers as it will in part 8.
- No friends' test is open. If part 6's value is set, run ASKS_CLOSE (6.3) first, at a quiet moment: the waiting
  debates of accounts not on the team are recorded failed. Friends keep their accounts; you list the ones who may
  buy.
- Plans from before: run SANDBOXLIST (3.3). A sandbox plan held by an account you will not list still gives its
  allowance and still blocks real payments: withdraw it with WITHDRAWOTHER within 14 days of its purchase (tell them
  first), or let them cancel it. OPENCHECK reports such plans every morning.
- You have decided what you will tell the people who sign up when the site closes again for part 7 (6b.6), and you
  have read 6.4 (what bounds spending) and 6.5 (the brakes).

**Your decisions, before you open.**
1. **The AI check for publication and reports** (STAFFCHECK's `the AI check for publication and reports`, 1.6, and
   AICHECK below). It is Claude Haiku 5.5 through the Anthropic gate: the API holds no key for it, and the API file's
   `SUPPORT_MODEL_TARGET_JSON` stays absent. The end-of-debate check comes with it, the same way: it holds each finished
   debate's answer until it answers, deletes a debate it finds touching "tendencies to suicide or harming other
   people", and sends an owner's Publish of a debate with another flag to a staff approval. A Free debate waits for
   it before it can go public: one it flagged waits for that approval, and one it is still checking waits at most two
   minutes after the debate finished (5.1b says all of it).
   Their calls count in the Anthropic gate's pot and day's calls, beside the debates' own Claude Haiku calls and the
   question check, and they take the gate's few slots (`max_concurrent_calls` in its GO) from those calls. A check that
   runs by itself sends one call at a time: a Free debate's, a contribution's or an AI-written report's check one call,
   and the end-of-debate check one finished debate at a time. For a Free debate the end-of-debate check could not
   answer in time, the API's tries of the Free debates run that check themselves, one call, taking their turn with
   those debates' other checks. An owner's Publish sends two. So one check holds at most one slot (an owner's Publish
   two). But the checks run apart from each other: when two run at the same moment (for example the end-of-debate
   check and a Free debate's check), they hold two slots together, all that a gate of two has, for the few seconds a
   call takes.
   While a check runs, a debate's call or a person's question check may wait in the gate's queue for one of its calls
   to end, and on a gate whose slots are all taken such a call is refused after the gate's wait of a minute. A Free
   debate, a contribution or an AI-written report whose check keeps failing is tried again by itself, after its first
   hour about once an hour, and each try's calls count in the day's calls.

   When the gate's pot or its day's calls are used up, everything that goes through the gate stops until its next day
   (midnight, Bucharest time). Nobody can ask a new question: the question check answers "unavailable". The debates'
   Claude Haiku calls are refused. And the checks fail closed: no Free debate goes public, every report waits for a
   person, the end-of-debate check deletes nothing and finished answers show unchecked, and an owner's Publish answers
   that the check is not available.
   - On (AICHECK ends with `AICHECK_DONE`): a stranger's finished Free debate goes public by itself when the
     end-of-debate check and then the AI check for publication allow it, and anyone with its link can read it. One the
     end-of-debate check flagged stays private until a staff approval (5.1b). A report the check agrees with hides the
     debate at once (once per debate).
   - Off, or the gate not letting it through (`AICHECK_NOT_DONE`): no Free debate goes public. Each finished one stays
     private and waits; the API tries its checks again by itself, and the debate goes public once the checks allow it,
     however many older Free debates wait (5.1b). No staff screen lists the waiting ones, and no staff member can
     publish one by hand. Every report waits for you.

   Either way, read the Public tab and the report mails every day: with strangers in, the Terms' promises about
   reports and removals (section 10) are owed to real people. If you want the check and AICHECK says
   `AICHECK_NOT_DONE`, ask before you open.
2. **Your numbers** (1.7 and 6.4, by setting name): the site's day (`dailyCeilingMicros`) and one debate's ceiling
   (`perRunCeilingMicros`); the Free plan's allowance (Free's `monthly_credit_micros`, `reserve_micros` and
   `finish_overflow_micros`: keep Free's credit well below the site's day); each gate's pot (`daily_budget_usd`,
   `max_paid_posts_per_day`, `max_concurrent_calls`, `open_days`) and the hard fuse (`max_go_budget_usd`,
   `team_total_budget_usd`). One person with many addresses gets the Free allowance many times. They cannot pass the
   site's day, but they can use it up for everyone, you and the listed accounts included, until the next UTC midnight.
3. **The human check on the recovery pages** (`TURNSTILE_RECOVERY_REQUIRED` in the API file). Sign-up and its resend
   always have the bot check. The three recovery starts (password reset, second-factor recovery, account recovery)
   have it only with this setting on, and the website has no check on those pages yet: with the setting on, every
   recovery start is refused, yours included. Off, as today: anyone can start them for any address they type; their
   mail is security mail and may use all of `daily_limit` (`outboundMailPolicy`), the share receipts use too. Each
   network has its own start budget, which slows this but does not stop many networks. OPENCHECK shows the day's mail
   against that limit. Changing the setting is not a step of this document: ask.
4. **NETOPIA's tester:** listed or not (5.8b step 2 has the three ways its test payment can go). Never list it when
   it will buy as a Romanian buyer: a sandbox purchase as a Romanian buyer blocks real payments for about 14.6 hours
   (3.2).
5. **Who else you list.** Part 6's rules for friends who buy hold for every listed account: you withdraw each sandbox
   plan within 14 days of its purchase (or its holder cancels it) before part 7; nobody buys as a Romanian buyer; a
   payment page left unfinished blocks real payments for up to 24 hours. The simplest choice: nobody but the team
   buys.
6. **The words on buying.** The site shows the plans and their prices to every signed-in account, but while payments
   are in test mode only invited accounts can buy. Decide whether the Terms, the test-mode note, or both must say
   that buying is open only to invited accounts while payments are in test mode. Changing either needs an upload, so
   decide before you open.
7. **Public debates.** Open with publishing on (5.9), or without it, knowing that the line under the question box and
   the Terms say a finished Free debate is public while none becomes public, and that the Report button then has
   nothing to act on.

**The AI check, read at the server (AICHECK).** It only reads, and it prints names, states and counts, never an amount.
It checks that the release sends the check through the Anthropic gate, that the API file names the gate's socket, and
that the gate's GO lets the API's user call it and enables `claude-haiku-5-5`; then it shows the gate's state and the
day's count of its calls, and what the checks did in the last day. Run it before you open, and again in the test of
6b.2 step 4.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# AICHECK: whether the AI check for publication and reports can go through the Anthropic gate, and what it did in the last day (read-only; prints names, states and counts, never an amount).
GO=/etc/debateai-v3-preview/provider-anthropic-go-v1.json
NO=''
nope() { echo "not ready: $1"; NO=1; }
[ -f "$CAPI/dialectical-engine/apps/api/src/publication-check/gate-transport.ts" ] || nope "this release sends the check through no gate (the upload of a release that does comes first)"
[ -n "$(sed -n 's/^PREVIEW_PROVIDER_TEST_CONFIG_JSON=//p' "$A" | jq -r '.anthropic_budget_socket // empty' 2>/dev/null || true)" ] || nope "the API file names no Anthropic gate socket (anthropic_budget_socket in PREVIEW_PROVIDER_TEST_CONFIG_JSON)"
U=$(id -u "$AU")
if [ -f "$GO" ]; then
  jq -e --argjson u "$U" '.allowed_peer_uids | index($u) != null' "$GO" >/dev/null 2>&1 || nope "the Anthropic gate's GO does not let the API's user ($AU, uid $U) call it"
  jq -e '.enabled_models | index("claude-haiku-5-5") != null' "$GO" >/dev/null 2>&1 || nope "the Anthropic gate's GO does not enable claude-haiku-5-5"
else
  nope "$GO is missing"
fi
S=$(gs "$GAN" "$PAN" 2>/dev/null) || S='{}'
echo "the Anthropic gate: $(jq -c '{state, window_open, enabled_models, calls_today: .today_posts, in_flight, refused_unbilled_today: .today_unbilled_releases}' <<<"$S" 2>/dev/null || echo 'did not read')"
[ "$(jq -r '"\(.state) \(.window_open)"' <<<"$S" 2>/dev/null || true)" = 'active true' ] || nope "the Anthropic gate is not active with its window open (GATES, 6.2)"
db() { psqlq "$1" 2>/dev/null || echo 'did not read'; }
echo "publication checks in the last day (outcome, cause, count):"
db "SELECT concat_ws(' ', outcome, coalesce(failure_cause, '-'), count(*)) FROM serve.publication_check_record WHERE attempted_at > clock_timestamp() - interval '1 day' GROUP BY outcome, failure_cause ORDER BY outcome, failure_cause"
echo "Report button checks in the last day (verdict, count):"
db "SELECT concat_ws(' ', coalesce(verdict, 'not yet'), count(*)) FROM identity.public_flag WHERE created_at > clock_timestamp() - interval '1 day' GROUP BY verdict ORDER BY verdict"
echo "Free debates (waiting, public in the last day, kept private in the last day): $(db "SELECT concat_ws(' ', count(*) FILTER (WHERE outcome IS NULL), count(*) FILTER (WHERE outcome = 'PUBLISHED' AND decided_at > clock_timestamp() - interval '1 day'), count(*) FILTER (WHERE outcome = 'REFUSED' AND decided_at > clock_timestamp() - interval '1 day')) FROM identity.free_public_ask")"
echo "end-of-debate checks in the last day: $(db "SELECT concat_ws(', ', 'answered ' || (SELECT count(*) FROM serve.synthesis_check_result WHERE final AND checked_at > clock_timestamp() - interval '1 day'), (SELECT string_agg('UNAVAILABLE ' || failure_code || ' ' || n, ', ' ORDER BY failure_code) FROM (SELECT failure_code, count(*) AS n FROM serve.synthesis_check_result WHERE NOT final AND checked_at > clock_timestamp() - interval '1 day' GROUP BY failure_code) AS unanswered), 'deleted ' || ((SELECT count(*) FROM serve.synthesis_check_removal_request WHERE requested_at > clock_timestamp() - interval '1 day') + (SELECT count(*) FROM identity.synthesis_check_erasure_binding WHERE created_at > clock_timestamp() - interval '1 day')))")"
[ -z "$NO" ] || { echo "AICHECK_NOT_DONE: the check cannot go through the Anthropic gate (the lines above say why): ask"; exit 1; }
echo AICHECK_DONE
exit 0
```

Read the lines before the last one:
- `not ready: …` lines name what stops the check. The socket in the API file is an env change that comes with an
  upload; a GO that leaves out the API's user or the model changes only as the Anthropic gate's guide says
  (`deploy/preview-gate/v3/README-anthropic.md`). Either way, ask.
- `the Anthropic gate:` shows its state, whether its window is open, the models it serves, its paid calls today
  (`calls_today`, the debates' calls and the checks' together), the calls in flight, and today's calls the vendor
  refused without billing.
- `publication checks in the last day`: one line per outcome and cause. `ALLOW -`, `BLOCK -` and `UNSURE -` are the
  check's answers; `UNSURE` means it was not sure, and like `BLOCK` it keeps what it checked private for good (a Free
  debate stays private, a contribution stays off the page). `UNAVAILABLE JUDGE_NOT_CONFIGURED` means the check is off; `UNAVAILABLE JUDGE_TRANSPORT_FAILED` or
  `JUDGE_DEADLINE` means the gate refused, was busy or did not answer in time: the debate waits, and the API tries
  again. The other causes an `UNAVAILABLE` line can carry: `JUDGE_HTTP_STATUS`, the AI company answered with an error,
  which the gate passed on; `JUDGE_ANSWER_NOT_JSON`, the answer was cut off or could not be read; `JUDGE_ANSWER_SCHEMA`,
  the answer could be read but was not in the form the check asks for; `JUDGE_ANSWER_UNKNOWN_PART`, the answer named a
  part of the debate the check did not send; `JUDGE_DOOR_REFUSED`, the site's own guard would not send the text, so
  nothing left the server. With every one of them nothing is published and nothing is hidden, and the API tries again.
  No line means no check ran in the last day.
- `Report button checks in the last day`: one line per verdict. `NOT_FOUND`, `UNSURE` and `AGREE` are the check's
  answers; `UNAVAILABLE` means it did not answer, and the report went to a person. `not yet` counts reports the check
  has given no verdict on: one it is still reading, or one that went to a person without it (for example a report on a
  debate that was already hidden once).
- `Free debates`: how many wait (finished or not yet), and how many went public or were kept private in the last day.
- `end-of-debate checks in the last day` (5.1b): `answered` counts the checks that gave an answer. The answer itself
  (clear, flagged, or no conclusion to read) is sealed with each debate's own key, so this line cannot tell them apart.
  `UNAVAILABLE` and a cause count the checks that gave none, and that debate's answer showed unchecked: `DEADLINE`, no
  answer in time; `TRANSPORT_FAILED`, the gate refused the call (busy, halted, or its day used up) or the line failed;
  `HTTP_STATUS`, the AI company answered with an error; `ANSWER_NOT_JSON` or `ANSWER_SCHEMA`, an answer cut off or not
  in the form asked for; `MONEY_REFUSED`, the site's own day was used up; `NOT_CONFIGURED`, the check is off. Any other
  cause: ask. `deleted` counts the debates the check deleted for touching "tendencies to suicide or harming other
  people". It also counts a debate that was already public when the check asked for its deletion: its page comes
  down and it is deleted too, when its owner's account is active (5.1b).

### 6b.2 The steps, in order

Each step is yours, at the server or in the browser. Each API restart shows an error page for a minute or more: pick
quiet minutes.
1. The upload of a release that carries 6b (the release guide), then everything 6b.1 asks.
2. ASKS_OPEN (6.1) with the line `V=everyone-with-listed-buyers`, while the site password is still on. Expect
   `payments: sandbox`, the API's line `{"event":"api.preview.asks_open","to":"everyone-with-listed-buyers"}`,
   `listed buyers: <how many> (the team line)`, on a release that carries the Team page's list the line that the list
   is empty, then `ASKS_OPEN_DONE`. If it refuses because accounts from an earlier opening are still on the Team page's
   list, remove them there first (6.1).
3. List each account you allow now that has signed up already: on the Team page (6b.3), with the team tools unlocked
   (UNLOCK, 5.7 step 3); on a release before the Team page's list, BUYERS (6b.3b) instead.
4. A test behind the password, with the password typed:
   - an account that is not listed asks a short question: the debate starts;
   - that account opens a plan from `/pricing`: the whole order page shows, with its price; at **Abonați-vă și
     plătiți** the sentence shows; SANDBOXLIST (3.3) is unchanged;
   - only if you want a test plan: a listed account that is not the one you will pay with in part 7 (3.2's rules) buys
     with the test card, and finishes NETOPIA's page;
   - the AI check (skip this if you open without it, decision 1, or with publishing off, 5.9): run AICHECK (6b.1)
     and note `calls_today`. A test
     account of yours on the Free plan asks a short question. A few minutes after its story is written, the debate
     shows on the home page's **Public** tab: the end-of-debate check answers first (at most two minutes after the
     debate finished), then the AI check for publication. If AICHECK showed `UNAVAILABLE` lines just before, the API
     may still be in its wait after those failures, and it can take up to an hour. If it does not show and AICHECK has
     no `UNAVAILABLE` lines, the end-of-debate check may have flagged it: that account sees the flag only on
     `/debate/<id>` (5.1b). Ask. Then, on a test public debate, press the Report button with a claim that is
     plainly not on its page (for example that it names someone's home address): the answer comes back within about
     20 seconds, usually that the report was stopped automatically ("Nu am dat curs acestei raportări", in English "We
     have not acted on this report"). "O persoană o va citi" ("A person will read this") means the check did not answer
     or was unsure. Run AICHECK again: `calls_today` has gone up, the publication checks show an `ALLOW -` line, and the
     Report button checks show your report's verdict (`UNAVAILABLE` there means the check did not answer: ask). The
     end-of-debate checks count your test debate among the `answered` ones (`answered 0` with `UNAVAILABLE` causes:
     ask). Hide the test debate afterwards (Hide now) if it must not stay public.
5. REVIEW_CLOSE (5.8), if the review window is open.
6. PWOFF1 (8.2), the hand edit of 8.2 (its two cases: the robots line is added only when PWOFF1 says the file sends
   none), then PWOFF2 (8.3). On any failed check PWOFF2 puts the password back by itself.
7. By hand, in a private window that never had the site password: Chrome and Safari on the Mac, and the phone on
   mobile data. No password box anywhere, not while a page loads and not in the next minute; a sign-up works and its
   mail arrives; a Free question starts; a plan's button leads to the order page, and for an account that is not
   listed the last button shows the sentence; the `/cancel` form answers. Optional: SIGNUPS once in and once out
   (6.5 (c)), to see the 503.
8. OPENCHECK (6b.4).
9. NETOPIA: 5.8b, steps 1 to 4, with 6b's words. List its tester (6b.3) if you chose that.

Every morning while 6b is open: OPENCHECK, GATES (6.2; its amounts stay on your screen), AICHECK (6b.1), the Public tab
and the report mails.

### 6b.3 Add or remove a buyer on the Team page

On a release that carries the Team page's list (6b, "Before the release that carries the Team page's list"), while 6b
is open. Nothing restarts, and nobody else sees the box: the Team page shows it to the Owner alone, and only while
payments are NETOPIA's sandbox.

**To allow an account to buy:**
1. The account has signed up already (the person did it; you cannot do it for them).
2. Unlock the team tools: UNLOCK (5.7, step 3), as root. It keeps them unlocked for one hour; nothing restarts. Every
   addition, like every other change on the Team page, needs them unlocked, and sends the security alert to your
   alert address.
3. In the browser where your staff key works on dezbatere.ro, open https://dezbatere.ro/admin/team (type the
   address), and verify your key as usual (**Verify security key for team access**).
4. In the box **Who may buy while payments are in test mode**, type the person's address in **The account's email
   address** and press **Allow to buy**. The address goes to the server only inside the request; it is never stored
   in the list, never shown back in full, and never written in a log.
5. The box asks, for example: "Allow ste•••n.n•••our@example.com to buy test plans? Each test plan it buys must be
   withdrawn or cancelled within 14 days, before real payments." The shortened address keeps the start, the middle
   and the end of the part before the @, and the domain whole, so you can tell whose account it is
   (stefan.nour@example.com reads `ste•••n.n•••our@example.com`). It never shows that part whole: a name of one or two
   characters before the @ shows only the dots (`•••@example.com`), and one of three or four only its first character.
   If it is not the person you mean, press **Cancel**. Otherwise press **Confirm** and touch your key.
6. Expect "Done: this account can buy now.", and a new row: the shortened address and "allowed on <date>". The line
   above the rows counts the accounts that can buy, the team included. The security alert arrives at your alert
   address within a minute or two.
7. Lock the tools again when you are done: `systemctl stop debateai-preview-team-unlock` (they lock by themselves
   after one hour anyway).

The person is not told: no mail goes to them. Tell them yourself, with the rules of 6b.1 (decision 5).

**To stop an account from buying:** press **Remove** on its row, then **Confirm**, and touch your key. It works while
the team tools are locked (no UNLOCK); a removal made while they are locked sends no alert, but is recorded like every
change. Expect "Done: this account can no longer start a purchase." Its next checkout or upgrade is refused at the last
button. A plan it holds goes on until it is withdrawn or cancelled, as "Taking an account off the list" below says.

**What the box may say instead:**
- "No account uses that address. The person must sign up first.": check the address; the account must exist and be
  active.
- "That account is on the team: it can buy already." or "That account can buy already.": nothing to do.
- "The list is full (… accounts, the team included). Remove one first.": the team line and the Team page's list
  together are at the cap (6b, "The list").
- "The list changed meanwhile. Nothing changed: look at the list again and repeat.": the list changed in another
  window or by an account's erasure; read the box again and repeat.
- "The team tools are locked, so nothing was added. …": UNLOCK (5.7, step 3), then again.
- "Adding works only while the whole site is open with test payments. …": 6b is not open (or it closed): the box
  then says that the list counts for nothing right now, counts only the accounts on it ("Accounts on this list: …"),
  and offers only **Remove**.
- "Nothing changed.": the key's prompt was closed or timed out; press the button again.
- "This did not go through. …": read the box again; if it says it twice, ask.

The box keeps every change in the database (who, when, which account, added or removed), never the address. When an
account is erased, its rows go with it.

### 6b.3b Add or remove a buyer at the server (BUYERS)

On a release before the Team page's list, BUYERS is the way to list buyers. On a release that carries that list,
BUYERS refuses `W=add` (allow the account on the Team page instead) and is left only for `W=remove`, to take off an
account an earlier BUYERS run put on the team line.

BUYERS puts one account on the list, or takes it off. Fill in `W` (`add` or `remove`), then type the account's address
at the prompt: it is never printed and never kept. The account must have signed up already. The script checks
everything first, keeps both files as they were, writes the same new list into both, runs the release check's
`same`, restarts the API, and checks the API's count line. On any refusal both files come back. It never runs during
an upload (its names file stops it while a release is staged or draining, and the order rules forbid it from SB3 on).

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# BUYERS: one account put on the list of buyers, or taken off it (6b). The address you type is never printed or kept. Both files get the same new list; only the API restarts. On any refusal both files come back.
W=add                                                     # add, or remove
declare -F upfail >/dev/null || { echo "BUYERS_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then BUYERS"; exit 1; }
case "$W" in add|remove) ;; *) echo "BUYERS_NOT_DONE: W is not add or remove; nothing changed"; exit 1;; esac
[ "$(grep -cx 'PREVIEW_ASKS_OPEN_TO=everyone-with-listed-buyers' "$A" || true)" = 1 ] && [ "$(grep -cx 'PREVIEW_ASKS_OPEN_TO=everyone-with-listed-buyers' "$RF" || true)" = 1 ] || { echo "BUYERS_NOT_DONE: the two files do not both hold everyone-with-listed-buyers (ASKS_OPEN first, 6b.2); nothing changed"; exit 1; }
said -xF '{"event":"api.preview.asks_open","to":"everyone-with-listed-buyers"}' || { echo "BUYERS_NOT_DONE: the running API does not say asks open to everyone-with-listed-buyers; nothing changed: ask"; exit 1; }
[ -s "$M/asks/names.sh" ] || { echo "BUYERS_NOT_DONE: $M/asks/names.sh is missing (asks were not opened by ASKS_OPEN); nothing changed: ask"; exit 1; }
. "$M/asks/names.sh"                                      # ASKS_ARCHIVE, ASKS_LABEL, ASKS_AT
[ "$(grep -c '^PREVIEW_TEAM_USER_IDS_JSON=' "$A")" = 1 ] && [ "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$A")" = "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$RF" || true)" ] || { echo "BUYERS_NOT_DONE: the API and runner files do not hold the same one list; nothing changed: ask"; exit 1; }
for F in "$A" "$RF"; do [ -z "$(tail -c1 "$F")" ] || { echo "BUYERS_NOT_DONE: $F does not end in a newline; nothing changed"; exit 1; }; done
OLD=$(sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$A" | jq -c 'if type == "array" and all(.[]; type == "string") then . else error("not a list") end' 2>/dev/null || true)
[ -n "$OLD" ] || { echo "BUYERS_NOT_DONE: the list does not read as a JSON list; nothing changed: ask"; exit 1; }
# The list's size cap, by its name in this release's code; never printed.
CAP=$(sed -n 's/^export const PREVIEW_TEAM_MAX_MEMBERS = \([1-9][0-9]*\) as const;$/\1/p' "$CAPI/dialectical-engine/packages/providers/src/preview-test.ts" 2>/dev/null || true)
[ -n "$CAP" ] || { echo "BUYERS_NOT_DONE: the list's size cap (PREVIEW_TEAM_MAX_MEMBERS) does not read from this release's code; nothing changed: ask"; exit 1; }
# A release that carries the Team page's list adds buyers there, with no restart; BUYERS then only takes off what an earlier BUYERS run put on the team line.
[ "$W" = remove ] || [ ! -f "$CAPI/dialectical-engine/apps/api/src/staff/preview-buyers.ts" ] || { echo "BUYERS_NOT_DONE: this release carries the Team page's list: allow the account there (6b.3), with no restart; BUYERS only takes off an account an earlier BUYERS run put on the team line; nothing changed"; exit 1; }
read -r -p 'The address of the account: ' ADDR < /dev/tty
OR=$(printf '%s\n' "$ADDR" | RUNAPI apps/api/src/billing/withdraw-cli.ts --owner-of-email | sed -n 's/^owner_ref: //p' || true); unset ADDR
printf '%s\n' "$OR" | grep -qxE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || { echo "BUYERS_NOT_DONE: no account with that address; nothing changed"; exit 1; }
TU=$(psqlq "SELECT user_id FROM identity.\"user\" WHERE owner_ref = '$OR'") || { echo "BUYERS_NOT_DONE: the database did not answer; nothing changed: ask"; exit 1; }
printf '%s\n' "$TU" | grep -qxE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || { echo "BUYERS_NOT_DONE: that account has no user to list; nothing changed: ask"; exit 1; }
ON=$(jq -r --arg u "$TU" 'any(.[]; . == $u)' <<<"$OLD")
if [ "$W" = add ]; then
  [ "$ON" = false ] || { echo "BUYERS_NOT_DONE: that account is on the list already; nothing changed"; exit 1; }
  NEW=$(jq -c --arg u "$TU" '. + [$u]' <<<"$OLD")
else
  [ "$ON" = true ] || { echo "BUYERS_NOT_DONE: that account is not on the list; nothing changed"; exit 1; }
  NEW=$(jq -c --arg u "$TU" 'map(select(. != $u))' <<<"$OLD")
fi
NB=$(jq length <<<"$NEW")
[ "$NB" -le "$CAP" ] || { echo "BUYERS_NOT_DONE: the list would hold more accounts than PREVIEW_TEAM_MAX_MEMBERS allows; nothing changed: take one off first"; exit 1; }
BU=$ASKS_ARCHIVE/buyers-$(date -u +%Y%m%dT%H%M%SZ)
[ ! -e "$BU" ] || { echo "BUYERS_NOT_DONE: $BU exists; nothing changed: run BUYERS again a second later"; exit 1; }
install -d -o root -g root -m 0700 "$BU"
for F in "$A" "$RF"; do cp -p "$F" "$BU/$(basename "$F").before"; done
back() { for F in "$A" "$RF"; do cp -p "$BU/$(basename "$F").before" "$F"; done; }
for F in "$A" "$RF"; do ( umask 077; grep -v '^PREVIEW_TEAM_USER_IDS_JSON=' "$F" > "$F.new"; printf 'PREVIEW_TEAM_USER_IDS_JSON=%s\n' "$NEW" >> "$F.new" ); chown --reference="$F" "$F.new"; chmod --reference="$F" "$F.new"; mv "$F.new" "$F"; done
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" || { back; echo "BUYERS_NOT_DONE: a SAME check is BAD (above); both files are back, nothing restarted"; exit 1; }
[ "$(grep -cxF "PREVIEW_TEAM_USER_IDS_JSON=$NEW" "$A")" = 1 ] && [ "$(grep -cxF "PREVIEW_TEAM_USER_IDS_JSON=$NEW" "$RF")" = 1 ] && [ "$(grep -c '^PREVIEW_TEAM_USER_IDS_JSON=' "$RF")" = 1 ] || { back; echo "BUYERS_NOT_DONE: the two files do not both hold the new list once; both are back, nothing restarted"; exit 1; }
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the new list'); back; { apistart && webup; } || { echo "BUYERS_NOT_DONE: $WHY; both files are back, but the API or the website did not start on them either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "BUYERS_NOT_DONE: $WHY; both files are back, and the API and the website started on them"; exit 1; fi
said -xF "{\"event\":\"api.preview.listed_buyers\",\"count\":$NB}" || { echo "BUYERS_NOT_DONE: the API does not say the $NB listed buyers the files hold: ask"; exit 1; }
echo "listed buyers now: $NB"
if [ "$W" = remove ]; then
  H=$(psqlq "SELECT (SELECT count(*) FROM billing.subscription_latest_v s JOIN billing.subscription_event c ON c.subscription_id = s.subscription_id AND c.kind = 'CREATED' WHERE s.owner_ref = '$OR' AND jsonb_extract_path_text(c.data, 'payment_environment') = 'sandbox' AND s.kind NOT IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED')) + (SELECT count(*) FROM billing.charge g WHERE g.owner_ref = '$OR' AND g.payment_environment = 'sandbox' AND g.kind IN ('INITIAL', 'UPGRADE') AND NOT EXISTS (SELECT 1 FROM billing.charge_event f WHERE f.charge_id = g.charge_id AND f.kind IN ('SUCCEEDED', 'FAILED')) AND NOT EXISTS (SELECT 1 FROM billing.subscription_latest_v e WHERE e.subscription_id = g.subscription_id AND e.kind IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED')))" || echo unknown)
  case "$H" in
    0) echo "this account holds no open sandbox plan and no unfinished payment page";;
    ''|*[!0-9]*) echo "LOOK: whether this account still holds a sandbox plan did not read: run SANDBOXLIST (3.3)";;
    *) echo "LOOK: this account still holds an open sandbox plan or an unfinished payment page; it goes on until it is withdrawn (WITHDRAWOTHER, 3.3, within 14 days of its purchase, after you tell them) or they cancel it";;
  esac
fi
unset OR TU
echo BUYERS_DONE
exit 0
```

Expect `listed buyers now: <how many>`, then `BUYERS_DONE`; when you removed an account, one more line before it says
whether that account still holds an open sandbox plan or an unfinished payment page.

**Taking an account off the list** stops its new checkouts and upgrades only. A plan it holds keeps renewing on its
saved test card, and its holder can still change that card, until the plan is withdrawn or cancelled: run
WITHDRAWOTHER (3.3) within 14 days of its purchase, after you tell them, or ask them to cancel it in Settings or on
`/cancel`. A NETOPIA page it opened while it was listed can still be paid for up to a day. Taking everyone off leaves
the list empty (`[]`): nobody may buy. To stop all buying by anyone outside the team at once, PWON is faster (6b.5); a
payment page opened earlier can still be paid for up to a day.

**If it stops:**
- `no account with that address`: check the address you typed; the account must have signed up first.
- `the list would hold more accounts than PREVIEW_TEAM_MAX_MEMBERS allows`: take someone off first.
- `the API refused the new list …`: both files are back and the API runs on them; ask.
- `the API does not say the <how many> listed buyers the files hold`: the API started on the new files but its count
  line is missing; run OPENCHECK, and ask.
- `this release carries the Team page's list: allow the account there (6b.3) …`: use the Team page; nothing changed.

### 6b.4 The morning check (OPENCHECK)

OPENCHECK only reads. Run it every morning while 6b is open, after a later upload (once the first line of names.sh
names it), and whenever something looks wrong.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# OPENCHECK: the morning check while 6b is open (read-only). The value and the team line in both files and in the running API's lines; the open site's answers; the gates; the day's mail against its limit; the Team page's list; the plans and payment pages of accounts not on the list. It prints counts and yes or no, never an address, an id or an amount of money.
BAD=''; bad() { echo "CHECK_FAILED: $1"; BAD=yes; }
code() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$@" || true; }
ID='"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"'; LIST="\[($ID(,$ID)*)?\]"
# The value, the payments and the list, in the files and in the running API's lines.
[ "$HOST" = dezbatere.ro ] || bad "the API answers as $HOST, not dezbatere.ro"
[ "$(grep -cx 'PREVIEW_ASKS_OPEN_TO=everyone-with-listed-buyers' "$A" || true)" = 1 ] && [ "$(grep -cx 'PREVIEW_ASKS_OPEN_TO=everyone-with-listed-buyers' "$RF" || true)" = 1 ] || bad "the two files do not both hold everyone-with-listed-buyers"
said -xF '{"event":"api.preview.asks_open","to":"everyone-with-listed-buyers"}' || bad "the running API does not say asks open to everyone-with-listed-buyers"
grep -qxE 'NETOPIA_API_BASE_URL=https://secure(-sandbox|\.sandbox)\.netopia-payments\.com' "$A" && [ "$(grep -c '^PREVIEW_LIVE_PAYMENTS=' "$A" || true)" = 0 ] || bad "payments are not NETOPIA's sandbox"
J=$(sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$A" | jq -c . 2>/dev/null || true)
if [ "$(grep -c '^PREVIEW_TEAM_USER_IDS_JSON=' "$A" || true)" = 1 ] && [ "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$A")" = "$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$RF" || true)" ] && printf '%s\n' "$J" | grep -qxE "$LIST"; then
  NB=$(jq length <<<"$J"); echo "listed buyers in the files: $NB"
  said -xF "{\"event\":\"api.preview.listed_buyers\",\"count\":$NB}" || bad "the running API does not say the $NB listed buyers the files hold (restarted since the last change of the list?)"
else J=''; bad "the API and runner files do not hold the same one list of account ids"; fi
# The open site, from outside, and the edge.
[ -s "$M/password/Caddyfile.open" ] && cmp -s "$C" "$M/password/Caddyfile.open" || bad "the live Caddyfile is not the one PWOFF2 put in place (or SIGNUPS kept)"
[ "$(code "https://$HOST/login")" = 200 ] || bad "the Log in page does not answer 200 without the site password"
[ "$(curl -sI "https://$HOST/" | tr -d '\r' | grep -ci '^x-robots-tag: noindex, nofollow$' || true)" = 1 ] || bad "/ does not send the robots header exactly once"
[ "$(code "https://$HOST/readyz")" = 404 ] || bad "/readyz is not refused from outside"
[ -s "$M/name/notify-code.before-dezbatere" ] && [ "$(notify "$HOST")" = "$(cat "$M/name/notify-code.before-dezbatere")" ] || bad "a NETOPIA notice is not passed through as before"
[ "$(code http://127.0.0.1:3090/readyz)" = 200 ] || bad "the edge's readiness"
if gatesok; then echo "the four spending gates: active, with their window open"; else bad "a spending gate is not active with its window open (GATES, 6.2, shows which)"; fi
# Yesterday's and today's mail (UTC) against daily_limit, the outboundMailPolicy row at the API file's register version.
RV=$(sed -n 's/^REGISTER_VERSION=//p' "$A"); ML=''
if printf '%s\n' "$RV" | grep -qxE '[1-9][0-9]*'; then ML=$(psqlq "SELECT d.day || ' ' || coalesce(c.standard_sent + c.security_sent, 0) || ' ' || (coalesce(c.standard_sent + c.security_sent, 0) * 100 / (r.value_json ->> 'daily_limit')::integer) || ' ' || (c.standard_limit_at IS NOT NULL) || ' ' || (c.daily_limit_at IS NOT NULL) FROM (VALUES ((now() AT TIME ZONE 'UTC')::date - 1), ((now() AT TIME ZONE 'UTC')::date)) AS d(day) CROSS JOIN register.register_row r LEFT JOIN identity.outbound_mail_daily_count c ON c.day = d.day WHERE r.register_version = $RV AND r.row_key = 'outboundMailPolicy' ORDER BY d.day" || true); fi
if [ "$(printf '%s\n' "$ML" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]+ [0-9]+ (true|false) (true|false)$' || true)" = 2 ]; then
  while read -r DAY SENT SHARE SIGNUP ALL; do
    echo "mail on $DAY (UTC): $SENT handed to the mail program, $SHARE% of daily_limit; sign-up mail stopped: $([ "$SIGNUP" = true ] && echo yes || echo no); all mail stopped: $([ "$ALL" = true ] && echo yes || echo no)"
    [ "$SIGNUP/$ALL" = false/false ] || echo "LOOK: mail stopped on $DAY: new sign-ups could not finish that day (and with all mail stopped, password resets and receipts waited too): decide with SIGNUPS (6.5 (c)), or ask"
  done <<<"$ML"
else bad "the day's mail count and its limit do not read"; fi
# The opening's time, and every team line since then: the one ASKS_OPEN kept, every copy BUYERS kept, and the line now.
AT=''; EVER=''
if [ -s "$M/asks/names.sh" ]; then . "$M/asks/names.sh"; AT=${ASKS_AT:-}; fi
if [ -n "$J" ] && printf '%s\n' "$AT" | grep -qxE '[0-9]+'; then
  EVER=$( { for F in "$ASKS_ARCHIVE/api-$ASKS_LABEL.env.before-open" "$ASKS_ARCHIVE"/buyers-*/api-*.env.before "$A"; do [ ! -e "$F" ] || sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$F"; done; } | jq -cs 'add | unique' 2>/dev/null || true)
fi
# The Team page's list (6b.3), on a database that holds it: how many accounts are on it; with the team line, how many may buy, against the cap read from this release's code, never printed; its changes since the opening; the open sandbox plans of its accounts and how many days ago the oldest was bought, a reminder of the 14 days to withdraw each, never a failure. On a release that carries the list: whether the API's login may read it, and whether the API could not read it at a pay button since its start.
LT=$(psqlq "SELECT to_regclass('staff.preview_buyer_event') IS NOT NULL" || true)
TP=no; [ ! -f "$CAPI/dialectical-engine/apps/api/src/staff/preview-buyers.ts" ] || TP=yes
LISTED="SELECT l.user_id FROM (SELECT DISTINCT ON (user_id) user_id, kind FROM staff.preview_buyer_event ORDER BY user_id, revision DESC) l WHERE l.kind = 'ADDED'"
if [ "$LT" = t ] && [ -n "$J" ] && [ -n "$EVER" ]; then
  LN=$(psqlq "SELECT count(*) FROM (SELECT DISTINCT ON (user_id) kind FROM staff.preview_buyer_event ORDER BY user_id, revision DESC) l WHERE l.kind = 'ADDED'" || true)
  MB=$(psqlq "SELECT count(*) FROM (SELECT jsonb_array_elements_text('$J'::jsonb) AS id UNION SELECT user_id::text FROM ($LISTED) n) b" || true)
  CH=$(psqlq "SELECT count(*) FILTER (WHERE kind = 'ADDED') || ' ' || count(*) FILTER (WHERE kind = 'REMOVED') FROM staff.preview_buyer_event WHERE recorded_at >= to_timestamp($AT)" || true)
  CAP=$(sed -n 's/^export const PREVIEW_TEAM_MAX_MEMBERS = \([1-9][0-9]*\) as const;$/\1/p' "$CAPI/dialectical-engine/packages/providers/src/preview-test.ts" 2>/dev/null || true)
  if printf '%s\n' "$LN" | grep -qxE '[0-9]+' && printf '%s\n' "$MB" | grep -qxE '[0-9]+' && printf '%s\n' "$CH" | grep -qxE '[0-9]+ [0-9]+' && [ -n "$CAP" ]; then
    echo "accounts on the Team page's list: $LN; accounts that may buy, the team line included: $MB"
    echo "changes on the Team page's list since the opening: ${CH% *} added, ${CH#* } removed"
    LP=$(psqlq "SELECT count(*) || ' ' || coalesce(max(floor(extract(epoch FROM now() - coalesce(a.bought, c.at)) / 86400))::bigint, 0) FROM billing.subscription_latest_v s JOIN billing.subscription_event c ON c.subscription_id = s.subscription_id AND c.kind = 'CREATED' LEFT JOIN LATERAL (SELECT min(b.at) AS bought FROM billing.subscription_event b WHERE b.subscription_id = s.subscription_id AND b.kind = 'ACTIVATED') a ON true WHERE jsonb_extract_path_text(c.data, 'payment_environment') = 'sandbox' AND s.kind NOT IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED', 'CREATED') AND EXISTS (SELECT 1 FROM identity.\"user\" u WHERE u.owner_ref = s.owner_ref AND u.user_id IN ($LISTED))" || true)
    if ! printf '%s\n' "$LP" | grep -qxE '[0-9]+ [0-9]+'; then echo "open sandbox plans of accounts on the Team page's list: did not read (SANDBOXLIST, 3.3, lists every open sandbox plan)"
    elif [ "${LP% *}" = 0 ]; then echo "open sandbox plans of accounts on the Team page's list: 0"
    else echo "open sandbox plans of accounts on the Team page's list: ${LP% *}; the oldest was bought ${LP#* } day(s) ago (withdraw each within 14 days of its purchase, or its holder cancels it: 6b.1, 3.3)"; fi
    [ "$MB" -le "$CAP" ] || bad "more accounts may buy than PREVIEW_TEAM_MAX_MEMBERS allows: remove some on the Team page, then ask"
    if [ "$TP" = yes ]; then
      [ "$(psqlq "SELECT has_function_privilege('debateai_prod_api_runtime', 'staff.preview_buyer_listed(uuid)', 'EXECUTE')" || true)" = t ] || bad "the API's login may not read the Team page's list, so every account allowed there is refused at the pay button (503): ask"
      UA=$(inv "$API" | grep -cxF '{"event":"api.preview.buyer_check_unavailable"}' || true)
      [ "$UA" = 0 ] || echo "LOOK: since its start the API could not read the Team page's list $UA time(s), and refused those purchases with nothing charged: if it happens again, ask"
    elif [ "$LN" != 0 ]; then echo "LOOK: the accounts on the Team page's list cannot buy on this release, which does not carry that list (after a way back): they can again once a release that carries it is the current one"; fi
  else bad "the Team page's list does not read (the database did not answer, or the cap does not read from this release's code)"; fi
elif [ "$LT" = f ]; then [ "$TP" = no ] || bad "this release carries the Team page's list, but the database does not hold it: ask"
elif [ "$LT" != t ]; then bad "whether the database holds the Team page's list does not read (the database did not answer)"; fi
# Plans and payment pages of accounts not on the list now (not on the team line, and not on the Team page's list or suspended while on it: such an account cannot buy). A plan: a sandbox plan whose latest event is not ENDED, WITHDRAWN, ERASURE_STOPPED or CREATED (a cancelled plan still in its month counts). A payment page: a sandbox checkout or upgrade (a charge of kind INITIAL or UPGRADE) with neither a SUCCEEDED nor a FAILED event, on a plan that has not ended.
# Since the opening: checkouts and upgrades started at or after ASKS_OPEN by accounts on no team line since then and not on the Team page's list at any moment of the two minutes before the charge (the pay button's check comes a moment before the charge is written, and a removal may fall between). A refused checkout or upgrade writes no row, so this count must be 0. A charge of an account erased since has no account left to look up: those are counted on their own.
notlisted() { printf "NOT EXISTS (SELECT 1 FROM identity.\"user\" u WHERE u.owner_ref = %s.owner_ref AND u.user_id::text IN (SELECT jsonb_array_elements_text('%s'::jsonb)))" "$1" "$2"; }
notapproved() { if [ "$LT" = t ]; then printf "NOT EXISTS (SELECT 1 FROM identity.\"user\" u WHERE u.owner_ref = %s.owner_ref AND staff.preview_buyer_listed(u.user_id))" "$1"; else printf 'true'; fi; }
notapprovedthen() { if [ "$LT" = t ]; then printf "NOT EXISTS (SELECT 1 FROM identity.\"user\" u JOIN staff.preview_buyer_event e ON e.user_id = u.user_id WHERE u.owner_ref = %s.owner_ref AND e.kind = 'ADDED' AND e.recorded_at <= %s.created_at AND NOT EXISTS (SELECT 1 FROM staff.preview_buyer_event n WHERE n.user_id = e.user_id AND n.revision > e.revision AND n.recorded_at < %s.created_at - interval '2 minutes'))" "$1" "$1" "$1"; else printf 'true'; fi; }
if [ -z "$J" ]; then :
elif printf '%s\n' "$EVER" | grep -qxE "$LIST"; then
  PLANS=$(psqlq "SELECT count(*) FROM billing.subscription_latest_v s JOIN billing.subscription_event c ON c.subscription_id = s.subscription_id AND c.kind = 'CREATED' WHERE jsonb_extract_path_text(c.data, 'payment_environment') = 'sandbox' AND s.kind NOT IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED', 'CREATED') AND $(notlisted s "$J") AND $(notapproved s)" || true)
  PAGES=$(psqlq "SELECT count(*) FROM billing.charge g WHERE g.payment_environment = 'sandbox' AND g.kind IN ('INITIAL', 'UPGRADE') AND NOT EXISTS (SELECT 1 FROM billing.charge_event f WHERE f.charge_id = g.charge_id AND f.kind IN ('SUCCEEDED', 'FAILED')) AND NOT EXISTS (SELECT 1 FROM billing.subscription_latest_v e WHERE e.subscription_id = g.subscription_id AND e.kind IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED')) AND $(notlisted g "$J") AND $(notapproved g)" || true)
  SINCE=$(psqlq "SELECT count(*) FROM billing.charge g WHERE g.payment_environment = 'sandbox' AND g.kind IN ('INITIAL', 'UPGRADE') AND g.created_at >= to_timestamp($AT) AND EXISTS (SELECT 1 FROM identity.\"user\" x WHERE x.owner_ref = g.owner_ref) AND $(notlisted g "$EVER") AND $(notapprovedthen g)" || true)
  GONE=$(psqlq "SELECT count(*) FROM billing.charge g WHERE g.payment_environment = 'sandbox' AND g.kind IN ('INITIAL', 'UPGRADE') AND g.created_at >= to_timestamp($AT) AND NOT EXISTS (SELECT 1 FROM identity.\"user\" x WHERE x.owner_ref = g.owner_ref)" || true)
  NUM=yes; for CNT in "$PLANS" "$PAGES" "$SINCE" "$GONE"; do printf '%s\n' "$CNT" | grep -qxE '[0-9]+' || NUM=no; done
  if [ "$NUM" = no ]; then bad "the plans of accounts not on the list do not read (the database did not answer)"
  else
    echo "accounts not on the list now: open sandbox plans $PLANS, unfinished payment pages $PAGES"
    echo "checkouts and upgrades started since the opening by accounts never on the list: $SINCE"
    [ "$SINCE" = 0 ] || bad "an account that was never on the list started a checkout or an upgrade since the opening: the buyer rule did not hold: PWON now (6.5 (b)), then ask"
    [ "$PLANS/$PAGES" = 0/0 ] || echo "LOOK: plans or payment pages of accounts not on the list (from before the opening, of accounts you took off it, or of accounts suspended while on it): each goes on until it is withdrawn or cancelled; settle them as 3.3 says"
    [ "$GONE" = 0 ] || echo "LOOK: $GONE checkout(s) or upgrade(s) since the opening by accounts erased since: whether they were on the list no longer reads; if you know of no such erasure, ask"
  fi
else bad "the opening's time or the kept copies of the list do not read (ASKS_OPEN of this guide writes them): ask"; fi
[ -z "$BAD" ] || { echo "OPENCHECK_NOT_DONE: a check failed (above): when it is the buyer rule or the open site's answers, PWON now (6.5 (b)); then ask"; exit 1; }
echo OPENCHECK_DONE
exit 0
```

Expect, in order: `listed buyers in the files: <how many>` (the team line), the gates' line, two mail lines (yesterday
and today, UTC), on a database that holds the Team page's list its three lines (how many accounts are on it and how
many may buy with the team line; its changes since the opening; the open sandbox plans of its accounts), the two lines
about accounts not on the list, then `OPENCHECK_DONE`. It changes nothing, and it prints no address, no id and no
amount of money: the mail lines are counts and a share of the limit.

**What its counts mean.**
- `open sandbox plans` and `unfinished payment pages` of accounts not on the list now: a plan or a page from before
  the opening (an earlier sandbox test, a friends' test), of an account you took off the list, or of an account on the
  Team page's list that is suspended (it cannot buy while suspended). Each goes on until
  it is withdrawn or cancelled, and each blocks real payments: settle them as 3.3 says (WITHDRAWOTHER within 14 days
  of the purchase, after you tell them, or the holder cancels). A non-zero count is a `LOOK:` line, not a failure.
- `checkouts and upgrades started since the opening by accounts never on the list` must be 0: a checkout or an upgrade
  the API refuses writes no row. Not 0 means the buyer rule did not hold: PWON now (6.5 (b)), then ask. Do not
  withdraw anything before you ask. This count leaves out every account that was on the team line at any time since
  the opening (a purchase by an account after you took it off with BUYERS shows only in the `LOOK:` line above), and
  every purchase by an account that was on the Team page's list at any moment of the two minutes before it: the pay
  button checks the list a moment before the purchase is written, so an account you removed in between is not a
  failure of the rule.
- `accounts on the Team page's list` and `accounts that may buy, the team line included`: the second must stay within
  `PREVIEW_TEAM_MAX_MEMBERS` (its value is read from the release, never printed); past it is a `CHECK_FAILED`: remove
  some on the Team page, then ask. `changes on the Team page's list since the opening`: compare them with what you
  did; a change you did not make: PWON now, then ask (and look at the security alerts at your alert address).
- `open sandbox plans of accounts on the Team page's list`, and how many days ago the oldest was bought: a reminder,
  never a failure. Withdraw each such plan with WITHDRAWOTHER (3.3, after you tell them) within 14 days of its
  purchase, or its holder cancels it (6b.1, decision 5); after 14 days only its holder can cancel it. A plan counts
  from its purchase, whatever the account's state; `did not read` means the database did not answer this one question:
  SANDBOXLIST (3.3) lists every open sandbox plan.
- `CHECK_FAILED: the API's login may not read the Team page's list …`: every account allowed there is refused at the
  pay button (503), and nothing is charged: the rule still holds, so no PWON is needed; ask.
- `LOOK: since its start the API could not read the Team page's list …`: those purchases were refused with nothing
  charged. Once is a hiccup; if it comes back the next morning, ask.
- `LOOK: … checkout(s) or upgrade(s) since the opening by accounts erased since`: an account deleted since its
  purchase leaves its charge but no account to compare with the list, so it is counted here, not above. If you know
  of no erasure of a buyer's account, ask.
- A `LOOK: mail stopped` line: on that day new sign-ups could not finish (the ordinary share of `daily_limit` was
  used up), or all mail stopped. Decide whether to stop sign-ups for a while (SIGNUPS, 6.5 (c)), or ask about the
  limit.
- Any other `CHECK_FAILED` about the open site (the Log in page, the robots header, `/readyz`, the notices, the edge):
  PWON now, then ask.

### 6b.5 The brakes, and the way back

The brakes are those of 6.5, fastest first:
- (a) each gate's `stop`: all AI spending stops, at any time.
- (b) PWON (8.4): the password back on every page in about a second, at any time, even during an upload. 6b's value
  stays, but only the team, who know the password, can reach the site. To stop all buying by anyone outside the
  team at once, this is the brake (a payment page opened earlier can still be paid for up to a day).
- (c) SIGNUPS: sign-ups only. With the password off it checks the 503 itself.
- (d) ASKS_CLOSE: only after PWON (it refuses while the Log in page does not ask for the site password).
- (e) **Remove** on the Team page (6b.3), at any time, even while the team tools are locked and during an upload; or
  BUYERS with `W=remove` (6b.3b) for an account BUYERS listed: one account buys no more; a plan it holds goes on until
  it is withdrawn or cancelled.

**The way back.**
- Fastest: PWON. The site is then as it was before PWOFF1: behind the password, asks open, buying for the listed
  accounts. After PWON, REVIEW_OPEN can open the review window again (PWON moves PWOFF1's copies aside), and PWOFF1,
  the hand edit and PWOFF2 can open the whole site again.
- Fully: PWON, then ASKS_CLOSE (6.3). Asks and buying are the team's again, the team line kept before the opening is
  back in both files, the Team page's list counts for nothing, and the waiting debates of accounts not on the team are
  recorded failed. Then settle every sandbox plan the listed accounts bought (3.3), and run PAY0 (7.1) until it prints
  all zeros.
- To a release older than the one that carries 6b: PWON, then ASKS_CLOSE, first (an older API refuses the value, and
  lets anyone signed in buy on the sandbox). rbD-B puts back the database copy made at DR3: every account, debate and
  mail written since, strangers' included, is lost (part 9).
- From the release that carries the Team page's list to the release before it (WB2; both carry 6b, so 6b may stay
  open): first check that the security alert of every addition, and every removal made with the tools unlocked, that
  day has arrived at your alert address (5.6). After the switch, the accounts on the Team page's list are refused at
  the pay button and the team line still buys: it fails closed. That release's Team page has no box for the list, and
  its audit history there shows an error while the list's changes are in it, until the next upload brings back a
  release that carries the list (5.6). To list a buyer on that release, BUYERS (6b.3b).

### 6b.6 Before part 7

PAY_SWITCH refuses while any asks value is set and while the site password is off, and the live start refuses
`everyone-with-listed-buyers` (`PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_NOT_SANDBOX`). So, in this order:
1. PWON (8.4). From then on the people who signed up cannot reach the site until part 8 opens it again: not to sign
   in, and not to reach Settings (their data export or deletion), except by writing to the company's address. Tell
   them what you decided before you opened (6b.1): this document has no step that writes to them.
2. ASKS_CLOSE (6.3). Their waiting debates are recorded failed. It prints how many accounts are still on the Team
   page's list: remove each there now (**Remove**, your key; no UNLOCK needed). With real payments the box is no
   longer shown, and a later 6b opening refuses while any account is left on it (6.1).
3. Every sandbox plan the listed accounts bought, NETOPIA's tester's included, is withdrawn with WITHDRAWOTHER within
   14 days of its purchase (tell them first) or cancelled by its holder. After 14 days only the holder can cancel, and
   the live start waits until they do. Then PAY0 (7.1) until it prints all zeros.
4. PWNEW (7.0) only if someone outside the team ever had the site password (a friends' test of part 6, or NETOPIA's
   tester given it as 5.8b step 2 describes for the review window). 6b itself gives it to nobody.
5. Part 7 as written; later part 8, with `everyone`.

From the opening on, people outside the team have accounts on this server. A later change of the Terms or of the
Privacy Policy reaches them: ask before an upload that changes either.

---

## 7. Real payments

**Before you start:**
- NETOPIA approved and the contract is signed (1.1, 5.8b), and the SmartBill proof passed (1.2).
- The main name is open (part 5), and the billing check passes on it.
- Asks are closed (ASKS_CLOSE). The live start refuses `everyone-with-test-payments` and
  `everyone-with-listed-buyers`. After the switch you open asks with `everyone` (part 8), never with the friends'
  value or 6b's.
- If 6b was open: it is closed as 6b.6 says (PWON, ASKS_CLOSE, every plan the listed accounts bought withdrawn or
  cancelled, PAY0 printing all zeros). The site password is on again, and the people who signed up wait for part 8.
- If a friends' test ran (part 6), or NETOPIA's tester had the site password (5.8b): every plan they bought is closed
  (PAY0, 7.1, prints all zeros), and the site password is a new one that they never had (PWNEW, 7.0).
- Until your staff key works on dezbatere.ro (5.7), nobody can hide a published debate or settle a report by hand,
  and the test name is no way round either, because from PAY_SWITCH until PAY_BACK NAME5 refuses. The payment, refund
  and invoice steps need no staff screen, and 5.7 can be done while payments are real (STAFFMAIN restarts the API:
  pick a quiet minute, no checkout open). Taking real payments before 5.7, with the site password on and asks for the
  team only, was your decision; you do not need to ask again.
- The site password is on. While payments are real and asks are closed, the API refuses a checkout or a plan upgrade
  from any account not on the team (403 `PREVIEW_TEAM_ONLY`; the page shows "Buying a plan is open only to invited
  accounts for now…"). Keep the password on
  anyway while mail is on the allow-list: a buyer outside it would get no M1 or M2. The NETOPIA review window (5.8)
  may be open: it opens only the public pages and the `/cancel` form, no sign-in and no checkout, and PAY_SWITCH and
  PAY_BACK check the password on the Log in page, which the window never opens.
- Never during an upload, and never while a second release runs or drains: two APIs on different payment systems on one
  database would end each other's billing jobs.
- Each host-side fix of the security review (NV-51, NV-55's port reservation, NV-56, NV-57) is read on this server
  (Hatchet's container: its user, capabilities and mounts; the `preview_root` map of the database's access file) and
  either applied by a reviewed step or recorded as not needed here, with the reason. A read of the container may
  already show it in the shape the fixes ask for: then record that.
- The notify alarm (the release guide's H10) watches dezbatere.ro's notify address: install it before the first real
  payment.
- Decide whether real payments start with the billing notice spool. The release guide's H9, as written, targets the old
  layout's files and cannot switch it on or off on this server; a rewrite in H11's shape comes first.

### 7.0 A new site password (after a friends' test, or after NETOPIA's tester had it)

The friends (or NETOPIA's tester, 5.8b) had the site password. During part 7 it keeps everyone but the team away from
sign-in, debates and buying, so change it first.
This step writes a new user name and its bcrypt hash into `/etc/debateai-v3-preview/public/caddy.env` and
restarts Caddy. The script asks for the old password only to check that it stops working; nothing you type is printed
or put on a command line. Use letters and digits only, at least 20 for the password.

The kept Caddyfile copies (`Caddyfile.phase1`, `Caddyfile.main`, the password copies of part 8) read the password from
`caddy.env`, so they need no change. To confirm on the server: that `caddy.env` holds the two lines
`PREVIEW_BASIC_AUTH_USER=…` and `PREVIEW_BASIC_AUTH_HASH=…` and the Caddyfile reads them in one `basic_auth` line, as
recorded when the test server was set up, and that `caddy hash-password` reads a password from a pipe. The script
checks all three and stops, with nothing changed, if one does not hold.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PWNEW: a new site user and password (its bcrypt hash in caddy.env); Caddy restarts; the new pair is admitted and the old one refused. Nothing secret is printed.
CE=/etc/debateai-v3-preview/public/caddy.env
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login" || true)" = 401 ] || { echo "PWNEW_NOT_DONE: the site does not ask for the password now: look"; exit 1; }
[ "$(grep -c '^PREVIEW_BASIC_AUTH_USER=' "$CE" || true)" = 1 ] && [ "$(grep -c '^PREVIEW_BASIC_AUTH_HASH=' "$CE" || true)" = 1 ] || { echo "PWNEW_NOT_DONE: caddy.env does not hold exactly one user line and one hash line (nothing changed): ask"; exit 1; }
[ "$(grep -cF '{$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}' "$C" || true)" = 1 ] || { echo "PWNEW_NOT_DONE: the live Caddyfile does not read the two caddy.env values in one basic_auth line (nothing changed): ask"; exit 1; }
cad validate --config "$C" --adapter caddyfile >/dev/null 2>&1 || { echo "PWNEW_NOT_DONE: caddy validate refuses the live Caddyfile today (nothing changed): ask"; exit 1; }
esc() { printf '%s' "$1" | sed 's/[\\"]/\\&/g'; }
pair() { printf 'user = "%s:%s"\n' "$(esc "$1")" "$(esc "$2")"; }
answer() { pair "$1" "$2" | curl -s -o /dev/null -w '%{http_code}' -K - "https://$HOST/login" || true; }
OLDUSER=$(sed -n 's/^PREVIEW_BASIC_AUTH_USER=//p' "$CE")
read -rs -p 'The OLD site password (hidden): ' OLDPASS < /dev/tty; echo
case "$(answer "$OLDUSER" "$OLDPASS")" in 401|000) echo "PWNEW_NOT_DONE: the old password you typed is not admitted now (a typo?); nothing changed"; exit 1;; esac
read -r -p 'The NEW site user name (3 to 32 letters or digits): ' NEWUSER < /dev/tty
read -rs -p 'The NEW site password (20 to 64 letters or digits, hidden): ' NEWPASS < /dev/tty; echo
read -rs -p 'The NEW site password again (hidden): ' NEWPASS2 < /dev/tty; echo
[ "$NEWPASS" = "$NEWPASS2" ] || { echo "PWNEW_NOT_DONE: the two new passwords differ; nothing changed"; exit 1; }
printf '%s\n' "$NEWUSER" | grep -qxE '[A-Za-z0-9]{3,32}' && [ "$NEWUSER" != "$OLDUSER" ] || { echo "PWNEW_NOT_DONE: the user name is not 3 to 32 letters or digits, or it is the old one; nothing changed"; exit 1; }
printf '%s\n' "$NEWPASS" | grep -qxE '[A-Za-z0-9]{20,64}' && [ "$NEWPASS" != "$OLDPASS" ] || { echo "PWNEW_NOT_DONE: the new password is not 20 to 64 letters or digits, or it is the old one; nothing changed"; exit 1; }
HASH=$(printf '%s\n' "$NEWPASS" | /usr/bin/caddy hash-password 2>/dev/null || true)
printf '%s\n' "$HASH" | grep -qxE '\$2a\$[0-9]{2}\$[./A-Za-z0-9]{53}' || { echo "PWNEW_NOT_DONE: caddy hash-password did not give a bcrypt hash; nothing changed: ask"; exit 1; }
KEEP=$M/password/caddy.env.before-$(date -u +%Y%m%dT%H%M%SZ)
cp -p "$CE" "$KEEP"
( umask 077; { grep -vE '^PREVIEW_BASIC_AUTH_(USER|HASH)=' "$CE" || true; printf 'PREVIEW_BASIC_AUTH_USER=%s\nPREVIEW_BASIC_AUTH_HASH=%s\n' "$NEWUSER" "$HASH"; } > "$CE.new" )
{ chown --reference="$CE" "$CE.new" && chmod --reference="$CE" "$CE.new" && mv "$CE.new" "$CE"; } || { echo "PWNEW_NOT_DONE: the new caddy.env was not put in place (Caddy not restarted): ask"; exit 1; }
undo() { { cp -p "$KEEP" "$CE.new" && mv "$CE.new" "$CE"; } || { echo "PWNEW_NOT_DONE: the old caddy.env could not be put back (it is $KEEP): ask at once"; exit 1; }; systemctl restart caddy || true; sleep 3; [ "$(systemctl is-active caddy || true)" = active ] || { echo "PWNEW_NOT_DONE: the old caddy.env is back, but Caddy did not start on it: the site is DOWN: ask at once"; exit 1; }; }
cad validate --config "$C" --adapter caddyfile >/dev/null 2>&1 || { undo; echo "PWNEW_NOT_DONE: caddy validate refused the new values; the old caddy.env is back"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
BAD=''
[ "$(systemctl is-active caddy || true)" = active ] || BAD="$BAD caddy"
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login" || true)" = 401 ] || BAD="$BAD no-password"
case "$(answer "$NEWUSER" "$NEWPASS")" in 401|000) BAD="$BAD new";; esac
[ "$(answer "$OLDUSER" "$OLDPASS")" = 401 ] || BAD="$BAD old"
if [ -n "$BAD" ]; then undo; echo "PWNEW_NOT_DONE: a check failed ($BAD); the old caddy.env is back and Caddy restarted on it"; exit 1; fi
unset OLDPASS NEWPASS NEWPASS2
echo PWNEW_DONE
exit 0
```

Expect four prompts (the old password, then the new user and the new password twice), then `PWNEW_DONE`. Give the new
password to the team in person, or in a one-to-one message (never in a group, an e-mail thread, or a chat with
Claude). The old `caddy.env` stays in `/root/preview-archive/main-site/password`, for the way back.

If you watch a later upload's switch from the Mac (the release guide's SB13 watcher), put the new user and password in
`~/.config/debateai-preview.netrc` too. Otherwise the watcher prints an error line every half second that no visitor
saw.

### 7.1 Close the sandbox records, then count them

Close them as in 3.3. Wait until payment checks and jobs have run. Then:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY0: the sandbox's open records, counted (read-only). Every count must be 0 before real payments.
Q1=$(psqlq "SELECT count(*) FROM billing.subscription_latest_v s JOIN billing.subscription_event c ON c.subscription_id = s.subscription_id AND c.kind = 'CREATED' WHERE jsonb_extract_path_text(c.data, 'payment_environment') = 'sandbox' AND s.kind NOT IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED') AND NOT (COALESCE((SELECT x.kind FROM billing.subscription_event x WHERE x.subscription_id = s.subscription_id AND x.kind IN ('CANCEL_REQUESTED', 'CANCEL_REVOKED') ORDER BY x.seq DESC LIMIT 1), '') = 'CANCEL_REQUESTED' AND COALESCE((SELECT y.kind FROM billing.subscription_event y WHERE y.subscription_id = s.subscription_id AND y.kind IN ('ACTIVATED', 'RECOVERED', 'RESUMED', 'PAST_DUE', 'SUSPENDED') ORDER BY y.seq DESC LIMIT 1), '') IN ('ACTIVATED', 'RECOVERED', 'RESUMED'))")
Q2=$(psqlq "SELECT count(*) FROM billing.charge c WHERE c.payment_environment = 'sandbox' AND NOT EXISTS (SELECT 1 FROM billing.charge_event f WHERE f.charge_id = c.charge_id AND f.kind IN ('SUCCEEDED', 'FAILED')) AND NOT EXISTS (SELECT 1 FROM billing.subscription_latest_v s WHERE s.subscription_id = c.subscription_id AND s.kind IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED'))")
Q3=$(psqlq "SELECT count(*) FROM billing.outbox j WHERE j.done_at IS NULL AND j.dead_at IS NULL AND EXISTS (SELECT 1 FROM billing.charge c WHERE c.payment_environment = 'sandbox' AND (c.charge_id = jsonb_extract_path_text(j.payload, 'charge_id') OR c.charge_id = j.ref))")
Q4=$( { find /var/lib/debateai-v3-preview/api/billing-notice-spool -type f 2>/dev/null || true; } | wc -l)
echo "open sandbox plans $Q1; sandbox payments not final $Q2; open sandbox jobs $Q3; files in the notice spool $Q4"
[ "$Q1/$Q2/$Q3/$Q4" = 0/0/0/0 ] || { echo "PAY0_NOT_DONE: something is still open (above): close it (3.3), wait, count again"; exit 1; }
echo PAY0_DONE
exit 0
```

The API's own live start has the last word: it refuses while sandbox records are open and prints the counts by name
(`BILLING_OTHER_SYSTEM_RECORDS_OPEN:…`).

### 7.2 The account for the real payment

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY_ACCOUNT: the account you will pay with is on the team and has no plan of any kind (read-only).
read -r -p 'The address of the account you will pay with: ' ADDR < /dev/tty
OR=$(printf '%s\n' "$ADDR" | RUNAPI apps/api/src/billing/withdraw-cli.ts --owner-of-email | sed -n 's/^owner_ref: //p' || true); unset ADDR
printf '%s\n' "$OR" | grep -qxE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || { echo "PAY_ACCOUNT_NOT_DONE: no account with that address"; exit 1; }
TU=$(psqlq "SELECT user_id FROM identity.\"user\" WHERE owner_ref = '$OR'") || { echo "PAY_ACCOUNT_NOT_DONE: the database did not answer: ask"; exit 1; }
TL=$(grep '^PREVIEW_TEAM_USER_IDS_JSON=' "$A" || true)
[ -n "$TU" ] && [[ "$TL" == *"\"$TU\""* ]] || { echo "PAY_ACCOUNT_NOT_DONE: this account is not on the team, so the live checkout would answer 403 PREVIEW_TEAM_ONLY: use your team account, or ask"; exit 1; }
P=$(psqlq "SELECT s.kind FROM billing.subscription_latest_v s WHERE s.owner_ref = '$OR' AND s.kind NOT IN ('ENDED','WITHDRAWN','ERASURE_STOPPED')") || { echo "PAY_ACCOUNT_NOT_DONE: the database did not answer: ask"; exit 1; }
[ -z "$P" ] || { echo "PAY_ACCOUNT_NOT_DONE: this account has a plan (even a cancelled sandbox one): use another team account; if none is free, ask"; exit 1; }
echo PAY_ACCOUNT_DONE
exit 0
```

Any plan row, even a cancelled sandbox plan, makes the live checkout answer "already subscribed" until that month ends.

PAY_ACCOUNT also checks that the account is on the team (its user id is in the API file's
`PREVIEW_TEAM_USER_IDS_JSON`). While asks are closed, the live checkout answers any other account with 403
`PREVIEW_TEAM_ONLY` (the page shows "Buying a plan is open only to invited accounts for now. You can keep using the
Free plan."). If no team account of yours is free of plans, stop here and
ask before 7.3: adding an account to the team is not in this document.

### 7.3 The live key files (typed by you; nothing is printed)

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY_KEYS: the three live secrets and NETOPIA's live public key, beside the sandbox ones. Nothing is printed.
[ -s /root/netopia-live-public.pem ] || { echo "PAY_KEYS_NOT_DONE: /root/netopia-live-public.pem is missing (1.1)"; exit 1; }
for F in live-netopia-api-key live-quaderno-api-key live-smartbill-credentials live-netopia-ipn-keys.pem; do [ ! -e "$B/$F" ] || { echo "PAY_KEYS_NOT_DONE: $B/$F exists (to replace a key, remove that one file first)"; exit 1; }; done
V=''; read -rs -p 'NETOPIA LIVE API key (hidden): ' V < /dev/tty || true; echo
[ -n "$V" ] || { echo "PAY_KEYS_NOT_DONE: the NETOPIA key was empty; nothing was saved"; exit 1; }
printf '%s\n' "$V" | put_secret "$B/live-netopia-api-key" || { echo "PAY_KEYS_NOT_DONE: the NETOPIA key was not saved (above); nothing was saved"; exit 1; }; unset V
V=''; read -rs -p 'Quaderno LIVE API key (hidden): ' V < /dev/tty || true; echo
[ -n "$V" ] || { echo "PAY_KEYS_NOT_DONE: the Quaderno key was empty; the NETOPIA key is saved (to start again, remove $B/live-netopia-api-key first)"; exit 1; }
printf '%s\n' "$V" | put_secret "$B/live-quaderno-api-key" || { echo "PAY_KEYS_NOT_DONE: the Quaderno key was not saved (above); the NETOPIA key is saved: ask"; exit 1; }; unset V
V=''; read -rs -p 'SmartBill e-mail:token (hidden): ' V < /dev/tty || true; echo
[ -n "$V" ] || { echo "PAY_KEYS_NOT_DONE: the SmartBill line was empty; the NETOPIA and Quaderno keys are saved (to start again, remove those two files first)"; exit 1; }
printf '%s\n' "$V" | put_secret "$B/live-smartbill-credentials" || { echo "PAY_KEYS_NOT_DONE: the SmartBill line was not saved (above); the NETOPIA and Quaderno keys are saved: ask"; exit 1; }; unset V
install -o root -g root -m 0644 /root/netopia-live-public.pem "$B/live-netopia-ipn-keys.pem" || { echo "PAY_KEYS_NOT_DONE: the three secrets are saved, but NETOPIA's live public key was not copied: ask"; exit 1; }; echo 'saved the live public key'
stat -c '%a %U %n' "$B" "$B"/*
echo PAY_KEYS_DONE
exit 0
```

Expect `saved …` four times, then the list: `700 <API user>` for the folder; `600 <API user>` for every secret, sandbox
and live, and for `owner-report-email`; `644 root` for both `.pem` files. The sandbox files stay.

### 7.4 The two line files

This keeps the sandbox lines and writes the live ones. The API file does not change yet.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY_LINES: the sandbox payment lines kept, the live ones written. Nothing live changes.
[ ! -e "$M/pay/sandbox.lines" ] && [ ! -e "$M/pay/live.lines" ] || { echo "PAY_LINES_NOT_DONE: the line files exist (look first)"; exit 1; }
[ "$(grep -c '^PREVIEW_LIVE_PAYMENTS=' "$A" || true)" = 0 ] || { echo "PAY_LINES_NOT_DONE: the API file is already live"; exit 1; }
umask 077
cp -a "$A" "$M/pay/api-$LABEL.env.before-live"
grep -E "$KEYS" "$A" > "$M/pay/sandbox.lines"
[ "$(wc -l < "$M/pay/sandbox.lines")" = 10 ] || { rm -f "$M/pay/sandbox.lines" "$M/pay/api-$LABEL.env.before-live"; echo "PAY_LINES_NOT_DONE: the API file does not hold the ten sandbox billing lines; nothing was written: ask"; exit 1; }
read -r -p 'Live POS signature: ' POS < /dev/tty; read -r -p 'Quaderno LIVE account label: ' QL < /dev/tty; read -r -p 'SmartBill live series: ' SER < /dev/tty
printf '%s\n' "$POS" | grep -qxE '[A-Z0-9]{4}(-[A-Z0-9]{4}){4}' && printf '%s\n' "$QL" | grep -qxE '[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?' && printf '%s\n' "$SER" | grep -qxE '[A-Za-z0-9]{1,16}' || { echo "PAY_LINES_NOT_DONE: a value has the wrong form; nothing was written"; rm -f "$M/pay/sandbox.lines" "$M/pay/api-$LABEL.env.before-live"; exit 1; }
printf '%s\n' 'NETOPIA_API_BASE_URL=https://secure.netopia-payments.com/api' "NETOPIA_POS_SIGNATURE=$POS" "NETOPIA_API_KEY_PATH=$B/live-netopia-api-key" "NETOPIA_IPN_KEYS_PATH=$B/live-netopia-ipn-keys.pem" "QUADERNO_API_BASE_URL=https://$QL.quadernoapp.com/api" "QUADERNO_API_KEY_PATH=$B/live-quaderno-api-key" 'SMARTBILL_API_BASE_URL=https://ws.smartbill.ro/SBORO/api' "SMARTBILL_CREDENTIALS_PATH=$B/live-smartbill-credentials" "SMARTBILL_SERIES=$SER" "OWNER_REPORT_EMAIL_PATH=$B/owner-report-email" 'PREVIEW_LIVE_PAYMENTS=real-money' > "$M/pay/live.lines"
[ "$(wc -l < "$M/pay/live.lines")" = 11 ] || { rm -f "$M/pay/sandbox.lines" "$M/pay/live.lines" "$M/pay/api-$LABEL.env.before-live"; echo "PAY_LINES_NOT_DONE: live.lines is not 11 lines; nothing was written: ask"; exit 1; }
echo PAY_LINES_DONE
exit 0
```

The later steps read the Quaderno label back from `live.lines`. The egress drop-in must name exactly the same label,
or the API refuses with `PREVIEW_LIVE_PAYMENTS_REFUSED:egress-account`.

### 7.5 Open the egress proxy (the API is still on the sandbox)

The egress proxy gets this release's file, then its live form through a drop-in. From the drop-in until 7.6, the
sandbox API cannot reach its sandboxes; that fails closed (no payment can go through). Go straight on to 7.6.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY_EGRESS: this release's proxy file, then its live form for the live Quaderno account; proved from inside the API's denial.
QL=$(grep -oE '^QUADERNO_API_BASE_URL=https://[a-z0-9-]+' "$M/pay/live.lines" | cut -d/ -f3 || true)
[ -n "$QL" ] || { echo "PAY_EGRESS_NOT_DONE: no label in live.lines (PAY_LINES first)"; exit 1; }
[ ! -e "$EDROP" ] || { echo "PAY_EGRESS_NOT_DONE: the live drop-in exists already (PAY_EGRESS ran before?): look; nothing changed"; exit 1; }
[ -e "$M/pay/egress-proxy.mjs.before" ] || cp -p "$EG/egress-proxy.mjs" "$M/pay/egress-proxy.mjs.before"
{ install -o root -g root -m 0644 "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/egress-proxy.mjs" "$EG/egress-proxy.mjs" && cmp -s "$CAPI/dialectical-engine/deploy/preview-auth-dev/v1/egress-proxy.mjs" "$EG/egress-proxy.mjs"; } || { echo "PAY_EGRESS_NOT_DONE: this release's proxy file was not put in place: ask"; exit 1; }
systemctl restart "$EGU" || echo 'systemctl restart of the egress proxy returned non-zero'; sleep 2
[ "$(systemctl is-active "$EGU" || true)" = active ] || { if install -o root -g root -m 0644 "$M/pay/egress-proxy.mjs.before" "$EG/egress-proxy.mjs"; then systemctl restart "$EGU" || true; sleep 2; echo "PAY_EGRESS_NOT_DONE: the proxy did not come back on the new file; the file before is back, and the proxy is now $(systemctl is-active "$EGU" || true) (it must say active): ask"; else echo "PAY_EGRESS_NOT_DONE: the proxy did not come back on the new file, and the file before could not be put back (it is $M/pay/egress-proxy.mjs.before): ask at once"; fi; exit 1; }
[ "$(modecheck "$QL")" = 'egress: PREVIEW_LIVE_PAYMENTS_REFUSED:egress' ] || { echo "PAY_EGRESS_NOT_DONE: the sandbox form did not answer as expected: ask"; exit 1; }
livedrop "$QL"
[ "$(systemctl is-active "$EGU" || true)" = active ] || { journalctl -u "$EGU" -n 5 -o cat --no-pager; sandboxdrop; echo "PAY_EGRESS_NOT_DONE: the live form did not start (bad label?); the drop-in is removed"; exit 1; }
journalctl -u "$EGU" -n 5 -o cat --no-pager
MC=$(modecheck "$QL"); echo "$MC"
[ "$MC" = 'egress: live' ] || { sandboxdrop; echo "PAY_EGRESS_NOT_DONE: the proxy does not answer live for this label; the drop-in is removed"; exit 1; }
PR=$(systemd-run --pipe --wait --collect --uid="$AU" --gid="$AGRP" -p IPAddressDeny=any -p IPAddressAllow=localhost "$N" -e "require('http').setGlobalProxyFromEnv({HTTPS_PROXY:'http://127.0.0.1:3180',NO_PROXY:'localhost,127.0.0.1,[::1]'});const t=u=>fetch(u,{signal:AbortSignal.timeout(15000)}).then(r=>console.log(u,'answered',r.status),()=>console.log(u,'refused'));t('https://secure.netopia-payments.com/api').then(()=>t('https://ws.smartbill.ro/SBORO/api')).then(()=>t('https://secure-sandbox.netopia-payments.com/'))" || true)
printf '%s\n' "$PR"
grep -qE '^https://secure\.netopia-payments\.com/api answered [0-9]+$' <<<"$PR" && grep -qE '^https://ws\.smartbill\.ro/SBORO/api answered [0-9]+$' <<<"$PR" && grep -qxF 'https://secure-sandbox.netopia-payments.com/ refused' <<<"$PR" || { sandboxdrop; echo "PAY_EGRESS_NOT_DONE: the live form does not let through exactly NETOPIA's live address and SmartBill (the three lines above); the drop-in is removed: run PAY_UNDO (below) to check the sandbox form, then ask"; exit 1; }
echo PAY_EGRESS_DONE
exit 0
```

Expect: the journal line `{"event":"preview.egress.listening","host":"127.0.0.1","port":3180,"payments":"live"}`;
`egress: live`; then NETOPIA's live address and SmartBill `answered` (any status) and the sandbox address `refused`;
then `PAY_EGRESS_DONE`. The script checks those three lines itself. If one is wrong, it removes the live form and says
`PAY_EGRESS_NOT_DONE`: run PAY_UNDO (below), then ask. The proxy file from before stays in
`/root/preview-archive/main-site/pay/egress-proxy.mjs.before`; PAY_EGRESS puts it back by itself if the proxy does not
start on the new file.

### 7.6 Switch the API to real payments

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY_SWITCH: the API's payment lines swapped to the live ones and the API restarted. On a refusal everything goes back to the sandbox.
declare -F upfail >/dev/null || { echo "PAY_SWITCH_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then PAY_SWITCH"; exit 1; }
QL=$(grep -oE '^QUADERNO_API_BASE_URL=https://[a-z0-9-]+' "$M/pay/live.lines" | cut -d/ -f3 || true)
[ "$HOST" = dezbatere.ro ] || { echo "PAY_SWITCH_NOT_DONE: the API answers as $HOST: open the main name first (part 5)"; exit 1; }
! grep -q '^PREVIEW_ASKS_OPEN_TO=' "$A" "$RF" || { echo "PAY_SWITCH_NOT_DONE: asks are open: ASKS_CLOSE first (the live start refuses everyone-with-test-payments and everyone-with-listed-buyers)"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login")" = 401 ] || { echo "PAY_SWITCH_NOT_DONE: the site password is off"; exit 1; }
[ "$(modecheck "$QL")" = 'egress: live' ] || { echo "PAY_SWITCH_NOT_DONE: the egress proxy is not live for $QL (PAY_EGRESS first)"; exit 1; }
cmp -s "$M/pay/sandbox.lines" <(grep -E "$KEYS" "$A") || { echo "PAY_SWITCH_NOT_DONE: the API file's payment lines changed since PAY_LINES: ask"; exit 1; }
[ "$(swap "$M/pay/live.lines")" = swapped ] || { echo "PAY_SWITCH_NOT_DONE: the swap did not finish (compare the API file with $M/pay/api-$LABEL.env.before-live); nothing restarted: ask"; exit 1; }
[ "$(grep -cE "$KEYS" "$A")" = 11 ] || { swap "$M/pay/sandbox.lines"; echo "PAY_SWITCH_NOT_DONE: the swap did not leave 11 payment lines; the sandbox lines are back, nothing restarted"; exit 1; }
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the live lines'); swap "$M/pay/sandbox.lines"; sandboxdrop; { apistart && webup; } || { echo "PAY_SWITCH_NOT_DONE: $WHY; the sandbox lines and the proxy's sandbox form are back, but the API or the website did not start on them either (the line above says which): the site is DOWN: ask at once"; exit 1; }; echo "PAY_SWITCH_NOT_DONE: $WHY; the sandbox lines and the proxy's sandbox form are back, and the API and the website started on them"; exit 1; fi
echo PAY_SWITCH_DONE
exit 0
```

The API writes its start line only after its launcher has re-checked the release, a minute or more after the restart;
`apiup` waits up to about 4 minutes for it, and about 2 more for the website. Expect `PREVIEW_API_STARTED …`, then
`PAY_SWITCH_DONE`.

If it was refused, the line shows the cause. From the launcher (no `api.boot.failed` line before it):
`PREVIEW_LIVE_PAYMENTS_REFUSED:value`, `:incomplete`, `:netopia-base`, `:quaderno-base`, `:smartbill-base`, `:paths`,
`:egress`, `:egress-account`. From the API, after `{"event":"api.boot.failed","stage":"…"}`:
`PREVIEW_LIVE_PAYMENTS_BILLING_OFF` (the site version has billing off; only an upload changes that),
`BILLING_OTHER_SYSTEM_RECORDS_OPEN:…` (back to 7.1), `BILLING_RECORDS_DATED_AHEAD:…`,
`BILLING_LIVE_SANDBOX_INVOICER_REFUSED`. A bare `PREVIEW_API_STARTUP_REFUSED` after stage `billing-connectors` means a
key file's owner or mode, or the form of the POS signature or series. Part 10 has every code.

**Undoing the egress proxy alone** (if you stop between 7.5 and 7.6):

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY_UNDO: the proxy's sandbox form back, while the API file is still the sandbox's.
[ "$(grep -c '^PREVIEW_LIVE_PAYMENTS=' "$A" || true)" = 0 ] || { echo "PAY_UNDO_NOT_DONE: the API file is live: use PAY_BACK"; exit 1; }
QL=$(grep -oE '^QUADERNO_API_BASE_URL=https://[a-z0-9-]+' "$M/pay/live.lines" | cut -d/ -f3 || true)
sandboxdrop
[ "$(systemctl is-active "$EGU" || true)" = active ] || { echo "PAY_UNDO_NOT_DONE: the proxy did not start in its sandbox form, so sandbox payments cannot go through: ask"; exit 1; }
[ "$(modecheck "$QL")" = 'egress: PREVIEW_LIVE_PAYMENTS_REFUSED:egress' ] || { echo "PAY_UNDO_NOT_DONE: the proxy still answers live: ask"; exit 1; }
echo PAY_UNDO_DONE
exit 0
```

### 7.7 Prove live, without charging

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY_PROVE: read back the live settings and files, run the billing check, read the billing journal. Nothing is charged.
grep -E '^(NETOPIA_API_BASE_URL|QUADERNO_API_BASE_URL|SMARTBILL_API_BASE_URL|PREVIEW_LIVE_PAYMENTS)=' "$A"
grep -c '^NETOPIA_POS_SIGNATURE=' "$A"
stat -c '%y %U %a %n' "$B"/live-*
RUNAPI apps/api/src/billing/check-cli.ts || true
inv "$API" | grep -E 'credentials_refused|notice\.unverified|status_failed|BILLING_[A-Z_]+_PENDING' || true
echo PAY_PROVE_DONE
exit 0
```

The billing check must tick:
- "Every billing setting is present and well formed."
- "NETOPIA_API_BASE_URL is NETOPIA's live system: payments made here are real."
- the POS form; "Quaderno and SmartBill are live, as NETOPIA's live system needs."; the four key-file lines;
- the trusted key and its SHA-256 fingerprint, which must equal what NETOPIA confirmed;
- "NETOPIA accepted the API key … nothing was charged";
- "https://dezbatere.ro/api/v1/billing/netopia/notify gives the notify route's own answer …";
- "Billing is switched on …", the country rule and the company line.

The last line is "All N checks passed.", or names only the plans line. The check never calls SmartBill or Quaderno,
and it does not prove the POS signature: compare the signature with NETOPIA's live admin by eye. In the journal lines,
only the check's own `NOTICE_HEADER_MISSING` lines are expected.

In the browser: open `/pricing` as a Romanian visitor. A price with VAT shows that Quaderno's live account answers. The
test-mode note is gone. Go as far as the checkout total, and **never press Abonați-vă și plătiți (Subscribe and pay)
here**: that button already places the order before NETOPIA's page opens. A started live checkout is open live work
for up to 24 hours and keeps the way back closed.

### 7.8 The first real payment

Use the account from 7.2: allow-listed while mail is closed, and on the team (its user id in the API file's
`PREVIEW_TEAM_USER_IDS_JSON`), or the live checkout answers 403 `PREVIEW_TEAM_ONLY` while asks are closed. Buy as a
private person with a Romanian address (Bucharest needs "Sector 1-6"), in the Romanian interface, plan Plus. Read the
total on the checkout before you press **Abonați-vă și plătiți**. On NETOPIA's page, pay with your own card and 3-D
Secure.

Expect: back on the site the plan is active; M1; NETOPIA's own e-mail; then M2 with SmartBill's PDF. M1 carries the
Terms as a file only for an account that accepted the launch Terms (version 1.0): every account made after this upload.
For an account made before it (yours, and the team's), M1 says where the current Terms are online and carries no file,
and the API's journal shows `billing.mail.attachment_missing` with `MAIL_TERMS_NOT_ARCHIVED`: that is expected, not a
fault. Every team account on this server was made before this upload, and this document adds none to the team (7.2), so
this first real payment's M1 comes without the file. That is expected too.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY_FIRST: the newest live payment notices that were applied (read-only).
psqlq "SELECT n.received_at, n.order_id AS charge_ref, n.provider_status, n.payment_environment, o.outcome FROM billing.payment_notice n JOIN billing.charge c ON c.charge_id = n.order_id JOIN billing.payment_notice_outcome o ON o.notice_id = n.notice_id WHERE c.payment_environment = 'live' AND o.outcome = 'APPLIED' ORDER BY n.received_at DESC LIMIT 5"
inv "$API" | grep -E 'billing\.payment\.mismatch|FIRST_PAYMENT_NO_CARD' || true
echo PAY_FIRST_DONE
exit 0
```

The newest row is your payment. No `billing.payment.mismatch` line may show, and no `FIRST_PAYMENT_NO_CARD` within 30
minutes. Do not start a debate on this plan, so the refund stays whole.

### 7.9 The invoice and e-Factura

In SmartBill check: the series and number, the buyer, RON, one "Normala" line, and "e-Factura trimisă". Read ANAF's
answer in SPV. Then record it, and check the quarter's summary lists it:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# EFACTURA: ANAF's answer recorded, then the quarter's tax summary.
RUNAPI apps/api/src/billing/efactura-status-cli.ts --invoice '<SERIES-NUMBER>' --status ACCEPTED || { echo "EFACTURA_NOT_DONE: the status tool refused (its code is the line above); nothing more was run: ask"; exit 1; }
RUNAPI apps/api/src/billing/tax-summary-cli.ts --quarter '<this quarter, as YYYY-Qn>' || { echo "EFACTURA_NOT_DONE: ANAF's answer is recorded, but the tax summary tool refused (its code is the line above): ask"; exit 1; }
echo EFACTURA_DONE
exit 0
```

Write `REJECTED` instead of `ACCEPTED` if ANAF rejected it. ANAF's answer can take hours: record it when it comes. If
ANAF rejected the invoice or the credit note, stop and ask your accountant the same day: a rejected e-Factura must be
corrected in SmartBill and sent again.

If the invoice job died with an O3 mail (`INVOICE_SERVICE_REFUSED`, for example the CIF form): first check that
SmartBill issued nothing, and ask. Then either issue it by hand in SmartBill and record it (INVOICE_RECORD), or, after
the cause is fixed, send the job again (INVOICE_REQUEUE). For a credit note's job, write `--kind CREDIT_NOTE` instead
of `--kind INVOICE`. Fill in `<ref>` with the charge reference the O3 mail names (the long code after the word
`charge`), and `<SERIES-NUMBER>` with the number SmartBill shows on the invoice you issued by hand, as
`<series>-<number>`. The command in the O3 mail is written for another server: use these blocks instead.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# INVOICE_RECORD: an invoice you issued by hand in SmartBill, recorded for its charge.
RUNAPI apps/api/src/billing/invoice-cli.ts --charge '<ref>' --kind INVOICE --record '<SERIES-NUMBER>' || { echo "INVOICE_RECORD_NOT_DONE: the tool refused (its code is the line above): ask"; exit 1; }
echo INVOICE_RECORD_DONE
exit 0
```

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# INVOICE_REQUEUE: a dead invoice job sent again, once you checked SmartBill issued nothing for it.
RUNAPI apps/api/src/billing/invoice-cli.ts --charge '<ref>' --kind INVOICE --requeue --confirm-not-issued || { echo "INVOICE_REQUEUE_NOT_DONE: the tool refused (its code is the line above): ask"; exit 1; }
echo INVOICE_REQUEUE_DONE
exit 0
```

### 7.10 The refund

1. In Settings, **Withdraw** (within 14 days). The plan becomes WITHDRAWN, and you get O2_REFUND_DUE with the charge
   reference, NETOPIA's payment number and the exact amount.
2. In NETOPIA's **live** admin, refund exactly that amount on that payment, once.
3. A whole refund is recorded by itself. M8 and the SmartBill credit note (storno) follow, and e-Factura sends the
   credit note. Record ANAF's answer for the credit note with EFACTURA, as in 7.9.
4. If the refund is not recorded by the next day, use REFUNDDONE (3.3): first without `--confirm`, then with it.

Until the refund is recorded and the credit-note job has ended, the way back (7.11) stays closed by the code.

### 7.11 Back to the sandbox (close real payments)

**Preconditions, in plain words:** your live plan is WITHDRAWN; its refund and credit note are recorded (ANAF's answer
too); asks are closed (the sandbox start refuses `everyone`); the site password is on (the password-off rule never
allows a sandbox address).

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PAY_BACK: the five live counts must be 0; then the sandbox lines and the proxy's sandbox form, and the API restarted.
# If the sandbox start is refused, the live lines and form go back at once and the API restarts on them.
declare -F upfail >/dev/null || { echo "PAY_BACK_NOT_DONE: the names file is from an earlier version of this guide (no upfail); nothing changed: run LOCKS0 (3.0) again, then PAY_BACK"; exit 1; }
QL=$(grep -oE '^QUADERNO_API_BASE_URL=https://[a-z0-9-]+' "$M/pay/live.lines" | cut -d/ -f3 || true)
grep -qx 'PREVIEW_LIVE_PAYMENTS=real-money' "$A" || { echo "PAY_BACK_NOT_DONE: the API file is not live"; exit 1; }
! grep -q '^PREVIEW_ASKS_OPEN_TO=' "$A" "$RF" || { echo "PAY_BACK_NOT_DONE: asks are open: ASKS_CLOSE first (the sandbox start refuses everyone)"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login")" = 401 ] || { echo "PAY_BACK_NOT_DONE: the site password is off: PWON first"; exit 1; }
W1=$(psqlq "SELECT count(*) FROM billing.subscription_latest_v s JOIN billing.subscription_event c ON c.subscription_id = s.subscription_id AND c.kind = 'CREATED' WHERE jsonb_extract_path_text(c.data, 'payment_provider') = 'netopia' AND jsonb_extract_path_text(c.data, 'payment_environment') = 'live' AND s.kind NOT IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED')")
W2=$(psqlq "SELECT count(*) FROM billing.charge c WHERE c.payment_provider = 'netopia' AND c.payment_environment = 'live' AND NOT EXISTS (SELECT 1 FROM billing.charge_event f WHERE f.charge_id = c.charge_id AND f.kind IN ('SUCCEEDED', 'FAILED')) AND NOT EXISTS (SELECT 1 FROM billing.subscription_latest_v s WHERE s.subscription_id = c.subscription_id AND s.kind IN ('ENDED', 'WITHDRAWN', 'ERASURE_STOPPED'))")
W3=$(psqlq "SELECT count(*) FROM billing.charge_event r WHERE r.kind = 'REFUND_REQUESTED' AND r.payment_provider = 'netopia' AND r.payment_environment = 'live' AND r.amount_micros > 0 AND COALESCE((SELECT sum(d.amount_micros) FROM billing.charge_event d WHERE d.charge_id = r.charge_id AND d.kind = 'REFUNDED' AND COALESCE(d.refunds_transaction_id, d.provider_payment_id) = r.provider_payment_id), 0) < r.amount_micros")
W4=$(psqlq "SELECT count(*) FROM billing.subscription_event w JOIN billing.subscription_event c ON c.subscription_id = w.subscription_id AND c.kind = 'CREATED' WHERE w.kind = 'WITHDRAWN' AND jsonb_extract_path_text(w.data, 'refund_by_owner') = 'true' AND jsonb_extract_path_text(c.data, 'payment_environment') = 'live' AND NOT EXISTS (SELECT 1 FROM billing.withdrawal_owner_settlement s WHERE s.subscription_id = w.subscription_id)")
W5=$(psqlq "SELECT count(*) FROM billing.outbox j WHERE j.done_at IS NULL AND j.dead_at IS NULL AND EXISTS (SELECT 1 FROM billing.charge c WHERE c.payment_provider = 'netopia' AND c.payment_environment = 'live' AND (c.charge_id = jsonb_extract_path_text(j.payload, 'charge_id') OR c.charge_id = jsonb_extract_path_text(j.payload, 'external_order_id') OR (j.kind IN ('QUADERNO_RECORD_SALE', 'SMARTBILL_INVOICE') AND c.charge_id = j.ref)))")
echo "live plans not over $W1; live payments not final $W2; live refunds not recorded $W3; withdrawals not settled $W4; open live jobs $W5"
[ "$W1/$W2/$W3/$W4/$W5" = 0/0/0/0/0 ] || { echo "PAY_BACK_NOT_DONE: live work is open (above); nothing changed: wait for the jobs and record the refunds, then run this again; if count 4 is not 0, or count 3 stays above 0 while a card dispute is open, ask"; exit 1; }
[ "$(swap "$M/pay/sandbox.lines")" = swapped ] || { echo "PAY_BACK_NOT_DONE: the swap did not finish (compare the API file with $M/pay/api-$LABEL.env.before-live); the proxy and the running API are unchanged: ask"; exit 1; }
sandboxdrop
journalctl -u "$EGU" -n 3 -o cat --no-pager
[ "$(systemctl is-active "$EGU" || true)" = active ] && [ "$(modecheck "$QL")" = 'egress: PREVIEW_LIVE_PAYMENTS_REFUSED:egress' ] || { swap "$M/pay/live.lines"; livedrop "$QL"; MC=$(modecheck "$QL"); echo "$MC"; [ "$MC" = 'egress: live' ] || { echo "PAY_BACK_NOT_DONE: the proxy did not take its sandbox form, and it is not live again either, so no real payment can go through; the API file is live again, and the API was not restarted: ask at once"; exit 1; }; echo "PAY_BACK_NOT_DONE: the proxy did not take its sandbox form; the live lines and the proxy's live form are back, and the API kept running on them (it was not restarted): ask"; exit 1; }
R=0; apiup || R=$?
if [ "$R" != 0 ]; then WHY=$(upfail "$R" 'the sandbox lines'); swap "$M/pay/live.lines"; livedrop "$QL"; modecheck "$QL"; { apistart && webup; } || { echo "PAY_BACK_NOT_DONE: $WHY; the live lines and form are back, but the API or the website did not start on them either (the line above says which): the site is DOWN: ask at once"; exit 1; }; if [ "$R" = 2 ]; then echo "PAY_BACK_NOT_DONE: $WHY; the live lines and form are back, and the API and the website started on them: ask"; else echo "PAY_BACK_NOT_DONE: $WHY; the live lines and form are back, and the API and the website started on them: wait, then run this again"; fi; exit 1; fi
RUNAPI apps/api/src/billing/check-cli.ts || true
echo PAY_BACK_DONE
exit 0
```

What the five counts mean: 1. live plans not over (a pending cancel counts; a plan ended because its account was
deleted does not); 2. live payments not final on an open plan; 3. live refunds not yet recorded (one an open dispute
holds counts too: REFUNDDONE refuses it, and the API's own sandbox start does not count it, so only this script waits
for it: ask); 4. withdrawals handed to you (an O2_WITHDRAWAL mail) and not yet settled: the mail names the owner
reference, and its command is written for another server, so ask before you settle one; 5. open jobs of live charges
(credit note, invoice, payment check, refund).

Expect the five counts at 0, a proxy line with no `"payments"` field, the API's start line, the sandbox billing check,
then `PAY_BACK_DONE`. The sandbox start refuses by itself while live work is open, with
`BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=N:charges=N:jobs=N` after stage `billing-live-records-on-sandbox`.
Then PAY_BACK puts live back at once. Never end customers' plans to get past it.

To stop new sales without going back to the sandbox, put the site password back (PWON).

### 7.12 Uploads and going back, once real payments were on

`derive` copies the payment lines into the new release's API file, and `same` prints `BAD SAME_API_PAYMENT_SYSTEM` if
the two API files differ. Going back to a release older than this one needs payments closed first: older code refuses
the line. Two more rules, for the release guide's drained upload (DR1 to DR6):
- **The site password is on from DR2 until SB13b has passed.** If the site is open, run PWON (8.4) before the upload
  starts (PWON also works during an upload, as a brake). Nobody can then pay while the upload may still be undone.
  After SB13b, edit only the first line of `/root/preview-archive/main-site/names.sh` so it names the new upload's
  names file (as the end of 3.0 says; do not run LOCKS0 again). Then take the password off again with PWOFF1 and
  PWOFF2.
  If only the NETOPIA review window (5.8) was open, not the whole site: leave it open during the upload, since nobody
  can pay through it, and do not run PWOFF1 or PWOFF2. After SB13b, make the names.sh edit above, then run
  REVIEW_OPEN again (if you ran PWON, it closed the window, and REVIEW_OPEN opens it again).
- **Before you choose rbD-B, for this upload or a later one, run LIVEAFTER below, even if payments are back on the
  sandbox.** rbD-B puts back DR3's cold copy of the database, so it would lose every real payment, NETOPIA notice,
  invoice and credit note written since then, while the cards stay charged and the invoices stay issued in SmartBill,
  Quaderno and ANAF. The old release could then issue some of them a second time. LIVEAFTER also counts the invoices
  and credit notes started, issued or recorded since the cold copy, ANAF's answers recorded since then, and the
  invoice and credit-note jobs that ran since then (the old release would run such a job again, even one that was
  waiting for SmartBill at the cold copy). If LIVEAFTER does not end with `LIVEAFTER_DONE`, never run rbD-B: fix
  forward, and ask.

```sh
set -euo pipefail
. /root/preview-archive/rNN-names.sh
# LIVEAFTER: real-payment records, invoices and credit notes written since DR3's cold copy, which rbD-B would lose (read-only). Fill in rNN: the upload whose rbD-B you consider.
[ -s "$S/pg18-cold.sha256" ] || { echo "LIVEAFTER_NOT_DONE: $S holds no cold copy (DR3 not run?): ask"; exit 1; }
T0=$(stat -c %Y "$S/pg18-cold.sha256")
LC=$(psqlq "SELECT count(*) FROM billing.charge WHERE payment_environment = 'live' AND created_at > to_timestamp($T0)")
LE=$(psqlq "SELECT count(*) FROM billing.charge_event WHERE payment_environment = 'live' AND at > to_timestamp($T0)")
LN=$(psqlq "SELECT count(*) FROM billing.payment_notice WHERE payment_environment = 'live' AND received_at > to_timestamp($T0)")
LI=$(psqlq "SELECT count(*) FROM billing.invoice_intent i JOIN billing.charge c ON c.charge_id = i.charge_id WHERE c.payment_environment = 'live' AND i.requested_at > to_timestamp($T0)")
LD=$(psqlq "SELECT count(*) FROM billing.invoice i JOIN billing.charge c ON c.charge_id = i.charge_id WHERE c.payment_environment = 'live' AND i.at > to_timestamp($T0)")
LS=$(psqlq "SELECT count(*) FROM billing.invoice_status_event s JOIN billing.invoice i ON i.invoice_id = s.invoice_id JOIN billing.charge c ON c.charge_id = i.charge_id WHERE c.payment_environment = 'live' AND s.at > to_timestamp($T0)")
LJ=$(psqlq "SELECT count(*) FROM billing.outbox j JOIN billing.charge c ON c.charge_id = split_part(j.ref, ':', 1) WHERE c.payment_environment = 'live' AND j.kind IN ('SMARTBILL_INVOICE', 'SMARTBILL_STORNO', 'QUADERNO_RECORD_SALE', 'QUADERNO_RECORD_REFUND') AND (j.claimed_at > to_timestamp($T0) OR j.done_at > to_timestamp($T0) OR j.dead_at > to_timestamp($T0))")
echo "since the cold copy: live payments $LC; live payment events $LE; live NETOPIA notices $LN; live invoices or credit notes started $LI, issued or recorded $LD; their e-Factura answers $LS; their jobs run $LJ"
[ "$LC/$LE/$LN/$LI/$LD/$LS/$LJ" = 0/0/0/0/0/0/0 ] || { echo "LIVEAFTER_NOT_DONE: real-payment records or invoices were written, or invoice jobs ran, after the cold copy: never rbD-B; fix forward, and ask"; exit 1; }
echo LIVEAFTER_DONE
exit 0
```

---

## 8. Opening to everyone

**Only after 5.7.** Do not start part 8 until the staff screens are on and your staff key works on dezbatere.ro:
sign in there, open https://dezbatere.ro/admin/team (the Team page) → public review, and check that your staff key is
accepted. Without it nothing
published can be hidden by hand while the site is open, and the way back to the test name is closed while payments
are real. PWOFF1 (8.2) refuses while the API file has no line `STAFF_ACCESS_POLICY_VERSION=2`, and while the database
holds no working staff key of the Owner account under the name the site answers as.

**Before you start:** the site answers as dezbatere.ro (part 5); the NETOPIA review window is closed (REVIEW_CLOSE,
5.8; PWOFF1 refuses while it is open); mail is open there (4.3: PWOFF1 checks both the
plan file and the API's mode line); real payments work (part 7); the staff screens are on and your staff key works
on dezbatere.ro (5.7); with your staff key working, you have read the **Public** tab again and used Hide now on
anything that went public while your staff key did not work and must not stay public (Free debates go public by themselves once publishing is on, 5.9 and 5.1b);
NETOPIA's logo shows in the home page's footer (LOGOCHECK, part 2; if it is missing, ask before you take the password
off); the security review's host-side fixes are applied or recorded (part 7's "Before you start"); you have
decided your numbers and gate pots (1.7, 6.4); you have decided whether to open with publishing on (5.9) or without
it, as in 6b's decision 7; and you have read the
warning in bold at the start of part 9: once strangers can buy, closing everything again needs help.

**6b uses 8.2 to 8.4 too.** PWOFF1 accepts two pairings: part 8's (`everyone` in both files and in the running API's
line, real payments) and 6b's (`everyone-with-listed-buyers` in both files and in the running API's line, the listed
count the API printed equal to the list in the file, NETOPIA's sandbox with no `PREVIEW_LIVE_PAYMENTS` line, the four
spending gates active). Every other guard is the same for both: dezbatere.ro, the staff screens and the Owner's
working staff key there, mail open, the Log in page asking for the password, the review window closed, and no earlier
copies. The hand edit, PWOFF2 and PWON are the same for both.

### 8.1 Asks open to everyone

Run ASKS_OPEN (6.1) with the line `V=everyone`. It refuses unless payments are live. Then test it as in 6.2.

### 8.2 Take the site password off: the guards and the copy

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PWOFF1: the guards, then two copies of the live Caddyfile, one to edit. Nothing live changes.
# The robots header the Caddyfile may send already (the same lines in REVIEW_OPEN, REVIEW_MACTEST, PWOFF1 and PWOFF2). It prints none; group, when the one robots line is exactly X-Robots-Tag "noindex, nofollow" in a plain header group after the password, inside the dezbatere.ro block (a server's own file can have it from when the server was set up); or other, for any other robots line, which every step refuses.
robots() { awk '{ t = $0; sub(/^[ \t]+/, "", t) } $0 == "dezbatere.ro {" { s = 1 } s && $0 == "}" { s = 0 } s && t ~ /^basic_auth([ \t]|$)/ { a = 1 } s && g && t == "}" { g = 0 } tolower(t) ~ /x-robots-tag/ { n++; if (s && a && g && t == "X-Robots-Tag \"noindex, nofollow\"") k++ } s && a && t == "header {" { g = 1 } END { print (n == 0 ? "none" : (n == 1 && k == 1 ? "group" : "other")) }' "$1"; }
# Two pairings are accepted: everyone with real payments (part 8), or everyone-with-listed-buyers on NETOPIA's sandbox (6b).
V=$(sed -n 's/^PREVIEW_ASKS_OPEN_TO=//p' "$A")
[ "$(grep -c '^PREVIEW_ASKS_OPEN_TO=' "$A" || true)" = 1 ] && [ "$(grep -c '^PREVIEW_ASKS_OPEN_TO=' "$RF" || true)" = 1 ] && [ -n "$V" ] && grep -qxF "PREVIEW_ASKS_OPEN_TO=$V" "$RF" || { echo "PWOFF1_NOT_DONE: asks are not open with one same value in both files (8.1 or 6b first)"; exit 1; }
said -xF "{\"event\":\"api.preview.asks_open\",\"to\":\"$V\"}" || { echo "PWOFF1_NOT_DONE: the running API does not say asks open to $V"; exit 1; }
case "$V" in
  everyone)
    ! grep -qxE 'NETOPIA_API_BASE_URL=https://secure(-sandbox|\.sandbox)\.netopia-payments\.com' "$A" || { echo "PWOFF1_NOT_DONE: the API file names NETOPIA's sandbox"; exit 1; }
    grep -qx 'PREVIEW_LIVE_PAYMENTS=real-money' "$A" || { echo "PWOFF1_NOT_DONE: payments are not live (part 7 first)"; exit 1; };;
  everyone-with-listed-buyers)
    grep -qxE 'NETOPIA_API_BASE_URL=https://secure(-sandbox|\.sandbox)\.netopia-payments\.com' "$A" || { echo "PWOFF1_NOT_DONE: with everyone-with-listed-buyers the API file must name NETOPIA's sandbox"; exit 1; }
    [ "$(grep -c '^PREVIEW_LIVE_PAYMENTS=' "$A" || true)" = 0 ] || { echo "PWOFF1_NOT_DONE: with everyone-with-listed-buyers the API file must have no live payments line"; exit 1; }
    NB=$(sed -n 's/^PREVIEW_TEAM_USER_IDS_JSON=//p' "$A" | jq -r 'if type == "array" then length else empty end' 2>/dev/null || true)
    [ -n "$NB" ] && said -xF "{\"event\":\"api.preview.listed_buyers\",\"count\":$NB}" || { echo "PWOFF1_NOT_DONE: the running API does not say the number of listed buyers the API file holds: ask"; exit 1; }
    gatesok || { echo "PWOFF1_NOT_DONE: a spending gate is not active with its window open (GATES, 6.2)"; exit 1; };;
  *) echo "PWOFF1_NOT_DONE: asks are open to $V: the password comes off only with everyone (8.1, real payments) or everyone-with-listed-buyers (6b, NETOPIA's sandbox)"; exit 1;;
esac
[ "$HOST" = dezbatere.ro ] || { echo "PWOFF1_NOT_DONE: the API answers as $HOST: the password comes off only on the main name (part 5)"; exit 1; }
grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" || { echo "PWOFF1_NOT_DONE: the staff screens are off: STAFFMAIN and the rest of 5.7 first"; exit 1; }
OK=$(psqlq "SELECT count(*) FROM staff.owner_designation d JOIN staff.subject s USING (staff_id) JOIN identity.mfa_factor f ON f.user_id = s.user_id JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id = f.mfa_factor_id WHERE d.active AND s.state = 'ACTIVE' AND m.user_id = f.user_id AND f.factor_type = 'passkey' AND f.state = 'active' AND f.verified_at IS NOT NULL AND f.backup_eligible = false AND f.backup_state = false AND f.user_verification_required AND f.relying_party_id = '$HOST' AND f.credential_origin = 'https://$HOST'" || true)
[ "${OK:-0}" -ge 1 ] 2>/dev/null || { echo "PWOFF1_NOT_DONE: the Owner account has no working staff key under $HOST, so nobody could hide a debate by hand: 5.7 first"; exit 1; }
jq -e --arg o "https://$HOST" '.schema=="preview-auth-dev-mail-v2" and .recipients=="open" and .publicAppUrl==$o' "$MP" >/dev/null 2>&1 || { echo "PWOFF1_NOT_DONE: mail-plan.json is not the open plan for $HOST (4.3 first)"; exit 1; }
said -xF "PREVIEW_MAIL_MODE {\"mode\":\"open\",\"origin\":\"https://$HOST\"}" || { echo "PWOFF1_NOT_DONE: the running API does not say mail mode open on $HOST (4.3 first)"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login")" = 401 ] || { echo "PWOFF1_NOT_DONE: the site does not ask for the password now: look"; exit 1; }
! grep -qE 'review_locked|review_quiet|review window begin' "$C" || { echo "PWOFF1_NOT_DONE: the NETOPIA review window is open: REVIEW_CLOSE (5.8) first"; exit 1; }
[ ! -e "$M/password/Caddyfile.before-open" ] || { echo "PWOFF1_NOT_DONE: $M/password/Caddyfile.before-open exists (look first)"; exit 1; }
RB=$(robots "$C"); [ "$RB" != other ] || { echo "PWOFF1_NOT_DONE: the live Caddyfile has a robots line other than X-Robots-Tag \"noindex, nofollow\" in the header group after the password: ask"; exit 1; }
cp -p "$C" "$M/password/Caddyfile.before-open"; cp -p "$C" "$M/password/Caddyfile.open"
if [ "$RB" = group ]; then echo "the live Caddyfile sends the robots header already, in the header group after the password: in the copy, take out the basic_auth block and add no robots line (8.2)"; else echo "the live Caddyfile sends no robots header: in the copy, take out the basic_auth block and add the robots line (8.2)"; fi
echo "now edit $M/password/Caddyfile.open, then run PWOFF2"
echo PWOFF1_DONE
exit 0
```

**Edit the copy by hand** (`nano /root/preview-archive/main-site/password/Caddyfile.open`), in the public route of
the site block (dezbatere.ro):
1. Delete the `basic_auth` block: its first line, the line(s) inside it, and its closing `}`. As recorded when the
   test server was set up, these are three lines: `basic_auth {`,
   `{$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}` and `}`. (To confirm on the server: what the block's lines
   look like. Delete nothing else.)
2. The robots header, which asks search engines not to list the site. PWOFF1's line `the live Caddyfile sends …`
   says which case this file is:
   - `sends no robots header`: right after the line `respond @wrongHost "NOT_FOUND" 404`, add one line, at the same
     indentation: `header X-Robots-Tag "noindex, nofollow"`.
   - `sends the robots header already`: add nothing. The `header {` group after the `basic_auth` block already has the
     line `X-Robots-Tag "noindex, nofollow"` (a server's own file can have it from when the server was set up), and
     it stays in force with the password off. Change nothing in that group.

   PWOFF2 reads the kept file again and refuses a copy that does the other thing.
3. Keep the `@netopia_notify` handle and `caddy.env` as they are.

### 8.3 Take the site password off: put the copy in place

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PWOFF2: the edited copy checked, then put in place; Caddy restarts (about a second). On any failed check the password goes back.
# The robots header the Caddyfile may send already (the same lines in REVIEW_OPEN, REVIEW_MACTEST, PWOFF1 and PWOFF2). It prints none; group, when the one robots line is exactly X-Robots-Tag "noindex, nofollow" in a plain header group after the password, inside the dezbatere.ro block (a server's own file can have it from when the server was set up); or other, for any other robots line, which every step refuses.
robots() { awk '{ t = $0; sub(/^[ \t]+/, "", t) } $0 == "dezbatere.ro {" { s = 1 } s && $0 == "}" { s = 0 } s && t ~ /^basic_auth([ \t]|$)/ { a = 1 } s && g && t == "}" { g = 0 } tolower(t) ~ /x-robots-tag/ { n++; if (s && a && g && t == "X-Robots-Tag \"noindex, nofollow\"") k++ } s && a && t == "header {" { g = 1 } END { print (n == 0 ? "none" : (n == 1 && k == 1 ? "group" : "other")) }' "$1"; }
O=$M/password/Caddyfile.open; K=$M/password/Caddyfile.before-open
[ -s "$K" ] && [ -s "$O" ] || { echo "PWOFF2_NOT_DONE: the two copies of PWOFF1 are missing (PWOFF1 first; nothing changed)"; exit 1; }
! cmp -s "$K" "$O" || { echo "PWOFF2_NOT_DONE: the copy is not edited yet (edit it as 8.2 says, then run this again; nothing changed)"; exit 1; }
if cmp -s "$C" "$O"; then echo "PWOFF2_NOT_DONE: the edited copy is already the live Caddyfile (PWOFF2 ran before; nothing changed): move nothing, PWON needs both copies: ask"; exit 1; fi
cmp -s "$C" "$K" || { echo "PWOFF2_NOT_DONE: the live Caddyfile changed since PWOFF1 (nothing changed): move nothing (PWON reads $K and $O): ask"; exit 1; }
diff "$K" "$O" || true
# The copy adds the one robots line when the file before sends none, and nothing when its header group after the password sends it already.
case "$(robots "$K")" in
  none) ADD='header X-Robots-Tag "noindex, nofollow"'; HUNKS=2; WANT='the one robots line';;
  group) ADD=''; HUNKS=1; WANT='no line (the header group after the password sends the robots header already)';;
  *) echo "PWOFF2_NOT_DONE: the Caddyfile kept by PWOFF1 has a robots line other than X-Robots-Tag \"noindex, nofollow\" in the header group after the password (nothing changed): ask"; exit 1;;
esac
[ "$(diff "$K" "$O" | sed -n 's/^>[[:space:]]*//p')" = "$ADD" ] || { echo "PWOFF2_NOT_DONE: the copy must add $WANT and take out the basic_auth block, nothing else (8.2; nothing changed)"; exit 1; }
RM=$(diff "$K" "$O" | sed -n 's/^<[[:space:]]*//p' || true)
[ "$(printf '%s\n' "$RM" | head -n 1 | cut -d' ' -f1)" = basic_auth ] && [ "$(printf '%s\n' "$RM" | tail -n 1)" = '}' ] && [ "$(diff "$K" "$O" | grep -c '^[0-9]' || true)" = "$HUNKS" ] || { echo "PWOFF2_NOT_DONE: the copy does not remove exactly the basic_auth block"; exit 1; }
cad validate --config "$O" --adapter caddyfile >/dev/null 2>&1 || { echo "PWOFF2_NOT_DONE: caddy validate refused the copy"; exit 1; }
[ -n "$(order "$O" "$HOST" || true)" ] && [ "$(order "$O" "$HOST" | grep -c authentication || true)" = 0 ] || { echo "PWOFF2_NOT_DONE: the copy still has a password step, or no route for $HOST"; exit 1; }
{ install -o root -g root -m 0644 "$O" "$C.new" && mv "$C.new" "$C" && cmp -s "$O" "$C"; } || { echo "PWOFF2_NOT_DONE: the copy was not put in place; Caddy was not restarted, so the password is still on: ask"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
BAD=''
[ "$(systemctl is-active caddy || true)" = active ] || BAD="$BAD caddy"
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/login")" != 401 ] || BAD="$BAD password"
[ "$(curl -sI "https://$HOST/" | tr -d '\r' | grep -ci '^x-robots-tag: noindex, nofollow$' || true)" = 1 ] || BAD="$BAD noindex"
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/readyz")" = 404 ] || BAD="$BAD readyz"
[ "$(notify "$HOST")" != 401 ] || BAD="$BAD notify"
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3090/readyz)" = 200 ] || BAD="$BAD edge"
if [ -n "$BAD" ]; then { install -o root -g root -m 0644 "$K" "$C.new" && mv "$C.new" "$C"; } || { echo "PWOFF2_NOT_DONE: a check failed ($BAD), and the password file could not be put back: run PWON, then ask at once"; exit 1; }; systemctl restart caddy || true; sleep 3; [ "$(systemctl is-active caddy || true)" = active ] || { echo "PWOFF2_NOT_DONE: a check failed ($BAD); the password file is back, but Caddy did not start on it: the site is DOWN: ask at once"; exit 1; }; echo "PWOFF2_NOT_DONE: a check failed ($BAD); the password is back"; exit 1; fi
echo PWOFF2_DONE
exit 0
```

Expect the diff (the removed `basic_auth` lines, and the one added robots line when PWOFF1 said the file sends none),
then `PWOFF2_DONE`. The site is now open to everyone. Either way PWOFF2 checks that `/` sends the robots header exactly
once.

### 8.4 The site password back (the way back, and brake (b))

```sh
set -euo pipefail
# PWON: the site password back (the Caddyfile kept by PWOFF1), and the NETOPIA review window (5.8) closed if it is open; Caddy restarts. It reads no names file, so it works at any time.
C=/etc/debateai-v3-preview/public/Caddyfile; M=/root/preview-archive/main-site
K=$M/password/Caddyfile.before-open; O=$M/password/Caddyfile.open; TS=$(date -u +%Y%m%dT%H%M%SZ)
# The review window's marks, and how its lines come out again (the same lines in REVIEW_OPEN, REVIEW_CLOSE, PWON and REVIEW_MACTEST).
RV=/root/preview-archive/main-site/review; RK=$RV/Caddyfile.before-window; RW=$RV/Caddyfile.window
WB='# review window begin: the public pages answer strangers without the site password; REVIEW_CLOSE takes these lines out'; WE='# review window end'
wopen() { grep -qE 'review_locked|review_quiet|review window begin' "$1"; }
wstrip() { awk -v b="$WB" -v e="$WE" '{ t = $0; sub(/^[ \t]+/, "", t) } t == b { s = 1; n++; next } s && t == e { s = 0; next } s { next } t == "basic_auth @review_locked {" { print substr($0, 1, length($0) - length(t)) "basic_auth {"; c++; next } { print } END { if (n != 1 || s || c != 1) exit 1 }' "$1"; }
# Closing the window (the same lines in REVIEW_CLOSE and PWON): its lines come out of the live Caddyfile, the result is compared with the copy REVIEW_OPEN kept, put in place, and Caddy restarts. If Caddy does not start, the file with the window comes back.
wclose() {
  local S=$RV/Caddyfile.without-window-$TS L=$RV/Caddyfile.with-window-$TS P
  install -d -o root -g root -m 0700 "$RV"
  { wstrip "$C" > "$S" && ! wopen "$S" && [ "$(grep -cE '^[[:space:]]*basic_auth \{$' "$S" || true)" = 1 ]; } || { echo "$1_NOT_DONE: the window's lines do not come out of the live Caddyfile cleanly (edited by hand?); nothing changed, the window is still open: ask at once"; exit 1; }
  if [ -s "$RK" ] && cmp -s "$S" "$RK"; then echo "without the window, the Caddyfile is the one before REVIEW_OPEN, byte for byte"
  elif [ -s "$RK" ]; then echo "without the window, the Caddyfile differs from the copy REVIEW_OPEN kept; only the window's lines come out. The differences:"; diff "$RK" "$S" || true
  else echo "the copy REVIEW_OPEN kept is missing; only the window's lines come out"; fi
  cp -p "$C" "$L"
  { install -o root -g root -m 0644 "$S" "$C.new" && mv "$C.new" "$C" && cmp -s "$S" "$C"; } || { echo "$1_NOT_DONE: the Caddyfile without the window was not put in place (it is $S; Caddy was not restarted, the window is still open): ask at once"; exit 1; }
  systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
  if [ "$(systemctl is-active caddy || true)" != active ]; then
    { install -o root -g root -m 0644 "$L" "$C.new" && mv "$C.new" "$C"; } || true; systemctl restart caddy || true; sleep 3
    echo "$1_NOT_DONE: Caddy did not start without the window; the file with the window is back and Caddy is $(systemctl is-active caddy || true) (active: the window is still open; anything else: the site is DOWN): ask at once"; exit 1
  fi
  for P in / /terms /login; do [ "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://dezbatere.ro$P" || true)" = 401 ] || { echo "$1_NOT_DONE: Caddy runs without the window, but https://dezbatere.ro$P does not ask for the password: ask at once"; exit 1; }; done
  for P in "$RK" "$RW"; do if [ -e "$P" ]; then mv "$P" "$P.closed-$TS"; fi; done
  echo "the review window is closed: every page asks for the site password again"
}
if wopen "$C"; then wclose PWON; fi
ON=no; for H in dezbatere.ro v3-preview.dezbatere.ro; do if [ "$(curl -s -o /dev/null -w '%{http_code}' "https://$H/login" || true)" = 401 ]; then ON=yes; fi; done
if [ "$ON" = yes ]; then for F in "$K" "$O"; do if [ -e "$F" ]; then mv "$F" "$F.$TS"; fi; done; echo "the site already asks for the password"; echo PWON_DONE; exit 0; fi
[ -s "$K" ] && cmp -s "$C" "$O" || { echo "PWON_NOT_DONE: the live Caddyfile is not the one PWOFF2 put in place: ask at once (the kept copy is $K)"; exit 1; }
{ install -o root -g root -m 0644 "$K" "$C.new" && mv "$C.new" "$C" && cmp -s "$K" "$C"; } || { echo "PWON_NOT_DONE: the kept Caddyfile was not put in place (the kept copy is $K): ask at once"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
ON=no; for H in dezbatere.ro v3-preview.dezbatere.ro; do if [ "$(curl -s -o /dev/null -w '%{http_code}' "https://$H/login" || true)" = 401 ]; then ON=yes; fi; done
[ "$ON" = yes ] || { echo "PWON_NOT_DONE: the site does not ask for the password: ask at once"; exit 1; }
mv "$K" "$K.$TS"; mv "$O" "$O.$TS"
echo PWON_DONE
exit 0
```

If the NETOPIA review window (5.8) is open, PWON closes it first, with the same lines as REVIEW_CLOSE, and prints
`the review window is closed: every page asks for the site password again`.

### 8.5 The rules once the site is open

- The brakes are those of 6.5, with PWON as brake (b).
- `everyone-with-test-payments` never runs without the password. Put the password back before anyone writes that
  value again.
- With 6b open (`everyone-with-listed-buyers`, NETOPIA's sandbox), only the listed accounts may buy, and OPENCHECK
  (6b.4) runs every morning. ASKS_CLOSE and MAIL_CLOSE need PWON first, as with real payments.
- Nothing becomes publicly listed by search engines while the robots header is sent (the line PWOFF2 checked).

---

## 9. Closing everything again

Close in this order. Each step is safe to stop after. The scripts hold you to it. While the site is open, PAY_BACK,
NAME5, ASKS_CLOSE and MAIL_CLOSE refuse, whatever the payments. While payments are real, NAME5 refuses too. While the
NETOPIA review window (5.8) is open, NAME5 refuses too; step 1 closes it.

**If 6b was open** (the site open with listed buyers, on NETOPIA's sandbox): the same order. Step 1 puts the password
back and step 2 gives asks and buying back to the team. Before step 3, every sandbox plan the listed accounts bought is
withdrawn or cancelled (3.3; PAY0, 7.1, until it prints all zeros). Step 3 (PAY_BACK) is needed only if payments were
ever real. The people who signed up keep their accounts, but cannot reach the site again until part 8 opens it.

**Publishing (5.9) is not one of these steps.** Closing everything leaves it as it is, behind the site password again;
PUBOFF (5.9b) is its own step, and what it can and cannot undo is said there.

**If the password was ever off with real payments on (part 8), stop and ask before step 1.** Someone outside the
team may then hold a paid plan. A paid plan renews every month on its saved card until its owner cancels it, and
both ways to cancel (Settings, and the `/cancel` link in the plan's mails) are behind the site password. Once the
password is back, such a plan does not end until its owner cancels it on `/cancel`, and only the NETOPIA review
window (5.8, REVIEW_OPEN) can let them reach that page again. Until then PAY_BACK never passes, and that person is
still charged every month while they cannot open the rest of the site. Never end their plan yourself. PWON as a
brake (6.5 (b)) still works at any time.

1. **The site password back:** PWON (8.4). It also closes the NETOPIA review window (5.8) if it is open.
2. **Asks back to the team:** ASKS_CLOSE (6.3).
3. **Payments back to the sandbox:** PAY_BACK (7.11). It waits until every live plan is over and every refund and
   credit note is recorded. After your test payment alone, that takes days. Meanwhile the password stays on, and
   steps 4 to 6 wait too.
4. **The name back to the test name:** NAME5 (5.5). It also moves the mail plan and the API file's two staff name
   lines back to the test name. If the staff screens were on, they are on again there, and the staff key you first
   enrolled on the test name works again. If they were off and you want them, run STAFFON (5.5b) after NAME5, on a
   server where STAFFOFF once took them off; otherwise ask.
5. **Mail back to the allow-list:** MAIL_CLOSE (4.4), then check the v1 file is the kept one:
   `sha256sum /etc/debateai-v3-preview/auth-dev-v1/mail-plan.json` must print the digest of 4.1.
6. Run CLOSED (3.1). Expect `CLOSED_DONE`.

**The rule for going back to an older release** (the release guide's way back, or any older release). Older releases
know none of these settings, and they answer only as the test name.
- **After this upload, the release before it comes back only through the release guide's rbD-B.** rbD-B puts back
  the database copy made at DR3, so every account, debate, mail and payment record written since then is lost.
  Before you choose it, run LIVEAFTER (7.12) with this upload's rNN. If it does not end with `LIVEAFTER_DONE`, never
  go back, even after PAY_BACK: the invoice, the credit note and the refund stay in SmartBill, ANAF and NETOPIA,
  while our records of them would be gone. Fix forward, and ask.
- **Settings activations on the release before** are refused after rbD-B (`SETTINGS_GATE_HELPER_DIFFERS`): the
  gates keep this release's gate code, and the shared tools stay this release's and list the Amazon gate. The release
  before runs and its brakes work; a line-up change waits for the next upload of this code. Ask if one cannot wait.
- **rbD-B brings back the database only.** Key folders destroyed after DR3 stay destroyed: an account deleted since
  then comes back without its keys, like the unfinished sign-ups below. With publishing on, 5.9a says what it means
  for the public debates and their keys, and that the public library stays held until you release it.
- **The unfinished sign-ups the new release deleted** (UNFINISHED, part 2: at DR6 and every ten minutes after) come
  back with DR3's cold copy, but without their key folders, which the new release destroyed. Those sign-ups cannot be
  finished, and their addresses and pseudonyms stay taken, until a release with this code runs again and deletes them
  once more; then those people can sign up again.
- Close payments first (PAY_BACK): an older API refuses the payments line, and does not see open live work.
- Then close the name (NAME5): an older launcher refuses the main name.
- Put the **v1 mail plan** back (MAIL_CLOSE on the test name), and check its digest. With a v2 plan an older release
  starts normally but refuses every mail, with no sign at start except `AUTH_MAIL_DELIVERY_FAILED … code=SENDMAIL_EXIT_1`
  in its journal.
- Asks: an older release starts from its own files, which have no asks line. Close asks in the current files anyway
  (ASKS_CLOSE), so the two releases agree. With 6b's value this is required, after PWON: a release older than the one
  that carries 6b refuses `everyone-with-listed-buyers` at start (`PREVIEW_ASKS_OPEN_TO_INVALID`), and it lets any
  signed-in account buy on the sandbox.
- Staff screens: an older release starts from its own files, so its staff screens and staff name lines are as they
  were when those files were made. The current files need nothing for the switch: the SAME checks do not compare the
  staff lines. An older release cannot enrol a staff key under a new name (5.7 needs this release or a later one); a
  key already enrolled stays in the database and works on any release, under its own name.
- Only then do the release switch.

---

## 10. Every named refusal code of these locks

Where it shows:
- **Launcher**: one line in the service's journal, `PREVIEW_API_STARTUP_REFUSED <code>`,
  `PREVIEW_UI_STARTUP_REFUSED <code>` or `PREVIEW_RUNNER_STARTUP_REFUSED <code>`. It comes before any of that service's
  own code runs.
- **API start**: first `{"event":"api.boot.failed","stage":"<stage>"}`, then `PREVIEW_API_STARTUP_REFUSED <code>`.
- **SAME**: `lc release-env.mjs same --labels "$LABEL" --slots "$SLOT"` prints `BAD <check>`.
- **Per request or per mail** (the last five rows): the service keeps running and refuses that one request or mail.

In every other case the service is not running, except for the SAME rows and `MODE_OTHER_ACCOUNT`, which stop
nothing by themselves (NAME3 and NAME5 run SAME after they stopped the site, and their last line says so). The scripts
above put the setting before back by themselves; if you set a value by hand, put back the file you changed and restart
that service.

| Code | Where | What it means | What to do |
|---|---|---|---|
| `PREVIEW_ORIGIN_NOT_LISTED` | launcher, API or website | `PUBLIC_APP_URL` is missing, or not exactly `https://v3-preview.dezbatere.ro` or `https://dezbatere.ro` (no slash, no www, no capitals) | NAME5; check the env file |
| `PREVIEW_MAIN_ORIGIN_NOT_HOSTED` | launcher, API | the main name without `DEBATEAI_DEPLOYMENT_MODE=hosted` | NAME5; ask |
| `PREVIEW_STAFF_ORIGIN_MISMATCH` | launcher, API | the API file holds `STAFF_ACCESS_POLICY_VERSION=2` (the staff screens on), but its two staff name lines name the other name: a staff key belongs to one name | NAME5 (it moves the name and the two lines back together). Never put the policy line back by hand: STAFFMAIN (5.7) on dezbatere.ro, STAFFON (5.5b) on the test name |
| `PREVIEW_ORIGIN_SITE_KEY_MISMATCH` | launcher, website | the website file's Turnstile site key is not the listed one | NAME5; put the site key line back |
| `PREVIEW_PROVIDER_ORIGIN_INVALID` | the API's own guard | the API was started without the launcher on a name it does not admit (through the launcher, `PREVIEW_ORIGIN_NOT_LISTED` or `PREVIEW_MAIN_ORIGIN_NOT_HOSTED` comes first, so you will not see this code there) | ask |
| `PREVIEW_ASKS_OPEN_TO_INVALID` | launcher, API or runner | `PREVIEW_ASKS_OPEN_TO` is not exactly `everyone`, `everyone-with-test-payments` or `everyone-with-listed-buyers`; or a release older than the one that carries 6b met `everyone-with-listed-buyers` | ASKS_CLOSE (after PWON when the site is open) |
| `PREVIEW_ASKS_OPEN_TO_WITHOUT_PREVIEW` | launcher, API or runner | the line is set without the preview's test configuration | ASKS_CLOSE; ask |
| `PREVIEW_ASKS_OPEN_TO_WITH_TEAM` | launcher, API or runner | the team line is still in the same file, beside `everyone` or `everyone-with-test-payments` | ASKS_CLOSE, then ASKS_OPEN |
| `PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_WITHOUT_TEAM` | launcher, API or runner; SAME prints `BAD VALID_PREVIEW_ASKS_OPEN_TO:<label>` before any restart | `everyone-with-listed-buyers` in a file without the team line, which under that value is the list of buyers (6b) | ASKS_OPEN and BUYERS put the file before back by themselves; if a file was changed by hand, put it back, then ask |
| `PREVIEW_ASKS_OPEN_TO_NOT_HOSTED` | launcher, API or runner | the file is in local mode | ASKS_CLOSE; ask |
| `PREVIEW_ASKS_OPEN_TO_WITHOUT_ROOM` | API start, stage `preview-asks-open` | the ask room (the site's daily ceiling and per-person holds) is not built | ASKS_CLOSE; ask |
| `PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING` | API start, stage `preview-asks-open` | `everyone` while billing runs on NETOPIA's sandbox | ASKS_CLOSE; open with `everyone` only after part 7 |
| `PREVIEW_ASKS_OPEN_TO_BILLING_OFF` | API start, stage `preview-asks-open` | `everyone` while the site version's billing is off (the provider-only mode included) | ASKS_CLOSE; asks stay closed until an upload turns billing on (then part 7) |
| `PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX` | API start, stage `preview-asks-open` | `everyone-with-test-payments` with live payments, or billing off | ASKS_CLOSE. With live payments, open with `everyone`. With billing off, asks stay closed (only an upload turns billing on) |
| `PREVIEW_ASKS_OPEN_TO_LISTED_BUYERS_NOT_SANDBOX` | API start, stage `preview-asks-open` | `everyone-with-listed-buyers` while payments are not NETOPIA's sandbox: real payments (with the payments line), billing off, or the provider-only mode. NETOPIA's live address without the payments line stops earlier, with `PREVIEW_LIVE_PAYMENTS_UNSET`. SAME does not look at payments, so only the start refuses it | ASKS_OPEN puts both files back by itself. 6b runs only on the sandbox: with real payments, ASKS_CLOSE (after PWON when the site is open), then open with `everyone` (part 8) |
| `PREVIEW_MAIL_PLAN_UNREADABLE` | launcher, API | `mail-plan.json` is missing, not root's 0644 file with one link, empty or over 4 KiB, not strict JSON, or its folder is wrong | put the last good plan back (MAIL_CLOSE, or 1.5) |
| `PREVIEW_MAIL_PLAN_SCHEMA` | launcher, API | another schema; a key missing or extra; a value of the wrong type; v2 without `recipients`; allow-list without `recipientPolicy` | as above |
| `PREVIEW_MAIL_MODE_UNKNOWN` | launcher, API | `recipients` is not exactly `allow-list` or `open` | as above |
| `PREVIEW_MAIL_OPEN_WITH_ALLOW_LIST` | launcher, API | `open` together with a `recipientPolicy` key | as above |
| `PREVIEW_MAIL_ALLOW_LIST_UNREADABLE` | launcher, API | allow-list mode, and `mail-recipient.json` does not read (root:<group> 0640, at most 1 KiB) | as above; check that file |
| `PREVIEW_MAIL_ORIGIN_NOT_ALLOWED` | launcher, API | the plan's `publicAppUrl` is not one of the two names | as above |
| `PREVIEW_MAIL_ORIGIN_MISMATCH` | launcher, API | the plan names another name than the API's `PUBLIC_APP_URL` | NAME5 (or redo NAME3); the plan moves with the name |
| `PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN` | launcher, API | a v1 plan with the main name, or a v1 plan while the API answers as the main name | NAME5, then part 4.2 first |
| `PREVIEW_MAIL_FROM_MISMATCH` | launcher, API | the plan's sender is not the API's `MAIL_FROM` | put the kept plan back; ask |
| `PREVIEW_MAIL_UID_MISMATCH` | launcher, API | the plan's `apiUid` is not the API's user | put the kept plan back; ask |
| `PREVIEW_MAIL_TIMEOUT_MISMATCH` | launcher, API | `transportTimeoutMs` is not 5000 | put the kept plan back |
| `PREVIEW_LIVE_PAYMENTS_REFUSED:value` | launcher, API | the payments line is not exactly `real-money` | PAY_SWITCH put the sandbox back; fix `live.lines` |
| `PREVIEW_LIVE_PAYMENTS_REFUSED:incomplete` | launcher, API | not all ten billing lines are there | as above |
| `PREVIEW_LIVE_PAYMENTS_REFUSED:netopia-base` | launcher, API | NETOPIA's address is not its live one | as above |
| `PREVIEW_LIVE_PAYMENTS_REFUSED:quaderno-base` | launcher, API (also `modecheck`) | Quaderno's address is not one live account (`https://<label>.quadernoapp.com/api`) | as above |
| `PREVIEW_LIVE_PAYMENTS_REFUSED:smartbill-base` | launcher, API | SmartBill's address is not its real one | as above |
| `PREVIEW_LIVE_PAYMENTS_REFUSED:paths` | launcher, API | a key path is not its `live-*` path | as above |
| `PREVIEW_LIVE_PAYMENTS_REFUSED:egress` | launcher, API (also `modecheck`) | the egress proxy is not in its live form, not running, an older copy, or silent for 3 s | PAY_EGRESS |
| `PREVIEW_LIVE_PAYMENTS_REFUSED:egress-account` | launcher, API (also `modecheck`) | the proxy's live form names another Quaderno label than the API file | PAY_EGRESS with the label of `live.lines` |
| `PREVIEW_LIVE_PAYMENTS_BILLING_OFF` | API start, stage `preview-live-payments` | the active site version has billing off | sandbox back (automatic); only an upload turns billing on |
| `PREVIEW_LIVE_PAYMENTS_UNSET` | API start, stage `preview-live-payments` | NETOPIA's live address without the payments line (the launcher stops this first) | sandbox back; ask |
| `PREVIEW_LIVE_PAYMENTS_MISMATCH` | API start, stage `preview-live-payments` | the payments line without NETOPIA's live address (the launcher stops this first) | sandbox back; ask |
| `PREVIEW_LIVE_PAYMENTS_OFF_PREVIEW` | API start, stage `preview-live-payments` | the payments line outside the preview's test configuration | sandbox back; ask |
| `BILLING_OTHER_SYSTEM_RECORDS_OPEN:subscriptions=N:charges=N:jobs=N` | API start, stage `billing-other-system-records` (going live) or `billing-live-records-on-sandbox` (going back) | the other payment system's plans, payments or jobs are still open | going live: 7.1; going back: wait, then PAY_BACK again |
| `BILLING_RECORDS_DATED_AHEAD:rows=N:jobs=N` | API start, stage `billing-records-dated-ahead` | billing rows dated in the future | sandbox back; ask |
| `BILLING_LIVE_SANDBOX_INVOICER_REFUSED` | API start, stage `billing-runtime` | live NETOPIA beside a sandbox Quaderno or SmartBill | sandbox back; fix `live.lines` |
| `BILLING_STAGE_LIVE_INVOICER_REFUSED` | API start, stage `billing-runtime` | NETOPIA's sandbox beside a live Quaderno or SmartBill | put `sandbox.lines` back (PAY_BACK); ask |
| bare `PREVIEW_API_STARTUP_REFUSED` after stage `billing-connectors` | API start | a live key file's owner or mode, or the form of the POS signature or series (not named, on purpose) | sandbox back; check 7.3 and 7.4 |
| bare `PREVIEW_API_STARTUP_REFUSED` after stage `ui-api-proof` | API start | the new API file's proof line, or its proof file, is missing (SB5c) | in an upload: the stage table of part 2 (DR6); otherwise put back the file you changed; ask |
| bare `PREVIEW_API_STARTUP_REFUSED` after stage `restore-fence-path` | API start | the fence line is missing (H11 step 2), or the fence folder lies above a key store or a key file | as above |
| bare `PREVIEW_API_STARTUP_REFUSED` after stage `restore-fence` | API start | the fence folder is missing, or not the API user's 0700 folder (FENCEDIR) | as above |
| bare `PREVIEW_API_STARTUP_REFUSED` after stage `outbound-mail-policy` or `outbound-mail-store` | API start | the mail plan, or the mail's own store | put the last good plan back (MAIL_CLOSE, or 1.5); ask |
| bare `PREVIEW_API_STARTUP_REFUSED` after stage `pre-start-writer` | API start | the database step that records the charges before Start is missing or refused | ask |
| bare `PREVIEW_API_STARTUP_REFUSED` after stage `saved-question-key-store` | API start | the saved questions' key store | ask |
| bare `PREVIEW_API_STARTUP_REFUSED` after stage `corpus-kek`, `publication-secret-domains`, `database-roles`, `publication-key-store` or `publication-key-cleanup` | API start | publication's corpus key, its key store or its clean-up login, set up but not as the code needs (5.9) | PUBON and PUBOFF put the file before back by themselves; PUBCHECK (5.9) reads most of what the start checks; ask |
| bare `PREVIEW_API_STARTUP_REFUSED` after stage `support-keys` | API start | the support key; with publishing on, also a corpus key that is not the API user's `0600` file of 32 bytes, or holds another key's bytes | as above |
| bare `PREVIEW_UI_STARTUP_REFUSED` | launcher, website | in an upload, first the website file's proof line or its proof file (SB5c); otherwise a rule outside these locks | in an upload: the stage table of part 2 (DR6); otherwise put back the file you changed; ask |
| bare `PREVIEW_API_STARTUP_REFUSED`, no stage line | launcher | a rule outside these locks, for example a stray key, or the payments line in local mode or on an older release; or a publication line the API's settings check refuses (for example `PUBLICATION_ENABLED=true` without `CONTENT_ENCRYPTION_ENABLED=true`, a key path missing, or a clean-up line equal to another login's line: PUBON checks these first) | put back the file you changed (PUBON and PUBOFF do it by themselves); ask |
| `PREVIEW_EGRESS_REFUSED` | the egress proxy's own journal; the unit fails | a bad label in the drop-in, or both forms at once | PAY_UNDO; check the label |
| `MODE_OTHER_ACCOUNT` | the egress proxy's journal | the mode question named another Quaderno account | PAY_EGRESS with the label of `live.lines` |
| bare `PREVIEW_RUNNER_STARTUP_REFUSED` | launcher, runner | the runner file has no preview configuration, or no team and no asks line (`PREVIEW_RUNNER_TEAM_REQUIRED`, not printed by name) | put back the runner file; ask |
| `PREVIEW_TEAM_GATE_REFUSED` with `RUNNER_PREVIEW_OUTSIDER_CLAIM_LIVE` | runner's journal, then a bare refusal | a non-team debate still holds a live claim | wait a few minutes for the claim to lapse, then start the runner again (`systemctl start debateai-preview-runner@<label>`); ask if it refuses again |
| `PREVIEW_TEAM_GATE_REFUSED` with `RUNNER_PREVIEW_TEAM_UNSET`, `RUNNER_PREVIEW_ACCOUNT_RULE_UNSET`, `RUNNER_STARTUP_BACKLOG_SATURATED` (more than 100 open jobs) or `RUNNER_PREVIEW_TEAM_REFUSAL_UNRECORDED` | runner's journal, then a bare refusal | the runner could not apply its start rule | ask |
| `BAD SAME_UI_API_PUBLIC_APP_URL:<label>` | SAME | the website and API files name different names | NAME5 |
| `BAD SAME_PUBLIC_APP_URL` | SAME, two releases | two releases name different names | ask before any switch |
| `BAD SAME_API_RUNNER_PREVIEW_ASKS_OPEN_TO:<label>` | SAME | the API and runner files disagree about asks | ASKS_CLOSE |
| `BAD VALID_PREVIEW_ASKS_OPEN_TO:<label>` | SAME | a file breaks an asks rule (value, team line, mode) | ASKS_CLOSE |
| `BAD SAME_PREVIEW_ASKS_OPEN_TO` | SAME, two releases | two releases disagree about asks | ask before any switch |
| `BAD SAME_API_RUNNER_PREVIEW_TEAM_USER_IDS_JSON:<label>` | SAME | the API and runner files hold different team lines (under 6b: different lists of buyers) | ASKS_OPEN, ASKS_CLOSE and BUYERS put both files back by themselves; otherwise ask |
| `BAD SAME_PREVIEW_TEAM_USER_IDS_JSON` | SAME, two releases | two releases hold different team lines (under 6b: the list changed during an upload) | ask before any switch |
| `BAD SAME_API_PAYMENT_SYSTEM` | SAME, two releases | two API files name different payment systems | ask before any switch |
| `PREVIEW_TEAM_ONLY` (HTTP 403 from `/api/v1/billing/checkout` or `/api/v1/billing/subscription/upgrade`; the order page and the Settings upgrade show "Buying a plan is open only to invited accounts for now. You can keep using the Free plan.") | per request, the API | an account the buyer rule does not admit tried to buy or upgrade a plan: with asks closed, an account not on the team (on NETOPIA's sandbox too, with the release that carries 6b); under `everyone-with-listed-buyers` (6b), an account not on the list. Nothing was charged or written, and no NETOPIA page opened | expected; pay with a team account; under 6b, allow the account on the Team page if it may buy (6b.3; BUYERS on a release before the Team page's list); with real payments, open asks (part 8) |
| `PREVIEW_BUYERS_UNAVAILABLE` (HTTP 503 from the same two addresses; the page shows "Something went wrong. Please try again."; the API's journal holds `{"event":"api.preview.buyer_check_unavailable"}`) | per request, the API | under `everyone-with-listed-buyers` on the sandbox, an account not on the team line tried to buy, and the API could not read the Team page's list within 3 seconds (the database did not answer, or the API's login may not read it). It refuses rather than guess: nothing was charged or written, and no NETOPIA page opened; the team line still buys | OPENCHECK (6b.4) counts it; if it comes back, ask |
| `PREVIEW_MAIL_REFUSED` (and the API's `AUTH_MAIL_DELIVERY_FAILED … code=SENDMAIL_EXIT_1`) | per mail, the mail program | one mail was refused by the plan's rules (in allow-list mode: an address not on the list); with a correct plan, on every mail: the mail program ran out of time before it handed the mail on | expected in allow-list mode for other addresses; otherwise ask before MAIL_CLOSE (4.2) |
| `AUTH_MAIL_DELIVERY_FAILED … code=SENDMAIL_TIMEOUT` | per mail, the API | the mail program took more than 5 seconds and was stopped (MAILTIME, 1.8, timed its load) | ask before MAIL_CLOSE (4.2) |
| a plain `401` with no password box (only while the NETOPIA review window, 5.8, is open) | per request, Caddy | a stranger's background request for a closed address: a Next.js page request, the account check (`/api/v1/session`), the help check (`/api/v1/geo/availability`) or the browser's own icon request (`/favicon.ico`, `/apple-touch-icon.png`); the page shows Log in and no Help, and no password box opens | expected; if a password box opens by itself over a public page, REVIEW_CLOSE, then ask |
