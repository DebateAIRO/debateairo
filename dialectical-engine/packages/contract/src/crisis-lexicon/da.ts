import type { CrisisLexicon, CrisisPattern } from "./types.js";

// "ø" and "æ" survive normalisation; people without a Danish keyboard type "oe"/"ae" (or "o"/"a").
// Plain "do" is left out on purpose: in Norwegian "på do" means "on the toilet".
const DIE = String.raw`(?:dø|doe)`;
// People close to the writer, after "min/mit/mine", for `other-person`.
const CLOSE = String.raw`(?:min|mit|mine) (?:bedste |lille |store |)(?:ven|veninde|kammerat|kæreste|kaereste|partner|mand|kone|hustru|søn|soen|datter|bror|lillebror|storebror|søster|soester|lillesøster|lillesoester|storesøster|mor|far|barn|teenager|bofælle|bofaelle|klassekammerat|elev|kollega|fætter|faetter|kusine|nevø|nevoe|niece|barnebarn|mormor|farmor|morfar|farfar)`;
const SUICIDE = String.raw`(?:begå|begaa|bega) selvmord`;
const KILL_SELF = String.raw`(?:${SUICIDE}|(?:slå|slaa|sla) (?:mig|sig) selv ihjel|(?:tage|ta) livet af (?:mig|sig)(?: selv)?|(?:dræbe|draebe) (?:mig|sig) selv)`;

