# When personal data is exposed, lost or changed: the breach runbook

This is the owner's runbook for a personal data breach. It starts at the moment someone suspects one and ends with a
closed record in the breach register. It was written on 22 November 2026 from the laws' own texts
(`docs/legal-research/assessments/breach-clocks.md` lists them). It has not been reviewed by a lawyer.

**The rule, in three lines.**

1. **Record every breach**, also one you tell nobody about. The law asks for the record in every case (GDPR
   Art. 33(5)), and our privacy policy promises it (section 9; Annex B.3 for Canada and Quebec).
2. **Decide within 48 hours** of becoming aware: how bad it is, and who must be told.
3. **Tell everyone the law says to tell within 72 hours** of becoming aware. That one clock meets every region's
   limit at once: the strictest limits we have are 72 hours (the EU, Moldova, South Korea) and 3 days (Singapore).

Part 0 says what the words mean. Parts 1 to 7 are the steps, in order. Part 8 is about the register itself. Part 9
lists what to prepare **now**, before anything happens. Part 10 lists what is not built yet.

## 0. What this is

**A personal data breach** is a failure of security by which personal data is destroyed, lost, changed, shown to
someone who should not see it, or reached by someone who should not reach it (GDPR Art. 4(12)). It does not matter
whether it was an attack or an accident, or whether it was our fault or a provider's.

There are three kinds, and one breach can be more than one kind:

- *someone saw or took it* (confidentiality);
- *it was changed* (integrity);
- *it is gone, or cannot be reached* (availability).

**What it looks like on this site.** Each of these is a breach, or must be treated as one until you know better:

- a copy of the database, a backup or the server's disk is taken, or left where a stranger can fetch it;
- someone signs in to the server, to the hosting account, to a staff account or to the mail account, and it was
  not us;
- a fault shows one account's private debate, email address or invoice to another account;
- an email with someone's data goes to the wrong person;
- many accounts are signed in to with passwords stolen elsewhere;
- a provider (the hosting company, an AI provider, the mail sender, the payment company) tells us of a breach on its
  side that touched our users' data;
- a laptop, phone or disk that holds keys, backups or this register is lost or stolen;
- data is lost and no backup brings it back.

**What it is not.** The site being down with nothing lost; an attack that was blocked; a report of a weakness with no
sign that anyone used it. Fix those, but they need no record here. If you cannot tell which it is, open a record: a
record that ends with "this was not a breach" costs nothing, and an authority does not punish a report that turns out
to be no breach (EDPB Guidelines 9/2022, paragraph 60).

**The words.**

- *The record* is one page about one breach. *The register* is the folder that holds every record. It is **not in this
  repository**: this repository is public (part 8).
- *The tool* is `pnpm breach:register` (`tools/breach-register/`). It opens a record, counts the time limits and says
  what is still missing. It needs nothing but Node, so it also runs as `node tools/breach-register/cli.mjs` on a
  machine where nothing is installed.
- *The notice command* is `pnpm breach:notify` (`apps/api/src/breach-notice/`). It writes the notice to the accounts
  you choose (part 6). Unlike the tool it runs on the server, as the site's own user.
- *Aware* is the moment you are reasonably sure that a security failure touched personal data (EDPB Guidelines 9/2022,
  paragraph 31). Every time limit runs from that moment. Part 1 says how to fix it.
- *The authority* is the data protection office of a country. Ours is the Romanian ANSPDCP; the other regions have
  their own.
- *A region* is a group of countries under one breach law. The tool names them `EEA`, `MD`, and so on; part 4 has the
  table.
- *A provider* is a company that handles our users' data for us: the hosting company, the AI providers, the mail
  sender. The privacy policy (section 5) and the Register at dezbatere.ro/providers name them.

## 1. The first hour: fix the moment, open the record

**1.1 Write down the time, now.** Note the minute you first heard, and from whom. If you are already sure that
personal data was touched, that minute is "aware". If you are not sure yet, you may look into it first, but only
briefly: aim to know within 24 hours. The law allows "a short period of investigation" and no more (EDPB Guidelines
9/2022, paragraphs 34 to 36), and sitting on an alert counts against us (paragraph 40). The minute you become
reasonably sure is "aware".

**When a provider tells us, we are aware at once.** The minute its message arrived is our "aware" (paragraph 44).
Do not wait for its full report.

