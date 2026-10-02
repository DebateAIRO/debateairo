import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Normalisation folds ą ć ę ń ó ś ź ż to a c e n o s z z, but "ł" is its own letter and stays:
// every "ł" is written [łl] so that "chciałbym" and "chcialbym" both match.

// Kin and people close to the writer, for `other-person` (Polish often drops "mój/moja").
const CLOSE = String.raw`(?:przyjaciel|przyjaciela|przyjacio[łl]ka|najlepszy przyjaciel|najlepsza przyjacio[łl]ka|kolega|kolezanka|ch[łl]opak|dziewczyna|narzeczony|narzeczona|maz|zona|syn|synek|corka|coreczka|brat|siostra|mama|tata|matka|ojciec|dziecko|nastolatek|nastolatka|partner|partnerka|kuzyn|kuzynka|wspo[łl]lokator|wspo[łl]lokatorka|uczen|uczennica|wnuk|wnuczka|siostrzeniec|siostrzenica|bratanek|bratanica|znajomy|znajoma|babcia|dziadek)`;
const THEY_AT_RISK = String.raw`(?:chce (?:sie zabic|zabic sie|umrzec|pope[łl]nic samobojstwo|odebrac sobie zycie|skonczyc ze soba)|mysli o (?:samobojstwie|odebraniu sobie zycia)|ma mysli samobojcze|probowa[łl]a? (?:sie zabic|zabic sie|pope[łl]nic samobojstwo|odebrac sobie zycie)|grozi,? ze (?:sie zabije|zabije sie|pope[łl]ni samobojstwo|odbierze sobie zycie|skonczy ze soba)|tnie sie|sie tnie|okalecza sie|sie okalecza|samookalecza sie|sie samookalecza|krzywdzi sie|sie krzywdzi|robi sobie krzywde|nie chce (?:juz )?zyc|nie chce (?:mu|jej) sie zyc|mowi,? ze (?:chce umrzec|sie zabije|nie chce zyc|chce sie zabic))`;
// First-person lead-ins: "chcę / powinienem / zamierzam …".
const I_WANT = String.raw`(?:chce|chcia[łl]bym|chcia[łl]abym|musze|powinienem|powinnam|mam ochote|zamierzam|planuje|postanowi[łl](?:em|am)|pragne|mysle,? (?:zeby|by|aby|o tym,? (?:zeby|by|aby)))`;
// Places and companions that turn "nie chcę żyć" into a question about where or how to live.
const NOT_A_PLACE = String.raw`(?! w | we | na | z | ze | bez | pod | tu| tam| tak,? jak| jak | razem| obok| przy | u | wsrod)`;

