import { describe, expect, it } from "vitest";

import { argumentLanguageDirective, detectArgumentLanguage } from "@debateai/kernel";

const CASES = [
  ["ro", "Romanian", "Ar trebui ca România să investească mai mult în transportul public, deoarece orașele au nevoie de aer mai curat."],
  ["en", "English", "Should the government fund public transit when it can reduce congestion and improve access to work?"],
  ["fr", "French", "La ville devrait-elle financer les transports publics, car ils sont utiles pour les habitants et pour le climat ?"],
  ["de", "German", "Sollte die Stadt den öffentlichen Verkehr ausbauen, weil er für die Bürger und für das Klima wichtig ist?"],
  ["es", "Spanish", "¿Debería la ciudad invertir en transporte público porque es mejor para los ciudadanos y para el clima?"],
  ["it", "Italian", "La città dovrebbe investire nel trasporto pubblico perché è utile per i cittadini e per il clima?"],
  ["pt", "Portuguese", "A cidade deveria investir em transporte público porque é melhor para os cidadãos e para o clima?"],
  ["pl", "Polish", "Czy państwo powinno więcej inwestować w transport publiczny, ponieważ jest on ważny dla ludzi i dla klimatu?"],
  ["ar", "Arabic", "هل ينبغي للحكومة أن تستثمر أكثر في النقل العام لأنه يفيد المجتمع ويقلل التلوث؟"],
  ["he", "Hebrew", "האם הממשלה צריכה להשקיע יותר בתחבורה ציבורית כדי להפחית זיהום ולשפר את הגישה לעבודה?"],
  ["zh", "Chinese", "政府是否应该增加公共交通投资，以减少拥堵并改善居民的出行机会？"],
  ["ja", "Japanese", "政府は渋滞を減らし市民の移動を改善するために、公共交通へもっと投資すべきでしょうか。"],
  ["ko", "Korean", "정부는 혼잡을 줄이고 시민의 이동권을 개선하기 위해 대중교통에 더 투자해야 할까요?"],
  ["ru", "Russian", "Должно ли государство больше инвестировать в общественный транспорт, чтобы уменьшить пробки и загрязнение?"],
  ["uk", "Ukrainian", "Чи має держава більше інвестувати у громадський транспорт, щоб зменшити затори й поліпшити якість повітря?"],
  ["bg", "Bulgarian", "Трябва ли държавата да инвестира повече в обществения транспорт, за да намали задръстванията и замърсяването?"],
  ["el", "Greek", "Πρέπει η κυβέρνηση να επενδύσει περισσότερο στις δημόσιες συγκοινωνίες για να μειώσει τη ρύπανση;"],
  ["hi", "Hindi", "क्या सरकार को भीड़ और प्रदूषण कम करने के लिए सार्वजनिक परिवहन में अधिक निवेश करना चाहिए?"],
  ["tr", "Turkish", "Hükümet, trafik sıkışıklığını azaltmak ve halkın işe erişimini iyileştirmek için toplu taşımaya daha çok yatırım yapmalı mı?"],
] as const;