**1.2 Open the record.** On your Mac, in the repository's `dialectical-engine` folder:

```sh
pnpm breach:register open --aware "2026-11-22 14:05" --title "a few words that name it"
```

A time without a zone is Romanian time. The tool makes a new folder in the register, for example `BR-2026-001`, puts
`record.md` in it and prints every region's time limit as a date. The register's folder comes from
`BREACH_REGISTER_DIR` (part 9) or from `--register <folder>`.

**1.3 Fill in the record as you go**, not at the end (paragraph 39). Open `record.md` in any editor. The lines that
start with `- ` are read by the tool: change only what comes after the colon. Under each heading, write plain
sentences. Put a copy of every message you receive or send about the breach into the record's folder.

At any moment, this says what is late, what comes next, and what is still missing:

```sh
pnpm breach:register status
```

**1.4 Tell whoever runs the server**, if that is not you, and keep them on the phone for part 2.

## 2. Stop the harm, and keep the traces

Stop it first; understand it second. But change as little as you can, and delete nothing: the journals and logs are
the only way to learn what was reached.

**The brakes that exist.** Each one is a step of another guide; use the one that fits.

| What you want | The step | Where |
|---|---|---|
| Close the site to strangers | PWON: the site password back on | `deploy/preview-auth-dev/v1/MAIN-SITE.md` 8.4, and brake (b) of 6.5 |
| Stop new sign-ups only | SIGNUPS | the same guide, brake (c) of 6.5 |
| Stop all spending on AI providers (this also refuses new questions) | each gate's `stop` | the same guide, brake (a) of 6.5 |
| A master key may have been read | change the master keys | `deploy/vps/README.md` §3 "Changing a master key" |
| A provider's key, the mail password or a payment key may have been read | make a new one at that provider, put it in its file on the server, restart | `deploy/vps/README.md` §11 for the providers, §7 for mail |
| Your own account was signed in to by someone else | Settings → Active sessions: end the others; change the password; replace the authenticator | the site itself |
| A staff account or staff key is in the wrong hands | disable it | `docs/operations/v3-owner-access-runbook.md`, "Containment, outage and replacement" |
| The server itself is in someone else's hands | shut it down or cut it from the network in the hosting company's control panel | the hosting account |

**Keep the traces before they roll away.** The server's journal keeps 90 days and Caddy's access log is rotated
(`deploy/vps/README.md` §8). Copy what covers the breach to a safe place off the server before you restart, restore
or rebuild anything, and note in the record where the copies are. Do not paste personal data from them into the
record.

**Write each step and its time** under "What we did to stop it and limit the harm".

## 3. Find out what was reached, and rate the risk

You have 48 hours for this part. Do not wait for certainty: a first answer with "about" in it is enough to decide, and
it can be corrected later (EDPB Guidelines 9/2022, paragraphs 52 to 57).

### 3.1 What was reached

Go through this list and write the answer for each line under "The personal data involved".

| Data | How it is kept | When it is readable to someone who took it |
|---|---|---|
| Email addresses | encrypted, under a key of the account | only with the account's key and the master key |
| Passwords | never kept; only an Argon2id hash | never as the password itself; a weak password can be guessed from the hash with effort |
| Authenticator secrets, recovery codes | encrypted, under a key of the account | only with the keys |
| Private debates, and questions not started yet | encrypted, under keys of the account and of each debate | only with the keys |
| Public debates | public | always: they are public already. What must stay secret is **who** wrote them: the link between a pseudonym and an account |
| Billing records (name, address, invoices) | sealed under the records key | only with the records key |
| Addresses of visitors' computers in the security log | one-way digests | not as addresses, unless the salt was taken too |
| Card numbers | never kept by us; the payment company holds them | not from us |

**The keys decide everything.** Rows taken from the live database **without** the key files are unreadable. But some
copies hold the keys beside the data: the copies of the database made at an upload, and the hosting company's backups
of the whole disk (privacy policy, section 7). If one of those was taken, or the server itself was entered, treat
everything in it as readable. Write in the record whether the keys were reached, and how you know.

### 3.2 How many people, and where

The number per region decides who must be told. On the server, as root, this counts the accounts by the country each
one declared at sign-up, and by state for the United States. It only reads, and it prints no names and no addresses:

