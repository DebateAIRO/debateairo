import type { SupportLanguage } from "../../packages/support-kb/src/locale.js";

type ScreenFixtures = Readonly<{
  caught: readonly [string,string,string];
  benign: readonly [string,string,string];
}>;

export type LocaleDraftScreenFixtures = Readonly<{
  caseEmail: ScreenFixtures;
  financial: ScreenFixtures;
}>;

function screen(
  caught: readonly [string,string,string],
  benign: readonly [string,string,string]
): ScreenFixtures {
  return Object.freeze({ caught:Object.freeze(caught),benign:Object.freeze(benign) });
}

function locale(
  caseCaught: readonly [string,string,string],
  caseBenign: readonly [string,string,string],
  financialCaught: readonly [string,string,string],
  financialBenign: readonly [string,string,string]
): LocaleDraftScreenFixtures {
  return Object.freeze({
    caseEmail:screen(caseCaught,caseBenign),
    financial:screen(financialCaught,financialBenign)
  });
}

/**
 * These hand-written examples define the phrases covered by the lexical
 * screens. They are broad regression fixtures, not a native-speaker guarantee.
 */
export const SUPPORT_DRAFT_SCREEN_FIXTURES: Readonly<Record<SupportLanguage,LocaleDraftScreenFixtures>> = Object.freeze({
  bg: locale(
    [
      "Имейлът до поддръжката създава случая за човек.",
      "Имейлът до екипа по поддръжката отваря случай за служител.",
      "Съобщението по електронна поща създава нов случай за поддръжка."
    ],
    [
      "Имейлът до поддръжката не създава случай.",
      "Номерът на случая е 42 и адресът за електронна поща е записан.",
      "Имейлът е изпратен. Случаят се създава само след ескалация."
    ],
    [
      "Можем да възстановим сумата по картата ви.",
      "Поддръжката може да таксува картата ви.",
      "Ще прехвърлим плащането към сметката ви."
    ],
    [
      "Поддръжката не обработва плащания.",
      "Не можем да таксуваме картата ви.",
      "Този помощник никога не прехвърля пари."
    ]
  ),
  hr: locale(
    [
      "E-pošta podršci stvara slučaj za ljudsku podršku.",
      "Poruka e-pošte službi za podršku otvara slučaj za djelatnika.",
      "E-mail upućen podršci kreira novi slučaj za agenta."
    ],
    [
      "E-pošta podršci ne stvara slučaj.",
      "Broj slučaja je 42, a adresa e-pošte je zabilježena.",
      "E-pošta je poslana. Slučaj se otvara tek nakon eskalacije."
    ],
    [
      "Možemo vam vratiti novac na karticu.",
      "Podrška može teretiti vašu karticu.",
      "Prenijet ćemo uplatu na vaš račun."
    ],
    [
      "Podrška ne obrađuje plaćanja.",
      "Ne možemo teretiti vašu karticu.",
      "Ovaj pomoćnik nikada ne prenosi novac."
    ]
  ),
  cs: locale(
    [
      "E-mail podpoře vytvoří případ pro pracovníka podpory.",
      "Zpráva e-mailem podpoře otevře případ pro člověka.",
      "E-mail zaslaný podpoře založí nový případ pro operátora."
    ],
    [
      "E-mail podpoře nevytvoří případ.",
      "Číslo případu je 42 a e-mailová adresa je zaznamenána.",
      "E-mail byl odeslán. Případ se otevře až po eskalaci."
    ],
    [
      "Můžeme vám vrátit peníze na kartu.",
      "Podpora může naúčtovat částku na vaši kartu.",
      "Převedeme platbu na váš účet."
    ],
    [
      "Podpora nezpracovává platby.",
      "Nemůžeme účtovat částky na vaši kartu.",
      "Tento asistent nikdy nepřevádí peníze."
    ]
  ),
  da: locale(
    [
      "En mail til Support opretter den menneskelige supportsag.",
      "En e-mail til support åbner en sag for en medarbejder.",
      "E-mailen til support opretter en ny sag til en agent."
    ],
    [
      "En e-mail til support opretter ikke en sag.",
      "Sagsnummeret er 42, og e-mailadressen er registreret.",
      "E-mailen er sendt. Sagen oprettes først efter eskalering."
    ],
    [
      "Vi kan refundere beløbet til dit kort.",
      "Support kan debitere dit kort.",
      "Vi overfører betalingen til din konto."
    ],
    [
      "Support behandler ikke betalinger.",
      "Vi kan ikke debitere dit kort.",
      "Denne assistent overfører aldrig penge."
    ]
  ),
  nl: locale(
    [
      "Een e-mail aan Support maakt de zaak voor menselijke ondersteuning aan.",
      "Een mail aan de ondersteuning opent een zaak voor een medewerker.",
      "De e-mail aan Support maakt een nieuwe zaak voor een agent aan."
    ],
    [
      "Een e-mail aan Support maakt geen zaak aan.",
      "Het zaaknummer is 42 en het e-mailadres is vastgelegd.",
      "De e-mail is verzonden. De zaak wordt pas na escalatie aangemaakt."
    ],
    [
      "Wij kunnen het bedrag op uw kaart terugbetalen.",
      "Support kan uw kaart belasten.",
      "Wij maken de betaling over naar uw rekening."
    ],
    [
      "Support verwerkt geen betalingen.",
      "Wij kunnen uw kaart niet belasten.",
      "Deze assistent maakt nooit geld over."
    ]
  ),
  en: locale(
    [
      "A support email creates the human support case.",
      "An email to Support opens a case for a human agent.",
      "The email to Support created a new support case."
    ],
    [
      "A support email does not create a case.",
      "Your case number is 42 and your email address is recorded.",
      "The email was sent. A case opens only after escalation."
    ],
    [
      "We can refund the charge to your card.",
      "Support can charge your card for the debate.",
      "We will transfer the payment to your account."
    ],
    // en runs dev's financial screen (any money mention falls back, negated
    // or not), so its benign rows mention no money at all.
    [
      "Support explains the published plan information.",
      "Your card number is held only by your bank.",
      "This assistant never asks for your card number."
    ]
  ),
  et: locale(
    [
      "Kasutajatoe e-kiri loob inimtoe juhtumi.",
      "Toele saadetud e-kiri avab töötajale juhtumi.",
      "Kasutajatoe e-post loob agendile uue juhtumi."
    ],
    [
      "Kasutajatoe e-kiri ei loo juhtumit.",
      "Juhtumi number on 42 ja e-posti aadress on kirjas.",
      "E-kiri on saadetud. Juhtum avatakse alles pärast eskaleerimist."
    ],
    [
      "Saame raha teie kaardile tagasi maksta.",
      "Kasutajatugi saab teie kaardilt tasu võtta.",
      "Kanname makse teie kontole."
    ],
    [
      "Kasutajatugi ei töötle makseid.",
      "Me ei saa teie kaardilt tasu võtta.",
      "See abiline ei kanna kunagi raha üle."
    ]
  ),
  fi: locale(
    [
      "Sähköposti tukeen luo ihmiselle käsiteltävän tukitapauksen.",
      "Tuelle lähetetty sähköposti avaa tapauksen työntekijälle.",
      "Tukisähköposti luo uuden tapauksen asiakaspalvelijalle."
    ],
    [
      "Sähköposti tukeen ei luo tapausta.",
      "Tapauksen numero on 42 ja sähköpostiosoite on tallennettu.",
      "Sähköposti on lähetetty. Tapaus avataan vasta eskaloinnin jälkeen."
    ],
    [
      "Voimme palauttaa maksun kortillesi.",
      "Tuki voi veloittaa korttiasi.",
      "Siirrämme maksun tilillesi."
    ],
    [
      "Tuki ei käsittele maksuja.",
      "Emme voi veloittaa korttiasi.",
      "Tämä avustaja ei koskaan siirrä rahaa."
    ]
  ),
  fr: locale(
    [
      "Un e-mail à l’assistance crée le dossier destiné à un agent humain.",
      "Le courriel envoyé à l’assistance ouvre un dossier pour un conseiller.",
      "L’e-mail adressé au support crée un nouveau dossier pour un agent."
    ],
    [
      "Un e-mail à l’assistance ne crée pas de dossier.",
      "Le numéro du dossier est 42 et l’adresse e-mail est enregistrée.",
      "L’e-mail a été envoyé. Le dossier ne s’ouvre qu’après une escalade."
    ],
    [
      "Nous pouvons rembourser le montant sur votre carte.",
      "L’assistance peut débiter votre carte.",
      "Nous transférerons le paiement sur votre compte."
    ],
    [
      "L’assistance ne traite pas les paiements.",
      "Nous ne pouvons pas débiter votre carte.",
      "Cet assistant ne transfère jamais d’argent."
    ]
  ),
  de: locale(
    [
      "Eine E-Mail an den Support erstellt den Fall für einen menschlichen Mitarbeiter.",
      "Die E-Mail an den Support eröffnet einen Fall für einen Mitarbeiter.",
      "Eine Nachricht per E-Mail legt einen neuen Supportfall für einen Agenten an."
    ],
    [
      "Eine E-Mail an den Support erstellt keinen Fall.",
      "Die Fallnummer ist 42 und die E-Mail-Adresse ist hinterlegt.",
      "Die E-Mail wurde gesendet. Der Fall wird erst nach einer Eskalation eröffnet."
    ],
    [
      "Wir können den Betrag auf Ihre Karte zurückerstatten.",
      "Der Support kann Ihre Karte belasten.",
      "Wir überweisen die Zahlung auf Ihr Konto."
    ],
    [
      "Der Support verarbeitet keine Zahlungen.",
      "Wir können Ihre Karte nicht belasten.",
      "Dieser Assistent überweist niemals Geld."
    ]
  ),
  el: locale(
    [
      "Το email προς την Υποστήριξη δημιουργεί την υπόθεση για ανθρώπινη υποστήριξη.",
      "Το μήνυμα ηλεκτρονικού ταχυδρομείου ανοίγει υπόθεση για έναν υπάλληλο.",
      "Το email στην υποστήριξη δημιουργεί νέα υπόθεση για έναν εκπρόσωπο."
    ],
    [
      "Το email προς την υποστήριξη δεν δημιουργεί υπόθεση.",
      "Ο αριθμός της υπόθεσης είναι 42 και η διεύθυνση email έχει καταγραφεί.",
      "Το email στάλθηκε. Η υπόθεση ανοίγει μόνο μετά από κλιμάκωση."
    ],
    [
      "Μπορούμε να επιστρέψουμε τα χρήματα στην κάρτα σας.",
      "Η υποστήριξη μπορεί να χρεώσει την κάρτα σας.",
      "Θα μεταφέρουμε την πληρωμή στον λογαριασμό σας."
    ],
    [
      "Η υποστήριξη δεν επεξεργάζεται πληρωμές.",
      "Δεν μπορούμε να χρεώσουμε την κάρτα σας.",
      "Αυτός ο βοηθός δεν μεταφέρει ποτέ χρήματα."
    ]
  ),
  hu: locale(
    [
      "A támogatásnak küldött e-mail létrehozza az emberi támogatási esetet.",
      "A támogatásnak írt e-mail megnyit egy esetet egy munkatársnak.",
      "A támogatási e-mail új esetet hoz létre egy ügyintézőnek."
    ],
    [
      "A támogatásnak küldött e-mail nem hoz létre esetet.",
      "Az eset száma 42, és az e-mail-cím rögzítve van.",
      "Az e-mailt elküldtük. Az eset csak eszkaláció után nyílik meg."
    ],
    [
      "Vissza tudjuk téríteni az összeget a kártyájára.",
      "A támogatás megterhelheti a kártyáját.",
      "Átutaljuk a fizetést a számlájára."
    ],
    [
      "A támogatás nem dolgoz fel fizetéseket.",
      "Nem terhelhetjük meg a kártyáját.",
      "Ez az asszisztens soha nem utal át pénzt."
    ]
  ),
  ga: locale(
    [
      "Cruthaíonn ríomhphost chuig Tacaíocht an cás don fhoireann dhaonna.",
      "Osclaíonn ríomhphost chuig an tacaíocht cás d’oibrí.",
      "Cruthaíonn an ríomhphost tacaíochta cás nua do ghníomhaire."
    ],
    [
      "Ní chruthaíonn ríomhphost chuig Tacaíocht cás.",
      "Is é 42 uimhir an cháis agus tá an seoladh ríomhphoist taifeadta.",
      "Seoladh an ríomhphost. Ní osclaítear an cás go dtí go ndéantar é a ardú."
    ],
    [
      "Is féidir linn an t-airgead a aisíoc le do chárta.",
      "Is féidir le Tacaíocht táille a ghearradh ar do chárta.",
      "Aistreoimid an íocaíocht chuig do chuntas."
    ],
    [
      "Ní phróiseálann Tacaíocht íocaíochtaí.",
      "Ní féidir linn táille a ghearradh ar do chárta.",
      "Ní aistríonn an cúntóir seo airgead riamh."
    ]
  ),
  it: locale(
    [
      "Un’e-mail all’assistenza crea il caso per il supporto umano.",
      "Il messaggio e-mail inviato all’assistenza apre un caso per un operatore.",
      "L’e-mail al supporto crea un nuovo caso per un agente."
    ],
    [
      "Un’e-mail all’assistenza non crea un caso.",
      "Il numero del caso è 42 e l’indirizzo e-mail è registrato.",
      "L’e-mail è stata inviata. Il caso viene aperto solo dopo l’escalation."
    ],
    [
      "Possiamo rimborsare l’importo sulla sua carta.",
      "L’assistenza può addebitare la sua carta.",
      "Trasferiremo il pagamento sul suo conto."
    ],
    [
      "L’assistenza non elabora pagamenti.",
      "Non possiamo addebitare la sua carta.",
      "Questo assistente non trasferisce mai denaro."
    ]
  ),
  lv: locale(
    [
      "E-pasts atbalsta dienestam izveido cilvēka izskatāmu atbalsta gadījumu.",
      "Atbalsta dienestam nosūtīts e-pasts atver gadījumu darbiniekam.",
      "Atbalsta e-pasta ziņa izveido jaunu gadījumu aģentam."
    ],
    [
      "E-pasts atbalsta dienestam neizveido gadījumu.",
      "Gadījuma numurs ir 42, un e-pasta adrese ir reģistrēta.",
      "E-pasts ir nosūtīts. Gadījums tiek atvērts tikai pēc eskalācijas."
    ],
    [
      "Mēs varam atmaksāt summu jūsu kartē.",
      "Atbalsta dienests var iekasēt maksu no jūsu kartes.",
      "Mēs pārskaitīsim maksājumu uz jūsu kontu."
    ],
    [
      "Atbalsta dienests neapstrādā maksājumus.",
      "Mēs nevaram iekasēt maksu no jūsu kartes.",
      "Šis palīgs nekad nepārskaita naudu."
    ]
  ),
  lt: locale(
    [
      "El. laiškas palaikymo tarnybai sukuria žmogaus nagrinėjamą pagalbos atvejį.",
      "Palaikymo tarnybai išsiųstas el. laiškas atidaro atvejį darbuotojui.",
      "Pagalbos el. laiškas sukuria naują atvejį specialistui."
    ],
    [
      "El. laiškas palaikymo tarnybai nesukuria atvejo.",
      "Atvejo numeris yra 42, o el. pašto adresas įrašytas.",
      "El. laiškas išsiųstas. Atvejis atidaromas tik po perdavimo aukštesniam lygiui."
    ],
    [
      "Galime grąžinti pinigus į jūsų kortelę.",
      "Palaikymo tarnyba gali nuskaičiuoti mokestį nuo jūsų kortelės.",
      "Pervesime mokėjimą į jūsų sąskaitą."
    ],
    [
      "Palaikymo tarnyba neapdoroja mokėjimų.",
      "Negalime nuskaičiuoti mokesčio nuo jūsų kortelės.",
      "Šis padėjėjas niekada neperveda pinigų."
    ]
  ),
  mt: locale(
    [
      "Email lill-Appoġġ joħloq il-każ għall-appoġġ minn persuna.",
      "Messaġġ elettroniku lill-appoġġ jiftaħ każ għal impjegat.",
      "L-email tal-appoġġ toħloq każ ġdid għal aġent."
    ],
    [
      "Email lill-Appoġġ ma joħloqx każ.",
      "In-numru tal-każ huwa 42 u l-indirizz elettroniku huwa rreġistrat.",
      "L-email intbagħtet. Il-każ jinfetaħ biss wara eskalazzjoni."
    ],
    [
      "Nistgħu nħallsu lura l-ammont fuq il-karta tiegħek.",
      "L-Appoġġ jista’ jiċċarġja l-karta tiegħek.",
      "Se nittrasferixxu l-ħlas fil-kont tiegħek."
    ],
    [
      "L-Appoġġ ma jipproċessax ħlasijiet.",
      "Ma nistgħux niċċarġjaw il-karta tiegħek.",
      "Dan l-assistent qatt ma jittrasferixxi flus."
    ]
  ),
  pl: locale(
    [
      "Wiadomość e-mail do Pomocy tworzy sprawę dla pracownika wsparcia.",
      "E-mail wysłany do pomocy otwiera sprawę dla konsultanta.",
      "Wiadomość e-mail do wsparcia tworzy nową sprawę dla agenta."
    ],
    [
      "Wiadomość e-mail do Pomocy nie tworzy sprawy.",
      "Numer sprawy to 42, a adres e-mail jest zapisany.",
      "E-mail został wysłany. Sprawa jest otwierana dopiero po eskalacji."
    ],
    [
      "Możemy zwrócić środki na Państwa kartę.",
      "Pomoc może obciążyć Państwa kartę.",
      "Przelejemy płatność na Państwa konto."
    ],
    [
      "Pomoc nie przetwarza płatności.",
      "Nie możemy obciążyć Państwa karty.",
      "Ten asystent nigdy nie przelewa pieniędzy."
    ]
  ),
  pt: locale(
    [
      "Um e-mail para o Apoio cria o caso para o atendimento humano.",
      "A mensagem de e-mail enviada ao apoio abre um caso para um funcionário.",
      "O e-mail para o suporte cria um novo caso para um agente."
    ],
    [
      "Um e-mail para o Apoio não cria um caso.",
      "O número do caso é 42 e o endereço de e-mail está registado.",
      "O e-mail foi enviado. O caso só é aberto depois de uma escalada."
    ],
    [
      "Podemos reembolsar o valor no seu cartão.",
      "O Apoio pode cobrar o seu cartão.",
      "Transferiremos o pagamento para a sua conta."
    ],
    [
      "O Apoio não processa pagamentos.",
      "Não podemos cobrar o seu cartão.",
      "Este assistente nunca transfere dinheiro."
    ]
  ),
  ro: locale(
    [
      "Emailul către asistență creează cazul pentru un agent uman.",
      "Mesajul e-mail trimis asistenței deschide un caz pentru un operator.",
      "E-mailul de asistență creează un caz nou pentru un agent."
    ],
    [
      "Emailul către asistență nu creează un caz.",
      "Numărul cazului este 42, iar adresa de e-mail este înregistrată.",
      "E-mailul a fost trimis. Cazul se deschide doar după escaladare."
    ],
    // ro runs dev's FINANCIAL_CAPABILITY expression, so its caught rows use
    // dev's money families (plat-, factur-, achit-).
    [
      "Putem procesa plata pentru dezbaterea ta.",
      "Asistența poate factura cardul tău.",
      "Vom achita suma din contul tău."
    ],
    // ro runs dev's financial screen (any money mention falls back, negated
    // or not), so its benign rows mention no money at all.
    [
      "Asistența explică informațiile publicate despre planuri.",
      "Numărul cardului este păstrat doar de banca ta.",
      "Acest asistent nu cere niciodată numărul cardului."
    ]
  ),
  ru: locale(
    [
      "Письмо в службу поддержки создаёт обращение для специалиста.",
      "Электронное письмо в поддержку открывает обращение для сотрудника.",
      "Письмо по электронной почте создаёт новое обращение для оператора."
    ],
    [
      "Письмо в службу поддержки не создаёт обращение.",
      "Номер обращения — 42, а адрес электронной почты записан.",
      "Письмо отправлено. Обращение открывается только после эскалации."
    ],
    [
      "Мы можем вернуть деньги на вашу карту.",
      "Служба поддержки может списать средства с вашей карты.",
      "Мы переведём платёж на ваш счёт."
    ],
    [
      "Служба поддержки не обрабатывает платежи.",
      "Мы не можем списывать средства с вашей карты.",
      "Этот помощник никогда не переводит деньги."
    ]
  ),
  sk: locale(
    [
      "E-mail podpore vytvorí prípad pre pracovníka podpory.",
      "Správa odoslaná e-mailom podpore otvorí prípad pre zamestnanca.",
      "E-mail pre podporu vytvorí nový prípad pre agenta."
    ],
    [
      "E-mail podpore nevytvorí prípad.",
      "Číslo prípadu je 42 a e-mailová adresa je zaznamenaná.",
      "E-mail bol odoslaný. Prípad sa otvorí až po eskalácii."
    ],
    [
      "Môžeme vám vrátiť peniaze na kartu.",
      "Podpora môže zaťažiť vašu kartu.",
      "Prevedieme platbu na váš účet."
    ],
    [
      "Podpora nespracúva platby.",
      "Nemôžeme zaťažiť vašu kartu.",
      "Tento asistent nikdy neprevádza peniaze."
    ]
  ),
  sl: locale(
    [
      "E-pošta podpori ustvari primer za človeško podporo.",
      "E-poštno sporočilo podpori odpre primer za zaposlenega.",
      "E-pošta za podporo ustvari nov primer za agenta."
    ],
    [
      "E-pošta podpori ne ustvari primera.",
      "Številka primera je 42, e-poštni naslov pa je zabeležen.",
      "E-pošta je bila poslana. Primer se odpre šele po eskalaciji."
    ],
    [
      "Znesek vam lahko povrnemo na kartico.",
      "Podpora lahko bremeni vašo kartico.",
      "Plačilo bomo prenesli na vaš račun."
    ],
    [
      "Podpora ne obdeluje plačil.",
      "Vaše kartice ne moremo bremeniti.",
      "Ta pomočnik nikoli ne prenaša denarja."
    ]
  ),
  es: locale(
    [
      "Un correo electrónico a Soporte crea el caso para un agente humano.",
      "El correo enviado al soporte abre un caso para un empleado.",
      "El e-mail a Soporte crea un caso nuevo para un agente."
    ],
    [
      "Un correo electrónico a Soporte no crea un caso.",
      "El número del caso es 42 y la dirección de correo está registrada.",
      "El correo fue enviado. El caso solo se abre después de una escalación."
    ],
    [
      "Podemos reembolsar el importe a su tarjeta.",
      "Soporte puede cargar el importe en su tarjeta.",
      "Transferiremos el pago a su cuenta."
    ],
    [
      "Soporte no procesa pagos.",
      "No podemos cargar su tarjeta.",
      "Este asistente nunca transfiere dinero."
    ]
  ),
  sv: locale(
    [
      "Ett e-postmeddelande till Support skapar ärendet för mänsklig support.",
      "E-post till support öppnar ett ärende för en medarbetare.",
      "Supportmeddelandet via e-post skapar ett nytt ärende för en agent."
    ],
    [
      "E-post till Support skapar inte ett ärende.",
      "Ärendenumret är 42 och e-postadressen är registrerad.",
      "E-postmeddelandet har skickats. Ärendet öppnas först efter eskalering."
    ],
    [
      "Vi kan återbetala beloppet till ditt kort.",
      "Support kan debitera ditt kort.",
      "Vi överför betalningen till ditt konto."
    ],
    [
      "Support behandlar inte betalningar.",
      "Vi kan inte debitera ditt kort.",
      "Den här assistenten överför aldrig pengar."
    ]
  ),
  uk: locale(
    [
      "Лист до служби підтримки створює звернення для фахівця.",
      "Електронний лист до підтримки відкриває звернення для працівника.",
      "Лист електронною поштою створює нове звернення для оператора."
    ],
    [
      "Лист до служби підтримки не створює звернення.",
      "Номер звернення — 42, а адресу електронної пошти записано.",
      "Лист надіслано. Звернення відкривається лише після ескалації."
    ],
    [
      "Ми можемо повернути гроші на вашу картку.",
      "Служба підтримки може списати кошти з вашої картки.",
      "Ми переказуватимемо платіж на ваш рахунок."
    ],
    [
      "Служба підтримки не обробляє платежі.",
      "Ми не можемо списувати кошти з вашої картки.",
      "Цей помічник ніколи не переказує гроші."
    ]
  ),
  zh: locale(
    [
      "发送给支持服务的电子邮件会创建人工支持案例。",
      "发给支持团队的邮件会为客服人员建立工单。",
      "支持邮箱收到的电子邮件会创建新的支持案例。"
    ],
    [
      "发送给支持服务的电子邮件不会创建案例。",
      "您的案例编号是 42，电子邮箱地址已记录。",
      "电子邮件已经发送。只有升级后才会创建案例。"
    ],
    [
      "我们可以把退款退到您的银行卡。",
      "支持团队可以从您的卡中扣款。",
      "我们会把付款转入您的账户。"
    ],
    [
      "支持团队不处理付款。",
      "我们不能从您的卡中扣款。",
      "此助手绝不会转账。"
    ]
  ),
  hi: locale(
    [
      "सहायता को भेजा गया ईमेल मानव सहायता मामला बनाता है।",
      "सहायता टीम को भेजा ईमेल कर्मचारी के लिए मामला खोलता है।",
      "सहायता ईमेल एजेंट के लिए नया मामला बनाता है।"
    ],
    [
      "सहायता को भेजा ईमेल मामला नहीं बनाता है।",
      "मामला संख्या 42 है और ईमेल पता दर्ज है।",
      "ईमेल भेजा गया है। मामला केवल एस्केलेशन के बाद खुलता है।"
    ],
    [
      "हम आपकी राशि कार्ड पर वापस कर सकते हैं।",
      "सहायता टीम आपके कार्ड से शुल्क ले सकती है।",
      "हम भुगतान आपके खाते में स्थानांतरित करेंगे।"
    ],
    [
      "सहायता टीम भुगतान संसाधित नहीं करती है।",
      "हम आपके कार्ड से शुल्क नहीं ले सकते हैं।",
      "यह सहायक कभी पैसे स्थानांतरित नहीं करता है।"
    ]
  ),
  id: locale(
    [
      "Email kepada Dukungan membuat kasus untuk dukungan manusia.",
      "Surel yang dikirim ke dukungan membuka kasus untuk petugas.",
      "Email dukungan membuat kasus baru untuk agen."
    ],
    [
      "Email kepada Dukungan tidak membuat kasus.",
      "Nomor kasus Anda 42 dan alamat email telah dicatat.",
      "Email telah dikirim. Kasus baru dibuka setelah eskalasi."
    ],
    [
      "Kami dapat mengembalikan dana ke kartu Anda.",
      "Dukungan dapat menagih kartu Anda.",
      "Kami akan mentransfer pembayaran ke rekening Anda."
    ],
    [
      "Dukungan tidak memproses pembayaran.",
      "Kami tidak dapat menagih kartu Anda.",
      "Asisten ini tidak pernah mentransfer uang."
    ]
  ),
  ja: locale(
    [
      "サポートへのメールによって有人サポートのケースが作成されます。",
      "サポートに送った電子メールが担当者向けのケースを開きます。",
      "サポート宛てのメールが新しい問い合わせ案件を作成します。"
    ],
    [
      "サポートへのメールではケースは作成されません。",
      "ケース番号は42で、メールアドレスは記録されています。",
      "メールは送信済みです。ケースはエスカレーション後にのみ作成されます。"
    ],
    [
      "カードへの返金を行うことができます。",
      "サポートがお客様のカードに請求できます。",
      "お支払いをお客様の口座へ送金します。"
    ],
    [
      "サポートは支払いを処理しません。",
      "お客様のカードに請求することはできません。",
      "このアシスタントが送金することはありません。"
    ]
  ),
  ko: locale(
    [
      "지원팀에 보내는 이메일은 상담원 지원 사례를 생성합니다.",
      "지원팀으로 보낸 전자 메일이 직원을 위한 사례를 엽니다.",
      "지원 이메일이 상담원을 위한 새 문의 사례를 만듭니다."
    ],
    [
      "지원팀에 보내는 이메일은 사례를 생성하지 않습니다.",
      "사례 번호는 42이고 이메일 주소가 기록되어 있습니다.",
      "이메일은 전송되었습니다. 사례는 에스컬레이션 후에만 열립니다."
    ],
    [
      "카드로 금액을 환불해 드릴 수 있습니다.",
      "지원팀에서 고객님의 카드에 청구할 수 있습니다.",
      "결제 금액을 고객님의 계좌로 이체하겠습니다."
    ],
    [
      "지원팀은 결제를 처리하지 않습니다.",
      "고객님의 카드에 청구할 수 없습니다.",
      "이 도우미는 절대로 송금하지 않습니다."
    ]
  ),
  vi: locale(
    [
      "Email gửi đến bộ phận Hỗ trợ sẽ tạo một trường hợp để nhân viên xử lý.",
      "Thư điện tử gửi cho bộ phận hỗ trợ mở một trường hợp cho nhân viên.",
      "Email hỗ trợ tạo một trường hợp mới cho chuyên viên."
    ],
    [
      "Email gửi đến bộ phận Hỗ trợ không tạo trường hợp.",
      "Số trường hợp là 42 và địa chỉ email đã được ghi lại.",
      "Email đã được gửi. Trường hợp chỉ được mở sau khi chuyển cấp."
    ],
    [
      "Chúng tôi có thể hoàn tiền vào thẻ của bạn.",
      "Bộ phận Hỗ trợ có thể tính phí vào thẻ của bạn.",
      "Chúng tôi sẽ chuyển khoản thanh toán vào tài khoản của bạn."
    ],
    [
      "Bộ phận Hỗ trợ không xử lý thanh toán.",
      "Chúng tôi không thể tính phí vào thẻ của bạn.",
      "Trợ lý này không bao giờ chuyển tiền."
    ]
  ),
  ar: locale(
    [
      "ينشئ البريد الإلكتروني المرسل إلى الدعم حالة يتولاها موظف.",
      "تفتح رسالة البريد الإلكتروني إلى الدعم حالة لموظف.",
      "ينشئ بريد الدعم الإلكتروني حالة جديدة لوكيل."
    ],
    [
      "لا ينشئ البريد الإلكتروني المرسل إلى الدعم حالة.",
      "رقم الحالة هو 42 وعنوان البريد الإلكتروني مسجل.",
      "تم إرسال البريد الإلكتروني. لا تُفتح الحالة إلا بعد التصعيد."
    ],
    [
      "يمكننا رد المبلغ إلى بطاقتك.",
      "يمكن للدعم خصم المبلغ من بطاقتك.",
      "سنحوّل الدفعة إلى حسابك."
    ],
    [
      "لا يعالج الدعم المدفوعات.",
      "لا يمكننا الخصم من بطاقتك.",
      "هذا المساعد لا يحوّل الأموال أبداً."
    ]
  ),
  he: locale(
    [
      "דוא״ל לתמיכה יוצר מקרה לטיפול אנושי.",
      "הודעת דואר אלקטרוני לתמיכה פותחת מקרה לנציג.",
      "דוא״ל התמיכה יוצר מקרה חדש עבור סוכן."
    ],
    [
      "דוא״ל לתמיכה אינו יוצר מקרה.",
      "מספר המקרה הוא 42 וכתובת הדוא״ל רשומה.",
      "הדוא״ל נשלח. המקרה נפתח רק לאחר הסלמה."
    ],
    [
      "אנחנו יכולים להחזיר את הכסף לכרטיס שלך.",
      "התמיכה יכולה לחייב את הכרטיס שלך.",
      "נעביר את התשלום לחשבון שלך."
    ],
    [
      "התמיכה אינה מעבדת תשלומים.",
      "איננו יכולים לחייב את הכרטיס שלך.",
      "העוזר הזה לעולם אינו מעביר כסף."
    ]
  ),
  tr: locale(
    [
      "Destek’e gönderilen e-posta, insan desteği için bir destek kaydı oluşturur.",
      "Destek ekibine gönderilen e-posta bir çalışan için kayıt açar.",
      "Destek e-postası bir temsilci için yeni bir vaka oluşturur."
    ],
    [
      "Destek’e gönderilen e-posta bir vaka oluşturmaz.",
      "Vaka numarası 42 ve e-posta adresi kaydedildi.",
      "E-posta gönderildi. Vaka yalnızca üst desteğe aktarıldıktan sonra açılır."
    ],
    [
      "Tutarı kartınıza iade edebiliriz.",
      "Destek kartınızdan ücret çekebilir.",
      "Ödemeyi hesabınıza aktaracağız."
    ],
    [
      "Destek ödemeleri işlemez.",
      "Kartınızdan ücret çekemeyiz.",
      "Bu asistan hiçbir zaman para transfer etmez."
    ]
  )
});
