import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without diacritics: questions and patterns are both normalised
// ("zabít" → "zabit", "řežu" → "rezu", "mrtvý" → "mrtvy"), so either spelling matches.

// First-person "I want / I would like / I am going to" before an infinitive.
const WANT = String.raw`(?:chci|chtel(?:a)? bych|chtela bych|hodlam|pujdu|jdu|musim|potrebuju|potrebuji|mam chut|mam sto chuti|mam v planu|planuju|planuji)`;
// People close to the writer, for `other-person` (nominative, as people type them).
const CLOSE = String.raw`(?:nejlepsi )?(?:kamarad|kamaradka|kamos|kamoska|pritel|pritelkyne|kluk|holka|partner|partnerka|manzel|manzelka|muz|zena|syn|dcera|bratr|brach|sestra|segra|mama|maminka|mamka|tata|tatinek|tatka|otec|matka|dite|decko|spoluzak|spoluzacka|spolubydlici|kolega|kolegyne|bratranec|sestrenice|vnuk|vnucka|zak|zakyne|student|studentka)`;
const MY = String.raw`(?:muj|moje|ma|moji|nas|nase)`;

export const CS: CrisisLexicon = Object.freeze({
  language: "cs",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${WANT} se zabit\b` },
    { signal: "intent", pattern: String.raw`\bse (?:chci|hodlam|pujdu|asi|nakonec) zabit\b` },
    { signal: "intent", pattern: String.raw`\b(?:zabiju|zabiji|zabil(?:a)? bych|zabila bych) se\b(?! s\b| se\b| nad\b| u\b| v\b| smichy)` },
    { signal: "intent", pattern: String.raw`\bse (?:zabiju|zabiji)\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} (?:spachat|udelat) sebevrazdu|spacham sebevrazdu|udelam sebevrazdu)\b` },
    { signal: "intent", pattern: String.raw`\b(?:myslim|premyslim|premyslim|uvazuj[iu]|porad myslim) (?:na|o) sebevra(?:zdu|zde)\b` },
    { signal: "intent", pattern: String.raw`\b(?:mam|mivam|zase mam|porad mam|trapi me|pronasleduji me)\b.{0,15}\bsebevrazedn(?:e|ych) (?:myslenky|myslenek|sklony|pocity|napady)\b` },
    { signal: "intent", pattern: String.raw`\b(?:jsem|citim se|zase jsem|jsem zase|jsem asi)\b.{0,10}\bsebevrazedn(?:y|a)\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} si (?:vzit|sahnout na) zivot|vezmu si zivot|si vezmu zivot|sahnu si na zivot|vzal(?:a)? bych si zivot)\b` },
    { signal: "intent", pattern: String.raw`\b(?:${WANT} ukoncit|ukoncim) (?:svuj )?(?:vlastni )?zivot\b(?! v | ve | u | na | jako)` },
    { signal: "intent", pattern: String.raw`\b(?:skoncovat|skoncuju|skoncuji|skoncit) (?:se sebou|se (?:svym )?zivotem)\b` },
    { signal: "intent", pattern: String.raw`\b${WANT} (?:umrit|zemrit|chcipnout|zdechnout)\b(?! za\b| pro\b| ve? stari| smichy| doma| dustojne| v klidu| ve spanku)` },
    { signal: "intent", pattern: String.raw`\bnechci (?:uz |dal |uz dal |tady )?(?:zit|existovat)\b(?! v\b| ve\b| na\b| s\b| se\b| bez\b| tady| tam| pod| jako| u\b| mezi)` },
    { signal: "intent", pattern: String.raw`\bnechci (?:uz )?(?:byt nazivu|byt na svete|se (?:uz )?(?:rano |zitra )?(?:probudit|probouzet))\b` },
    { signal: "intent", pattern: String.raw`\bnechce se mi (?:uz )?(?:zit|byt nazivu)\b` },
    { signal: "intent", pattern: String.raw`\b(?:nemam|uz nemam) (?:pro co|proc) zit\b` },
    { signal: "intent", pattern: String.raw`\bmuj zivot (?:uz )?nema (?:zadny )?(?:smysl|cenu)\b` },
    { signal: "intent", pattern: String.raw`\bzit (?:uz )?nema (?:zadny )?(?:smysl|cenu)\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\bnema (?:uz )?(?:zadny )?(?:smysl|cenu) (?:dal |uz )?zit\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\b(?:kez|radsi|rad|rada) bych (?:byl|byla) (?:uz )?mrtv(?:y|a)\b` },
    { signal: "intent", pattern: String.raw`\b${WANT} (?:uz )?byt mrtv(?:y|a)\b` },
    { signal: "intent", pattern: String.raw`\bkez bych se (?:vubec |nikdy )?(?:nenarodil|nenarodila)\b` },
    { signal: "intent", pattern: String.raw`\bbeze? me (?:by )?(?:bylo|by bylo|by jim bylo|by vsem bylo|budou|by byli|by se mely|by se meli)\b.{0,15}\b(?:lip|lepe|lepsi)\b` },
    { signal: "intent", pattern: String.raw`\b(?:uz (?:to )?(?:nemuzu|nemohu|nezvladam|nedokazu) dal|(?:nemuzu|nemohu|nedokazu) uz dal|(?:nemuzu|nemohu|nedokazu) (?:uz )?(?:takhle|dal) zit)\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:rezu|porezavam|rezala jsem|rezal jsem|porezala jsem|porezal jsem|sebeposkozuju|sebeposkozuji|sebeposkozovala jsem|sebeposkozoval jsem) se\b` },
    { signal: "self-harm", pattern: String.raw`\bse (?:rezu|porezavam|zase rezu|sebeposkozuju|sebeposkozuji|porezala|porezal)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:${WANT}|nemuzu prestat|nedokazu prestat|jak prestat) (?:se )?(?:porezat|rezat|rizout|sebeposkozovat|poskodit|popalit)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:${WANT} si ublizit|ublizuj[iu] (?:sam |sama )?(?:si|sobe)|ublizila jsem si|ublizil jsem si)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:moje|me|sve) sebeposkozovani\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:mam|mel(?:a)? bych|mela bych|nemel(?:a)? bych) se (?:proste |radsi |uz )?zabit\b(?! prac| ucen| s\b| se\b)` },
    { signal: "decision", pattern: String.raw`\b(?:mam|mel(?:a)? bych|mela bych) (?:proste |radsi |uz )?(?:spachat sebevrazdu|si vzit zivot|ukoncit (?:svuj )?zivot|umrit|zemrit)\b(?! za\b| pro\b| doma| v nemocnici)` },
    { signal: "decision", pattern: String.raw`\b(?:mam|mel(?:a)? bych|mela bych) (?:dal )?zit,? (?:nebo|ci) (?:umrit|zemrit|se zabit)\b` },
    { signal: "decision", pattern: String.raw`\b(?:ma|stoji) (?:muj|vubec muj) zivot (?:vubec |jeste |jeste vubec |porad )?(?:cenu|smysl|za to)\b` },
    { signal: "decision", pattern: String.raw`\bma (?:vubec |jeste |jeste vubec |porad )?(?:cenu|smysl) (?:dal )?zit\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bsebevrazd(?:a|u)\b.{0,30}\b(?:pro me|pro mne|moje (?:jedine|nejlepsi) (?:reseni|moznost|vychodisko))\b` },
    { signal: "decision", pattern: String.raw`\b(?:jedine|posledni) (?:reseni|vychodisko|moznost),? (?:ktere )?(?:mi zbyva|mam|mi zbylo)\b.{0,20}\b(?:smrt|sebevrazda|umrit|zemrit|zabit se)\b` },
    { signal: "decision", pattern: String.raw`\b(?:chybel(?:a)? bych|vsiml by si|vsimnul by si|zajimalo by|bylo by|trapilo by)\b.{0,25}\bkdybych (?:umrel|umrela|zemrel|zemrela|se zabil|se zabila|zmizel|zmizela|tu nebyl|tu nebyla)\b` },
    { signal: "decision", pattern: String.raw`\bduvod(?:y)? (?:proc )?(?:se nezabit|zit dal|zustat nazivu)\b` },
    // method
    { signal: "method", pattern: String.raw`\bjak (?:(?:nejlip|nejlepe|nejrychleji|rychle|bezbolestne|snadno|spolehlive|co nejrychleji) )?se (?:(?:nejlip|nejlepe|nejrychleji|rychle|bezbolestne|snadno|spolehlive|co nejrychleji) )?(?:zabit|obesit|otravit|predavkovat|utopit|zastrelit)\b` },
    { signal: "method", pattern: String.raw`\bjak (?:nejlip |nejlepe |nejrychleji |rychle |bezbolestne |snadno )?(?:spachat sebevrazdu|si vzit zivot|ukoncit svuj zivot|si podrezat zily)\b` },
    { signal: "method", pattern: String.raw`\bjak (?:nejlip |nejlepe |nejrychleji |rychle |bezbolestne |snadno |spolehlive )(?:umrit|zemrit|chcipnout)\b` },
    { signal: "method", pattern: String.raw`\b(?:bezbolestn(?:y|a|e|ou)|nejrychlejsi|nejsnazsi|nejjednodussi|nejspolehlivejsi|rychl(?:y|a)|snadn(?:y|a)|nejlepsi|jist(?:y|a)|klidn(?:y|a)) (?:zpusob|zpusoby|metoda|metody|cesta)\b.{0,15}\b(?:umrit|zemrit|se zabit|spachat sebevrazdu|smrti|ukoncit (?:svuj )?zivot|chcipnout)\b` },
    { signal: "method", pattern: String.raw`\bbezbolestn(?:a|e|ou) sebevrazd(?:a|u|y)\b` },
    { signal: "method", pattern: String.raw`\bsebevrazedn(?:y|i) (?:dopis|plan|pakt|metod[ay])\b` },
    { signal: "method", pattern: String.raw`\bsmrteln(?:a|ou|e) davk(?:a|u|y)\b` },
    { signal: "method", pattern: String.raw`\bkolik (?:[a-z]+ )?(?:prasku|tablet|tabletek|leku|paralenu|ibalginu|paracetamolu|ibuprofenu|miligramu|gramu|inzulinu|insulinu|hypnotik|antidepresiv|alkoholu)\b.{0,40}\b(?:k (?:predavkovani|smrti|umrti)|abych (?:umrel|umrela|zemrel|zemrela|se predavkoval|se predavkovala|se zabil|se zabila)|na predavkovani|zabije (?:cloveka|me))\b` },
    { signal: "method", pattern: String.raw`\b(?:z jake vysky|jak vysoko|jak vysok(?:y|a))\b.{0,40}\b(?:umrit|zemrit|abych (?:umrel|umrela)|se zabit|to zabije|je pad smrteln(?:y|ej))\b` },
    { signal: "method", pattern: String.raw`\b(?:(?:obesim|predavkuju|predavkuji|zastrelim|otravim) se|se (?:obesim|predavkuju|predavkuji|zastrelim))\b` },
    { signal: "method", pattern: String.raw`\b${WANT} se (?:obesit|predavkovat|otravit|utopit|zastrelit)\b` },
    { signal: "method", pattern: String.raw`\b(?:skocim|chci skocit|hodim se|chci se hodit|vrhnu se|lehnu si)\b.{0,15}\b(?:z mostu|z okna|ze strechy|pod vlak|pod auto|pod tramvaj|pod metro|z balkonu|z vysky|na koleje)\b` },
    { signal: "method", pattern: String.raw`\b(?:podrezu|podrezat|podrezala jsem|podrezal jsem|prorezu|prorizn(?:u|out)) si (?:zily|zapesti)\b` },
    { signal: "method", pattern: String.raw`\b(?:spolknu|vezmu|vzal(?:a)? jsem|spolkl(?:a)? jsem|zobnu|zbastim) (?:si )?(?:vsechny|celou krabicku|celou krabicku|celou krabici|celou lahvicku|celej plato|celou platu)\b.{0,15}\b(?:prasky|prasku|tabletky|tablet|tabletek|leky|leku)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:(?:chce|chtel|chtela|planuje|hrozi|vyhrozuje|se pokusil|se pokusila|pokusil se|pokusila se|zkousel|zkousela|mluvi o tom,? ze)\b.{0,15}\b(?:se zabit|zabit se|se zabije|spachat sebevrazdu|vzit si zivot|ukoncit (?:svuj )?zivot|umrit\b(?! doma| v | ve | dustojne))|se (?:rez(?:e|al|ala)|porezava|sebeposkozuje|chce zabit|zabije)|sebeposkozuje|je sebevrazedn(?:y|a)|ma sebevrazedne (?:myslenky|sklony)|mluvi o sebevrazde|si ublizuje)` },
    { signal: "other-person", pattern: String.raw`\b(?:nekdo|clovek|kamarad|kamaradka),? (?:koho|ktereho|kterou) (?:znam|miluju|miluji|mam rad|mam rada)\b.{0,40}\b(?:se chce zabit|sebevrazd|sebeposkoz|se rez)` },
    { signal: "other-person", pattern: String.raw`\b(?:(?:chce|hodla|planuje) se zabit|se chce zabit|(?:vyhrozuje|rika|pise),? ze se zabije)\b` }
  ])
});