```sh
set -euo pipefail
# BREACHCOUNT: accounts by declared country, and by state for the United States (read-only; prints counts only).
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
psqlq "SELECT country_code, coalesce(us_state, '-'), count(*) FROM identity.registration_region GROUP BY 1, 2 ORDER BY 1, 2" || { echo "BREACHCOUNT_NOT_DONE: the database is unreadable: ask"; exit 1; }
psqlq "SELECT 'no declared country', '-', count(*) FROM identity.\"user\" u WHERE NOT EXISTS (SELECT 1 FROM identity.registration_region r WHERE r.user_id = u.user_id)"
echo BREACHCOUNT_DONE
```

This counts **every** account. When the breach touched only some accounts, the true number is smaller; use this as
the upper limit until you know which accounts. Three things to know:

- Accounts made before sign-up asked for a country (migration 0095, October 2026) declared none; the second line
  of the output counts them. Count them as affected in **every** region until you know better.
- We do not know which Canadian accounts are in Quebec: sign-up asks the country, not the province. So when any
  Canadian account is affected, treat the Quebec rules as applying too.
- People named in a debate who are not our users (privacy policy, section 11) cannot be counted. If private debate
  text was read, say so in the record under "Who is affected".

Write the numbers on the lines "People affected in all" and, per region, "People affected here". Write `0` for a
region where nobody is affected: the tool then drops that region's time limits.

### 3.3 Rate the risk: unlikely, risk, or high risk

One line in the record, "Risk to people", takes one of three answers. Start from this table, then apply the three
rules under it. The table is ours: it follows the EDPB's own worked cases (Guidelines 01/2021), and where our service
differs from a case we chose the more careful answer.

| What happened | Start from | Why |
|---|---|---|
| Private debate text, or questions not started, were readable to an outsider | **high risk** | They can hold health, politics, religion and sex life, and the law then takes harm as likely (Guidelines 9/2022, paragraph 102) |
| The link between pseudonyms and accounts or email addresses was readable | **high risk** | It shows who wrote which public debate |
| Authenticator secrets, recovery codes or live sign-ins were readable, or accounts were in fact signed in to by someone else | **high risk** | The account, and so its private debates, can be taken over (Guidelines 01/2021, case 07) |
| A backup, an upload-day copy of the database, or the server's disk was taken, or the server was entered | **high risk** | Such a copy holds the keys beside the data (3.1) |
| Email addresses were readable, with nothing else | **risk** | Scam emails, and the fact of having an account here |
| Password hashes were taken, with or without email addresses | **risk** | The EDPB's own case (06) ends in "record only", but it assumes a site with nothing sensitive in it and no email addresses; ours has both. Tell the people to change their password in any case (case 06, paragraph 62) |
| Billing records were readable | **risk** | Name, address and what was bought |
| Encrypted rows were taken, and the keys were not | **unlikely** | Unreadable without the keys (Guidelines 9/2022, paragraphs 76 to 78). Write why you are sure the keys were not reached. If you later learn they were, rate again |
| Data was lost or unreachable, and a backup brought all of it back within a day or two | **unlikely** | Guidelines 01/2021, case 01 |
| Data was lost for good, or for longer than that | **risk** | Guidelines 01/2021, case 02 |
| One message went to the wrong person or to a few, with ordinary data of a few people; they are known, and confirm in writing that they deleted it | **unlikely** | Guidelines 01/2021, cases 09 and 15 |

1. **When you do not know, take the worse case** (Guidelines 01/2021, paragraph 30), and when in doubt, tell the
   authority (Guidelines 9/2022, paragraph 119).
2. **Go one step up** when the taker clearly means harm, when more than about 100 people are affected, or when the
   harm cannot be undone.
3. **Rate again** whenever you learn something new (Guidelines 9/2022, paragraphs 78 and 98), and write the new
   answer with its date.

Write the reasons under "Why we rated the risk this way". Write them with the most care when the answer is
"unlikely": the reasons for **not** telling anyone are what an authority asks to see first (Guidelines 9/2022,
paragraph 125). If you want a second opinion in numbers, the EU's security agency published a scoring method the EDPB
points to (ENISA, *Recommendations for a methodology of the assessment of severity of personal data breaches*, 2013);
it is not binding, and no authority says which score means what.

