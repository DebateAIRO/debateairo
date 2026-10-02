/**
 * What a crisis phrase says about the person writing it:
 * - `intent`: they are thinking about ending their life ("I want to die", "I'm going to kill myself").
 * - `self-harm`: they are hurting, or want to hurt, themselves ("I cut myself").
 * - `decision`: they ask others to weigh their own death ("Should I kill myself?", "Is my life worth living?").
 * - `method`: they ask how ("painless way to die", "how many pills to overdose").
 * - `other-person`: someone they know is at risk ("my friend wants to kill himself").
 */
export type CrisisSignal = "intent" | "self-harm" | "decision" | "method" | "other-person";

/**
 * One language's phrases. A pattern is a regular-expression source written in plain lower-case
 * spelling; it is normalised exactly as questions are (see `normalizeForCrisisCheck`), so
 * accents may be written or left out. Allowed syntax: literals, `\b` (a Unicode word edge),
 * `\s`, `.`, `{m,n}`, `?`, `*`, `+`, `|`, `(?:…)` and `[…]`. No upper-case escapes (`\S`,
 * `\W`, `\p{…}`): normalisation lower-cases the source. Scripts without spaces (Chinese,
 * Japanese) do not use `\b`.
 *
 * The bar: a phrase belongs here when a person typing it as a debate question is, more likely
 * than not, in crisis or asking for a way to die. A question ABOUT suicide as a subject of
 * law, medicine, policy or history does not belong here.
 */
/**
 * `accents: "keep"` matches the question with its accents kept (only case, compatibility forms,
 * apostrophes and space folded). For languages where an accent is the whole difference: in
 * Vietnamese "tự tử" (suicide) and "từ từ" (slowly) fold to the same letters.
 */
export type CrisisPattern = Readonly<{ signal: CrisisSignal; pattern: string; accents?: "keep" }>;

export type CrisisLexicon = Readonly<{
  language: string;
  patterns: readonly CrisisPattern[];
}>;
