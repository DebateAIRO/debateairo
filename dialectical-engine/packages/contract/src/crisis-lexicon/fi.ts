import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Accents fold away ("ä" → "a", "ö" → "o"), so "haluan kuolla" and "pitaisiko" both match.
// Colloquial Finnish drops the reflexive to "itteni"/"iteni" and the pronoun to "mä"/"mun".
const MYSELF = String.raw`(?:itseni|itteni|iteni|ittein)`;
const MYSELF_PART = String.raw`(?:itseäni|itteäni|itteeni|itseeni)`;
// People close to the writer: the possessive-suffix form ("ystäväni") or "mun/minun" + noun.
const CLOSE = String.raw`(?:(?:paras |)(?:ystäväni|kaverini|poikaystäväni|tyttöystäväni|mieheni|vaimoni|puolisoni|kumppanini|poikani|tyttäreni|veljeni|pikkuveljeni|siskoni|pikkusiskoni|sisareni|äitini|isäni|lapseni|luokkakaverini|oppilaani|työkaverini|kollegani|serkkuni|kämppikseni|bestikseni|mummoni|pappani)|(?:mun|minun) (?:paras |)(?:ystävä|kaveri|frendi|bestis|poikaystävä|tyttöystävä|mies|vaimo|puoliso|kumppani|poika|tytär|veli|pikkuveli|sisko|pikkusisko|äiti|mutsi|isä|iskä|faija|lapsi|luokkakaveri|työkaveri|serkku|kämppis))`;
const WANT = String.raw`(?:haluan|haluun|haluisin|haluaisin|tahdon|tahtoisin|haluu)`;
const JUST = String.raw`(?:(?:vain|vaan|vaa|niin|ihan|oikeesti|oikeasti|jo|nyt) ){0,2}`;

