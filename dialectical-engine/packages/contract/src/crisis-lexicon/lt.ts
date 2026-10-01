import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without diacritics: questions and patterns are both normalised
// ("nusižudyti" → "nusizudyti", "savižudybę" → "savizudybe", "gyvybę" → "gyvybe"),
// so either spelling matches.

// First-person "I want / I'd like / I plan / should I", before an infinitive.
const WANT = String.raw`(?:noriu|noreciau|norisi|noris|man norisi|galvoju|mastau|svarstau|planuoju|ketinu|bandziau|bandysiu|bandau|tureciau|ar man|ar tureciau|ar reiketu man|man reiketu|ruosiuosi|nusprendziau|einu|pasiruoses|pasiruosusi)`;
// "kill myself / take my life / end my life / hang myself" as an infinitive.
const ACT = String.raw`(?:nusizudyti|(?:nuzudyti|prazudyti) save|save (?:nuzudyti|prazudyti)|atimti sau gyvybe|sau atimti gyvybe|(?:baigti|nutraukti|uzbaigti) (?:savo )?gyvenima|savo gyvenima (?:baigti|nutraukti|uzbaigti)|(?:baigti|pabaigti) su savimi|pasikarti|nusisauti|nusinuodyti|nusiskandinti|nusokti nuo (?:tilto|stogo|balkono|uolos)|mestis (?:po traukiniu|po masina|pro langa))`;
// People close to the writer, for `other-person` (nominative, as people type them).
const CLOSE = String.raw`(?:geriausias |geriausia )?(?:draugas|drauge|vaikinas|mergina|partneris|partnere|vyras|zmona|sunus|dukra|dukte|brolis|sesuo|sese|mama|motina|tetis|tevas|vaikas|paauglys|paaugle|kambariokas|kambarioke|klasiokas|klasioke|kolega|kolege|pusbrolis|pussesere|anukas|anuke|mociute|senelis|mokinys|mokine)`;