**What the three answers mean in the EU**, which is the model for the other regions:

| Answer | The record | ANSPDCP | The people affected |
|---|---|---|---|
| unlikely | yes | no | no |
| risk | yes | **yes, within 72 hours** | no (you may still choose to) |
| high risk | yes | **yes, within 72 hours** | **yes, without undue delay** |

The other regions use other words for their tests. Part 4 says, for each, which of our three answers reaches it.

## 4. Decide who must be told

For each region where at least one person is affected, the record has two lines to decide: "Authority" and "People".
Each ends as `told <time>` or as `not required: <the reason in one sentence>`. The reason is part of the record.

This table says when each region's duty is reached, in the words of part 3. The full rules, with each law's article,
are in `docs/legal-research/assessments/breach-clocks.md`, and this prints them with the dates worked out:

```sh
pnpm breach:register clocks --aware "2026-11-22 14:05"
```

| Region | The authority is told when | The people are told when |
|---|---|---|
| `EEA` European Union and EEA | the rating is **risk** or **high risk** (ANSPDCP, 72 hours) | the rating is **high risk** |
| `MD` Moldova | the same (CNPDCP, 72 hours) | the same |
| `KR` South Korea | the breach came from a break-in from outside, **or** debate text or anything about health, beliefs, politics or sex life was reached, **or** 1,000 or more people are affected (72 hours) | **always**, whatever the rating: every person in Korea whose data was lost, taken, changed or damaged, within 72 hours. Encryption and hashing are no exception. After a break-in, also when we cannot yet tell whose data left |
| `JP` Japan | the breach came from a deliberate act (a break-in, theft, an insider), also at a provider, **even when it is only suspected**; **or** debate text was reached; **or** more than 1,000 people. Not when the data was encrypted and the keys are safe. A first report within our 72 hours, the final one by the 30th day | the same cases |
| `SG` Singapore | sign-in data was reached (an email address with its password hash or authenticator secret), **or** 500 or more people are affected in all, whatever the rating (3 days) | sign-in data was reached, unless it was encrypted or hashed well enough that harm is unlikely. The PDPC is told all the same |
| `US` United States | the people in a state must be told **and** enough of them live there: any number in New York and Massachusetts, 250 in Texas, 500 in California, Florida, Washington, Illinois, Colorado | an email address was taken together with its password or the password's hash, **or** health details together with something that names the person. Not when the data was encrypted and the keys are safe. Within 30 days at the latest |
| `CA` Canada | the rating is **high risk**; and with **risk**, whenever humiliation or damage to someone's reputation is a real possibility (OPC, and Alberta's Commissioner) | the same |
| `CA-QC` Quebec | the same test in other words: a risk of serious injury (CAI) | the same |
| `NZ` New Zealand | the rating is **high risk**; with **risk**, when serious harm to a person is likely. Losing access to the data counts too | the same |
| `AU` Australia | **not required**: the Australian law does not bind a business with a turnover of AUD 3 million or less. Write on the line: `not required: we are a small business operator under s 6D of the Privacy Act 1988, so its Part IIIC does not bind us` | the rating is **high risk** (our own promise in the privacy policy, section 9) |

**Three things this table does that the EU rating does not.**

- **South Korea, Japan and Singapore do not wait for "high risk".** A break-in with only password hashes taken, which
  the EU's own example calls "record only", still means telling every affected person in Korea within 72 hours, the
  PPC in Japan, and the PDPC in Singapore.
- **The United States look at the kind of data, not at the risk.** Political or religious text alone is in no
  state's law; an email address with a password is in many. Count the affected people **per state**.
- **Canada and Quebec count humiliation as harm.** Debate text that can be tied to a person reaches their test even
  with no money at stake.

**Our promise is wider than some of these laws.** The privacy policy (section 9) says we tell a person directly when
a breach is likely to put their rights at high risk, wherever they live. So with **high risk**, the people are told
in every region, also where the table's own test would not ask for it.

**Canada: one count, three authorities.** We do not know the province (part 3.2). Write the Canadian number in both
blocks, `CA` and `CA-QC`, unless you know who lives in Quebec; and when the test is met, tell the OPC, the CAI, and
Alberta's Commissioner too unless you know that nobody in Alberta is affected.

