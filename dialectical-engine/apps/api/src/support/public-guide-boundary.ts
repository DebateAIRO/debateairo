import type { SupportLanguage } from "./templates.js";

export type PublicGuideBoundary =
  | Readonly<{ kind: "PUBLIC_GUIDE" }>
  | Readonly<{ kind: "PRIVATE_RECORD_REQUEST"; language: SupportLanguage }>;

const RECORD_NOUN = /\b(?:account|debates?|runs?|records?|history|messages?|cases?|sessions?|devices?|cont(?:ul|ului)?|dezbat(?:ere|erea|erile|erilor)?|rulari|inregistrar(?:i|ile)|istoric|mesaje|cazuri|sesiun(?:i|ile)?|dispozitiv(?:e|ele)?)\b/u;
const PERSONAL = /\b(?:my|mine|our|account|actual|active|current|latest|mea|meu|mele|nostru|noastra|contul|activ(?:a|e)?|actual(?:a|e)?|curent(?:a|e)?|ultim(?:a|e)?)\b/u;
const READ_OPERATION = /\b(?:list|show|retrieve|inspect|summari[sz]e|report|read|check|what(?:'s| is)|listeaz(?:a)?|arat(?:a)?|recupereaz(?:a)?|inspecteaz(?:a)?|rezum(?:a|ati)?|raporteaz(?:a)?|citeste|verific(?:a)?|care este)\b/u;
const LOCATION = /\b(?:where|find|go|open|page|menu|tab|button|navigate|unde|g[ăa]sesc|merg|deschid|pagin(?:a|ă)?|meniu|fila|buton|navig)/u;
const ACCOUNT_LOCATION_TARGET = /(?:\b(?:active |other |account )?sessions?\b|\bsesiun\p{L}*\b|\baccount\b.{0,40}\b(?:deletion|removal|erasure|delete|remove|erase)\b|\b(?:deletion|removal|erasure|delete|remove|erase)\b.{0,40}\baccount\b|(?<!\p{L})(?:șterg|sterg|ștearg|stearg|elimin)\p{L}*(?!\p{L}).{0,40}\bcont\p{L}*\b)/u;
const ACCOUNT_OPERATION = /(?:\b(?:sign|log)[ -]?out\b|\b(?:delete|erase|remove)\b.{0,48}\baccount\b|\bdeconect\p{L}*\b|(?<!\p{L})(?:șterg|sterg|ștearg|stearg|elimin)\p{L}*(?!\p{L}).{0,48}\bcont\p{L}*\b)/u;
const SUPPORT_ACTOR = /\b(?:support(?: agent)?|assistant|asistența|asistenta|asistent(?:a|ul)?|agent(?:ul)? de suport)\b/u;
const DIRECT_SUPPORT_ACTOR = /\b(?:(?:can|could|would|will) you|poți|poti|puteți|puteti)\b/u;
const EXPLANATION_PREDICATE = /\b(?:describe|explain|show|tell|descri\p{L}*|explic\p{L}*|arat\p{L}*|spun\p{L}*)\b/u;
const NEGATION = /\b(?:do not|don't|never|cannot|can't|must not|should not|without|nu|niciodat[ăa]|f[ăa]r[ăa])\b/u;
const CLAUSE_BOUNDARY = /[.!?;]+|,\s*|\b(?:and|then|but|plus|iar|apoi|dar|și|si)\b/u;
const ACTOR_RELATION_BOUNDARY = /[.!?;]+|\b(?:and|then|but|plus|iar|apoi|dar|și|si)\b/gu;

function normalizeBoundaryText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu,"").toLowerCase();
}

function accountOperations(text: string): readonly RegExpMatchArray[] {
  return Object.freeze([
    ...text.matchAll(new RegExp(ACCOUNT_OPERATION.source,"gu"))
  ]);
}

function operationIsAffirmative(text: string,operation: RegExpMatchArray): boolean {
  const index = operation.index ?? 0;
  const prefix = text.slice(Math.max(0,index - 64),index);
  return !NEGATION.test(prefix);
}

function hasAffirmativeAccountOperation(clause: string): boolean {
  return accountOperations(clause).some((operation) =>
    operationIsAffirmative(clause,operation));
}

function hasAffirmativeSupportAccountOperation(clause: string): boolean {
  return accountOperations(clause).some((operation) => {
    if (!operationIsAffirmative(clause,operation)) return false;
    const operationIndex = operation.index ?? 0;
    const before = clause.slice(0,operationIndex);
    const after = clause.slice(operationIndex + operation[0].length);
    const precedingBoundaries = [...before.matchAll(ACTOR_RELATION_BOUNDARY)];
    const start = precedingBoundaries.length === 0 ? 0
      : (precedingBoundaries.at(-1)?.index ?? -1)
        + (precedingBoundaries.at(-1)?.[0].length ?? 0);
    const followingBoundary = new RegExp(ACTOR_RELATION_BOUNDARY.source,"u").exec(after);
    const end = followingBoundary?.index ?? after.length;
    const prefix = before.slice(start);
    const suffix = after.slice(0,end);
    const actorPattern = new RegExp(
      `(?:${SUPPORT_ACTOR.source}|${DIRECT_SUPPORT_ACTOR.source})`,"gu"
    );
    const actorsBefore = [...prefix.matchAll(actorPattern)];
    const nearestActor = actorsBefore.at(-1);
    if (nearestActor !== undefined) {
      const governedPredicate = prefix.slice(
        (nearestActor.index ?? 0) + nearestActor[0].length
      );
      if (!EXPLANATION_PREDICATE.test(governedPredicate)) return true;
    }
    return SUPPORT_ACTOR.test(suffix);
  });
}

/**
 * Public account-menu guidance may name a sensitive setting without asking
 * Support to read private records or perform the account operation. Mixed
 * clauses remain operational unless every operation is negated or belongs to
 * the clause that asks where the user can find the control.
 */
export function isPreparedPublicAccountLocationGuide(views: readonly string[]): boolean {
  return views.some((text) => LOCATION.test(text) && ACCOUNT_LOCATION_TARGET.test(text)
    && !hasAffirmativeSupportAccountOperation(text)
    && text.split(CLAUSE_BOUNDARY).every((clause) =>
      !hasAffirmativeAccountOperation(clause)
        || LOCATION.test(clause)
    ));
}

export function isPublicAccountLocationGuide(text: string): boolean {
  return isPreparedPublicAccountLocationGuide([normalizeBoundaryText(text)]);
}

export function classifyPublicGuideBoundary(
  text: string,
  language: SupportLanguage
): PublicGuideBoundary {
  const normalized = normalizeBoundaryText(text);
  const asksForPrivateRecord = RECORD_NOUN.test(normalized)
    && PERSONAL.test(normalized)
    && READ_OPERATION.test(normalized)
    && !LOCATION.test(normalized);
  return asksForPrivateRecord
    ? Object.freeze({ kind: "PRIVATE_RECORD_REQUEST" as const,language })
    : Object.freeze({ kind: "PUBLIC_GUIDE" as const });
}

export function privateRecordRefusal(language: SupportLanguage): string {
  return language === "ro"
    ? "Pot explica unde se află funcțiile publice și cum se folosesc, dar nu pot accesa, lista sau rezuma datele ori starea contului tău."
    : "I can explain where public product features are and how to use them, but I cannot access, list, or summarize your account records or current state.";
}
