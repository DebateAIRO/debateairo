import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without fadas: questions and patterns are both normalised
// ("mé féin a mharú" → "me fein a mharu", "bás a fháil" → "bas a fhail"), so either spelling
// matches. Irish marks the person with "mé féin" (myself) and "mo" (my); lenited forms
// ("fhéinmharú" after "ar") are listed beside the plain ones.

// First-person "I want / I'd like / I'm going to / should I", before a verbal noun.
const WANT = String.raw`(?:ba mhaith liom|ba mhian liom|is mian liom|ba bhrea liom|teastaionn uaim|ta me ag iarraidh|taim ag iarraidh|ta fonn orm|taim chun|ta me chun|ta me ag dul|taim ag dul|taim ag smaoineamh ar|ta me ag smaoineamh ar|taim ag beartu|ta me ag beartu|ar choir dom|ar cheart dom|an cheart dom|an choir dom|ba choir dom|ba cheart dom|rinne me iarracht|b'fhearr liom)`;
// "kill myself / die / take my own life / end my life" as a verbal noun.
const ACT = String.raw`(?:(?:me|mise) fein a (?:mharu|mharbhu|chrochadh|bhathadh|lamhach|nimhiu)|me fein a chur chun bais|bas a fhail|bas a fhagail|lamh a chur i mo bhas fein|fh?einmharu a dheanamh|deireadh a chur le mo (?:shaol|bheatha)(?: fein)?|a bheith marbh|bheith marbh|imeacht on saol seo)`;
// People close to the writer, for `other-person`.
const CLOSE = String.raw`(?:mo (?:chara is fearr|chara|dhluthchara|dhearthair|dheirfiur|mhac|mham|mhamai|mhathair|dhaid|dhaidi|bhean cheile|bhean|phaiste|leanbh|bhuachaill|chailin|phairti|chol ceathrair|chomhghleacai|dhalta|sheanmhathair|sheanathair|nia|neacht|mhac leinn)|m'(?:inion|athair|fhear cheile|fhear ceile|fhear)|cara liom|cara de mo chuid)`;
const ABOUT_THEM = String.raw`(?:(?:e|i) fein a (?:mharu|mharbhu|ghortu|ghearradh|chrochadh|bhathadh)|(?:ag gearradh|ag gortu) (?:e|i) fein|a (?:ghearradh|gearradh|ghortu|gortu) fein|lamh a chur ina (?:bhas|bas) fein|(?:ag caint|ag smaoineamh|ag cuimhneamh|ag bagairt) (?:ar|faoi) fh?einmharu|smaointe fh?einmharaithe (?:aige|aici)|fh?einmharfach|ag deanamh fh?eindochair)`;