**If you are late.** Tell them anyway, at once, and write the reason on the region's line "Late because". The law
asks for the reason with a late notification (GDPR Art. 33(1)), and the tool will not close the record without it.

## 5. Tell the authorities

**What every authority asks for** (GDPR Art. 33(3); the others ask for much the same). Take it from the record:

- what happened, and when: the breach itself, and the moment we became aware;
- which kinds of data, and about how many people and how many records;
- what may happen to those people;
- what we did and what we will still do, for the breach itself and to limit the harm;
- who to write to: the director, privacy@dezbatere.ro;
- whether and how the people were told, or why not.

**You do not need every answer to send the first notification.** Send what you know inside the time limit, say that
more will follow, and send the rest when you have it (GDPR Art. 33(4); Guidelines 9/2022, paragraphs 53 to 57).
ANSPDCP's form has a tick for "completion of an earlier notification" and asks for the first one's number.

**Romania (ANSPDCP), for the EU and EEA.** We tell only ANSPDCP; it is our authority for all of the EU and EEA, and
its form asks whether people in other member states are affected.

1. Open <https://www.dataprotection.ro/?page=pagina_formular_679> and choose **Depunere notificare online**. The form
   is in Romanian, in five steps: the operator, first information, further information, what the people were told,
   people in other countries. You can attach files, up to 15 MB in all, with no diacritics in the file names.
2. Save the page that confirms it was sent, and the registration number if one is shown, into the record's folder.
3. The other way, if the online form does not work: the form approved by ANSPDCP's Decision No. 128/2018, filled in,
   **signed electronically**, sent to brese@dataprotection.ro. The Decision says an unsigned form is not considered.
   This is why part 9 asks for an electronic signature in advance.

We could not confirm whether the online form alone is enough without an electronic signature, or whether it returns a
number by itself. If in doubt, do both ways.

**The other regions.** Each row of `breach-clocks.md` names the authority's form or address; `pnpm breach:register
clocks` prints them. Write to each authority in the language its form is in.

**After each one**, set the region's line in the record, for example `- Authority (ANSPDCP (Romania)): told
2026-11-23 10:00`, and put a copy of what you sent, and of any receipt, in the record's folder.

## 6. Tell the people

**What the message must say**, in plain words and in the language the person uses with us (GDPR Art. 34(2);
Guidelines 9/2022, paragraphs 86 to 91):

- what happened, and when;
- which of their data was touched;
- what may happen to them because of it;
- what we did about it;
- **what they should do**: for example change the password here and wherever else they used it, replace the
  authenticator, watch for emails that pretend to come from us;
- who to write to: privacy@dezbatere.ro.

It must be a message of its own, not a line in another mail (paragraph 89). A notice on the site or a post alone is
not enough when we can write to the people directly (paragraph 90).

Most regions list what their notice must hold, and the list above covers them. Three add something of their own
(`breach-clocks.md` part 3 has every list):

- **New Zealand:** that the Privacy Commissioner was told, and that the person may complain to the Commissioner.
- **South Korea:** the person's rights in law and how to use them: damages, fixed damages and dispute mediation.
- **The United States:** the title "Notice of Data Breach" and California's five headings, with the dates.

**Mind the channel.** If the breach may have given someone else the person's mailbox or our mail account, an email is
the wrong way: use a notice the person sees after signing in, or a notice on the site (paragraph 92). New York goes
further: when an email address was taken together with its password, an email does not count as the notice there, and
the notice must be shown in the account after sign-in. New York also accepts an electronic notice only from a person
who agreed to it beforehand; sign-up does not ask for that today (part 10).

**When you need not tell them** although the risk was high (GDPR Art. 34(3)): the data was unreadable to the taker
(encrypted, keys safe); or what we did afterwards means the high risk will no longer come about; or telling each
person would take an effort out of all proportion, and then a public notice takes its place. Write which one you rely
on, and the proof, in the region's "People" line and under "Why we rated the risk this way".

**How to send it: `pnpm breach:notify`.** The command writes one mail of its own to each account you choose, to the
address the account has at that moment, in the account's language, with the text you wrote. It runs on the server,
because only the site can open an account's address: addresses are encrypted under each account's key. Without
`--confirm` it sends nothing and only prints the plan. The steps below were written from the code and the server's
guides and have not been run on the server yet: the first practice (part 9) is their test.

**6.1 Write the texts, on your Mac.** Make a folder, and in it one file per language, named by the language's code:
`en.txt`, `ro.txt`, `ko.txt`, and so on. Each file is plain text in this form:

```text
Subject: Notice of Data Breach

