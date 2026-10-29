export const README_EXCLUSION_LINES = [
  "X1: Short-lived authentication challenges and enrollment state are excluded because they contain hashes or key material.",
  "X2: Outgoing-mail queues are excluded because their messages were sent and their addresses appear in account.json.",
  "X3: Authentication risk signals are excluded because disclosure would expose security detection rules.",
  "X4: Staff security and operational records are excluded because they are not consumer account data.",
  "X5: Internal key provisioning, attestations and cleanup records are excluded because their personal facts appear elsewhere.",
  "X6: Data-export bookkeeping is excluded because its events appear in activity.json and its link hash is secret.",
  "C4: Publication snapshots are excluded because the same content appears once in debates.json.",
  "C5: Internal model-run, cost, evaluation, routing and moderation records are excluded; user-facing results and each debate's model rotation record appear in debates.json; the text and time of each question kept for staff review (kept_questions) appear in account.json.",
  "C6: Legacy run claims are excluded because their runs appear in debates.json and the claim contains a token hash.",
  "D3: Account-closure records are excluded because a closed account cannot sign in to request an export.",
  "F2: Unattributed support sessions, abuse and admission events, support keys and internal tool calls are excluded."
] as const;

export function renderReadme(): string {
  return [
    "Dialectical Engine data export",
    "",
    "README.txt — this guide and the exclusion notes.",
    "manifest.json — size, SHA-256 and record count for each other entry.",
    "your-data.html — a readable, offline summary of your account and debates.",
    "account.json — account, channels, region, age checks, erasure requests, kept questions, reading level, debate visits and dig links.",
    "security.json — sign-in factors, sessions, identities and recovery history.",
    "consents.json — legal acceptances and sensitive-data consent.",
    "debates.json — owned debates, their content status, answer versions and each debate's model rotation record.",
    "billing.json — billing profile and transactions.",
    "support.json — support sessions, cases and messages.",
    "activity.json — account activity event types and times.",
    "",
    "Excluded records and why:",
    ...README_EXCLUSION_LINES,
    "",
    "Your date of birth is never stored.",
    "Cookie choices are stored only in your browser, never on our servers.",
    ""
  ].join("\n");
}