const LANGUAGE_MATRIX = [
  ["bg", [
    ["fuel subsidies", "Правителството трябва да премахне субсидиите за гориво, защото те изкривяват пазара."],
    ["remote work", "Работодателите трябва да позволяват работа от разстояние, когато задачите могат да се изпълняват добре у дома."],
    ["nuclear power", "България трябва да развива ядрената енергия, понеже тя осигурява надеждно електричество с ниски емисии."]
  ]],
  ["ar", [
    ["fuel subsidies", "ينبغي للحكومة أن تلغي دعم الوقود لأنه يشوه السوق."],
    ["remote work", "يجب أن تسمح الشركات بالعمل من المنزل عندما يستطيع الموظفون أداء مهامهم بكفاءة."],
    ["nuclear power", "على الدولة أن تستثمر في الطاقة النووية لأنها توفر كهرباء مستقرة بانبعاثات منخفضة."]
  ]],
  ["he", [
    ["fuel subsidies", "הממשלה צריכה לבטל את הסובסידיות לדלק משום שהן מעוותות את השוק."],
    ["remote work", "מעסיקים צריכים לאפשר עבודה מהבית כאשר העובדים יכולים לבצע שם את משימותיהם היטב."],
    ["nuclear power", "ישראל צריכה לשקול הרחבת אנרגיה גרעינית משום שהיא מספקת חשמל יציב עם פליטות נמוכות."]
  ]],
  ["zh", [
    ["fuel subsidies", "政府应该取消燃料补贴，因为这些补贴会扭曲市场。"],
    ["remote work", "如果员工能在家高效完成任务，雇主就应该允许远程办公。"],
    ["nuclear power", "国家应该发展核能，因为它能以较低排放提供稳定电力。"]
  ]],
  ["ko", [
    ["fuel subsidies", "정부는 연료 보조금이 시장을 왜곡하므로 이를 폐지해야 합니다."],
    ["remote work", "직원들이 집에서도 업무를 잘 수행할 수 있다면 고용주는 재택근무를 허용해야 합니다."],
    ["nuclear power", "한국은 원자력이 낮은 배출량으로 안정적인 전력을 공급하므로 투자를 늘려야 합니다."]
  ]],
  ["vi", [
    ["fuel subsidies", "Chính phủ nên bãi bỏ trợ cấp nhiên liệu vì chúng làm méo mó thị trường."],
    ["remote work", "Người sử dụng lao động nên cho phép làm việc tại nhà khi nhân viên có thể hoàn thành tốt nhiệm vụ."],
    ["nuclear power", "Việt Nam nên đầu tư vào điện hạt nhân vì nguồn này cung cấp điện ổn định với lượng phát thải thấp."]
  ]],
  ["ro", [
    ["fuel subsidies", "Guvernul ar trebui să elimine subvențiile pentru combustibil deoarece acestea denaturează piața."],
    ["remote work", "Angajatorii ar trebui să permită munca de acasă atunci când salariații își pot îndeplini bine sarcinile."],
    ["nuclear power", "România ar trebui să investească în energia nucleară deoarece aceasta oferă electricitate sigură cu emisii reduse."]
  ]],
  ["en", [
    ["fuel subsidies", "The government should end fuel subsidies because they distort the market."],
    ["remote work", "Employers should allow people to work from home when they can perform their duties well there."],
    ["nuclear power", "The country should invest in nuclear power because it supplies reliable electricity with low emissions."]
  ]],
  ["et", [
    ["fuel subsidies", "Valitsus peaks kütusetoetused kaotama, sest need moonutavad turgu."],
    ["remote work", "Tööandjad peaksid lubama kodus töötamist, kui töötajad saavad seal oma ülesandeid hästi täita."],
    ["nuclear power", "Eesti peaks kaaluma tuumaenergia kasutamist, sest see annab kindlat elektrit vähese heitega."]
  ]],
  ["fi", [
    ["fuel subsidies", "Hallituksen pitäisi poistaa polttoainetuet, koska ne vääristävät markkinoita."],
    ["remote work", "Työnantajien pitäisi sallia etätyö, kun työntekijät voivat hoitaa tehtävänsä hyvin kotona."],
    ["nuclear power", "Suomen pitäisi rakentaa ydinvoimaa, koska se tuottaa luotettavaa sähköä vähäisin päästöin."]
  ]],
  ["fr", [
    ["fuel subsidies", "Le gouvernement devrait supprimer les aides au carburant, car elles faussent le marché."],
    ["remote work", "Les employeurs devraient permettre le travail à domicile lorsque leurs salariés peuvent bien y accomplir leurs tâches."],
    ["nuclear power", "La France devrait investir dans l'énergie nucléaire, car elle fournit une électricité fiable avec peu d'émissions."]
  ]],
  ["de", [
    ["fuel subsidies", "Die Regierung sollte die Zuschüsse für Kraftstoff abschaffen, weil sie den Markt verzerren."],
    ["remote work", "Arbeitgeber sollten die Arbeit von zu Hause erlauben, wenn Beschäftigte dort ihre Aufgaben gut erledigen können."],
    ["nuclear power", "Deutschland sollte Kernenergie erwägen, weil sie verlässlichen Strom mit geringen Emissionen liefern kann."]
  ]],
  ["el", [
    ["fuel subsidies", "Η κυβέρνηση πρέπει να καταργήσει τις επιδοτήσεις καυσίμων επειδή στρεβλώνουν την αγορά."],
    ["remote work", "Οι εργοδότες πρέπει να επιτρέπουν την εργασία από το σπίτι όταν οι εργαζόμενοι μπορούν να εκτελούν καλά τα καθήκοντά τους."],
    ["nuclear power", "Η Ελλάδα πρέπει να εξετάσει την πυρηνική ενέργεια επειδή προσφέρει σταθερό ηλεκτρισμό με χαμηλές εκπομπές."]
  ]],
  ["hu", [
    ["fuel subsidies", "A kormánynak meg kell szüntetnie az üzemanyag-támogatásokat, mert azok torzítják a piacot."],
    ["remote work", "A munkáltatóknak engedniük kell az otthoni munkát, ha a dolgozók ott jól el tudják végezni a feladataikat."],
    ["nuclear power", "Magyarországnak érdemes fejlesztenie az atomenergiát, mert az megbízható áramot ad alacsony kibocsátással."]
  ]],
  ["ga", [
    ["fuel subsidies", "Ba cheart don rialtas deireadh a chur le fóirdheontais bhreosla mar go ndéanann siad dochar don mhargadh."],
    ["remote work", "Ba cheart d'fhostóirí obair ón mbaile a cheadú nuair is féidir le daoine a gcuid dualgas a dhéanamh go maith."],
    ["nuclear power", "Ba cheart don stát infheistíocht a dhéanamh i gcumhacht núicléach mar go soláthraíonn sí leictreachas iontaofa gan mórán astaíochtaí."]
  ]],
  ["it", [
    ["fuel subsidies", "Il governo dovrebbe abolire i sussidi al carburante perché alterano il mercato."],
    ["remote work", "I datori dovrebbero permettere il lavoro da casa quando i dipendenti possono svolgere bene i propri compiti."],
    ["nuclear power", "L'Italia dovrebbe investire nell'energia nucleare perché può fornire elettricità affidabile con poche emissioni."]
  ]],
  ["lv", [
    ["fuel subsidies", "Valdībai vajadzētu atcelt degvielas subsīdijas, jo tās kropļo tirgu."],
    ["remote work", "Darba devējiem vajadzētu atļaut darbu no mājām, ja darbinieki tur var labi izpildīt savus pienākumus."],
    ["nuclear power", "Latvijai vajadzētu attīstīt kodolenerģiju, jo tā nodrošina uzticamu elektrību ar maziem izmešiem."]
  ]],
  ["lt", [
    ["fuel subsidies", "Vyriausybė turėtų panaikinti degalų subsidijas, nes jos iškraipo rinką."],
    ["remote work", "Darbdaviai turėtų leisti dirbti iš namų, kai darbuotojai gali gerai atlikti savo pareigas."],
    ["nuclear power", "Lietuva turėtų plėtoti branduolinę energetiką, nes ji patikimai tiekia elektrą ir išmeta mažai teršalų."]
  ]],
  ["mt", [
    ["fuel subsidies", "Il-gvern għandu jneħħi s-sussidji tal-fjuwil għax dawn jgħawġu s-suq."],
    ["remote work", "Min iħaddem għandu jippermetti xogħol mid-dar meta l-ħaddiema jistgħu jwettqu dmirijiethom tajjeb."],
    ["nuclear power", "Malta għandha tqis l-enerġija nukleari għax din tipprovdi elettriku affidabbli b'emissjonijiet baxxi."]
  ]],
  ["pt", [
    ["fuel subsidies", "O governo deveria acabar com os subsídios aos combustíveis porque eles distorcem o mercado."],
    ["remote work", "Os empregadores deveriam permitir o trabalho em casa quando os funcionários conseguem cumprir bem as suas tarefas."],
    ["nuclear power", "Portugal deveria investir em energia nuclear porque ela fornece eletricidade segura com poucas emissões."]
  ]],
  ["sk", [
    ["fuel subsidies", "Vláda by mala zrušiť dotácie na palivo, pretože narúšajú trh."],
    ["remote work", "Zamestnávatelia by mali umožniť prácu z domu, keď zamestnanci dokážu dobre plniť svoje úlohy."],
    ["nuclear power", "Slovensko by malo rozvíjať jadrovú energiu, pretože poskytuje spoľahlivú elektrinu s nízkymi emisiami."]
  ]],
  ["es", [
    ["fuel subsidies", "El gobierno debería eliminar las ayudas al combustible porque distorsionan el mercado."],
    ["remote work", "Los empleadores deberían permitir el trabajo desde casa cuando sus empleados pueden cumplir bien sus tareas."],
    ["nuclear power", "España debería invertir en energía nuclear porque ofrece electricidad fiable con pocas emisiones."]
  ]],
  ["hi", [
    ["fuel subsidies", "सरकार को ईंधन की सब्सिडी समाप्त करनी चाहिए क्योंकि वे बाजार को बिगाड़ती हैं।"],
    ["remote work", "नियोक्ताओं को घर से काम की अनुमति देनी चाहिए जब कर्मचारी अपने कार्य अच्छी तरह कर सकते हैं।"],
    ["nuclear power", "भारत को परमाणु ऊर्जा में निवेश करना चाहिए क्योंकि इससे कम उत्सर्जन के साथ भरोसेमंद बिजली मिलती है।"]
  ]],
  ["ja", [
    ["fuel subsidies", "政府は燃料補助金が市場をゆがめるため、廃止すべきです。"],
    ["remote work", "従業員が自宅で十分に仕事をこなせる場合、雇用主は在宅勤務を認めるべきです。"],
    ["nuclear power", "日本は低い排出量で安定した電力を得るため、原子力発電に投資すべきです。"]
  ]],
  ["hr", [
    ["fuel subsidies", "Vlada bi trebala ukinuti subvencije za gorivo jer narušavaju tržište."],
    ["remote work", "Poslodavci bi trebali dopustiti rad od kuće kada zaposlenici mogu dobro obavljati svoje zadatke."],
    ["nuclear power", "Hrvatska bi trebala ulagati u nuklearnu energiju jer ona pruža pouzdanu struju uz niske emisije."]
  ]],
  ["cs", [
    ["fuel subsidies", "Vláda by měla zrušit dotace na palivo, protože narušují trh."],
    ["remote work", "Zaměstnavatelé by měli umožnit práci na dálku, když mohou zaměstnanci své úkoly plnit dobře z domova."],
    ["nuclear power", "Česko by mělo investovat do jaderné energie, protože poskytuje spolehlivou elektřinu s nízkými emisemi."]
  ]],
  ["da", [
    ["fuel subsidies", "Regeringen bør afskaffe brændstoftilskud, fordi de forvrider markedet."],
    ["remote work", "Arbejdsgivere bør tillade arbejde hjemmefra, når medarbejderne kan løse deres opgaver godt derhjemme."],
    ["nuclear power", "Danmark bør overveje kernekraft, fordi den kan levere stabil strøm med lave udledninger."]
  ]],
  ["nl", [
    ["fuel subsidies", "De regering moet de brandstofsubsidie afschaffen omdat die de markt verstoort."],
    ["remote work", "Werkgevers moeten thuiswerken toestaan wanneer werknemers hun taken daar goed kunnen uitvoeren."],
    ["nuclear power", "Nederland moet kernenergie overwegen omdat die betrouwbare stroom met weinig uitstoot kan leveren."]
  ]],
  ["pl", [
    ["fuel subsidies", "Rząd powinien znieść dopłaty do paliwa, ponieważ zniekształcają rynek."],
    ["remote work", "Pracodawcy powinni pozwalać na pracę zdalną, gdy pracownicy mogą dobrze wykonywać swoje obowiązki w domu."],
    ["nuclear power", "Polska powinna rozwijać energetykę jądrową, ponieważ zapewnia ona niezawodny prąd przy niskiej emisji."]
  ]],
  ["ru", [
    ["fuel subsidies", "Правительство должно отменить субсидии на топливо, потому что они искажают рынок."],
    ["remote work", "Работодатели должны разрешать удалённую работу, когда сотрудники могут хорошо выполнять свои обязанности из дома."],
    ["nuclear power", "Россия должна развивать атомную энергетику, потому что она даёт надёжное электричество с низкими выбросами."]
  ]],
  ["sl", [
    ["fuel subsidies", "Vlada bi morala ukiniti subvencije za gorivo, ker izkrivljajo trg."],
    ["remote work", "Delodajalci bi morali dovoliti delo na daljavo, kadar lahko zaposleni svoje naloge dobro opravijo doma."],
    ["nuclear power", "Slovenija bi morala vlagati v jedrsko energijo, ker zagotavlja zanesljivo elektriko z malo izpusti."]
  ]],
  ["sv", [
    ["fuel subsidies", "Regeringen bör avskaffa bränslesubventionen eftersom den snedvrider marknaden."],
    ["remote work", "Arbetsgivare bör tillåta arbete hemifrån när anställda kan utföra sina uppgifter väl där."],
    ["nuclear power", "Sverige bör bygga ut kärnkraften eftersom den ger tillförlitlig el med låga utsläpp."]
  ]],
  ["uk", [
    ["fuel subsidies", "Уряд повинен скасувати субсидії на паливо, бо вони спотворюють ринок."],
    ["remote work", "Роботодавці повинні дозволяти дистанційну роботу, коли працівники можуть добре виконувати свої обов'язки вдома."],
    ["nuclear power", "Україна повинна розвивати ядерну енергетику, бо вона дає надійну електроенергію з низькими викидами."]
  ]],
  ["id", [
    ["fuel subsidies", "Pemerintah harus menghapus subsidi bahan bakar karena mendistorsi pasar."],
    ["remote work", "Perusahaan harus mengizinkan kerja dari rumah ketika karyawan dapat menyelesaikan tugas mereka dengan baik."],
    ["nuclear power", "Indonesia harus mengembangkan tenaga nuklir karena dapat menyediakan listrik andal dengan emisi rendah."]
  ]],
  ["tr", [
    ["fuel subsidies", "Hükümet yakıt sübvansiyonunu kaldırmalı çünkü piyasayı bozuyor."],
    ["remote work", "İşverenler, çalışanlar görevlerini evden iyi yapabildiğinde uzaktan çalışmaya izin vermelidir."],
    ["nuclear power", "Türkiye nükleer enerjiye yatırım yapmalı çünkü bu kaynak düşük salımla güvenilir elektrik sağlar."]
  ]]
] as const;

