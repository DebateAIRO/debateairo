import type { SupportLanguage } from "@debateai/support-kb/catalog";

type PatternSet = Readonly<{
  email: readonly RegExp[];
  supportCase: readonly RegExp[];
  caseCreation: readonly RegExp[];
  caseCreationNegation: readonly RegExp[];
  financialCapability: readonly RegExp[];
  financialBoundarySubject: readonly RegExp[];
  financialBoundaryNegation: readonly RegExp[];
}>;

function literalTerms(values: readonly string[]): RegExp {
  const source = values
    .map((value) => value.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase("en-US"))
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&"))
    .map((value) => /^[a-zа-яα-ω\u0590-\u06ff]{1,3}$/u.test(value)
      ? `(?<!\\p{L})${value}(?!\\p{L})` : value)
    .sort((left,right) => right.length - left.length)
    .join("|");
  return new RegExp(`(?:${source})`,"u");
}

function patterns(
  email: readonly string[],
  supportCase: readonly string[],
  caseCreation: readonly string[],
  caseCreationNegation: readonly string[],
  financialCapability: readonly string[],
  financialBoundarySubject: readonly string[],
  financialBoundaryNegation: readonly string[]
): PatternSet {
  return Object.freeze({
    email:Object.freeze([literalTerms(email)]),
    supportCase:Object.freeze([literalTerms(supportCase)]),
    caseCreation:Object.freeze([literalTerms(caseCreation)]),
    caseCreationNegation:Object.freeze([literalTerms(caseCreationNegation)]),
    financialCapability:Object.freeze([literalTerms(financialCapability)]),
    financialBoundarySubject:Object.freeze([literalTerms(financialBoundarySubject)]),
    financialBoundaryNegation:Object.freeze([literalTerms(financialBoundaryNegation)])
  });
}

/**
 * The 33 new interface locales. en and ro are NOT here: they run dev's
 * original screens in response-policy.ts unchanged (orchestrator rule 1).
 */
export type DraftScreenLanguage = Exclude<SupportLanguage,"en" | "ro">;

/**
 * First-class locale patterns for two conservative draft screens. These
 * enumerate tested phrase families; they are not a native-speaker guarantee.
 */
