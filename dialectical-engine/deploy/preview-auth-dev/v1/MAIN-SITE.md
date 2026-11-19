# Opening the test server as dezbatere.ro, and closing it again

This is the owner's runbook for the test server (the "preview kit" in this folder). It starts the day before the
upload and ends with every lock closed again. Read part 0 and the order rules first. Then do the parts in order.

## 0. What this is

The test server is locked on purpose. There are six locks:

1. **The name.** The website and the API answer only as the test name (v3-preview.dezbatere.ro).
2. **The team.** Only the accounts on the team list may start debates. While payments are real, only they may buy a
   plan, too.
3. **Mail.** Mail goes only to the four allow-listed addresses.
4. **Payments.** Only NETOPIA's sandbox is admitted: test cards, no real money.
5. **The site password.** Caddy (the web server in front of the website) asks every visitor for a password.
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
- *M1, M2, M8* are mails to the buyer: M1 is the confirmation with the Terms, M2 the receipt, M8 the mail that
  confirms a withdrawal's refund. *O2_REFUND_DUE*, *O2_WITHDRAWAL* and *O3* are mails to you: O2_REFUND_DUE is a
  refund you must make in NETOPIA's admin; O2_WITHDRAWAL is a withdrawal whose refund you must settle by hand; O3 is a
  billing job that failed for good (for example an invoice SmartBill refused).
- *A bcrypt hash* is the scrambled form of the site password that Caddy keeps. The password itself is never stored.

**How to run a server step.** Each block that starts with `set -euo pipefail` is one script.
1. On the server, as root, remove the last step's file and open an empty one:
   `rm -f /root/ms-step.sh; nano /root/ms-step.sh`. nano must show an empty file. If it shows any text, stop.
2. Paste the whole block. Save (Ctrl-O, Enter) and close (Ctrl-X).
3. Run it: `bash /root/ms-step.sh`.
4. Read the last line. It says `<STEP>_DONE`, or `<STEP>_NOT_DONE: <why>`.

After `<STEP>_NOT_DONE`, run nothing more. Read the reason. Do what the text under the block says, or ask. Every
script checks first and changes things last, so a script that stops early has changed nothing, unless its message
says otherwise. If a script stops with no `<STEP>_…` line at all, treat it as `<STEP>_NOT_DONE` and ask.

**Typing a value.** A few steps ask you to type a key, a label or an address. Type it at the prompt. Keys are not shown
while you type, and nothing you type goes on a command line. Never paste a key, a password or an address into a chat
with Claude.

**Amounts on the screen.** Some steps print amounts: GATES and the scripts that call it (the day's spend of each
spending gate), WITHDRAWOTHER, REFUNDDONE, and the tax summary of EFACTURA. Never paste those lines into a chat, a
GitHub issue or a pull request. When you ask for help, give the step's last line, and say which step it was.

**`<…>` in a block** is a value you fill in before you run it. `rNN` is the upload's number, as in the release guide.

**"To confirm on the server"** marks a step this document could not check against the code. Do it slowly, and ask
if the server shows something else.

## The order

