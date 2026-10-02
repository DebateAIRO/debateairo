import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Kin and people close to the writer, for `other-person` ("mio fratello", "la mia amica").
const CLOSE = String.raw`(?:amico|amica|migliore amico|migliore amica|ragazzo|ragazza|fidanzato|fidanzata|compagno|compagna|marito|moglie|figlio|figlia|fratello|sorella|madre|padre|mamma|papa|cugino|cugina|nipote|collega|coinquilino|coinquilina|alunno|alunna|studente|studentessa|nonno|nonna|zio|zia|partner|figliastro|figliastra)`;
const MY = String.raw`(?:il mio|la mia|mio|mia|i miei|le mie|un mio|una mia|nostro|nostra|un|una)`;
const SELF_END = String.raw`(?:suicidarsi|uccidersi|ammazzarsi|togliersi la vita|farla finita|impiccarsi|farsi del male|tagliarsi le vene|buttarsi (?:da|dal|dalla|sotto))`;
const PILLS = String.raw`(?:pastiglie|pillole|compresse|farmaci|tachipirina|paracetamolo|sonniferi|gocce|xanax|benzodiazepine|antidepressivi|flaconi|scatole|medicine)`;

export const IT: CrisisLexicon = Object.freeze({
  language: "it",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\bsuicidarmi\b` },
    { signal: "intent", pattern: String.raw`\b(?:togliermi|mi tolgo|mi voglio togliere|mi sono tolto) la vita\b` },
    { signal: "intent", pattern: String.raw`\b(?:voglio|vorrei|devo|dovrei|penso di|sto pensando di|ho pensato di|ho voglia di|mi viene voglia di|voglia di|provo a|provare a|ho provato a|ho tentato di|come|modo per|modi per|metodo per|sto per|finiro per|vado a) (?:uccidermi|ammazzarmi|togliermi la vita|farmi fuori|impiccarmi)\b(?! (?:di|dal|dalla|dalle|a lavorare|studiando|per (?:il|la|lo|un|una))\b)` },
    { signal: "intent", pattern: String.raw`\bmi (?:voglio|vorrei|devo|dovrei|sto per|vado a) (?:suicidare|uccidere|ammazzare|impiccare|togliere la vita)\b(?! (?:di|dal|dalle|a lavorare|per|con)\b)` },
    { signal: "intent", pattern: String.raw`\bmi (?:suicido|uccido|ammazzo|impicco|tolgo la vita)\b(?:\s*(?:$|[.!?,;])| stasera| stanotte| oggi| domani| adesso| subito| davvero)` },
    { signal: "intent", pattern: String.raw`\b(?:voglio|vorrei|devo|dovrei|penso di|ho voglia di|voglia di|sto per|potrei|la voglio|meglio) farla finita\b(?! con (?!la vita|tutto|questa vita))` },
    { signal: "intent", pattern: String.raw`\bla faccio finita\b(?! con (?!la vita|tutto|questa vita))` },
    { signal: "intent", pattern: String.raw`\b(?:voglio|vorrei|ho voglia di|desidero|preferirei|voglio solo|vorrei solo|preferisco) (?:morire|essere mort[oa]|sparire|scomparire|non svegliarmi piu|non svegliarmi|non esistere|smettere di esistere|non esserci piu)\b(?! (?:dal (?:ridere|sonno)|dalle risate|di (?:vergogna|fame|sete|freddo|caldo|noia|paura|invidia|gelosia|piacere)|per (?:la|il|lo|un|una|i|gli|le|amore)\b|dai|dalle|dagli|da (?:instagram|internet|facebook|tiktok|social)|dai social|in pace|nel sonno a))` },
    { signal: "intent", pattern: String.raw`\bnon (?:voglio|ho (?:piu )?voglia di|riesco (?:piu )?a|ce la faccio (?:piu )?a) (?:piu )?(?:vivere|esistere|svegliarmi|andare avanti|essere viv[oa]|stare al mondo)\b(?! (?:in|a|al|allo|alla|con|qui|li|la|da|senza|vicino|lontano|cosi in|sul|sulla|nel|nella)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:sono|mi sento|sto diventando|divento|ero) (?:molto |un po |di nuovo |ancora )?(?:suicida|suicidario|suicidaria)\b` },
    { signal: "intent", pattern: String.raw`\b(?:ho|ho avuto|ho ancora|continuo ad avere|i miei|le mie|mi vengono|mi tornano) (?:[a-z]+ )?(?:pensieri|idee|tendenze|impulsi) (?:suicidi|suicidari|suicide|suicidarie|di suicidio|di morte)\b` },
    { signal: "intent", pattern: String.raw`\b(?:penso|pensando|ho pensato|sto pensando|ci penso) (?:[a-z]+ ){0,2}al suicidio\b(?! assistito)` },
    { signal: "intent", pattern: String.raw`\bho (?:gia )?tentato (?:il suicidio|di uccidermi|di suicidarmi|di togliermi la vita|di ammazzarmi)\b` },
    { signal: "intent", pattern: String.raw`\b(?:vorrei|avrei preferito|preferirei|magari) (?:non )?(?:essere mai nat[oa]|essere nat[oa] mai|non essere nat[oa]|non esistere|essere mort[oa])\b` },
    { signal: "intent", pattern: String.raw`\b(?:starebbero|starebbe|sarebbero|sarebbe) (?:tutti )?meglio senza (?:di )?me\b` },
    { signal: "intent", pattern: String.raw`\bsarebbe meglio se (?:io )?(?:morissi|non ci fossi piu|sparissi|fossi mort[oa]|non esistessi|non fossi mai nat[oa])\b` },
    { signal: "intent", pattern: String.raw`\bstarei meglio mort[oa]\b` },
    { signal: "intent", pattern: String.raw`\bla mia vita non (?:ha (?:piu )?(?:nessun |alcun )?senso|vale (?:piu )?(?:niente|nulla|la pena))\b` },
    { signal: "intent", pattern: String.raw`\b(?:nessun |non ho (?:un |alcun |piu |nessun )?|senza |non c'e (?:un |nessun )?|non ho piu nessun )(?:motivo|ragione|motivi|ragioni) (?:per|di) (?:vivere|continuare a vivere|restare in vita|stare al mondo)\b(?! (?:in|a|al|con|qui|li|la)\b)` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:mi taglio|mi sono tagliat[oa]|tagliarmi|mi tagliavo|mi sto tagliando|ho ricominciato a tagliarmi)(?: (?:i polsi|le braccia|le gambe|le cosce|la pelle|di nuovo|ancora|apposta|volontariamente|per sfogarmi|per sentire)|\s*(?:$|[.!?,;]))` },
    { signal: "self-harm", pattern: String.raw`\b(?:mi autolesiono|autolesionarmi|mi autolesionavo|mi sono autolesionat[oa]|mi sto autolesionando)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:il mio autolesionismo|le mie autolesioni|i miei tagli sulle braccia)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:farmi del male|mi faccio del male|mi sono fatt[oa] del male|mi ferisco|ferirmi|mi brucio|bruciarmi|mi graffio|graffiarmi|mi picchio|picchiarmi)(?: (?:apposta|di proposito|volontariamente|da sol[oa]|con (?:le lamette|la lametta|il coltello|una lametta|l'accendino|le sigarette))|\s*(?:$|[.!?,;]))` },
    { signal: "self-harm", pattern: String.raw`\b(?:voglia di|voglio|bisogno di|smettere di|smetto di|continuo a|ricomincio a|ho ricominciato a) (?:farmi del male|tagliarmi|ferirmi|bruciarmi|autolesionarmi|graffiarmi)\b(?! (?:i capelli|le unghie|la barba|la frangia|il dito|con la carta)\b)` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:dovrei|devo|e giusto|ha senso|conviene|vale la pena|e meglio) (?:che io )?(?:suicidarmi|uccidermi|ammazzarmi|togliermi la vita|farla finita|morire|continuare a vivere|restare in vita|vivere o morire)\b(?! (?:di|dal|dalle|per|in|a|con|qui|un giorno|da)\b)` },
    { signal: "decision", pattern: String.raw`\bmi (?:dovrei|devo|conviene) (?:suicidare|uccidere|ammazzare)\b` },
    { signal: "decision", pattern: String.raw`\bla mia vita (?:ha|vale) (?:ancora )?(?:senso|la pena|qualcosa)\b` },
    { signal: "decision", pattern: String.raw`\bsuicidio\b.{0,30}\b(?:per me|la mia (?:unica|migliore) (?:opzione|soluzione|via d'uscita|scelta))\b` },
    { signal: "decision", pattern: String.raw`\bla mia (?:unica|ultima) (?:opzione|soluzione|via d'uscita|scelta) (?:e|sarebbe|sara) (?:il suicidio|morire|la morte|uccidermi|farla finita|suicidarmi)\b` },
    { signal: "decision", pattern: String.raw`\b(?:mancherei|se ne accorgerebbe|se ne accorgerebbero|importerebbe|piangerebbe|interesserebbe|noterebbe)\b.{0,30}\bse (?:io )?(?:morissi|mi uccidessi|mi suicidassi|sparissi|non ci fossi piu)\b` },
    { signal: "decision", pattern: String.raw`\bse (?:io )?(?:morissi|mi uccidessi|mi suicidassi|sparissi|non ci fossi piu)\b.{0,30}\b(?:mancherei|se ne accorgerebbe|se ne accorgerebbero|importerebbe|piangerebbe|starebbero meglio|noterebbe)\b` },
    { signal: "decision", pattern: String.raw`\b(?:motivi|ragioni|motivo|ragione) per (?:non )?(?:uccidermi|suicidarmi|ammazzarmi|continuare a vivere|restare in vita|non farla finita)\b(?! (?:in|a|qui)\b)` },
    // method
    { signal: "method", pattern: String.raw`\bcome (?:posso |potrei |si fa a |fare a |faccio a |devo |ci si )?(?:suicidarmi|suicidarsi|suicida|uccidermi|uccidersi|ammazzarmi|ammazzarsi|togliermi la vita|togliersi la vita|impiccarmi|impiccarsi|farla finita|morire senza (?:dolore|soffrire)|tagliarmi le vene|tagliarsi le vene|avvelenarmi|avvelenarsi)\b(?! (?:di|dal|dalle|a lavorare|con (?!la vita|tutto))\b)` },
    { signal: "method", pattern: String.raw`\b(?:modo|modi|metodo|metodi|maniera|sistema) (?:piu )?(?:facile|facili|veloce|veloci|rapido|rapidi|indolore|indolori|sicuro|sicuri|efficace|efficaci|semplice|semplici|dolce|tranquillo|pacifico|senza dolore) (?:per|di) (?:morire|suicidarmi|suicidarsi|uccidermi|uccidersi|ammazzarmi|ammazzarsi|togliermi la vita|togliersi la vita|farla finita)\b` },
    { signal: "method", pattern: String.raw`\b(?:modo|modi|metodo|metodi|maniera|sistema)\b.{0,15}\bper (?:suicidarmi|suicidarsi|uccidermi|togliermi la vita|farla finita|ammazzarmi)\b` },
    { signal: "method", pattern: String.raw`\b(?:dose|quantita) (?:letale|mortale|fatale)\b` },
    { signal: "method", pattern: String.raw`\bquant[aioe]\b.{0,40}\b${PILLS}\b.{0,30}\bper (?:morire|uccidermi|uccidersi|ammazzarmi|andare in overdose|un'overdose|non svegliarmi)` },
    { signal: "method", pattern: String.raw`\b(?:da che altezza|da quale altezza|quanti piani|quanti metri)\b.{0,40}\b(?:morire|uccidermi|uccidersi|mortale|letale)\b` },
    { signal: "method", pattern: String.raw`\b(?:buttarmi|lanciarmi|gettarmi|mi butto|mi lancio|mi getto)\b.{0,15}\b(?:ponte|palazzo|finestra|balcone|treno|metro|binari|terrazzo|tetto|viadotto|scogliera|dirupo|burrone)\b` },
    { signal: "method", pattern: String.raw`\b(?:impiccarmi|mi impicco|avvelenarmi|mi avveleno|tagliarmi le vene|mi taglio le vene|annegarmi|(?:spararmi|mi sparo) (?:un colpo|in testa|alla testa|una pallottola)|piantarmi una pallottola)\b` },
    { signal: "method", pattern: String.raw`\b(?:prendere|prendo|ho preso|ingoiare|ingoiato|mandare giu) (?:tutta la scatola|tutto il flacone|una scatola intera|un flacone intero|tutte le (?:mie )?${PILLS}(?: [a-z]+){0,2} (?:insieme|in una volta|tutte insieme))\b` },
    { signal: "method", pattern: String.raw`\boverdose (?:volontaria|intenzionale|apposta)\b` },
    { signal: "method", pattern: String.raw`\b(?:biglietto (?:del|di) suicidio|lettera di suicidio|patto suicida|metodi di suicidio|metodi suicidari)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:vuole|vorrebbe|sta per|pensa di|parla di|minaccia di|ha minacciato di|ha tentato di|ha provato a|prova a|cerca di|ha detto che vuole|dice di voler|ha voglia di) ${SELF_END}\b(?! (?:di|dal|dalle|per|con|i capelli|le unghie)\b)` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:vuole|vorrebbe|dice di voler|ha voglia di) morire\b(?! (?:di|dal|dalle|per)\b)` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\bsi (?:vuole|sta per|vorrebbe) (?:suicidare|uccidere|ammazzare|impiccare|togliere la vita)\b(?! (?:di|dal|dalle|per)\b)` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:(?:e|sembra|si sente) (?:molto |un po )?suicida|ha (?:pensieri|idee|tendenze) (?:suicidi|suicidari|suicide)|si autolesiona|si fa del male|ha tentato il suicidio|ha tentato di (?:uccidersi|suicidarsi|togliersi la vita)|si taglia (?:i polsi|le braccia|le gambe|di nuovo|apposta))\b` },
    { signal: "other-person", pattern: String.raw`\bqualcuno (?:a cui tengo|che amo|che conosco|vicino a me|della mia famiglia)\b.{0,40}\b(?:suicid|uccidersi|togliersi la vita|farla finita|autolesion|si taglia)` }
  ])
});
