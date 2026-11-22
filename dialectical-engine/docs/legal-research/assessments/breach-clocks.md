# Breach clocks: who we tell, and how fast

Date: 22 November 2026 (first written 1 October 2026 for five countries; rewritten for every region the site is open
in). Not reviewed by counsel. Each rule was read in the law's own text on that date unless a point is marked
[unverified]; part 6 lists those points.

This is the table behind the breach runbook (`docs/operations/breach-runbook.md`). The same rows, in a form a program
can count with, are in `tools/breach-register/clocks.mjs`; `tests/unit/breach-register.test.ts` fails when the two
differ, and when the country policy lets a country sign up that no row here covers.

**One working rule covers every row: decide within 48 hours, and tell everyone we must within 72 hours of becoming
aware.** The strictest limits below are 72 hours (the EU, Moldova, South Korea). Singapore's 3 days and Japan's "about
3 to 5 days" start no earlier.

## 1. The regions we are open in

"Aware" is the moment we are reasonably sure that a security failure touched personal data. A provider telling us
counts as us being aware.

| Region | Tell | When the duty is reached | How fast | Source |
|---|---|---|---|---|
| `EEA` European Union and EEA (our authority: Romania) | ANSPDCP | unless the breach is unlikely to put people at risk | 72 hours from becoming aware; a later notification comes with the reasons for the delay. Weekends and holidays count | GDPR Art. 33; Regulation 1182/71 Art. 3(3) |
| | the people affected | the breach is likely to put them at high risk. Not when the data was unreadable to the taker, or what we did afterwards removed the high risk; a public notice instead when writing to each person would take an effort out of proportion | without undue delay | GDPR Art. 34 |
| `MD` Moldova | CNPDCP | as in the EU | 72 hours from becoming aware | Law No. 195/2024 Art. 33 |
| | the people affected | as in the EU | without undue delay | Law No. 195/2024 Art. 34 [unverified] |
| `AU` Australia | the OAIC | **Most likely never.** A business with a yearly turnover of AUD 3 million or less is a "small business operator" and outside the Act. If the Act ever binds us: a reasonable person would conclude that serious harm to a person is likely | then: an assessment of at most 30 days, and the statement as soon as practicable | Privacy Act 1988 (Cth) s 6C(1), 6D, 26WE, 26WH, 26WK |
| | the people affected | not by Australian law. By our own promise (privacy policy, section 9): when the risk to them is high | as soon as practicable | s 26WL, if the Act ever binds us |
| `NZ` New Zealand | the Privacy Commissioner | it is reasonable to believe the breach has caused serious harm to a person, or is likely to. Losing access to the data, even for a time, is a breach too | as soon as practicable; the Commissioner expects it within 72 hours of knowing the breach is notifiable. Telling the Commissioner may never be put off | Privacy Act 2020 s 112 to 114; the 72 hours are guidance |
| | the people affected | the same test. A public notice when writing to each is not reasonably practicable | as soon as practicable; later only while telling them would itself put the data at risk | s 115, 116 |
| `SG` Singapore | the PDPC | (a) significant harm, which the law takes as given when the breach reaches an account's name together with its password or other sign-in data, or a person's name together with data on the law's list (a debt owed; certain health, abuse and family matters); or (b) 500 or more people are affected, whatever the harm | 3 days: no later than 3 calendar days after the day we judge the breach notifiable. The judging itself must be quick; the PDPC expects it within 30 days | PDPA 2012 s 26B to 26D; Notification of Data Breaches Regulations 2021 reg 3, 4 and Schedule |
| | the people affected | case (a) only. Not when the data was encrypted well enough to make harm unlikely, or when what we did afterwards makes harm unlikely; the PDPC is told all the same, with the reason | on or after telling the PDPC, as soon as practicable | s 26D(2), (5) |
| `JP` Japan | the Personal Information Protection Commission (PPC) | one of four cases, and a **suspected** breach counts: (1) data about beliefs, health or the like; (2) data that could be used to take someone's money; (3) a deliberate act, such as a break-in, theft or an insider, also at a provider of ours, with no smallest number; (4) more than 1,000 people. Not when the data was strongly encrypted and the keys are safe | a first report promptly, by the PPC's measure within about 3 to 5 days. Then the final report: by the 30th day, counting the day we became aware as day 1, or by the 60th day in case (3). The tool counts 29 days of 24 hours from the moment we became aware, which is never later than the 30th day | APPI Art. 26(1); Enforcement Rules Art. 7, 8 |
| | the people affected | the same four cases. A public notice when they cannot be reached | promptly, as the situation allows | APPI Art. 26(2); Enforcement Rules Art. 10 |
| `KR` South Korea | the Personal Information Protection Commission (PIPC), or KISA | 1,000 or more people; or sensitive data (beliefs, political opinions, health, sex life); or the breach came from a break-in from outside. Not when the way the data left is known and the data was recovered or deleted, so that harm is very unlikely | 72 hours from becoming aware | PIPA Art. 34(4); Enforcement Decree Art. 40 |
| | the people affected | **every breach, from one person up**: loss, theft, leak, forgery, change or damage. Encryption and hashing are no exception. Since 11 September 2026 also a **possible** leak: a break-in with signs of a leak when we cannot yet tell whose data it is | 72 hours from becoming aware; later only while urgent steps to stop the leak are still being taken | PIPA Art. 34(1), (2); Enforcement Decree Art. 39 to 39-3 |
| `US` United States: each state's own law; there is no federal one | the people affected, in each state | That state's definition of personal information is met, for data that was not encrypted (or whose key was taken too). Two parts of the definitions can be met by what we hold. (1) An email address or user name together with a password, or a security answer, that gives access to an online account: California, New York, Florida, Washington, Illinois, Colorado, and by the charts about fifteen more states; not Texas, not Massachusetts. No law read says whether a password's hash counts: we act as if it does. (2) Health details: in Texas and New York together with anything that identifies the person, an email address included; elsewhere together with a name, which with us only a billing record holds. Politics, religion and sex life are in no state's definition. California, Illinois and Texas have no "no harm, no notice" exception; Florida, Washington and Colorado have one | 30 days from discovering the breach in California, New York and Washington; 30 days from determining it in Florida and Colorado; the 60th day in Texas; no number in Illinois and Massachusetts. By the charts: 30 days in Maine, 45 days in eleven states, 60 in four more | Cal. Civ. Code § 1798.82; N.Y. Gen. Bus. Law § 899-aa; Fla. Stat. § 501.171; RCW 19.255.005, .010; Tex. Bus. & Com. Code § 521.002, .053; 815 ILCS 530/5, /10; Mass. G.L. c. 93H § 1, 3; C.R.S. § 6-1-716 |
| | the state's Attorney General (in some states another office too) | The people there must be told, and their number reaches the state's own: **any number** in New York (the Attorney General, the Department of State and the State Police) and Massachusetts; 250 in Texas; more than 500 in California, Washington and Illinois; 500 in Florida and Colorado. By the charts: any number in about ten more states, among them Maryland and New Jersey, which want to hear **before** the people do, and Vermont, within 14 business days | California: within 15 days of telling the people. Texas, Florida, Washington, Colorado: within 30 days. New York: without delaying the notice to the people. Illinois: no later than the notice to the people | the same sections |
| | the credit reporting agencies | more than 1,000 people told at once in Florida or Colorado; more than 5,000 in New York; more than 10,000 in Texas. By the charts, more than 1,000 in most other states | without unreasonable delay | the same sections |
| `CA` Canada: federal law, and Alberta | the Privacy Commissioner of Canada (OPC) | it is reasonable to believe that the breach creates a **real risk of significant harm** to a person. Harm includes humiliation and damage to reputation or relationships, not only money. One person is enough. Judged by how sensitive the data is and how likely its misuse | "as soon as feasible" after we determine that the breach occurred; no number | PIPEDA s. 10.1(1), (7), (8) |
| | the people affected; and any organisation that could reduce the harm | the same test | "as soon as feasible" | PIPEDA s. 10.1(3), 10.2 |
| | Alberta's Information and Privacy Commissioner, when people in Alberta are among those affected | a reasonable person would see a real risk of significant harm. The people in Alberta are told when that Commissioner says so | "without unreasonable delay" | Alberta PIPA s. 34.1, 37.1. British Columbia's Act has no such duty |
| `CA-QC` Quebec | the Commission d'accès à l'information (CAI) | the incident presents a **risk of serious injury**, judged by how sensitive the data is, what its use could lead to, and how likely harmful use is | "promptly" ("avec diligence"); no number | Act respecting the protection of personal information in the private sector (CQLR c. P-39.1) s. 3.5, 3.7 |
| | the people concerned | the same test. A public notice only when writing to them would add to the harm, would be an undue hardship, or we have no way to reach them | with diligence | s. 3.5; Regulation respecting confidentiality incidents (c. A-2.1, r. 3.1) s. 5, 6 |

