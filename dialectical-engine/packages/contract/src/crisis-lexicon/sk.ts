import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without diacritics: questions and patterns are both normalised
// ("zabiť" → "zabit", "mŕtvy" → "mrtvy", "ďalej" → "dalej"), so either spelling matches.

// First-person "I want / I would like / I am going to" before an infinitive.
const WANT = String.raw`(?:chcem|chcel(?:a)? by som|idem|musim|potrebujem|mam chut|mam sto chuti|mam v plane|planujem|rozhodol som sa|rozhodla som sa)`;
// People close to the writer, for `other-person` (nominative, as people type them).
const CLOSE = String.raw`(?:najlepsi |najlepsia )?(?:kamarat|kamaratka|kamos|kamoska|priatel|priatelka|frajer|frajerka|partner|partnerka|manzel|manzelka|muz|zena|syn|dcera|brat|sestra|mama|mamka|mamina|otec|ocko|tato|tatino|dieta|decko|spoluziak|spoluziacka|spolubyvajuci|spolubyvajuca|kolega|kolegyna|bratranec|sesternica|vnuk|vnucka|ziak|ziacka|student|studentka)`;
const MY = String.raw`(?:moj|moja|moje|nas|nasa)`;

export const SK: CrisisLexicon = Object.freeze({
  language: "sk",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${WANT} sa zabit\b` },
    { signal: "intent", pattern: String.raw`\bsa (?:chcem|idem|nakoniec) zabit\b` },
    { signal: "intent", pattern: String.raw`\b(?:zabijem|zabil(?:a)? by som) sa\b(?! s\b| so\b| nad\b| v\b| smiechom)` },
    { signal: "intent", pattern: String.raw`\bsa zabijem\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} (?:spachat|urobit) samovrazdu|spacham samovrazdu|urobim samovrazdu)\b` },
    { signal: "intent", pattern: String.raw`\b(?:myslim|rozmyslam|premyslam|uvazujem|stale myslim) (?:na|o) samovrazd(?:u|e)\b` },
    { signal: "intent", pattern: String.raw`\b(?:mam|mavam|zase mam|stale mam|trapia ma|prenasleduju ma)\b.{0,15}\bsamovrazedn(?:e|ych) (?:myslienky|myslienok|sklony|pocity)\b` },
    { signal: "intent", pattern: String.raw`\b(?:som|citim sa|zase som|som asi)\b.{0,10}\bsamovrazedn(?:y|a)\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} si (?:vziat|siahnut na) zivot|vezmem si zivot|si vezmem zivot|siahnem si na zivot|vzal(?:a)? by som si zivot)\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} ukoncit|ukoncim) (?:svoj )?(?:vlastny )?zivot\b(?! v | vo | u | na | ako)` },
    { signal: "intent", pattern: String.raw`\b(?:skoncovat|skoncujem|skoncit) (?:so sebou|so (?:svojim )?zivotom)\b` },
    { signal: "intent", pattern: String.raw`\b${WANT} (?:umriet|zomriet|chcipnut|zdochnut)\b(?! za\b| pre\b| v starobe| od smiechu| doma| dostojne| v pokoji| v spanku)` },
    { signal: "intent", pattern: String.raw`\bnechcem (?:uz |dalej |uz dalej )?(?:zit|existovat)\b(?! v\b| vo\b| na\b| s\b| so\b| bez\b| tu\b| tam| pod| ako| u\b| medzi)` },
    { signal: "intent", pattern: String.raw`\bnechcem (?:uz )?(?:byt nazive|byt na svete|sa (?:uz )?(?:rano |zajtra )?(?:zobudit|prebudit|zobudzat))\b` },
    { signal: "intent", pattern: String.raw`\bnechce sa mi (?:uz )?(?:zit|byt nazive)\b` },
    { signal: "intent", pattern: String.raw`\b(?:nemam|uz nemam) (?:pre co|preco|za co) zit\b` },
    { signal: "intent", pattern: String.raw`\bmoj zivot (?:uz )?nema (?:ziadny )?(?:zmysel|cenu)\b` },
    { signal: "intent", pattern: String.raw`\bnema (?:uz )?(?:ziadny )?(?:zmysel|cenu) (?:dalej |uz )?zit\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\b(?:kiez|radsej|rad|rada) by som (?:bol|bola) (?:uz )?mrtv(?:y|a)\b` },
    { signal: "intent", pattern: String.raw`\b${WANT} (?:uz )?byt mrtv(?:y|a)\b` },
    { signal: "intent", pattern: String.raw`\bkiez by som sa (?:vobec |nikdy )?(?:nenarodil|nenarodila)\b` },
    { signal: "intent", pattern: String.raw`\bbezo? mna (?:by )?(?:bolo|by bolo|by im bolo|by vsetkym bolo|budu|by boli)\b.{0,15}\b(?:lepsie|lepsi)\b` },
    { signal: "intent", pattern: String.raw`\b(?:uz (?:to )?(?:nemozem|nevladzem|nezvladam|nedokazem) dalej|(?:nemozem|nevladzem|nedokazem) uz dalej|(?:nemozem|nedokazem) (?:uz )?(?:takto|dalej) zit)\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:rezem|porezavam|rezala som|rezal som|porezala som|porezal som|sebaposkodzujem|sebaposkodzovala som|sebaposkodzoval som) sa\b` },
    { signal: "self-harm", pattern: String.raw`\bsa (?:rezem|porezavam|zase rezem|sebaposkodzujem)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:${WANT}|nemozem prestat|neviem prestat|ako prestat) (?:sa )?(?:porezat|rezat|sebaposkodzovat|poskodit|popalit)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:${WANT} si ublizit|ublizujem (?:sam |sama )?(?:si|sebe)|ublizila som si|ublizil som si)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:moje|svoje) sebaposkodzovanie\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:mam|mal(?:a)? by som|nemal(?:a)? by som) sa (?:proste |radsej |uz )?zabit\b` },
    { signal: "decision", pattern: String.raw`\b(?:mam|mal(?:a)? by som) (?:proste |radsej |uz )?(?:spachat samovrazdu|si vziat zivot|ukoncit (?:svoj )?zivot|umriet|zomriet)\b(?! za\b| pre\b| doma| v nemocnici)` },
    { signal: "decision", pattern: String.raw`\b(?:mam|mal(?:a)? by som) (?:dalej )?zit,? (?:alebo|ci) (?:umriet|zomriet|sa zabit)\b` },
    { signal: "decision", pattern: String.raw`\b(?:ma|stoji) (?:vobec )?moj zivot (?:vobec |este |este vobec |stale )?(?:cenu|zmysel|za to)\b` },
    { signal: "decision", pattern: String.raw`\bma (?:vobec |este |este vobec |stale )?(?:cenu|zmysel) (?:dalej )?zit\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bsamovrazd(?:a|u)\b.{0,30}\b(?:pre mna|moje (?:jedine|najlepsie) (?:riesenie|vychodisko)|moja (?:jedina|najlepsia) (?:moznost|cesta))\b` },
    { signal: "decision", pattern: String.raw`\b(?:jedine|posledne) (?:riesenie|vychodisko),? (?:ktore )?(?:mi zostava|mam|mi ostava|mi zostalo)\b.{0,20}\b(?:smrt|samovrazda|umriet|zomriet|zabit sa)\b` },
    { signal: "decision", pattern: String.raw`\b(?:chybal(?:a)? by som|vsimol by si|vsimla by si|zaujimalo by|bolo by|trapilo by)\b.{0,25}\bkeby som (?:umrel|umrela|zomrel|zomrela|sa zabil|sa zabila|zmizol|zmizla|tu nebol|tu nebola|nebol|nebola)\b` },
    { signal: "decision", pattern: String.raw`\bdovod(?:y)? (?:preco )?(?:sa nezabit|zit dalej|zostat nazive)\b` },
    // method
    { signal: "method", pattern: String.raw`\bako (?:(?:najlepsie|najrychlejsie|rychlo|bezbolestne|lahko|spolahlivo|co najrychlejsie) )?sa (?:(?:najlepsie|najrychlejsie|rychlo|bezbolestne|lahko|spolahlivo|co najrychlejsie) )?(?:zabit|obesit|otravit|predavkovat|utopit|zastrelit)\b` },
    { signal: "method", pattern: String.raw`\bako (?:najlepsie |najrychlejsie |rychlo |bezbolestne |lahko )?(?:spachat samovrazdu|si vziat zivot|ukoncit svoj zivot|si podrezat zily)\b` },
    { signal: "method", pattern: String.raw`\bako (?:najlepsie|najrychlejsie|rychlo|bezbolestne|lahko|spolahlivo) (?:umriet|zomriet|chcipnut)\b` },
    { signal: "method", pattern: String.raw`\b(?:bezbolestn(?:y|a|e|ou)|najrychlejsi|najrychlejsia|najlahsi|najjednoduchsi|najistejsi|rychl(?:y|a)|lahk(?:y|a)|najlepsi|ist(?:y|a)|pokojn(?:y|a)) (?:sposob|sposoby|metoda|metody|cesta)\b.{0,15}\b(?:umriet|zomriet|sa zabit|spachat samovrazdu|smrti|ukoncit (?:svoj )?zivot|chcipnut)\b` },
    { signal: "method", pattern: String.raw`\bbezbolestn(?:a|u|ej) samovrazd(?:a|u|y)\b` },
    { signal: "method", pattern: String.raw`\bsamovrazedn(?:y|u) (?:list|plan|pakt|metod(?:a|u))\b` },
    { signal: "method", pattern: String.raw`\bsmrteln(?:a|u|e) davk(?:a|u|y)\b` },
    { signal: "method", pattern: String.raw`\bkolko (?:[a-z]+ )?(?:tabletiek|tabliet|liekov|praskov|paralenu|ibalginu|paracetamolu|ibuprofenu|miligramov|gramov|inzulinu|inzulinu|antidepresiv|alkoholu)\b.{0,40}\b(?:na (?:predavkovanie|smrt|umrtie)|k smrti|aby som (?:umrel|umrela|zomrel|zomrela|sa predavkoval|sa predavkovala|sa zabil|sa zabila)|zabije (?:cloveka|ma))\b` },
    { signal: "method", pattern: String.raw`\b(?:z akej vysky|ako vysoko|ako vysok(?:y|a))\b.{0,40}\b(?:umriet|zomriet|aby som (?:umrel|umrela|zomrel|zomrela)|sa zabit|to zabije|je pad smrteln(?:y|a))\b` },
    { signal: "method", pattern: String.raw`\b(?:(?:obesim|predavkujem|zastrelim|otravim) sa|sa (?:obesim|predavkujem|zastrelim))\b` },
    { signal: "method", pattern: String.raw`\b${WANT} sa (?:obesit|predavkovat|otravit|utopit|zastrelit)\b` },
    { signal: "method", pattern: String.raw`\b(?:skocim|chcem skocit|hodim sa|chcem sa hodit|vrhnem sa|lahnem si)\b.{0,15}\b(?:z mosta|z okna|zo strechy|pod vlak|pod auto|pod elektricku|z balkona|z vysky|na kolaje)\b` },
    { signal: "method", pattern: String.raw`\b(?:podrezem|podrezat|podrezala som|podrezal som|prerezem) si (?:zily|zapastie)\b` },
    { signal: "method", pattern: String.raw`\b(?:zhltnem|zjem|zoberiem|vezmem|zobral(?:a)? som|vzal(?:a)? som|zhltol som|zhltla som) (?:si )?(?:vsetky|celu krabicku|celu krabicu|celu flasticku|cele balenie)\b.{0,15}\b(?:tabletky|tabletiek|tablety|tabliet|lieky|liekov|prasky|praskov)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:(?:chce|chcel|chcela|planuje|hrozi|sa vyhraza|vyhraza sa|sa pokusil|sa pokusila|pokusil sa|pokusila sa|skusal|skusala|hovori o tom,? ze)\b.{0,15}\b(?:sa zabit|zabit sa|sa zabije|spachat samovrazdu|vziat si zivot|ukoncit (?:svoj )?zivot|(?:umriet|zomriet)\b(?! doma| v | vo | dostojne))|sa (?:reze|rezal|rezala|porezava|sebaposkodzuje|chce zabit|zabije)|je samovrazedn(?:y|a)|ma samovrazedne (?:myslienky|sklony)|hovori o samovrazde|si ublizuje)` },
    { signal: "other-person", pattern: String.raw`\b(?:niekto|clovek|kamarat|kamaratka),? (?:koho|ktoreho|ktoru) (?:poznam|milujem|mam rad|mam rada)\b.{0,40}\b(?:sa chce zabit|samovrazd|sebaposkod|sa reze)` },
    { signal: "other-person", pattern: String.raw`\b(?:(?:chce|planuje) sa zabit|sa chce zabit|(?:vyhraza sa|hovori|pise),? ze sa zabije)\b` }
  ])
});
