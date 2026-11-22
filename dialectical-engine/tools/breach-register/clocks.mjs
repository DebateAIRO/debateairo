// Who we tell about a personal data breach, and how fast: one entry per region the site is open in.
//
// The sentences and their sources are in docs/legal-research/assessments/breach-clocks.md; this file is the same table
// in a form a program can count with. tests/unit/breach-register.test.ts holds the two together: every region here is a
// row there, and every country the country policy lets sign up (packages/register/src/country-policy.ts) is covered by
// exactly one region here. So a country cannot be opened without someone deciding its breach clock.
//
// A time limit is one of:
//   { kind: "hours", amount: 72 }  a number the law fixes, counted from the moment we became aware;
//   { kind: "days", amount: 30 }   the same in days. The tool counts amount x 24 hours from that moment, which is never
//                                  later than the law's own count of calendar days;
//   { kind: "soon" }               the law gives words, not a number ("as soon as feasible"). The tool then shows our
//                                  own working target, WORKING_TARGET_HOURS.
// Where the law starts its clock later than awareness (Singapore counts from the day we judge the breach notifiable),
// the tool still counts from awareness: earlier, never later.

import { DAY_MS, HOUR_MS } from "./time.mjs";

/** The runbook's one working rule: everyone who must be told is told within this many hours of awareness. */
export const WORKING_TARGET_HOURS = 72;

/**
 * How long a closed record is kept, at the least. The longest duty among our regions is Quebec's five years (counted
 * from the day we became aware, so five years from closing is longer); Canada asks 24 months; the GDPR names no period.
 */
export const RECORD_KEEP_YEARS = 5;

