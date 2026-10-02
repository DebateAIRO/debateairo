import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Kin and people close to the writer, for `other-person` — Spain and Latin America (accents
// and ñ are folded by normalisation: "compañero" is matched as "companero").
const CLOSE = String.raw`(?:amigo|amiga|mejor amigo|mejor amiga|novio|novia|pareja|marido|esposo|esposa|mujer|hijo|hija|hermano|hermana|madre|padre|mama|papa|primo|prima|sobrino|sobrina|nieto|nieta|companero|companera|compa|colega|alumno|alumna|estudiante|abuelo|abuela|tio|tia|pana|cuate|parcero|parcera|chamo|chama)`;
const MY = String.raw`(?:mi|mis|nuestro|nuestra|un|una)`;
const SELF_END = String.raw`(?:suicidarse|matarse|quitarse la vida|acabar con su vida|ahorcarse|hacerse dano|autolesionarse|cortarse las venas)`;
const PILLS = String.raw`(?:pastillas|pildoras|pastis|comprimidos|capsulas|medicamentos|remedios|somniferos|calmantes|clonazepam|paracetamol|ibuprofeno|rivotril|alprazolam)`;

export const ES: CrisisLexicon = Object.freeze({
  language: "es",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\bsuicidarme\b` },
    { signal: "intent", pattern: String.raw`\bme (?:[a-z]+ ){0,3}suicidar\b` },
    { signal: "intent", pattern: String.raw`\bme suicid(?:o|are|aria|e)\b` },
    { signal: "intent", pattern: String.raw`\b(?:quiero|quisiera|voy a|pienso|pensando en|ganas de|deberia|debo|necesito|intente|intentare|trate de|tratar de|como puedo|como|forma de|manera de|metodo para) matarme\b(?! (?:de|a|trabajando|estudiando|en el gimnasio|por (?:el|la|un|una)))` },
    { signal: "intent", pattern: String.raw`\bme (?:quiero|voy a|pienso|deberia|puedo|tengo que) matar\b(?! (?:de|a|trabajando|estudiando|en el gimnasio|por (?:el|la|un|una)))` },
    { signal: "intent", pattern: String.raw`\bme mato\s*(?:$|[.!?,;]|ya\b|hoy\b|esta noche\b|manana\b)` },
    { signal: "intent", pattern: String.raw`\b(?:quitarme|quitare|me quito|me quite|me voy a quitar|me quiero quitar) la vida\b` },
    { signal: "intent", pattern: String.raw`\b(?:acabar|terminar|poner fin|ponerle fin|acabe|acabo|acabare|termino|termine) (?:con|a) mi (?:propia )?vida\b(?! (?:de|en|social|laboral|profesional|amorosa|sentimental|academica)\b)` },
    { signal: "intent", pattern: String.raw`\b(?:quiero|quisiera|tengo ganas de|me dan ganas de|solo quiero|necesito|deseo|prefiero|preferiria) (?:morir(?:me)?|estar muert[oa]|dejar de existir|no despertar(?:me)?|no existir|no estar aqui)\b(?! (?:de (?:risa|verguenza|hambre|sed|frio|calor|miedo|amor|envidia|ganas|placer|pena)|del (?:gusto|susto|asco)|por (?:mi|la|el|un|una|los|las|amor)\b|en (?:paz|mi cama|mi tierra)))` },
    { signal: "intent", pattern: String.raw`\bme quiero morir\b(?! (?:de|del)\b)` },
    { signal: "intent", pattern: String.raw`\bquiero desaparecer\s*(?:$|[.!?,;]|para siempre|del mundo|de este mundo)` },
    { signal: "intent", pattern: String.raw`\b(?:ya )?no (?:quiero|tengo ganas de|aguanto|puedo|soporto) (?:seguir )?(?:vivir|viviendo|existir|estar viv[oa]|despertar(?:me)?|seguir aqui)\b(?! (?:en|con|asi en|cerca|lejos|aqui en|solo|sola|sin|de|del|con|junto|bajo)\b)` },
    { signal: "intent", pattern: String.raw`\bno puedo mas con (?:la vida|mi vida|esta vida|vivir)\b` },
    { signal: "intent", pattern: String.raw`\b(?:tengo|he tenido|estoy teniendo|vuelvo a tener|sigo teniendo|mis) (?:[a-z]+ )?(?:pensamientos|ideas|ideaciones|tendencias|impulsos) suicidas\b` },
    { signal: "intent", pattern: String.raw`\b(?:estoy|me siento|me he sentido|soy|me pongo|ando) (?:muy |un poco |bastante |algo |otra vez |de nuevo )?suicida\b` },
    { signal: "intent", pattern: String.raw`\b(?:pienso|pensando|he pensado|pense) (?:mucho |cada dia |a menudo |todo el tiempo |seriamente |mucho )?en (?:el )?suicid(?:io|arme)\b(?! (?:asistido|de)\b)` },
    { signal: "intent", pattern: String.raw`\bojala (?:no hubiera|no hubiese|nunca hubiera|nunca hubiese) nacido\b` },
    { signal: "intent", pattern: String.raw`\bojala (?:me muriera|me muera|estuviera muert[oa]|estuviese muert[oa]|no despertara|no despierte|no existiera)\b` },
    { signal: "intent", pattern: String.raw`\b(?:desearia|quisiera|hubiera preferido|preferiria) (?:no|nunca) haber nacido\b` },
    { signal: "intent", pattern: String.raw`\b(?:estarian|estaria|estarias|estaran|estarias|vivirian) (?:todos )?mejor sin mi\b` },
    { signal: "intent", pattern: String.raw`\b(?:estaria|estoy|estare) mejor muert[oa]\b` },
    { signal: "intent", pattern: String.raw`\b(?:quiero|voy a|pienso|deberia|ganas de|quisiera) (?:acabar|terminar) con todo\b(?! (?:lo|el|la|los|las|esto|eso)\b)` },
    { signal: "intent", pattern: String.raw`\bmi vida (?:ya )?no (?:tiene|vale|me vale) (?:ningun |nada de )?(?:sentido|nada|la pena)\b` },
    { signal: "intent", pattern: String.raw`\b(?:no tengo|no hay|sin|ninguna) (?:ninguna )?(?:razon|motivo|motivos|razones) (?:para|por (?:la que|el que)) (?:vivir|seguir viviendo|seguir viv[oa])\b(?! (?:en|con|aqui|alli|asi en)\b)` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:me|mi|mis) (?:[a-z]+ )?autolesion(?:o|e|aba|es|ando)?\b` },
    { signal: "self-harm", pattern: String.raw`\bautolesionarme\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:me corto|me estoy cortando|me he cortado|me corte|cortarme|me sigo cortando|volvi a cortarme|me vuelvo a cortar|me hago cortes|hacerme cortes|me hice cortes) (?:las venas|los brazos|los antebrazos|las munecas|la muneca|las piernas|los muslos|la piel|el brazo|a proposito|adrede|otra vez|de nuevo|a mi mism[oa])\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:cortarme|me corto|cortar) las venas\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:me hago|hacerme|me hice|me estoy haciendo|me sigo haciendo) dano\b(?! (?:en|al|con el|jugando|corriendo|entrenando|haciendo deporte)\b)` },
    { signal: "self-harm", pattern: String.raw`\b(?:quemarme|me quemo|me queme|golpearme|me golpeo|lastimarme|me lastimo|me lastime|herirme) (?:a proposito|adrede|queriendo|a mi mism[oa]|los brazos|la piel|con cigarr(?:os|illos)|con un mechero|con un encendedor)` },
    { signal: "self-harm", pattern: String.raw`\b(?:ganas de|quiero|necesito|dejar de|deje de|volvi a) (?:hacerme dano|lastimarme|cortarme|autolesionarme|herirme)\b(?! (?:el|la|los|las|un|una|en|al|jugando)\b)` },
    { signal: "self-harm", pattern: String.raw`\b(?:hago|hacer|hacia|practico|empece con el|empece a hacer|vuelvo a hacer|volvi a hacer) cutting\b` },
    // decision
    { signal: "decision", pattern: String.raw`\b(?:deberia|debo|tengo que|me conviene|es mejor) (?:suicidarme|matarme|morir(?:me)?|quitarme la vida|acabar con mi vida|seguir viviendo|seguir viv[oa]|vivir o morir|morir o vivir)\b(?! (?:en|con|aqui|alli|por|de|un dia|asi en|sin)\b)` },
    { signal: "decision", pattern: String.raw`\bmi vida (?:vale|merece|tiene) (?:la pena|algo|sentido|algun sentido)\b` },
    { signal: "decision", pattern: String.raw`\b(?:vale|merece) la pena (?:que )?(?:siga|seguir) (?:viviendo|viv[oa]|con vida)\b` },
    { signal: "decision", pattern: String.raw`\bsuicid(?:io|arme)\b.{0,30}\b(?:para mi|mi (?:unica|mejor) (?:opcion|salida|solucion))\b` },
    { signal: "decision", pattern: String.raw`\bmi (?:unica|ultima) (?:opcion|salida|solucion) (?:es|seria|sera) (?:el suicidio|morir(?:me)?|la muerte|matarme|suicidarme)\b` },
    { signal: "decision", pattern: String.raw`\b(?:importaria|extranaria|extranarian|notaria|notarian|se daria cuenta|se darian cuenta|lloraria|echaria de menos|echarian de menos)\b.{0,30}\bsi (?:me muero|me muriera|muriera|me suicido|me suicidara|me matara|desapareciera|ya no estuviera)\b` },
    { signal: "decision", pattern: String.raw`\bsi (?:me muero|me muriera|muriera|me suicido|me suicidara|me matara|desapareciera|ya no estuviera)\b.{0,30}\b(?:importaria|extranaria|extranarian|notaria|notarian|se daria cuenta|se darian cuenta|lloraria|echaria de menos|echarian de menos|estarian mejor)\b` },
    { signal: "decision", pattern: String.raw`\b(?:razones|motivos|razon|motivo) (?:para )?(?:no )?(?:suicidarme|matarme|no matarme|no suicidarme|seguir viviendo|seguir viv[oa])\b(?! (?:en|con|aqui)\b)` },
    // method
    { signal: "method", pattern: String.raw`\bcomo (?:puedo |podria |se puede |hago para |hacer para |deberia |me puedo )?(?:suicidarme|suicidarse|matarme|matarse|quitarme la vida|quitarse la vida|ahorcarme|ahorcarse|cortarme las venas|cortarse las venas|envenenarme|envenenarse)\b(?! (?:de|a trabajar|trabajando|estudiando)\b)` },
    { signal: "method", pattern: String.raw`\bcomo (?:me )?(?:puedo )?suicid(?:o|ar)\b` },
    { signal: "method", pattern: String.raw`\b(?:formas?|maneras?|metodos?|modos?) (?:mas |menos )?(?:facil|faciles|rapidas?|rapidos?|indoloras?|indoloros?|seguras?|seguros?|efectivas?|efectivos?|eficaz|eficaces|sencillas?|comodas?|pacificas?|tranquilas?|dolorosas?)? ?(?:de|para) (?:suicidarme|suicidarse|matarme|matarse|quitarme la vida|quitarse la vida|acabar con mi vida)\b` },
    { signal: "method", pattern: String.raw`\b(?:formas?|maneras?|metodos?|modos?) (?:mas |menos )?(?:facil|faciles|rapidas?|rapidos?|indoloras?|indoloros?|seguras?|seguros?|efectivas?|efectivos?|sencillas?|comodas?|pacificas?|tranquilas?|dolorosas?) (?:de|para) morir(?:me)?\b` },
    { signal: "method", pattern: String.raw`\b(?:como|quiero|quisiera|forma de|manera de)\b.{0,20}\bmorir(?:me)? (?:sin dolor|sin sufrir|rapido|rapidamente|sin sentir nada|dormid[oa])\b` },
    { signal: "method", pattern: String.raw`\b(?:dosis|cantidad) (?:letal|mortal|mortifera)\b` },
    { signal: "method", pattern: String.raw`\bcuant[oa]s?\b(?! tiempo).{0,40}\bpara (?:morir(?:me)?|matarme|matarse|suicidarme|suicidarse|una sobredosis|no despertar)\b(?! (?:de hambre|de sed|de frio))` },
    { signal: "method", pattern: String.raw`\b(?:desde que altura|que altura|cuantos pisos|cuantos metros)\b.{0,40}\b(?:morir|matarme|matarse|mortal)\b` },
    { signal: "method", pattern: String.raw`\b(?:ahorcarme|me ahorco|me voy a ahorcar|me quiero ahorcar|envenenarme|me envenenare|volarme la cabeza|volarme los sesos)\b` },
    { signal: "method", pattern: String.raw`\b(?:darme|pegarme|me voy a dar|me voy a pegar|me quiero dar|me quiero pegar|me pego|me doy) un tiro\b(?! (?:en el pie|a mi mism[oa] en el pie)\b)` },
    { signal: "method", pattern: String.raw`\b(?:tirarme|aventarme|lanzarme|arrojarme|me tiro|me aviento|me lanzo)\b.{0,15}\b(?:puente|edificio|balcon|ventana|azotea|tren|metro|vias|acantilado|precipicio|terraza|techo|piso)\b` },
    { signal: "method", pattern: String.raw`\bsobredosis (?:a proposito|intencional|voluntaria|adrede)\b` },
    { signal: "method", pattern: String.raw`\b(?:tomarme|me tome|me tomo|tragarme|me trague|tomar|tragar) (?:todas (?:mis|las) ${PILLS}(?: [a-z]+){0,2} (?:de golpe|de una vez|juntas|a la vez)|toda la caja|todo el frasco|un frasco entero|una caja entera|el bote entero|todo el bote|todo el blister)\b` },
    { signal: "method", pattern: String.raw`\b(?:nota de suicidio|carta de suicidio|pacto suicida|metodos? de suicidio|metodos? para suicidarse)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:quiere|quiso|va a|piensa|habla de|amenaza con|amenazo con|intento|intenta|trato de|trata de|tiene ganas de|esta pensando en|dice que (?:va a|quiere)) ${SELF_END}\b` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\bse (?:quiere|va a|piensa|quiso|intento|intenta|trato de|trata de|quieren|van a) (?:suicidar|matar|quitar la vida|ahorcar|cortar las venas)\b(?! (?:de|a trabajar|trabajando|estudiando)\b)` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:quiere|dice que quiere|tiene ganas de|se quiere) morir(?:se)?\b(?! (?:de|del|por)\b)` },
    { signal: "other-person", pattern: String.raw`\b${MY} ${CLOSE}\b.{0,40}\b(?:se autolesiona|se hace dano|es suicida|esta suicida|se siente suicida|tiene (?:pensamientos|ideas|tendencias) suicidas|se hace cortes|hace cutting|intento suicidarse|se intento suicidar|intento quitarse la vida|se corta (?:los brazos|las munecas|las venas|las piernas|a proposito))` },
    { signal: "other-person", pattern: String.raw`\balguien (?:que (?:quiero|conozco|amo)|cercano|de mi familia)\b.{0,40}\b(?:suicid|matarse|quitarse la vida|autolesion|se corta)` }
  ])
});
