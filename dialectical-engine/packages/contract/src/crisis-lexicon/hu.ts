import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without accents: questions and patterns are both normalised
// ("öngyilkos" → "ongyilkos", "megölöm" → "megolom", "élni" → "elni"), so either spelling matches.

const MYSELF = String.raw`magam(?:at)?`;
// After "élni" (to live): a place, a manner or an object means it is not about staying alive
// ("nem akarok Budapesten élni", "nem akarok élni ezzel a lehetőséggel").
const NOT_A_PLACE = String.raw`(?! (?:tovabb |tobbe |mar |sem )?(?:[a-z]*(?:ban|ben|val|vel|nal|nel|hon|on|en|ott|ett|ert|nelkul)\b|itt\b|ott\b|igy\b|ugy\b|olyan|egy\b|abban|ebben|ezzel|azzal|ezekkel|azokkal|a\b|az\b))`;
// People close to the writer, with the possessive suffix, for `other-person`.
const CLOSE = String.raw`(?:legjobb )?(?:baratom|baratnom|baratnem|haverom|pasim|csajom|parom|ferjem|felesegem|fiam|lanyom|batyam|ocsem|noverem|hugom|testverem|anyam|anyukam|apam|apukam|gyerekem|gyermekem|osztalytarsam|kollegam|kolleganom|lakotarsam|szobatarsam|unokatestverem|unokam|tanitvanyom|diakom|kamasz fiam|kamasz lanyom)`;
const AT_RISK = String.raw`(?:meg akarja olni magat|megoli magat\b(?! a munka| munkaval| a sok)|meg fogja olni magat|ongyilkos (?:akar lenni|lesz|lett volna|probalt lenni)|ongyilkossagot (?:akar elkovetni|kiserelt meg|tervez)|ongyilkossagi gondolatai|ongyilkos gondolatai|ongyilkossagrol (?:beszel|ir)|ongyilkossagon gondolkodik|vegezni akar magaval|vegez magaval|vagdossa magat|megvagja magat|onserto|(?:meg akar|szeretne) halni\b(?! otthon| bekeben| meltosaggal)|el akarja venni az eletet|veget akar vetni (?:az )?eletenek)`;