What Happened?
On 3 May 2027, between 02:10 and 02:40 Romanian time, someone outside the company read ...

What You Can Do
Change your password here and wherever else you used it. ...

For More Information
Write to privacy@dezbatere.ro.
```

The first line is the subject, then an empty line, then the message. An empty line starts a new paragraph. The mail
shows the message exactly as you wrote it and adds one closing line with the company's name, its address and
privacy@dezbatere.ro. The command refuses a file, and says which, when it has no subject line, when a part in
[square brackets] was left unfilled, when it does not name privacy@dezbatere.ro (a reply to the mail reaches nobody,
so the text must say where to write), or when it holds a tab or another control character. Put a copy of the folder
into the record's folder: it is the proof of what was sent.

**6.2 Make the list of accounts, on the server.** As root. It makes a work folder that only the site's own user can
read, and writes into it one line per account: the account's id, and the country and US state it declared at sign-up
(`-` where it declared none). No name and no address:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
# BREACHLIST: one line per account (id, declared country, US state) for pnpm breach:notify. Read-only on the database.
W=/var/lib/debateai-breach-notice
install -d -o "$AU" -g "$AGRP" -m 0700 "$W" "$W/texts" "$W/out"
psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }
( umask 077; psqlq "SELECT u.user_id, coalesce(r.country_code, '-'), coalesce(r.us_state, '-') FROM identity.\"user\" u LEFT JOIN identity.registration_region r ON r.user_id = u.user_id WHERE u.state <> 'deleted' ORDER BY 1" > "$W/accounts.txt" ) || { echo "BREACHLIST_NOT_DONE: the database is unreadable: ask"; exit 1; }
chown "$AU:$AGRP" "$W/accounts.txt"
echo "accounts on the list: $(wc -l < "$W/accounts.txt")"
echo BREACHLIST_DONE
```

The list is a file, and not something the command reads by itself, on purpose: no login of the site may read the
declared countries, and a command used only on the day of a breach is no reason to change that.

**6.3 Copy the texts to the server**, into `/var/lib/debateai-breach-notice/texts`, the way you copy files to the
server for an upload, and give them to the site's user. On the server, as root:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
chown -R "$AU:$AGRP" /var/lib/debateai-breach-notice/texts
```

**6.4 Read the plan.** On the server, as root. This sends nothing:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
W=/var/lib/debateai-breach-notice
RUNAPI apps/api/src/breach-notice/cli.ts --accounts "$W/accounts.txt" --texts "$W/texts" --out "$W/out" --country KR
```

Choose the accounts in one of three ways:

| You write | It chooses |
|---|---|
| `--all` | every account on the list |
| `--country KR,JP` and, or, `--us-state NY,CA` | the accounts that declared one of these countries or states. Add `--undeclared` for the accounts that declared no country (made before October 2026); until you know better they count as affected in every region (part 3.2) |
| `--ids <file>` | the accounts named in a file, one account id per line, when you know exactly which accounts were touched. The file must be on the server, readable by the site's user |

The plan prints the number of accounts chosen, **per declared country**, how many of them it would write to, which text
each language gets, and how much room is left in today's mail limit. Read it before you go on:

- **The language** of an account is the language of the Terms the person last accepted, and English when there is
  none: the same rule as the site's other mail that no request of the person's started.
- **An account whose language has no text is not written to.** The plan says how many those are, per language. Either
  add the text, or add `--english-fallback` to send them the English one.
- **The mail limit.** The notice is counted against the day's limit like all other mail, and may use all of it. When
  the limit is reached no other mail goes out until 00:00 UTC, password resets included, and people who read "change
  your password" will ask for those. `--leave-room 200` stops the notice while there is still room for 200 more
  mails. When the notice does not fit into one day, send the regions with the shortest time limit first (South
  Korea, then the EU) and the rest after 00:00 UTC. The limit itself is in the register (`outboundMailPolicy`;
  `deploy/vps/README.md`, "Upgrading to the daily mail limit"); raising it needs a new settings version, so it is not a
  step for the day itself.