export const GA: CrisisLexicon = Object.freeze({
  language: "ga",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${WANT}(?: [a-z']+){0,2} ${ACT}\b(?! (?:i|in|sa|sna|ar|le|leis|go siochanta|go sochmaidh|go ciuin|mar|ag|san|den|de|don|do|nuair)\b)` },
    { signal: "intent", pattern: String.raw`\bmar(?:oidh|faidh) me me fein\b|\bmar(?:oinn|fainn|aim) me fein\b` },
    { signal: "intent", pattern: String.raw`\blamh (?:a chur )?i mo bhas fein\b` },
    { signal: "intent", pattern: String.raw`\b(?:nil me ag iarraidh|nilim ag iarraidh|nior mhaith liom|ni theastaionn uaim|ni mian liom|nior mhian liom|nil fonn orm) (?:a )?(?:mhaireachtail|maireachtail|bheith beo|leanuint ar aghaidh|dhuiseacht|duiseacht)\b(?! (?:i|in|sa|sna|ar|le|gan|anseo|ansin|faoi|mar|leis)\b)` },
    { signal: "intent", pattern: String.raw`\bsmaointe (?:fh?einmharaithe|(?:ar|faoi) fh?einmharu)\b.{0,20}\b(?:agam|chugam)\b` },
    { signal: "intent", pattern: String.raw`\b(?:taim|ta me|bim|bionn me|bhi me|bhiodh)\b(?: [a-z']+){0,2} (?:ag smaoineamh|ag cuimhneamh|ag machnamh) (?:ar|faoi) fh?einmharu\b` },
    { signal: "intent", pattern: String.raw`\b(?:taim|ta me|bim|bionn me|mothaim|airim)\b(?: [a-z']+){0,2} fh?einmharfach\b` },
    { signal: "intent", pattern: String.raw`\b(?:is fearr|b'fhearr|ab fhearr)\b.{0,20}\b(?:a bheinn marbh|da mbeinn marbh|bheinn marbh|da bhfaighinn bas|me a bheith marbh)\b` },
    { signal: "intent", pattern: String.raw`\bnar (?:rugadh|saolaiodh) (?:riamh )?me\b` },
    { signal: "intent", pattern: String.raw`\b(?:ni feidir liom|nil me in ann|nilim in ann) (?:leanuint ar aghaidh|dul ar aghaidh|maireachtail mar seo|cur suas leis seo) (?:a thuilleadh|nios mo)\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:ag gearradh|ag gortu|ag dogadh|ag loscadh|ag scriobadh) me fein\b(?! (?:de thaisme|tri thimpiste)\b)|\bdo mo (?:ghearradh|ghortu|dhogadh|loscadh) fein\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:gearraim|gortaim|loiscim|dhoim) me fein\b|\b(?:ghearr|dhoigh|loisc) me me fein\b` },
    { signal: "self-harm", pattern: String.raw`\b${WANT}(?: [a-z']+){0,2} (?:me fein a ghortu|me fein a ghearradh|me fein a dho|dochar a dheanamh dom fein)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:mo chuid fh?eindoch|m'fh?eindoch|mo fh?eindoch)|\b(?:bim|taim|ta me|bionn me) ag deanamh fh?eindochair\b` },
    // decision
    { signal: "decision", pattern: String.raw`\ban fiu (?:mo shaol|mo bheatha|dom maireachtail|domsa maireachtail|dom leanuint ar aghaidh)\b` },
    { signal: "decision", pattern: String.raw`\bmo shaol\b(?: [a-z']+){0,3} (?:gan fiuntas|gan chiall|gan mhaith|nach fiu|ni fiu faic|fiu a mhaireachtail)\b` },
    { signal: "decision", pattern: String.raw`\bnil (?:aon )?(?:chiall|phointe|pointe|fath) (?:le mo shaol|le maireachtail|dom maireachtail|leanuint ar aghaidh|mo shaol a chaitheamh)\b(?! (?:i|in|sa|anseo|ansin|le|gan)\b)` },
    { signal: "decision", pattern: String.raw`\b(?:fanacht beo|maireachtail) no bas a fhail\b` },
    { signal: "decision", pattern: String.raw`\bfh?einmharu\b.{0,25}\b(?:domsa|dom|an t-aon rogha ata agam|an t-aon bhealach amach)\b` },
    { signal: "decision", pattern: String.raw`\b(?:an t-aon|an aon) (?:rogha|bhealach amach|bealach amach|reiteach) (?:ata agam|dom)\b.{0,20}\b(?:fh?einmharu|bas|bas a fhail)\b` },
    { signal: "decision", pattern: String.raw`\b(?:an mbeadh|an dtabharfadh|an airfeadh|an gcronofadh|ar chuma le|nach gcuirfeadh)\b.{0,40}\bda (?:bhfaighinn bas|mbeinn marbh|maroinn me fein|n-imeoinn|mbeinn imithe)\b` },
    { signal: "decision", pattern: String.raw`\bda (?:bhfaighinn bas|mbeinn marbh|maroinn me fein|mbeinn imithe)\b.{0,40}\b(?:an mbeadh|an dtabharfadh|an airfeadh|an gcronofadh|ar chuma le|nach gcuirfeadh)\b` },
    // method
    { signal: "method", pattern: String.raw`\b(?:conas|cen chaoi|cen bealach|cen sli)\b(?: [a-z']+){0,2} (?:me fein a mharu|tu fein a mharu|do mharu fein|fh?einmharu a dheanamh|bas a fhail gan phian|bas a fhail go tapa|bas a fhail go sciobtha|lamh a chur i mo bhas fein|me fein a chrochadh|ro-dhaileog a ghlacadh|rodhaileog a ghlacadh)\b` },
    { signal: "method", pattern: String.raw`\b(?:bealach|sli|modh|slite|bealai|modhanna) (?:gan phian|is fusa|is tapula|is sciobtha|is sabhailte|is cinnte|is fearr|eascaidh|tapaidh|is lu pian)\b.{0,20}\b(?:bas a fhail|me fein a mharu|chun bas|fh?einmharu)\b` },
    { signal: "method", pattern: String.raw`\b(?:nota|litir|plean|modhanna|modh|comhshocru) fh?einmharaithe\b` },
    { signal: "method", pattern: String.raw`\b(?:ce mhead|cen airde)\b.{0,40}\b(?:chun bas a fhail|le bas a fhail|go bhfaighinn bas|a mharodh me|a mharfadh me|daileog mharfach|dhaileog mharfach)\b` },
    { signal: "method", pattern: String.raw`\b(?:leimfidh me|leimfinn|caithfidh me me fein|chaithfinn me fein)\b.{0,20}\b(?:den droichead|de dhroichead|den aill|d'aill|os comhair (?:an )?traenach|faoi thraein|faoin traein|den bhalcoin|den dion|os comhair cairr)\b` },
    { signal: "method", pattern: String.raw`\b(?:ghlac me|shloig me|glacfaidh me|sloigfidh me|taim chun|ta me chun|ba mhaith liom)\b.{0,15}\b(?:na piollai (?:ar fad|go leir|uile)|na taibleid (?:ar fad|go leir)|buideal iomlan|bosca iomlan|gach piolla|paicead iomlan)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,60}\b${ABOUT_THEM}` },
    { signal: "other-person", pattern: String.raw`\bsmaointe fh?einmharaithe ag (?:mo|m')` },
    { signal: "other-person", pattern: String.raw`\b(?:ag iarraidh|chun|ag bagairt|ag beartu|ag smaoineamh ar) (?:e|i) fein a mharu\b` }
  ])
});
