import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Kin and people close to the writer, for `other-person` (accents optional after normalisation).
const CLOSE = String.raw`(?:ami|amie|meilleur ami|meilleure amie|pote|copain|copine|petit ami|petite amie|petit copain|petite copine|mec|meuf|compagnon|compagne|conjoint|conjointe|partenaire|mari|femme|epoux|epouse|fils|fille|frere|soeur|sœur|mere|pere|maman|papa|enfant|ado|adolescent|adolescente|coloc|colocataire|collegue|cousin|cousine|neveu|niece|eleve|etudiant|etudiante|petit-fils|petite-fille|grand-pere|grand-mere|oncle|tante)`;
const MY = String.raw`(?:mon|ma|mes|notre|nos|un|une)`;
// Things a person does to end their own life, in the reflexive third person.
const SELF_END = String.raw`(?:se suicider|se tuer|mettre fin a ses jours|se foutre en l'?air|se pendre|passer a l'acte|en finir)`;

export const FR: CrisisLexicon = Object.freeze({
  language: "fr",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\bme suicid(?:er|e|es|erai|erais|ais|ait)\b` },
    { signal: "intent", pattern: String.raw`\b(?:veux|voudrais|vais|compte|pense a|songe a|envie de|envisage de|essayer de|essaie de|essaye de|tente de|tenter de|besoin de|aimerais|devrais|dois) me (?:tuer|flinguer|buter|supprimer|foutre en l'?air)\b(?! a la tache| au travail| au boulot| a force| de travail)` },
    { signal: "intent", pattern: String.raw`\bme fout(?:re|rai|rais)? en l'?air\b` },
    { signal: "intent", pattern: String.raw`\b(?:mettre|mets|mettrai|mettrais) fin a (?:mes jours|ma vie)\b(?! de\b| d'| professionnelle| sociale| amoureuse| etudiante)` },
    { signal: "intent", pattern: String.raw`\b(?:(?:je veux|j'veux|je voudrais|j'aimerais|je vais|je dois|dois-je|devrais-je|je devrais|je pense a|je songe a) |(?:j'ai )?envie d')en finir\b(?! avec (?!la vie|ma vie|tout|l'existence))` },
    { signal: "intent", pattern: String.raw`\ben finir avec (?:la vie|ma vie|l'existence)\b` },
    { signal: "intent", pattern: String.raw`\b(?:je |j'|j)(?:veux|voudrais|aimerais|ai envie de|ai juste envie de|souhaite|prefererais) (?:juste |seulement |vraiment |tellement )?(?:mourir|crever|etre mort|etre morte|ne plus exister|ne plus etre la|ne plus me reveiller)\b(?! de (?:rire|honte|faim|froid|chaud|peur|jalousie|curiosite|fatigue|plaisir)| d'(?:envie|ennui|impatience)| pour (?:la|ma|mon|mes|une|un|des|les|ses|son|sa|ce|cette)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:je |j'|j)(?:veux|voudrais|aimerais) (?:juste |seulement )?disparaitre\s*(?:$|[.!?,;]|pour toujours|a jamais|definitivement|de ce monde)` },
    { signal: "intent", pattern: String.raw`\b(?:je |j'|j)?(?:ne |n')?(?:veux|voudrais|ai|ai pas|peux|supporte|arrive) plus (?:envie de |la force de |le courage de |aucune envie de |a )?(?:vivre|exister|me reveiller|etre en vie)\b(?! (?:a|au|aux|en|dans|avec|chez|ici|sans|sous|seul|seule|ensemble|pres|loin)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:je n'en|j'en|jen|j'en ai) peux plus de (?:vivre|la vie|cette vie|ma vie|exister)\b(?! chere\b)` },
    { signal: "intent", pattern: String.raw`\b(?:marre|ras le bol|ras-le-bol|fatigue|fatiguee|lasse|las|degoute|degoutee) de (?:vivre|la vie|exister)\b(?! chere| en ville| a paris| moderne| politique| d'etudiant| de bureau)` },
    { signal: "intent", pattern: String.raw`\b(?:aucune|plus de|plus aucune|pas de|sans) raisons? de vivre\b` },
    { signal: "intent", pattern: String.raw`\bma vie ne (?:vaut|sert) (?:plus )?rien\b` },
    { signal: "intent", pattern: String.raw`\bma vie n'a (?:plus )?(?:aucun|pas de|plus de) sens\b` },
    { signal: "intent", pattern: String.raw`\b(?:je suis|j'suis|jsuis|chui|je me sens|je me sentais|je deviens|je redeviens|j'etais|je suis devenue?)\s(?:[a-z']+ ){0,2}suicidaire` },
    { signal: "intent", pattern: String.raw`\bj'(?:ai|avais|ai eu|ai encore|ai souvent|ai parfois|ai de plus en plus)\s(?:[a-z']+ ){0,2}(?:idees|pensees|envies|tendances|pulsions) suicidaires\b` },
    { signal: "intent", pattern: String.raw`\bmes (?:idees|pensees|envies|tendances|pulsions|crises) suicidaires\b` },
    { signal: "intent", pattern: String.raw`\bje (?:pense|songe|reflechis) (?:[a-z]+ ){0,2}au suicide\b` },
    { signal: "intent", pattern: String.raw`\bj'ai (?:deja )?fait (?:une |plusieurs |deux |trois )?(?:ts|tentatives? de suicide)\b` },
    { signal: "intent", pattern: String.raw`\b(?:prefere|voulu|aime|voudrais|aimerais|souhaiterais) (?:ne )?(?:jamais|pas) (?:etre nee?|avoir existe|avoir vu le jour)\b` },
    { signal: "intent", pattern: String.raw`\b(?:serait|seraient|serais|sera|seront|seriez|serions) (?:tous )?mieux sans moi\b` },
    { signal: "intent", pattern: String.raw`\b(?:je serais|serais-je|je serai) mieux mort(?:e)?\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:me|m') ?(?:scarifier|scarifie|scarifiais|mutiler|mutile|mutilais|automutiler|automutile|automutilais|taillader|taillade)\b` },
    { signal: "self-harm", pattern: String.raw`\bje me suis (?:scarifiee?|mutilee?|automutilee?|tailladee?)\b` },
    { signal: "self-harm", pattern: String.raw`\bje me (?:fais du mal|suis fait du mal|suis faite du mal)\b(?! (?:en|au|a la|a l'|avec (?:le|la|les) (?:sport|course|genou)))` },
    { signal: "self-harm", pattern: String.raw`\b(?:envie de|veux|voudrais|vais|besoin de|continue a|continue de|recommence a|arrete de|arreter de|arrive pas a arreter de|m'empecher de) me (?:faire du mal|couper|bruler|griffer|frapper|blesser)\b(?! (?:les cheveux|la frange|les ongles|la barbe|du monde|des autres|de|un|une|le|la|au|a|en)\b)` },
    { signal: "self-harm", pattern: String.raw`\bje me (?:coupe|coupais|suis coupee?|brule|brulais|griffe|frappe) (?:les veines|les bras|les poignets|le poignet|les cuisses|la peau|expres|volontairement|pour me soulager|pour ressentir)` },
    { signal: "self-harm", pattern: String.raw`\bmes (?:scarifications|cicatrices de scarification|automutilations)\b` },
    { signal: "self-harm", pattern: String.raw`\bmon automutilation\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:devrais-je|dois-je|devrais je|dois je|faut-il que je|est-ce que je (?:dois|devrais)|je devrais|je dois) (?:me suicider|me tuer|mourir|en finir|mettre fin a mes jours|continuer a vivre|rester en vie|vivre ou mourir)\b(?! (?:un jour|pour|de|d'|a|au|en|dans|avec|ici|chez|sans|comme)\b)` },
    { signal: "decision", pattern: String.raw`\bma vie (?:vaut|vaut-elle|merite|merite-t-elle|a-t-elle|a) (?:encore |vraiment |seulement )?(?:la peine|d'etre vecue|un sens|un interet)` },
    { signal: "decision", pattern: String.raw`\b(?:a quoi bon|(?:ca|cela) (?:ne )?sert (?:a )?(?:rien|quoi) de) (?:continuer a )?(?:vivre|rester en vie)\b(?! (?:a|au|en|dans|avec|ici)\b)` },
    { signal: "decision", pattern: String.raw`\bsuicide\b.{0,30}\b(?:pour moi|ma seule (?:solution|option|issue))\b` },
    { signal: "decision", pattern: String.raw`\bma (?:seule|derniere) (?:solution|issue|option|echappatoire) (?:c'est|est|serait|reste) (?:le suicide|la mort|de mourir|de me tuer|d'en finir|de me suicider)` },
    { signal: "decision", pattern: String.raw`\b(?:manquerais|remarquerait|remarqueraient|regretterait|pleurerait|s'en rendrait compte|s'en soucierait|s'en apercevrait)\b.{0,25}\bsi je (?:mourais|meurs|disparaissais|me suicidais|me tuais|n'etais plus la)\b` },
    { signal: "decision", pattern: String.raw`\bsi je (?:mourais|disparaissais|me suicidais|me tuais|n'etais plus la)\b.{0,30}\b(?:manquerais|remarquerait|remarqueraient|triste|tristes|s'en soucierait|s'en rendrait compte|mieux)\b` },
    { signal: "decision", pattern: String.raw`\b(?:raisons?|motifs?) de (?:ne pas )?(?:me suicider|me tuer|rester en vie|continuer a vivre)\b` },
    // method
    { signal: "method", pattern: String.raw`\bcomment (?:me|se|on peut se|on se|puis-je me|je peux me|faire pour se|faire pour me|faut-il se|pourrais-je me) (?:suicider|suicide|tuer|pendre|foutre en l'?air|flinguer|ouvrir les veines|taillader les veines|couper les veines)\b(?! (?:a la tache|au travail|de rire))` },
    { signal: "method", pattern: String.raw`\bcomment (?:mourir|me tuer|se tuer|en finir|mettre fin a (?:mes|ses|ma|sa) (?:jours|vie))\b.{0,10}\b(?:sans (?:douleur|souffrir|souffrance|avoir mal)|vite|rapidement|facilement|proprement|discretement|paisiblement|sans que personne)` },
    { signal: "method", pattern: String.raw`\bcomment (?:je peux |puis-je |pourrais-je )?mourir\s*(?:$|[.!?,;])` },
    { signal: "method", pattern: String.raw`\b(?:facons?|manieres?|moyens?|methodes?|techniques?) (?:la |le |les )?(?:plus )?(?:douces?|doux|rapides?|simples?|faciles?|efficaces?|sures?|surs?|indolores?|radicale?s?|sans douleur|sans souffrance) (?:de |pour |d')(?:mourir|me suicider|se suicider|me tuer|se tuer|en finir|mettre fin a (?:mes|ses|sa|ma) (?:jours|vie))\b` },
    { signal: "method", pattern: String.raw`\b(?:me suicider|se suicider|me tuer|se tuer|en finir)\b.{0,15}\bsans (?:douleur|souffrir|souffrance|avoir mal)\b` },
    { signal: "method", pattern: String.raw`\b(?:lettre de suicide|pacte suicidaire|methodes? de suicide|methodes? pour se suicider|plan de suicide)\b` },
    { signal: "method", pattern: String.raw`\b(?:dose|quantite) (?:mortelle|letale|fatale)\b` },
    { signal: "method", pattern: String.raw`\bcombien de\b(?! temps).{0,40}\bpour (?:mourir|me tuer|se tuer|en finir|faire une overdose|y rester|ne plus me reveiller)\b(?! de faim| de soif| de froid)` },
    { signal: "method", pattern: String.raw`\b(?:quelle hauteur|de quelle hauteur|combien de metres|combien d'etages)\b.{0,40}\b(?:mourir|me tuer|se tuer|mortelle|mortel)\b` },
    { signal: "method", pattern: String.raw`\bme (?:pendre|defenestrer|empoisonner|ouvrir les veines|taillader les veines|couper les veines|faire sauter la cervelle|tirer une balle)\b(?! au cou| a son cou| dans le pied)` },
    { signal: "method", pattern: String.raw`\bm'(?:empoisonner|ouvrir les veines)\b` },
    { signal: "method", pattern: String.raw`\bme (?:jeter|lancer) (?:sous|devant|du haut|d'un|d'une|par la|dans le vide|depuis)\b.{0,15}\b(?:train|metro|rer|bus|camion|voiture|pont|immeuble|toit|fenetre|falaise|balcon|vide|viaduc)\b` },
    { signal: "method", pattern: String.raw`\bje (?:vais|veux|voudrais|pourrais|compte|pense a) sauter\b.{0,20}\b(?:pont|immeuble|toit|fenetre|falaise|balcon|viaduc|sous un train)\b` },
    { signal: "method", pattern: String.raw`\b(?:faire|fais|ferai|vais faire) une (?:overdose|od)\b(?! accidentelle)` },
    { signal: "method", pattern: String.raw`\boverdose (?:volontaire|expres|intentionnelle)\b` },
    { signal: "method", pattern: String.raw`\b(?:prendre|avaler|pris|avale|prends|j'avale) (?:toute (?:la|ma) (?:boite|plaquette)|toutes? (?:les|mes) (?:boites|plaquettes)|une boite entiere)\b` },
    { signal: "method", pattern: String.raw`\b(?:tous|toutes) (?:mes|les) (?:cachets|medicaments|comprimes|somniferes|pilules)\b.{0,15}\b(?:d'un coup|d'un seul coup|en meme temps|a la fois|en une fois)` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:veut|voudrait|va|menace de|parle de|pense a|a essaye de|a tente de|essaie de|essaye de|tente de|envisage de|compte|songe a|a envie de|risque de|a parle de) ${SELF_END}\b(?! a la tache| au travail)` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:veut|voudrait|a envie de|dit vouloir|dit qu'(?:il|elle) veut) (?:mourir|disparaitre)\b(?! de| d'| pour)` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:est|semble|se sent|sont|devient) (?:tres |vraiment |peut-etre |completement )?suicidaire` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:se scarifie|se mutile|s'automutile|se coupe (?:les veines|les bras|les poignets)|se fait du mal|s'est scarifiee?|s'est mutilee?|a fait une tentative de suicide|a fait une ts|a des idees suicidaires|a des pensees suicidaires)` },
    { signal: "other-person", pattern: String.raw`\b(?:quelqu'un|une personne) (?:que j'aime|de ma famille|de mes proches|proche de moi|que je connais)\b.{0,40}\b(?:suicidaire|se suicider|se tuer|mettre fin a ses jours|se scarifie|se mutile)` },
    { signal: "other-person", pattern: String.raw`\b(?:veut|voudrait|menace de|parle de|pense a|compte|a envie de|envisage de|essaie de|va) (?:se suicider|se foutre en l'?air)\b` }
  ])
});
