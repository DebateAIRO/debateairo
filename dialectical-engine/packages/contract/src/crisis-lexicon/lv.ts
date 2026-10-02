import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without diacritics: questions and patterns are both normalised
// ("nogalināt sevi" → "nogalinat sevi", "pašnāvību" → "pasnavibu", "dzīvi" → "dzivi"),
// so either spelling matches.

// First-person "I want / I'd like / I plan / should I", before an infinitive.
const WANT = String.raw`(?:gribu|gribetu|gribas|man gribas|velos|veletos|planoju|taisos|grasos|meginasu|meginaju|meginu|nolemu|izlemu|esmu gatavs|esmu gatava|man vajadzetu|man vajag|vai man|iesu)`;
// "kill myself / take my life / end my life / hang myself" as an infinitive.
const ACT = String.raw`(?:nogalinat sevi|sevi nogalinat|nogalinaties|nonavet sevi|sevi nonavet|atnemt sev dzivibu|sev atnemt dzivibu|izdarit pasnavibu|pasnavibu izdarit|veikt pasnavibu|padarit sev galu|sev galu padarit|(?:izbeigt|beigt|partraukt) (?:savu )?dzivi|savu dzivi (?:izbeigt|beigt|partraukt)|pakarties|noindeties|nosauties|noslicinaties|noslikt|nolekt no (?:tilta|jumta|balkona|klints|majas)|mesties zem (?:vilciena|masinas|auto))`;
// People close to the writer, for `other-person` (nominative, as people type them).
const CLOSE = String.raw`(?:labakais |labaka )?(?:draugs|draudzene|puisis|meitene|partneris|partnere|virs|sieva|dels|meita|bralis|masa|mamma|mammu|mate|tetis|tevs|berns|pusaudzis|pusaudze|klasesbiedrs|klasesbiedrene|kolegis|kolege|bralens|masica|vecmamina|vectevs|istabas biedrs|istabas biedrene|skolnieks|skolniece)`;

