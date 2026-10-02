import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Normalisation folds ċ, ġ and ż to c, g and z, but ħ is its own letter and survives: people
// without a Maltese keyboard type "h" and "gh", so every ħ is written [ħh].
const MYSELF = String.raw`(?:lili )?(?:i?nnifsi|nifsi|lili stess)`;
const HIMSELF = String.raw`(?:lilu |lilha |lilhom )?(?:i?nnifsu|nifsu|i?nnifisha|nifisha|infushom|i?nnifsha)`;
// Kin and people close to the writer, for `other-person`.
const CLOSE = String.raw`(?:[ħh]abib tieg[ħh]i|[ħh]abiba tieg[ħh]i|l-a[ħh]jar [ħh]abib tieg[ħh]i|l-a[ħh]jar [ħh]abiba tieg[ħh]i|[ħh]bieb tieg[ħh]i|ibni|binti|[ħh]ija|o[ħh]ti|ommi|missieri|ragli|marti|l-g[ħh]arus tieg[ħh]i|l-g[ħh]arusa tieg[ħh]i|sie[ħh]bi|sie[ħh]bti|kugini|kugina|il-kollega tieg[ħh]i|student tieg[ħh]i|studenta tieg[ħh]i|neputi|neputija|in-nannu|in-nanna|zijuwi|zijuti|it-tifel tieg[ħh]i|it-tifla tieg[ħh]i|uliedi|it-tifel|it-tifla)`;
const DIE = String.raw`(?:immut|mmut|nmut)`;

