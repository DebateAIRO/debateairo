import type { SupportLanguage } from "./templates.js";

export type PublicGuideBoundary =
  | Readonly<{ kind: "PUBLIC_GUIDE" }>
  | Readonly<{ kind: "PRIVATE_RECORD_REQUEST"; language: SupportLanguage }>;

const RECORD_NOUN = /\b(?:account|debates?|runs?|records?|history|messages?|cases?|cont(?:ul|ului)?|dezbat(?:ere|erea|erile|erilor)?|rulari|inregistrar(?:i|ile)|istoric|mesaje|cazuri)\b/u;
const PERSONAL = /\b(?:my|mine|our|account|actual|current|latest|mea|meu|mele|nostru|noastra|contul|actual(?:a|e)?|curent(?:a|e)?|ultim(?:a|e)?)\b/u;
const READ_OPERATION = /\b(?:list|show|retrieve|inspect|summari[sz]e|report|read|check|what(?:'s| is)|listeaz(?:a)?|arat(?:a)?|recupereaz(?:a)?|inspecteaz(?:a)?|rezum(?:a|ati)?|raporteaz(?:a)?|citeste|verific(?:a)?|care este)\b/u;
const LOCATION = /\b(?:where|find|go|open|page|menu|tab|button|navigate|unde|gasesc|merg|deschid|pagin(?:a)?|meniu|fila|buton|navig)/u;

export function classifyPublicGuideBoundary(
  text: string,
  language: SupportLanguage
): PublicGuideBoundary {
  const normalized = text.normalize("NFD").replace(/\p{M}+/gu,"").toLowerCase();
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