**6.5 Send.** The same command with `--confirm`:

```sh
set -euo pipefail
. /root/preview-archive/main-site/names.sh
W=/var/lib/debateai-breach-notice
RUNAPI apps/api/src/breach-notice/cli.ts --accounts "$W/accounts.txt" --texts "$W/texts" --out "$W/out" --country KR --confirm || echo "the command ended with code $?: read its last lines"
```

It prints the plan again, sends, and then prints the log. It ends in one of these ways:

- **Everyone chosen was written to** (code 0). An account deleted since the list was made is counted in the log under
  its own reason; nobody is left there to write to.
- **`NOT EVERYONE WAS WRITTEN TO`** (code 3): the log's table "Not written to, by reason" says why. Run the **same
  command again**: it keeps a list of the accounts it reached (`out/sent-accounts.txt`) and writes only to the others.
  The reasons you can do something about: no text in a language (6.4); today's limit reached (again after 00:00 UTC);
  and "the mail program failed", which after five failures in a row stops the run. That last one is what you see
  while the site's mail is still locked to the allow-list (`deploy/preview-auth-dev/v1/MAIN-SITE.md` part 4): the lock
  holds for this mail as for any other, so open mail first.
- **A line that starts with a code in capitals and nothing sent** (code 1 or 2): the line says what is wrong, for
  example which text file.

**6.6 Bring the log home.** `out/breach-notice-log.md` says when it was sent, how many were written to per declared
country, how many were not and why, and each text's subject and file fingerprint. It holds no email address and no
account id. Copy it into the record's folder, beside the texts. The work folder on the server names accounts by id:
delete it when the record is closed (`rm -rf /var/lib/debateai-breach-notice`), not before, because the next run needs
its list of accounts already reached.

**What this command does not do.** It writes to the address a person signs in with, not to a backup address. It does
not write to a deleted account. And it is email only: where the law does not accept an email (New York, when an email
address was taken together with its password) or where the mailbox itself may be in someone else's hands, the notice
shown in the account after sign-in is still missing (part 10), and a notice on the site's pages is the fallback.

**After it**, set each region's line, for example `- People: told 2026-11-24 09:00`, and keep the message's text and
the number of people it went to in the record's folder (Guidelines 9/2022, paragraph 127).

## 7. When a provider is involved

- **A provider tells us of a breach on its side.** We are aware from the minute its message arrived (part 1). The
  provider only has to tell us that it happened; rating the risk and telling authorities and people is ours
  (Guidelines 9/2022, paragraph 44). Ask it, in writing, for what part 3 needs: which of our data, how many records,
  from when to when, whether it was readable, and what it has done. Put its messages in the record's folder.
- **It told us late.** Write the date of the breach and the date of its message in the record. That is our reason
  under "Late because", and its contract with us says how fast it had to tell us.
- **The payment company.** Card numbers are its own data, not ours, and a breach of them is its to report. Record it
  here only if our users' data that we gave it was touched.
- **Who they are.** The Register at dezbatere.ro/providers names each provider and how to reach it about personal
  data.

## 8. Close the record, and keep the register

**Close it** when the harm is stopped, everyone who had to be told has been told, and the lasting fix is in:

```sh
pnpm breach:register close --id BR-2026-001
```

The tool refuses while anything is missing, and names it. When it closes the record it writes the date until which the
record must be kept.

**What each part of the record is for.** The headings are fixed, because each one answers a law:

| In the record | The law that asks for it |
|---|---|
| "Aware", "Happened" | Quebec's register must hold the date or period of the incident and the date we became aware; Canada's record, the date or estimated date |
| "How we found out", "What happened" | GDPR Art. 33(5): "the facts relating to the personal data breach"; its causes and what took place (Guidelines 9/2022, paragraph 123) |
| "The personal data involved" | the same; Quebec: a description of the personal information covered; Canada: the nature of the information |
| "Who is affected", and the numbers | Quebec: the number of persons concerned, or an estimate; ANSPDCP's form asks for it |
| "What may happen to them" | GDPR Art. 33(5): "its effects" |
| "Why we rated the risk this way", and each `not required:` reason | the reasons for each decision, above all a decision not to notify (Guidelines 9/2022, paragraph 125); Quebec: what led us to conclude that there is, or is not, a risk of serious injury; Canada: enough for the Commissioner to check that we assessed the risk |
| "What we did to stop it and limit the harm", "What we changed so it does not happen again" | GDPR Art. 33(5): "the remedial action taken"; Quebec: the measures taken to reduce the risk |
| "Who we told", with the times | Quebec: the dates of the notices to the Commission and to the people; the proof that people were told (Guidelines 9/2022, paragraph 127) |
| "Late because" | GDPR Art. 33(1): a late notification comes with the reasons for the delay |