export const LT: CrisisLexicon = Object.freeze({
  language: "lt",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${WANT}(?: [a-z]+){0,2} ${ACT}\b` },
    { signal: "intent", pattern: String.raw`\b(?:nusizudysiu|nusizudyciau|nusizudau|pasikarsiu|nusisausiu|nusinuodysiu|nusiskandinsiu|nuzudysiu save|save nuzudysiu|atimsiu sau gyvybe)\b` },
    { signal: "intent", pattern: String.raw`\bnusizudyk\b` },
    { signal: "intent", pattern: String.raw`\b(?:noriu|noreciau|norisi|noris|man norisi|tiesiog noriu) (?:tiesiog |jau |tik )?(?:nu)?mirti\b(?! (?:is|uz|namuose|oriai|ramiai|senatveje|kaip|savo lovoje|miegant)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:nebenoriu|nebenoreciau|nebesinori|nebenoriu daugiau) (?:gyventi|gyvent|egzistuoti|buti gyvas|buti gyva|pabusti|atsibusti|cia buti)\b` },
    { signal: "intent", pattern: String.raw`\b(?:nenoriu|nesinori|nenoreciau) daugiau (?:gyventi|egzistuoti|pabusti|atsibusti|buti gyvas|buti gyva)\b` },
    { signal: "intent", pattern: String.raw`\b(?:nenoriu|nesinori|nenoreciau) (?:gyventi|egzistuoti|pabusti|atsibusti|buti gyvas|buti gyva)\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\b(?:turiu|man kyla|mane kankina|vel turiu|mane apima|man vis kyla|man buna)\b.{0,15}\b(?:savizudisku minciu|savizudiskos mintys|savizudiskas mintis|minciu apie savizudybe|mintys apie savizudybe|minciu nusizudyti|mintys nusizudyti)\b` },
    { signal: "intent", pattern: String.raw`\b(?:galvoju|mastau|svarstau|vis galvoju|daznai galvoju|pradejau galvoti|rimtai galvoju) apie savizudybe\b` },
    { signal: "intent", pattern: String.raw`\b(?:esu|jauciuosi)\b(?: [a-z]+){0,2} (?:savizudis|savizude|savizudisk[a-z]*|suicidal[a-z]*)\b` },
    { signal: "intent", pattern: String.raw`\bgeriau (?:jau )?(?:buciau|busiu) (?:mires|mirusi|negimes|negimusi)\b|\b(?:buciau|busiu) geriau (?:mires|mirusi)\b` },
    { signal: "intent", pattern: String.raw`\bgeriau (?:butu|jau butu),? (?:jei|jeigu|kad) (?:as )?(?:mirciau|numirciau|nebuciau gimes|nebuciau gimusi|manes nebutu)\b` },
    { signal: "intent", pattern: String.raw`\b(?:noreciau|geriau|kad),? (?:kad )?(?:as )?(?:nebuciau gimes|nebuciau gimusi|buciau negimes|buciau negimusi)\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:pjaustausi|pjausciausi|pjaustydavausi|zalojuosi|zalojausi|susizaloju|susizalojau|susipjausciau)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:pjaustau|zaloju|zalojau|pjausciau|deginu|deginau|zalosiu) save\b` },
    { signal: "self-harm", pattern: String.raw`\bsave (?:vel |ir vel )?(?:pjaustau|zaloju|zalojau|pjausciau|deginu)\b` },
    { signal: "self-harm", pattern: String.raw`\b${WANT}(?: [a-z]+){0,2} (?:susizaloti|save zaloti|zaloti save|pjaustytis|susipjaustyti|zalotis|save pjaustyti)\b` },
    { signal: "self-harm", pattern: String.raw`\bmano (?:saves zalojim|savizal)` },
    { signal: "self-harm", pattern: String.raw`\b(?:nustoti|liautis|mesti) (?:zalotis|pjaustytis|save zaloti)\b` },
    // decision
    { signal: "decision", pattern: String.raw`\bar (?:man )?(?:dar |apskritai |is viso )?verta (?:man )?(?:toliau gyventi|gyventi toliau|gyventi)\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bmano gyvenimas\b(?: [a-z]+){0,3} (?:vertas gyventi|vertas|prasmes|prasme|beprasmis|nieko vertas|nieko nevertas)\b` },
    { signal: "decision", pattern: String.raw`\b(?:gyventi ar (?:nu)?mirti|(?:nu)?mirti ar gyventi)\b` },
    { signal: "decision", pattern: String.raw`\bnusizudyti ar (?:ne|gyventi)\b` },
    { signal: "decision", pattern: String.raw`\bnera (?:jokios |jokios man )?(?:prasmes|priezasties) (?:toliau )?gyventi\b(?! (?:lietuvoje|cia|ten|mieste|kaime|uzsienyje|siame|tokioje|vilniuje|kaune|su|be)\b)` },
    { signal: "decision", pattern: String.raw`\bar (?:man )?(?:reiketu|tureciau) (?:tiesiog )?(?:(?:nu)?mirti|gyventi toliau|toliau gyventi)\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bsavizudybe\b(?: [a-z]+){0,4} (?:man|mano vieninteli?e?|mano geriausia?|vieninteli?e? iseitis)\b` },
    { signal: "decision", pattern: String.raw`\bvienintel[a-z]* (?:iseitis|pasirinkimas|kelias)\b.{0,20}\b(?:savizudybe|mirtis|nusizudyti|mirti|numirti)\b` },
    { signal: "decision", pattern: String.raw`\b(?:ar kam nors|ar kas nors|ar kam|ar kas|niekas)\b.{0,30}\b(?:jei|jeigu) (?:as )?(?:mirciau|numirciau|nusizudyciau|dingciau|manes nebutu)\b` },
    { signal: "decision", pattern: String.raw`\b(?:jei|jeigu) (?:as )?(?:mirciau|numirciau|nusizudyciau|dingciau)\b.{0,30}\b(?:ar kas|ar kam|niekas)\b` },
    // method
    { signal: "method", pattern: String.raw`\bkaip (?:greitai |neskausmingai |lengvai |geriausia |man |galima |greiciausiai |lengviausiai )?(?:nusizudyti|pasikarti|nusisauti|nusinuodyti|atimti sau gyvybe|(?:nu)?mirti be skausmo|neskausmingai (?:nu)?mirti|perdozuoti)\b` },
    { signal: "method", pattern: String.raw`\b(?:neskausming|lengviaus|greiciaus|patikimiaus|geriaus|paprasciaus|lengv|greit|patikim|efektyviaus)[a-z]* (?:budas|budai|buda|metodas|metodai|metoda)\b(?: [a-z]+){0,2} (?:nusizudyti|(?:nu)?mirti|atimti sau gyvybe|nusizudymui)\b` },
    { signal: "method", pattern: String.raw`\bsavizudybes (?:budai|budas|buda|metodai|metodas|rastelis|rasteli|laiskas|laiska|planas|plana|paktas|pakta)\b` },
    { signal: "method", pattern: String.raw`\bkiek\b.{0,40}\b(?:kad (?:nu)?mirciau|kad (?:nu)?mirtum|kad nusizudyciau|kad nusizudytum|kad uzsimusciau|kad uzsimustum|mirtina doz|mirtinai apsinuodyti|nusizudyti)\b` },
    { signal: "method", pattern: String.raw`\b(?:kaip aukstai|koks aukstas|kokio aukscio)\b.{0,40}\b(?:kad (?:nu)?mirciau|kad (?:nu)?mirtum|kad uzsimusciau|kad uzsimustum|nusizudyti)\b` },
    { signal: "method", pattern: String.raw`\b(?:nusoksiu|soksiu|mesiuosi|pulsiu|noriu nusokti|noriu sokti|noriu mestis)\b(?: [a-z]+){0,2} (?:nuo tilto|nuo stogo|nuo balkono|nuo uolos|pro langa|po traukiniu|po masina|po automobiliu)\b` },
    { signal: "method", pattern: String.raw`\b(?:isgers|isger|prarys|praryj|suvalg)[a-z]*\b(?: [a-z]+){0,2} (?:visas|visus|visa) (?:[a-z]+ )?(?:tabletes|tableciu|vaistus|vaistu|migdomuosius|migdomuju|pakuote|dezute|piliules|piliuliu)\b` },
    { signal: "method", pattern: String.raw`\b(?:perdozuosiu|perdozavau|perdozuoti)\b.{0,10}\b(?:tycia|specialiai|samoningai)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\bmano ${CLOSE}\b.{0,50}\b(?:(?:nori|ketina|planuoja|grasina|grasino|bande|bando|galvoja|kalba|ruosiasi|sako,? kad)\b(?: [a-z]+){0,2} (?:nusizudyti|nusizudys|atimti sau gyvybe|mirti|numirti|apie savizudybe|pasikarti|nusisauti|susizaloti)|zalojasi|pjaustosi|save zaloja|save pjausto|susizaloja|yra savizud|jauciasi savizud|turi savizudisk)` },
    { signal: "other-person", pattern: String.raw`\bmano\b.{0,25}\b(?:kyla|yra|buna)\b.{0,15}\b(?:savizudisku minciu|savizudiskos mintys|minciu apie savizudybe|mintys apie savizudybe|minciu nusizudyti)` },
    { signal: "other-person", pattern: String.raw`\b(?:nori|ketina|planuoja|grasina|grasino|ruosiasi) (?:nusizudyti|atimti sau gyvybe|pasikarti)\b` }
  ])
});