const FALLBACK_CASES = [
  ["fa", "und", "low", "آیا دولت باید برای کاهش آلودگی در حمل و نقل عمومی بیشتر سرمایه گذاری کند؟"],
  ["ur", "und", "low", "کیا حکومت کو آلودگی کم کرنے کے لیے عوامی نقل و حمل میں زیادہ سرمایہ کاری کرنی چاہیے؟"],
  ["ps", "und", "low", "ایا حکومت باید د ککړتیا کمولو لپاره په عامه ترانسپورت کې زیاته پانګونه وکړي؟"],
  ["sr", "und", "low", "Да ли држава треба више да улаже у јавни превоз како би смањила загађење?"],
  ["mk", "und", "low", "Дали владата треба повеќе да инвестира во јавен превоз за да го намали загадувањето?"],
  ["be", "und", "low", "Ці павінна дзяржава больш інвеставаць у грамадскі транспарт, каб паменшыць забруджванне?"],
  ["kk", "und", "low", "Мемлекет ластануды азайту үшін қоғамдық көлікке көбірек инвестиция салуы керек пе?"],
  ["mn", "und", "low", "Засгийн газар агаарын бохирдлыг бууруулахын тулд нийтийн тээвэрт илүү их хөрөнгө оруулах ёстой юу?"],
  ["ky", "und", "low", "Өкмөт булганууну азайтуу үчүн коомдук транспортко көбүрөөк каражат бөлүшү керекпи?"],
  ["uz-Cyrillic", "und", "low", "Ҳукумат тирбандликни камайтириш учун жамоат транспортига кўпроқ сармоя киритиши керакми?"],
  ["bs", "und", "low", "Da li država treba više ulagati u javni prevoz kako bi smanjila zagađenje?"],
  ["three-word-claim", "und", "low", "Government should act."],
  ["all-caps-claim", "und", "low", "THE GOVERNMENT SHOULD INVEST MORE IN PUBLIC TRANSPORT BECAUSE IT REDUCES CONGESTION."],
  ["url-only", "und", "low", "https://example.com/public-transit-policy"],
  ["code-only", "und", "low", "if (policy) { return false; }"]
] as const;