**No personal data in a record.** Write kinds and numbers, never names, email addresses or the leaked text. Then the
record itself holds nothing that has to be deleted on a schedule (Guidelines 9/2022, paragraph 124).

**Where the register lives.** In a folder with the company's papers, on your Mac, with a backup that is not on the
server. Never on the server: a breach of the server must not reach the register, and the server being down must not
hide it. Never in this repository: it is public, and the tool refuses a folder inside any Git repository.

**How long.** Keep every closed record at least **5 years** from the day it was closed. That covers the longest duties
we have: Quebec's five years, the five years Florida and New York ask for a written decision not to notify, and
Canada's 24 months. The GDPR names no period, and an authority can ask at any time.
The tool writes the date on the line "Keep until". There is no need to delete a record after that date.

**If an authority asks to see the register**, the folder is the answer: each `record.md` reads as a page, and the
papers beside it are the proof.

## 9. Before anything happens: prepare now

Do these once. Each one is something that cannot be done in the 72 hours.

1. **Make the register's folder**, and name it once for the tool. On your Mac, with the folder you chose:

   ```sh
   mkdir -p "$HOME/Documents/DMS-company-papers/breach-register"
   echo 'export BREACH_REGISTER_DIR="$HOME/Documents/DMS-company-papers/breach-register"' >> "$HOME/.zshrc"
   ```

   Make sure the folder is in your backup, and that the backup is not on the server.
2. **Get an electronic signature** for the director (a qualified one, from a Romanian provider). ANSPDCP's email
   route needs it (part 5).
3. **Make sure a provider's warning reaches you on a weekend.** The 72 hours include Saturdays, Sundays and
   holidays (Regulation 1182/71, Art. 3(3)). The address each provider has for security notices should be one you
   read every day.
4. **Practice once a year.** Pick a story from part 0 and walk through parts 1 to 8 with a practice record:

   ```sh
   pnpm breach:register open --practice --aware "2026-11-22 14:05" --title "practice: a backup copy was left open"
   ```

   It is numbered `DRILL-…`, apart from the real records. Close it like a real one. The first practice is also the
   test that this runbook works: write down what was unclear, and fix it here.
5. **Know who translates within a day.** The notice to the people goes out in the language each person uses with us,
   as one text file per language (part 6.1); an account whose language has no text gets no mail unless you allow the
   English one.
   The report for Japan is written in Japanese, for South Korea in Korean, for Quebec in French, for Romania in
   Romanian. Decide now who writes them.
6. **Look at each authority's form once**, so the day of a breach is not the first time: ANSPDCP's, and the ones
   `pnpm breach:register clocks` prints. Two could not be checked from here: whether Singapore's form works without a
   Singapore company number, and whether Korea's lets a company abroad sign in (`breach-clocks.md` part 6).

## 10. What is not built yet

Each of these makes a real breach slower to handle. None is needed to keep the register.

- **No notice can be shown in the account after sign-in.** `pnpm breach:notify` writes by email only (part 6). New
  York does not accept an email as the notice when an email address was taken together with its password, and an email
  is the wrong way when the mailbox itself may be in someone else's hands.
- **No step ends every account's sign-ins at once, or makes every account choose a new password.** Each person can
  do it for their own account; we cannot do it for all.
- **Sign-up does not ask Canadians for their province**, so Quebec residents cannot be told apart (part 3.2).
- **Sign-up does not ask whether legal notices may come by email**, which New York wants before it accepts an email
  as the notice (part 6).
- **There is no log of who read a backup** (privacy policy, section 9). If a backup may have been reached, assume it
  was.
- **This runbook has not been reviewed by a lawyer**, and the rows marked "[unverified]" in `breach-clocks.md` have
  not been read in the law's own text.