export const FI: CrisisLexicon = Object.freeze({
  language: "fi",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b${WANT} ${JUST}kuolla(?: pois| jo| nyt| heti| tänään)?\s*(?:$|[.!?,;]| koska | kun | mutta | ja )` },
    { signal: "intent", pattern: String.raw`\b(?:tapan|tappaa|tappaisin|tappamaan|tappamista|tapoin|tappaminen) ${MYSELF}\b|\b${MYSELF} (?:tappaa|tappamista|tappamisesta|tappamiseen|tapan|hengiltä)\b` },
    { signal: "intent", pattern: String.raw`\bteen (?:itsemurhan|itsarin)\b|\b(?:${WANT}|aion|meinaan|mietin|ajattelen|ajattelin|suunnittelen|yritin|yritän|taidan|voisin)\b.{0,15}\b(?:itsemurha|itsemurhan|itsemurhaa|itsarin|itsari|itsaria)\b(?!-)` },
    { signal: "intent", pattern: String.raw`\b${WANT} ${JUST}(?:lopettaa (?:elämäni|kaiken|tämän kaiken|tän kaiken)|päättää päiväni|päättää elämäni)\b` },
    { signal: "intent", pattern: String.raw`\b(?:olen|oon|olin|tunnen itseni|oon ollu|olen ollut)\b.{0,15}\b(?:itsetuhoinen|itsetuhonen|itsemurhavaarassa|suisidaalinen|itsetuhoisa)\b` },
    { signal: "intent", pattern: String.raw`\b(?:mulla on|minulla on|mulla oli|minulla oli|mul on|mul oli|on ollut|ollu)\b.{0,15}\b(?:itsemurha-?ajatuksia|itsetuhoisia ajatuksia|itsetuhosia ajatuksia|kuolemantoiveita|itsarifiiliksiä)\b|\b(?:mun|minun) (?:itsemurha-?ajatukset|itsetuhoiset ajatukset|itsetuhoisuus|itsetuhoisuuteni)\b` },
    { signal: "intent", pattern: String.raw`\ben (?:halua|haluu|jaksa|tahdo|kestä|pysty) (?:enää |enää yhtään |)(?:elää|olla olemassa|herätä|jatkaa elämää|jatkaa)(?: enää)?(?:\s*(?:$|[.!?,;])| tällaista| näin| tätä| (?:yhtään )?päivää)` },
    { signal: "intent", pattern: String.raw`\b(?:kunpa|toivon että|toivoisin että|kunpa vain|toivon,? että) (?:olisin|oisin|en olisi|en ois|en olisi koskaan) (?:kuollut|kuollu|koskaan syntynyt|syntynyt|syntyny)\b` },
    { signal: "intent", pattern: String.raw`\b(?:kaikilla|kaikki|maailma|perheeni|perheelläni|muilla|läheisilläni|vanhempani|vanhemmillani)\b.{0,25}\b(?:parempi|paremmin) (?:ilman minua|ilman mua|ilman minuu|jos olisin kuollut|jos kuolisin|jos mua ei olis)\b` },
    { signal: "intent", pattern: String.raw`\bei (?:ole |oo |)(?:mitään |)(?:syytä|järkeä) (?:elää|jatkaa elämää|elää enää)\b|\belämä(?:ni|lläni|ssäni) (?:ei ole|ei oo) (?:mitään |)(?:merkitystä|järkeä|tarkoitusta|arvoa)\b|\belämäni on (?:ihan |täysin |)(?:arvoton|merkityksetön)\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:viillän|viiltelen|viiltelin|viilsin|olen viillellyt|oon viillelly|oon viillellyt|aloin viillellä)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:satutan|vahingoitan|viiltelen|poltan|lyön|hakkaan|raavin|raapin) ${MYSELF_PART}\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:haluan|haluun|tekee mieli|teki mieli|mieli tekee|en voi olla|pakko)\b.{0,10}\b(?:satuttaa|vahingoittaa|viiltää|viillellä|polttaa|lyödä) ${MYSELF_PART}\b|\b(?:satutin|satuttanut|vahingoitin|vahingoittanut) ${MYSELF_PART} (?:tahallaan|tahallani|tarkoituksella|taas|uudestaan)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:mun|minun) (?:viiltely|viiltelyni|itsensä vahingoittaminen)\b|\blopettaa (?:viiltely|viiltelyn|viiltelemisen|itseni satuttamisen|itseni vahingoittamisen)\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:pitäisikö|pitäiskö|pitäisköhän|kannattaako|kannattaisiko|pitääkö) (?:minun |mun |)(?:vain |vaan |vaa |)(?:tappaa ${MYSELF}|tehdä itsemurha|tehä itsari|tehdä itsari|lopettaa elämäni|lopettaa kaikki|päättää päiväni)\b` },
    { signal: "decision", pattern: String.raw`\b(?:pitäisikö|pitäiskö|kannattaako|kannattaisiko|pitääkö) (?:minun |mun |)(?:vain |vaan |vaa |)(?:kuolla|elää|jatkaa elämää|jatkaa elämistä)(?:\s*(?:$|[.!?,;])| vai (?:kuolla|elää))` },
    { signal: "decision", pattern: String.raw`\bonko (?:minun elämäni|minun elämä|mun elämä|elämäni) (?:enää |edes |oikeasti |vielä |)(?:elämisen arvoinen|elämisen arvoista|minkään arvoinen|mitään arvoinen|elämisen arvonen)\b` },
    { signal: "decision", pattern: String.raw`\b(?:itsemurha|kuolema|kuoleminen)\b.{0,30}\b(?:ainoa|paras|viimeinen) (?:vaihtoehto|ratkaisu|keino|ulospääsy)\b.{0,15}\b(?:minulle|mulle)\b|\b(?:ainoa|viimeinen) (?:vaihtoehtoni|keinoni|ratkaisuni|ulospääsyni)\b.{0,15}\b(?:itsemurha|kuolla|kuolema|tappaa ${MYSELF})\b` },
    { signal: "decision", pattern: String.raw`\b(?:kaipaisiko|huomaisiko|välittäisikö|surisiko|ikävöisikö|kaipais|välittäiskö|huomaisko|kaipaisko)\b.{0,20}\b(?:jos (?:kuolisin|olisin kuollut|tappaisin ${MYSELF}|katoaisin|en olis|en olisi|kuolen)|kuolemaani|kuoltuani)\b` },
    // method
    { signal: "method", pattern: String.raw`\b(?:miten|kuinka|millä|millä tavalla) (?:voin |voisin |voi |pitäisi |pitäis |kannattaa |)(?:parhaiten |helpoimmin |nopeimmin |kivuttomasti |varmimmin |)(?:tappaa (?:${MYSELF}|itsensä|itsesi|ittensä|ittesi)|tappaisin ${MYSELF}|tapan ${MYSELF}|teen itsemurhan|tehdä itsemurha|tehdä itsemurhan|tehdä itsari|hirttää (?:${MYSELF}|itsensä|itsesi)|hirttäytyä|kuolla (?:kivuttomasti|nopeasti|helposti)|ottaa yliannostus|ottaa yliannostuksen)\b` },
    { signal: "method", pattern: String.raw`\b(?:kivuton|kivuttomin|kivuttomat|kivuttomia|helpoin|helppo|helppoja|nopein|nopea|nopeita|varmin|paras|rauhallinen|rauhallisin) (?:tapa|tapoja|keino|keinoja|menetelmä|menetelmiä) (?:kuolla|tappaa ${MYSELF}|tappaa itsensä|tehdä itsemurha|lopettaa elämäni|lopettaa elämänsä)\b` },
    { signal: "method", pattern: String.raw`\bitsemurha(?:tapa|tapoja|keino|keinot|keinoja|menetelmä|menetelmät|menetelmiä|kirje|kirjeen|viesti|suunnitelma|suunnitelmani|sopimus)\b` },
    { signal: "method", pattern: String.raw`\b(?:montako|kuinka monta|kuinka paljon|paljonko)\b.{0,40}\b(?:pillereitä|pilleriä|tabletteja|tablettia|unilääkkeitä|unilääkettä|unitablettia|panadolia|buranaa|parasetamolia|mg|grammaa|lääkettä)\b.{0,40}\b(?:kuolla|kuolemaan|kuolee|tappaa|tappava|tappavaa|yliannostus|yliannostukseen)\b|\b(?:tappava|kuolettava|letaali|tappavan|kuolettavan) (?:annos|annoksen|määrä)\b` },
    { signal: "method", pattern: String.raw`\b(?:hirttää|hirtän|ampua|ammun|myrkyttää|myrkytän|tukehduttaa) ${MYSELF}\b|\b(?:hirttäydyn|hirttäytyä)\b` },
    { signal: "method", pattern: String.raw`\b(?:hyppään|hyppäisin|hypätä|heittäydyn|heittäytyä|menen) (?:sillalta|katolta|parvekkeelta|junan alle|auton alle|rekan alle|metron alle|kerrostalon katolta)\b` },
    { signal: "method", pattern: String.raw`\b(?:otan|otin|ottaa|nielen|nielin|niellä|syön|söin|vedän|vedin|ottanut) (?:koko purkin|koko paketin|purkillisen|paketillisen|yliannostuksen)\b|\bkaikki (?:lääkkeeni|pillerini|unilääkkeeni|tablettini) (?:kerralla|kerrallaan|yhdellä kertaa)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b(?:on itsetuhoinen|haluaa (?:kuolla|tappaa itsensä|tappaa ittensä|tehdä itsemurhan)|aikoo (?:tappaa itsensä|tehdä itsemurhan)|uhkaa (?:tappaa itsensä|tehdä itsemurhan|itsemurhalla)|puhuu (?:itsemurhasta|kuolemisesta|tappavansa itsensä)|yritti (?:itsemurhaa|tappaa itsensä)|on yrittänyt itsemurhaa|viiltelee|satuttaa itseään|vahingoittaa itseään|on itsemurhavaarassa|suunnittelee itsemurhaa|miettii itsemurhaa|ajattelee itsemurhaa|on puhunut itsemurhasta)` },
    { signal: "other-person", pattern: String.raw`\b(?:hän|se) (?:haluaa|aikoo|uhkaa|uhkailee|suunnittelee|sanoo tappavansa) (?:tappaa itsensä|tehdä itsemurhan|tappaa ittensä|itsemurhaa|itsemurhalla)\b` },
    { signal: "other-person", pattern: String.raw`\b(?:läheiseni|tuttuni|läheinen ihminen|joku jonka tunnen|joku läheinen|joku läheiseni)\b.{0,40}\b(?:on itsetuhoinen|haluaa (?:kuolla|tappaa itsensä)|tappaa itsensä|tehdä itsemurhan|puhuu itsemurhasta|viiltelee|yritti itsemurhaa|on yrittänyt itsemurhaa)` }
  ])
});