export const SUPPORT_DRAFT_SCREEN_PATTERNS: Readonly<Record<DraftScreenLanguage,PatternSet>> = Object.freeze({
  bg: patterns(
    ["имейл","електронна поща"],["случа"],["създава","отваря"],["не"],
    ["възстанов","таксув","плащ","прехвър"],
    ["поддръжк","можем","помощник"],["не","никога"]
  ),
  hr: patterns(
    ["e-pošt","e-mail","email"],["slučaj"],["stvara","otvara","kreira"],["ne"],
    ["vratiti novac","teretiti","uplatu","plać","prenijet"],
    ["podrš","možemo","pomoćnik"],["ne","nikada"]
  ),
  cs: patterns(
    ["e-mail","e-mailov","emailem"],["případ"],["vytvoří","otevře","založí"],["ne","nevytvoří"],
    ["vrátit peníze","naúčt","platb","převed"],
    ["podpor","můžeme","asistent"],["ne","nezpracovává","nemůžeme","nikdy"]
  ),
  da: patterns(
    ["e-mail","mail"],["sag","supportsag"],["opretter","åbner"],["ikke"],
    ["refund","debit","betaling","overfør"],
    ["support","vi","assistent"],["ikke","aldrig"]
  ),
  nl: patterns(
    ["e-mail","mail"],["zaak"],["maakt","opent"],["geen","niet"],
    ["terugbetal","belast","betaling","overmak"],
    ["support","wij","assistent"],["geen","niet","nooit"]
  ),
  et: patterns(
    ["e-kiri","e-post"],["juhtum"],["loob","loo","avab"],["ei"],
    ["tagasi mak","tasu võt","makse","kanname"],
    ["kasutajatug","saame","me","abiline"],["ei","kunagi"]
  ),
  fi: patterns(
    ["sähköpost"],["tapau"],["luo","avaa"],["ei"],
    ["palaut","veloit","maksu","siirr"],
    ["tuki","voimme","emme","avustaja"],["ei","emme","koskaan"]
  ),
  fr: patterns(
    ["e-mail","email","courriel"],["dossier"],["crée","cree","ouvre"],["ne","pas"],
    ["rembours","débit","debit","paiement","transfér","transfer"],
    ["assistance","support","nous","assistant"],["ne","pas","jamais"]
  ),
  de: patterns(
    ["e-mail","email","nachricht"],["fall"],["erstellt","eröffnet","eroffnet","legt einen neuen"],["kein","nicht"],
    ["erstatt","belast","zahlung","überweis","uberweis"],
    ["support","wir","assistent"],["kein","nicht","niemals"]
  ),
  el: patterns(
    ["email","ηλεκτρονικού ταχυδρομείου"],["υπόθεση","υποθεση"],["δημιουργεί","δημιουργει","ανοίγει","ανοιγει"],["δεν"],
    ["επιστρέψ","επιστρεψ","χρεώ","χρεω","πληρωμ","μεταφέρ","μεταφερ"],
    ["υποστήριξ","υποστηριξ","μπορούμε","μπορουμε","βοηθός","βοηθος"],["δεν","ποτέ","ποτε"]
  ),
  hu: patterns(
    ["e-mail","email"],["eset"],["létrehoz","letrehoz","hoz létre","hoz letre","megnyit"],["nem"],
    ["visszatér","visszater","térít","terit","megterhel","fizetés","fizetes","átutal","atutal"],
    ["támogat","tamogat","tudjuk","terhelhetjük","terhelhetjuk","asszisztens"],["nem","soha"]
  ),
  ga: patterns(
    ["ríomhphost","riomhphost"],["cás","cas"],["cruthaíonn","cruthaionn","osclaíonn","osclaionn"],["ní","ni"],
    ["aisíoc","aisioc","táille","taille","íocaíocht","iocaiocht","aistreo"],
    ["tacaíocht","tacaiocht","linn","cúntóir","cuntoir"],["ní","ni","riamh"]
  ),
  it: patterns(
    ["e-mail","email"],["caso"],["crea","apre"],["non"],
    ["rimbors","addebit","pagament","trasfer"],
    ["assistenza","supporto","possiamo","assistente"],["non","mai"]
  ),
  lv: patterns(
    ["e-past","epast"],["gadījum","gadijum"],["izveido","atver"],["ne","neizveido"],
    ["atmaks","iekas","maksājum","maksajum","pārskait","parskait"],
    ["atbalst","mēs","mes","palīgs","paligs"],["ne","neapstrādā","neapstrada","nevaram","nekad"]
  ),
  lt: patterns(
    ["el. laišk","el laišk","el. pašt","el past"],["atvej"],["sukuria","atidaro"],["ne","nesukuria"],
    ["grąž","graz","nuskaič","nuskaic","mokėj","mokej","perves"],
    ["palaik","galime","padėjėjas","padejejas"],["ne","neapdoroja","negalime","niekada"]
  ),
  mt: patterns(
    ["email","elettroniku"],["każ","kaz"],["joħloq","johloq","toħloq","tohloq","jiftaħ","jiftah"],["ma"],
    ["nħallsu","nhallsu","jiċċarġ","jiccarg","ħlas","hlas","ittrasfer"],
    ["appoġġ","appogg","nistgħu","nistghu","assistent"],["ma","qatt"]
  ),
  pl: patterns(
    ["e-mail","email"],["spraw"],["tworzy","otwiera"],["nie"],
    ["zwrócić","zwrocic","obciąż","obciaz","płatno","platno","przele"],
    ["pomoc","wspar","możemy","mozemy","asystent"],["nie","nigdy"]
  ),
  pt: patterns(
    ["e-mail","email","correio"],["caso"],["cria","abre"],["não","nao"],
    ["reembols","cobrar","pagament","transfer"],
    ["apoio","suporte","podemos","assistente"],["não","nao","nunca"]
  ),
  ru: patterns(
    ["электронн","письмо"],["обращени"],["созда","открыва"],["не"],
    ["вернуть деньги","спис","платёж","платеж","перевед"],
    ["поддержк","мы","помощник"],["не","никогда"]
  ),
  sk: patterns(
    ["e-mail","email"],["prípad","pripad"],["vytvorí","vytvori","otvorí","otvori"],["ne","nevytvorí","nevytvori"],
    ["vrátiť peniaze","vratit peniaze","zaťažiť","zatazit","platb","preved"],
    ["podpor","môžeme","mozeme","asistent"],["ne","nespracúva","nespracuva","nemôžeme","nemozeme","nikdy"]
  ),
  sl: patterns(
    ["e-pošt","epost"],["primer"],["ustvari","odpre"],["ne"],
    ["povrn","bremen","plačil","placil","pren"],
    ["podpor","lahko","moremo","pomočnik","pomocnik"],["ne","nikoli"]
  ),
  es: patterns(
    ["correo","e-mail","email"],["caso"],["crea","abre"],["no"],
    ["reembols","carg","pago","transfer"],
    ["soporte","podemos","asistente"],["no","nunca"]
  ),
  sv: patterns(
    ["e-post","epost"],["ärende","arende"],["skapar","öppnar","oppnar"],["inte"],
    ["återbetal","aterbetal","debit","betalning","överför","overfor"],
    ["support","vi","assistent"],["inte","aldrig"]
  ),
  uk: patterns(
    ["електронн","лист"],["звернен"],["створю","відкрива","vidkriva"],["не"],
    ["повернути гроші","повернути грош","спис","платіж","платеж","переказ"],
    ["підтримк","ми","помічник"],["не","ніколи"]
  ),
  zh: patterns(
    ["电子邮件","电子邮箱","邮件","邮箱"],["案例","工单"],["创建","建立"],["不","不会","只有"],
    ["退款","扣款","付款","支付","转账"],
    ["支持","我们","助手","卡"],["不","不能","不会","绝不"]
  ),
  hi: patterns(
    ["ईमेल","इलेक्ट्रॉनिक मेल"],["मामला"],["बनाता","खोलता"],["नहीं","केवल"],
    ["वापस","शुल्क","भुगतान","स्थानांतरित"],
    ["सहायता","हम","सहायक"],["नहीं","नही","कभी"]
  ),
  id: patterns(
    ["email","surel"],["kasus"],["membuat","membuka"],["tidak"],
    ["mengembalikan","menagih","pembayaran","transfer"],
    ["dukungan","kami","asisten"],["tidak","tidak pernah"]
  ),
  ja: patterns(
    ["メール","電子メール"],["ケース","案件"],["作成","開き"],["ません","ない","のみ"],
    ["返金","請求","支払","送金"],
    ["サポート","私たち","当社","アシスタント","カード"],["ません","できません","ありません"]
  ),
  ko: patterns(
    ["이메일","전자 메일"],["사례","문의"],["생성","만듭","엽니다"],["않","후에만"],
    ["환불","청구","결제","이체","송금"],
    ["지원","저희","도우미","카드"],["않","수 없습니다","절대로"]
  ),
  vi: patterns(
    ["email","thư điện tử"],["trường hợp"],["tạo","mở"],["không","chỉ"],
    ["hoàn tiền","tính phí","thanh toán","chuyển khoản","chuyển tiền"],
    ["hỗ trợ","chúng tôi","trợ lý"],["không","không bao giờ"]
  ),
  ar: patterns(
    ["البريد الإلكتروني","بريد الدعم"],["حالة"],["ينشئ","تفتح","تُفتح"],["لا","إلا"],
    ["رد المبلغ","خصم","الدفعة","المدفوعات","نحوّل","نحول"],
    ["الدعم","يمكننا","المساعد","بطاقتك"],["لا","أبداً","ابدا"]
  ),
  he: patterns(
    ["דוא״ל","דואל","דואר אלקטרוני"],["מקרה"],["יוצר","פותחת","נפתח"],["אינו","לא","רק"],
    ["להחזיר","לחייב","תשלום","תשלומ","נעביר"],
    ["תמיכה","אנחנו","איננו","עוזר"],["אינו","אינה","איננו","לא","לעולם"]
  ),
  tr: patterns(
    ["e-posta","eposta"],["vaka","kayıt","kayit","kayd"],["oluştur","olustur","açar","acar"],["oluşturmaz","olusturmaz","sonra"],
    ["iade","ücret","ucret","ödeme","odeme","aktaracağız","aktaracagiz","transfer"],
    ["destek","edebiliriz","asistan","kartınız","kartiniz"],["işlemez","islemez","çekemeyiz","cekemeyiz","etmez","hiçbir zaman","hicbir zaman"]
  )
});

