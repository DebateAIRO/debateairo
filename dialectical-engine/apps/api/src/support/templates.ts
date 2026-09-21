export const OUTCOMES = Object.freeze([
  "ANSWER_GROUNDED", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION",
  "REFUSE_SAFETY", "DEGRADED", "DISABLED", "RATE_LIMITED", "CASE_OPENED",
  "CONSENT_NEEDED", "ANON_CONTEXT", "REFUSE_OTHER_USER", "ANSWER_OWN_STATE",
  "ANSWER_INCIDENT", "NO_INCIDENT"
] as const);
export type SupportOutcome = typeof OUTCOMES[number];

export const SUPPORT_TEMPLATE_IDS = Object.freeze([
  "DISCLOSURE", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION", "REFUSE_SAFETY",
  "DEGRADED", "DISABLED", "RATE_LIMITED", "RATING", "CASE_OPENED_MINIMAL", "CASE_OPENED",
  "HUMAN_LABEL", "NOT_FOUND", "CLOSED_LABEL", "SUMMARY_LABEL", "SOURCE_LINE",
  "INCIDENT_ACTIVE", "NO_INCIDENT", "INCIDENT_NOTICE", "QUEUED"
] as const);

export type SupportTemplateId = typeof SUPPORT_TEMPLATE_IDS[number];
export type SupportLanguage = "en" | "ro";

export const SHREDDED_NOTICE = Object.freeze({
  en: "This conversation was erased at the owner's request.",
  ro: "Această conversație a fost ștearsă la cererea proprietarului."
});

export async function readSupportContent(input: Readonly<{
  shreddedAt: Date | null;
  destroyedAt: Date | null;
  language: SupportLanguage;
  read: () => Promise<string>;
}>): Promise<
  | Readonly<{ kind: "SHREDDED"; terminal: "[SHREDDED]"; notice: string }>
  | Readonly<{ kind: "READABLE"; content: string }>
> {
  if (input.shreddedAt !== null || input.destroyedAt !== null) {
    return Object.freeze({
      kind: "SHREDDED",
      terminal: "[SHREDDED]",
      notice: SHREDDED_NOTICE[input.language]
    });
  }
  return Object.freeze({ kind: "READABLE", content: await input.read() });
}