**Canada: we cannot tell the provinces apart.** Sign-up asks for the country, not the province; only a billing
address names one. So when Canadian accounts are affected and the test is met, the notice goes to the OPC **and** to
the CAI, and to Alberta's Commissioner unless we know that nobody in Alberta is affected. The regulators' shared
position is that the federal and the provincial laws both reach a company abroad that collects data from people
there (PIPEDA Findings #2021-001); the Federal Court applied PIPEDA to a website run from Romania (*A.T. v.
Globe24h.com*, 2017 FC 114).

**United States: which states.** The count by state comes from the runbook's BREACHCOUNT step. Tennessee and
Mississippi are closed by the Terms. Eight states' laws were read in their own text (California, New York, Texas,
Florida, Washington, Illinois, Massachusetts, Colorado); every other state is taken from two charts dated January 2026
(part 6), so for a state outside the eight, read its law on the day.

## 2. How each authority is reached

| Region | Where | Language | Notes |
|---|---|---|---|
| `EEA` | The online form: <https://www.dataprotection.ro/?page=pagina_formular_679>, "Depunere notificare online". The other way: the form of ANSPDCP's Decision No. 128/2018, signed electronically, to brese@dataprotection.ro | Romanian | The Decision says an unsigned form is not considered. Whether the online form alone is enough without a signature is [unverified]. Attachments: 15 MB in all, no diacritics in file names |
| `MD` | CNPDCP, <https://datepersonale.md>; general address centru@datepersonale.md. A standard form was approved by an order of the Center in 2026 | Romanian | The channel for a breach notification is not on the Center's breach page [unverified]. Write to the general address and ask |
| `US` | Each Attorney General's own web form. Confirmed: New York, <https://ag.ny.gov/resources/organizations/data-breach-reporting>; Colorado, <https://coag.gov/data-breach-notification-report-form/>. The pages for California, Texas, Washington, Florida, Illinois and Massachusetts could not be opened [unverified]: search the Attorney General's site for "data breach reporting" | English | To the people: by email where the law allows it. New York allows an electronic notice only to a person who agreed to it beforehand, with a log kept; otherwise by post, by telephone, or shown in the account after sign-in. When a password was taken, tell the person to change it here and wherever else it was used |
| `CA` | The OPC's secure form: <https://services.priv.gc.ca/atteinte-breach-lprpde-pipeda/en/register>; its PDF form: <https://www.priv.gc.ca/media/4844/pipeda_pb_form_e.pdf>. Alberta's Commissioner: <https://oipc.ab.ca> [unverified] | English or French | To the people: directly; email is allowed (SOR/2018-64 s. 4) |
| `CA-QC` | The CAI's online form: <https://formulaire.cai.gouv.qc.ca/>; its PDF form, by email, post or fax: <https://www.cai.gouv.qc.ca/uploads/pdfs/CAI_FO_Incident_Conf.pdf> | French; no English form was found [unverified] | The form says to name no person in it, and that the incident may be made public |
| `AU` | <https://webform.oaic.gov.au/prod?entitytype=DBN&layoutcode=DataBreachWF> | English | Only if the Act binds us |
| `NZ` | NotifyUs: <https://www.privacy.org.nz/responsibilities/privacy-breaches/notify-us/report-a-breach/> | English | It can be filled in without sending any personal data |
| `SG` | <https://eservice.pdpc.gov.sg/case/db>; for an urgent, large case also +65 6377 3131 in Singapore working hours | English | Whether the form works without a Singapore company number or Singpass sign-in is [unverified]; the telephone is the way named in the PDPC's own guidelines |
| `JP` | <https://roueihoukoku.ppc.go.jp/incident/?top=r2.kojindata>: "新規報告" for the first report, "続報" for the final one | Japanese | Whether a report in English is accepted is [unverified]. Plan to write it in Japanese |
| `KR` | <https://brss.pipc.go.kr>. A business abroad that cannot pass its Korean phone check sends the report form to brss@korea.kr; the form is on <https://www.privacy.go.kr/front/wcp/spl/splRptInfo.do> | Korean | The system is down for maintenance until 30 November 2026, 23:00 Korean time: until then, the form and a company registration certificate by email. Whether a report in English is accepted is [unverified] |