const SHARED_SCRIPT_CASES = [
  ["mk", "und", "low", "Дали треба да се укинат субвенциите за гориво?"],
  ["kk", "und", "low", "Отынға субсидияны алып тастау керек пе?"],
  ["sr", "und", "low", "Да ли треба укинути субвенције за гориво?"],
  ["be", "und", "low", "Ці трэба адмяніць субсідыі на паліва?"],
  ["bs", "und", "low", "Treba li ukinuti subvencije za gorivo?"],
  ["uz-Cyrl", "und", "low", "Ёқилғи учун субсидияларни бекор қилиш керакми?"],
  ["mn", "und", "low", "Түлшний татаасыг цуцлах хэрэгтэй юу?"],
  ["ky", "und", "low", "Күйүүчү майга субсидияны алып салуу керекпи?"],
  ["tg", "und", "low", "Оё субсидияи сӯзишворӣ бояд бекор карда шавад?"],
  ["ru", "ru", "high", "Должно ли государство больше инвестировать в общественный транспорт, чтобы уменьшить пробки и загрязнение?"],
  ["uk", "uk", "high", "Чи має держава більше інвестувати у громадський транспорт, щоб зменшити затори й поліпшити якість повітря?"],
  ["bg", "bg", "high", "Трябва ли държавата да инвестира повече в обществения транспорт, за да намали задръстванията и замърсяването?"],
  ["fa", "und", "low", "آیا دولت باید برای کاهش آلودگی در حمل و نقل عمومی بیشتر سرمایه گذاری کند؟"],
  ["ur", "und", "low", "کیا حکومت کو آلودگی کم کرنے کے لیے عوامی نقل و حمل میں زیادہ سرمایہ کاری کرنی چاہیے؟"],
  ["ps", "und", "low", "ایا حکومت باید د ککړتیا کمولو لپاره په عامه ترانسپورت کې زیاته پانګونه وکړي؟"],
  ["hi", "hi", "high", "क्या सरकार को भीड़ और प्रदूषण कम करने के लिए सार्वजनिक परिवहन में अधिक निवेश करना चाहिए?"],
  ["mr", "und", "low", "इंधनावरील अनुदान रद्द करावे का?"],
  ["ne", "und", "low", "इन्धनको अनुदान हटाउनुपर्छ?"],
] as const;