export const DA: CrisisLexicon = Object.freeze({
  language: "da",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\bjeg (?:vil|ønsker at|oensker at|har lyst til at|har bare lyst til at|kunne godt tænke mig at|kunne godt taenke mig at|er klar til at|vil bare|vil gerne|vil helst|vil hellere) (?:bare |gerne |helst |)${DIE}\b(?! af| av| for| i | med| på | pa | som| ud| ut)` },
    { signal: "intent", pattern: String.raw`\bjeg (?:vil|gider|orker|kan|ønsker|oensker|har lyst til at) (?:ikke|ik|ikk) (?:at )?(?:leve|være her|vaere her|eksistere|vågne|vaagne)(?: op)? (?:mere|længere|laengere|lenger)\b` },
    { signal: "intent", pattern: String.raw`\b(?:slå|slaa|sla|slår|slaar|slar) mig selv ihjel\b|\b(?:dræbe|draebe|dræber|draeber) mig selv\b` },
    { signal: "intent", pattern: String.raw`\bjeg (?:[a-zæøå]+ ){0,3}(?:slå|slaa|sla) mig ihjel\b` },
    { signal: "intent", pattern: String.raw`\bjeg (?:vil|skal|kommer til at|har tænkt mig at|har taenkt mig at|overvejer at|tænker på at|taenker paa at|har lyst til at|prøver at|proever at|forsøgte at|forsoegte at|har forsøgt at|har forsoegt at|er ved at|vil bare)\b.{0,15}\b${SUICIDE}\b|\bjeg (?:begår|begaar|begar) selvmord\b` },
    { signal: "intent", pattern: String.raw`\bjeg (?:vil|skal|kommer til at|overvejer at|har lyst til at|tænker på at|taenker paa at|har tænkt mig at|har taenkt mig at|er klar til at|vil bare)\b (?:bare |gerne |)(?:tage|ta) livet af mig\b|\b(?:tage|tager|tog|ta) livet af mig selv\b` },
    { signal: "intent", pattern: String.raw`\b(?:tage|tager|ta|ende|ender|afslutte|afslutter) mit (?:eget )?liv\b(?! i | tilbage| op| som | på | paa | med | sammen)|\b(?:gøre|goere|gore) (?:en ende på|en ende paa|en ende pa) (?:det hele|mit liv)\b|\b(?:gøre|goere|gore) det af med mig selv\b` },
    { signal: "intent", pattern: String.raw`\bjeg (?:er|føler mig|foeler mig|har været|har vaeret)\b.{0,15}\b(?:selvmordstruet|selvmordstruede|suicidal)\b` },
    { signal: "intent", pattern: String.raw`\b(?:jeg har|jeg får|jeg faar|har|mine|jeg går med|jeg gaar med)\b.{0,15}\b(?:selvmordstanker|selvmordsplaner|selvmordstanke|dødstanker|doedstanker)\b` },
    { signal: "intent", pattern: String.raw`\bjeg (?:ville ønske|ville oenske|ønsker|oensker),? (?:at )?jeg (?:var|aldrig var|aldrig havde været|aldrig havde vaeret|aldrig var blevet) (?:død|doed|født|foedt)\b|\bjeg (?:var|er) bedre (?:tjent med at være |)(?:død|doed)\b` },
    { signal: "intent", pattern: String.raw`\b(?:alle|verden|min familie|mine forældre|mine foraeldre)\b.{0,25}\bbedre (?:af |)uden mig\b` },
    { signal: "intent", pattern: String.raw`\bingen (?:grund|mening) (?:til at|med at) leve(?: videre)?\b|\bingen mening med mit liv\b|\bmit liv (?:er|føles|foeles) (?:helt |bare |)(?:meningsløst|meningsloest|ikke værd at leve|ikke vaerd at leve)\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:skære|skaere|skærer|skaerer|skar|cutte|cutter|cuttede|kradse|kradser|brænde|braende|brænder|braender) i mig selv\b` },
    { signal: "self-harm", pattern: String.raw`\bjeg (?:cutter|cuttede|har cuttet|er begyndt at cutte|cutter stadig|cutter igen)\b(?! (?:video|videoer|film|klip))` },
    { signal: "self-harm", pattern: String.raw`\b(?:skade|skader|gøre skade på|goere skade paa|gøre mig selv fortræd) mig selv\b.{0,10}\b(?:med vilje|bevidst|igen|hele tiden)\b|\bjeg (?:vil|har lyst til at|får lyst til at|faar lyst til at|har trang til at) (?:skade|gøre skade på|goere skade paa) mig selv\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:min|mit) (?:selvskade|selvskadende adfærd|selvskadende adfaerd|cutting)\b|\bjeg (?:er|har været|har vaeret) selvskadende\b|\bjeg (?:selvskader|har selvskadet)\b|\bstoppe med at (?:cutte|skære i mig selv|skaere i mig selv|selvskade)\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:skal|bør|boer|burde) jeg (?:bare |)(?:${SUICIDE}|(?:slå|slaa|sla) mig (?:selv )?ihjel|(?:tage|ta) livet af mig|leve videre|blive ved med at leve|leve eller ${DIE})\b` },
    { signal: "decision", pattern: String.raw`\b(?:skal|bør|boer|burde) jeg (?:bare |)${DIE}\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\ber (?:mit|mit eget) liv\b.{0,15}\b(?:værd at leve|vaerd at leve|det værd|det vaerd|noget værd|noget vaerd)\b` },
    { signal: "decision", pattern: String.raw`\b(?:selvmord|døden|doeden|at ${DIE})\b.{0,30}\b(?:udvej|løsning|loesning|mulighed|valg)\b.{0,10}\bfor mig\b|\bmin (?:eneste|sidste|bedste) (?:udvej|løsning|loesning|mulighed)\b.{0,15}\b(?:selvmord|døden|doeden|at ${DIE})\b` },
    { signal: "decision", pattern: String.raw`\bville (?:nogen|nogle|min familie|folk|nogen overhovedet)\b.{0,15}\b(?:savne|opdage|lægge mærke|laegge maerke|være ligeglad|vaere ligeglad|bekymre|være ked|vaere ked)\b.{0,20}\bhvis jeg (?:døde|doede|var død|var doed|var væk|var vaek|begik selvmord|tog livet af mig)` },
    // method
    { signal: "method", pattern: String.raw`\bhvordan (?:begår|begaar|begar) (?:man|jeg|du) selvmord\b|\bhvordan (?:kan|skal|bør|boer|kunne) (?:jeg|man|du) (?:bedst |nemmest |hurtigst |smertefrit |)(?:${KILL_SELF}|(?:hænge|haenge) (?:mig|sig)|${DIE}\b(?! af| av))` },
    { signal: "method", pattern: String.raw`\b(?:smertefri|smertefrit|smertefrie|nemmeste|nem|hurtigste|hurtig|sikreste|bedste|fredelig|fredeligste|mest effektive) (?:måde|maade|made|metode|metoder|måder|maader) (?:at|til at) (?:${DIE}|${KILL_SELF}|tage mit liv)\b` },
    { signal: "method", pattern: String.raw`\bselvmords(?:metode|metoder|plan|planer|brev|pagt|note)\b` },
    { signal: "method", pattern: String.raw`\bhvor mange\b.{0,40}\b(?:piller|tabletter|sovepiller|panodil|pamol|paracetamol|mg|gram)\b.{0,40}\b(?:${DIE}|dræbe|draebe|dødelig|doedelig|dødeligt|doedeligt|overdosis)\b|\b(?:dødelig|doedelig|letal) dosis\b` },
    { signal: "method", pattern: String.raw`\bhvor (?:højt|hoejt|høj|hoej)\b.{0,40}\bfor at ${DIE}\b` },
    { signal: "method", pattern: String.raw`\b(?:hænge|haenge|skyde|drukne|forgifte|kvæle|kvaele) mig(?: selv)?\b(?! i | op i| fast| på| paa| pa| ud| ind)` },
    { signal: "method", pattern: String.raw`\b(?:springe|hoppe|kaste mig|kaster mig|smide mig|springer|hopper) (?:ud )?(?:foran|ud foran) (?:et tog|toget|en bil|en lastbil|bussen|en bus|metroen)\b|\bjeg\b.{0,25}\b(?:springe|hoppe|springer|hopper) (?:ud |ned |)fra (?:en bro|broen|taget|et tag|altanen|en altan|et højhus|et hoejhus|højhuset|hoejhuset)\b` },
    { signal: "method", pattern: String.raw`\b(?:alle mine|hele pakken|en hel pakke|et helt glas|hele glasset|en hel æske|hele æsken|en hel aeske) (?:med |af |)(?:piller|tabletter|sovepiller|pamol|panodil|medicin)\b|\b(?:tog|slugte|har taget|har slugt) (?:alle|alle mine) (?:piller|tabletter|sovepiller)\b|\bjeg\b.{0,15}\boverdosis\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b(?:er selvmordstruet|er suicidal|vil (?:${KILL_SELF}|${DIE}\b|ikke leve mere)|har selvmordstanker|har (?:forsøgt|forsoegt|prøvet|proevet) at (?:${KILL_SELF}|tage sit liv)|truer med (?:selvmord|at)|cutter|skærer i sig selv|skaerer i sig selv|skader sig selv|taler om (?:selvmord|at ${DIE}|at tage livet))` },
    { signal: "other-person", pattern: String.raw`\b(?:han|hun)\b (?:vil|truer med at|har planer om at|taler om at|prøver at|proever at|forsøger at|forsoeger at|har forsøgt at|har forsoegt at|har prøvet at|har proevet at) ${KILL_SELF}\b` },
    { signal: "other-person", pattern: String.raw`\bnogen (?:jeg kender|jeg holder af|jeg elsker|tæt på mig|taet paa mig)\b.{0,40}\b(?:selvmord|selvmordstruet|livet af sig|sig selv ihjel|skader sig selv)` }
  ])
});
