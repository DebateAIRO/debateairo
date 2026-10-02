import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without diacritics: questions and patterns are both normalised
// ("hočem" → "hocem", "življenje" → "zivljenje", "režem" → "rezem"), so either spelling matches.

// First-person "I want / I would like / I am going to" before an infinitive.
const WANT = String.raw`(?:hocem|zelim|zelim si|hotel bi|hotela bi|moram|nameravam|grem|sem se odlocil|sem se odlocila|odlocil sem se|odlocila sem se)`;
// People close to the writer, for `other-person` (nominative, as people type them).
const CLOSE = String.raw`(?:najboljsi |najboljsa )?(?:prijatelj|prijateljica|frend|frendica|fant|punca|partner|partnerka|moz|zena|sin|hci|hcerka|brat|sestra|mama|mami|mati|oce|ati|otrok|sosolec|sosolka|sodelavec|sodelavka|cimer|cimra|bratranec|sestricna|vnuk|vnukinja|ucenec|ucenka|student|studentka)`;
const MY = String.raw`(?:moj|moja|moje|nas|nasa)`;

export const SL: CrisisLexicon = Object.freeze({
  language: "sl",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${WANT} se ubiti\b` },
    { signal: "intent", pattern: String.raw`\b(?:se (?:hocem|zelim|grem|nameravam) ubit(?:i)?|grem se ubit)\b` },
    { signal: "intent", pattern: String.raw`\b(?:ubil(?:a)? se bom|se bom ubil(?:a)?|bom se ubil(?:a)?|ubijem se|se ubijem)\b(?! od smeha| z delom| s tem)` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} narediti samomor|(?:naredil|naredila) bom samomor|bom naredil(?:a)? samomor|storil(?:a)? bom samomor)\b` },
    { signal: "intent", pattern: String.raw`\b(?:razmisljam|stalno razmisljam|mislim|premisljujem) (?:o samomoru|na samomor)\b` },
    { signal: "intent", pattern: String.raw`\b(?:imam|spet imam|stalno imam|mucijo me|preganjajo me)\b.{0,15}\bsamomorilne (?:misli|nagibe|obcutke|namene)\b` },
    { signal: "intent", pattern: String.raw`\b(?:sem|pocutim se|spet sem)\b.{0,10}\bsamomoriln(?:en|na|a)\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} (?:si )?vzeti (?:si )?zivljenje|si bom vzel(?:a)? zivljenje|vzel(?:a)? si bom zivljenje)\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} (?:koncati|zakljuciti)|koncal(?:a)? bom|bom koncal(?:a)?) (?:svoje )?(?:lastno )?zivljenje\b` },
    { signal: "intent", pattern: String.raw`\b(?:koncati|koncam|bom koncal(?:a)?|obracunati) (?:z zivljenjem|s sabo|s seboj)\b` },
    { signal: "intent", pattern: String.raw`\b${WANT} (?:umreti|crkniti|crknit)\b(?! za\b| od\b| na\b| v starosti| doma| dostojno| v miru| v spanju)` },
    { signal: "intent", pattern: String.raw`\b(?:rad|rada|najraje|raje) bi (?:se ubil(?:a)?|si vzel(?:a)? (?:svoje )?zivljenje|naredil(?:a)? samomor|koncal(?:a)? (?:svoje )?zivljenje|se obesil(?:a)?)\b` },
    { signal: "intent", pattern: String.raw`\b(?:rad|rada|najraje) bi umrl(?:a)?\b(?! za\b| od\b| doma| v )` },
    { signal: "intent", pattern: String.raw`\b(?:nocem|ne zelim|ne zelim si) (?:vec |dlje )?ziveti\b(?! v\b| na\b| s\b| z\b| brez\b| tu\b| tam| pod| kot| med| ob\b)` },
    { signal: "intent", pattern: String.raw`\b(?:nocem|ne zelim) (?:vec )?(?:biti ziv(?:a)?|obstajati|se (?:vec )?(?:zjutraj )?zbuditi)\b` },
    { signal: "intent", pattern: String.raw`\bne da se mi (?:vec )?ziveti\b` },
    { signal: "intent", pattern: String.raw`\b(?:nimam|nimam vec) (?:za kaj|zakaj|razloga za) (?:ziveti|zivljenje)\b` },
    { signal: "intent", pattern: String.raw`\bmoje zivljenje (?:vec )?nima (?:nobenega )?(?:smisla|vrednosti)\b` },
    { signal: "intent", pattern: String.raw`\bnima (?:vec )?(?:nobenega )?smisla (?:vec )?ziveti\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\b(?:zelim si,? da bi bil(?:a)?|raje bi bil(?:a)?|rad bi bil|rada bi bila|najraje bi bil(?:a)?) (?:ze )?mrtv?(?:ev|a)\b` },
    { signal: "intent", pattern: String.raw`\b(?:da se (?:nikoli )?ne bi (?:nikoli )?rodil(?:a)?|da se (?:nikoli )?nisem (?:nikoli )?rodil(?:a)?)\b` },
    { signal: "intent", pattern: String.raw`\bbrez mene (?:bi )?(?:bilo|bi bilo|bi jim bilo|bi vsem bilo|bodo|bi bili)\b.{0,15}\bbolje\b` },
    { signal: "intent", pattern: String.raw`\b(?:vsem|vsi|druzini|svetu)\b.{0,20}\bbolje\b.{0,10}\bbrez mene\b` },
    { signal: "intent", pattern: String.raw`\b(?:ne (?:zmorem|morem|zdrzim) vec(?: naprej| ziveti)?\s*(?:$|[.!?,;])|ne (?:morem|zmorem) vec (?:tako )?ziveti\b)` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:rezem|samoposkodujem|porezem|rezala sem|rezal sem|porezala sem|porezal sem|samoposkodovala sem|samoposkodoval sem) se\b(?! pri| s nozem pri| v kuhinji)` },
    { signal: "self-harm", pattern: String.raw`\bse (?:rezem|spet rezem|samoposkodujem|namerno porezem|namerno poskodujem)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:${WANT}|ne morem nehati|kako nehati|kako prenehati) (?:se )?(?:porezati|rezati|samoposkodovati|poskodovati|zazgati)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:${WANT} si (?:namerno )?(?:skoditi|ublizati|narediti kaj)|(?:namerno )?si skodim namerno|namerno si skodim|sebi namerno skodim)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:moje|svoje|s svojim|mojim) samoposkodovanj(?:e|em)\b` },
    // decision
    { signal: "decision", pattern: String.raw`\bnaj se (?:kar |preprosto |raje )?ubijem\b` },
    { signal: "decision", pattern: String.raw`\bnaj (?:kar |preprosto |raje )?(?:naredim samomor|si vzamem zivljenje|koncam svoje zivljenje|umrem)\b(?! za\b| doma| v bolnisnici)` },
    { signal: "decision", pattern: String.raw`\bnaj (?:se )?(?:zivim|zivim naprej),? ali (?:naj )?(?:umrem|se ubijem)\b` },
    { signal: "decision", pattern: String.raw`\b(?:ali )?(?:je|ima) (?:sploh )?moje zivljenje (?:sploh |se |sploh se )?(?:vredno|smisel|kaksen smisel|vrednost)\b` },
    { signal: "decision", pattern: String.raw`\bima (?:sploh |se )?smisel (?:se )?ziveti\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bsamomor\b.{0,30}\b(?:zame|za mene|moja (?:edina|najboljsa) (?:resitev|moznost|izbira|pot))\b` },
    { signal: "decision", pattern: String.raw`\b(?:edina|zadnja) (?:resitev|moznost|pot),? (?:ki mi (?:je )?ostane|ki mi je ostala|ki jo imam)\b.{0,20}\b(?:smrt|samomor|umreti)\b` },
    { signal: "decision", pattern: String.raw`\b(?:bi me (?:kdo|kdorkoli|sploh kdo) pogresal|bi (?:kdo|sploh kdo) opazil|bi koga brigalo|bi bilo komu mar)\b.{0,25}\bce bi (?:umrl(?:a)?|se ubil(?:a)?|izginil(?:a)?|me ne bilo)\b` },
    { signal: "decision", pattern: String.raw`\brazlog(?:i|ov)? (?:za to,? )?da se ne ubijem\b` },
    // method
    { signal: "method", pattern: String.raw`\bkako (?:(?:najlazje|najhitreje|hitro|neboleče|nebolece|brez bolecin|zanesljivo) )?se (?:(?:najlazje|najhitreje|hitro|nebolece|brez bolecin|zanesljivo) )?(?:ubiti|ubit|obesiti|zastrupiti|predozirati|utopiti|ustreliti)\b` },
    { signal: "method", pattern: String.raw`\bkako (?:najlazje |najhitreje |hitro |nebolece |brez bolecin )?(?:narediti samomor|storiti samomor|si vzeti zivljenje|koncati svoje zivljenje|si prerezati zile)\b` },
    { signal: "method", pattern: String.raw`\bkako (?:najlazje|najhitreje|hitro|nebolece|brez bolecin|zanesljivo) (?:umreti|crkniti)\b` },
    { signal: "method", pattern: String.raw`\b(?:nebolec(?:en)?|nebolecn(?:i|a|o)|najhitrejsi|najhitrejsa|najlazji|najlazja|najbolj zanesljiv(?:i|a)?|najzanesljivejsi|hiter|hitra|lahek|lahka|najboljsi|najboljsa|miren|mirna) (?:nacin|nacini|metoda|metode|pot)\b.{0,15}\b(?:umreti|da umrem|za smrt|smrti|za samomor|samomora|da se ubijem|ubiti se|koncati zivljenje)\b` },
    { signal: "method", pattern: String.raw`\bnebolec(?:en|na|ni) (?:samomor|smrt)\b(?! za\b| zivali| pri )` },
    { signal: "method", pattern: String.raw`\b(?:samomorilno|poslovilno samomorilno) pismo\b` },
    { signal: "method", pattern: String.raw`\b(?:smrtn(?:i|a|o)|smrtonosn(?:i|a|o)) (?:odmerek|odmerka|doza|dozo)\b` },
    { signal: "method", pattern: String.raw`\bkoliko (?:[a-z]+ )?(?:tablet|tabletk|zdravil|uspaval|paracetamola|ibuprofena|miligramov|gramov|insulina|inzulina|antidepresivov|alkohola)\b.{0,40}\b(?:za (?:predoziranje|smrt)|da (?:umrem|se predoziram|se ubijem)|ubije (?:cloveka|me)|je smrtn)` },
    { signal: "method", pattern: String.raw`\b(?:s kaksne visine|z kaksne visine|kako visoko|kako visok(?:a)?)\b.{0,40}\b(?:umreti|da umrem|se ubiti|ubije|je padec smrten)\b` },
    { signal: "method", pattern: String.raw`\b(?:(?:obesil|zastrupil|predoziral|ustrelil)(?:a)? se bom|se bom (?:obesil|zastrupil|predoziral|ustrelil)(?:a)?|(?:se obesim|obesim se))\b` },
    { signal: "method", pattern: String.raw`\b${WANT} se (?:obesiti|zastrupiti|predozirati|utopiti|ustreliti)\b` },
    { signal: "method", pattern: String.raw`\b(?:skocim|skocil(?:a)? bom|bom skocil(?:a)?|vrzem se|vrgel(?:a)? se bom|se bom vrgel(?:a)?|hocem skociti)\b.{0,15}\b(?:z mostu|z okna|s strehe|z strehe|z balkona|pod vlak|pod avto|z visine|s pecine)\b` },
    { signal: "method", pattern: String.raw`\b(?:prerezal(?:a)? si bom|si bom prerezal(?:a)?|prerezem si|si prerezem) (?:zile|zapestje)\b` },
    { signal: "method", pattern: String.raw`\b(?:vzel(?:a)? sem|pogoltnil(?:a)? sem|bom vzel(?:a)?|bom pogoltnil(?:a)?|vzamem|pogoltnem) (?:vse|celo skatlico|celo skatlo|cel paket)\b.{0,15}\b(?:tablete|tablet|tabletke|zdravila|uspavala|pilule)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:se (?:hoce|zeli|namerava) ubiti|se bo ubil(?:a)?|se je (?:poskusil(?:a)?|hotel(?:a)?) ubiti|(?:hoce|zeli|namerava|je poskusil(?:a)?|je hotel(?:a)?) (?:narediti|storiti) samomor|(?:hoce|zeli) (?:si vzeti zivljenje|umreti\b(?! doma| v | na ))|grozi,? da se bo ubil(?:a)?|(?:razmislja|govori) o samomoru|se (?:reze|samoposkoduje)|ima samomorilne misli|je samomoriln(?:en|na|a)|si namerno skoduje)` },
    { signal: "other-person", pattern: String.raw`\b(?:nekdo|oseba|clovek),? (?:ki ga|ki jo) (?:poznam|imam rad(?:a)?|ljubim)\b.{0,40}\b(?:se hoce ubiti|samomor|samoposkod|se reze)` },
    { signal: "other-person", pattern: String.raw`\b(?:se (?:hoce|zeli) ubiti|grozi,? da se bo ubil(?:a)?|pravi,? da se bo ubil(?:a)?)\b` }
  ])
});