describe("detectArgumentLanguage", () => {
  it.each(LANGUAGE_MATRIX.flatMap(([tag, claims]) => (
    claims.map(([topic, text]) => [tag, topic, text] as const)
  )))("detects %s %s prose at high confidence", (tag, _topic, text) => {
    expect(detectArgumentLanguage(text)).toMatchObject({ tag, confidence: "high" });
  });

  it("detects the packet's short Russian sentence at high confidence", () => {
    expect(detectArgumentLanguage("Следует ли отменить субсидии на топливо?"))
      .toMatchObject({ tag: "ru", confidence: "high" });
  });

  it.each(FALLBACK_CASES)("meets the fallback row for %s", (_label, tag, confidence, text) => {
    expect(detectArgumentLanguage(text)).toMatchObject({ tag, confidence });
  });

  it.each(CASES)("detects %s debate prose", (tag, nameEn, text) => {
    expect(detectArgumentLanguage(text)).toEqual({ tag, nameEn, confidence: "high" });
  });

  it.each(SHARED_SCRIPT_CASES)("uses positive language evidence for %s shared-script prose", (_language, tag, confidence, text) => {
    expect(detectArgumentLanguage(text)).toMatchObject({ tag, confidence });
  });

  it.each([
    ["Persian", "آیا دولت باید برای کاهش آلودگی در حمل و نقل عمومی بیشتر سرمایه گذاری کند؟"],
    ["Urdu", "کیا حکومت کو آلودگی کم کرنے کے لیے عوامی نقل و حمل میں زیادہ سرمایہ کاری کرنی چاہیے؟"],
    ["Serbian", "Да ли држава треба више да улаже у јавни превоз како би смањила загађење?"],
    ["Macedonian", "Дали владата треба повеќе да инвестира во јавен превоз за да го намали загадувањето?"],
    ["Belarusian", "Ці павінна дзяржава больш інвеставаць у грамадскі транспарт, каб паменшыць забруджванне?"],
    ["Kazakh", "Мемлекет ластануды азайту үшін қоғамдық көлікке көбірек инвестиция салуы керек пе?"],
    ["short Greek", "Ναι"],
    ["English with a short Greek quotation", "Should «α β γ δ ε ζ η θ» decide the public policy?"],
    ["Catalan sibling-language prose", "Hauria el govern de fer una inversió més gran en transport públic per reduir la contaminació?"]
  ] as const)("falls back rather than assigning shared-script or weak %s evidence", (_language, text) => {
    expect(detectArgumentLanguage(text)).toEqual({
      tag: "und",
      nameEn: "the same language as the question",
      confidence: "low"
    });
  });

  it("uses the majority Latin evidence around a Cyrillic proper name", () => {
    expect(detectArgumentLanguage(
      "Should Газпром be sanctioned by the government for its conduct?"
    )).toEqual({ tag: "en", nameEn: "English", confidence: "high" });
  });

  it("scores the matrix clause rather than a long quoted English passage", () => {
    expect(detectArgumentLanguage(
      "Este corect că «the government should not regulate the market for the benefit of the few and the cost of the many»?"
    )).toEqual({ tag: "ro", nameEn: "Romanian", confidence: "high" });
  });

  it.each([
    ["Romanian low quotation marks", "„", "“"],
    ["curly single quotation marks", "‘", "’"],
    ["single guillemets", "‹", "›"],
    ["Japanese corner brackets", "「", "」"],
    ["Japanese white corner brackets", "『", "』"]
  ] as const)("scores the matrix clause around %s", (_label, open, close) => {
    expect(detectArgumentLanguage(
      `Este corect că ${open}the government should not regulate the market for the benefit of the few and the cost of the many${close}?`
    )).toEqual({ tag: "ro", nameEn: "Romanian", confidence: "high" });
  });
});

describe("argumentLanguageDirective", () => {
  it("protects every machine-consumed value class while localizing prose", () => {
    expect(argumentLanguageDirective("Romanian")).toBe(
      "Write every natural-language field in Romanian. Keep JSON keys, enum tokens, JSON literals (null, true, false), and identifier-shaped values (including claim_type, basis, outcome, fatalFlags[].type, segment_id, node_refs, and served_number_refs) in English exactly as specified; never translate an identifier or literal."
    );
  });
});
