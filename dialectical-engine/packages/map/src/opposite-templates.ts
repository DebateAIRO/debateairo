/**
 * The last way to name a second answer when the map offers no different one (ANSWERS_FILLED, source TEMPLATE): code-owned
 * user-facing text, one entry per site locale (apps/ui/messages/<locale>). `lead` precedes the first answer's statement;
 * `empty` stands alone when that statement is empty. No numbers, no engine words. Owner wording: option 1 of 3 (plan
 * "Owner steps"). The `en` and `ro` texts are Phase 1's; the others were translated per language group and the risky
 * locales (ar he hi ja ko zh vi mt, plus ru da ga) were checked a second time.
 */
export const MAP_OPPOSITE_TEMPLATES: Readonly<Record<string, Readonly<{ lead: string; empty: string }>>> = Object.freeze({
  ar: Object.freeze({ lead: "عكس هذه الإجابة", empty: "إجابة مختلفة عن الإجابة أعلاه" }),
  bg: Object.freeze({ lead: "Противоположното на този отговор", empty: "Отговор, различен от горния" }),
  cs: Object.freeze({ lead: "Opak této odpovědi", empty: "Odpověď odlišná od té výše" }),
  da: Object.freeze({ lead: "Det modsatte af dette svar", empty: "Et andet svar end det ovenfor" }),
  de: Object.freeze({ lead: "Das Gegenteil dieser Antwort", empty: "Eine andere Antwort als die oben" }),
  el: Object.freeze({ lead: "Το αντίθετο αυτής της απάντησης", empty: "Διαφορετική απάντηση από την παραπάνω" }),
  en: Object.freeze({ lead: "The opposite of this answer", empty: "An answer different from the one above" }),
  es: Object.freeze({ lead: "Lo contrario de esta respuesta", empty: "Una respuesta distinta a la de arriba" }),
  et: Object.freeze({ lead: "Selle vastuse vastand", empty: "Ülal toodust erinev vastus" }),
  fi: Object.freeze({ lead: "Tämän vastauksen vastakohta", empty: "Eri vastaus kuin yllä oleva" }),
  fr: Object.freeze({ lead: "Le contraire de cette réponse", empty: "Une réponse différente de celle ci-dessus" }),
  ga: Object.freeze({ lead: "An freagra contrártha don fhreagra seo", empty: "Freagra difriúil leis an gceann thuas" }),
  he: Object.freeze({ lead: "ההפך מהתשובה הזו", empty: "תשובה שונה מהתשובה שלמעלה" }),
  hi: Object.freeze({ lead: "इस उत्तर का उल्टा", empty: "ऊपर वाले उत्तर से अलग एक उत्तर" }),
  hr: Object.freeze({ lead: "Suprotno od ovog odgovora", empty: "Odgovor različit od onoga iznad" }),
  hu: Object.freeze({ lead: "Ennek a válasznak az ellentéte", empty: "A fentitől eltérő válasz" }),
  id: Object.freeze({ lead: "Kebalikan dari jawaban ini", empty: "Jawaban yang berbeda dari yang di atas" }),
  it: Object.freeze({ lead: "Il contrario di questa risposta", empty: "Una risposta diversa da quella sopra" }),
  ja: Object.freeze({ lead: "この答えの反対", empty: "上の答えとは違う答え" }),
  ko: Object.freeze({ lead: "이 답의 반대", empty: "위의 답과 다른 답" }),
  lt: Object.freeze({ lead: "Šio atsakymo priešingybė", empty: "Kitoks atsakymas nei aukščiau" }),
  lv: Object.freeze({ lead: "Šīs atbildes pretstats", empty: "Cita atbilde nekā augstāk" }),
  mt: Object.freeze({ lead: "L-oppost ta' din it-tweġiba", empty: "Tweġiba differenti minn dik ta' hawn fuq" }),
  nl: Object.freeze({ lead: "Het tegenovergestelde van dit antwoord", empty: "Een ander antwoord dan het bovenstaande" }),
  pl: Object.freeze({ lead: "Przeciwieństwo tej odpowiedzi", empty: "Odpowiedź różna od tej powyżej" }),
  pt: Object.freeze({ lead: "O contrário desta resposta", empty: "Uma resposta diferente da de cima" }),
  ro: Object.freeze({ lead: "Opusul acestui răspuns", empty: "Un răspuns diferit de cel de mai sus" }),
  ru: Object.freeze({ lead: "Противоположность этому ответу", empty: "Ответ, отличный от приведённого выше" }),
  sk: Object.freeze({ lead: "Opak tejto odpovede", empty: "Iná odpoveď ako tá vyššie" }),
  sl: Object.freeze({ lead: "Nasprotje tega odgovora", empty: "Drugačen odgovor od zgornjega" }),
  sv: Object.freeze({ lead: "Motsatsen till det här svaret", empty: "Ett annat svar än det ovan" }),
  tr: Object.freeze({ lead: "Bu cevabın tersi", empty: "Yukarıdakinden farklı bir cevap" }),
  uk: Object.freeze({ lead: "Протилежність цієї відповіді", empty: "Інша відповідь, ніж наведена вище" }),
  vi: Object.freeze({ lead: "Điều ngược lại với câu trả lời này", empty: "Câu trả lời khác với câu ở trên" }),
  zh: Object.freeze({ lead: "这个答案的反面", empty: "与上面不同的答案" })
});