| Part | What | The site | The way back |
|---|---|---|---|
| 1 | before the upload: the companies, DNS, mail, old debates, your numbers | unchanged | nothing to undo |
| 2 | the upload, every lock closed | the release guide's downtime | the release guide's way back |
| 3 | your sandbox payment test, on the test name, behind the password | unchanged | close the sandbox records |
| 4 | mail: allow-list on the new path, then open | password on | MAIL_CLOSE |
| 5 | the main name | password on | NAME5 |
| 6 | friends' test with test payments | password on | ASKS_CLOSE |
| 7 | real payments (after a friends' test, a new site password first) | password on | PAY_BACK |
| 8 | opening to everyone: asks, then the password off (only once your staff key works on dezbatere.ro, 5.7) | open | PWON, ASKS_CLOSE |
| 9 | closing everything again | closed | – |
| 10 | every named refusal code | – | – |

**What fits in one day.** The upload, your sandbox test, mail, the name, a friends' test, and the first real payment
can all be done in one day, unless one of these holds you up:
- Mail opens only when SES shows Production access. Amazon's review can take up to a day, so ask for it the day
  before (1.4).
- Cancel your own sandbox plans: a cancelled plan does not block real payments. The account that holds it cannot buy a
  live plan until that plan's month ends, so pay with another team account (7.2). A sandbox purchase as a Romanian
  buyer blocks real payments for about 14.6 hours. A payment page that anyone left unfinished blocks them for up to
  24 hours (3.2, 6).
- ANAF's answer to an invoice or a credit note can take hours. Record it when it comes (7.9).
- The refund of the first real payment may be recorded only the next day (7.10). Going back to the sandbox (7.11)
  waits for it and for its credit note.

It is fine to end the day with real payments on, behind the new site password, with asks for the team only: that is
the state part 7 leaves. Do all staff work (Hide now) on the test name before the rename (1.6): a staff key belongs
to one name, so from the rename on nobody can use the staff screens until their staff key is enrolled again under
dezbatere.ro (5.7). Part 8 (opening to everyone) waits for that.

**If your real payment comes before a friends' test.** Parts 6 and 7 can swap. Do parts 1 to 5, then part 7, and
skip 7.0: nobody else has had the site password yet. Friends can then come in while payments are real: run ASKS_OPEN
(6.1) with the line `V=everyone`, and stop there, so the site password stays on. They use the Free plan. Tell them
not to press **Abonați-vă și plătiți** (Subscribe and pay): payments are real, a plan one of them buys renews every
month until they cancel it in Settings, and PAY_BACK waits for it. Tell them too that a finished Free debate can go
public by itself, to everyone inside the site password, and that nobody can take it down by hand until your staff
key works on dezbatere.ro (5.7). When your own refund and its credit note are
recorded, run ASKS_CLOSE (6.3), then PAY_BACK (7.11), then part 6 as written, with test payments. Before real payments
go on a second time, that friends' test closes and the site password changes (7.0), as the order rules say.

**The order rules.** The code enforces most of them; the scripts check the rest before they change anything.
- **Mail before the name.** With today's mail plan (v1), the API refuses to start on the main name
  (`PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN`). Part 4 comes first.
- **The name before real payments.** NETOPIA's return and notice addresses are made from the name the API answers as,
  at the moment of each payment. Take real payments only on the name they will stay on.
- **The friends' test closes before real payments.** The API refuses `everyone-with-test-payments` with live payments
  (`PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX`). The friends knew the site password, so it changes before real
  payments (PWNEW, 7.0).
- **`everyone` needs real payments.** The API refuses `everyone` while billing runs on NETOPIA's sandbox
  (`PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING`): anyone could pay with the public test card and get real AI credit. With
  billing off it is refused too (`PREVIEW_ASKS_OPEN_TO_BILLING_OFF`): without plans, an account's only limit is its
  share of the site's day, so a few accounts could use up the whole day.
- **Who may buy follows who may ask.** While payments are real and asks are closed, the API refuses a checkout or a
  plan upgrade from any account not on the team (`PREVIEW_TEAM_ONLY`). Once asks are open to `everyone`, anyone
  signed in may buy.
- **Asks and mail close only behind the password while payments are real.** ASKS_CLOSE and MAIL_CLOSE refuse while
  payments are real and the site is open: closing asks would lock paying customers out of their questions, and
  closing mail would send buyers outside the allow-list no confirmation (M1, with the Terms) and no receipt (M2). PWON
  first.
- **The site password comes off last:** after mail is open, after real payments work, and after asks are open to
  everyone.
- **The payment marks need the password on, and the test name.** If an upload adds the payment marks (the release
  guide's PM2), it must run while the site password is on: the tool refuses a Caddy file without the password. It
  also runs only before NAME1, the first step of the main name (5.6).
- **Never open or close a lock during an upload**, from SB3 to the end of DR6 (or SB13), and never while a second
  release is staged or draining. The locks' names file below stops you when a release is staged or draining. Only
  the brakes (a) and (b) of 6.5 may run during an upload: the gates' `stop`, and PWON (the site password back).

---

## 1. Before the upload (nothing on the test site changes)

### 1.1 The payment companies (in their websites)

**NETOPIA, live admin.**
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

**The payment marks.** If the site does not show the NETOPIA, Visa and Mastercard marks yet, and you want them before
real payments, they must come with this upload. In the release guide ("Payment marks: the files and Caddy's rule"):
PM1 any time after SB1; then, after DR1 and before DR2, SB5b, MT1, PM2 and MT2. From NAME1 (part 5) on, no step adds
them.

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
see is only the list of **published** test debates. Hiding is the supported way to take one down. Only the staff
screens (Admin → Team) can hide a debate by hand; the public Report button can also hide one by itself (5.1b).

**First, see whether the staff screens are on.** STAFFCHECK only reads. Run it before the upload:

```sh
set -euo pipefail
# STAFFCHECK: whether the staff screens are on in the running API's file (read-only; prints names and counts, never a key).
L=/opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1
lc() { /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$L/$1" "${@:2}"; }
E=/etc/debateai-v3-preview/auth-dev-v1
ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "STAFFCHECK_NOT_DONE: release-check.mjs status refused (above): ask"; exit 1; }
CL=$(jq -r '[.releases[] | select(.state == "CURRENT") | .label] | if length == 1 then .[0] else "" end' <<<"$ST" || true)
[ -n "$CL" ] || { echo "STAFFCHECK_NOT_DONE: the release table does not name exactly one current release, or did not read (above): ask"; exit 1; }
F=$E/api-$CL.env
[ -f "$F" ] || { echo "STAFFCHECK_NOT_DONE: $F is missing: ask"; exit 1; }
echo "the running API's file: $F (the API is $(systemctl is-active "debateai-preview-api@$CL" || true))"
grep -E '^(PUBLIC_APP_URL|STAFF_ACCESS_POLICY_VERSION|STAFF_WEBAUTHN_ORIGIN|STAFF_WEBAUTHN_RP_ID)=' "$F" || true
P=$(grep -c '^STAFF_ACCESS_POLICY_VERSION=' "$F" || true); P1=$(grep -cx 'STAFF_ACCESS_POLICY_VERSION=1' "$F" || true); P2=$(grep -cx 'STAFF_ACCESS_POLICY_VERSION=2' "$F" || true)
AL=$(grep -c '^INTERNAL_ALLOWANCE_' "$F" || true); RC=$(grep -c '^SUPPORT_MODEL_TARGET_JSON=' "$F" || true)
echo "team allowance lines: $AL; the Report button's AI check line: $RC"
if [ "$P/$P2" = 1/1 ]; then
  echo "staff tools are on: do your staff work now (1.6); after a rename, enrol your staff key again under the new name (5.7)"
  [ "$AL" = 0 ] || echo "the file has team allowance lines: they need the staff tools on, so never run STAFFOFF here"
elif [ "$P" = 0 ] || [ "$P/$P1" = 1/1 ]; then
  echo "staff tools are off: Hide now does not exist on this server now; skip step 2 below (STAFFON, 5.5b, or STAFFMAIN, 5.7, puts them on)"
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
  through the rename (5.1b). The count line above it (`team allowance lines: 0; …`) is not a warning.
- `staff tools are off`: Hide now does not exist on this server now. Skip step 2 below. If a published debate must
  not stay public, put the staff screens on first: STAFFON (5.5b) on the test name, or 5.7 on dezbatere.ro.

`the Report button's AI check line` is 1 when the AI check behind the public Report button is set up, and 0 when it is
not (5.1b says why it matters).

**Why now.** A staff key belongs to one site name. The one you enrolled works only on the test name. After the rename
nobody's staff key works until the staff screens are on under dezbatere.ro and the key is enrolled again there (5.7:
about half an hour, and it needs you at the server and at the browser). **This is your last chance for
staff work (Hide now, reports, publication reviews) until then.**

Do this **before DR2** of the upload, while the old release still runs on the test name:
1. Sign in. Open the home page's **Public** tab. Read every published debate.
2. If one should not be public: tell the team first (each hide e-mails the debate's author). Then Admin → Team →
   public review → **Hide now**. Each hide needs the staff hardware key, and the staff key you have now works only on the test name.
3. If the Team page shows open reports, settle them now too. Publication reviews (**Publication reviews**, Cereri de
   publicare) and threat reports (**Threat reports**, Rapoarte despre amenințări) open from the links on the Team page
   once your key is verified. Settling usually needs the team tools unlocked: if the page says
   `Team tools are locked…` (in step 2 or 3), run `systemctl start debateai-preview-team-unlock` as root. It unlocks
   them for one hour.
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
  them (section 14).
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

---

## 2. The upload, with every lock closed

Upload with the release guide's "Drained upload on the template layout": SB1 to SB4, then DR1 to DR6, then SB13b. Do
not restate or change the recipe. Every lock stays closed during it: add no `PREVIEW_ASKS_OPEN_TO`, no
`PREVIEW_LIVE_PAYMENTS` and no other `PUBLIC_APP_URL` to any env file, leave `mail-plan.json` as the v1 file, install
no new drop-in, and keep the site password on. Never add a new setting to the old release's own files: a release older
than this code refuses a key it does not know, and a way back starts it from its own files.

What this release adds to that recipe:
- **MAILPLAN once more, right before DR1.** Run MAILPLAN (1.5) again immediately before DR1, and stop the upload
  unless it prints `MAILPLAN_DONE`. A plan that changed since the day before makes the new API refuse to start at DR6,
  inside the downtime (`PREVIEW_API_STARTUP_REFUSED PREVIEW_MAIL_…`). The release guide's own steps do not check this.
- **Your numbers (1.7), at SB3.** SB3 publishes a number from `hosted-billing-v1.json` only where you name it in
  `NEWNUM` (and a plan whose limits change, up or down, in `LIMITS`), and stops when the file differs anywhere you did not name.
  SITEINPUTS (1.7) shows the same before SB3, one line per input. For an upload that changes no number, leave both
  lists empty. Two rules for this upload: change no plan price in it (1.7, the trap with upgrades), and when `NEWNUM`
  is not empty, your yes before DR2 names the inputs in it, and for each plan in `LIMITS`: when its limit goes lower or
  is said to have changed, either that nobody holds it or the date its people were told; when its limit goes higher,
  that you checked the number twice.
- **The payment marks, if you want them before real payments** (1.1): PM1, then SB5b, MT1, PM2 and MT2 between DR1
  and DR2, as the release guide says.
- **SB4's operator review.** `LIFECYCLE_FILES` lists the changed operator files. Among them are new files:
  `deploy/preview-auth-dev/v1/public-origins.mjs`, `startup-refusals.mjs`, `start-check-mail.mjs`,
  `start-check-payments.mjs`, this `MAIN-SITE.md`, `deploy/preview-release/v1/site-inputs.mjs` (the comparison of
  your numbers, 1.7) and `deploy/preview-lifecycle/v1/rekey-staff-key.mjs` (the staff key under a new name, 5.7); and
  changed ones: `environment.mjs`, `egress-proxy.mjs`,
  `mail-handoff.mjs`, `launch-api.mjs`, `launch-runner.mjs`, `launch-ui.mjs`, `README.md`,
  `deploy/preview-lifecycle/v1/release-env.mjs`, `unlock-team-tools.mjs`, `jit-creator-actor.mjs` and that folder's
  `README.md`, `deploy/preview-release/v1/release-artifacts.mjs` and its `README.md`.
  Review them, then run SB4 again with `LIFE=yes`. On the drained path, DR5 runs SB10's operator folder swap by hand
  first, as the release guide says.
- **The new SAME lines.** DR1's `same` still runs the old tools, so it prints no new line. After DR5's folder swap,
  `lc release-env.mjs same --labels "$LABEL" --slots "$SLOT"` also prints `OK SAME_UI_API_PUBLIC_APP_URL:<LABEL>`,
  `OK SAME_API_RUNNER_PREVIEW_ASKS_OPEN_TO:<LABEL>` and `OK VALID_PREVIEW_ASKS_OPEN_TO:<LABEL>`. With two labels it
  also prints `OK SAME_PUBLIC_APP_URL`, `OK SAME_API_PAYMENT_SYSTEM` and `OK SAME_PREVIEW_ASKS_OPEN_TO`.
- **The mail plan check at start.** At DR6 the new API reads `mail-plan.json` before anything else of the API runs. Its
  journal shows `PREVIEW_MAIL_MODE {"mode":"legacy","origin":"https://v3-preview.dezbatere.ro"}` before
  `PREVIEW_API_STARTED`. If DR6 stops with "the new API did not start", read why before anything else. Paste this
  one line, with rNN filled in (it reads the upload's names file, so `$LABEL` is the new release):
  `bash -c '. /root/preview-archive/rNN-names.sh; journalctl -u "debateai-preview-api@$LABEL" -n 80 -o cat --no-pager | grep -E "STARTUP_REFUSED|PREVIEW_MAIL_MODE|api.boot.failed"'`.
  A `PREVIEW_MAIL_…` code means `mail-plan.json` (part 1.5). Stop and ask before you choose the way back.
- **MONTHNUMBERS, after DR6.** To keep each person's month on the numbers it started with, the new API and runner read
  the database's record of release switches through a function this release adds (migration `0185_release_history.sql`).
  SB13b's team debate may be paid from a team grant, which never reads that record, so check it once by hand. The
  check is read-only: it asks the record as the API's login and as the runner's login, and wants the new release as
  its last line.

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
- **The sandbox start counts one more thing.** The API's sandbox start also counts open live payment work. This
  database never took a live payment, so the count is 0 and the API starts as before.

---

## 3. After the upload: your sandbox test, on the test name, behind the password

### 3.0 The locks' names file (once)

Every script from here on reads one file: `/root/preview-archive/main-site/names.sh`. It reads the upload's names file,
checks that its release is the one current release, and defines the names and small helpers the scripts use. All the
copies these steps keep go into `/root/preview-archive/main-site`, so they survive a later upload.

Fill in `rNN` (the upload you just did), then run:

```sh
set -euo pipefail
# LOCKS0: the locks' names file and their folder. Nothing live changes.
NAMES=/root/preview-archive/rNN-names.sh                  # the upload's names file (after a later upload: that one's)
M=/root/preview-archive/main-site
[ -f "$NAMES" ] || { echo "LOCKS0_NOT_DONE: $NAMES is missing (fill in rNN)"; exit 1; }
[ ! -e "$M/names.sh" ] || { echo "LOCKS0_NOT_DONE: $M/names.sh exists (look first)"; exit 1; }
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
HOST=$(sed -n 's|^PUBLIC_APP_URL=https://||p' "$A")
case "$HOST" in v3-preview.dezbatere.ro|dezbatere.ro) ;; *) echo "NAMES_NOT_DONE: $A does not name one of the two names exactly once: look"; exit 1;; esac
KEYS='^(NETOPIA_API_BASE_URL|NETOPIA_POS_SIGNATURE|NETOPIA_API_KEY_PATH|NETOPIA_IPN_KEYS_PATH|QUADERNO_API_BASE_URL|QUADERNO_API_KEY_PATH|SMARTBILL_API_BASE_URL|SMARTBILL_CREDENTIALS_PATH|SMARTBILL_SERIES|OWNER_REPORT_EMAIL_PATH|PREVIEW_LIVE_PAYMENTS)='
inv() { journalctl -o cat --no-pager _SYSTEMD_INVOCATION_ID="$(systemctl show -p InvocationID --value "$1")"; }
said() { [ "$(inv "$API" | grep -c "$@" || true)" -gt 0 ]; }
apiup() { local t i; sleep 1; t=$(date +%s); systemctl reset-failed "$API" 2>/dev/null || true; systemctl restart "$API" || echo 'systemctl restart of the API returned non-zero'
  for i in $(seq 1 80); do [ "$(journalctl -u "$API" --since "@$t" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" -gt 0 ] && break; [ "$(systemctl is-active "$API" || true)" = failed ] && break; sleep 3; done
  journalctl -u "$API" --since "@$t" -o cat --no-pager | grep -E 'PREVIEW_LIFECYCLE_PRESTART_REFUSED|PREVIEW_MAIL_MODE|api\.boot\.failed|api\.preview\.asks_open|PREVIEW_API_STARTED|PREVIEW_API_STARTUP_REFUSED' | cut -c1-300 || true
  [ "$(journalctl -u "$API" --since "@$t" -o cat --no-pager | grep -cE 'PREVIEW_API_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" = 0 ] && [ "$(journalctl -u "$API" --since "@$t" -o cat --no-pager | grep -c '^PREVIEW_API_STARTED ' || true)" -gt 0 ] && [ "$(systemctl is-active "$API" || true)" = active ]; }
webup() { local t i c=000; sleep 1; t=$(date +%s); systemctl reset-failed "$WEB" 2>/dev/null || true; systemctl restart "$WEB" || echo 'systemctl restart of the website returned non-zero'
  for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$UIP/login" || true); [ "$c" = 200 ] && break; [ "$(systemctl is-active "$WEB" || true)" = failed ] && break; sleep 3; done
  journalctl -u "$WEB" --since "@$t" -o cat --no-pager | grep -E 'PREVIEW_LIFECYCLE_PRESTART_REFUSED|PREVIEW_UI_STARTUP_REFUSED' | cut -c1-300 || true
  [ "$c" = 200 ] && [ "$(journalctl -u "$WEB" --since "@$t" -o cat --no-pager | grep -cE 'PREVIEW_UI_STARTUP_REFUSED|PREVIEW_LIFECYCLE_PRESTART_REFUSED' || true)" = 0 ] && [ "$(systemctl is-active "$WEB" || true)" = active ]; }
relay() { local p; p=$(systemctl show -p MainPID --value debateai-preview-turnstile); [ "${p:-0}" != 0 ] && tr '\0' '\n' < "/proc/$p/environ" | grep '^PUBLIC_APP_URL=' || true; }
loc() { curl -sI "$1" | tr -d '\r' | tr 'A-Z' 'a-z' | grep '^location:' || true; }
notify() { curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' "https://$1/api/v1/billing/netopia/notify" || true; }
hsts() { curl -s -o /dev/null -D - -X POST -H 'Content-Type: application/json' --data '{}' "https://$1/api/v1/billing/netopia/notify" | tr -d '\r' | tr 'A-Z' 'a-z' | grep '^strict-transport-security:' || true; }
order() { cad adapt --config "$1" --adapter caddyfile 2>/dev/null | jq -r --arg h "$2" '[.apps.http.servers[].routes[] | select(.match[0].host[0]==$h) | .handle[] | .. | objects | select(has("handler")) | .handler] | join(" > ")'; }
nblock() { awk -v site="$2 {" '{t=$0; sub(/^[ \t]+/,"",t)} !s&&$0==site{s=1;next} s&&!p&&t=="@netopia_notify {"{p=1} p{print t; d+=gsub(/\{/,"{",t)-gsub(/\}/,"}",t); if(t=="handle @netopia_notify {")h=1; if(h&&d==0)exit}' "$1"; }
gates() { printf 'deepinfra '; gs "$GD" "$PD" | jq -c '{state, window_open, today_spend_usd, remaining_today_usd}'; printf 'anthropic '; gs "$GAN" "$PAN" | jq -c '{state, window_open, today_spend_usd, remaining_today_usd}'; printf 'perplexity '; gs "$GPX" "$PPX" | jq -c '{state, window_open, today_spend_usd, remaining_today_usd}'; }
gatesok() { [ "$(gs "$GD" "$PD" | jq -r '"\(.state) \(.window_open)"')" = 'active true' ] && [ "$(gs "$GAN" "$PAN" | jq -r '"\(.state) \(.window_open)"')" = 'active true' ] && [ "$(gs "$GPX" "$PPX" | jq -r '"\(.state) \(.window_open)"')" = 'active true' ]; }
RUNAPI() { systemd-run --quiet --pipe --wait --collect --uid="$AU" --gid="$AGRP" --property=EnvironmentFile="$A" --setenv=NODE_USE_ENV_PROXY=1 --setenv=HTTPS_PROXY=http://127.0.0.1:3180 "--setenv=NO_PROXY=localhost,127.0.0.1,[::1],$HOST" --working-directory="$CAPI/dialectical-engine" "$N" --import tsx "$@"; }
modecheck() { ( cd "$CAPI/dialectical-engine" && "$N" --input-type=module -e "const m=await import('./deploy/preview-auth-dev/v1/start-check-payments.mjs'); const r=await import('./deploy/preview-auth-dev/v1/startup-refusals.mjs'); await m.assertEgressIsLive({quadernoHost:process.argv[1]+'.quadernoapp.com'}).then(()=>console.log('egress: live'),e=>console.log('egress:',r.namedRefusal(e)??'refused'))" "$1" ); }
put_secret() { runuser -u "$AU" -- /bin/sh -c 'umask 077; f=$1; [ ! -e "$f" ] || { echo "$f exists: stop" >&2; exit 1; }; IFS= read -r v && [ -n "$v" ] && printf "%s\n" "$v" > "$f.new" && mv -n "$f.new" "$f" && echo "saved $f"' sh "$1"; }
swap() { ( set -euo pipefail; umask 077; { grep -vE "$KEYS" "$A"; cat "$1"; } > "$A.new"; chown --reference="$A" "$A.new"; chmod --reference="$A" "$A.new"; mv "$A.new" "$A"; [ -z "$(grep -oE '^[A-Z_][A-Z0-9_]*=' "$A" | sort | uniq -d)" ] && echo swapped ); }
livedrop() { install -d -o root -g root -m 0755 /etc/systemd/system/debateai-preview-egress.service.d; printf '[Service]\nExecStart=\nExecStart=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node %s/egress-proxy.mjs --quaderno-live-account %s\n' "$EG" "$1" > "$EDROP"; chmod 0644 "$EDROP"; systemctl daemon-reload; systemctl restart "$EGU" || echo 'systemctl restart of the egress proxy returned non-zero'; sleep 2; }
sandboxdrop() { rm -f "$EDROP"; systemctl daemon-reload; systemctl restart "$EGU" || echo 'systemctl restart of the egress proxy returned non-zero'; sleep 2; }
EOF
} > "$M/names.sh"
chmod 0600 "$M/names.sh"
. "$M/names.sh"
echo "release $LABEL (key $KEY, slot $SLOT); the API answers as $HOST"
echo LOCKS0_DONE
exit 0
```

Expect the release line, then `LOCKS0_DONE`. **After a later upload**, edit only the first line of
`/root/preview-archive/main-site/names.sh` to name that upload's names file (`nano` that file; do not run LOCKS0
again: it refuses while the file exists). If any later script says `NAMES_NOT_DONE`, that first line is the usual
cause.

What the helpers do, in short:
- `apiup` restarts the API and waits for its start line (or its refusal); `webup` does the same for the website.
  Each first clears systemd's count of recent starts: systemd refuses a fifth start of the API or the website within
  15 minutes, and a way back must never be refused for that.
- `inv` shows a service's journal since its last start; `said` asks whether the API's journal since its last start
  holds a line.
- `gates` shows the three spending gates; `gatesok` says whether all three are active with their window open.
- `RUNAPI` runs one of the API's billing tools as the API's user, with the API's settings.
- `modecheck` asks the egress proxy which form it runs in; `swap` replaces the payment lines of the API file;
  `livedrop` and `sandboxdrop` put the egress proxy in its live or its sandbox form.

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
said -xF 'PREVIEW_MAIL_MODE {"mode":"legacy","origin":"https://v3-preview.dezbatere.ro"}' || flag 'mail: the running API does not say mode legacy'
[ "$(jq -r .schema "$MP")" = preview-auth-dev-mail-v1 ] || flag 'mail: mail-plan.json is not the v1 file'
[ "$(grep -c '^PREVIEW_LIVE_PAYMENTS=' "$A" || true)" = 0 ] && grep -qxE 'NETOPIA_API_BASE_URL=https://secure(-sandbox|\.sandbox)\.netopia-payments\.com' "$A" && [ ! -e "$EDROP" ] || flag 'payments: not the sandbox'
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")" = 401 ] || flag 'the site password: the site does not answer 401'
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" > "$M/same-closed.txt" || flag 'a SAME check is BAD (look at the file named below)'
grep -qx "OK SAME_UI_API_PUBLIC_APP_URL:$LABEL" "$M/same-closed.txt" && grep -qx "OK VALID_PREVIEW_ASKS_OPEN_TO:$LABEL" "$M/same-closed.txt" || flag 'the tools folder does not carry the new SAME checks (DR5 folder swap)'
[ -z "$OPEN" ] || { echo "CLOSED_NOT_DONE: a lock is not closed (above; SAME output: $M/same-closed.txt): ask"; exit 1; }
echo CLOSED_DONE
exit 0
```

Expect `CLOSED_DONE`. Run it again whenever you want to know that everything is closed.

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
RUNAPI apps/api/src/billing/withdraw-cli.ts --owner "$OR" || { echo "WITHDRAWOTHER_NOT_DONE: the tool refused (its code is the line above). WITHDRAWAL_DEBATE_RUNNING: their debate is still running, run this again when it ends. Any other code: ask"; exit 1; }
echo WITHDRAWOTHER_DONE
exit 0
```

Then settle its refund as above. After 14 days only they can cancel.

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
[ -s "$M/mail/mail-plan.v1.json" ] && cmp -s "$MP" "$M/mail/mail-plan.v1.json" || { echo "MAIL_ALLOW_NOT_DONE: the live plan is not the kept v1 file (MAIL_KEEP first)"; exit 1; }
CG=$(jq -r .recipientPolicy.clientGid "$MP")
[ "$(stat -c '%U %g %a %h' "$MR")" = "root $CG 640 1" ] && [ "$(stat -c %s "$MR")" -le 1024 ] || { echo "MAIL_ALLOW_NOT_DONE: $MR is not root:<clientGid> 0640 with one link and at most 1 KiB"; exit 1; }
( umask 022; jq -c --arg o "https://$HOST" '.schema="preview-auth-dev-mail-v2" | .recipients="allow-list" | .publicAppUrl=$o' "$M/mail/mail-plan.v1.json" > "$M/mail/mail-plan.v2-allow-list.json" )
{ install -o root -g root -m 0644 "$M/mail/mail-plan.v2-allow-list.json" "$MP.new" && mv -f "$MP.new" "$MP" && cmp -s "$M/mail/mail-plan.v2-allow-list.json" "$MP"; } || { echo "MAIL_ALLOW_NOT_DONE: the allow-list plan was not put in place (nothing restarted): ask"; exit 1; }
if ! apiup; then { install -o root -g root -m 0644 "$M/mail/mail-plan.v1.json" "$MP.new" && mv -f "$MP.new" "$MP"; } || { echo "MAIL_ALLOW_NOT_DONE: the API refused the allow-list plan, and the v1 file could not be put back: ask at once"; exit 1; }; apiup || { echo "MAIL_ALLOW_NOT_DONE: the API refused the allow-list plan; the v1 file is back, but the API did not start on it either: the site is DOWN: ask at once"; exit 1; }; echo "MAIL_ALLOW_NOT_DONE: the API refused the allow-list plan (code above); the v1 file is back and the API restarted on it"; exit 1; fi
said -xF "PREVIEW_MAIL_MODE {\"mode\":\"allow-list\",\"origin\":\"https://$HOST\"}" || { echo "MAIL_ALLOW_NOT_DONE: no allow-list mode line: ask"; exit 1; }
echo MAIL_ALLOW_DONE
exit 0
```

The API restarts: pages that need the API fail for a minute or more (`apiup` waits up to about 4 minutes). The same
holds for every step that restarts the API. Expect the line `PREVIEW_MAIL_MODE {"mode":"allow-list",…}`, then
`MAIL_ALLOW_DONE`.

Test it with your own allow-listed account:
1. Ask for a password reset (the reset family).
2. Change a security setting, or enrol the hardware key again (a security notice, the account family).

Both mails must arrive. If one does not, the journal shows `AUTH_MAIL_DELIVERY_FAILED … code=SENDMAIL_EXIT_1`: run
MAIL_CLOSE (4.4) and ask.

### 4.3 Open mail

Before this step, run the failure count of 1.4 again. Account mail that the API still retries may go out at once, to
real addresses, when mail opens.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# MAIL_OPEN: mail plan v2 "open": each mail to its own address.
! said '^PREVIEW_MAIL_MODE {"mode":"open",' || { echo "MAIL_OPEN_NOT_DONE: mail is open already (MAIL_OPEN ran before): nothing to do"; exit 1; }
said '^PREVIEW_MAIL_MODE {"mode":"allow-list",' || { echo "MAIL_OPEN_NOT_DONE: the running API is not in mode allow-list (MAIL_ALLOW first)"; exit 1; }
cp -p "$MP" "$M/mail/mail-plan.before-open.json"
( umask 022; jq -c --arg o "https://$HOST" '.schema="preview-auth-dev-mail-v2" | .recipients="open" | del(.recipientPolicy) | .publicAppUrl=$o' "$M/mail/mail-plan.v1.json" > "$M/mail/mail-plan.v2-open.json" )
{ install -o root -g root -m 0644 "$M/mail/mail-plan.v2-open.json" "$MP.new" && mv -f "$MP.new" "$MP" && cmp -s "$M/mail/mail-plan.v2-open.json" "$MP"; } || { echo "MAIL_OPEN_NOT_DONE: the open plan was not put in place (nothing restarted): ask"; exit 1; }
if ! apiup; then { install -o root -g root -m 0644 "$M/mail/mail-plan.before-open.json" "$MP.new" && mv -f "$MP.new" "$MP"; } || { echo "MAIL_OPEN_NOT_DONE: the API refused the open plan, and the allow-list file could not be put back: ask at once"; exit 1; }; apiup || { echo "MAIL_OPEN_NOT_DONE: the API refused the open plan; the allow-list file is back, but the API did not start on it either: the site is DOWN: ask at once"; exit 1; }; echo "MAIL_OPEN_NOT_DONE: the API refused the open plan (code above); the allow-list file is back and the API restarted on it"; exit 1; fi
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
5. Then start the deletion of both test accounts in Settings (it runs 7 days later).

If either test fails: run MAIL_CLOSE (4.4). Take the site password off only after both pass.

### 4.4 Closing mail again (no upload needed)

On the test name this puts the kept v1 file back. On the main name (v1 is refused there) it puts the v2 allow-list
plan for the main name.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# MAIL_CLOSE: mail back to the allow-listed addresses.
! grep -qx 'PREVIEW_LIVE_PAYMENTS=real-money' "$A" || [ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")" = 401 ] || { echo "MAIL_CLOSE_NOT_DONE: payments are live and the site is open: PWON first"; exit 1; }
[ -s "$M/mail/mail-plan.v1.json" ] || { echo "MAIL_CLOSE_NOT_DONE: no kept v1 file: ask"; exit 1; }
cp -p "$MP" "$M/mail/mail-plan.before-close.json"
if [ "$HOST" = v3-preview.dezbatere.ro ]; then W=$M/mail/mail-plan.v1.json; WANT='PREVIEW_MAIL_MODE {"mode":"legacy","origin":"https://v3-preview.dezbatere.ro"}'
else ( umask 022; jq -c --arg o "https://$HOST" '.schema="preview-auth-dev-mail-v2" | .recipients="allow-list" | .publicAppUrl=$o' "$M/mail/mail-plan.v1.json" > "$M/mail/mail-plan.v2-allow-list-main.json" ); W=$M/mail/mail-plan.v2-allow-list-main.json; WANT="PREVIEW_MAIL_MODE {\"mode\":\"allow-list\",\"origin\":\"https://$HOST\"}"; fi
{ install -o root -g root -m 0644 "$W" "$MP.new" && mv -f "$MP.new" "$MP" && cmp -s "$W" "$MP"; } || { echo "MAIL_CLOSE_NOT_DONE: the closed plan was not put in place (nothing restarted): ask"; exit 1; }
if ! apiup; then { install -o root -g root -m 0644 "$M/mail/mail-plan.before-close.json" "$MP.new" && mv -f "$MP.new" "$MP"; } || { echo "MAIL_CLOSE_NOT_DONE: the API refused the closed plan, and the plan before could not be put back: ask at once"; exit 1; }; apiup || { echo "MAIL_CLOSE_NOT_DONE: the API refused the closed plan; the plan before is back, but the API did not start on it either: the site is DOWN: ask at once"; exit 1; }; echo "MAIL_CLOSE_NOT_DONE: the API refused the closed plan (code above); the plan before is back: ask"; exit 1; fi
said -xF "$WANT" || { echo "MAIL_CLOSE_NOT_DONE: the mode line is not the closed one: ask"; exit 1; }
echo MAIL_CLOSE_DONE
exit 0
```

The mail program reads the plan at every mail, so closing applies from the very next mail. While payments are real,
MAIL_CLOSE runs only with the site password on (PWON first): a buyer outside the allow-list would get no M1 and no M2.

---

## 5. The main name (dezbatere.ro)

Before you start: the upload is finished and proven (DR6 and SB13b done, the old release retired), PM2 has run if this
upload added the payment marks, **mail is on the v2 plan** (part 4.2 or 4.3), and social sign-in is not set up
(NAME2 stops if the API file has `SOCIAL_SOCKET_PATH`: its relay's callbacks name the test name). If you did not do
1.3 (b) to (e), do them now.

**The staff screens and the rename.** If STAFFCHECK (1.6) said `staff tools are on`:
- **Run REKEYCHECK (5.7) now, while the site still answers as the test name.** It only reads. It says whether this
  server can enrol a staff key again after the rename. If it says `NOT READY`, ask before you rename: after a rename
  with STAFFOFF, nothing else looks at this until REKEY, when your staff key already does not work.
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
grep -qx "OK SAME_UI_API_PUBLIC_APP_URL:$LABEL" "$M/name/same-before-main.txt" || { echo "NAME1_NOT_DONE: the tools folder does not carry the name checks (the upload's DR5 folder swap first)"; exit 1; }
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
if ! apiup; then { cp -p "$K" "$A.new" && mv "$A.new" "$A"; } || { echo "STAFFOFF_NOT_DONE: the API did not start without the line, and the file before could not be put back (it is $K): the site is DOWN: ask at once"; exit 1; }; apiup || { echo "STAFFOFF_NOT_DONE: the API did not start without the line; the file before is back, but the API did not start on it either: the site is DOWN: ask at once"; exit 1; }; echo "STAFFOFF_NOT_DONE: the API did not start without the line (code above); the file before is back and the API restarted on it, with the staff screens on: ask"; exit 1; fi
echo STAFFOFF_DONE
exit 0
```

Expect the `taken out` line, the API's start lines (`PREVIEW_API_STARTED …`), then `STAFFOFF_DONE`.
- It restarts the API on the test name, behind the password (a minute or more down). From then on the staff screens
  are off. NAME3 later moves the name and the API file's two staff name lines; the policy line stays out.
- It changes nothing in the database: the staff records, the staff keys, the Owner role and the audit history stay.
- If it says `the staff screens are off already`, nothing changed: go on with NAME2.
- If it stops on `team allowance lines`, run nothing more and ask.
- If it stops with `the file before is back and the API restarted on it`, the staff screens are still on and nothing
  else changed. Run nothing more and ask.
- If NAME2 then stops for another reason and you will not rename today, run STAFFON (5.5b). It puts the staff screens
  back on the test name.
- The way back is STAFFON (5.5b) on the test name, and STAFFMAIN (5.7) on dezbatere.ro.

**While the staff screens are off**, nobody can:
- hide a published debate by hand (Hide now);
- settle a report the AI check did not accept, or decide a publication review or a threat report;
- invite, grant or disable a staff member, or change the team limit (Admin → Team);
- read the staff audit page.

These wait in the database; nothing is lost. This holds on both names, during the friends' test (part 6) and while
payments are real (part 7). The site password keeps it small: only people who know it can see a published debate.

**What still happens by itself:**
- **Free debates go public.** On the Free plan, a finished debate goes public by itself when an AI check allows it.
  The page tells the person this before they ask. With STAFFCHECK's `the Report button's AI check line: 0`, that check is not
  set up, so nothing goes public: each finished Free debate waits.
- **The Report button.** It needs no staff. If the same AI check agrees with a report, the debate hides at once (once
  per debate). With the line at 0, or when the check does not agree, the report waits for a person, and nobody can act
  on it until the staff screens come back.
- **Staff mails.** You still get the mails that say a report or a threat report waits, or that a debate was hidden
  by itself. You cannot open them in the app until the staff screens come back. That is expected.

**Never open the site to everyone (part 8) while the staff screens are off, or while no staff key works under
dezbatere.ro.** PWOFF1 (8.2) refuses in both cases.

### 5.2 Prepare the switch (nothing live changes)

This makes four things in `/root/preview-archive/main-site/name`: the two env files for the main name, the Turnstile
relay's drop-in, the main Caddyfile and the main mail plan.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# NAME2: the switch prepared: env copies, the relay drop-in, the main Caddyfile, the main mail plan. Nothing live changes.
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
cmp -s "$C" "$M/name/Caddyfile.phase1" || { echo "NAME3_NOT_DONE: the live Caddyfile is not the prepared one (nothing was stopped): look"; exit 1; }
[ ! -e "$TDROP" ] || { echo "NAME3_NOT_DONE: $TDROP exists (nothing was stopped): look"; exit 1; }
SN=$(grep -cE '^STAFF_WEBAUTHN_(ORIGIN|RP_ID)=' "$A" || true)
for SVC in api ui; do W=2; [ "$SVC" != api ] || W=$((2 + 2 * SN)); [ "$(diff "$E/$SVC-$LABEL.env" "$M/name/$SVC-$LABEL.env.main" | grep -c '^[<>]' || true)" = "$W" ] || { echo "NAME3_NOT_DONE: $SVC-$LABEL.env changed since NAME2 (nothing was stopped): run NAME2 again"; exit 1; }; done
cmp -s "$MP" "$M/name/mail-plan.before-main.json" || { echo "NAME3_NOT_DONE: mail-plan.json changed since NAME2 (nothing was stopped): run NAME2 again"; exit 1; }
MMODE=$(jq -r .recipients "$M/name/mail-plan.before-main.json" 2>/dev/null || true)
case "$MMODE" in allow-list|open) ;; *) echo "NAME3_NOT_DONE: the kept mail plan has no v2 mode (nothing was stopped): run NAME2 again"; exit 1;; esac
systemctl stop "$WEB" "$API" || { echo "NAME3_NOT_DONE: systemctl stop of the website and API failed: run NAME5 now"; exit 1; }
for SVC in api ui; do F=$E/$SVC-$LABEL.env; { cp "$M/name/$SVC-$LABEL.env.main" "$F.new" && chown --reference="$F" "$F.new" && chmod --reference="$F" "$F.new" && mv "$F.new" "$F"; } || { echo "NAME3_NOT_DONE: $SVC-$LABEL.env was not replaced: the site is DOWN: run NAME5 now"; exit 1; }; done
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" || { echo "NAME3_NOT_DONE: a SAME check is BAD (above): the site is DOWN: run NAME5 now"; exit 1; }
{ install -d -o root -g root -m 0755 "$(dirname "$TDROP")" && install -o root -g root -m 0644 "$M/name/20-public-origin.conf" "$TDROP"; } || { echo "NAME3_NOT_DONE: the relay's drop-in was not put in place: the site is DOWN: run NAME5 now"; exit 1; }
systemctl daemon-reload || true; systemctl restart debateai-preview-turnstile || echo 'systemctl restart of the relay returned non-zero'; sleep 2
[ "$(relay)" = 'PUBLIC_APP_URL=https://dezbatere.ro' ] || { echo "NAME3_NOT_DONE: the running relay does not answer as dezbatere.ro: the site is DOWN: run NAME5 now"; exit 1; }
{ install -o root -g root -m 0644 "$M/name/Caddyfile.main" "$C.new" && mv "$C.new" "$C" && cmp -s "$M/name/Caddyfile.main" "$C"; } || { echo "NAME3_NOT_DONE: the main Caddyfile was not put in place: the site is DOWN: run NAME5 now"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3; [ "$(systemctl is-active caddy || true)" = active ] || { echo "NAME3_NOT_DONE: Caddy did not come back: the site is DOWN: run NAME5 now"; exit 1; }
{ install -o root -g root -m 0644 "$M/name/mail-plan.main.json" "$MP.new" && mv -f "$MP.new" "$MP" && cmp -s "$M/name/mail-plan.main.json" "$MP"; } || { echo "NAME3_NOT_DONE: the main mail plan was not put in place: the site is DOWN: run NAME5 now"; exit 1; }
apiup || { echo "NAME3_NOT_DONE: the API did not start (the line above names the setting): the site is DOWN: run NAME5 now"; exit 1; }
webup || { echo "NAME3_NOT_DONE: the website did not start (the line above names the setting): the site is DOWN: run NAME5 now"; exit 1; }
said -xF "PREVIEW_MAIL_MODE {\"mode\":\"$MMODE\",\"origin\":\"https://dezbatere.ro\"}" || { echo "NAME3_NOT_DONE: the API's mail line is not mode $MMODE on dezbatere.ro: run NAME5 now"; exit 1; }
echo NAME3_DONE
exit 0
```

Expect the SAME list (all `OK`, with `OK SAME_UI_API_PUBLIC_APP_URL:<LABEL>`), the API's lines (`PREVIEW_MAIL_MODE
{…"origin":"https://dezbatere.ro"}` with the same mode as before, `PREVIEW_API_STARTED …`), then `NAME3_DONE`. The
runner reads no public name and is not restarted.

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
[ "$(curl -s -o /dev/null -w '%{http_code}' https://dezbatere.ro/)" = 401 ] || chk 'dezbatere.ro does not ask for the site password'
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
   5.7 now, or later the same day: it enrols your staff key again under dezbatere.ro. Until then Admin → Team cannot
   verify you: **Verify security key for team access** (Verifică cheia de securitate pentru accesul echipei) ends
   with "The action could not be completed…" (Acțiunea nu a putut fi finalizată…), or is greyed out if the staff
   screens are off. That is expected. Your ordinary passkey (step 4) is separate, and it works. Part 8 waits for
   5.7: once the site is open to everyone, Hide now is the only way you can take a published debate down yourself.
6. Open `/sign-up` and see the Turnstile check pass.
7. Start one team question and check it is not cut at 55 seconds.

### 5.5 The way back (close the name; it stays prepared)

A few minutes down, like the switch (the API's start alone takes a minute or more). It works from any state NAME3
left. It starts nothing until both env files name the test name and every SAME check is OK. It refuses, with nothing
stopped, while the site is open to everyone (PWON first) or while payments are real (PAY_BACK first): part 9's order.
Once it has stopped the website and the API, every `NAME5_NOT_DONE` up to the API's start means the site is down: ask
at once.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# NAME5: the site answers as the test name again; dezbatere.ro stays prepared (redirect and notice pass-through).
[ -s "$M/name/Caddyfile.phase1" ] && [ -s "$M/name/notify-code.before-dezbatere" ] || { echo "NAME5_NOT_DONE: a kept file is missing; nothing was stopped: ask"; exit 1; }
! cmp -s "$C" "$M/password/Caddyfile.open" || { echo "NAME5_NOT_DONE: the site is open to everyone: PWON first (part 9 order); nothing was stopped"; exit 1; }
! grep -qx 'PREVIEW_LIVE_PAYMENTS=real-money' "$A" || { echo "NAME5_NOT_DONE: payments are real on this name: PAY_BACK first (part 9 order); nothing was stopped"; exit 1; }
MMODE=$(jq -r 'if .schema == "preview-auth-dev-mail-v1" then "legacy" else .recipients end' "$MP" 2>/dev/null || true)
case "$MMODE" in legacy|allow-list|open) ;; *) echo "NAME5_NOT_DONE: mail-plan.json does not read as a mail plan; nothing was stopped: ask"; exit 1;; esac
SOK=no; [ "$(grep -cE '^STAFF_WEBAUTHN_(ORIGIN|RP_ID)=' "$A" || true)" = 2 ] && [ "$(grep -cxE 'STAFF_WEBAUTHN_ORIGIN=https://(v3-preview\.)?dezbatere\.ro' "$A" || true)" = 1 ] && [ "$(grep -cxE 'STAFF_WEBAUTHN_RP_ID=(v3-preview\.)?dezbatere\.ro' "$A" || true)" = 1 ] && SOK=yes
[ "$SOK" = yes ] || ! grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" || { echo "NAME5_NOT_DONE: the staff screens are on, but the API file's two staff name lines do not each name one of the two names exactly once; nothing was stopped: ask"; exit 1; }
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
apiup || { echo "NAME5_NOT_DONE: the API did not start (the line above names the setting): the site is DOWN: ask at once"; exit 1; }
webup || { echo "NAME5_NOT_DONE: the website did not start (the line above names the setting): the site is DOWN: ask at once"; exit 1; }
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
(5.5b) puts them on. To un-prepare the name later, run NAME1_BACK, then remove the DNS records and the Turnstile
hostname.

### 5.5b The staff screens back on the test name (STAFFON)

Run it only while the site answers as the test name: before NAME3, or after NAME5 (which waits for PAY_BACK while
payments are real). It puts the line `STAFF_ACCESS_POLICY_VERSION=2` back and restarts the API (a minute or more
down). If the API refuses, the file before comes back and the API restarts on it. It works on this release and on any
later one, as long as STAFFOFF once took the line out on this server.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# STAFFON: the staff screens back on the test name: the line STAFF_ACCESS_POLICY_VERSION=2 back into the API file, then the API restarts.
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
if ! apiup; then { cp -p "$K" "$A.new" && mv "$A.new" "$A"; } || { echo "STAFFON_NOT_DONE: the API refused the staff screens, and the file before could not be put back (it is $K): the site is DOWN: ask at once"; exit 1; }; apiup || { echo "STAFFON_NOT_DONE: the API refused the staff screens; the file before is back, but the API did not start on it either: the site is DOWN: ask at once"; exit 1; }; echo "STAFFON_NOT_DONE: the API refused the staff screens (code above); the file before is back and the API restarted on it: ask"; exit 1; fi
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
- Run PM2 (the payment marks) before NAME1 (1.1). From NAME1 on, change nothing in the Caddyfile by hand: NAME2 and
  NAME1_BACK refuse a changed file, and NAME5 puts back the copy NAME1 made. Only the steps of this document change it
  (NAME3, PWOFF2, PWON, SIGNUPS). Ask first.
- If you watch a later upload's switch from the Mac (the release guide's SB13 watcher), write `machine dezbatere.ro`
  in `~/.config/debateai-preview.netrc` and `https://dezbatere.ro/login` in the watch line.
- While payments are real, 7.12 adds two rules to every later upload. Once real payments were ever on, its LIVEAFTER
  rule holds before any rbD-B.

### 5.7 The staff screens on dezbatere.ro, and your staff key there

Do this once the site answers as dezbatere.ro (NAME4 done), behind the site password, on the release that carries
this document. It takes about half an hour. You need the server (as root), a browser, your password, your
authenticator and your hardware key. It works while payments are real; STAFFMAIN restarts the API, so pick a quiet
minute with no checkout open.

In that upload, SB4's operator review (part 2) lists this step's files among the others: the new
`deploy/preview-lifecycle/v1/rekey-staff-key.mjs`, and the changed `unlock-team-tools.mjs`, `jit-creator-actor.mjs`
and that folder's `README.md`. STAFFMAIN and REKEY need the upload's operator folder swap and its database step to
have run; each checks that first, and REKEYCHECK (below) says so before the day.

**What happens, in plain words.**
- A staff key belongs to one site name. The one you enrolled belongs to the test name, so on dezbatere.ro the Team
  page cannot verify you.
- The site never lets an account that is already staff add a staff key with password and code alone. Otherwise a
  thief with your password and your phone could add a key of their own and act as the Owner.
- So the server's operator (you, as root) first says yes for one person and one key. That yes is a **permit**. It
  lasts 15 minutes and works once. It is tied to one sign-in: the one whose **sign-in code** you read in your own
  browser and type on the server. Example: your browser shows `Sign-in code: 3f9a1c2e`; you type `3f9a1c2e` when
  REKEY asks; REKEY says the permit is for the sign-in that began at 10:02 and ends at 10:20. Any other sign-in to
  your account, even one made with the right password and code, has another code and cannot use the permit.
- With the permit you add the key on the Team page. The site writes the key change in the staff audit history and
  sends its key-change alert to the security alert address set on this server.

**Before the day: is the server ready?** REKEYCHECK only reads. Run it any time after the upload:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# REKEYCHECK: whether this server can do 5.7 (read-only): the release, the tools folder, the database step, and the database's own rule for the login REKEY uses.
BAD=''; chk() { echo "NOT READY: $1"; BAD=yes; }
[ -f "$CAPI/dialectical-engine/migrations/0184_staff_rekey_permit.sql" ] || chk 'this release does not carry the staff re-key (the upload first)'
[ -f "$L/rekey-staff-key.mjs" ] || chk "the tools folder does not carry rekey-staff-key.mjs (the upload's tools-folder swap first)"
[ "$(psqlq "SELECT count(*) FROM pg_proc WHERE oid = to_regprocedure('staff.arm_rekey(uuid,text,text,text)')" || true)" = 1 ] || chk "the database does not hold the staff re-key step (the upload's database step first)"
HB=$(psqlq "SELECT COALESCE((SELECT auth_method FROM pg_hba_file_rules WHERE error IS NULL AND type = 'local' AND database && ARRAY['all', 'debateai'] AND user_name && ARRAY['all', 'debateai_prod_staff_recovery'] ORDER BY rule_number LIMIT 1), 'none')" || true)
[ "$HB" = scram-sha-256 ] || chk "the database's pg_hba.conf does not admit debateai_prod_staff_recovery on the local socket with scram-sha-256 (the first rule that matches it says: ${HB:-unreadable}): ask"
echo "the API answers as $HOST; policy line: $(grep -x 'STAFF_ACCESS_POLICY_VERSION=.*' "$A" || echo none); staff name lines: $(grep -E '^STAFF_WEBAUTHN_(ORIGIN|RP_ID)=' "$A" | tr '\n' ' ' || true)"
[ -z "$BAD" ] || { echo "REKEYCHECK_NOT_DONE: a line above says NOT READY"; exit 1; }
echo REKEYCHECK_DONE
exit 0
```

Expect the line about the API file, then `REKEYCHECK_DONE`. If it says the database's `pg_hba.conf` does not admit
the login: ask, before the day. REKEY connects to the database as the staff recovery login, on the database's local
socket, with a password that exists for three minutes; the database lets that login in only if its `pg_hba.conf`
holds the line `local debateai debateai_prod_staff_recovery scram-sha-256` (it is in
`deploy/postgres/pg_hba.conf.template`) above any broader `local` line. Adding it means a copy of the file, the one
line, a check of `pg_hba_file_rules` for errors and a reload; step 7 of `deploy/preview-lifecycle/v1/README.md` shows
that kind of change. Do not edit that file alone.

**1. The staff screens on (skip if they are on already).** If the rename was done with the staff screens on, they are
on already and STAFFMAIN says so. If it was done after STAFFOFF, STAFFMAIN puts the line
`STAFF_ACCESS_POLICY_VERSION=2` back. The two staff name lines already name dezbatere.ro when this document's NAME2
did the rename; when an earlier version of this document did it, they still name the test name, and STAFFMAIN moves
them first.

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# STAFFMAIN: the staff screens on, on dezbatere.ro: the API file's two staff name lines name dezbatere.ro and the line STAFF_ACCESS_POLICY_VERSION=2 is in it (a copy kept), then the API restarts (a minute or more down). If the API refuses, the file before comes back.
K=$M/name/api-$LABEL.env.before-staffmain-$(date -u +%Y%m%dT%H%M%SZ)
[ "$HOST" = dezbatere.ro ] || { echo "STAFFMAIN_NOT_DONE: the API answers as $HOST; on the test name the step is STAFFON (5.5b); nothing changed"; exit 1; }
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
if ! apiup; then { cp -p "$K" "$A.new" && mv "$A.new" "$A"; } || { echo "STAFFMAIN_NOT_DONE: the API refused the staff screens, and the file before could not be put back (it is $K): the site is DOWN: ask at once"; exit 1; }; apiup || { echo "STAFFMAIN_NOT_DONE: the API refused the staff screens; the file before is back, but the API did not start on it either: the site is DOWN: ask at once"; exit 1; }; echo "STAFFMAIN_NOT_DONE: the API refused the staff screens (code above); the file before is back and the API restarted on it: ask"; exit 1; fi
echo STAFFMAIN_DONE
exit 0
```

Expect the `in the API file` line, the API's start lines (`PREVIEW_API_STARTED …`), then `STAFFMAIN_DONE`. If it says
`already`, nothing changed. If it stops with `the file before is back and the API restarted on it`, the staff screens
are still off and nothing else changed: run nothing more and ask. The way back is NAME5 (it moves the name and the
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

**3. Unlock the team tools.** As root: `systemctl start debateai-preview-team-unlock`. It unlocks them for one hour
(a new staff key is one of the things that need them unlocked). Wait about half a minute.

**4. Arm the permit.**

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# REKEY: the operator's yes for ONE new staff key of the Owner account, under the name the site answers as: one permit in the database (15 minutes, one use, for the sign-in whose code you type). Nothing restarts; no file changes.
grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" || { echo "REKEY_NOT_DONE: the staff screens are off (STAFFMAIN first); nothing changed"; exit 1; }
[ -f "$L/rekey-staff-key.mjs" ] || { echo "REKEY_NOT_DONE: the tools folder does not carry rekey-staff-key.mjs (the upload's tools-folder swap first); nothing changed"; exit 1; }
[ "$(psqlq "SELECT COALESCE((SELECT auth_method FROM pg_hba_file_rules WHERE error IS NULL AND type = 'local' AND database && ARRAY['all', 'debateai'] AND user_name && ARRAY['all', 'debateai_prod_staff_recovery'] ORDER BY rule_number LIMIT 1), 'none')" || true)" = scram-sha-256 ] || { echo "REKEY_NOT_DONE: the database's pg_hba.conf does not admit debateai_prod_staff_recovery on the local socket with scram-sha-256 (REKEYCHECK says the same), so the tool cannot connect; adding the line is a reviewed change: ask; nothing changed"; exit 1; }
UA=$(systemctl is-active debateai-preview-team-unlock || true)
if [ "$(systemctl show -p ExecStart debateai-preview-team-unlock 2>/dev/null | grep -c 'PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login' || true)" != 0 ]; then
  [ "$UA" != active ] || { echo "REKEY_NOT_DONE: the team unlock runs on its fallback writer, which holds the login this step needs: run  systemctl stop debateai-preview-team-unlock , run REKEY again, then start the unlock again; nothing changed"; exit 1; }
  echo "the team unlock uses its fallback writer: start it right after REKEY_DONE (systemctl start debateai-preview-team-unlock)"
else
  [ "$UA" = active ] || { echo "REKEY_NOT_DONE: the team tools are locked: run  systemctl start debateai-preview-team-unlock , wait half a minute, then run REKEY again; nothing changed"; exit 1; }
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
1. Open Admin → Team. Open **Security key setup and recovery** (Configurarea cheilor și recuperarea accesului).
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
the page says "Team tools are locked…" (Instrumentele echipei sunt blocate…), do step 3 and try again within the 15
minutes. If the browser refuses the key twice, ask.

**6. Verify, and check.** On the Team page press **Verify security key for team access** (Verifică cheia de
securitate pentru accesul echipei) and touch the key. The page now shows your access. Open public review and check
that a published debate shows **Hide now** (do not press it unless you mean it). Then, as root, run STAFFDB (1.6)
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

---

## 6. Friends' test, with test payments

`PREVIEW_ASKS_OPEN_TO=everyone-with-test-payments` lets any signed-in account start debates while payments are NETOPIA's
sandbox. **The site password stays on the whole time.** Friends get the site password from you, in person or in a
one-to-one message (never in a group, an e-mail thread, or a chat with Claude). This value only ever runs with the
password on.

**Before you open:** mail is open (part 4.3; friends need the verification mail to sign up), payments are the sandbox
with billing on, and you have read 6.4 (what bounds spending) and 6.5 (the brakes). Do 5.7 first if you can, so
your staff key works on dezbatere.ro and you can hide a debate by hand during the test. If you have not, tell
friends that on the Free plan a finished debate goes public by itself when the AI check allows it (5.1b), and that
nobody can take it down by hand for now.

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
V=everyone-with-test-payments                             # part 6 (friends' test); part 8: V=everyone
case "$V" in everyone|everyone-with-test-payments) ;; *) echo "ASKS_OPEN_NOT_DONE: V is not one of the two values"; exit 1;; esac
! grep -q '^PREVIEW_ASKS_OPEN_TO=' "$A" "$RF" || { echo "ASKS_OPEN_NOT_DONE: already open: ASKS_CLOSE first"; exit 1; }
grep -q '^PREVIEW_TEAM_USER_IDS_JSON=' "$A" || { echo "ASKS_OPEN_NOT_DONE: no team line to keep"; exit 1; }
for F in "$A" "$RF"; do [ -z "$(tail -c1 "$F")" ] || { echo "ASKS_OPEN_NOT_DONE: $F does not end in a newline"; exit 1; }; done
gatesok || { gates; echo "ASKS_OPEN_NOT_DONE: a spending gate is not active with its window open (above)"; exit 1; }
[ "$(inv "$API" | grep -c '"event":"api.release.no_site_cap"' || true)" = 0 ] || { echo "ASKS_OPEN_NOT_DONE: the running API has no ask room (it would refuse PREVIEW_ASKS_OPEN_TO_WITHOUT_ROOM)"; exit 1; }
PAY=none; if grep -qxE 'NETOPIA_API_BASE_URL=https://secure(-sandbox|\.sandbox)\.netopia-payments\.com' "$A"; then PAY=sandbox; elif grep -qx 'NETOPIA_API_BASE_URL=https://secure.netopia-payments.com/api' "$A"; then PAY=live; fi
echo "payments: $PAY"
case "$V/$PAY" in everyone-with-test-payments/sandbox|everyone/live) ;; *) echo "ASKS_OPEN_NOT_DONE: $V does not go with payments $PAY (part 10: PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING, ..._BILLING_OFF, ..._TEST_PAYMENTS_NOT_SANDBOX)"; exit 1;; esac
[ "$V" = everyone ] || [ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")" = 401 ] || { echo "ASKS_OPEN_NOT_DONE: the site password is off; the friends' test runs only behind it"; exit 1; }
AS=$M/asks/open-$(date -u +%Y%m%dT%H%M%SZ); install -d -o root -g root -m 0700 "$AS"
for F in "$A" "$RF"; do cp -p "$F" "$AS/$(basename "$F").before-open"; done
( umask 077; printf 'ASKS_ARCHIVE=%s\nASKS_LABEL=%s\n' "$AS" "$LABEL" > "$M/asks/names.sh" )
back() { for F in "$A" "$RF"; do cp -p "$AS/$(basename "$F").before-open" "$F"; done; }
for F in "$A" "$RF"; do ( umask 077; grep -v '^PREVIEW_TEAM_USER_IDS_JSON=' "$F" > "$F.new"; printf 'PREVIEW_ASKS_OPEN_TO=%s\n' "$V" >> "$F.new" ); chown --reference="$F" "$F.new"; chmod --reference="$F" "$F.new"; mv "$F.new" "$F"; done
lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" || { back; echo "ASKS_OPEN_NOT_DONE: a SAME check is BAD (above); both files are back, nothing restarted"; exit 1; }
[ "$(grep -cx "PREVIEW_ASKS_OPEN_TO=$V" "$A")" = 1 ] && [ "$(grep -cx "PREVIEW_ASKS_OPEN_TO=$V" "$RF")" = 1 ] && ! grep -q '^PREVIEW_TEAM_USER_IDS_JSON=' "$A" "$RF" || { back; echo "ASKS_OPEN_NOT_DONE: the two files do not both say the value without a team line; both are back"; exit 1; }
if ! apiup; then back; apiup || { echo "ASKS_OPEN_NOT_DONE: the API refused the open start; both files are back, but the API did not start on them either: the site is DOWN: ask at once"; exit 1; }; echo "ASKS_OPEN_NOT_DONE: the API refused the open start (code above); both files are back and the API restarted on them"; exit 1; fi
said -xF "{\"event\":\"api.preview.asks_open\",\"to\":\"$V\"}" || { echo "ASKS_OPEN_NOT_DONE: no asks_open line: ask"; exit 1; }
echo ASKS_OPEN_DONE
exit 0
```

Expect `payments: sandbox`, the SAME list, the API's lines with `{"event":"api.preview.asks_open","to":"everyone-with-test-payments"}`,
then `ASKS_OPEN_DONE`.

The runner needs no restart. Its file already says open, and its start rule acts only when it starts. At its next
start it prints `{"kind":"DEBATEAI_RUNNER_STARTUP","event":"PREVIEW_ASKS_OPEN","to":"<value>"}` and fails only a
debate that no account owns. Keep `/root/preview-archive/main-site/asks`: closing reads the team line from it.

### 6.2 Test it

1. Sign in with an account that is not on the team. Ask a short question. The debate must start.
2. Watch the spend:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# GATES: the three spending gates (read-only).
gates
echo GATES_DONE
exit 0
```

