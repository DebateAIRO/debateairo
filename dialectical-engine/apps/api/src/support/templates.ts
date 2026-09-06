export const OUTCOMES = Object.freeze([
  "ANSWER_GROUNDED", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION",
  "REFUSE_SAFETY", "DEGRADED", "DISABLED", "RATE_LIMITED"
] as const);
export type SupportOutcome = typeof OUTCOMES[number];

export const SUPPORT_TEMPLATE_IDS = Object.freeze([
  "DISCLOSURE", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION", "REFUSE_SAFETY",
  "DEGRADED", "DISABLED", "RATE_LIMITED", "RATING", "CASE_OPENED_MINIMAL", "SOURCE_LINE"
] as const);

export type SupportTemplateId = typeof SUPPORT_TEMPLATE_IDS[number];
export type SupportLanguage = "en" | "ro";

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
    SOURCE_LINE: Object.freeze({
      en: "Source: {title} ({id})",
      ro: "Sursă: {title} ({id})"
    })
  });

export function supportTemplate(id: SupportTemplateId, language: SupportLanguage): string {
  return SUPPORT_TEMPLATES[id][language];
}