export const PL: CrisisLexicon = Object.freeze({
  language: "pl",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${I_WANT} (?:juz |po prostu |dzis |dzisiaj )?(?:sie zabic|zabic sie)\b` },
    { signal: "intent", pattern: String.raw`\b(?:zabije sie|zabij sie)\b` },
    { signal: "intent", pattern: String.raw`\b${I_WANT} (?:sobie )?odebrac (?:sobie )?zycie\b` },
    { signal: "intent", pattern: String.raw`\bodbiore sobie zycie\b` },
    { signal: "intent", pattern: String.raw`\b(?:skoncz(?:yc|e|y[łl]bym|y[łl]abym) ze soba|ze soba skoncz(?:yc|e))\b` },
    { signal: "intent", pattern: String.raw`\b(?:${I_WANT} pope[łl]nic|pope[łl]nie) samobojstwo\b` },
    { signal: "intent", pattern: String.raw`\bmysle o (?:samobojstwie|odebraniu sobie zycia)\b` },
    { signal: "intent", pattern: String.raw`\b(?:mam|miewam|mia[łl](?:em|am)|miewa[łl](?:em|am)|nachodza mnie|drecza mnie|mecza mnie|wracaja|wroci[łl]y|pojawiaja sie)\b (?:[a-zł]+ )?(?:mysli|sk[łl]onnosci|tendencje|zamiary) samobojcze\b` },
    { signal: "intent", pattern: String.raw`\b(?:jestem w kryzysie samobojczym|mam kryzys samobojczy)\b` },
    { signal: "intent", pattern: String.raw`\b(?:chce|chcia[łl]bym|chcia[łl]abym|wola[łl]bym|wola[łl]abym|pragne|marze,? zeby|mam ochote) (?:juz |po prostu |tylko )?umrzec\b(?! za | w | we | na | ze | z | przy | u |,? niz)` },
    { signal: "intent", pattern: String.raw`\bnie chce (?:juz |d[łl]uzej |wiecej )?(?:zyc|istniec)\b${NOT_A_PLACE}` },
    { signal: "intent", pattern: String.raw`\bnie chce mi sie (?:juz )?zyc\b` },
    { signal: "intent", pattern: String.raw`\bmam (?:juz )?(?:dosc|serdecznie dosc|dosyc) (?:zycia|tego zycia|zycia na tym swiecie|zycia na tym swiecie)\b(?! w | we | na | z | ze | bez | przy | u )` },
    { signal: "intent", pattern: String.raw`\b(?:nie chce sie (?:juz |wiecej |juz nigdy |nigdy )(?:obudzic|budzic)|zasnac i (?:sie )?nie obudzic|zasnac i nie obudzic sie)\b` },
    { signal: "intent", pattern: String.raw`\bwola[łl](?:bym|abym) (?:nie zyc|nie istniec|byc martw[ya])\b(?!.{0,30}\bniz\b)` },
    { signal: "intent", pattern: String.raw`\b(?:lepiej by by[łl]o|by[łl]oby lepiej|lepiej),? (?:gdybym|zebym|jakbym) (?:nie zy[łl]a?|umar[łl]a?|nie istnia[łl]a?|sie nie urodzi[łl]a?|zdech[łl]a?|znikn[ae][łl]a?)` },
    { signal: "intent", pattern: String.raw`\b(?:szkoda|za[łl]uje),? ze (?:sie )?(?:w ogole )?(?:sie )?urodzi[łl](?:em|am)\b` },
    { signal: "intent", pattern: String.raw`\bpo co (?:ja )?(?:w ogole )?(?:zyje|sie urodzi[łl](?:em|am))\b` },
    { signal: "intent", pattern: String.raw`\bnie (?:ma|widze) (?:juz )?(?:zadnego |zadnej )?(?:sensu|powodu|celu) (?:zyc|zeby zyc|dalej zyc|zyc dalej|mojego zycia|istniec|zebym zy[łl]a?)\b(?! w | na | tu| tam| z | bez )` },
    { signal: "intent", pattern: String.raw`\bmoje zycie (?:juz )?(?:nie ma (?:juz )?(?:sensu|wartosci|celu)|jest (?:kompletnie |zupe[łl]nie |totalnie |ca[łl]kowicie )?bez sensu|nic nie jest warte|nie jest nic warte)\b` },
    { signal: "intent", pattern: String.raw`\bnie mam (?:juz )?si[łl]y? (?:zyc|dalej zyc|zeby zyc|na zycie|zyc dalej|zeby dalej zyc)\b` },
    { signal: "intent", pattern: String.raw`\b(?:nie dam rady (?:d[łl]uzej |dalej )?zyc|nie moge (?:juz )?(?:tak )?(?:d[łl]uzej |dalej )?zyc)\b(?! w | we | na | z | ze | bez | tu| tam| obok| przy )` },
    { signal: "intent", pattern: String.raw`\b(?:wszystkim|rodzinie|bliskim|wszyscy|swiat|swiatu|moim bliskim|mojej rodzinie)\b.{0,20}\b(?:lepiej|lepszy|szczesliwsi|szczesliwszy|[łl]atwiej)\b.{0,10}\bbeze mnie\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:(?:tne|cia[łl]em|cie[łl]am|pocia[łl]em|pocie[łl]am) sie|sie (?:tne|pocia[łl]em|pocie[łl]am|cia[łl]em|cie[łl]am))\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:chce|zacza[łl]em|zacze[łl]am|zaczynam|przestac|przestane|nie moge przestac|znow|znowu|musze|lubie|nadal|dalej|ciagle|wciaz|nie umiem przestac) sie ciac\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:ciac sie|sie ciac) po (?:rekach|nadgarstkach|udach|nogach|brzuchu)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:(?:okaleczam|okaleczy[łl](?:em|am)|okalecze|samookaleczam|krzywdze|kalecze|przypalam|przypali[łl](?:em|am)) sie|sie (?:okaleczam|samookaleczam|krzywdze|kalecze|przypalam))\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:robie|zrobie|chce zrobic|mam ochote zrobic|musze zrobic|znowu zrobi[łl](?:em|am)|celowo zrobi[łl](?:em|am)) sobie (?:krzywde|rany|blizny)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:chce|mam ochote|musze) (?:sobie )?zrobic (?:sobie )?krzywde\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:moje samookalecz|(?:przestac|rzucic|skonczyc) z samookalecz|robie (?:sobie )?(?:sh|selfharm|self[- ]?harm)\b)` },
    // decision
    { signal: "decision", pattern: String.raw`\bczy (?:powinienem|powinnam|mam|warto|to dobry pomys[łl],? (?:zeby|by)|nie lepiej) (?:po prostu |juz )?(?:sie zabic|zabic sie|umrzec|zyc dalej|dalej zyc|pope[łl]nic samobojstwo|odebrac sobie zycie|skonczyc ze soba|ze soba skonczyc|jeszcze zyc)\b(?! w | we | na | z | ze | bez | tu| tam| za )` },
    { signal: "decision", pattern: String.raw`\b(?:zyc czy umrzec|umrzec czy zyc)\b` },
    { signal: "decision", pattern: String.raw`\bczy (?:moje zycie|zycie moje) (?:ma (?:jeszcze |w ogole |jakis |jakikolwiek )?sens|jest (?:cokolwiek |jeszcze |w ogole )?(?:warte|nic warte)|ma (?:jakas |jakakolwiek )?wartosc)\b` },
    { signal: "decision", pattern: String.raw`\bczy (?:mi |mnie )?(?:warto|op[łl]aca sie|jest sens|ma sens) (?:mi )?(?:jeszcze|dalej|d[łl]uzej) zyc\b(?! w | na | z | tu | bez | tam)` },
    { signal: "decision", pattern: String.raw`\bsamobojstwo\b.{0,30}\b(?:jedyne (?:wyjscie|rozwiazanie) dla mnie|dla mnie|moje jedyne|jedyne moje|moim jedynym)` },
    { signal: "decision", pattern: String.raw`\b(?:moje jedyne|jedyne moje|jedyne co mi zosta[łl]o|jedyne co mi pozosta[łl]o|jedyne wyjscie dla mnie|jedyne rozwiazanie dla mnie|moim jedynym wyjsciem)\b.{0,20}\b(?:samobojstwo|smierc|umrzec|sie zabic|zabic sie|skonczyc ze soba)` },
    { signal: "decision", pattern: String.raw`\b(?:zauwazy[łl]|zauwazy|zateskni[łl]|teskni[łl]|p[łl]aka[łl]|obchodzi[łl]oby|obchodzi[łl]o|przejmowa[łl]|przykro|lepiej|szkoda)\b.{0,30}\b(?:gdybym|jakbym|jesli(?: bym)?|jezeli) (?:umar[łl]a?|znikn[ae][łl]a?|nie zy[łl]a?|sie zabi[łl]a?|zabi[łl]a? sie|odebra[łl]a? sobie zycie|pope[łl]ni[łl]a? samobojstwo|umre|znikne)` },
    { signal: "decision", pattern: String.raw`\bgdybym (?:sie zabi[łl]a?|zabi[łl]a? sie|pope[łl]ni[łl]a? samobojstwo|odebra[łl]a? sobie zycie|skonczy[łl]a? ze soba)\b` },
    // method
    { signal: "method", pattern: String.raw`\bjak (?:(?:moge|mam|mozna|najlepiej|najszybciej|najlatwiej|naj[łl]atwiej|bezbolesnie|szybko|skutecznie|po prostu|w koncu) )*(?:sie zabic|zabic sie|pope[łl]nic samobojstwo|odebrac sobie zycie|skonczyc ze soba|sie powiesic|powiesic sie|podciac sobie zy[łl]y)\b` },
    { signal: "method", pattern: String.raw`\bjak (?:(?:mam|moge|najlepiej|skutecznie) )?przedawkowac\b` },
    { signal: "method", pattern: String.raw`\b(?:(?:chce|zamierzam|musze|mysle,? zeby|planuje) przedawkowac|przedawkuje (?:celowo|specjalnie|dzis|dzisiaj))\b` },
    { signal: "method", pattern: String.raw`\bjak (?:(?:najszybciej|najlatwiej|naj[łl]atwiej|bezbolesnie|szybko|bez bolu|we snie|spokojnie|moge|mam|mozna) )*umrzec\b(?! godnie| z godnoscia| szczesliw| za | ze starosci| od | na | z powodu| przez)` },
    { signal: "method", pattern: String.raw`\b(?:naj[łl]atwiejsz[yaie]|najszybsz[yaie]|najpewniejsz[yaie]|najmniej bolesn[yaie]|bezbolesn[yaie]|skuteczn[yaie]|najskuteczniejsz[yaie]|najlepsz[yaie]|szybk[iae]|[łl]atw[yaie]|pewn[yaie]|spokojn[yaie]) (?:sposob|sposoby|sposobu|metoda|metody|metode) (?:na smierc|na samobojstwo|zeby umrzec|by umrzec|aby umrzec|na zabicie sie|zeby sie zabic|pope[łl]nienia samobojstwa|samobojstwa|odebrania sobie zycia|na odebranie sobie zycia|umierania|smierci)\b` },
    { signal: "method", pattern: String.raw`\bile\b.{0,40}\b(?:zeby|by|aby|zebym) (?:umrzec|sie zabic|zabic sie|przedawkowac|sie nie obudzic|nie obudzic sie|umar[łl]a?)\b` },
    { signal: "method", pattern: String.raw`\b(?:jak wysoko|z jakiej wysokosci|jak wysoki|jak wysokie|ile pieter|z ktorego pietra)\b.{0,40}\b(?:zeby|by|aby|zebym) (?:umrzec|sie zabic|zginac|zabic sie|na pewno)` },
    { signal: "method", pattern: String.raw`\b(?:(?:smiertelna|smiertelnej|letalna|letalnej) dawk|dawk[aei] (?:smiertelna|smiertelnej|letalna|letalnej)\b)` },
    { signal: "method", pattern: String.raw`\b(?:(?:chce|zamierzam|musze|mysle,? zeby|planuje|powinienem|powinnam|mam ochote) (?:sie powiesic|powiesic sie)|powiesze sie)\b` },
    { signal: "method", pattern: String.raw`\b(?:rzuce|rzucic|rzuci[łl]bym|rzuci[łl]abym) sie pod (?:pociag|tramwaj|samochod|auto|ciezarowke|autobus|metro|ko[łl]a)` },
    { signal: "method", pattern: String.raw`\b(?:skocze|skoczy[łl]bym|skoczy[łl]abym|(?:chce|zamierzam|mysle,? zeby|powinienem|powinnam|mam ochote) skoczyc) z (?:mostu|dachu|bloku|okna|balkonu|wiezowca|klifu|wiezy|pietra|[a-zł]+ pietra|wiaduktu)\b` },
    { signal: "method", pattern: String.raw`\b(?:podciac|podetne|podcinam|podcia[łl](?:em|am)|podcinac|przeciac|przetne) sobie (?:zy[łl]y|nadgarstki|nadgarstek)\b` },
    { signal: "method", pattern: String.raw`\b(?:wziac|wezme|wzi[ae][łl](?:em|am)|[łl]yknac|[łl]ykne|[łl]ykn[ae][łl](?:em|am)|po[łl]knac|po[łl]kne|po[łl]kn[ae][łl](?:em|am)|zazyc|zazyje|zazy[łl](?:em|am)) (?:wszystkie|ca[łl]e opakowanie|ca[łl]a paczke|ca[łl]y blister|ca[łl]a fiolke|garsc|opakowanie) (?:moich |swoich |tych |moje |swoje )?(?:tabletek|tabletki|leki|lekow|pigu[łl]ki|pigu[łl]ek|proszki|proszkow|tabsy|tabsow)` },
    { signal: "method", pattern: String.raw`\b(?:napisac|napisze|napisa[łl](?:em|am)|pisze|zostawic|zostawie) (?:[a-zł]+ )?list (?:pozegnalny|samobojczy)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b${THEY_AT_RISK}` },
    { signal: "other-person", pattern: String.raw`\bgrozi(?:[łl]a?)?,? ze (?:sie zabije|zabije sie|pope[łl]ni samobojstwo|odbierze sobie zycie|skonczy ze soba)\b` },
    { signal: "other-person", pattern: String.raw`\bktos (?:bliski|mi bliski|kogo znam|kogo kocham|z rodziny|z moich bliskich)\b.{0,40}\b(?:chce sie zabic|chce zabic sie|mysli o samobojstwie|ma mysli samobojcze|tnie sie|sie tnie|okalecza sie|sie okalecza|chce umrzec|nie chce zyc)` }
  ])
});