### 6.3 Close asks (always before real payments)

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# ASKS_CLOSE: only the team may start debates again. Edits the current release's two files, so it works after any later upload.
! grep -qx 'PREVIEW_LIVE_PAYMENTS=real-money' "$A" || [ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")" = 401 ] || { echo "ASKS_CLOSE_NOT_DONE: payments are live and the site is open: PWON first"; exit 1; }
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
if ! apiup; then back; apiup || { echo "ASKS_CLOSE_NOT_DONE: the API refused the start; both files are back, but the API did not start on them either: the site is DOWN: ask at once"; exit 1; }; echo "ASKS_CLOSE_NOT_DONE: the API refused the start (code above); both files are back and the API restarted on them"; exit 1; fi
! said '"event":"api.preview.asks_open"' || { echo "ASKS_CLOSE_NOT_DONE: the API still says open: ask"; exit 1; }
echo "open work now: $(psqlq "SELECT count(*) FROM core.work_item WHERE state IN ('READY', 'CLAIMED')")"
echo ASKS_CLOSE_DONE
exit 0
```

**What closing stops:** new questions, clarifying questions, the start step, starts from saved questions; the waiting
and stalled debates of non-team accounts (they are recorded failed and shown as "not started"); at the runner's next
start, their queued work; and, while payments are real, every checkout or plan upgrade by an account not on the team
(403 `PREVIEW_TEAM_ONLY`).

While payments are real, ASKS_CLOSE runs only with the site password on (PWON first): paying customers would lose
their questions in the open.

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
```

