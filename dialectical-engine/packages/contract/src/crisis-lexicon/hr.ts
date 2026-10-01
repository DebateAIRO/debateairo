import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without diacritics: questions and patterns are both normalised
// ("ću" → "cu", "život" → "zivot", "počiniti" → "pociniti"). "đ" is its own letter and is not
// folded, so words with it list "đ", "dj" and "d" ("samoozljeđujem" / "samoozljedjujem").
// The Serbian/Bosnian spellings people also type ("samoubistvo", "umreti") are included.

// First-person "I want / I would like / I am going to" before an infinitive.
const WANT = String.raw`(?:zelim|hocu|htio bih|htjela bih|htjel bih|moram|idem|namjeravam|planiram|odlucio sam|odlucila sam|spreman sam|spremna sam)`;
const SUICIDE = String.raw`samoubo?j?i?stv`;
const LIVE = String.raw`(?:zivjeti|zivjet|zivit|ziveti)`;
const DIE = String.raw`(?:umrijeti|umrijet|umrit|umreti|crknuti|crknut)`;
// People close to the writer, for `other-person` (nominative, as people type them).
const CLOSE = String.raw`(?:najbolji |najbolja )?(?:prijatelj|prijateljica|frend|frendica|decko|cura|djevojka|partner|partnerica|muz|suprug|zena|supruga|sin|kci|kcer|brat|sestra|mama|majka|mater|tata|otac|dijete|klinac|cimer|cimerica|kolega|kolegica|bratic|sestricna|ro(?:đ|dj|d)ak|ro(?:đ|dj|d)akinja|unuk|unuka|ucenik|ucenica|student|studentica)`;
const MY = String.raw`(?:moj|moja|moje|moji|nas|nasa)`;
// What a person at risk is said to want or do.
const AT_RISK = String.raw`(?:(?:se )?(?:zeli|hoce|namjerava|planira) (?:se )?ubiti|(?:zeli|hoce) (?:pociniti ${SUICIDE}o|oduzeti si zivot|${DIE}\b(?! kod kuce| doma| u | dostojanstveno))|prijeti,? da ce se ubiti|(?:je )?(?:pokusao|pokusala) (?:se ubiti|${SUICIDE}o|pociniti ${SUICIDE}o)|se (?:pokusao|pokusala) ubiti|(?:razmislja|prica|govori) o ${SUICIDE}u|se (?:reze|samoozlje(?:đ|dj|d)uje|ozlje(?:đ|dj|d)uje)|ima (?:suicidalne|samoubilacke) misli|je suicidal(?:na|an))`;

