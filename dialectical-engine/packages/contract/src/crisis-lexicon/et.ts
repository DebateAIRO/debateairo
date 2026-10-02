import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without diacritics: questions and patterns are both normalised
// ("tahan end ära tappa" → "tahan end ara tappa", "võtta" → "votta", "üles" → "ules"),
// so either spelling matches.

// First-person "I want / I'd like / I plan / I should", before an infinitive.
const WANT = String.raw`(?:tahan|tahaks|tahaksin|tahtsin|tahan lihtsalt|kavatsen|plaanin|motlen|motlesin|kaalun|proovin|proovisin|uritan|uritasin|lahen|peaksin|ma peaks|kas peaks|otsustasin|olen valmis|pean)`;
// "kill myself / take my life / end my life / hang myself" as an infinitive (-ta/-da or -ma).
const ACT = String.raw`(?:(?:end|ennast|iseennast|ise end) (?:ara )?(?:tappa|tapma|maha lasta|maha laskma|ules puua|ules pooma)|(?:tappa|tapma) (?:end|ennast|iseennast)(?: ara)?|endalt elu (?:votta|votma)|(?:votta|votma) endalt elu|(?:lopetada|lopetama) (?:oma )?elu|oma elu (?:lopetada|lopetama)|(?:oma elule|koigele) lopp?u? (?:teha|tegema)|endale otsa? peale (?:teha|tegema)|enesetapp?u? (?:teha|tegema|sooritada|sooritama)|(?:sooritada|sooritama|teha|tegema) enesetapp?u?|suitsiidi (?:teha|sooritada))`;
// People close to the writer, for `other-person` (nominative, as people type them).
const CLOSE = String.raw`(?:parim )?(?:sober|sobranna|poiss-sober|poiss sober|poisssober|tudruk|tudruksober|elukaaslane|abikaasa|mees|naine|poeg|tutar|vend|ode|ema|emme|isa|issi|laps|teismeline|toakaaslane|klassivend|klassiode|klassikaaslane|kolleeg|tookaaslane|nobu|vanaema|vanaisa|lapselaps|opilane)`;