export const HU: CrisisLexicon = Object.freeze({
  language: "hu",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b(?:megolom|megolnem|meg akarom olni|meg fogom olni|kinyirom|ki akarom nyirni) ${MYSELF}\b` },
    { signal: "intent", pattern: String.raw`\b(?:vegzek|vegeznek|vegezni akarok|vegezni fogok|vegezni szeretnek) magammal\b` },
    { signal: "intent", pattern: String.raw`\bmagammal (?:akarok |fogok |szeretnek )?vegez(?:ni|ek|nek)\b` },
    { signal: "intent", pattern: String.raw`\bongyilkos (?:leszek|akarok lenni|szeretnek lenni|lennek|fogok lenni)\b` },
    { signal: "intent", pattern: String.raw`\b(?:ongyilkossagot (?:akarok|fogok|szeretnek) elkovetni|elkovetem az ongyilkossagot|el fogom kovetni az ongyilkossagot)\b` },
    { signal: "intent", pattern: String.raw`\b(?:ongyilkossag(?:on|ra) (?:gondolkodom|gondolkozom|gondolkodok|gondolkozok|gondolok|gondolkodtam)|(?:gondolkodom|gondolkozom|gondolkodok|gondolok|mindig gondolok) (?:az )?ongyilkossag(?:on|ra))\b` },
    { signal: "intent", pattern: String.raw`\bongyilkos(?:sagi)? (?:gondolataim|gondolatom|gondolataim vannak|hajlamaim|kesztetesem|kesztetesem van)\b` },
    { signal: "intent", pattern: String.raw`\b(?:el akarom venni|elveszem|el fogom venni|elvennem) (?:a sajat |az )?eletem(?:et)?\b` },
    { signal: "intent", pattern: String.raw`\bveget (?:akarok vetni|vetek|fogok vetni|vetnek|szeretnek vetni) (?:az |a sajat )?eletemnek\b` },
    { signal: "intent", pattern: String.raw`\b(?:meg akarok halni|szeretnek meghalni|meghalni akarok|meg szeretnek halni|meg kell halnom)\b(?! otthon| bekeben| meltosaggal| nevet| a hazaert| a hazamert| ertetek| erted| ertuk)` },
    { signal: "intent", pattern: String.raw`\bbarcsak (?:meghalnek|halott lennek|meg se szulettem volna|meg sem szulettem volna|ne szulettem volna meg|ne leteznek|elaludnek es nem ebrednek fel)\b` },
    { signal: "intent", pattern: String.raw`\bjobb lenne,? ha (?:meghalnek|halott lennek|nem lennek|nem is leteznek|meg se szulettem volna)\b` },
    { signal: "intent", pattern: String.raw`\b(?:nem akarok|mar nem akarok|nem akarok mar|nincs kedvem|nem szeretnek) (?:tovabb |tobbe |mar )?elni\b${NOT_A_PLACE}` },
    { signal: "intent", pattern: String.raw`\b(?:nem akarok|mar nem akarok) (?:tobbe |mar )?(?:felebredni|letezni)\b` },
    { signal: "intent", pattern: String.raw`\bnincs (?:mar |semmi )?ertelme (?:tovabb )?elni(?:em)?\b${NOT_A_PLACE}` },
    { signal: "intent", pattern: String.raw`\bnincs (?:mar )?(?:miert|kiert) elnem\b` },
    { signal: "intent", pattern: String.raw`\b(?:az eletemnek nincs (?:semmi |mar )?ertelme|az eletem (?:ertelmetlen|nem er semmit)|ertelmetlen az eletem)\b` },
    { signal: "intent", pattern: String.raw`\bnelkulem\b.{0,30}\b(?:jobb|konnyebb)\b` },
    { signal: "intent", pattern: String.raw`\b(?:jobb|konnyebb) (?:lenne|volna|lesz)\b.{0,25}\bnelkulem\b` },
    { signal: "intent", pattern: String.raw`\b(?:(?:mar )?nem birom (?:mar )?(?:tovabb)?\s*(?:$|[.!?,;])|nem birom (?:mar )?tovabb\b(?! [a-z]*t\b| a\b| az\b| ezt| azt))` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:vagdosom|vagdostam|vagdosni akarom|karcolom|karcoltam) ${MYSELF}\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:megvagom|megvagtam|vagom|egetem|megegettem|bantom|bantottam|szurkalom) (?:(?:szandekosan|direkt|megint|ujra) ${MYSELF}\b|${MYSELF}\b.{0,15}\b(?:szandekosan|direkt|megint|ujra|zsilettel|pengevel|kessel)\b)` },
    { signal: "self-harm", pattern: String.raw`\b(?:szandekosan|direkt|megint|ujra|mar megint) (?:megvagom|megvagtam|vagom|egetem|megegettem|bantom|bantottam|szurkalom) ${MYSELF}\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:meg akarom vagni|bantani akarom|meg akarom sebezni|meg akarom egetni) ${MYSELF}\b` },
    { signal: "self-harm", pattern: String.raw`\bfajdalmat (?:akarok okozni|okozok) (?:magamnak|sajat magamnak)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:onserto|onsebzo) (?:vagyok|lettem)\b|\b(?:az )?onsertesem\b|\b(?:abbahagyni|abbahagyjam|abba tudom hagyni|abba tudnam hagyni)\b.{0,15}\b(?:az onsertest|a vagdosast|a vagdosodast|az onsebzest)` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:megoljem magam(?:at)?|legyek ongyilkos|ongyilkos legyek|vessek veget (?:az )?eletemnek|vegezzek magammal)\b` },
    { signal: "decision", pattern: String.raw`\b(?:eljek|eljek tovabb),? vagy (?:haljak meg|meghaljak|oljem meg magam|legyek ongyilkos)\b` },
    { signal: "decision", pattern: String.raw`\b(?:haljak meg|meghaljak)\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\b(?:erdemes|van ertelme|van-e ertelme|megeri) (?:meg |egyaltalan |tovabb )?elnem\b` },
    { signal: "decision", pattern: String.raw`\bvan(?:-e)? (?:meg |egyaltalan )?(?:ertelme|erteke) (?:az )?eletemnek\b` },
    { signal: "decision", pattern: String.raw`\bongyilkossag\b.{0,30}\b(?:szamomra|nekem|az egyetlen kiutam|az egyetlen megoldasom|a legjobb megoldasom)\b` },
    { signal: "decision", pattern: String.raw`\b(?:egyetlen|utolso) (?:kiutam|megoldasom|lehetosegem)\b.{0,20}\b(?:halal|ongyilkossag|meghalni|megolni magam)\b` },
    { signal: "decision", pattern: String.raw`\b(?:hianyoznek|eszrevenne|erdekelne|sajnalna|bankodna|siratna)\b.{0,25}\bha (?:meghalnek|megolnem magam|eltunnek|ongyilkos lennek|nem lennek|nem lennek tobbe)\b` },
    { signal: "decision", pattern: String.raw`\b(?:ok|okok|indok|indokok|erv|ervek),? (?:hogy |amiert )?(?:ne oljem meg magam|ne legyek ongyilkos|eljek tovabb)\b` },
    // method
    { signal: "method", pattern: String.raw`\b(?:hogyan|hogy|mikent|mi a legjobb modja,? hogy) (?:tudnam |lehet |lehetne |tudom |kell )?(?:megolni ${MYSELF}|oljem meg ${MYSELF}|legyek ongyilkos|ongyilkosnak lenni|ongyilkos lenni|kovessek el ongyilkossagot|elkovetni az ongyilkossagot|akasszam fel ${MYSELF}|felakasztani ${MYSELF}|vessek veget az eletemnek|vegezzek magammal|vegezni magammal|adagoljam tul ${MYSELF}|mergezzem meg ${MYSELF})\b` },
    { signal: "method", pattern: String.raw`\b(?:hogyan|hogy|hogyan lehet|hogy lehet|hogyan tudok|hogy tudok|hogyan tudnek|akarok|szeretnek) (?:gyorsan|fajdalommentesen|fajdalom nelkul|konnyen|biztosan|csendben) (?:meghalni|meghalnom|meghalhatnek|haljak meg)\b` },
    { signal: "method", pattern: String.raw`\b(?:fajdalommentes|fajdalom nelkuli|leggyorsabb|legkonnyebb|legbiztosabb|legegyszerubb|legfajdalommentesebb|gyors|biztos|legjobb) (?:modja|mod|modszer|modszerek|modjai|ut)\b.{0,20}\b(?:meghalni|meghalnom|ongyilkos|ongyilkossag|megolni magam|vegezni magammal|a halalnak|halalnak)\b` },
    { signal: "method", pattern: String.raw`\b(?:meghalas|meghalasnak|ongyilkossag|ongyilkossagnak)\b.{0,10}\b(?:legfajdalommentesebb|leggyorsabb|legkonnyebb|legbiztosabb|legegyszerubb|fajdalommentes) (?:modja|modszere|modszerei|modjai)\b` },
    { signal: "method", pattern: String.raw`\b(?:ongyilkossagi|ongyilkos) (?:modszer|modszerek|modszert|terv|tervem|level|levelet|paktum)\b` },
    { signal: "method", pattern: String.raw`\bhalalos (?:adag|adagja|adagot|dozis|dozisa|dozist|mennyiseg|mennyisege)\b` },
    { signal: "method", pattern: String.raw`\bhany (?:szem |darab |doboz |levél |level )?(?:[a-z]+ )?(?:tabletta|tablettat|gyogyszer|gyogyszert|altato|altatot|altatobol|szem|pirula|bogyo|paracetamol|xanax|rivotril|frontin|inzulin|mg|milligramm|gramm)\b.{0,40}\b(?:tuladagol|hogy meghaljak|halalos|a halalhoz|megol|meghalni|belehalok)` },
    { signal: "method", pattern: String.raw`\b(?:milyen magasrol|milyen magasbol|milyen magas)\b.{0,40}\b(?:meghaljak|meghalni|halalos|belehalok|megolje)\b` },
    { signal: "method", pattern: String.raw`\b(?:felakasztom|fel akarom akasztani|fel fogom akasztani|tuladagolom|tul akarom adagolni|megmergezem|meg akarom mergezni|lelovom|le akarom loni|agyonlovom|vizbe folytom) ${MYSELF}\b` },
    { signal: "method", pattern: String.raw`\b(?:a hidrol|hidrol|a tetorol|tetorol|az ablakbol|a toronyhazrol|a hazrol|az erkelyrol|a sziklarol|a blokk tetejerol)\b.{0,15}\b(?:leugrok|leugrom|le akarok ugrani|le fogok ugrani|ugrok le|ugrom le|vetem le magam)\b` },
    { signal: "method", pattern: String.raw`\b(?:leugrok|leugrom|le akarok ugrani|le fogok ugrani)\b.{0,15}\b(?:a hidrol|hidrol|a tetorol|az ablakbol|a toronyhazrol|a hazrol|az erkelyrol|a sziklarol)\b` },
    { signal: "method", pattern: String.raw`\b(?:vonat|metro|villamos|auto|kamion|hev) (?:ele|ala) (?:vetem|vetem be|fogom vetni|akarom vetni|dobom|ugrom|ugrok|fogok ugrani|akarok ugrani)\b` },
    { signal: "method", pattern: String.raw`\bfel(?:vagom|akarom vagni|fogom vagni|vagtam) az ereimet\b` },
    { signal: "method", pattern: String.raw`\b(?:bevettem|beveszem|be fogom venni|be akarom venni|lenyeltem|lenyelem) (?:az osszes|egy egesz doboz|egy doboz|az egesz doboz|az egesz levelet|minden)\b.{0,15}\b(?:gyogyszer|tabletta|altato|pirula|bogyo)` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b${AT_RISK}` },
    { signal: "other-person", pattern: String.raw`\b(?:valaki|egy ember|egy baratom),? (?:akit|akit nagyon) (?:ismerek|szeretek)\b.{0,40}\b(?:ongyilkos|meg akarja olni magat|vagdossa magat|onserto)` },
    { signal: "other-person", pattern: String.raw`\b(?:meg akarja olni magat|ongyilkos akar lenni|vegezni akar magaval|(?:azzal )?fenyeget(?:ozik)?,? hogy (?:megoli magat|ongyilkos lesz|vegez magaval))\b` }
  ])
});