Open them again with each gate's `activate`:

```sh
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/anthropic-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-anthropic-authority-v1 --go /etc/debateai-v3-preview/provider-anthropic-go-v1.json
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-deepinfra-authority-v3 --go /etc/debateai-v3-preview/provider-deepinfra-go-v3.json
/usr/bin/python3 -I /opt/debateai-v3-preview/operator/perplexity-budget-v1/preview_budget_authority.py activate --private /var/lib/debateai-v3-preview/provider-perplexity-authority-v1 --go /etc/debateai-v3-preview/provider-perplexity-go-v1.json
```

(b) **Close the site to strangers:** PWON (part 8.4), when the password is off.

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

(d) **Asks back to the team only:** ASKS_CLOSE (6.3). While payments are real it runs only with the password on, so
PWON (b) comes first.

(a) and (b) work at any time, even during an upload. (c) and (d) do not: wait until the upload is over. Their names
file stops them only once the new release is staged, not from the start of the upload, so do not count on it.

To see spend: GATES (6.2), and the gates' halt e-mails.

---

## 7. Real payments

**Before you start:**
- NETOPIA approved (1.1), and the SmartBill proof passed (1.2).
- The main name is open (part 5), and the billing check passes on it.
- Asks are closed (ASKS_CLOSE). The live start refuses `everyone-with-test-payments`. After the switch you open asks
  with `everyone` (part 8), never with the friends' value.