export const SUPPORT_TEMPLATES: Readonly<Record<SupportTemplateId, Readonly<Record<SupportLanguage, string>>>> =
  Object.freeze({
    DISCLOSURE: Object.freeze({
      en: "Hi — I'm the Dialectical Engine support assistant, an AI. I can explain how the product works and point you to the right page. I can't sign you in, change your account, or reset anything. For those, use the links I give you, or ask for a person.",
      ro: "Bună — sunt asistentul de suport Dialectical Engine, o inteligență artificială. Pot explica cum funcționează produsul și te pot îndruma către pagina potrivită. Nu pot să te autentific, să îți modific contul sau să resetez ceva. Pentru acestea folosește linkurile pe care ți le dau sau cere să vorbești cu o persoană."
    }),
    NO_SOURCE: Object.freeze({
      en: "I don't have a source for that, so I won't guess. Ask me something else about how debates work, or choose 'Talk to a human'.",
      ro: "Nu am o sursă pentru asta, așa că nu voi ghici. Întreabă-mă altceva despre cum funcționează dezbaterile sau alege „Vorbește cu o persoană”."
    }),
    REFUSE_ZONE: Object.freeze({
      en: "I can't help with sign-in, passwords, verification codes, two-factor, account recovery, email changes or account deletion — not even to check them. Those live only in your account pages: {link}. If that page doesn't work for you, choose 'Talk to a human'.",
      ro: "Nu pot ajuta cu autentificarea, parolele, codurile de verificare, autentificarea în doi pași, recuperarea contului, schimbarea emailului sau ștergerea contului — nici măcar să le verific. Acestea se fac doar din paginile contului tău: {link}. Dacă pagina nu funcționează, alege „Vorbește cu o persoană”."
    }),
    REFUSE_INJECTION: Object.freeze({
      en: "I only follow the product's own instructions, so I'll skip that request. Your message has been recorded. Ask me about the product, or choose 'Talk to a human'.",
      ro: "Urmez doar instrucțiunile produsului, așa că voi sări peste această cerere. Mesajul tău a fost înregistrat. Întreabă-mă despre produs sau alege „Vorbește cu o persoană”."
    }),
    REFUSE_SAFETY: Object.freeze({
      en: "This needs a person, not an assistant. Choose 'Talk to a human' and a person will read your message.",
      ro: "Aici e nevoie de o persoană, nu de un asistent. Alege „Vorbește cu o persoană” și o persoană îți va citi mesajul."
    }),
    DEGRADED: Object.freeze({
      en: "The assistant's model is unavailable right now. You can still leave a message for a person: choose 'Talk to a human'.",
      ro: "Modelul asistentului nu este disponibil acum. Poți totuși lăsa un mesaj pentru o persoană: alege „Vorbește cu o persoană”."
    }),
    DISABLED: Object.freeze({
      en: "The support assistant is switched off at the moment.",
      ro: "Asistentul de suport este oprit momentan."
    }),
    RATE_LIMITED: Object.freeze({
      en: "You've sent a lot of messages in a short time. Please wait a few minutes.",
      ro: "Ai trimis multe mesaje într-un timp scurt. Te rugăm să aștepți câteva minute."
    }),
    RATING: Object.freeze({
      en: "Did this answer your question? Yes · No · Talk to a human",
      ro: "Ți-a răspuns la întrebare? Da · Nu · Vorbește cu o persoană"
    }),
    CASE_OPENED_MINIMAL: Object.freeze({
      en: "I've saved this conversation for a person as case {token}. Keep the code; replies will appear here once a person has answered.",
      ro: "Am salvat această conversație pentru o persoană, cazul {token}. Păstrează codul; răspunsurile vor apărea aici după ce o persoană a răspuns."
    }),
    CASE_OPENED: Object.freeze({
      en: "I've opened case {token} for a person. Expected reply: within {sla} hours. Check replies at {link}. I can't promise an outcome.",
      ro: "Am deschis cazul {token} pentru o persoană. Răspuns estimat: în {sla} ore. Vezi răspunsurile la {link}. Nu pot promite un rezultat."
    }),
    HUMAN_LABEL: Object.freeze({
      en: "Support (a person)",
      ro: "Suport (o persoană)"
    }),
    NOT_FOUND: Object.freeze({
      en: "No case with that code.",
      ro: "Nu există niciun caz cu acest cod."
    }),
    CLOSED_LABEL: Object.freeze({
      en: "This case is closed. You can still reply to reopen it.",
      ro: "Acest caz este închis. Poți răspunde pentru a-l redeschide."
    }),
    SUMMARY_LABEL: Object.freeze({
      en: "Model-written summary — advisory",
      ro: "Rezumat scris de model — orientativ"
    }),
    SOURCE_LINE: Object.freeze({
      en: "Source: {title} ({id})",
      ro: "Sursă: {title} ({id})"
    }),
    INCIDENT_ACTIVE: Object.freeze({
      en: "Known incident since {started_at}: {summary_en} (published by the team). If your problem matches, no need to report it; otherwise choose 'Talk to a human'.",
      ro: "Incident cunoscut din {started_at}: {summary_ro} (publicat de echipă). Dacă problema ta se potrivește, nu e nevoie să o raportezi; altfel alege „Vorbește cu o persoană”."
    }),
    NO_INCIDENT: Object.freeze({
      en: "I have no record of a current known incident. That doesn't rule one out — if something looks broken, choose 'Talk to a human' and describe it.",
      ro: "Nu am nicio înregistrare a unui incident cunoscut în acest moment. Asta nu exclude unul — dacă ceva pare stricat, alege „Vorbește cu o persoană” și descrie problema."
    }),
    INCIDENT_NOTICE: Object.freeze({
      en: "Note: there is a known incident affecting {surface} since {started_at}.",
      ro: "Notă: există un incident cunoscut care afectează {surface} din {started_at}."
    }),
    QUEUED: Object.freeze({
      en: "Waiting for the assistant's model… you are number {n} in line.",
      ro: "Se așteaptă modelul asistentului… ești numărul {n} la rând."
    })
  });

export function supportTemplate(id: SupportTemplateId, language: SupportLanguage): string {
  return SUPPORT_TEMPLATES[id][language];
}
