import type { CrisisLexicon, CrisisPattern } from "./types.js";

// People close to the writer, after "min/mitt/mina", for `other-person`.
const CLOSE = String.raw`(?:min|mitt|mina) (?:bästa |lilla |stora |)(?:vän|kompis|bästis|pojkvän|flickvän|partner|man|fru|sambo|son|dotter|bror|brorsa|syster|syrra|lillebror|lillasyster|storebror|storasyster|mamma|morsa|mor|pappa|farsa|far|barn|tonåring|klasskompis|elev|kollega|kusin|brorson|systerson|brorsdotter|systerdotter|barnbarn|mormor|farmor|morfar|farfar|rumskompis)`;
const SUICIDE = String.raw`(?:begå|göra) självmord`;
const KILL_SELF = String.raw`(?:ta livet av (?:mig|sig)(?: själv)?|${SUICIDE}|döda (?:mig|sig) själv)`;

export const SV: CrisisLexicon = Object.freeze({
  language: "sv",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\bjag (?:vill|ville|önskar|har lust att|är redo att|längtar efter att|vill bara|vill helst|vill verkligen|vill typ) (?:bara |helst |typ |verkligen |)dö\b(?! av| för| i | med| på| ut| som)` },
    { signal: "intent", pattern: String.raw`\bjag (?:vill|orkar|kan|vågar|ids|pallar|klarar) (?:inte|int|inte längre|inte mer) (?:att )?(?:leva|finnas|vara här|vakna|leva vidare|fortsätta leva|fortsätta att leva)(?: längre| mer| mera| något mer)?\b(?! i | med | utan | på | som )` },
    { signal: "intent", pattern: String.raw`\bjag (?:vill|ska|skall|kommer att|tänker|funderar på att|har funderat på att|har tänkt|planerar att|försökte|har försökt|tar|vill bara|måste|har lust att|känner för att)\b.{0,15}\b(?:ta|tar) livet av mig\b|\blivet av mig själv\b` },
    { signal: "intent", pattern: String.raw`\bjag (?:vill|ska|skall|kommer att|tänker|funderar på att|har funderat på att|planerar att|överväger att|har försökt|försökte|har tänkt)\b.{0,15}\b${SUICIDE}\b` },
    { signal: "intent", pattern: String.raw`\bjag (?:tänker|funderar|har tänkt|tänker ofta) (?:ofta |mycket |hela tiden |jämt |)på (?:självmord|att ta livet av mig|att dö)\b` },
    { signal: "intent", pattern: String.raw`\bjag (?:är|känner mig|har varit|blir)\b.{0,15}\b(?:suicidal|självmordsbenägen)\b` },
    { signal: "intent", pattern: String.raw`\b(?:jag har|jag får|har|mina|jag hade)\b.{0,15}\b(?:självmordstankar|dödstankar|suicidtankar|självmordsplaner)\b` },
    { signal: "intent", pattern: String.raw`\b(?:jag önskar|önskar|jag skulle önska)\b.{0,10}\b(?:jag var|att jag var|jag vore|att jag vore|jag aldrig|att jag aldrig)\b.{0,10}\b(?:död|född|fötts|föddes)\b|\bjag (?:borde|skulle) (?:bara |)vara död\b|\bjag (?:är|vore|skulle vara) bättre (?:av )?död\b` },
    { signal: "intent", pattern: String.raw`\b(?:alla|världen|min familj|mina föräldrar)\b.{0,25}\bbättre (?:utan mig|om jag var död|om jag inte fanns)\b` },
    { signal: "intent", pattern: String.raw`\b(?:ingen|ingen som helst) (?:mening|anledning|idé) (?:att|med att) (?:leva|fortsätta leva|leva vidare)\b|\bmitt liv (?:är|känns) (?:helt |så |bara |)(?:meningslöst|inte värt att leva|värdelöst)\b` },
    { signal: "intent", pattern: String.raw`\b(?:avsluta|avslutar|göra slut på|gör slut på|sätta punkt för) mitt (?:eget )?liv\b|\bgöra slut på (?:allt|alltihop|alltihopa|mig själv)\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\bjag (?:skär|skurit|har skurit|cuttar|har cuttat|cuttade|rispar|har rispat) mig\b(?! (?:i|på) (?:fingret|tummen|handen|kniven|papper|glaset|burken))` },
    { signal: "self-harm", pattern: String.raw`\b(?:skadar|skada|skadat|bränna|bränner|brände|rispa|rispar|skära|skär) mig själv\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:mitt|mina|jag har)\b.{0,10}\b(?:självskadebeteende|självskador|självskada)\b|\bjag (?:självskadar|har självskadat)\b|\bsluta (?:skära mig|cutta|självskada)\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:ska|skall|borde|bör) jag (?:bara |)(?:ta livet av mig|${SUICIDE}|leva vidare|fortsätta leva|fortsätta att leva|leva eller dö)\b` },
    { signal: "decision", pattern: String.raw`\b(?:ska|skall|borde|bör) jag (?:bara |)dö\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bär mitt liv (?:ens |verkligen |fortfarande |)(?:värt att leva|värt något|värt det)\b` },
    { signal: "decision", pattern: String.raw`\b(?:självmord|döden|att dö)\b.{0,30}\b(?:lösning|lösningen|utväg|utvägen|alternativ|alternativet|val|valet)\b.{0,10}\bför mig\b|\bmin (?:enda|sista|bästa) (?:utväg|lösning|möjlighet)\b.{0,15}\b(?:självmord|döden|att dö)\b` },
    { signal: "decision", pattern: String.raw`\bskulle (?:någon|folk|min familj|någon ens)\b.{0,15}\b(?:sakna|märka|bry sig|bry|bli ledsen)\b.{0,20}\bom jag (?:dog|dött|var död|försvann|tog livet av mig)` },
    // method
    { signal: "method", pattern: String.raw`\bhur (?:tar|begår|hänger|dödar) (?:man|jag) (?:livet av (?:sig|mig)|självmord|sig|mig)\b` },
    { signal: "method", pattern: String.raw`\bhur (?:kan|ska|skall|bör|gör|gör man för att|gör jag för att) (?:man |jag |du |en |)(?:bäst |enklast |snabbast |smärtfritt |)(?:${KILL_SELF}|hänga (?:sig|mig))\b|\bhur (?:kan|ska) jag (?:bäst |enklast |snabbast |smärtfritt |)dö\b(?! av| ut| i )` },
    { signal: "method", pattern: String.raw`\bhur (?:dör) (?:man|jag) (?:smärtfritt|utan smärta|snabbast|enklast)\b` },
    { signal: "method", pattern: String.raw`\b(?:smärtfri|smärtfritt|smärtfria|enklaste|enkelt|snabbaste|snabbt|säkraste|bästa|fridfull|fridfullaste|lugnaste) (?:sätt|sättet|metod|metoder|metoden) (?:att|för att) (?:dö|${KILL_SELF})\b` },
    { signal: "method", pattern: String.raw`\bsjälvmords(?:metod|metoder|plan|planer|brev|pakt)\b` },
    { signal: "method", pattern: String.raw`\bhur många\b.{0,40}\b(?:tabletter|piller|sömntabletter|alvedon|panodil|paracetamol|mg|gram)\b.{0,40}\b(?:dö|döda|dödlig|dödligt|överdos|ta livet)\b|\b(?:dödlig|dödliga|letal) dos\b` },
    { signal: "method", pattern: String.raw`\b(?:hänga|skjuta|dränka|förgifta|kväva) mig(?: själv)?\b(?! på| med| kvar| i | fast| efter)` },
    { signal: "method", pattern: String.raw`\bjag\b.{0,20}\b(?:hoppa|kasta mig|slänga mig|lägga mig) (?:från|ner från|framför|ut framför|på spåret) (?:en |ett |)(?:bro|bron|taket|tak|tåget|tunnelbanan|pendeln|en bil|bussen|balkongen|ett hus|höghuset)\b` },
    { signal: "method", pattern: String.raw`\b(?:ta|tog|svälja|svalde|svälj|har tagit|har svalt) (?:alla mina|en hel burk|hela burken|en hel karta|hela kartan|ett helt paket|hela paketet) (?:med |)(?:tabletter|piller|sömntabletter|mediciner|alvedon)\b|\bjag\b.{0,15}\böverdos\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b(?:är (?:suicidal|självmordsbenägen)|vill (?:${KILL_SELF}|dö\b|inte leva)|har självmordstankar|har försökt (?:att )?${KILL_SELF}|pratar om (?:att ${KILL_SELF}|att dö|självmord)|hotar med (?:självmord|att ta livet av sig)|skär sig (?:själv|i armarna|igen)|skadar sig själv|självskadar|cuttar)` },
    { signal: "other-person", pattern: String.raw`\b(?:han|hon|hen)\b (?:vill|tänker|pratar om att|hotar med att|har försökt|försökte|planerar att|säger att (?:han|hon|hen) vill) ${KILL_SELF}\b` },
    { signal: "other-person", pattern: String.raw`\bnågon (?:jag känner|jag älskar|jag bryr mig om|som står mig nära)\b.{0,40}\b(?:självmord|suicidal|livet av sig|skadar sig)` }
  ])
});