- If a friends' test ran (part 6): it is closed (PAY0, 7.1, prints all zeros), and the site password is a new one
  that the friends never had (PWNEW, 7.0).
- Until your staff key works on dezbatere.ro (5.7), nobody can hide a published debate or settle a report by hand,
  and the test name is no way round either, because from PAY_SWITCH until PAY_BACK NAME5 refuses. The payment, refund
  and invoice steps need no staff screen, and 5.7 can be done while payments are real (STAFFMAIN restarts the API:
  pick a quiet minute, no checkout open). Taking real payments before 5.7, with the site password on and asks for the
  team only, was your decision; you do not need to ask again.
- The site password is on. While payments are real and asks are closed, the API refuses a checkout or a plan upgrade
  from any account not on the team (403 `PREVIEW_TEAM_ONLY`; the page shows its general error). Keep the password on
  anyway while mail is on the allow-list: a buyer outside it would get no M1 or M2.
- Never during an upload, and never while a second release runs or drains: two APIs on different payment systems on one
  database would end each other's billing jobs.

### 7.0 A new site password (after a friends' test)

The friends had the site password. During part 7 it keeps everyone but the team off the site, so change it first.
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
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/" || true)" = 401 ] || { echo "PWNEW_NOT_DONE: the site does not ask for the password now: look"; exit 1; }
[ "$(grep -c '^PREVIEW_BASIC_AUTH_USER=' "$CE" || true)" = 1 ] && [ "$(grep -c '^PREVIEW_BASIC_AUTH_HASH=' "$CE" || true)" = 1 ] || { echo "PWNEW_NOT_DONE: caddy.env does not hold exactly one user line and one hash line (nothing changed): ask"; exit 1; }
[ "$(grep -cF '{$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}' "$C" || true)" = 1 ] || { echo "PWNEW_NOT_DONE: the live Caddyfile does not read the two caddy.env values in one basic_auth line (nothing changed): ask"; exit 1; }
cad validate --config "$C" --adapter caddyfile >/dev/null 2>&1 || { echo "PWNEW_NOT_DONE: caddy validate refuses the live Caddyfile today (nothing changed): ask"; exit 1; }
esc() { printf '%s' "$1" | sed 's/[\\"]/\\&/g'; }
pair() { printf 'user = "%s:%s"\n' "$(esc "$1")" "$(esc "$2")"; }
answer() { pair "$1" "$2" | curl -s -o /dev/null -w '%{http_code}' -K - "https://$HOST/" || true; }
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
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/" || true)" = 401 ] || BAD="$BAD no-password"
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
`PREVIEW_TEAM_ONLY` (the page shows its general error). If no team account of yours is free of plans, stop here and
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
QL=$(grep -oE '^QUADERNO_API_BASE_URL=https://[a-z0-9-]+' "$M/pay/live.lines" | cut -d/ -f3 || true)
[ "$HOST" = dezbatere.ro ] || { echo "PAY_SWITCH_NOT_DONE: the API answers as $HOST: open the main name first (part 5)"; exit 1; }
! grep -q '^PREVIEW_ASKS_OPEN_TO=' "$A" "$RF" || { echo "PAY_SWITCH_NOT_DONE: asks are open: ASKS_CLOSE first (the live start refuses everyone-with-test-payments)"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")" = 401 ] || { echo "PAY_SWITCH_NOT_DONE: the site password is off"; exit 1; }
[ "$(modecheck "$QL")" = 'egress: live' ] || { echo "PAY_SWITCH_NOT_DONE: the egress proxy is not live for $QL (PAY_EGRESS first)"; exit 1; }
cmp -s "$M/pay/sandbox.lines" <(grep -E "$KEYS" "$A") || { echo "PAY_SWITCH_NOT_DONE: the API file's payment lines changed since PAY_LINES: ask"; exit 1; }
[ "$(swap "$M/pay/live.lines")" = swapped ] || { echo "PAY_SWITCH_NOT_DONE: the swap did not finish (compare the API file with $M/pay/api-$LABEL.env.before-live); nothing restarted: ask"; exit 1; }
[ "$(grep -cE "$KEYS" "$A")" = 11 ] || { swap "$M/pay/sandbox.lines"; echo "PAY_SWITCH_NOT_DONE: the swap did not leave 11 payment lines; the sandbox lines are back, nothing restarted"; exit 1; }
if ! apiup; then swap "$M/pay/sandbox.lines"; sandboxdrop; apiup || { echo "PAY_SWITCH_NOT_DONE: the live start was refused; the sandbox lines and the proxy's sandbox form are back, but the API did not start on them either: the site is DOWN: ask at once"; exit 1; }; echo "PAY_SWITCH_NOT_DONE: the live start was refused (code above; part 10); the sandbox lines and the proxy's sandbox form are back and the API restarted on them"; exit 1; fi
echo PAY_SWITCH_DONE
exit 0
```

The API writes its start line only after its launcher has re-checked the release, a minute or more after the restart;
`apiup` waits up to about 4 minutes. Expect `PREVIEW_API_STARTED …`, then `PAY_SWITCH_DONE`.

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

Expect: back on the site the plan is active; M1 with the Terms; NETOPIA's own e-mail; then M2 with SmartBill's PDF.

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
QL=$(grep -oE '^QUADERNO_API_BASE_URL=https://[a-z0-9-]+' "$M/pay/live.lines" | cut -d/ -f3 || true)
grep -qx 'PREVIEW_LIVE_PAYMENTS=real-money' "$A" || { echo "PAY_BACK_NOT_DONE: the API file is not live"; exit 1; }
! grep -q '^PREVIEW_ASKS_OPEN_TO=' "$A" "$RF" || { echo "PAY_BACK_NOT_DONE: asks are open: ASKS_CLOSE first (the sandbox start refuses everyone)"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")" = 401 ] || { echo "PAY_BACK_NOT_DONE: the site password is off: PWON first"; exit 1; }
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
if ! apiup; then swap "$M/pay/live.lines"; livedrop "$QL"; modecheck "$QL"; apiup || { echo "PAY_BACK_NOT_DONE: the sandbox start was refused; the live lines and form are back, but the API did not start on them either: the site is DOWN: ask at once"; exit 1; }; echo "PAY_BACK_NOT_DONE: the sandbox start was refused (code above); the live lines and form are back and the API restarted on them: wait, then run this again"; exit 1; fi
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
sign in there, open Admin → Team → public review, and check that your staff key is accepted. Without it nothing
published can be hidden by hand while the site is open, and the way back to the test name is closed while payments
are real. PWOFF1 (8.2) refuses while the API file has no line `STAFF_ACCESS_POLICY_VERSION=2`, and while the database
holds no working staff key of the Owner account under the name the site answers as.

**Before you start:** the site answers as dezbatere.ro (part 5); mail is open there (4.3: PWOFF1 checks both the
plan file and the API's mode line); real payments work (part 7); the staff screens are on and your staff key works
on dezbatere.ro (5.7); with your staff key working, you have read the **Public** tab again and used Hide now on
anything that went public while your staff key did not work and must not stay public (Free debates go public by themselves, 5.1b);
the payment marks
are on the site if you want them (only an upload made before part 5 adds them, 1.1; if they are missing, ask before
you take the password off); you have decided your numbers and gate pots (1.7, 6.4); and you have read the
warning in bold at the start of part 9: once strangers can buy, closing everything again needs help.

### 8.1 Asks open to everyone

Run ASKS_OPEN (6.1) with the line `V=everyone`. It refuses unless payments are live. Then test it as in 6.2.

### 8.2 Take the site password off: the guards and the copy

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PWOFF1: the guards, then two copies of the live Caddyfile, one to edit. Nothing live changes.
grep -qx 'PREVIEW_ASKS_OPEN_TO=everyone' "$A" && grep -qx 'PREVIEW_ASKS_OPEN_TO=everyone' "$RF" || { echo "PWOFF1_NOT_DONE: asks are not open to everyone in both files (8.1 first)"; exit 1; }
said -xF '{"event":"api.preview.asks_open","to":"everyone"}' || { echo "PWOFF1_NOT_DONE: the running API does not say asks open to everyone"; exit 1; }
! grep -qxE 'NETOPIA_API_BASE_URL=https://secure(-sandbox|\.sandbox)\.netopia-payments\.com' "$A" || { echo "PWOFF1_NOT_DONE: the API file names NETOPIA's sandbox"; exit 1; }
grep -qx 'PREVIEW_LIVE_PAYMENTS=real-money' "$A" || { echo "PWOFF1_NOT_DONE: payments are not live (part 7 first)"; exit 1; }
[ "$HOST" = dezbatere.ro ] || { echo "PWOFF1_NOT_DONE: the API answers as $HOST: the password comes off only on the main name (part 5)"; exit 1; }
grep -qx 'STAFF_ACCESS_POLICY_VERSION=2' "$A" || { echo "PWOFF1_NOT_DONE: the staff screens are off: STAFFMAIN and the rest of 5.7 first"; exit 1; }
OK=$(psqlq "SELECT count(*) FROM staff.owner_designation d JOIN staff.subject s USING (staff_id) JOIN identity.mfa_factor f ON f.user_id = s.user_id JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id = f.mfa_factor_id WHERE d.active AND s.state = 'ACTIVE' AND m.user_id = f.user_id AND f.factor_type = 'passkey' AND f.state = 'active' AND f.verified_at IS NOT NULL AND f.backup_eligible = false AND f.backup_state = false AND f.user_verification_required AND f.relying_party_id = '$HOST' AND f.credential_origin = 'https://$HOST'" || true)
[ "${OK:-0}" -ge 1 ] 2>/dev/null || { echo "PWOFF1_NOT_DONE: the Owner account has no working staff key under $HOST, so nobody could hide a debate by hand: 5.7 first"; exit 1; }
jq -e --arg o "https://$HOST" '.schema=="preview-auth-dev-mail-v2" and .recipients=="open" and .publicAppUrl==$o' "$MP" >/dev/null 2>&1 || { echo "PWOFF1_NOT_DONE: mail-plan.json is not the open plan for $HOST (4.3 first)"; exit 1; }
said -xF "PREVIEW_MAIL_MODE {\"mode\":\"open\",\"origin\":\"https://$HOST\"}" || { echo "PWOFF1_NOT_DONE: the running API does not say mail mode open on $HOST (4.3 first)"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")" = 401 ] || { echo "PWOFF1_NOT_DONE: the site does not ask for the password now: look"; exit 1; }
[ ! -e "$M/password/Caddyfile.before-open" ] || { echo "PWOFF1_NOT_DONE: $M/password/Caddyfile.before-open exists (look first)"; exit 1; }
cp -p "$C" "$M/password/Caddyfile.before-open"; cp -p "$C" "$M/password/Caddyfile.open"
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
2. Right after the line `respond @wrongHost "NOT_FOUND" 404`, add one line, at the same indentation:
   `header X-Robots-Tag "noindex, nofollow"`. It asks search engines not to list the site.
3. Keep the `@netopia_notify` handle and `caddy.env` as they are.

### 8.3 Take the site password off: put the copy in place

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# PWOFF2: the edited copy checked, then put in place; Caddy restarts (about a second). On any failed check the password goes back.
O=$M/password/Caddyfile.open; K=$M/password/Caddyfile.before-open
[ -s "$K" ] && [ -s "$O" ] || { echo "PWOFF2_NOT_DONE: the two copies of PWOFF1 are missing (PWOFF1 first; nothing changed)"; exit 1; }
! cmp -s "$K" "$O" || { echo "PWOFF2_NOT_DONE: the copy is not edited yet (edit it as 8.2 says, then run this again; nothing changed)"; exit 1; }
if cmp -s "$C" "$O"; then echo "PWOFF2_NOT_DONE: the edited copy is already the live Caddyfile (PWOFF2 ran before; nothing changed): move nothing, PWON needs both copies: ask"; exit 1; fi
cmp -s "$C" "$K" || { echo "PWOFF2_NOT_DONE: the live Caddyfile changed since PWOFF1 (nothing changed): move nothing (PWON reads $K and $O): ask"; exit 1; }
diff "$K" "$O" || true
[ "$(diff "$K" "$O" | sed -n 's/^>[[:space:]]*//p')" = 'header X-Robots-Tag "noindex, nofollow"' ] || { echo "PWOFF2_NOT_DONE: the copy does not add exactly the one noindex line"; exit 1; }
RM=$(diff "$K" "$O" | sed -n 's/^<[[:space:]]*//p' || true)
[ "$(printf '%s\n' "$RM" | head -n 1 | cut -d' ' -f1)" = basic_auth ] && [ "$(printf '%s\n' "$RM" | tail -n 1)" = '}' ] && [ "$(diff "$K" "$O" | grep -c '^[0-9]' || true)" = 2 ] || { echo "PWOFF2_NOT_DONE: the copy does not remove exactly the basic_auth block"; exit 1; }
cad validate --config "$O" --adapter caddyfile >/dev/null 2>&1 || { echo "PWOFF2_NOT_DONE: caddy validate refused the copy"; exit 1; }
[ -n "$(order "$O" "$HOST" || true)" ] && [ "$(order "$O" "$HOST" | grep -c authentication || true)" = 0 ] || { echo "PWOFF2_NOT_DONE: the copy still has a password step, or no route for $HOST"; exit 1; }
{ install -o root -g root -m 0644 "$O" "$C.new" && mv "$C.new" "$C" && cmp -s "$O" "$C"; } || { echo "PWOFF2_NOT_DONE: the copy was not put in place; Caddy was not restarted, so the password is still on: ask"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
BAD=''
[ "$(systemctl is-active caddy || true)" = active ] || BAD="$BAD caddy"
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/")" != 401 ] || BAD="$BAD password"
[ "$(curl -sI "https://$HOST/" | tr -d '\r' | grep -ci '^x-robots-tag: noindex, nofollow$' || true)" = 1 ] || BAD="$BAD noindex"
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/readyz")" = 404 ] || BAD="$BAD readyz"
[ "$(notify "$HOST")" != 401 ] || BAD="$BAD notify"
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3090/readyz)" = 200 ] || BAD="$BAD edge"
if [ -n "$BAD" ]; then { install -o root -g root -m 0644 "$K" "$C.new" && mv "$C.new" "$C"; } || { echo "PWOFF2_NOT_DONE: a check failed ($BAD), and the password file could not be put back: run PWON, then ask at once"; exit 1; }; systemctl restart caddy || true; sleep 3; [ "$(systemctl is-active caddy || true)" = active ] || { echo "PWOFF2_NOT_DONE: a check failed ($BAD); the password file is back, but Caddy did not start on it: the site is DOWN: ask at once"; exit 1; }; echo "PWOFF2_NOT_DONE: a check failed ($BAD); the password is back"; exit 1; fi
echo PWOFF2_DONE
exit 0
```

