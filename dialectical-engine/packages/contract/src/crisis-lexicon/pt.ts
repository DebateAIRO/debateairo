import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Kin and people close to the writer, for `other-person` — Portugal and Brazil (accents are
// folded by normalisation: "irmão" is matched as "irmao", "mãe" as "mae").
const CLOSE = String.raw`(?:amigo|amiga|melhor amigo|melhor amiga|namorado|namorada|companheiro|companheira|parceiro|parceira|marido|esposa|esposo|mulher|filho|filha|irmao|irma|mae|pai|primo|prima|sobrinho|sobrinha|neto|neta|colega|aluno|aluna|estudante|avo|tio|tia|enteado|enteada|crianca|mano|mana|namorade|amigue)`;
const MY = String.raw`(?:o meu|a minha|os meus|as minhas|meu|minha|meus|minhas|um|uma)`;
const SELF_END = String.raw`(?:se matar|matar-se|se suicidar|suicidar-se|tirar a (?:propria|sua) vida|acabar com a (?:propria|sua) vida|se enforcar|enforcar-se|se machucar|machucar-se|se cortar|cortar-se|se automutilar|automutilar-se|suicidio)`;
const PILLS = String.raw`(?:comprimidos|remedios|medicamentos|pilulas|calmantes|capsulas|antidepressivos|paracetamol|rivotril|clonazepam|soniferos)`;
// Places a person throws themself from or in front of.
const DROP = String.raw`(?:ponte|predio|janela|varanda|viaduto|comboio|trem|metro|linha|trilhos|precipicio|penhasco|falesia|terraco|telhado)`;

export const PT: CrisisLexicon = Object.freeze({
  language: "pt",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b(?:me suicidar|suicidar-me|me suicido|suicido-me|me suicidaria|suicidar-me-ia)\b` },
    { signal: "intent", pattern: String.raw`\b(?:quero|queria|vou|penso em|pensando em|a pensar em|tenho vontade de|vontade de|devo|deveria|devia|preciso|tentei|tentar|como|forma de|maneira de|jeito de|vou-me|quero-me) (?:me matar|matar-me)\b(?! (?:de|a|trabalhando|estudando|no trabalho|a trabalhar|a estudar)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:vou-me|quero-me|vou me|quero me) matar\b(?! (?:de|a|trabalhando|estudando|no trabalho|a trabalhar|a estudar)\b)` },
    { signal: "intent", pattern: String.raw`\beu me mato\s*(?:$|[.!?,;]|hoje\b|agora\b)` },
    { signal: "intent", pattern: String.raw`\b(?:tirar|tiro|tirei|tirarei|acabar com|acabo com|acabei com|por fim a|dar fim a|terminar com) (?:a )?minha (?:propria )?vida\b(?! (?:de|social|profissional|amorosa|financeira|academica)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:quero|vou|penso em|devo|deveria|vontade de) tirar a (?:minha )?propria vida\b` },
    { signal: "intent", pattern: String.raw`\b(?:quero|queria|so quero|tenho vontade de|preferia|gostaria de|desejo|preciso) (?:morrer|estar mort[oa]|sumir|desaparecer|deixar de existir|nao acordar|nunca mais acordar|nao existir)\b(?! (?:de (?:rir|vergonha|fome|sede|frio|calor|medo|inveja|amor|saudade|tedio)|por|pela|pelo|na|no|em|do|da|das|dos|numa|num)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:nao|ja nao) (?:quero|aguento|consigo|tenho (?:mais )?vontade de) (?:mais )?(?:viver|continuar vivendo|continuar a viver|existir|estar viv[oa]|acordar)\b(?! (?:em|no|na|num|numa|com|aqui|ali|la|sem|perto|longe|sozinh[oa]|junto|de|do|da)\b)` },
    { signal: "intent", pattern: String.raw`\bnao aguento mais (?:a|esta|essa|minha|a minha) vida\b` },
    { signal: "intent", pattern: String.raw`\b(?:estou|to|tou|me sinto|sinto-me|ando|fico|fiquei|sou|estava) (?:muito |bem |um pouco |meio |de novo |outra vez )?suicida\b` },
    { signal: "intent", pattern: String.raw`\b(?:tenho|tive|ando com|estou com|voltei a ter|os meus|meus|minhas|as minhas) (?:[a-z]+ )?(?:pensamentos|ideias|ideacoes|tendencias|impulsos) suicidas\b` },
    { signal: "intent", pattern: String.raw`\b(?:penso|pensando|pensei|tenho pensado|ando a pensar|estou a pensar) (?:[a-z]+ ){0,2}(?:em|no) (?:suicidio|morrer)\b(?! (?:de|por|pela|pelo|assistido)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:queria|preferia|gostava de|gostaria de|quem me dera|antes) (?:nunca |nao )ter nascido\b` },
    { signal: "intent", pattern: String.raw`\bquem me dera (?:estar mort[oa]|morrer|nao acordar)\b` },
    { signal: "intent", pattern: String.raw`\b(?:ficariam|ficaria|estariam|estaria|viveriam|seriam|seria) (?:todos )?(?:bem )?(?:melhor|melhores) sem mim\b` },
    { signal: "intent", pattern: String.raw`\b(?:estaria|ficaria|seria) melhor mort[oa]\b` },
    { signal: "intent", pattern: String.raw`\b(?:quero|vou|penso em|devia|deveria|vontade de) acabar com tudo\b(?! (?:o|isto|isso|aquilo)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:a )?minha vida (?:ja )?nao (?:tem|faz) (?:nenhum |mais )?(?:sentido|valor)\b` },
    { signal: "intent", pattern: String.raw`\b(?:a )?minha vida nao vale (?:nada|a pena)\b` },
    { signal: "intent", pattern: String.raw`\b(?:nenhuma|sem|nao tenho|nao ha|nao existe|nao vejo) (?:nenhuma |mais )?(?:razao|motivo|motivos|razoes|sentido) (?:para|pra) (?:viver|continuar vivendo|continuar a viver|continuar viv[oa])\b(?! (?:em|no|na|num|numa|com|aqui|ali|la)\b)` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:me corto|me cortei|me cortar|cortar-me|corto-me|cortei-me|estou me cortando|ando me cortando|a cortar-me|me cortando|voltei a me cortar|voltei a cortar-me)(?: (?:os pulsos|o pulso|os bracos|o braco|as pernas|as coxas|a pele|de proposito|outra vez|de novo|para aliviar|pra aliviar)|\s*(?:$|[.!?,;]))` },
    { signal: "self-harm", pattern: String.raw`\b(?:autolesionar-me|automutilar-me|me automutilo|me autolesiono|me automutilar|me autolesionar|me mutilo|me mutilar|mutilar-me|automutilo-me|autolesiono-me)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:minha|minhas|a minha|as minhas) (?:[a-z]+ )?(?:autolesao|autolesoes|automutilacao|automutilacoes|autoagressao|autoagressoes)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:me machuco|me machucar|me machuquei|me machucando|machucar-me|me magoo|me ferir|ferir-me|me firo|me faco mal|fazer-me mal|me fazer mal|fazer mal a mim mesm[oa]|me queimo|me queimar|queimar-me|me bato|me bater)(?: (?:de proposito|propositadamente|intencionalmente|para aliviar|pra aliviar|outra vez|de novo|com (?:lamina|gilete|estilete|faca|cigarro|isqueiro))|\s*(?:$|[.!?,;]))` },
    { signal: "self-harm", pattern: String.raw`\b(?:vontade de|quero|preciso|necessidade de|parar de|consigo parar de|voltei a|volto a|continuo a) (?:me cortar|cortar-me|me machucar|machucar-me|me ferir|ferir-me|me automutilar|me autolesionar|me mutilar|me queimar|me fazer mal|fazer-me mal)\b(?! (?:o|a|os|as|no|na|com a faca)\b)` },
    { signal: "self-harm", pattern: String.raw`\b(?:faco|pratico|fazia|voltei a fazer) cutting\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:devo|deveria|devia|tenho de|tenho que|sera que devo|sera que eu devo) (?:me matar|matar-me|me suicidar|suicidar-me|morrer|tirar a minha vida|tirar minha vida|acabar com tudo|continuar vivendo|continuar a viver|continuar viv[oa]|viver ou morrer)\b(?! (?:em|no|na|num|numa|por|pela|pelo|de|um dia|aqui|com|sem)\b)` },
    { signal: "decision", pattern: String.raw`\b(?:a )?minha vida (?:vale|valera|merece|tem) (?:a pena|algum sentido|algum valor|ser vivida)\b` },
    { signal: "decision", pattern: String.raw`\b(?:vale|valera) a pena (?:eu )?continuar (?:vivendo|a viver|viv[oa])\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bsuicidio\b.{0,30}\b(?:para mim|pra mim|(?:a )?minha (?:unica|melhor) (?:opcao|saida|solucao))\b` },
    { signal: "decision", pattern: String.raw`\b(?:a )?minha (?:unica|ultima) (?:opcao|saida|solucao) (?:e|seria|sera) (?:o suicidio|morrer|a morte|me matar|matar-me|me suicidar)\b` },
    { signal: "decision", pattern: String.raw`\b(?:sentiria|sentiriam|notaria|notariam|importaria|importava|choraria|chorariam|faria falta|daria pela minha falta|dariam pela minha falta)\b.{0,40}\bse eu (?:morresse|me matasse|me suicidasse|desaparecesse|sumisse|nao estivesse aqui|partisse)\b` },
    { signal: "decision", pattern: String.raw`\bse eu (?:morresse|me matasse|me suicidasse|desaparecesse|sumisse)\b.{0,40}\b(?:sentiria|sentiriam|notaria|notariam|importaria|faria falta|ficariam melhor|ficaria melhor|se importaria|daria pela minha falta)\b` },
    { signal: "decision", pattern: String.raw`\b(?:razoes|motivos|razao|motivo) (?:para|pra) (?:nao )?(?:me matar|matar-me|me suicidar|suicidar-me|continuar vivendo|continuar a viver|continuar viv[oa])\b(?! (?:em|no|na|com|aqui)\b)` },
    // method
    { signal: "method", pattern: String.raw`\bcomo (?:posso |poderia |faco para |fazer para |devo |se pode |eu posso |eu faco para |)?(?:me matar|matar-me|me suicidar|suicidar-me|se suicidar|se matar|suicidar|cometer suicidio|me enforcar|enforcar-me|me envenenar|tirar a (?:minha |propria )?vida|morrer sem dor|morrer rapido|cortar os pulsos)\b(?! (?:de rir|a trabalhar|de trabalhar|de estudar|a estudar)\b)` },
    { signal: "method", pattern: String.raw`\b(?:formas?|maneiras?|jeitos?|metodos?|modos?) (?:mais )?(?:facil|faceis|rapidas?|rapidos?|indolor|indolores|sem dor|seguras?|seguros?|eficaz|eficazes|eficiente|certeira|tranquila|pacifica|simples) (?:de|para|pra) (?:morrer|me matar|matar-me|se matar|me suicidar|suicidar-me|se suicidar|cometer suicidio|tirar a (?:minha |propria )?vida|acabar com (?:a )?minha vida)\b` },
    { signal: "method", pattern: String.raw`\b(?:formas?|maneiras?|jeitos?|metodos?|modos?)\b.{0,20}\b(?:de|para|pra) (?:me matar|matar-me|se matar|me suicidar|suicidar-me|se suicidar|cometer suicidio)\b` },
    { signal: "method", pattern: String.raw`\b(?:dose|quantidade) (?:letal|mortal|fatal)\b` },
    { signal: "method", pattern: String.raw`\bquant[oa]s?\b(?! tempo).{0,40}\b(?:para|pra) (?:morrer|me matar|matar-me|se matar|uma overdose|overdose|nao acordar)\b(?! (?:de fome|de sede|de frio))` },
    { signal: "method", pattern: String.raw`\b(?:de que altura|que altura|quantos andares|quantos metros)\b.{0,40}\b(?:morrer|me matar|matar-me|se matar|mortal|fatal)\b` },
    { signal: "method", pattern: String.raw`\b(?:me enforcar|enforcar-me|me enforco|me envenenar|envenenar-me|dar um tiro na (?:minha )?cabeca|me dar um tiro|dar-me um tiro|estourar os miolos|meter uma bala na cabeca)\b` },
    { signal: "method", pattern: String.raw`\b(?:me afogar|afogar-me)\b(?! (?:em|no|na|nos|nas|num|numa)\b)` },
    { signal: "method", pattern: String.raw`\b(?:me jogar|jogar-me|atirar-me|me atirar|me lancar|lancar-me|me jogo|atiro-me)\b.{0,15}\b${DROP}\b` },
    { signal: "method", pattern: String.raw`\b(?:tomar|tomei|tomo|engolir|engoli) (?:todos os |todas as |os meus |as minhas |todos os meus |todas as minhas )?${PILLS}\b.{0,15}\b(?:de uma vez|de uma so vez|juntos|juntas|ao mesmo tempo)` },
    { signal: "method", pattern: String.raw`\b(?:tomar|tomei|engolir|engoli) (?:a caixa inteira|uma caixa inteira|o frasco inteiro|um frasco inteiro|a cartela inteira|uma cartela inteira|a caixa toda|o frasco todo|a cartela toda)\b` },
    { signal: "method", pattern: String.raw`\boverdose (?:de proposito|intencional|proposital|voluntaria)\b` },
    { signal: "method", pattern: String.raw`\b(?:carta de suicidio|bilhete de suicidio|nota de suicidio|pacto suicida|metodos? de suicidio)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:quer|queria|vai|pensa em|fala em|fala de|ameaca|ameacou|tentou|esta a pensar em|esta pensando em|disse que (?:vai|quer)|anda a pensar em|tem vontade de) ${SELF_END}\b(?! (?:de|a trabalhar|trabalhando|o|os)\b)` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:quer|queria|tem vontade de|diz que quer|disse que quer) morrer\b(?! (?:de|por|pela|pelo|na)\b)` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:e|esta|anda|parece|ficou|se sente|sente-se) (?:muito |bem |meio )?suicida\b` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:tem (?:pensamentos|ideias) suicidas|se automutila|automutila-se|se autolesiona|autolesiona-se|se machuca de proposito|esta se cortando|anda a cortar-se|faz cutting|tentou (?:se matar|suicidio|o suicidio|suicidar-se|se suicidar|matar-se)|(?:se corta|corta-se)(?! (?:o|a|os|as|fazendo|ao|no|na|com a faca)\b))` },
    { signal: "other-person", pattern: String.raw`\balguem (?:que (?:eu )?(?:amo|conheco|gosto)|proximo|da (?:minha )?familia)\b.{0,40}\b(?:suicid|se matar|matar-se|tirar a (?:propria )?vida|automutil|autolesao|se corta)` }
  ])
});