export const HR: CrisisLexicon = Object.freeze({
  language: "hr",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${WANT} se ubiti\b` },
    { signal: "intent", pattern: String.raw`\bse (?:zelim|hocu|idem|moram) ubiti\b` },
    { signal: "intent", pattern: String.raw`\b(?:ubit(?:i)? cu se|ubicu se|cu se ubiti|ja cu se ubit(?:i)?)\b(?! od smijeha| od posla| s tim)` },
    { signal: "intent", pattern: String.raw`\b(?:(?:ubio|ubila) bih se|bih se (?:ubio|ubila))\b(?! od smijeha| od dosade| za )` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} pociniti|pocinit cu|pocinicu|cu pociniti) ${SUICIDE}o\b` },
    { signal: "intent", pattern: String.raw`\b(?:razmisljam|stalno razmisljam|mislim|opet razmisljam) (?:o ${SUICIDE}u|na ${SUICIDE}o)\b` },
    { signal: "intent", pattern: String.raw`\b(?:imam|opet imam|stalno imam|muce me|progone me)\b.{0,15}\b(?:suicidalne|samoubilacke) (?:misli|porive|osjecaje|nagone)\b` },
    { signal: "intent", pattern: String.raw`\b(?:suicidal(?:na|an) sam|sam suicidal(?:na|an)|osjecam se suicidalno|sam (?:opet |jako )?suicidal(?:na|an))\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} (?:si )?oduzeti (?:si )?zivot|oduzet cu si zivot|oduzecu si zivot|cu si oduzeti zivot|${WANT} (?:dici|dignuti) ruku na sebe|dignut cu ruku na sebe)\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} (?:okoncati|zavrsiti|prekinuti)|okoncat cu|zavrsit cu) (?:svoj )?(?:vlastiti )?zivot\b(?! u | na | kao)` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} zavrsiti|zavrsit cu|zavrsicu) (?:sa|s) (?:zivotom|sobom)\b` },
    { signal: "intent", pattern: String.raw`\b${WANT} ${DIE}\b(?! za\b| od\b| u starosti| kod kuce| doma| dostojanstveno| u miru| u snu)` },
    { signal: "intent", pattern: String.raw`\b(?:ne zelim|necu|ne zelim vise|necu vise|vise ne zelim) (?:vise )?${LIVE}\b(?! u\b| na\b| s\b| sa\b| bez\b| tu\b| ovdje| tamo| pod| kao| medu| među| kod)` },
    { signal: "intent", pattern: String.raw`\b(?:ne zelim|vise ne zelim) (?:vise )?(?:biti ziv(?:a)?|postojati|se (?:vise )?(?:ujutro )?probuditi)\b` },
    { signal: "intent", pattern: String.raw`\bne da mi se (?:vise )?${LIVE}\b` },
    { signal: "intent", pattern: String.raw`\bnemam (?:vise )?(?:za sto|zasto|razloga za|razlog za|razloga) (?:${LIVE}|zivot)\b` },
    { signal: "intent", pattern: String.raw`\bmoj (?:je )?zivot (?:vise )?(?:nema (?:nikakvog )?smisla|je besmislen|nista ne vrijedi|ne vrijedi nista)\b` },
    { signal: "intent", pattern: String.raw`\bnema (?:vise )?(?:nikakvog )?smisla (?:vise )?${LIVE}\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\b(?:(?:volio|voljela|voljel) bih da sam|bolje (?:bi bilo )?da sam|da sam (?:barem|bar)|${WANT} biti) (?:vec )?mrtv?(?:av|a)\b` },
    { signal: "intent", pattern: String.raw`\bda se (?:(?:barem|bar|nikad|nikada) ){0,2}nisam (?:nikad |nikada )?rodi(?:o|la)\b` },
    { signal: "intent", pattern: String.raw`\bbez mene (?:bi )?(?:bilo|bi bilo|bi im bilo|bi svima bilo|ce biti|bi bili|ce svima biti)\b.{0,15}\b(?:bolje|lakse)\b` },
    { signal: "intent", pattern: String.raw`\b(?:svima|svi|obitelji|svijetu)\b.{0,20}\b(?:bolje|lakse)\b.{0,10}\bbez mene\b` },
    { signal: "intent", pattern: String.raw`\b(?:ne mogu vise(?: dalje| izdrzati| ovako)?\s*(?:$|[.!?,;])|ne mogu (?:vise )?ovako ${LIVE}\b|ne mogu vise ${LIVE}\b)` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:rezem|samoozlje(?:đ|dj|d)ujem|namjerno ozlje(?:đ|dj|d)ujem|rezala sam|rezao sam|samoozlje(?:đ|dj|d)ivala sam|samoozlje(?:đ|dj|d)ivao sam) se\b(?! pri| u kuhinji)` },
    { signal: "self-harm", pattern: String.raw`\bse (?:rezem|opet rezem|samoozlje(?:đ|dj|d)ujem|namjerno ozlje(?:đ|dj|d)ujem|namjerno porezem)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:${WANT}|ne mogu prestati|kako prestati) (?:se )?(?:porezati|rezati|samoozlje(?:đ|dj|d)ivati|ozlijediti|opeci|spaliti)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:${WANT} (?:si )?nauditi (?:sebi|si)|${WANT} (?:sebi )?nanijeti (?:bol|ozljede)|nanosim (?:si|sebi) ozljede|namjerno si nanosim)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:moje|svoje|mojim|svojim|sa svojim|s mojim) samoozlje(?:đ|dj|d)ivanj(?:e|em)\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:trebam li|trebala bih|trebao bih|bih li (?:se )?(?:trebao|trebala)|bi li bilo bolje da) (?:se )?(?:jednostavno )?(?:ubiti|ubijem)\b` },
    { signal: "decision", pattern: String.raw`\b(?:da li|jel|jel da|je li bolje da|sto ako) (?:da )?se (?:jednostavno )?ubijem\b` },
    { signal: "decision", pattern: String.raw`\b(?:trebam li|bih li (?:trebao|trebala)) (?:jednostavno )?(?:pociniti ${SUICIDE}o|si oduzeti zivot|okoncati (?:svoj )?zivot|${DIE}\b(?! za\b| kod kuce| doma| u bolnici))` },
    { signal: "decision", pattern: String.raw`\b(?:trebam li|bih li (?:trebao|trebala)|da li da) (?:nastaviti )?(?:${LIVE}|zivim) ili (?:${DIE}|umrem|se ubiti|se ubijem)\b` },
    { signal: "decision", pattern: String.raw`\b(?:vrijedi li (?:uopce |jos )?moj zivot|je li (?:uopce )?moj zivot (?:uopce |jos )?vrijedan|ima li (?:uopce |jos )?moj zivot (?:ikakvog |ikakav |uopce )?(?:smisla|smisao))\b` },
    { signal: "decision", pattern: String.raw`\bima li (?:uopce |jos |vise )?(?:smisla|smisao) (?:dalje )?${LIVE}\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\b${SUICIDE}o\b.{0,30}\b(?:za mene|moje (?:jedino|najbolje) rjesenje|moj (?:jedini|najbolji) izlaz|moja (?:jedina|najbolja) opcija)\b` },
    { signal: "decision", pattern: String.raw`\b(?:jedino|zadnje|posljednje) (?:rjesenje|izlaz),? (?:koje mi je )?(?:ostalo|preostalo|mi ostaje|koje imam)\b.{0,20}\b(?:smrt|${SUICIDE}o|${DIE})\b` },
    { signal: "decision", pattern: String.raw`\b(?:bih li (?:ikome|nekome|ikom) nedostaja(?:o|la)|bi li (?:itko|netko|ikoga|koga) (?:primijetio|primjetio|bilo briga|zanimalo|plakao))\b.{0,25}\b(?:da|kad(?:a)?|ako) (?:umrem|se ubijem|nestanem|me nema|me vise nema|bih umro|bih umrla)\b` },
    { signal: "decision", pattern: String.raw`\brazlo(?:g|zi|ga) (?:zasto |da )?(?:se ne ubijem|ne pocinim ${SUICIDE}o|ostanem ziv(?:a)?)\b` },
    // method
    { signal: "method", pattern: String.raw`\bkako (?:(?:najlakse|najbrze|brzo|bezbolno|sigurno|na brzinu) )?se (?:(?:najlakse|najbrze|brzo|bezbolno|sigurno) )?(?:ubiti|ubit|objesiti|objesit|otrovati|predozirati|utopiti|upucati|ustrijeliti)\b` },
    { signal: "method", pattern: String.raw`\bkako (?:najlakse |najbrze |brzo |bezbolno )?(?:pociniti ${SUICIDE}o|si oduzeti zivot|okoncati (?:svoj )?zivot|(?:si )?prerezati (?:vene|zile))\b` },
    { signal: "method", pattern: String.raw`\bkako (?:najlakse|najbrze|brzo|bezbolno|sigurno) ${DIE}\b` },
    { signal: "method", pattern: String.raw`\b(?:bezbolan|bezbolni|bezbolna|najbrzi|najbrza|najlaksi|najlaksa|najsigurniji|najsigurnija|najbolji|najbolja|brz|brzi|lak|laki|miran|mirni|siguran) (?:nacin|nacini|metoda|metode|put)\b.{0,15}\b(?:${DIE}|da umrem|za smrt|smrti|za ${SUICIDE}o|${SUICIDE}a|da se ubijem|ubiti se|okoncati zivot)\b` },
    { signal: "method", pattern: String.raw`\bbezboln(?:o|og|om) ${SUICIDE}(?:o|a|u)\b` },
    { signal: "method", pattern: String.raw`\b(?:${SUICIDE}o (?:pismo|plan)|oprostajno pismo prije ${SUICIDE}a|pakt o ${SUICIDE}u)\b` },
    { signal: "method", pattern: String.raw`\b(?:smrtonosn|smrtn|letaln)(?:a|u|e|oj) doz(?:a|u|e|i)\b` },
    { signal: "method", pattern: String.raw`\bkoliko (?:[a-z]+ )?(?:tableta|tabletica|lijekova|pilula|apaurina|normabela|praksitena|paracetamola|ibuprofena|miligrama|grama|inzulina|inzulina|antidepresiva|alkohola)\b.{0,40}\b(?:za (?:predoziranje|smrt)|da (?:umrem|se predoziram|se ubijem)|ubija (?:covjeka|me)|me ubije|je smrtonosn)` },
    { signal: "method", pattern: String.raw`\b(?:s koje visine|sa koje visine|koliko visoko|koliko visok(?:a)?)\b.{0,40}\b(?:${DIE}|da umrem|se ubiti|ubije|je pad smrtonosan)\b` },
    { signal: "method", pattern: String.raw`\b(?:(?:objesit|objesiti|otrovat|otrovati|predozirat|predozirati|upucat|upucati) cu se|(?:objesicu|otrovacu) se|cu se (?:objesiti|otrovati|predozirati|upucati))\b` },
    { signal: "method", pattern: String.raw`\b${WANT} se (?:objesiti|otrovati|predozirati|utopiti|upucati|ustrijeliti)\b` },
    { signal: "method", pattern: String.raw`\b(?:skocit cu|skocicu|skocim|bacit cu se|bacicu se|bacim se|${WANT} skociti|${WANT} se baciti|skocit cu se)\b.{0,15}\b(?:s mosta|sa mosta|s prozora|sa prozora|s krova|sa krova|s balkona|sa balkona|pod vlak|pod auto|pod tramvaj|sa zgrade|s nebodera|s litice)\b` },
    { signal: "method", pattern: String.raw`\b(?:prerezat cu|prerezacu|prerezem|${WANT}) (?:si )?(?:prerezati )?(?:vene|zile)\b` },
    { signal: "method", pattern: String.raw`\b(?:popio sam|popila sam|progutao sam|progutala sam|popit cu|popicu|progutat cu) (?:sve|cijelu kutiju|cijelo pakiranje|cijelu tablu)\b.{0,15}\b(?:tablete|tableta|lijekove|lijekova|pilule|apaurine|normabele)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b${AT_RISK}` },
    { signal: "other-person", pattern: String.raw`\b${CLOSE} mi\b.{0,20}\b${AT_RISK}` },
    { signal: "other-person", pattern: String.raw`\b(?:netko|osoba|covjek),? (?:koga|koju|kojeg) (?:znam|volim)\b.{0,40}\b(?:se (?:zeli|hoce) ubiti|${SUICIDE}|samoozlje|se reze|suicidal)` },
    { signal: "other-person", pattern: String.raw`\b(?:(?:zeli|hoce) se ubiti|se (?:zeli|hoce) ubiti|(?:prijeti|kaze|govori|pise),? da ce se ubiti)\b` }
  ])
});
