import type { CrisisLexicon, CrisisPattern } from "./types.js";

// People close to the writer, after "mein/meine/meiner/meinem/meinen", for `other-person`.
const CLOSE = String.raw`mein(?:e|er|em|en)? (?:beste[rnm]? |kleine[rnm]? |gro(?:ß|ss)e[rnm]? )?(?:freund|freundin|kumpel|partner|partnerin|mann|frau|ehemann|ehefrau|verlobter|verlobte|sohn|tochter|bruder|schwester|mutter|mama|mutti|vater|papa|kind|teenager|mitbewohner|mitbewohnerin|mitsch(?:ü|ue)ler|mitsch(?:ü|ue)lerin|sch(?:ü|ue)ler|sch(?:ü|ue)lerin|kollege|kollegin|cousin|cousine|neffe|nichte|enkel|enkelin|oma|opa)`;
// "to kill oneself" in the infinitive shapes that follow a modal or "sich".
const KILL = String.raw`(?:umbringen|umzubringen|t(?:ö|oe)ten|zu t(?:ö|oe)ten|das leben (?:zu )?nehmen|etwas an(?:zu)?tun|was an(?:zu)?tun)`;
const WAERE = String.raw`(?:wäre|waere|wär|waer)`;

export const DE: CrisisLexicon = Object.freeze({
  language: "de",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\bich (?:[a-zäöüß]+ ){0,3}mich (?:(?:selbst|jetzt|einfach|endlich|heute|nur|echt|wirklich|bald) ){0,3}(?:umbringen|umzubringen|t(?:ö|oe)ten|zu t(?:ö|oe)ten)\b` },
    { signal: "intent", pattern: String.raw`^(?:will|m(?:ö|oe)chte|werde|werd|muss|soll|sollte) (?:[a-zäöüß]+ ){0,2}mich (?:(?:selbst|jetzt|einfach|endlich|heute|nur|echt|wirklich|bald) ){0,3}(?:umbringen|umzubringen)\b` },
    { signal: "intent", pattern: String.raw`\bich bring(?:e)? mich (?:jetzt |heute |morgen |bald |einfach |noch |heute nacht )?um\b` },
    { signal: "intent", pattern: String.raw`\bmir (?:selbst )?das leben (?:zu )?nehmen\b|\b(?:nehme|nehm|nahm) mir (?:selbst )?(?:jetzt |heute |bald |)das leben\b` },
    { signal: "intent", pattern: String.raw`\bmir (?:selbst )?(?:etwas|was) an(?:zu)?tun\b` },
    { signal: "intent", pattern: String.raw`\bmein (?:eigenes )?leben (?:zu )?(?:beenden|nehmen)\b|\bmeinem (?:eigenen )?leben ein ende (?:zu )?(?:setzen|machen|bereiten)\b` },
    { signal: "intent", pattern: String.raw`\bich (?:will|m(?:ö|oe)chte|muss|wollte|w(?:ü|ue)rde (?:gerne?|lieber)|w(?:ü|ue)rd (?:gern|lieber)) (?:(?:einfach|nur|jetzt|endlich|am liebsten|lieber|gerne?|so gern|echt|wirklich) )*sterben\b(?! vor| f(?:ü|ue)r| in| an)` },
    { signal: "intent", pattern: String.raw`\bich (?:will|m(?:ö|oe)chte|mag|kann) (?:einfach |so |echt |wirklich |)(?:nicht|nich|net) (?:mehr|l(?:ä|ae)nger) (?:leben|weiterleben|weiter leben|da sein|hier sein|existieren|aufwachen)\b(?! in | mit | ohne | bei | im )` },
    { signal: "intent", pattern: String.raw`\bich (?:will|m(?:ö|oe)chte|w(?:ä|ae)re|w(?:ü|ue)rde) (?:lieber |am liebsten |einfach |)tot (?:sein|${WAERE})\b|\bich ${WAERE} (?:lieber|besser|am besten|besser dran) tot\b` },
    { signal: "intent", pattern: String.raw`\bw(?:ü|ue)nschte?,? (?:ich ${WAERE}|${WAERE} ich|dass ich) (?:tot|nie geboren|nicht geboren|nicht mehr da|nicht mehr am leben)\b` },
    { signal: "intent", pattern: String.raw`\bich (?:will|m(?:ö|oe)chte|werde|werd|muss|sollte|k(?:ö|oe)nnte|denke (?:daran|(?:ü|ue)ber)|(?:ü|ue)berlege|plane|habe vor|hab vor)\b.{0,20}\b(?:selbstmord|suizid|freitod) (?:zu )?(?:begehen|machen|ver(?:ü|ue)ben)\b` },
    { signal: "intent", pattern: String.raw`\bich denke\b.{0,20}\b(?:an|(?:ü|ue)ber|daran,?) (?:selbstmord|suizid|freitod|mich umzubringen|mir das leben zu nehmen|zu sterben)\b` },
    { signal: "intent", pattern: String.raw`\b(?:ich bin|bin ich|ich f(?:ü|ue)hle mich|f(?:ü|ue)hle mich|ich war|ich werde)\b.{0,20}\b(?:suizidal|suizidgef(?:ä|ae)hrdet|selbstmordgef(?:ä|ae)hrdet|lebensm(?:ü|ue)de)\b` },
    { signal: "intent", pattern: String.raw`\b(?:ich habe|ich hab|hab|habe|habe ich|hab ich|ich hatte|ich kriege|ich krieg|ich bekomme|meine)\b.{0,20}\b(?:suizidgedanken|selbstmordgedanken|suizidale?n? gedanken|todesgedanken|todeswunsch|todesw(?:ü|ue)nsche|todessehnsucht)\b` },
    { signal: "intent", pattern: String.raw`\bkein(?:en)? (?:sinn|grund)(?: mehr)? (?:zu leben|zum leben|weiterzuleben|weiter zu leben|am leben zu bleiben)\b|\bmein leben (?:hat|macht) (?:einfach |doch |(?:ü|ue)berhaupt |)keinen sinn mehr\b` },
    { signal: "intent", pattern: String.raw`\b(?:alle|jeder|die welt|meine familie|alle anderen|meine eltern)\b.{0,25}\b(?:besser (?:dran )?ohne mich|ohne mich besser dran)\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:ritze|ritz) mich\b|\bich ritze\b|\bmich (?:[a-zäöüß]+ ){0,3}geritzt\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:verletze|verletz|schneide|verbrenne|schlage) mich (?:selbst|absichtlich|mit absicht|immer wieder)\b` },
    { signal: "self-harm", pattern: String.raw`\bmich\b.{0,20}\b(?:absichtlich|mit absicht|bewusst|extra) (?:verletzt|verletzen|geschnitten|schneiden|verbrannt|verbrennen)\b` },
    { signal: "self-harm", pattern: String.raw`\bmeine? (?:selbstverletzung|selbstverletzungen|ritzwunden|ritznarben|svv)\b|\bich (?:habe |hab )?svv\b|\b(?:mit dem )?ritzen aufh(?:ö|oe)ren\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:soll|sollte|darf|kann) ich mich (?:selbst )?(?:einfach |jetzt |)(?:umbringen|t(?:ö|oe)ten|erschie(?:ß|ss)en|erh(?:ä|ae)ngen|aufh(?:ä|ae)ngen|vergiften)\b` },
    { signal: "decision", pattern: String.raw`\b(?:soll|sollte) ich (?:einfach |lieber |jetzt |)(?:sterben|weiterleben|weiter leben|leben oder sterben|am leben bleiben|selbstmord begehen|suizid begehen)\s*(?:$|[.!?,;]| oder)` },
    { signal: "decision", pattern: String.raw`\bist mein leben (?:noch |(?:ü|ue)berhaupt |wirklich |)(?:lebenswert|es wert|wert,? gelebt zu werden)\b|\bmein leben (?:ist )?(?:nicht mehr|nicht) lebenswert\b` },
    { signal: "decision", pattern: String.raw`\blohnt (?:es )?sich (?:mein leben|(?:noch |(?:ü|ue)berhaupt )?(?:weiter)?zu leben|weiterzuleben)\s*(?:$|[.!?,;]| noch| f(?:ü|ue)r mich)` },
    { signal: "decision", pattern: String.raw`\b(?:selbstmord|suizid|freitod|sterben|der tod|tot sein)\b.{0,20}\bf(?:ü|ue)r mich\b.{0,20}\b(?:ausweg|l(?:ö|oe)sung|option|m(?:ö|oe)glichkeit|erl(?:ö|oe)sung|besser|richtig)\b` },
    { signal: "decision", pattern: String.raw`\bmein(?:e)? (?:einziger|einzige|letzter|letzte) (?:ausweg|l(?:ö|oe)sung|option)\b.{0,20}\b(?:selbstmord|suizid|der tod|sterben|zu sterben|mich umzubringen)\b` },
    { signal: "decision", pattern: String.raw`\b(?:vermissen|interessieren|k(?:ü|ue)mmern|merken|auffallen|st(?:ö|oe)ren|traurig)\b.{0,30}\bwenn ich (?:tot|nicht mehr da|weg|nicht mehr am leben|sterbe|sterben w(?:ü|ue)rde|mich umbringe)\b` },
    { signal: "decision", pattern: String.raw`\bwenn ich (?:tot ${WAERE}|sterbe|sterben w(?:ü|ue)rde|nicht mehr da ${WAERE}|mich umbringe|mich umbringen w(?:ü|ue)rde)\b.{0,30}\b(?:vermissen|vermisst|interessieren|interessiert|k(?:ü|ue)mmern|k(?:ü|ue)mmert|merken|merkt|traurig)\b` },
    // method
    { signal: "method", pattern: String.raw`\bwie\b.{0,30}\b(?:mich|sich|dich) (?:selbst )?(?:am besten |schnell |schmerzlos |schmerzfrei |sicher |)(?:umbringen|umzubringen|t(?:ö|oe)ten|zu t(?:ö|oe)ten|erh(?:ä|ae)ngen|aufh(?:ä|ae)ngen|vergiften|erschie(?:ß|ss)en)\b` },
    { signal: "method", pattern: String.raw`\bwie (?:bringe|bring|bringt) (?:ich|man) (?:mich|sich) (?:am besten |schnell |schmerzlos |)um\b|\bwie (?:t(?:ö|oe)te|t(?:ö|oe)tet|erh(?:ä|ae)nge|erh(?:ä|ae)ngt|vergifte|vergiftet|erschie(?:ß|ss)e|erschie(?:ß|ss)t) (?:ich|man) (?:mich|sich)\b` },
    { signal: "method", pattern: String.raw`\bwie (?:kann|k(?:ö|oe)nnte|soll|sollte) (?:ich|man) (?:[a-zäöüß]+ ){0,2}(?:schmerzlos|schmerzfrei|schnell|friedlich|sanft|am schnellsten|am einfachsten|ohne schmerzen) sterben\b` },
    { signal: "method", pattern: String.raw`\b(?:schmerzlos|schmerzfrei|schnellst|einfachst|sicherst|best|friedlich|leichtest|sanft|schonend)[a-z]* (?:art|weise|methode|m(?:ö|oe)glichkeit|weg)\b.{0,10}\b(?:zu sterben|sich umzubringen|mich umzubringen|sich zu t(?:ö|oe)ten|mich zu t(?:ö|oe)ten|sich das leben zu nehmen|mir das leben zu nehmen|suizid|selbstmord)` },
    { signal: "method", pattern: String.raw`\b(?:selbstmord|suizid)-?(?:methoden?|anleitung|plan|pl(?:ä|ae)ne|brief|pakt)\b|\b(?:soll ich|ich (?:will|werde|habe|hab|muss))\b.{0,20}\babschiedsbrief\b` },
    { signal: "method", pattern: String.raw`\b(?:wie ?viele?|wie viel|wieviel)\b.{0,40}\b(?:tabletten|pillen|schlaftabletten|paracetamol|ibuprofen|insulin|mg|gramm)\b.{0,40}\b(?:t(?:ö|oe)dlich|sterben|tot|umzubringen|zu t(?:ö|oe)ten|(?:ü|ue)berdosis)\b` },
    { signal: "method", pattern: String.raw`\b(?:t(?:ö|oe)dliche|letale) dosis\b|\bich (?:habe|hab|hatte|will|werde|nehme|nahm)\b.{0,15}\b(?:ü|ue)berdosis\b` },
    { signal: "method", pattern: String.raw`\bmich (?:selbst )?(?:erh(?:ä|ae)ngen|aufh(?:ä|ae)ngen|aufzuh(?:ä|ae)ngen|zu erh(?:ä|ae)ngen|vergiften|zu vergiften|erschie(?:ß|ss)en|zu erschie(?:ß|ss)en|ertr(?:ä|ae)nken|vor (?:einen|den) (?:zug|lkw|bus) (?:werfen|legen))\b` },
    { signal: "method", pattern: String.raw`\b(?:ich|mich)\b.{0,25}\b(?:von|vom) (?:der |einer |dem |einem )?(?:br(?:ü|ue)cke|dach|hochhaus|balkon|turm|klippe)\b.{0,10}\b(?:springen|springe|st(?:ü|ue)rzen|st(?:ü|ue)rze|werfen)\b` },
    { signal: "method", pattern: String.raw`\b(?:alle meine|eine ganze|die ganze|die komplette|eine komplette) (?:packung |schachtel |dose |flasche |)(?:tabletten|pillen|schlaftabletten|medikamente)\b.{0,15}\b(?:nehmen|genommen|schlucken|geschluckt|einnehmen|eingenommen)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${CLOSE}\b.{0,40}\b(?:ist (?:suizidal|suizidgef(?:ä|ae)hrdet|selbstmordgef(?:ä|ae)hrdet|lebensm(?:ü|ue)de)|(?:will|m(?:ö|oe)chte|wollte|plant|droht|drohte|versucht|versuchte|hat versucht|denkt daran|redet davon|spricht davon|hat vor)\b.{0,15}\bsich (?:selbst )?${KILL}|(?:will|m(?:ö|oe)chte) (?:nicht mehr leben|sterben)|ritzt sich|verletzt sich (?:selbst|absichtlich|immer wieder)|hat (?:suizid|selbstmord)gedanken|denkt (?:an|(?:ü|ue)ber) (?:suizid|selbstmord)|bringt sich um)\b` },
    { signal: "other-person", pattern: String.raw`\b(?:er|sie) (?:will|m(?:ö|oe)chte|wird|droht|denkt daran|plant|hat vor|hat versucht|versucht),? sich (?:selbst )?(?:umzubringen|umbringen|zu t(?:ö|oe)ten|das leben (?:zu )?nehmen)\b` },
    { signal: "other-person", pattern: String.raw`\b(?:dass|das) (?:er|sie|mein[a-z]* [a-zäöüß]+) sich (?:etwas|was) antut\b` },
    { signal: "other-person", pattern: String.raw`\bjemand,? (?:den|die) ich (?:kenne|liebe|mag)\b.{0,40}\b(?:suizid|selbstmord|umbringen|umzubringen|das leben (?:zu )?nehmen|ritzt|verletzt sich)` }
  ])
});