const EEA = Object.freeze(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT",
  "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "NO", "IS"]);

const hours = (amount, words) => Object.freeze({ kind: "hours", amount, words });
const days = (amount, words) => Object.freeze({ kind: "days", amount, words });
const soon = (words) => Object.freeze({ kind: "soon", words });

export const BREACH_CLOCKS = Object.freeze([
  {
    id: "EEA",
    name: "European Union and EEA",
    countries: EEA,
    authority: {
      name: "ANSPDCP (Romania)",
      trigger: "the breach is not unlikely to put people at risk",
      deadline: hours(72, "72 hours from becoming aware"),
      how: "ANSPDCP's online form, in Romanian: https://www.dataprotection.ro/?page=pagina_formular_679 (\"Depunere notificare online\"); the other way is the form of Decision 128/2018, signed electronically, to brese@dataprotection.ro"
    },
    people: { trigger: "the risk to them is high", deadline: soon("without undue delay") },
    record: "every breach, also one we tell nobody about: the facts, its effects and what we did",
    source: "GDPR Art. 33-34"
  },
  {
    id: "MD",
    name: "Moldova",
    countries: ["MD"],
    authority: {
      name: "CNPDCP",
      trigger: "the breach is not unlikely to put people at risk",
      deadline: hours(72, "72 hours from becoming aware"),
      how: "CNPDCP, https://datepersonale.md"
    },
    people: { trigger: "the risk to them is high", deadline: soon("without undue delay") },
    record: "every breach, as in the EU",
    source: "Law No. 195/2024 Art. 33-34"
  },
  {
    id: "US",
    name: "United States (each state's own law)",
    countries: ["US"],
    authority: {
      name: "the state Attorneys General",
      trigger: "the people in that state must be told, and their number reaches the state's own: any number in New York and Massachusetts, 250 in Texas, 500 in California, Florida, Washington, Illinois and Colorado (breach-clocks.md has the other states)",
      deadline: days(30, "30 days from discovering the breach, the shortest limit among the states; California's Attorney General within 15 days of telling the people"),
      how: "each Attorney General's own web form; breach-clocks.md part 2 lists them"
    },
    people: {
      trigger: "an email address or user name was taken together with its password (to be safe, also its hash) in California, New York, Florida, Washington, Illinois, Colorado and about fifteen more states; or health details together with something that identifies the person (in Texas and New York an email address is enough; elsewhere a name). Not when the data was encrypted and the keys are safe",
      deadline: days(30, "30 days from discovering the breach in California, New York and Washington, the shortest limits; 45 or 60 days or no number elsewhere")
    },
    record: "Florida and New York: a written decision not to notify is kept 5 years",
    source: "Cal. Civ. Code 1798.82; N.Y. Gen. Bus. Law 899-aa; Fla. Stat. 501.171; RCW 19.255.010; Tex. Bus. & Com. Code 521.053; 815 ILCS 530; Mass. G.L. c. 93H; C.R.S. 6-1-716"
  },
  {
    id: "CA",
    name: "Canada (federal law, and Alberta)",
    countries: ["CA"],
    authority: {
      name: "the Privacy Commissioner of Canada (OPC)",
      trigger: "it is reasonable to believe the breach creates a real risk of significant harm to a person; humiliation and damage to reputation or relationships count as harm, and one person is enough. When people in Alberta may be among them, the same goes to Alberta's Commissioner",
      deadline: soon("as soon as feasible after we determine that the breach occurred"),
      how: "the OPC's secure form: https://services.priv.gc.ca/atteinte-breach-lprpde-pipeda/en/register (or its PDF form, https://www.priv.gc.ca/media/4844/pipeda_pb_form_e.pdf)"
    },
    people: { trigger: "the OPC must be told (the same test); also any organisation that could reduce the harm", deadline: soon("as soon as feasible") },
    record: "every breach, also one we tell nobody about, with enough to show how we judged the risk; kept 24 months",
    source: "PIPEDA s. 10.1 to 10.3; Breach of Security Safeguards Regulations (SOR/2018-64); Alberta PIPA s. 34.1"
  },
  {
    id: "CA-QC",
    name: "Quebec",
    countries: ["CA"],
    authority: {
      name: "the Commission d'accès à l'information (CAI)",
      trigger: "the incident presents a risk of serious injury, judged by how sensitive the data is, what its use could lead to, and how likely harmful use is",
      deadline: soon("promptly (\"avec diligence\")"),
      how: "the CAI's form: https://formulaire.cai.gouv.qc.ca/ (or its PDF form, https://www.cai.gouv.qc.ca/uploads/pdfs/CAI_FO_Incident_Conf.pdf, by email)"
    },
    people: { trigger: "the CAI must be told (the same test)", deadline: soon("with diligence") },
    record: "a register of every incident with eight named items, kept at least 5 years from the day we became aware",
    source: "Act respecting the protection of personal information in the private sector (CQLR c. P-39.1) s. 3.5 to 3.8; Regulation respecting confidentiality incidents (c. A-2.1, r. 3.1)"
  },
  {
    id: "AU",
    name: "Australia",
    countries: ["AU"],
    authority: {
      name: "the OAIC",
      trigger: "the law binds us, which today it most likely does not: a business with a yearly turnover of AUD 3 million or less is outside it (Privacy Act s 6D). If it ever binds us: serious harm to a person is likely",
      deadline: soon("as soon as practicable, after an assessment of at most 30 days"),
      how: "the OAIC's online form: https://webform.oaic.gov.au/prod?entitytype=DBN&layoutcode=DataBreachWF"
    },
    people: { trigger: "the risk to them is high (our own promise in the privacy policy, section 9; the Australian law most likely does not bind us)", deadline: soon("as soon as practicable") },
    record: "no register is asked for by law; the OAIC recommends one",
    source: "Privacy Act 1988 (Cth) s 6C, 6D, 26WE to 26WL"
  },
  {
    id: "NZ",
    name: "New Zealand",
    countries: ["NZ"],
    authority: {
      name: "the Privacy Commissioner",
      trigger: "it is reasonable to believe the breach has caused serious harm to a person or is likely to; losing access to the data counts as a breach too",
      deadline: soon("as soon as practicable; the Commissioner expects it within 72 hours"),
      how: "NotifyUs: https://www.privacy.org.nz/responsibilities/privacy-breaches/notify-us/report-a-breach/"
    },
    people: { trigger: "the Commissioner must be told (the same test)", deadline: soon("as soon as practicable") },
    record: "no register is asked for by law; our written reasons for not notifying are the only defence the law gives",
    source: "Privacy Act 2020 s 112 to 118"
  },
  {
    id: "SG",
    name: "Singapore",
    countries: ["SG"],
    authority: {
      name: "the PDPC",
      trigger: "sign-in data was reached (an account's name with its password, password hash or authenticator secret), or a person's name with data on the law's list (a debt owed, certain health and abuse matters), or 500 or more people are affected in all, whatever the harm",
      deadline: days(3, "3 calendar days after the day we judge the breach notifiable"),
      how: "the PDPC's form: https://eservice.pdpc.gov.sg/case/db ; for an urgent, large case also +65 6377 3131 in Singapore working hours"
    },
    people: {
      trigger: "the PDPC must be told because of harm, not only because of the number. Not when the data was encrypted well enough to make harm unlikely, or what we did afterwards makes it unlikely (the PDPC is told all the same, with the reason)",
      deadline: soon("on or after telling the PDPC, as soon as practicable")
    },
    record: "no register is asked for by law; the PDPC says every step of the assessment must be written down",
    source: "PDPA 2012 s 26A to 26D; Notification of Data Breaches Regulations 2021"
  },
  {
    id: "JP",
    name: "Japan",
    countries: ["JP"],
    authority: {
      name: "the Personal Information Protection Commission (PPC)",
      trigger: "the breach, or a suspected one, comes from a deliberate act (a break-in, theft, an insider), also at a provider; or it touches debate text, health or beliefs; or more than 1,000 people. Not when the data was strongly encrypted and the keys are safe",
      deadline: soon("promptly; the PPC's own measure is about 3 to 5 days"),
      how: "the PPC's web form, in Japanese: https://roueihoukoku.ppc.go.jp/incident/?top=r2.kojindata (\"新規報告\" for the first report, \"続報\" for the final one)"
    },
    people: { trigger: "the PPC must be told (the same cases)", deadline: soon("promptly, as the situation allows") },
    // The law counts the day we became aware as day 1, so the 30th day ends 29 x 24 hours after that moment at the latest.
    finalReport: { deadline: days(29, "the 30th day, counting the day we became aware as day 1 (the 60th day when the breach came from a deliberate act)") },
    record: "no register is asked for by law; the PPC will ask for what the final report holds",
    source: "APPI Art. 26; Enforcement Rules Art. 7-10"
  },
  {
    id: "KR",
    name: "South Korea",
    countries: ["KR"],
    authority: {
      name: "the Personal Information Protection Commission (PIPC) or KISA",
      trigger: "1,000 or more people are affected, or sensitive data is (debate text can hold it), or the breach came from a break-in from outside. Not when the way out is known and the data was recovered or deleted, so that harm is very unlikely (keep the proof)",
      deadline: hours(72, "72 hours from becoming aware"),
      how: "https://brss.pipc.go.kr, in Korean; a business abroad that cannot pass its phone check sends the report form to brss@korea.kr (https://www.privacy.go.kr/front/wcp/spl/splRptInfo.do has the form)"
    },
    people: {
      trigger: "their data was lost, stolen, leaked, changed or damaged: one person is enough, and encryption or hashing is no exception. Also when a break-in may have leaked data and we cannot yet tell whose",
      deadline: hours(72, "72 hours from becoming aware")
    },
    record: "no register is asked for by law; keep the notices and the proof that they were sent",
    source: "PIPA Art. 34; Enforcement Decree Art. 39 to 40"
  }
].map((clock) => Object.freeze({ ...clock, countries: Object.freeze([...clock.countries]) })));

/** The moment a time limit ends, or null when the law gives only words. */
export function deadlineMoment(awareAt, deadline) {
  if (deadline.kind === "hours") return new Date(awareAt.getTime() + deadline.amount * HOUR_MS);
  if (deadline.kind === "days") return new Date(awareAt.getTime() + deadline.amount * DAY_MS);
  return null;
}
