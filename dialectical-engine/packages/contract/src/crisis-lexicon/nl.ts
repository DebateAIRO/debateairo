import type { CrisisLexicon, CrisisPattern } from "./types.js";

// People close to the writer, after "mijn/m'n", for `other-person`.
const CLOSE = String.raw`(?:mijn|m'n|mn) (?:beste |kleine |grote |)(?:vriend|vriendin|vriendje|vriendinnetje|maat|partner|man|vrouw|echtgenoot|echtgenote|verloofde|zoon|zoontje|dochter|dochtertje|broer|broertje|zus|zusje|moeder|mama|mam|vader|papa|pap|kind|puber|tiener|huisgenoot|klasgenoot|klasgenote|leerling|collega|neef|nicht|kleinzoon|kleindochter|oma|opa)`;
const MYSELF = String.raw`(?:mezelf|mijzelf|m'n eigen|mn eigen)`;
const SUICIDE = String.raw`(?:zelfmoord|suicide|zelfdoding)`;

export const NL: CrisisLexicon = Object.freeze({
  language: "nl",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\bik wil (?:gewoon |echt |graag |liever |nu |zo graag |alleen maar |)(?:dood|doodgaan|dood gaan|sterven)\b(?!\s(?:kunnen|mogen|gaan in|in|thuis|op|met|van|voor|als|zonder))` },
    { signal: "intent", pattern: String.raw`\bik wil (?:gewoon |echt |)(?:niet|nie) (?:meer|langer) (?:leven|verder leven|verder|bestaan|wakker worden|hier zijn)\b(?! in| met| zonder| op| bij| als)|\bik wil er (?:gewoon |echt |)(?:niet|nie) meer zijn\b` },
    { signal: "intent", pattern: String.raw`\b${MYSELF} (?:van kant (?:te )?maken|om (?:te )?brengen|ombrengen|(?:te )?doden|(?:te )?vermoorden|dood (?:te )?maken|doodmaken|het leven (?:te )?benemen|iets (?:aan te doen|aandoen))\b` },
    { signal: "intent", pattern: String.raw`\bik (?:[a-z']+ ){0,3}me (?:van kant (?:te )?maken|ombrengen|om te brengen)\b|\bik (?:verhang|hang) me(?:zelf)? (?:op\b|\b)|\bdoe ${MYSELF} iets aan\b` },
    { signal: "intent", pattern: String.raw`\bik (?:wil|ga|zal|moet|wou|zou|denk erover|denk eraan|overweeg|ben van plan|heb geprobeerd|heb het geprobeerd|probeer)\b.{0,20}\b${SUICIDE} (?:te )?(?:plegen|doen)\b|\bik pleeg (?:gewoon |vandaag |vannacht |morgen |)${SUICIDE}\b` },
    { signal: "intent", pattern: String.raw`\bik denk\b.{0,15}\b(?:aan|over) (?:${SUICIDE}|doodgaan|dood gaan|${MYSELF} (?:van kant|dood|om te brengen))` },
    { signal: "intent", pattern: String.raw`\b(?:mijn|m'n) (?:eigen )?leven (?:te )?(?:beëindigen|beeindigen|nemen)\b|\been eind(?:e)? (?:aan|maken aan) (?:mijn|m'n) (?:eigen )?leven\b` },
    { signal: "intent", pattern: String.raw`\b(?:ik|mijn|moet ik|zal ik)\b.{0,25}\ber (?:gewoon )?een eind(?:e)? aan (?:maken|te maken)\b|\bik maak er (?:vandaag |vannacht |morgen |nu |gewoon |)een eind(?:e)? aan\b` },
    { signal: "intent", pattern: String.raw`\bik (?:ben|voel me|was|word)\b.{0,20}\b(?:suïcidaal|suicidaal|suïcidale|suicidale)\b` },
    { signal: "intent", pattern: String.raw`\b(?:ik heb|ik had|heb|ik krijg|mijn|m'n)\b.{0,20}\b(?:zelfmoordgedachten|suïcidale gedachten|suicidale gedachten|doodsgedachten|doodswens|suïcidegedachten|suicidegedachten)\b` },
    { signal: "intent", pattern: String.raw`\b(?:was ik maar|ik wou dat ik|ik wilde dat ik|ik wens dat ik|ik wenste dat ik)\b.{0,10}\b(?:dood|nooit geboren|niet geboren)\b|\bik (?:was|ben|ware) beter (?:af )?dood\b` },
    { signal: "intent", pattern: String.raw`\b(?:iedereen|de wereld|mijn familie|mijn ouders|allemaal)\b.{0,25}\bbeter (?:af )?zonder mij\b` },
    { signal: "intent", pattern: String.raw`\bgeen (?:reden|zin) (?:meer )?om (?:nog )?(?:te leven|verder te leven|door te leven|te blijven leven)\b|\bgeen zin meer in (?:het|mijn|m'n|dit) leven\b|\bmijn leven (?:heeft|is) (?:geen zin|zinloos|niks waard|niets waard)(?: meer)?\b` },
    { signal: "intent", pattern: String.raw`\bik zie geen (?:uitweg|toekomst) meer\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:snijd|snij|snijden|kras|krassen|beschadig|beschadigen|verwond|verwonden|brand|branden) (?:in )?${MYSELF}\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:doe|deed|doen|te doen) ${MYSELF} (?:expres |opzettelijk |bewust |)pijn\b|\b${MYSELF} (?:expres |opzettelijk |bewust |)(?:pijn (?:te )?doen|(?:te )?snijden|(?:te )?krassen|(?:te )?beschadigen|(?:te )?verwonden)\b` },
    { signal: "self-harm", pattern: String.raw`\bik heb (?:(?:weer|opnieuw|gisteren|vandaag|al|me|mezelf) ){0,3}gekrast\b|\bik ben (?:weer |opnieuw |)(?:gaan krassen|aan het krassen)\b|\bik kras (?:weer|nog steeds|al)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:mijn|m'n) (?:zelfbeschadiging|automutilatie|zelfverwonding)\b|\bik (?:doe aan|heb last van|pleeg) (?:zelfbeschadiging|automutilatie|zelfverwonding)\b|\b(?:stoppen|ophouden) met (?:krassen|zelfbeschadiging|automutilatie|${MYSELF} (?:te )?snijden)\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:moet|zal|mag) ik\b.{0,15}\b(?:${SUICIDE} (?:plegen|doen)|${MYSELF} (?:van kant maken|ombrengen|doden|ophangen)|er een eind(?:e)? aan maken|blijven leven|verder leven|leven of (?:sterven|doodgaan|dood))\b` },
    { signal: "decision", pattern: String.raw`\b(?:moet|zal|mag) ik (?:gewoon |maar |)(?:dood|doodgaan|dood gaan|sterven)\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bis (?:mijn|m'n) leven\b.{0,15}\b(?:de moeite waard|waard om te leven|het waard|nog zin)\b|\bheeft (?:mijn|m'n) leven (?:nog |wel |eigenlijk |)(?:zin|nut)\b` },
    { signal: "decision", pattern: String.raw`\b(?:${SUICIDE}|de dood|sterven|doodgaan)\b.{0,30}\b(?:oplossing|optie|uitweg|keuze)\b.{0,10}\bvoor mij\b|\b(?:${SUICIDE}|de dood|sterven|doodgaan)\b.{0,10}\bvoor mij\b.{0,20}\b(?:oplossing|optie|uitweg|keuze|beter)\b` },
    { signal: "decision", pattern: String.raw`\bmijn (?:enige|laatste) (?:uitweg|optie|oplossing)\b.{0,15}\b(?:${SUICIDE}|de dood|sterven|doodgaan|dood)\b` },
    { signal: "decision", pattern: String.raw`\b(?:iemand|niemand|mensen|mijn familie)\b.{0,25}\b(?:missen|merken|schelen|uitmaken)\b.{0,15}\bals ik (?:dood|er niet meer|weg|${SUICIDE})|\bals ik (?:dood (?:ga|was|ben)|er niet meer (?:ben|was)|${SUICIDE} pleeg|doodga)\b.{0,30}\b(?:missen|merken|schelen|uitmaken|verdrietig)\b` },
    // method
    { signal: "method", pattern: String.raw`\bhoe (?:kan ik|pleeg ik|moet ik|zou ik|kun je|kan je|pleeg je|moet je|doe je|doe ik|kan men|pleegt men|het beste|best|makkelijk|snel|pijnloos)\b.{0,10}\b(?:${SUICIDE} (?:plegen|pleeg|te plegen|doen)|${MYSELF} (?:van kant (?:te )?maken|ombrengen|om te brengen|(?:te )?doden|ophangen|op te hangen)|jezelf (?:van kant (?:te )?maken|ombrengen|om te brengen|(?:te )?doden|ophangen|op te hangen)|(?:mijn|je) leven (?:te )?(?:beëindigen|beeindigen))\b` },
    { signal: "method", pattern: String.raw`\bhoe (?:pleeg|pleegt) (?:ik|je|men) ${SUICIDE}\b|\bhoe\b.{0,15}\b(?:pijnloos|snel|makkelijk) (?:dood ?gaan|doodgaan|sterven)\b` },
    { signal: "method", pattern: String.raw`\b(?:pijnloos|pijnloze|pijnloosste|snelste|makkelijkste|makkelijke|zekerste|beste|vredigste|zachtste|snelle) (?:manier|manieren|methode|methodes|wijze)\b.{0,10}\b(?:om (?:te sterven|dood te gaan|${SUICIDE} te plegen|${MYSELF}|jezelf|er een eind|uit het leven)|van ${SUICIDE}|voor ${SUICIDE}|te sterven|dood te gaan)` },
    { signal: "method", pattern: String.raw`\b${SUICIDE}(?:methode|methodes|methoden|plan|brief|briefje|pact)\b|\b(?:moet ik|ik (?:wil|ga|heb))\b.{0,20}\bafscheidsbrief\b` },
    { signal: "method", pattern: String.raw`\bhoeveel\b.{0,40}\b(?:pillen|tabletten|slaappillen|paracetamol|oxazepam|temazepam|insuline|mg)\b.{0,40}\b(?:dood|dodelijk|te sterven|overdosis|overlijden)\b|\bdodelijke dosis\b` },
    { signal: "method", pattern: String.raw`\b(?:ik|moet ik)\b.{0,15}\b(?:een overdosis (?:nemen|genomen|innemen|ingenomen)|overdoseren)\b` },
    { signal: "method", pattern: String.raw`\b${MYSELF} (?:ophangen|op te hangen|verhangen|te verhangen|vergiftigen|te vergiftigen|doodschieten|dood te schieten|verdrinken|te verdrinken)\b` },
    { signal: "method", pattern: String.raw`\b(?:ik|${MYSELF}|me|moet ik)\b.{0,20}\bvoor (?:de|een) (?:trein|metro|vrachtwagen) (?:springen|te springen|gooien|te gooien|werpen|spring|gaan liggen|te gaan liggen)\b|\bik\b.{0,20}\bvan (?:een|de|het) (?:brug|flat|dak|toren|balkon|gebouw)\b.{0,5}\b(?:springen|spring|af springen|af te springen|afspringen)\b` },
    { signal: "method", pattern: String.raw`\b(?:een hele|de hele|een volle) (?:strip|doos|pot|potje|fles) (?:met |)(?:pillen|tabletten|slaappillen|medicijnen|paracetamol)\b|\bal mijn (?:pillen|slaappillen|tabletten|medicijnen) (?:tegelijk |in een keer |in één keer |ineens |)(?:ingenomen|geslikt)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b(?:is (?:suïcidaal|suicidaal)|wil (?:${SUICIDE} plegen|dood|zichzelf (?:van kant maken|doden|ombrengen|iets aandoen)|er een eind(?:e)? aan maken|niet meer leven|sterven)|denkt aan ${SUICIDE}|heeft zelfmoordgedachten|snijdt zichzelf|krast(?: zichzelf)?|doet zichzelf pijn|heeft geprobeerd ${SUICIDE}|probeerde ${SUICIDE}|dreigt (?:met ${SUICIDE}|zichzelf))` },
    { signal: "other-person", pattern: String.raw`\b(?:wil|gaat|dreigt|dreigde|probeerde|probeert) (?:hij |zij |ze |)zichzelf (?:iets aan te doen|van kant te maken|te doden|om te brengen|op te hangen|iets aandoen|van kant maken|doden|ombrengen)\b|\b(?:hij|zij|ze) (?:wil|gaat|dreigt) ${SUICIDE} (?:te )?plegen\b` },
    { signal: "other-person", pattern: String.raw`\biemand (?:die|van wie) ik (?:ken|hou|houd)\b.{0,40}\b(?:${SUICIDE}|suïcidaal|suicidaal|zichzelf)` }
  ])
});