Expect the diff (the removed `basic_auth` lines and the one added line), then `PWOFF2_DONE`. The site is now open to
everyone.

### 8.4 The site password back (the way back, and brake (b))

```sh
set -euo pipefail
# PWON: the site password back (the Caddyfile kept by PWOFF1); Caddy restarts. It reads no names file, so it works at any time.
C=/etc/debateai-v3-preview/public/Caddyfile; M=/root/preview-archive/main-site
K=$M/password/Caddyfile.before-open; O=$M/password/Caddyfile.open; TS=$(date -u +%Y%m%dT%H%M%SZ)
ON=no; for H in dezbatere.ro v3-preview.dezbatere.ro; do if [ "$(curl -s -o /dev/null -w '%{http_code}' "https://$H/" || true)" = 401 ]; then ON=yes; fi; done
if [ "$ON" = yes ]; then for F in "$K" "$O"; do if [ -e "$F" ]; then mv "$F" "$F.$TS"; fi; done; echo "the site already asks for the password"; echo PWON_DONE; exit 0; fi
[ -s "$K" ] && cmp -s "$C" "$O" || { echo "PWON_NOT_DONE: the live Caddyfile is not the one PWOFF2 put in place: ask at once (the kept copy is $K)"; exit 1; }
{ install -o root -g root -m 0644 "$K" "$C.new" && mv "$C.new" "$C" && cmp -s "$K" "$C"; } || { echo "PWON_NOT_DONE: the kept Caddyfile was not put in place (the kept copy is $K): ask at once"; exit 1; }
systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3
ON=no; for H in dezbatere.ro v3-preview.dezbatere.ro; do if [ "$(curl -s -o /dev/null -w '%{http_code}' "https://$H/" || true)" = 401 ]; then ON=yes; fi; done
[ "$ON" = yes ] || { echo "PWON_NOT_DONE: the site does not ask for the password: ask at once"; exit 1; }
mv "$K" "$K.$TS"; mv "$O" "$O.$TS"
echo PWON_DONE
exit 0
```

