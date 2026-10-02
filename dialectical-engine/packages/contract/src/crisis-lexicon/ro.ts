import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Patterns are written without diacritics: questions and patterns are both normalised, so
// "să mă sinucid", "sa ma sinucid" and "să mă sinucid" (cedilla ş/ţ) all read "sa ma sinucid".

// Kin and people close to the writer, for `other-person`. Romanian puts the possessive after
// the noun ("prietena mea"); "mama"/"tata" alone already mean the writer's own.
const CLOSE = String.raw`(?:(?:prietenul|iubitul|sotul|fiul|baiatul|copilul|fratele|fratiorul|tatal|taticul|colegul|verisorul|nepotul|bunicul|partenerul|elevul|vecinul|amicul|logodnicul) (?:meu|nostru)|(?:prietena|iubita|sotia|fiica|fata|sora|surioara|mama|colega|verisoara|nepoata|bunica|partenera|eleva|vecina|amica|logodnica) (?:mea|noastra)|(?:prietenii|copiii|fratii|parintii|colegii) mei|(?:prietenele|surorile|colegele) mele|cel mai bun prieten(?: al meu)?|cea mai buna prietena(?: a mea)?|mama|tata|mami|tati|un prieten|o prietena|un coleg|o colega|cineva (?:drag|apropiat|din familie|la care tin))`;
// "să se sinucidă", "să-și ia viața", "să își pună capăt zilelor" …
const SA_SE_END = String.raw`sa(?: se sinucida| se omoare| se spanzure| se arunce| moara|(?:-si| isi) (?:ia|curme) viata|(?:-si| isi) puna capat zilelor)\b`;
const THEY_AT_RISK = String.raw`(?:(?:vrea|vor|se gandeste|se gandesc|a incercat|au incercat|incearca|ameninta|a amenintat|planuieste|zice ca vrea|spune ca vrea|a zis ca vrea|a spus ca vrea|a decis|s-a decis|e hotarat|e hotarata)(?: iar| din nou)? ${SA_SE_END}|se sinucide|(?:e|este) (?:suicidar|suicidara|suicidal|suicidala)|are (?:ganduri|tendinte) (?:suicidare|suicidale|de sinucidere|de suicid|sinucigase)|vorbeste (?:despre|de) (?:sinucidere|suicid)|se gandeste la (?:sinucidere|suicid)|se (?:taie|automutileaza|raneste)|isi face rau|nu mai vrea sa traiasca)`;
// Places and companions that turn "nu mai vreau să trăiesc" into a question about where or how to live.
const NOT_A_PLACE = String.raw`(?! in\b| aici| acolo| cu\b| intr| la\b| printre| alaturi| sub\b| ca\b| langa| pe\b| departe)`;