export const ET: CrisisLexicon = Object.freeze({
  language: "et",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${WANT}(?: [a-z]+){0,2} ${ACT}\b` },
    { signal: "intent", pattern: String.raw`\b(?:tapan|tapaksin|tapsin peaaegu) (?:end|ennast|iseennast)\b` },
    { signal: "intent", pattern: String.raw`\b(?:end|ennast) (?:ara )?(?:tapan|tapaksin)\b` },
    { signal: "intent", pattern: String.raw`\b(?:votan|votaksin) endalt elu\b|\bendalt elu votan\b` },
    { signal: "intent", pattern: String.raw`\b(?:lopetan|lopetaksin) (?:oma )?elu\b|\b(?:teen|teeksin) (?:oma elule|koigele|endale) (?:lopu|otsa peale|ots peale)\b` },
    { signal: "intent", pattern: String.raw`\b(?:sooritan|teen) (?:enesetapu|enesetappu|suitsiidi)\b|\bpoon (?:end|ennast) ules\b` },
    { signal: "intent", pattern: String.raw`\b(?:tahan|tahaks|tahaksin|tahan lihtsalt|tahaks lihtsalt|ma tahan) (?:lihtsalt |juba |ainult )?(?:surra|surnud olla|ara surra)\b(?! (?:naerda|naerma|naerust|habist|habi parast|eest|kodus|vanana|vanaduses|rahulikult|vaarikalt|oma voodis|nagu)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:ei taha|ei tahaks|ei soovi|ei viitsi) enam (?:elada|elus olla|olemas olla|argata|edasi elada)\b(?! (?!kas\b)[a-z]+s\b)` },
    { signal: "intent", pattern: String.raw`\b(?:ei taha|ei tahaks|ei soovi) (?:elada|elus olla|olemas olla|edasi elada|enam)\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\bmul (?:on|oli|on olnud|tekivad|tekkisid|on jalle|on jallegi|kaivad)\b.{0,20}\b(?:enesetapumot|suitsiidimot|suitsidaalse?d mott)` },
    { signal: "intent", pattern: String.raw`\b(?:motlen|motlesin) (?:tihti |pidevalt |jalle |juba |sageli |viimasel ajal )?(?:enesetapule|enesetapust|suitsiidile|enesetapu peale)\b` },
    { signal: "intent", pattern: String.raw`\b(?:olen|olin|tunnen end|tunnen ennast|tunnen)\b(?: [a-z]+){0,2} suitsidaal(?:ne|sena|seks)\b` },
    { signal: "intent", pattern: String.raw`\bparem\b.{0,20}\b(?:oleksin|oleks|olla) (?:ma )?surnud\b|\boleksin (?:parem|parem lihtsalt) surnud\b` },
    { signal: "intent", pattern: String.raw`\b(?:oleksin|ma oleks|ma oleksin) (?:parem |pigem )?(?:lihtsalt )?sundimata\b|\bmiks ma uldse sundisin\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:loikan|loikasin|loikun|vigastan|vigastasin|kahjustan|poletan|poletasin|kriibin|kraabin|kraapisin|peksan) (?:end|ennast|iseennast)\b(?! (?:kogemata|kogemata kombel|koogis|habet ajades))` },
    { signal: "self-harm", pattern: String.raw`\b(?:end|ennast) (?:jalle |uuesti |ikka )?(?:loikan|loikasin|vigastan|vigastasin|poletan|kraabin)\b` },
    { signal: "self-harm", pattern: String.raw`\b${WANT}(?: [a-z]+){0,2} (?:end|ennast) (?:loigata|vigastada|kahjustada|poletada|loikuda|valu teha)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:mu|minu|oma) (?:enesevigastami|enesekahjustami)` },
    { signal: "self-harm", pattern: String.raw`\b(?:tegelen|olen tegelenud|tegelesin) (?:jalle )?(?:enesevigastamisega|enesekahjustamisega|loikumisega)\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:mu|minu) elu\b(?: [a-z]+){0,3} (?:elamist vaart|vaart elamist|midagi vaart|mottetu)\b` },
    { signal: "decision", pattern: String.raw`\b(?:mu|minu) elul (?:on |pole |ei ole |ikka )?(?:enam |uldse )?(?:mingit )?(?:motet|mottet)\b` },
    { signal: "decision", pattern: String.raw`\b(?:pole|ei ole|ei nae) (?:enam )?(?:mingit )?(?:motet|pohjust) (?:edasi )?elada\b(?! (?!kas\b)[a-z]+(?:s|l)\b)` },
    { signal: "decision", pattern: String.raw`\b(?:elada voi surra|surra voi elada|elama voi surema)\b` },
    { signal: "decision", pattern: String.raw`\b(?:peaksin|ma peaks) (?:lihtsalt )?(?:surema|edasi elama|elama jaama|elus pusima)\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\b(?:enesetapp|suitsiid)\b.{0,30}\b(?:minu jaoks|mulle|minule|mu ainus|minu ainus)\b` },
    { signal: "decision", pattern: String.raw`\b(?:mu|minu|mul on) ainus (?:valjapaas|lahendus|variant|valik)\b.{0,15}\b(?:enesetapp|surm|surra|suitsiid)` },
    { signal: "decision", pattern: String.raw`\bkui ma (?:sureksin|ara sureksin|kaoksin|oleksin surnud|end tapaksin|tapaksin end)\b.{0,40}\b(?:hooliks|markaks|igatseks|puudust tunneks|kurvastaks)\b` },
    { signal: "decision", pattern: String.raw`\b(?:hooliks|markaks|igatseks|puudust tunneks)\b.{0,40}\bkui ma (?:sureksin|ara sureksin|kaoksin|oleksin surnud|end tapaksin|tapaksin end)\b` },
    // method
    { signal: "method", pattern: String.raw`\bkuidas\b(?: [a-z]+){0,2} (?:(?:end|ennast) (?:ara )?tappa|tappa (?:end|ennast)|endalt elu votta|enesetapp?u? (?:teha|sooritada)|sooritada enesetapp?u?|(?:end|ennast) ules puua|uledoseerida|uledoosi (?:votta|teha))\b` },
    { signal: "method", pattern: String.raw`\bkuidas (?:end|ennast) (?:[a-z]+ )?(?:ara )?tappa\b` },
    { signal: "method", pattern: String.raw`\bkuidas (?:koige )?(?:valutult|valutumalt|kiiresti|kiiremini|kergelt|lihtsalt|kindlalt) surra\b|\bkuidas surra (?:valutult|kiiresti|kergelt|kindlalt)\b` },
    { signal: "method", pattern: String.raw`\b(?:valutu|valutuim|koige valutum|lihtsaim|koige lihtsam|kiireim|koige kiirem|kindlaim|koige kindlam|parim|lihtne|kiire|kerge) (?:viis|viisid|meetod|meetodid|moodus|voimalus)\b.{0,15}\b(?:surra|end tappa|ennast tappa|enesetappu teha|enesetapuks|elu lopetada|endalt elu votta)\b` },
    { signal: "method", pattern: String.raw`\benesetapu(?:kiri|kirja|plaan|plaani|meetod|meetodid|meetodeid|pakt|pakti|viis|viisid)\b` },
    { signal: "method", pattern: String.raw`\b(?:mitu|kui palju|kui suur)\b.{0,40}\b(?:surmav|surmava|letaalne|letaalse|surmaks|et surra|et ma sureksin|et end tappa|et ennast tappa|tapaks mind|mind tapaks)\b` },
    { signal: "method", pattern: String.raw`\bkui (?:korgelt|korge|korgele)\b.{0,40}\b(?:et surra|surmaks|et end tappa|et ma sureksin|et ennast tappa)\b` },
    { signal: "method", pattern: String.raw`\b(?:huppan|huppaksin|viskan end|viskan ennast|heidan end)\b(?: [a-z]+){0,2} (?:sillalt|katuselt|aknast|rodult|kaljult|korruselt|rongi ette|rongi alla|auto ette|auto alla|bussi ette|bussi alla)\b` },
    { signal: "method", pattern: String.raw`\b${WANT}(?: [a-z]+){0,2} (?:sillalt|katuselt|aknast|rodult|kaljult|rongi ette|rongi alla|auto alla|auto ette) (?:alla |valja )?(?:hupata|visata)\b` },
    { signal: "method", pattern: String.raw`\b(?:votan|votsin|neelan|neelasin|votta|neelata) (?:korraga )?(?:koik|terve (?:purgi|paki|karbi|pudeli)) (?:oma |mu )?(?:tabletid|tablette|pillid|pille|rohud|rohtu|unerohud|unerohtu|ravimid|ravimeid)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b(?:mu|minu|meie) ${CLOSE}\b.{0,50}\b(?:(?:tahab|kavatseb|plaanib|ahvardab|ahvardas|proovis|uritas|motleb|kaalub|raagib)\b(?: [a-z]+){0,2} (?:(?:end|ennast) (?:ara )?(?:tappa|tapma)|endalt elu (?:votta|votma)|oma elu lopetada|surra|enesetapu|enesetapule|enesetapust|enesetappu)|on suitsidaalne|tunneb end suitsidaalsena|loikab (?:end|ennast)|vigastab (?:end|ennast)|tegeleb enesevigastamisega)` },
    { signal: "other-person", pattern: String.raw`\b(?:mu|minu) [a-z-]+l on\b.{0,15}\b(?:enesetapumot|suitsiidimot)` },
    { signal: "other-person", pattern: String.raw`\b(?:tahab|tahavad|kavatseb|plaanib|ahvardab|ahvardas|ahvardavad) (?:end|ennast) (?:ara )?tappa\b` },
    { signal: "other-person", pattern: String.raw`\b(?:tahab|kavatseb|ahvardab|ahvardas) endalt elu votta\b` }
  ])
});