## 3. What each notice must hold

The record (`record.md`) holds all of it; this says what each region asks for by name.

- **`EEA`, `MD` to the authority** (GDPR Art. 33(3)): what happened, with the kinds and rough numbers of people and
  of records; who to contact; the likely consequences; what we did or propose to do. ANSPDCP's form has 17 items,
  among them the time of the breach and the time we found it, the measures in place before, the number of people,
  what the people were told and how, and whether people in other member states are affected.
- **`EEA`, `MD` to the people** (GDPR Art. 34(2)), in plain language: what happened; who to contact; the likely
  consequences; what we did and what they can do.
- **`NZ` to the Commissioner** (s 117(1)): the breach, the number of people, and who is suspected to hold the data,
  if known; what we did and will do, and whether the people were or will be told; the reasons for a public notice or
  a delay; other bodies we told; a contact person. **To the people** (s 117(2)): the breach; what we did; what they
  can do; that the Commissioner was told; **that they may complain to the Commissioner**; a contact person. Nothing
  about other affected people.
- **`SG` to the PDPC** (reg 5): when and how we first became aware; **every step since, in order, with its time**;
  how it happened; the number of people; the kinds of data; the possible harm; what we did to limit it and to mend the
  fault; the plan for telling the people; a contact person. If late, the reasons with proof. If the people are not
  told, the grounds. **To the people** (reg 6): how we became aware; which of their data; the possible harm; what we
  did; what they can do; a contact person.