export const LV: CrisisLexicon = Object.freeze({
  language: "lv",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${WANT}(?: [a-z]+){0,2} ${ACT}\b` },
    { signal: "intent", pattern: String.raw`\b(?:nogalinasu sevi|sevi nogalinasu|nogalinasos|atnemsu sev dzivibu|izdarisu pasnavibu|pasnavibu izdarisu|padarisu sev galu|izbeigsu savu dzivi|pakarsos|nosausos|noindesos|noslicinasos)\b` },
    { signal: "intent", pattern: String.raw`\b(?:gribu|gribetu|gribas|man gribas|velos|veletos) (?:vienkarsi |tikai |jau )?(?:nomirt|mirt|but mirusi|but miris|vairs nebut)\b(?! (?:no|par|ka|mierigi|majas|vecuma|ar godu|cienigi|miega|smieklos)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:negribu|nevelos|negribas|man negribas|negribetu) vairs (?:dzivot|eksistet|pamosties|but dzivs|but dziva|seit but)\b` },
    { signal: "intent", pattern: String.raw`\bvairs (?:negribu|nevelos|negribas) (?:dzivot|eksistet|pamosties)\b` },
    { signal: "intent", pattern: String.raw`\b(?:negribu|nevelos|negribas|man negribas) (?:dzivot|eksistet|pamosties|but dzivs|but dziva)(?: vairs)?\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\b(?:man|mani moka|mani vaja)\b.{0,30}\b(?:ir|bija|rodas|ir bijusas)\b.{0,15}\b(?:pasnavibas domas|pasnavnieciskas domas|suicidalas domas|domas par pasnavibu)\b` },
    { signal: "intent", pattern: String.raw`\b(?:es )?(?:domaju|saku domat|biezi domaju|atkal domaju|nopietni domaju) par pasnavibu\b` },
    { signal: "intent", pattern: String.raw`\b(?:esmu|jutos)\b(?: [a-z]+){0,2} (?:suicidals|suicidala|pasnavniecisks|pasnavnieciska)\b` },
    { signal: "intent", pattern: String.raw`\blabak (?:es )?(?:butu|busu|butu bijis|butu bijusi) (?:miris|mirusi|beigts|beigta)\b|\b(?:butu|busu) labak (?:miris|mirusi)\b` },
    { signal: "intent", pattern: String.raw`\b(?:labak|vieglak)\b.{0,20}\bja es (?:nomirtu|butu miris|butu mirusi|vairs nebutu|nebutu dzimis|nebutu dzimusi)\b` },
    { signal: "intent", pattern: String.raw`\b(?:kaut|labak) es (?:nebutu|nekad nebutu) (?:dzimis|dzimusi)\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:griezu|sagriezu|iegriezu|savainoju|savainosu|sapinu|dedzinu|apdedzinu|skrapeju|sagriezu|sadedzinu|grieztos|situ) sevi\b(?! (?:nejausi|virtuve|skujoties)\b)` },
    { signal: "self-harm", pattern: String.raw`\bsevi (?:atkal )?(?:griezu|sagriezu|savainoju|sapinu|dedzinu|skrapeju)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:nodaru|nodariju|nodarisu) sev pari\b|\bsev (?:nodaru|nodariju|nodarisu) pari\b|\bkaiteju sev (?:apzinati|tisam|speciali|ar noluku)\b` },
    { signal: "self-harm", pattern: String.raw`\b${WANT}(?: [a-z]+){0,2} (?:sevi (?:sagriezt|savainot|sapinat|griezt)|(?:sagriezt|savainot|griezt) sevi|nodarit sev pari|sev nodarit pari)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:mans|mana|manu) paskaitejum|\bnodarbojos ar paskaitejumu\b` },
    // decision
    { signal: "decision", pattern: String.raw`\bmana dzive\b(?: [a-z]+){0,3} (?:dzivosanas verta|ir ko verta|kaut ko verta|neko nav verta|ir verta|bezjediga|jeg[a-z]*)\b` },
    { signal: "decision", pattern: String.raw`\bmanai dzivei\b(?: [a-z]+){0,2} (?:jega|jegas)\b` },
    { signal: "decision", pattern: String.raw`\b(?:nav|neredzu) (?:vairs )?(?:nekadas )?(?:jegas|iemesla) (?:turpinat )?dzivot\b(?! (?:latvija|riga|seit|tur|te|laukos|pilseta|arzemes|kopa|ar|bez)\b)` },
    { signal: "decision", pattern: String.raw`\bdzivot vai (?:no)?mirt\b|\b(?:no)?mirt vai dzivot\b` },
    { signal: "decision", pattern: String.raw`\bvai man (?:vajadzetu |vajag |ir verts )?(?:turpinat dzivot|(?:no)?mirt|dzivot talak)\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bpasnaviba\b(?: [a-z]+){0,3} (?:man|prieks manis|mana vieniga|vieniga izeja)\b` },
    { signal: "decision", pattern: String.raw`\b(?:mana )?vieniga izeja\b(?: [a-z]+){0,1} (?:pasnaviba|nave|nomirt|nogalinat sevi)\b` },
    { signal: "decision", pattern: String.raw`\bvai (?:kadam|kads|kads vispar|kadam vispar)\b.{0,30}\bja es (?:nomirtu|butu miris|butu mirusi|pazustu|nogalinatu sevi|izdaritu pasnavibu)\b` },
    { signal: "decision", pattern: String.raw`\bja es (?:nomirtu|nogalinatu sevi|izdaritu pasnavibu|pazustu)\b.{0,30}\b(?:vai kads|vai kadam|neviens|kads pamanitu|kadam rupetu)\b` },
    // method
    { signal: "method", pattern: String.raw`\bka (?:lai |var |es varu |vislabak |vieglak |atri )?(?:nogalinat sevi|sevi nogalinat|nogalinaties|izdarit pasnavibu|atnemt sev dzivibu|pakarties|noindeties|nosauties|nomirt bez sapem|nesapigi nomirt|atri nomirt|pardozet)\b` },
    { signal: "method", pattern: String.raw`\b(?:vis)?(?:nesapig|vieglak|atrak|drosak|labak|vienkarsak|efektivak|mazak sapig)[a-z]* (?:veids|veidi|veidu|metode|metodes|metodi|panemiens)\b.{0,15}\b(?:nomirt|mirt|nogalinat sevi|nogalinaties|izdarit pasnavibu|atnemt sev dzivibu)\b` },
    { signal: "method", pattern: String.raw`\bnesapigi (?:nomirt|nogalinat sevi|nogalinaties)\b` },
    { signal: "method", pattern: String.raw`\bpasnavibas (?:metode|metodes|metodi|vestule|vestuli|vestules|plans|planu|pakts|paktu|veids|veidi)\b` },
    { signal: "method", pattern: String.raw`\bcik\b.{0,40}\b(?:lai nomirtu|lai mirtu|lai nogalinatu sevi|lai es nomirtu|letal|navejos|lai pardozetu|mani nogalinas|mani nogalinatu)` },
    { signal: "method", pattern: String.raw`\b(?:leksu|noleksu|metisos|mesos|meties)\b(?: [a-z]+){0,2} (?:no tilta|no jumta|pa logu|zem vilciena|zem masinas|zem auto|no klints|no balkona)\b` },
    { signal: "method", pattern: String.raw`\b(?:iedzer|izdzer|sadzer|noriju|norisu|norit)[a-z]*\b(?: [a-z]+){0,1} (?:visas|visu|pilnu|veselu)\b(?: [a-z]+){0,2} (?:tabletes|tablesu|zales|zalu|miegazales|miegazalu|iepakojumu|pacinu)\b` },
    { signal: "method", pattern: String.raw`\b(?:pardozet|pardozesu|pardozeju)\b.{0,10}\b(?:tisam|apzinati|ar noluku|speciali)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b(?:mans|mana|musu) ${CLOSE}\b.{0,50}\b(?:(?:grib|gribot|plano|draud|draudeja|meginaja|megina|taisas|grasas|doma)\b(?: [a-z]+){0,2} (?:nogalinat sevi|sevi nogalinat|nogalinaties|izdarit pasnavibu|atnemt sev dzivibu|nomirt|pakarties|nosauties|noindeties)|runa par pasnavibu|doma par pasnavibu|griez sevi|sevi griez|savaino sevi|nodara sev pari|ir suicidal[a-z]*|ir pasnavniecisk[a-z]*)` },
    { signal: "other-person", pattern: String.raw`\b(?:manam|manai|musu)\b.{0,25}\b(?:ir|bija|rodas)\b.{0,10}\b(?:pasnavibas domas|domas par pasnavibu|suicidalas domas|pasnavnieciskas domas)` },
    { signal: "other-person", pattern: String.raw`\b(?:grib|plano|draud|draudeja|taisas|grasas) (?:nogalinat sevi|sevi nogalinat|nogalinaties|izdarit pasnavibu|atnemt sev dzivibu)\b` }
  ])
});