const CLAUSE_BOUNDARY = /[!?;\n\u3002\uff01\uff1f\u061f]+|(?<!\bel)\.|\b(?:while|whereas|iar|in timp ce)\b/u;

function matches(patternsToTry: readonly RegExp[], value: string): boolean {
  return patternsToTry.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function matchPositions(patternsToTry: readonly RegExp[], value: string): number[] {
  return [...new Set(patternsToTry.flatMap((pattern) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    return [...value.matchAll(new RegExp(pattern.source,flags))]
      .map((match) => match.index);
  }))].sort((left,right) => left - right);
}

function hasUnnegatedOccurrence(
  targetPatterns: readonly RegExp[],
  negationPatterns: readonly RegExp[],
  value: string,
  maximumDistance: number
): boolean {
  const remainingTargets = matchPositions(targetPatterns,value);
  const negations = matchPositions(negationPatterns,value)
    .filter((position,index,all) => all[index + 1] === undefined
      || all[index + 1]! - position > 16);
  for (const negation of negations) {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    remainingTargets.forEach((target,index) => {
      const distance = Math.abs(target - negation);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });
    if (nearestIndex >= 0 && nearestDistance <= maximumDistance) {
      remainingTargets.splice(nearestIndex,1);
    }
  }
  return remainingTargets.length > 0;
}

export function conflatesLocalizedCaseAndEmail(
  value: string,
  language: DraftScreenLanguage
): boolean {
  const localePatterns = SUPPORT_DRAFT_SCREEN_PATTERNS[language];
  return value.split(CLAUSE_BOUNDARY).some((clause) =>
    matches(localePatterns.email,clause)
      && matches(localePatterns.supportCase,clause)
      && hasUnnegatedOccurrence(
        localePatterns.caseCreation,localePatterns.caseCreationNegation,clause,40
      )
  );
}

export function hasLocalizedFinancialCapabilityClaim(
  value: string,
  language: DraftScreenLanguage
): boolean {
  const localePatterns = SUPPORT_DRAFT_SCREEN_PATTERNS[language];
  return value.split(CLAUSE_BOUNDARY).some((clause) => {
    if (!matches(localePatterns.financialCapability,clause)) return false;
    if (!matches(localePatterns.financialBoundarySubject,clause)) return true;
    return hasUnnegatedOccurrence(
      localePatterns.financialCapability,localePatterns.financialBoundaryNegation,clause,48
    );
  });
}