- **`JP` to the PPC** (Enforcement Rules Art. 8(1)), nine items: an overview; the kinds of data; the number of people;
  the cause; further harm or the risk of it; what was done for the people; what was made public; what will stop it
  happening again; anything else useful. **To the people** (Art. 10): the overview, the kinds of data, the cause,
  further harm, and what they can do.
- **`KR` to the people and to the PIPC** (PIPA Art. 34(1)), six items: which data; when and how; what the person can
  do to limit the harm; what we did, and how harm is put right; where to report harm; and, since 11 September 2026,
  **the person's rights in law and how to use them**: damages (Art. 39), fixed damages (Art. 39-2) and dispute
  mediation (Art. 43). When the people cannot be reached: the same on our website for 30 days or more.
- **`CA` to the OPC** (SOR/2018-64 s. 2): what happened and the cause, if known; the day or period; the
  information involved; the number of people; what we did to reduce the harm; what we did or will do to tell the
  people; a contact person. **To the people** (s. 3), where they will see it: what happened; the day or period; the
  information involved; what we did; what they can do; who to contact. Alberta's Commissioner also asks for our
  assessment of the risk and for the number of people at real risk.
- **`CA-QC` to the CAI** (Regulation s. 3), eleven items: our name; a contact person; the information covered; the
  circumstances and cause; when it happened; **when we became aware**; the number of people **and how many of them
  live in Quebec**; what led us to see a risk of serious injury; how and when the people are told; the measures
  taken, with dates; and whether a privacy authority outside Quebec was told. **To the people** (s. 5): the
  information covered; the circumstances; when; what we did; what they can do; who to contact.