export const RO: CrisisLexicon = Object.freeze({
  language: "ro",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b(?:ma|m-as|m as|mas)(?: (?:voi|pot|as|putea|mai|chiar))* sinuci[dg]e?\b` },
    { signal: "intent", pattern: String.raw`\bsa ma (?:omor|sinucid|sinucig|spanzur|impusc|otravesc|inec|arunc de pe|arunc in fata|arunc sub|arunc de la)\b(?! de ras| cu munca| cu firea| cu invatatul| cu sala| muncind| invatand| dupa)` },
    { signal: "intent", pattern: String.raw`\b(?:comit|sa comit|vreau sa comit) (?:un )?suicid\b` },
    { signal: "intent", pattern: String.raw`\b(?:vreau|as vrea|imi doresc|mi-as dori|vreau doar|vreau pur si simplu|am chef|as prefera|imi vine) sa mor\b(?! de | in | pe | la | batran| linistit| impacat| acasa| pentru| langa| alaturi)` },
    { signal: "intent", pattern: String.raw`\bnu (?:mai )?vreau sa (?:mai )?(?:exist|fiu in viata|fiu pe lumea asta|respir)\b` },
    { signal: "intent", pattern: String.raw`\bnu (?:mai vreau sa|vreau sa mai) traiesc\b${NOT_A_PLACE}` },
    { signal: "intent", pattern: String.raw`\bnu (?:mai )?vreau sa traiesc\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\b(?:as vrea|vreau|imi doresc|mi-as dori) sa nu mai (?:exist|traiesc|fiu in viata|fiu pe lumea asta)\b${NOT_A_PLACE}` },
    { signal: "intent", pattern: String.raw`\bm-am saturat (?:de viata|sa (?:mai )?traiesc|sa exist)\b(?! in | la | de la | din | cu | printre)` },
    { signal: "intent", pattern: String.raw`\b(?:nu (?:mai vreau sa ma (?:mai )?|vreau sa ma mai )|sa nu ma mai )trezesc\b(?! devreme| la | dimineata| cu | in )` },
    { signal: "intent", pattern: String.raw`\b(?:mi|imi)\b[ -](?:[a-z]+ )?(?:iau|lua|curm|curma) viata\b(?! in | de la capat| inapoi| sub control| in serios)` },
    { signal: "intent", pattern: String.raw`\bpun capat (?:zilelor|vietii)\b(?! [a-z]*(?:ului|ii|ei|ilor|elor)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:mi|imi)\b[ -](?:[a-z]+ )?pune? capat (?:zilelor|vietii)\b` },
    { signal: "intent", pattern: String.raw`\b(?:s-o|sa o|sa) termin (?:cu viata|cu zilele)\b` },
    { signal: "intent", pattern: String.raw`\b(?:s-o|sa o|vreau sa|as vrea sa|o sa|ma gandesc sa) termin (?:cu tot|cu toate|odata pentru totdeauna)\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\b(?:vreau sa dispar (?:pentru totdeauna|de tot|definitiv|de pe (?:fata pamantului|lume|lumea asta))|sa plec (?:din lumea asta|de pe lumea asta|dintre cei vii))\b` },
    { signal: "intent", pattern: String.raw`\b(?:mi-as dori|as vrea|imi doresc|as prefera) sa (?:fiu|fi fost) (?:mort|moarta)\b(?!.{0,40}\bdecat\b)` },
    { signal: "intent", pattern: String.raw`\bmai bine (?:as fi (?:mort|moarta)|eram (?:mort|moarta)|as muri|muream|mor|nu ma nasteam|nu m-as fi nascut)\b(?!.{0,40}\bdecat\b)` },
    { signal: "intent", pattern: String.raw`\b(?:sa nu ma fi nascut|nu ma nasteam|nu trebuia sa ma nasc|n-ar fi trebuit sa ma nasc|de ce m-am nascut|de ce m-au nascut)\b` },
    { signal: "intent", pattern: String.raw`\b(?:am|mai am|iar am|tot am|am avut|imi vin|mi-au venit|ma bantuie|ma chinuie|lupt cu|ma lupt cu)\b(?: [a-z]+){0,2} (?:ganduri|tendinte|impulsuri|porniri) (?:de sinucidere|de suicid|suicidare|suicidale|sinucigase|de a muri|de a ma omori|de a-mi lua viata|de automutilare)\b` },
    { signal: "intent", pattern: String.raw`\b(?:sunt|ma simt|devin|am devenit)\b(?: [a-z]+)? (?:suicidar|suicidara|suicidal|suicidala|sinucigas|sinucigasa)\b` },
    { signal: "intent", pattern: String.raw`\bma gandesc (?:serios |des |mereu |tot mai des |iar |din nou )?(?:la sinucidere|la suicid|sa mor)\b` },
    { signal: "intent", pattern: String.raw`\bn(?:u|-)\s?(?:mai )?am (?:pentru ce|de ce|niciun motiv|nici un motiv|motive?|rost|puterea|putere|forta|chef) sa (?:mai )?(?:traiesc|exist|continui sa traiesc|fiu in viata|lupt)\b(?! in | aici| acolo| cu | intr| la )` },
    { signal: "intent", pattern: String.raw`\bn(?:u|-)\s?(?:mai )?are (?:niciun |nici un |vreun )?(?:rost|sens) sa (?:mai )?(?:traiesc|exist|continui|fiu in viata)\b(?! in | aici| acolo| cu | intr| la | pe )` },
    { signal: "intent", pattern: String.raw`\bviata mea (?:(?:nu|n-)\s?(?:mai )?are (?:niciun |nici un |vreun )?(?:rost|sens|valoare)|(?:nu mai )?(?:e|este) (?:fara rost|fara sens|inutila))\b` },
    { signal: "intent", pattern: String.raw`\bnu mai pot (?:sa )?(?:traiesc|trai|continui|continua|merg mai departe|rezist)(?: asa| cu asta| in felul asta)?\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\bnu mai pot (?:sa )?(?:traiesc|trai) asa\b` },
    { signal: "intent", pattern: String.raw`\b(?:toti|toata lumea|familia mea|familiei mele|parintii mei|parintilor mei|copiii mei|lumea|ceilalti|oamenii din jurul meu)\b.{0,20}\bmai (?:bine|fericiti|fericita|fericit|usor) fara mine\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:ma|m-am|m-as)\b[ -](?:(?:tot|iar|mai|inca|pot|voi|opresc din|las de|apuc de|am apucat de|apucat de) )?automutil` },
    { signal: "self-harm", pattern: String.raw`\b(?:automutilarea mea|fac (?:self[- ]?harm|automutilare))\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:ma|m-am|m-as)\b[ -](?:(?:tot|iar|mai|inca) )?tai(?:at)?\b.{0,20}\b(?:pe (?:maini|brate|incheieturi|incheietura|antebrat|antebrate|coapse|picioare|burta)|la (?:incheieturi|incheietura|venele|vene)|venele|cu (?:lama|lamele|o lama|lame|cutterul|un cutter|bisturiul)|intentionat|special|ca sa simt)` },
    { signal: "self-harm", pattern: String.raw`\b(?:vreau|as vrea|imi vine|tot|iar|continui|am inceput) sa(?:-mi| imi) fac rau\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:imi|mi-am|mi)\b[ -](?:(?:tot|iar|mai) )?(?:fac|facut) rau\b.{0,15}\b(?:singur|singura|intentionat|special|fizic|cu buna stiinta|din nou)\b` },
    { signal: "self-harm", pattern: String.raw`\bma (?:ard|lovesc|zgarii|zgarai|musc|ciupesc)\b.{0,20}\b(?:intentionat|special|cu (?:tigara|tigari|bricheta|chibrituri)|pana (?:sangerez|imi da sange)|ca sa simt|ca sa ma pedepsesc)` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:ar trebui|trebuie|oare trebuie|oare ar trebui|e cazul) sa (?:mor|mai traiesc|continui sa traiesc|renunt la viata)\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\b(?:sa traiesc sau sa mor|sa mor sau sa traiesc|traiesc sau mor)\b` },
    { signal: "decision", pattern: String.raw`\b(?:mai )?merita sa (?:mai )?(?:traiesc|continui sa traiesc|raman in viata|exist)(?:\s*(?:$|[.!?,;])| (?:mai departe|asa|pe lumea asta|in continuare)\b)` },
    { signal: "decision", pattern: String.raw`\bviata mea (?:mai merita|merita (?:sa fie )?traita|(?:mai )?are (?:vreo valoare|vreun rost|vreun sens|sens|rost))\b` },
    { signal: "decision", pattern: String.raw`\b(?:sinuciderea|suicidul)\b.{0,30}\b(?:pentru mine|singura (?:mea )?(?:solutie|optiune|varianta|cale|scapare|iesire)|solutia mea|varianta mea)` },
    { signal: "decision", pattern: String.raw`\bsingura (?:mea (?:solutie|optiune|varianta|cale|scapare|iesire)|(?:solutie|optiune|varianta|cale|scapare|iesire) pentru mine)\b.{0,20}\b(?:sinuciderea|suicidul|moartea|sa mor|sa ma sinucid|sa ma omor)\b` },
    { signal: "decision", pattern: String.raw`\b(?:pasa|observa|conta|plange|lipsi|simti lipsa|dor|mai bine|mai usor|mai fericit[ia]?)\b.{0,30}\bdaca (?:as muri|as disparea|nu as mai fi|n-as mai fi|nu as mai exista|n-as mai exista|m-as sinucide|mor|dispar)\b` },
    // method
    { signal: "method", pattern: String.raw`\bcum (?:sa |pot sa |as putea sa |poti sa |ai putea sa |pot |poti |as putea )?(?:ma|te) (?:sinucid|sinucizi|sinucide|omor|omori|spanzur|spanzuri|otravesc|otravesti|inec|ineci|impusc|impusti)\b(?! de ras| cu munca| cu firea)` },
    { signal: "method", pattern: String.raw`\bcum (?:sa|pot sa|as putea sa|as putea|pot|poti sa) (?:mor|muri|mori)\b(?! de ras| de batranete| demn| impacat| fericit)` },
    { signal: "method", pattern: String.raw`\b(?:usor|usoara|usoare|simplu|simpla|rapid|rapida|repede|sigur|sigura|nedureros|nedureroasa|nedureroase|fara durere|eficient|eficienta|eficiente|linistit|linistita|bland|blanda|placut|placuta)\b.{0,15}\b(?:sa mor|de a muri|de murit|sa ma sinucid|de a ma sinucide|de a te sinucide|sa te sinucizi|sa ma omor|de a ma omori|sa-mi iau viata|de a-mi lua viata|sa mori|de a-ti lua viata|sa-ti iei viata)\b` },
    { signal: "method", pattern: String.raw`\b(?:cea mai|cel mai|cele mai|cei mai) [a-z]+ (?:metoda|metode|mod|moduri|cale|cai|varianta|variante) (?:de sinucidere|de suicid|de a muri|sa mor|de a ma sinucide|de a te sinucide|sa ma sinucid|sa te sinucizi|de a ma omori)\b` },
    { signal: "method", pattern: String.raw`\b(?:metoda|metode|mod|moduri|cale|cai|varianta|variante) (?:[a-z]+ ){0,2}(?:nedureroasa|nedureroase|nedureros|rapida|rapide|rapid|usoara|usoare|usor|sigura|sigure|sigur|eficienta|eficiente|eficient|simpla|simple|simplu) (?:de sinucidere|de suicid|de a muri|sa mor|de a ma sinucide|de a te sinucide|sa ma sinucid|sa te sinucizi)\b` },
    { signal: "method", pattern: String.raw`\b(?:sa mor|a muri|de murit|sinucidere|suicid|sa ma sinucid|sa te sinucizi|sa mori|sa ma omor)\b.{0,20}\b(?:fara durere|nedureros|nedureroasa|fara sa simt|fara sa sufar|repede si usor|in somn)\b` },
    { signal: "method", pattern: String.raw`\bcat(?:e|a|i)?\b.{0,40}\b(?:ca sa mor|ca sa mori|pentru a muri|ca sa ma omor|ca sa ma sinucid|ca sa nu ma mai trezesc|sa fie letal[ae]?|e letal[ae]?|este letal[ae]?|e mortal[ae]?|este mortal[ae]?|e o doza letala|ca sa fac supradoza|pentru o supradoza|pentru supradoza)\b` },
    { signal: "method", pattern: String.raw`\b(?:doza|doze|dozele|cantitatea|cantitate) (?:letala|mortala|fatala|letale|mortale|fatale)\b` },
    { signal: "method", pattern: String.raw`\b(?:doza|cantitate|cantitatea)\b.{0,30}\b(?:e|este|ar fi|devine) (?:letala|mortala|fatala)\b` },
    { signal: "method", pattern: String.raw`\b(?:(?:sa|vreau sa|as vrea sa|pot sa|cum sa|o sa) (?:iau|fac) (?:o )?supradoza|supradoza (?:intentionat|intentionata|voit|voita|ca sa mor|special))\b` },
    { signal: "method", pattern: String.raw`\bma (?:spanzur|impusc)\b` },
    { signal: "method", pattern: String.raw`\bma arunc (?:de pe|in fata|de la|sub|pe geam|pe fereastra|in gol)\b` },
    { signal: "method", pattern: String.raw`\b(?:sa|vreau sa|o sa|as vrea sa|ma gandesc sa|pot sa) sar (?:de pe|de la) (?:bloc|pod|cladire|balcon|etaj|stanca|acoperis|geam|fereastra|blocul|podul|cladirea|balconul|acoperisul)\b` },
    { signal: "method", pattern: String.raw`\b(?:iau|luat|inghit|inghitit) (?:toate|o cutie (?:intreaga )?de|un flacon de|tot flaconul de|toata cutia de|toata folia de|un pumn de) (?:pastilele|pastile|medicamentele|somniferele|somnifere|antidepresivele|antidepresive|tabletele|tablete|medicamente|xanax|paracetamol)` },
    { signal: "method", pattern: String.raw`\b(?:(?:sa|cum sa|ar trebui sa|vreau sa|o sa) (?:scriu|las|lasa) (?:un |o )?(?:bilet|scrisoare|mesaj) de (?:adio|sinucidere)|bilet(?:ul)? de sinucidere)\b` },
    // review round 1: phrasings a first probe missed
    { signal: "decision", pattern: String.raw`\b(?:ar fi )?mai bine\b.{0,40}\b(?:sa mor|daca as muri|daca as disparea|daca n-as mai fi|daca nu as mai fi|sa nu mai fiu|sa nu mai exist)\b(?! de | in | pe | la | batran| linistit| acasa)` },
    { signal: "decision", pattern: String.raw`\bsinucider(?:ea mea|ii mele)\b` },
    { signal: "intent", pattern: String.raw`\b(?:sunt|ma simt|m-am) (?:atat de |foarte |asa de )?(?:obosit|obosita|satul|satula|saturat|saturata|saturat|plictisit|plictisita) de viata\b(?! la | in | din | de la| de oras| de student| de corporatist| de noapte| cu | agitata| aglomerata)` },
    { signal: "intent", pattern: String.raw`\bvreau sa se (?:termine|sfarseasca) (?:totul|tot)\b` },
    { signal: "intent", pattern: String.raw`\b(?:mi-e dor|mi e dor|imi doresc|vreau|as vrea|mi-as dori) sa nu mai (?:exist|fiu|traiesc)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b${THEY_AT_RISK}` },
    { signal: "other-person", pattern: String.raw`\b(?:vrea|ameninta|a amenintat|planuieste|se gandeste|zice ca vrea|spune ca vrea) sa(?: se sinucida|(?:-si| isi) (?:ia|curme) viata|(?:-si| isi) puna capat zilelor| se spanzure)\b` }
  ])
});
