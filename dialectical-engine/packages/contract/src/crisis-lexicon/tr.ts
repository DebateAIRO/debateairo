import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Turkish. Normalisation drops the marks on ö ü ş ç ğ (ölmek → olmek) and folds İ/I to i, but
// dotless ı is its own letter and stays, while people without a Turkish keyboard type i: every
// ı is written [ıi]. Watch the folds: ölürüm → olurum ("I become"), aşmak → asmak ("to hang"),
// ölüm → olum (also slang for oğlum), so those are only used with context.
const I = "[ıi]";
const END = String.raw`\s*(?:$|[.!?,;:])`;
const CLOSE = String.raw`(?:arkadas${I}m|en yak${I}n arkadas${I}m|k${I}z arkadas${I}m|erkek arkadas${I}m|sevgilim|esim|kocam|kar${I}m|oglum|k${I}z${I}m|annem|babam|kardesim|ablam|abim|agabeyim|kuzenim|ogrencim|is arkadas${I}m|ev arkadas${I}m|s${I}n${I}f arkadas${I}m|yegenim|torunum|cocugum|nisanl${I}m|dostum)`;

export const TR: CrisisLexicon = Object.freeze({
  language: "tr",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\bintihar (?:ede(?:ce[gk]${I}m|cem|m)|edicem|edicez|etcem|ediyorum|ediyom|etmek (?:ist(?:iyorum|iyom|iyorm|iorum|iyrm)|uzereyim)|etmeyi (?:dusunuyorum|dusunuyom|planl${I}yorum|kafama koydum|istiyorum))\b` },
    { signal: "intent", pattern: String.raw`\bintihar${I} (?:dusunuyorum|dusunuyom|dusunmeye basla[dt]${I}m|planl${I}yorum)` },
    { signal: "intent", pattern: String.raw`\bintihar (?:dusuncelerim|dusuncem|dusuncelerimle|egilimim)\b|\bintihara meyilliyim\b` },
    { signal: "intent", pattern: String.raw`\bkendimi oldur` },
    { signal: "intent", pattern: String.raw`\bcan${I}ma k${I}y` },
    { signal: "intent", pattern: String.raw`(?<!(?:is|evlilik|ogrencilik|kariyer|ask|spor|siyaset|sanat|okul|universite|meslek|bekarl${I}k|sosyal medya)\s)\b(?:hayat${I}ma|yasam${I}ma) son ver` },
    { signal: "intent", pattern: String.raw`(?<!(?:tan|ten|dan|den)\s)\bolmek ist(?:iyorum|iyom|iyorm|iyrm|iorum|erdim)\b` },
    { signal: "intent", pattern: String.raw`(?<!(?:tan|ten|dan|den)\s)\bolesim (?:var|geliyor|geldi)\b` },
    { signal: "intent", pattern: String.raw`(?:^|artik |art${I}k |ben |daha fazla |bundan sonra |hic |bu hayat${I} |bu sekilde |boyle |[.!?,;] ?)yasamak (?:istemiyorum|istemiyom|istemiyorm|istemem)\b` },
    { signal: "intent", pattern: String.raw`\bkeske (?:hic )?(?:olsem|olseydim|olmus olsayd${I}m|dogmasayd${I}m|dogmam${I}s olsayd${I}m|yasamasayd${I}m|yok olsam)\b` },
    { signal: "intent", pattern: String.raw`\bolsem (?:daha iyi|kimse|kimsenin|ailem|herkes|kurtulurum|kurtulacag${I}m)\b|\bolursem (?:kimse|kimsenin|ailem|herkes)\b` },
    { signal: "intent", pattern: String.raw`\bher seye son ver(?:mek istiyorum|ecegim|icem|sem m${I})` },
    { signal: "intent", pattern: String.raw`(?:^|art${I}k |ben |hic )yasayam${I}yorum(?:${END}|\s(?:art${I}k|daha fazla|boyle))` },
    { signal: "intent", pattern: String.raw`\bnas${I}l ölür(?:üm|um)\b`, accents: "keep" },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\bkendimi (?:kes(?:iyorum|iyom|tim|mek istiyorum|ecegim|icem)|jiletl|yaral(?:${I}yorum|ad${I}m|amak istiyorum)|kanat(?:${I}yorum|t${I}m))` },
    { signal: "self-harm", pattern: String.raw`\bjilet at(?:${I}yorum|${I}yom|t${I}m|${I}cam|acag${I}m|may${I} b${I}rakam${I}yorum)|\b(?:kolumu|bilegimi|bacag${I}m${I}|kollar${I}m${I}) jiletl` },
    { signal: "self-harm", pattern: String.raw`\bkendime zarar ver(?:iyorum|iyom|dim|mek istiyorum|ecegim|icem|meyi|mekten|meye)` },
    { signal: "self-harm", pattern: String.raw`\b(?:bileklerimi|bilegimi|damarlar${I}m${I}|damar${I}m${I}) kes` },
    // decision
    { signal: "decision", pattern: String.raw`\bintihar (?:etsem|edeyim|etmeli miyim) m${I}\b|\bintihar etmeli miyim\b|\bolsem m${I}\b` },
    { signal: "decision", pattern: String.raw`\bhayat${I}m (?:yasamaya |yasanmaya )?deger mi\b` },
    { signal: "decision", pattern: String.raw`(?:^|art${I}k |hala |ben |sence |sizce |neden |niye )yasamaya devam (?:etmeli miyim|etmeliyim|edeyim mi|etsem mi)\b` },
    { signal: "decision", pattern: String.raw`\b(?:neden|niye|ne icin) (?:hala |daha )?(?:yasamal${I}y${I}m|yas${I}yorum)\b` },
    { signal: "decision", pattern: String.raw`\byasamam${I}n (?:bir |hicbir )?(?:anlam${I}|amac${I}|degeri|sebebi|nedeni) (?:var m${I}|yok|kalmad${I})|\bhayat${I}m${I}n (?:hicbir |bir )?(?:anlam${I}|amac${I}|degeri) (?:yok|kalmad${I})` },
    { signal: "decision", pattern: String.raw`\byasamak icin (?:hicbir |bir )?(?:neden|sebep|nedenim|sebebim) (?:yok|kalmad${I}|var m${I})` },
    { signal: "decision", pattern: String.raw`\bintihar\s.{0,25}(?:benim icin|bana gore|tek (?:care|cozum|c${I}k${I}s|yol|secenek))` },
    { signal: "decision", pattern: String.raw`\btek (?:caram|carem|cozumum|c${I}k${I}s yolum|secenegim|care|c${I}k${I}s yolu) (?:olmek|intihar|olum)\b` },
    { signal: "decision", pattern: String.raw`(?:kimse|kimsenin|biri|birisi|ailem|arkadaslar${I}m|insanlar|annem|babam)\s.{0,25}(?:olsem|olursem|intihar etsem|intihar edersem|kendimi oldursem|ortadan kaybolsam)\b` },
    // method
    { signal: "method", pattern: String.raw`\bnas${I}l (?:intihar (?:ederim|edebilirim|edilir|etsem|edeyim|etmeliyim|edicem|edecegim)|kendimi oldur|olebilirim|ac${I}s${I}z olurum|can${I}ma k${I}y|hayat${I}ma son ver)` },
    { signal: "method", pattern: String.raw`\bac${I}s${I}z (?:bir )?(?:sekilde |yoldan )?(?:olmenin|olmek icin|intihar|kendimi oldur|olebilirim|olunur|olmek istiyorum|olme yolu|olme yontem)` },
    { signal: "method", pattern: String.raw`\b(?:en kolay|en h${I}zl${I}|en ac${I}s${I}z|en garanti|en kesin|en etkili|kolay|garanti|kesin|h${I}zl${I}) (?:bir )?(?:intihar (?:yontemi|yolu|sekli|yontemleri)|olme (?:yolu|yontemi|sekli|yollar${I})|olmenin yolu|sekilde olmek|yoldan olmek|sekilde intihar)` },
    { signal: "method", pattern: String.raw`(?:hap|ilac|tablet|parasetamol|uyku)[a-zıi]*\s.{0,20}(?:icersem|al${I}rsam|yutarsam|icsem|alsam|yutsam)\s(?:olurum|olur muyum|olurmuyum|olebilirim)` },
    { signal: "method", pattern: String.raw`\b(?:kac|ne kadar)\b.{0,30}(?:hap|ilac|tablet|parasetamol)[a-zıi]*.{0,30}(?:oldurur|olmek icin|olmeye yeter|olumcul)` },
    { signal: "method", pattern: String.raw`\b(?:oldurucu|olumcul) (?:doz|miktar)` },
    { signal: "method", pattern: String.raw`\b(?:atlarsam|atlasam|dusersem|dussem) (?:olur muyum|olurmuyum|olurum|olebilirim)` },
    { signal: "method", pattern: String.raw`\bkendimi (?:kopru|cati|balkon|pencere|bina|ucurum|tren|metro|araba|ray|yuksek|kayal${I}k)[a-zıi' ]{0,20}at(?:acag|${I}ca|cam|mak istiyorum|ar${I}m|sam|${I}yorum)` },
    { signal: "method", pattern: String.raw`\b(?:kopruden|catidan|balkondan|pencereden|binadan|ucurumdan|yuksekten) (?:atlayacag${I}m|atl${I}yca[mk]|atl${I}cam|atlamak istiyorum|atlasam m${I}|atlayacam)` },
    { signal: "method", pattern: String.raw`\b(?:trenin|metronun|araban${I}n|kamyonun|otobusun) (?:onune|alt${I}na) (?:atlayacag|atl${I}yca|atl${I}cam|kendimi at|atlamak istiyorum|atlasam)` },
    { signal: "method", pattern: String.raw`\b(?:tavana|agaca|iple|urganla|kirise) (?:kendimi )?as(?:acag|${I}ca|${I}cam|mak istiyorum|sam|ay${I}m)` },
    { signal: "method", pattern: String.raw`\bkendimi as(?:acag${I}m|${I}cam|${I}ca[mk]|sam|mak istiyorum) (?:tavana|agaca|iple|urganla|kirise)` },
    { signal: "method", pattern: String.raw`\bzehir (?:icecegim|icicem|icip olmek|icmek istiyorum|icsem)` },
    { signal: "method", pattern: String.raw`\b(?:butun|tum|bir kutu|bir sise|kutu kutu|avuc dolusu|bir avuc)\s.{0,15}(?:hap|ilac)[a-zıi]*\s(?:icecegim|icicem|ictim|yutacag${I}m|yuttum|icsem|icmek istiyorum|ald${I}m|alacag${I}m)` },
    { signal: "method", pattern: String.raw`\b(?:haplar${I}n|ilaclar${I}n) (?:hepsini|tamam${I}n${I}) (?:icecegim|icicem|ictim|yuttum|icsem|yutacag${I}m|icmek istiyorum)` },
    { signal: "method", pattern: String.raw`\bintihar (?:mektubu|notu) yaz(?:acag|${I}ca|${I}cam|mak istiyorum|d${I}m|${I}yorum|sam)|\bintihar (?:mektubumu|notumu)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}(?:intihar (?:etmek|etmeyi) (?:ist|dusun)|intihar ede(?:cek|cegini)|intihar edicek|intihar(?:${I}|a)? (?:dusun|kalk${I}s|tesebbus|girisim|egilim|meyil)|intihar girisim|intihar etmekle tehdit|kendini (?:oldur|kes(?:iyor|ti|mek)|jiletl|yarala)|kendine zarar ver|can${I}na k${I}y|hayat${I}na son ver|olmek ist|jilet at)` },
    { signal: "other-person", pattern: String.raw`\bintihar etmekle tehdit ed` }
  ])
});