- **`US` to the people.** One letter in California's form serves most states (Civ. Code § 1798.82(d)): the title
  "Notice of Data Breach" and the headings "What Happened?", "What Information Was Involved?", "What We Are Doing",
  "What You Can Do", "For More Information"; with the date or period of the breach and the date of the notice, our
  name and how to reach us. Add, for New York, the telephone numbers and websites of the state and federal offices
  that advise on breaches and identity theft; for Colorado and Illinois, those of the credit reporting agencies and
  of the FTC. Do not say how many people in a state are affected (Illinois forbids it in the letter).
  Massachusetts turns the rule around: its letter may not describe the breach at all; its definition is not met by
  what we hold, so read its law before writing to anyone there.
- **`AU`**, if the Act ever binds us (s 26WK(3)): who we are; the breach; the kinds of information; what the people
  should do.

## 4. What must be recorded, and for how long

| Region | The duty | For how long |
|---|---|---|
| `EEA` | Every breach, also one we tell nobody about: the facts, the effects, what we did (GDPR Art. 33(5)); with the reasons for each decision, above all for not notifying, and for any delay (EDPB Guidelines 9/2022, paragraphs 121 to 127) | No period in the law. An authority may ask at any time |
| `MD` | The same (Law No. 195/2024 Art. 33(5)) | No period in the paragraph |
| `AU`, `NZ`, `SG`, `JP`, `KR` | No register in the law. Each authority says to keep one. In New Zealand the written reasons for judging a breach not notifiable are the only defence the law gives (s 118(3)); Singapore's PDPC says every step of the judging "must" be written down (Advisory Guidelines, paragraph 20.5) | No period |
| `US` | No register in the law. Florida: a decision that no notice is needed, after an investigation, must be written down, sent to the Department of Legal Affairs within 30 days, and kept (§ 501.171(4)(c)). New York: the same for an inadvertent disclosure by someone allowed to see the data, and a log of every notice sent by electronic means or by telephone (§ 899-aa(2)(a), (5)) | 5 years, both |
| `CA` | "A record of every breach of security safeguards", also one that is not reported, with enough for the Commissioner to check that we judged the risk: the date or estimated date, what happened, the kind of information, whether it was reported and the people told, and if not, why (PIPEDA s. 10.3; SOR/2018-64 s. 6; the OPC's guidance) | 24 months from the day we determine that the breach occurred |
| `CA-QC` | "A register of confidentiality incidents", every incident, with eight items: the personal information covered; the circumstances; when it happened; when we became aware; the number of people; what led us to conclude that there is, or is not, a risk of serious injury; the dates of the notices to the CAI and to the people, and whether a public notice was given and why; the measures taken (Act s. 3.8; Regulation s. 7, 8). A copy goes to the CAI when it asks | at least 5 years from the day we became aware |

**Our rule: every record is kept at least 5 years from the day it is closed.** That is at least as long as every
period above (Quebec counts its five years from the day we became aware, which is earlier), and a record holds no
personal data, so nothing in it has to be deleted sooner. The record's headings hold Quebec's eight items and
Canada's; the runbook's part 8 maps them.

## 5. Places we are not open in

Kept for the day one of them opens; the country policy closes all three today (Switzerland: not offered; Israel and
Taiwan: excluded by the Terms). The tool has no clock for them, and the test fails if one is added while its country
is closed.

| Country | Tell | When | Source |
|---|---|---|---|
| Switzerland | FDPIC, through its portal <https://databreach.edoeb.admin.ch/report>; the people when they need it for their protection, or the FDPIC asks | "as quickly as possible", when the breach is likely to lead to a high risk to the people concerned; no fixed hours. Document every breach and keep the record at least 2 years from the report | FADP Art. 24; DPO Art. 15(4) (Fedlex, status 1 December 2025) |
| Israel | The Privacy Protection Authority | "immediately", for a "severe security incident" in a medium- or high-level database, with the steps taken. Every security incident is documented, and the documentation kept 24 months | Protection of Privacy (Data Security) Regulations 5777-2017, reg. 1, 11, 17(a). Read on a mirror of the Hebrew text, not on gov.il [unverified]; whether the regulations reach a company in Romania was not analysed |
| Taiwan | Today: the people affected, "in an appropriate manner", once the facts are known. Not yet: the authority | The amendment promulgated 11 November 2025 adds a duty to report to the new authority and to keep a record (amended Art. 12), but its start date is still not set (Ministry of Justice database, 22 November 2026: "最後生效日期：未定") | PDPA Art. 12 (version of 31 May 2023); Enforcement Rules Art. 22 |

Revisit Taiwan when the Executive Yuan sets the amendment's start date.

## 6. What we could not confirm

- **Romania.** Whether ANSPDCP's online form is enough without an electronic signature, and whether it returns a
  registration number by itself. Whether a notification must be in Romanian (the form is).
- **Moldova.** The text of Art. 34 and the official text on legis.md (it refused every request; the Center's own
  page was read instead). The number and content of the order approving the standard form, and the channel for
  sending a notification.
- **Singapore.** Whether the PDPC's form can be used without a Singapore company number. Whether the 500 people
  count worldwide or only people in Singapore: we count everyone. Whether the Act reaches a company with no presence
  in Singapore at all is not spelled out; we assume it does. Whether an Argon2id hash counts as sign-in "data": we
  treat it as if it does.
- **Japan.** Whether a report in English is accepted. Whether debate text in which a person writes of their own
  health or beliefs is "special care-required" data: we treat it as if it is. Whether hashes count as "advanced
  encryption": we do not rely on it.
- **South Korea.** That the Act reaches a company abroad at all rests on the PIPC's guideline of April 2024, not on
  an article. Whether a report in English is accepted. Whether a break-in must also be reported, within 24 hours,
  under the Network Act (Art. 48-3) when the service has no establishment in Korea: that Act was not read. Ask a
  Korean lawyer on the day of a real break-in.
- **United States.** Every state outside the eight named in part 1 is taken from two charts, not from the law:
  Mintz, *State Data Security Breach Notification Laws*, as of 22 January 2026, and Privacy Rights Clearinghouse,
  *Data Breach Notification Laws: 50 States + DC Survey*, 2026 edition. The charts disagree on Louisiana, South Dakota
  and Oklahoma. Nothing enacted in a state after January 2026 was checked. Texas, Illinois and Massachusetts were read
  through archived copies of the official pages, Colorado in its 2018 act and its Attorney General's guidance.
  Whether an Argon2id hash is a "password", and how an authenticator secret is treated, no law or guidance read
  says. The web addresses of six Attorneys General.
- **Canada.** Quebec's Act and Regulation were read as enacted and in archived copies of the official consolidation
  (May and April 2025); a later change was not checked, though the CAI's own page says the same today. That Quebec's
  law reaches a company with no establishment there rests on the regulators' position, not on a court. Alberta's
  reporting address. Bill C-36, which would replace PIPEDA's first part, had only its first reading (15 June 2026)
  and its breach rules were not read.
- **Australia.** That the turnover limit counts worldwide turnover (the section names no territory; we are far below
  it either way).
- **The EDPB's Guidelines 01/2021.** The paragraph numbers quoted in the runbook were matched to the PDF's margin
  numbers by order; check one before quoting it to an authority.

## 7. What is coming

- **EU.** The "Digital Omnibus" proposal (procedure 2025/0360(COD)) is not adopted. It is reported to raise the
  threshold for telling the authority to "high risk" and the limit to 96 hours. Until it is law, 72 hours and "unless
  unlikely" stand. The EDPB adopted a common notification form for consultation on 8 June 2026; ANSPDCP still uses its
  own.
- **Australia.** A draft bill (consultation closed 18 September 2026) would set 72 hours for the statement to the
  OAIC. It is not law, and its consultation paper does not mention the small business exemption. **Check Australia
  again** if our turnover nears AUD 3 million, if we ever receive anything in return for personal data, or if the
  product is ever offered for a person's own health.
- **Canada.** Bill C-36 (first reading 15 June 2026) would replace PIPEDA's first part. Not law.
- **United States.** California's 30-day limit and 15-day Attorney General notice are new since 1 January 2026
  (SB 446). States change these laws every year: check the eight again each January.
- **Japan.** Act No. 56 of 2026 (promulgated 17 July 2026) changes Art. 26(2), but that part starts on a day still to
  be set, by 16 July 2028 at the latest.
- **South Korea.** Act No. 21910 starts on 9 March 2027 and does not touch Art. 34.
- **Taiwan.** See part 5.