### 8.5 The rules once the site is open

- The brakes are those of 6.5, with PWON as brake (b).
- `everyone-with-test-payments` never runs without the password. Put the password back before anyone writes that
  value again.
- Nothing becomes publicly listed by search engines while the noindex line is in place.

---

## 9. Closing everything again

Close in this order. Each step is safe to stop after. The scripts hold you to it. While the site is open, PAY_BACK and
NAME5 refuse, and so do ASKS_CLOSE and MAIL_CLOSE if payments are real. While payments are real, NAME5 refuses too.

**If the password was ever off with real payments on (part 8), stop and ask before step 1.** Someone outside the
team may then hold a paid plan. A paid plan renews every month on its saved card until its owner cancels it, and
both ways to cancel (Settings, and the `/cancel` link in the plan's mails) are behind the site password. Once the
password is back, such a plan never ends, PAY_BACK never passes, and that person is still charged every month while
they cannot even open the site. Never end their plan yourself. PWON as a brake (6.5 (b)) still works at any time.

1. **The site password back:** PWON (8.4).
2. **Asks back to the team:** ASKS_CLOSE (6.3).
3. **Payments back to the sandbox:** PAY_BACK (7.11). It waits until every live plan is over and every refund and
   credit note is recorded. After your test payment alone, that takes days. Meanwhile the password stays on, and
   steps 4 to 6 wait too.
4. **The name back to the test name:** NAME5 (5.5). It also moves the mail plan and the API file's two staff name
   lines back to the test name. If the staff screens were on, they are on again there, and the staff key you first
   enrolled on the test name works again. If they were off and you want them, run STAFFON (5.5b) after NAME5.
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
- Close payments first (PAY_BACK): an older API refuses the payments line, and does not see open live work.
- Then close the name (NAME5): an older launcher refuses the main name.
- Put the **v1 mail plan** back (MAIL_CLOSE on the test name), and check its digest. With a v2 plan an older release
  starts normally but refuses every mail, with no sign at start except `AUTH_MAIL_DELIVERY_FAILED … code=SENDMAIL_EXIT_1`
  in its journal.
- Asks: an older release starts from its own files, which have no asks line. Close asks in the current files anyway
  (ASKS_CLOSE), so the two releases agree.
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
- **Per request or per mail** (the last two rows): the service keeps running and refuses that one request or mail.

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
| `PREVIEW_ASKS_OPEN_TO_INVALID` | launcher, API or runner | `PREVIEW_ASKS_OPEN_TO` is not exactly `everyone` or `everyone-with-test-payments` | ASKS_CLOSE |
| `PREVIEW_ASKS_OPEN_TO_WITHOUT_PREVIEW` | launcher, API or runner | the line is set without the preview's test configuration | ASKS_CLOSE; ask |
| `PREVIEW_ASKS_OPEN_TO_WITH_TEAM` | launcher, API or runner | the team line is still in the same file | ASKS_CLOSE, then ASKS_OPEN |
| `PREVIEW_ASKS_OPEN_TO_NOT_HOSTED` | launcher, API or runner | the file is in local mode | ASKS_CLOSE; ask |
| `PREVIEW_ASKS_OPEN_TO_WITHOUT_ROOM` | API start, stage `preview-asks-open` | the ask room (the site's daily ceiling and per-person holds) is not built | ASKS_CLOSE; ask |
| `PREVIEW_ASKS_OPEN_TO_SANDBOX_BILLING` | API start, stage `preview-asks-open` | `everyone` while billing runs on NETOPIA's sandbox | ASKS_CLOSE; open with `everyone` only after part 7 |
| `PREVIEW_ASKS_OPEN_TO_BILLING_OFF` | API start, stage `preview-asks-open` | `everyone` while the site version's billing is off (the provider-only mode included) | ASKS_CLOSE; asks stay closed until an upload turns billing on (then part 7) |
| `PREVIEW_ASKS_OPEN_TO_TEST_PAYMENTS_NOT_SANDBOX` | API start, stage `preview-asks-open` | `everyone-with-test-payments` with live payments, or billing off | ASKS_CLOSE. With live payments, open with `everyone`. With billing off, asks stay closed (only an upload turns billing on) |
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
| bare `PREVIEW_API_STARTUP_REFUSED`, no stage line | launcher | a rule outside these locks, for example a stray key, or the payments line in local mode or on an older release | put back the file you changed; ask |
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
| `BAD SAME_API_PAYMENT_SYSTEM` | SAME, two releases | two API files name different payment systems | ask before any switch |
| `PREVIEW_TEAM_ONLY` (HTTP 403 from `/api/v1/billing/checkout` or `/api/v1/billing/subscription/upgrade`; the page shows its general error) | per request, the API | while payments are real and asks are closed, an account not on the team tried to buy or upgrade a plan; nothing was charged or written | expected; pay with a team account, or open asks (part 8) |
| `PREVIEW_MAIL_REFUSED` (and the API's `AUTH_MAIL_DELIVERY_FAILED … code=SENDMAIL_EXIT_1`) | per mail, the mail program | one mail was refused by the plan's rules (in allow-list mode: an address not on the list) | expected in allow-list mode for other addresses; otherwise MAIL_CLOSE and ask |