export const MT: CrisisLexicon = Object.freeze({
  language: "mt",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b(?:noqtol|noqtlu|qed noqtol|nipprova noqtol) ${MYSELF}\b` },
    { signal: "intent", pattern: String.raw`\b(?:nikkommetti|nag[ħh]mel) (?:is-)?suw?icidju\b` },
    { signal: "intent", pattern: String.raw`\b(?:irrid|nrid|nixtieq|nippreferi|ridt|in[ħh]oss li rrid|qed nixtieq) (?:biss )?${DIE}\b(?! (?:bid-da[ħh]k|bl-ist[ħh]ija|bil-gu[ħh]|bil-bard|g[ħh]al|biex nara|nara|fuq|minn)\b)` },
    { signal: "intent", pattern: String.raw`\bma (?:n?rridx|nridx|g[ħh]adx (?:i?n?rrid|nrid)|g[ħh]adnix (?:i?n?rrid|nrid)) (?:aktar |iktar )?ng[ħh]ix\b(?! (?:f'|fi\b|fil-|fl-|fid-|fit-|fis-|fir-|fin-|fiz-|ma'|mal-|hawn|hemm|go\b|gewwa|m'|mieg[ħh]|ming[ħh]ajr|b'))` },
    { signal: "intent", pattern: String.raw`\bma (?:n?rridx|nridx|g[ħh]adx (?:i?n?rrid|nrid)) (?:aktar |iktar )?ng[ħh]ix\s*(?:$|[.!?,;]|aktar|iktar)` },
    { signal: "intent", pattern: String.raw`\b(?:m'g[ħh]andix|ma g[ħh]andix|l-ebda|ebda|m'hemmx|ma hemmx|m'g[ħh]adx g[ħh]andi) (?:[a-z']+ )?(?:raguni|ragunijiet|sens|g[ħh]an) (?:biex|g[ħh]alfejn|ta'|li) (?:i?ng[ħh]ix|nibqa' ng[ħh]ix|inkompli ng[ħh]ix)\b(?! (?:f'|fi\b|fil-|fl-|hawn|hemm))` },
    { signal: "intent", pattern: String.raw`\b[ħh]ajti\b.{0,20}\b(?:ma tiswa xejn|ma tiswiex|m'g[ħh]andhiex sens|ma g[ħh]andhiex sens|m'g[ħh]adx g[ħh]andha sens|bla sens|m'g[ħh]adha tiswa xejn)` },
    { signal: "intent", pattern: String.raw`\b(?:nixtieq|kont nippreferi|kien ikun a[ħh]jar) (?:li )?qatt ma twelidt\b` },
    { signal: "intent", pattern: String.raw`\b(?:ikunu|ikun|kienu jkunu|tkun|jkunu|kulhadd ikun|kul[ħh]add ikun) a[ħh]jar ming[ħh]ajri\b` },
    { signal: "intent", pattern: String.raw`\b(?:inkun|nkun|kont inkun) a[ħh]jar (?:mejjet|mejta)\b` },
    { signal: "intent", pattern: String.raw`\b(?:jien|in[ħh]ossni|qed inkun|sirt|g[ħh]adni|nhossni|ninsab)\b.{0,15}\bsuw?icidali\b` },
    { signal: "intent", pattern: String.raw`\b(?:g[ħh]andi|kelli|qed ikolli|rega' kelli|ghandi) (?:[a-z']+ )?[ħh]sibijiet (?:suw?icidali|ta' suw?icidju|ta' mewt|li noqtol|biex noqtol)` },
    { signal: "intent", pattern: String.raw`\b(?:na[ħh]seb|qed na[ħh]seb|[ħh]sibt|nibqa' na[ħh]seb|dejjem na[ħh]seb) (?:[a-z']+ ){0,2}fis-suw?icidju\b(?! assistit)` },
    { signal: "intent", pattern: String.raw`\b(?:na[ħh]seb|qed na[ħh]seb|[ħh]sibt) (?:biex|li|kif) (?:noqtol ${MYSELF}|nikkommetti suw?icidju|${DIE}\s*(?:$|[.!?,;]))` },
    { signal: "intent", pattern: String.raw`\b(?:i?ntemm [ħh]ajti|nispicca [ħh]ajti|nispicca b'[ħh]ajti|nie[ħh]u [ħh]ajti|ntemm il-[ħh]ajja tieg[ħh]i|nispicca l-[ħh]ajja tieg[ħh]i)\b(?! f'idejja| f'idi| lura)` },
    { signal: "intent", pattern: String.raw`\bnispicca(?:ha)? kollox\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\bnispiccaha darba g[ħh]al dejjem\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:i?nwegga'?|weggajt|na[ħh]raq|[ħh]raqt|naqta'?|qtajt|inqatta'?|nobrox|brixt|nisla[ħh]) ${MYSELF}\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:nag[ħh]mel|g[ħh]amilt|qed nag[ħh]mel) [ħh]sara (?:lil )?(?:lili )?(?:i?nnifsi|nifsi)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:naqta'?|qtajt|inqatta'?) (?:dirg[ħh]ajja|idejja|saqajja|il-polz|il-pols)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:nag[ħh]mel|g[ħh]amilt|qed nag[ħh]mel|nibqa' nag[ħh]mel|rga' bdejt nag[ħh]mel) (?:is-)?self[- ]?harm\b` },
    // decision
    { signal: "decision", pattern: String.raw`\bg[ħh]andi (?:noqtol ${MYSELF}|${DIE}|nikkommetti suw?icidju|nispicca b?'?[ħh]ajti|nibqa' ng[ħh]ix|inkompli ng[ħh]ix|ng[ħh]ix jew ${DIE})\b(?! (?:f'|fi\b|fil-|fl-|g[ħh]al|hawn|hemm|malta|g[ħh]awdex)\b)` },
    { signal: "decision", pattern: String.raw`\b(?:[ħh]ajti (?:tiswa|g[ħh]adha tiswa|g[ħh]andha sens|g[ħh]ad g[ħh]andha sens)|jist[ħh]oqqli ng[ħh]ix|ta' min (?:nibqa' )?ng[ħh]ix)\b` },
    { signal: "decision", pattern: String.raw`\bsuw?icidju\b.{0,30}\b(?:g[ħh]alija|l-uniku (?:g[ħh]azla|triq|soluzzjoni) tieg[ħh]i)` },
    { signal: "decision", pattern: String.raw`\bl-unik[au] (?:g[ħh]azla|triq|soluzzjoni|[ħh]rug|tama)\b.{0,20}\b(?:i?s-suw?icidju|i?l-mewt|${DIE}|noqtol)` },
    { signal: "decision", pattern: String.raw`\bkieku (?:${DIE}|noqtol ${MYSELF}|nisparixxi)\b.{0,40}\b(?:jinnutaw|jinduna|jindunaw|jinnota|jimmissjawni|jimmissjani|jibku|jibki|ikunu a[ħh]jar|ji[ħh]duha)\b` },
    { signal: "decision", pattern: String.raw`\b(?:jinnutaw|jinduna|jindunaw|jinnota|jimmissjawni|jimmissjani|jibku|jibki|ji[ħh]duha)\b.{0,30}\bkieku (?:${DIE}|noqtol|nisparixxi)\b` },
    // method
    { signal: "method", pattern: String.raw`\bkif (?:nista' |nista |jista' wie[ħh]ed |tista' |g[ħh]andi )?(?:noqtol ${MYSELF}|toqtol (?:lil )?(?:i?nnifsek|nifsek)|joqtol (?:lil )?(?:i?nnifsu|nifsu)|nikkommetti suw?icidju|tikkommetti suw?icidju|${DIE}|nitg[ħh]allaq)\b(?! (?:g[ħh]al|bid-da[ħh]k|f'|fil-))` },
    { signal: "method", pattern: String.raw`\b(?:mod|modi|metodu|metodi|triq)\b.{0,25}\b(?:bla ugig[ħh]|ming[ħh]ajr ugig[ħh]|facli|malajr|sikur|effettiv|l-a[ħh]jar)\b.{0,10}\b(?:biex|ta'|kif) (?:${DIE}|noqtol|toqtol|wie[ħh]ed imut|tmut|nikkommetti suw?icidju)\b` },
    { signal: "method", pattern: String.raw`\b(?:l-a[ħh]jar|l-aktar facli|l-iktar facli|l-aktar malajr|l-iktar malajr|l-inqas ugig[ħh])\b.{0,20}\b(?:biex|kif|ta') (?:${DIE}|noqtol ${MYSELF}|toqtol (?:lil )?(?:i?nnifsek|nifsek)|nikkommetti suw?icidju)\b` },
    { signal: "method", pattern: String.raw`\b(?:biex|kif) (?:${DIE}|noqtol ${MYSELF}|tmut) (?:bla|ming[ħh]ajr) ugig[ħh]\b` },
    { signal: "method", pattern: String.raw`\b(?:doza|kwantita) (?:letali|fatali|qattiela)\b` },
    { signal: "method", pattern: String.raw`\bkemm\b.{0,40}\b(?:biex|[ħh]alli) (?:${DIE}|noqtol ${MYSELF}|tmut|nag[ħh]mel overdose)\b` },
    { signal: "method", pattern: String.raw`\b(?:minn kemm|kemm irid ikun g[ħh]oli|kemm sulari|minn liema g[ħh]oli)\b.{0,40}\b(?:${DIE}|tmut|noqtol|wie[ħh]ed imut)\b` },
    { signal: "method", pattern: String.raw`\b(?:nitfa'?|nixhet|nix[ħh]et|naqbez)\b.{0,20}\b(?:irdum|il-pont|pont|bini|balkun|tieqa|xarabank|karozza|il-bejt|bejt|sulari|l-g[ħh]olja|mill-g[ħh]oli)\b` },
    { signal: "method", pattern: String.raw`\b(?:nitg[ħh]allaq|nidendel ${MYSELF}|nixxuttja ${MYSELF}|nivvelena ${MYSELF}|neg[ħh]req ${MYSELF}|nispara ${MYSELF})\b(?! (?:ma'|m'|mieg[ħh]|fi\b|f'|ma\b))` },
    { signal: "method", pattern: String.raw`\b(?:nie[ħh]u|[ħh]adt|nibla'?|blajt) (?:il-pilloli kollha|il-kaxxa kollha|kaxxa s[ħh]i[ħh]a|il-flixkun kollu|flixkun s[ħh]i[ħh])\b` },
    { signal: "method", pattern: String.raw`\b(?:overdose apposta|nag[ħh]mel overdose|ittra ta' suw?icidju|patt ta' suw?icidju|metodi ta' suw?icidju)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b(?:joqtol|toqtol|jaqta'|taqta'|jwegga'|twegga'|ja[ħh]raq|ta[ħh]raq) ${HIMSELF}\b` },
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b(?:(?:jikkommetti|tikkommetti|jag[ħh]mel|tag[ħh]mel) (?:is-)?suw?icidju|suw?icidali|(?:jag[ħh]mel|tag[ħh]mel) [ħh]sara (?:lil )?${HIMSELF}|(?:jag[ħh]mel|tag[ħh]mel) self[- ]?harm|jitg[ħh]allaq|titg[ħh]allaq|[ħh]sibijiet (?:suw?icidali|ta' suw?icidju))` },
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b(?:irid|trid|qed jg[ħh]id li jrid|qed tg[ħh]id li trid) (?:imut|tmut)\b(?! (?:g[ħh]al|bid-)\b)` },
    { signal: "other-person", pattern: String.raw`\b(?:irid|trid|qed ja[ħh]seb biex|qed ta[ħh]seb biex|hedded li|heddet li|ipprova|ippruvat) (?:joqtol|toqtol) ${HIMSELF}\b` },
    { signal: "other-person", pattern: String.raw`\bxi [ħh]add (?:li n[ħh]obb|qrib tieg[ħh]i|li naf|mill-familja)\b.{0,40}\b(?:suw?icid|joqtol|toqtol|nnifsu|nnifisha)` }
  ])
});
