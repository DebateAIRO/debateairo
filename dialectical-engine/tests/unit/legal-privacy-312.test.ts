import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import {
  ANTHROPIC_PREVIEW_PROVIDER,
  DEEPINFRA_PROVIDER,
  PROVIDER_PURPOSES,
  providerRegister,
  SUPPORT_PROVIDER
} from "../../apps/ui/lib/legal/pages.js";

/**
 * Privacy Policy 3.12 (V4 start step, plan Task 83; the owner's Day-1 answers 13 and 14 of 3 Nov 2026,
 * docs/research/2026-10-28-v4-initial/START-STEP-DECISIONS-2026-11-03.md): section 2 says what happens when you press
 * Next — several AIs from several companies read the question to suggest what to look into, even if you never start,
 * and those calls count in the allowance — and the AI Provider Register (part of section 5) gives the two jobs before
 * a debate starts to the companies that do them.
 *
 * Plan Task 83c (saved questions, the owner's answers S1 A, S3 A, S4 A and S7 A of 4 Nov 2026; the approved English
 * is docs/superpowers/specs/2026-11-04-v4-start-step-saved-questions.md §4, with the three S4 A swaps): 3.12 is still
 * unpublished, so it changes in place. The account keeps a question not started yet, each under a key of its own, until
 * Start, Delete or the account's closing; sections 2 and 7 gain a row each, and sections 2, 3, 4, 6, 9, 10 and 14 say
 * so. Task 83's second sentence of the Next paragraph ("The suggestions are held in memory for a few minutes at most on
 * our side, and on your page until you start or leave.") is no longer true and goes; Task 83b's tab sentence keeps the
 * words only (S1 A), and its change-log sentence gives way to the new one.
 *
 * Every locale's draft is compared, line by line, with its last 3.11 text in the archive: two lines more (the new rows),
 * and only the sixteen lines below differ. The rest of the change log stays byte for byte, so `legal-report-button`'s
 * pin still finds 3.11, 3.10 and 3.9 on that line. English is pinned word for word; the 34 translations are drafts for
 * native readers, checked by their structure.
 */

/**
 * Answer 14: 3.12 takes effect on the upload day, written in when the owner approves the upload. Until then the build
 * carries this placeholder, the build day; plan Task 93 Step 4 re-dates it (this date, the DATES table and the drafts).
 */
const EFFECTIVE = "2026-11-04";

/**
 * Section 2's Next paragraph, its first three sentences (saved-questions spec §4): Task 83's approved first and third
 * sentences (answer 13), word for word, then the new sentence in place of Task 83's second.
 */
const NEXT_SENTENCE =
  "When you press Next, several AIs from several companies read your question to suggest what to look into, even if you never start. These calls count in your allowance. Once our check of the question has passed, your account keeps the question and what you do before you start (the row \"Questions not started yet\" above), and our server also holds the AIs' reading in memory for 10 minutes, so that pressing Next again with the same words asks no AI again.";

/** The Next paragraph's last sentence: Task 83b's, shortened (S1 A: the tab keeps the words only). */
const TAB_SENTENCE = "Your question's words are also kept in this browser tab until you close it; we cannot read them there.";

/** Answer 13, verbatim: section 14's new entry. */
const CHANGE_ENTRY =
  "Version 3.12 replaced version 3.11: when you press Next, several AIs from several companies read your question to suggest what to look into, even if you never start, and these calls count in your allowance (sections 2 and 5).";

/** Saved-questions spec §4: the 3.12 entry's second sentence (it replaces Task 83b's). */
const CHANGE_ENTRY_TAB =
  "Version 3.12 also says that, once you press Next, agree that the AIs may read your question and our check of it passes, your account keeps the question and what you do before you start, encrypted under keys specific to your account and to that question, with no time limit, until you start, delete it or close your account, up to 20 at a time; that the ask page lists them so you can pick one up or delete it; and that your question's words are also kept in this browser tab until you close it (sections 2, 3, 4, 6, 7, 9 and 10).";

/** Saved-questions spec §4: section 2's new row, after "Page settings and visits". */
const SAVED_ROW =
  "| **Questions not started yet** | When you press Next, agree that the AIs may read your question and our check of it passes, your account keeps the question and everything you do with it before you start, updated as you go: the paths the AIs suggested, the clarifying questions and your answers to them, the paths you combine, split, rewrite, add or remove, how many paths you want looked into, Quick look or Thorough, and whether the AIs may carry on to the report. It is stored encrypted under keys specific to your account and to that question. The ask page lists them under \"Not started yet\": you can pick one up where you left it, which asks no AI and uses none of your allowance, or delete it. We keep up to 20; while 20 are kept, a new one is not kept until you delete one. When something you write there reads like the words of a person in crisis, that change is not kept | You, and the AIs that read your question when you press Next |";

/** Saved-questions spec §4: section 7's new row, after "Page settings and visits". */
const SAVED_RETENTION_ROW =
  "| Questions not started yet | No time limit: until you press Start, delete it on the ask page or close your account | At Start the debate holds the question and your paths, and the rows on debate content apply. When you delete it, or start it, the key specific to that question is destroyed, so it can no longer be read, and the record is deleted. When you close your account, the key specific to your account is destroyed, so it can no longer be read, and the record is deleted with the account |";

/**
 * Saved-questions spec §4, the other approved changes: what the 3.11 line said (pinned here word for word) and what it
 * says now. Section 9 is today's paragraph with exactly the two changes the spec names (its "…" is today's words).
 */
const SWAPS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  sensitiveInformation: [[
    "You can also leave such information out, or delete a debate that contains it.",
    "You can also leave such information out, or delete a debate, or a question you have not started yet, that contains it."
  ]],
  contract: [[
    "| Creating and running your account, authenticating you, running and storing your debates so you can reopen and replay them | Account, sessions, debate content, page settings and visits |",
    "| Creating and running your account, authenticating you, running and storing your debates so you can reopen and replay them, and keeping the questions you have not started yet so you can pick them up | Account, sessions, debate content, page settings and visits, questions not started yet |"
  ]],
  sensitiveConsent: [[
    "| Processing sensitive information you include about yourself | Debate content |",
    "| Processing sensitive information you include about yourself | Debate content and questions not started yet |"
  ]],
  questionCheck: [[
    "| Your question, sent to the model. We keep nothing about the question or its outcome |",
    "| Your question, sent to the model. The check keeps nothing about the question or its outcome; a question that passes it is kept for you as a question not started yet (section 2) |"
  ]],
  free: [[
    "Debates on the Free plan become public when finished, after an AI check.",
    "Debates on the Free plan become public when finished, after an AI check. A question you have not started yet is not a debate: it stays private to you on every plan and is never published."
  ]],
  security: [
    ["Your email address, your debates and your authentication secrets", "Your email address, your debates, the questions you have not started yet and your authentication secrets"],
    ["nobody else at our company can read your private debates.", "nobody else at our company can read your private debates or the questions you have not started yet."]
  ],
  // 0157 (V4, Privacy 3.11 amended in place): the 3.11 row now ends with the moderation notices and the answers to reports.
  access: [[
    "which emails we sent you about it. |",
    "which emails we sent you about it. It also holds each question you have not started yet, with your answers and paths. |"
  ]],
  erasure: [[
    "Delete a private debate at any time from the debate page.",
    "Delete a private debate at any time from the debate page, and a question you have not started yet from the ask page."
  ]],
  withdraw: [[
    "(you can also leave such data out or delete a debate)",
    "(you can also leave such data out, or delete a debate or a question you have not started yet)"
  ]]
};

/**
 * Task 83's texts of each locale, by sha256, as they stood at 54d431e14 (and unchanged through 89ed9b340): `kept`, the
 * Next paragraph's first and third sentences joined by the locale's gap, which Task 83c keeps as the paragraph's first
 * two; `entry`, section 14's 3.12 entry, which Task 83c keeps and follows with one sentence.
 */
const AS_83: Readonly<Record<string, Readonly<{ kept: string; entry: string }>>> = {
  ar: { kept: "124322baa93d7342daa0098bcdb300fb31ba7dbab6b210ac1c266afd64c0d71a", entry: "75e64b19e6d93b422dfa2162372956d08f976f079166d99750d43e3a5739c04f" },
  bg: { kept: "2228dcceffb2150838c97a21615520e96caf95433fec48f1e643abd2d98f69be", entry: "965b139d2f0e6226858815578c9d11b209d42f091254b6691a7043708e63ad83" },
  cs: { kept: "a6601bfbbbf9b3baae1c04b022a6f091010dafdfb5af7f0f47d90afe87377afe", entry: "a03fd4cbf313824012b2a05c41be8ac7e1fdffb67ec13ba35dda60d0f148a78f" },
  da: { kept: "4844da96b93ab764a0781af223f0a7d97f888488a9f5c1ade10829efd36cf21e", entry: "32d589e50700c0a4015b789a7bf5c7b22afaa75d242541bb7cd9f18f044bc079" },
  de: { kept: "3c6a9be9ddf7c93cadff0637c2b32384d651075d76f5344675bc1f05c9dfb379", entry: "62f1dd700d04e1c3a86e79a73cdcf0502a68a354a71f6db99c4396caa1056a70" },
  el: { kept: "ceef101582ecc0d8a293f8e3565f7e3bc9640c4f323419187af3a45a1f03e8cd", entry: "f8a34339ab8f021537635d1c15d4cc82ea58bae16944cf176ee96ff4cbb2b246" },
  en: { kept: "040147091c73825a805b5b8b5f4611ae6ba464d7c6fc07aa98a6251da491d0a7", entry: "6d84ad2dc4d3ab57e641e0d9dfe8453a4f1e8b87202d383f0e07eaf0ab605dd4" },
  es: { kept: "670c0e6a0a54c1b249aaa3ba2faf86a760a40729241e4661d4ea3b0db5cad67c", entry: "dba270c238e53a396080c6bd0d21e5b0dee685c2275a716272a1ed0768a3e076" },
  et: { kept: "808eda24950f8463d447a89937da29d2896828a7c177231e4a54134d043442c8", entry: "f99eac716ee8a0fffe9109f311de0aabc1c57bcd823486ad964855faaa28ee81" },
  fi: { kept: "92a6fd85f57f11571e37f000f17292259e84fbaab8635a27de34cfcb2248250b", entry: "d8d4b1c0f89a60be5653ebed888f90047ee9fc34a2e6a78243acf730cd1a5c29" },
  fr: { kept: "3f2568eaac71dc495de45752adbfad461348c0016ff5e49e0f9625c8851fb5d9", entry: "aabfe3f6924f139b80d9d54081158b09f75568f108d6331de53226d59f17c763" },
  ga: { kept: "9c98760b55b9f4da1a6e69f4da5382c38913c883049455471fc3ea89f908d549", entry: "31f5b246bf3c2bc13e7197e3e70fb387e576f1b7deed8b2a03344d3554c4de13" },
  he: { kept: "ec29fd05868dde4a41ce29b1a343385f45af3e6a35e21ebbd56f73204fa6927b", entry: "effea96b3cb4e119a628facaf692c88cb91f3035ab88f1737f013e21505bca4f" },
  hi: { kept: "1976cab97be15bc9b61bf13f6995168cf1393722fd0cacf411ae0928ed51d5e7", entry: "0bb12b99572b90db86f95507851e92a5ed25f18dc931fce3b80f03e087afe7ad" },
  hr: { kept: "5c25903e54779868b8673d01b5d97715e76dbfcb514b5e22953cc363ab70de0b", entry: "43d400d0c93bfc8cb023057dcd0766dde97dc62d097869788465646c0bc38b12" },
  hu: { kept: "07bac115d4d13b8535f96abd7ad0b7f64d3dc81466a40e01eae4b17c202b1ac7", entry: "b717b75ed5733555bb36b07343cf25ba9cc6a522214aa3722388b7ba2cd9454b" },
  id: { kept: "bc34dd80f788aa24012cb42500adbcc5f0960b58417713b5c3785ee31b597210", entry: "cdffd76ca8d9fa3177305134a79886b1dc59addbe6e47d4dfaa816ec5c1b98b5" },
  it: { kept: "bb7bafa8df449f4155dd7beabd6b9dd915b1af4e9bbc330a71dbcc33de03ac4f", entry: "c891bb80d191565f35cd87a37a9265edbd4ab339c2160aedfbdf9b8128664d37" },
  ja: { kept: "b574510b6ae644e214d9d9f6e60e16267bf1b49d8fde97623af66db14133e5b0", entry: "a21aae12f016e596fcba6798f754689c262d3aba1c5dab1bd55d43950fbf6e7e" },
  ko: { kept: "8891becc7f391ccc6bea5d432724d628a47031c31e11c4ccae6bc268ac2e6260", entry: "cf8a1fad36f9c6b3e8625b1c767e0d6c2ca09e18362c1c588b69d73b9bd5b3ce" },
  lt: { kept: "453b81d566f3bc9cbf52fc88e2e9325e2ad4d24407c4920be04c76cd049339e3", entry: "22de0e294fefb56ad5fe9ec512837967ce5915a4f76c1269f8aa7572ff5c4601" },
  lv: { kept: "f399392d1a36b081dab4c20ba3dee4147db7317d288b91134ac8d7f58534af52", entry: "223f67b893a16fe0a1cf35a480b4747961e29fbc0655331e09e5a04f09f24eae" },
  mt: { kept: "0eb3fd8b73f511670b5c4f3c07e30b1b76c72f25339240599b7b367e4284c5a5", entry: "2ca95d6a0822541afce6ab090b4a5129d1f25bd50d7df415ddd1f9c6cb541758" },
  nl: { kept: "126b1a14a307dd8341df2d8e45d4badb3a79b309c3e1964f6f4128735c44f487", entry: "87c45524a9226b41e2053f2e11d9a71ea778a6549e93f66ce777550e8e801c43" },
  pl: { kept: "b91bd73655dce25805df7535316df2db44455d840c124aa30a82d1534e6d22a8", entry: "6de15add656e97fdb7e18740a8788f66471bfe559f659aa1ca0c43cd585a0d03" },
  pt: { kept: "a83cb8327785bdb0019321e6a0be4dda9804e1a5a6267bd9b5713f1ba67d59da", entry: "710ef92612a272d304738789943ac555b287b49bb43387a88dca8fbede0ae969" },
  ro: { kept: "a996b44b0432d8e6e10a693d3ad9c45ea1424b6f4b32bd962d2acd4642ff359b", entry: "42de10019464cd10ed45780d39269287cd71442047fb3be2f72c1b3a8b51e14e" },
  ru: { kept: "72bcead957a4f815a8fa5547ed79f8d244e251f2ede0aaad4bd2f139429a7084", entry: "56dcc66790ea41f8052e6f51076870be2aed6db44827bb05dff2a30ab86a98e2" },
  sk: { kept: "ebc99ef6ee6a8f924be2b1fd82909ed43d731b0e6172cd7c3c38d9e814d355a3", entry: "f90975b6cbf133b845f459a5734e63b42e04723219b8535c5a2eaf6aa767e564" },
  sl: { kept: "3e667990085b9e597b4ca8f26b5b4f288350353faf8f9825ebf11c089cee486e", entry: "887be41fa85e3a364b5bf2fc1da77006cd7555d3df09af82e87980a2f80ff3a9" },
  sv: { kept: "2ec8e8dcbb23c81083ae0200d53ffab100ce667a13df7e1dfaca1241b2bf487f", entry: "992347e86b014232fd9ef39d1c90ebc3a7d670819a21be690eb2e08eed680b3a" },
  tr: { kept: "c1deca636d804a90e7914d9c018eaeb92e5bb9548b5b2422b04f3493c138d27e", entry: "547025da12928bfbb7f5f10c3f5486f8576230599b40403c071a86317a2e2d45" },
  uk: { kept: "528c1b88bc903283a167d0ae1898f7d115f1918c11be057a57aed7165f843d84", entry: "25200b4c4ebf35b59c2a5efb994cccfdd5b4d49d7e184229123dfbbad711d8b9" },
  vi: { kept: "23ebc28199a2dc87d463cbcebd6aba90a7b858f1d034b8c5425bc983c1ebe571", entry: "e30204ebcf4883d7c18fb05427d7f554f65dcc339b50e0b78fb4214e4b3cdda6" },
  zh: { kept: "92ff38757b1b3b3b09f3ce222119daf1243edaf147f8a8efa1b442192c90f766", entry: "fcf4776b78de38a1cf89e5daef9869dc416878f1d9be58a265dc6500720a48f0" }
};

/**
 * Task 83b's words for "after a site update", as its tab sentence and its change-log sentence said them at 89ed9b340 in
 * each locale. Under S1 A the tab keeps the words only, so no line of 3.12 says them any more.
 */
const CLAUSE_83B: Readonly<Record<string, string>> = {
  ar: "وبعد تحديث الموقع",
  bg: "след обновяване на сайта",
  cs: "po aktualizaci webu",
  da: "efter en opdatering af webstedet",
  de: "nach einer Aktualisierung der Website",
  el: "μετά από ενημέρωση του ιστότοπου",
  en: "after a site update",
  es: "tras una actualización del sitio",
  et: "pärast saidi uuendamist",
  fi: "sivuston päivityksen jälkeen",
  fr: "après une mise à jour du site",
  ga: "tar éis nuashonrú ar an suíomh",
  he: "ולאחר עדכון של האתר",
  hi: "साइट के अपडेट के बाद",
  hr: "nakon ažuriranja web-mjesta",
  hu: "a webhely frissítése után",
  id: "setelah situs diperbarui",
  it: "dopo un aggiornamento del sito",
  ja: "サイトの更新後",
  ko: "사이트 업데이트 후",
  lt: "po svetainės atnaujinimo",
  lv: "pēc vietnes atjaunināšanas",
  mt: "wara aġġornament tas-sit",
  nl: "na een update van de site",
  pl: "po aktualizacji serwisu",
  pt: "após uma atualização do site",
  ro: "după o actualizare a site-ului",
  ru: "после обновления сайта",
  sk: "po aktualizácii webu",
  sl: "po posodobitvi spletnega mesta",
  sv: "efter en uppdatering av webbplatsen",
  tr: "site güncellemesinden sonra",
  uk: "після оновлення сайту",
  vi: "sau khi trang web được cập nhật",
  zh: "网站更新后"
};

/** Answer 13, verbatim: the two purpose labels of the Register. */
const LABELS = {
  suggestPaths: "Before a debate starts: suggesting what to look into",
  clarifyQuestions: "Before a debate starts: suggesting clarifying questions"
} as const;

/** The last 3.11 text of each locale (V4's 25b81f5db: 3.11 amended in place for the moderation notices, 0157), by the sha256 the archive names it with. */
const PRIOR: Readonly<Record<string, string>> = {
  ar: "7d51051633092751f21eb44a4b291a38609a91936341e486da0b6c39a1bf20c0",
  bg: "6ef675d738a08e7fc085329ae35b82695a11e6ca393737b12c3e99e7d3f72439",
  cs: "da8b248ef6b246536e288a7e443a181d2e3c264ef5d03b635ec085a13b0ea11c",
  da: "eeb3003652228fead29cbd5c567d9fe31b6058660b70a26aa56098c587967bea",
  de: "b680d35df360542c3046337bd7c77f535ecbdbe47469e3f247e408797e0350fc",
  el: "920173e697906adb736dd33a4081d7af7d555f11d02a60b096bd757712d0a8e2",
  en: "f5ebf00a24546ead412bdf85abfda57cf8d90cc1101ab49351e1f6992a12c87f",
  es: "ff878cdcc3774d47bc111fb9527512b83c36b99d25c2d7ad6abd42dcff5169d0",
  et: "1f08b4a7fcf27ae38a08360fb5e352fc73cb3af749d6fae6d67eff93fa0779f3",
  fi: "2a0b213b64ce23a6759aa4982a7b3fc8f93f30f9474a0884afa89eab27c36bf3",
  fr: "2c17f46b1e00097ed5d0711a52800538950b98f521e43556558c47f1870d687c",
  ga: "10cb0b9fcbc7636c329449c094b3e89b14eb8ecfaeef78a3380cc0bb41cda4df",
  he: "e75989447b9013538c674dd22ee4a0de95b0c97268331ea955ab4e5321bc7323",
  hi: "9eacbb3cf4d5deb0a3710e2ade9bb7a87bde3076401de4572604aab2d4c88fc1",
  hr: "f9f42cba7b2f76f8b3e95fad9c8f5d613b59f7b40d8b6458fe25605bd91bfe73",
  hu: "8f7fd08d50394865bb9fc0d22f0e934703354d135b0875f1e05cc54f3e58496c",
  id: "4e5bd17e10d33914c4e8ccc2036a1115b374a4debedbef6269d28a1981d51a47",
  it: "b36c73c67a3554733ed333d9dd20aa73770799baa30e2ac802508d3169fe317e",
  ja: "055d3ad203a854e4b0c2cc8608f4a3a32384c8e34471ddc650043ab4db9b56b1",
  ko: "9bbf097b8d032c56ec94d2ae02e341914f451d6ef2c8f77df240321bcf91efbd",
  lt: "9e778e9f516107377bd66afdc76d60c35eb3ad354a06df219e758d0e6a8e612f",
  lv: "9cd58a00f53860b45c296e766460d18ede48d76eafae5f0916f25de397c389f3",
  mt: "124665a70d53bf87d0516776533dd54d57fedbd12acde0ba384e86b6e0c7c44e",
  nl: "ca4034cbaebc307c3e377aa6c9f1353c35fb92474cc0b8607828af39a7a89fa1",
  pl: "98584c9144df40980f618dba1fee436664aa57323cd21d5fcdd4791bc6774a57",
  pt: "341cf17e9484e012d1b8c5176e1d07a81cb75b7bc971a7edbc1cc3e4adbbdb41",
  ro: "2a0407cd74fa0e1d16547efd8ac58eb45d0b8b6ab0ef37be2b2056f01854ecb5",
  ru: "2f7ea770823f80e6f082927a44c34ea60d06326f3548c2ea8d6b94fd06516581",
  sk: "d9409cd0ec59ff1141e68ab50f1a35b60e352b16d529144c74f97bb6f39ef131",
  sl: "3ed32aed78f4da219959d1daf796248d2f8f5402f63bde7e40e47caffb394b67",
  sv: "0b20dd64670e8ce340f273fbddccf1cc8f4e734e9eb64af339fe20019fc7bd3d",
  tr: "6e658426606f7ccd17e4c49daec8b299024230d748de9baacd239d8c1a0b19fe",
  uk: "3fae107cc31eeb59989243977081e256cbabf6bf48619fd1d3a1e9ad8e470364",
  vi: "f6efa5825bab5b5b8032058ccb09574284a09e2a6bc9f88736e41ba7dae91c96",
  zh: "e12836cb1ce0b2e55ea5c1473e380b5f547922111a9a35b6f7f3e1b933d93e02"
};

/**
 * EFFECTIVE as each locale writes it: in the eyebrow (index 4, capitals where the eyebrow uses them), in the version
 * line (index 21) and in the change log's first sentence (index 255, in the case that sentence needs).
 */
const DATES: Readonly<Record<string, Readonly<{ eyebrow: string; line: string; updated: string }>>> = {
  ar: { eyebrow: "4 نوفمبر 2026", line: "4 نوفمبر 2026", updated: "4 نوفمبر 2026" },
  bg: { eyebrow: "4 НОЕМВРИ 2026 Г.", line: "4 ноември 2026 г.", updated: "4 ноември 2026 г." },
  cs: { eyebrow: "4. LISTOPADU 2026", line: "4. listopadu 2026", updated: "4. listopadu 2026" },
  da: { eyebrow: "4. NOVEMBER 2026", line: "4. november 2026", updated: "4. november 2026" },
  de: { eyebrow: "4. NOVEMBER 2026", line: "4. November 2026", updated: "4. November 2026" },
  el: { eyebrow: "4 ΝΟΕΜΒΡΙΟΥ 2026", line: "4 Νοεμβρίου 2026", updated: "4 Νοεμβρίου 2026" },
  en: { eyebrow: "4 NOVEMBER 2026", line: "4 November 2026", updated: "4 November 2026" },
  es: { eyebrow: "4 DE NOVIEMBRE DE 2026", line: "4 de noviembre de 2026", updated: "4 de noviembre de 2026" },
  et: { eyebrow: "4. NOVEMBRIST 2026", line: "4. november 2026", updated: "4. novembril 2026" },
  fi: { eyebrow: "4. MARRASKUUTA 2026", line: "4. marraskuuta 2026", updated: "4. marraskuuta 2026" },
  fr: { eyebrow: "4 NOVEMBRE 2026", line: "4 novembre 2026", updated: "4 novembre 2026" },
  ga: { eyebrow: "4 SAMHAIN 2026", line: "4 Samhain 2026", updated: "4 Samhain 2026" },
  he: { eyebrow: "4 בנובמבר 2026", line: "4 בנובמבר 2026", updated: "4 בנובמבר 2026" },
  hi: { eyebrow: "4 नवंबर 2026", line: "4 नवंबर 2026", updated: "4 नवंबर 2026" },
  hr: { eyebrow: "4. STUDENOGA 2026", line: "4. studenoga 2026", updated: "4. studenoga 2026" },
  hu: { eyebrow: "2026. NOVEMBER 4.", line: "2026. november 4.", updated: "2026. november 4." },
  id: { eyebrow: "4 NOVEMBER 2026", line: "4 November 2026", updated: "4 November 2026" },
  it: { eyebrow: "4 NOVEMBRE 2026", line: "4 novembre 2026", updated: "4 novembre 2026" },
  ja: { eyebrow: "2026年11月4日", line: "2026年11月4日", updated: "2026年11月4日" },
  ko: { eyebrow: "2026년 11월 4일", line: "2026년 11월 4일", updated: "2026년 11월 4일" },
  lt: { eyebrow: "2026 M. LAPKRIČIO 4 D.", line: "2026 m. lapkričio 4 d.", updated: "2026 m. lapkričio 4 d." },
  lv: { eyebrow: "2026. GADA 4. NOVEMBRA", line: "2026. gada 4. novembris", updated: "2026. gada 4. novembrī" },
  mt: { eyebrow: "4 TA’ NOVEMBRU 2026", line: "4 ta’ Novembru 2026", updated: "4 ta’ Novembru 2026" },
  nl: { eyebrow: "4 NOVEMBER 2026", line: "4 november 2026", updated: "4 november 2026" },
  pl: { eyebrow: "4 LISTOPADA 2026", line: "4 listopada 2026", updated: "4 listopada 2026" },
  pt: { eyebrow: "4 DE NOVEMBRO DE 2026", line: "4 de novembro de 2026", updated: "4 de novembro de 2026" },
  ro: { eyebrow: "4 NOIEMBRIE 2026", line: "4 noiembrie 2026", updated: "4 noiembrie 2026" },
  ru: { eyebrow: "4 НОЯБРЯ 2026 Г.", line: "4 ноября 2026 г.", updated: "4 ноября 2026 г." },
  sk: { eyebrow: "4. NOVEMBRA 2026", line: "4. novembra 2026", updated: "4. novembra 2026" },
  sl: { eyebrow: "4. NOVEMBRA 2026", line: "4. novembra 2026", updated: "4. novembra 2026" },
  sv: { eyebrow: "4 NOVEMBER 2026", line: "4 november 2026", updated: "4 november 2026" },
  tr: { eyebrow: "4 KASIM 2026", line: "4 Kasım 2026", updated: "4 Kasım 2026" },
  uk: { eyebrow: "4 ЛИСТОПАДА 2026 Р.", line: "4 листопада 2026 р.", updated: "4 листопада 2026 р." },
  vi: { eyebrow: "4 THÁNG 11 NĂM 2026", line: "4 tháng 11 năm 2026", updated: "4 tháng 11 năm 2026" },
  zh: { eyebrow: "2026 年 11 月 4 日", line: "2026 年 11 月 4 日", updated: "2026 年 11 月 4 日" }
};

/**
 * 0-based line indexes of the 3.12 draft: the eyebrow, the end marker, the version line, section 2's new row and Next
 * paragraph, section 3's "About you", section 4's contract, sensitive-information and question-check rows, section 6's
 * Free paragraph, section 7's new row, section 9, section 10's Access, Erasure and Withdraw consent rows, section 14's log.
 * V4's 0157 (3.11 amended in place) adds section 2's moderation notices row and section 7's two rows, so the lines from
 * the Next paragraph on moved by one, and those from section 9 on by three.
 */
const EYEBROW = 4;
const END_MARKER = 7;
const VERSION_LINE = 21;
const SAVED_ROW_AT = 44;
const NEXT_LINE = 55;
const SENSITIVE_INFORMATION = 63;
const CONTRACT = 75;
const SENSITIVE_CONSENT = 84;
const QUESTION_CHECK = 88;
const FREE = 125;
const SAVED_RETENTION_AT = 154;
const SECURITY = 186;
const ACCESS = 196;
const ERASURE = 198;
const WITHDRAW = 202;
const CHANGE_LOG = 260;
/**
 * Section 6's paragraph on flagged debates. A person cannot take their own public debate down, so English no longer
 * ends that paragraph's approval sentences with the leftover "you can take it down from Your debates"; the
 * translations still have it until they are brought up to date before release (English first).
 */
const FLAGGED = 117;
const TAKE_DOWN = "If you publish a flagged debate after our approval, you can take it down from Your debates.";
/**
 * Annex B.7's paragraph (Asia-Pacific). Taiwan is closed since the owner's decision of 12 November 2026, so the
 * paragraph no longer ends with Taiwan's part, in English and in the 34 translations alike: a closed country is
 * named in no language. Nothing else on the line changes.
 */
const ASIA_PACIFIC = 294;
const TAIWAN = " *Taiwan:* Taiwan's Personal Data Protection Act applies.";
/** The two new rows, each right after its table's "Page settings and visits" row. */
const INSERTED = [SAVED_ROW_AT, SAVED_RETENTION_AT];
const CHANGED = [EYEBROW, END_MARKER, VERSION_LINE, SAVED_ROW_AT, NEXT_LINE, SENSITIVE_INFORMATION, CONTRACT, SENSITIVE_CONSENT, QUESTION_CHECK, FREE, SAVED_RETENTION_AT, SECURITY, ACCESS, ERASURE, WITHDRAW, CHANGE_LOG];
/** Which approved change each of the other changed lines carries. */
const SWAPPED_AT: Readonly<Record<number, keyof typeof SWAPS>> = {
  [SENSITIVE_INFORMATION]: "sensitiveInformation",
  [CONTRACT]: "contract",
  [SENSITIVE_CONSENT]: "sensitiveConsent",
  [QUESTION_CHECK]: "questionCheck",
  [FREE]: "free",
  [SECURITY]: "security",
  [ACCESS]: "access",
  [ERASURE]: "erasure",
  [WITHDRAW]: "withdraw"
};

/** The 3.11 line a 3.12 line stands for: the same index, less the new rows above it. */
const priorIndex = (index: number): number => index - INSERTED.filter((row) => row < index).length;

const root = process.cwd();
const draftBytes = (code: string): Buffer => readFileSync(resolve(root, "apps/ui/legal", code, "privacy-policy.md"));
const lines = (text: string): string[] => text.split("\n");
const manifest = (): {
  documents: Record<string, Record<string, { version: string; sha256: string }>>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));
const legalCatalog = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(root, "apps/ui/messages", code, "legal.json"), "utf8"));
const priorLines = (code: string): string[] => lines(readFileSync(resolve(root, "apps/ui/legal/archive", code, `${PRIOR[code]!}.md`), "utf8"));
const cells = (row: string): string[] => row.split("|").slice(1, -1).map((cell) => cell.trim());

/**
 * Where the change-log entry naming `version` first begins: just after the sentence end before it (". ", the CJK
 * full stop, or the Devanagari danda and a space), so the first sentence is everything before it.
 */
const entryStart = (line: string, version: string): number => {
  const at = line.indexOf(version);
  expect(at, `the change log names ${version}`).toBeGreaterThan(0);
  return Math.max(line.lastIndexOf(". ", at) + 2, line.lastIndexOf("。", at) + 1, line.lastIndexOf("। ", at) + 2);
};

/**
 * `next` is `prior` with only its date replaced by `date` (and the version token moved from 3.11 to 3.12): the text
 * before and after the date is the prior's, and what the prior had in its place is a short 2026 date.
 */
const onlyDateChanged = (next: string, prior: string, date: string, label: string): void => {
  const parts = next.split(date);
  expect(parts, `${label}: names the effective date once`).toHaveLength(2);
  const before = parts[0]!.replace("3.12", "3.11");
  const after = parts[1]!;
  expect(prior.startsWith(before), `${label}: the words before the date are the prior's`).toBe(true);
  expect(prior.endsWith(after), `${label}: the words after the date are the prior's`).toBe(true);
  const priorDate = prior.slice(before.length, prior.length - after.length);
  expect(priorDate, `${label}: the prior date stood there`).toMatch(/2026/u);
  expect(priorDate.length, `${label}: nothing but the date changed`).toBeLessThanOrEqual(date.length + 8);
  expect(priorDate, `${label}: the date moved`).not.toBe(date);
};

const sha256Of = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
/** What stands between two sentences: nothing after the CJK full stop, else one space. */
const sentenceGap = (code: string): string => (code === "ja" || code === "zh" ? "" : " ");

/** A sentence end: ". " after a non-digit (so the "2. " of "2. szakasz" ends nothing), the CJK full stop, or the danda and a space. */
const SENTENCE_END = /(?<!\d)\. |。|। /gu;

/** The sentences of `text`, each without the space after it; joined by the locale's gap they give `text` back. */
const sentencesOf = (text: string): string[] => {
  const sentences: string[] = [];
  let from = 0;
  for (const end of text.matchAll(SENTENCE_END)) {
    const to = end.index! + end[0].length;
    sentences.push(text.slice(from, to).trimEnd());
    from = to;
  }
  if (from < text.length) sentences.push(text.slice(from));
  return sentences;
};

/** Where the last sentence of `text` begins: just after the last sentence end before its own. */
const lastSentenceStart = (text: string): number => {
  const last = [...text.slice(0, -1).matchAll(SENTENCE_END)].at(-1);
  return last === undefined ? 0 : last.index! + last[0].length;
};

/** `text` is Task 83's text (by its sha256), the locale's gap and exactly one sentence more; returns that sentence. */
const oneSentenceAfter = (text: string, sha256: string, code: string, label: string): string => {
  const at = lastSentenceStart(text);
  const gap = sentenceGap(code);
  const head = text.slice(0, at);
  expect(head.endsWith(gap), `${label}: the locale's gap before the added sentence`).toBe(true);
  expect(sha256Of(head.slice(0, head.length - gap.length)), `${label}: Task 83's text, unchanged, then one sentence`).toBe(sha256);
  const added = text.slice(at);
  expect(added, `${label}: the added sentence ends as a sentence`).toMatch(/[.。।]$/u);
  return added;
};

/** `next` is `prior` with one stretch of text put in and nothing else changed; returns that stretch, or null. */
const insertionOf = (next: string, prior: string): string | null => {
  let head = 0;
  while (head < prior.length && next[head] === prior[head]) head += 1;
  let tail = 0;
  while (tail < prior.length - head && next[next.length - 1 - tail] === prior[prior.length - 1 - tail]) tail += 1;
  return head + tail === prior.length && next.length > prior.length ? next.slice(head, next.length - tail) : null;
};

/** The 3.11 line with the approved changes: each `from` stands in it exactly once. */
const swapped = (line: string, swaps: readonly (readonly [string, string])[]): string =>
  swaps.reduce((text, [from, to]) => {
    expect(text.split(from).length - 1, `the 3.11 line says "${from}" once`).toBe(1);
    return text.replace(from, () => to);
  }, line);

/** Section 14's 3.12 entry of a draft: from "Version 3.12" to the 3.11 entry, which stays as 3.11 wrote it. */
const entryOf = (code: string): string => {
  const priorLog = priorLines(code)[priorIndex(CHANGE_LOG)]!;
  const tail = priorLog.slice(entryStart(priorLog, "3.11"));
  const log = lines(draftBytes(code).toString("utf8"))[CHANGE_LOG]!;
  expect(log.endsWith(tail), `${code}: from the 3.11 entry to the end, the log is unchanged`).toBe(true);
  return log.slice(entryStart(log, "3.12"), log.length - tail.length);
};

describe("Privacy Policy 3.12: what happens when you press Next, and the questions not started yet", () => {
  it("covers the 35 languages, each with a prior 3.11 text and the effective date in its own words", () => {
    expect(LOCALES).toHaveLength(35);
    expect(Object.keys(PRIOR).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(Object.keys(DATES).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(Object.keys(AS_83).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(Object.keys(CLAUSE_83B).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    const [year, month, day] = EFFECTIVE.split("-").map(Number) as [number, number, number];
    for (const [code, dates] of Object.entries(DATES)) {
      for (const date of [dates.eyebrow, dates.line, dates.updated]) {
        expect(date, `${code}: the year`).toContain(String(year));
        expect(date, `${code}: the day`).toMatch(new RegExp(`(^|\\D)${day}(\\D|$)`, "u"));
        if (["ja", "ko", "vi", "zh"].includes(code)) expect(date, `${code}: the month`).toMatch(new RegExp(`(^|\\D)${month}(\\D|$)`, "u"));
      }
    }
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: two rows more, and only the sixteen lines differ from the last 3.11 text", (code) => {
    const sha256 = PRIOR[code]!;
    const archived = manifest().archive.PRIVACY?.[code]?.[sha256];
    expect(archived, `${code}: the prior text is in the archive index`).toEqual({ version: "3.11", path: `apps/ui/legal/archive/${code}/${sha256}.md` });
    const priorBytes = readFileSync(resolve(root, archived!.path));
    expect(createHash("sha256").update(priorBytes).digest("hex"), `${code}: the archived bytes`).toBe(sha256);
    const prior = lines(priorBytes.toString("utf8"));
    const next = lines(draftBytes(code).toString("utf8"));

    expect(next, `${code}: the line count is 3.11's and the two new rows`).toHaveLength(prior.length + INSERTED.length);
    const differing = next.flatMap((line, index) => (!INSERTED.includes(index) && line === prior[priorIndex(index)] ? [] : [index]));
    expect(differing, `${code}: the changed lines`).toEqual([...CHANGED, ASIA_PACIFIC, ...(code === "en" ? [FLAGGED] : [])].sort((a, b) => a - b));
    // Annex B.7 lost its last part and nothing else: what is left is the start of the 3.11 line.
    const asiaPacific = prior[priorIndex(ASIA_PACIFIC)]!;
    expect(asiaPacific.startsWith(next[ASIA_PACIFIC]!) && next[ASIA_PACIFIC]!.length < asiaPacific.length, `${code}: Annex B.7 only loses its end`).toBe(true);
    expect(asiaPacific.slice(next[ASIA_PACIFIC]!.length), `${code}: the part that left is one part, Taiwan's`).toMatch(/^ ?\*[^*]+\*[^*]+$/u);

    const dates = DATES[code]!;
    expect(next[EYEBROW], `${code}: the eyebrow names 3.12`).toMatch(/ v3\.12 · /u);
    onlyDateChanged(next[EYEBROW]!, prior[EYEBROW]!, dates.eyebrow, `${code}: the eyebrow`);
    expect(next[END_MARKER], `${code}: the end marker`).toBe(prior[END_MARKER]!.replace(/v3\.11$/u, "v3.12"));
    expect(next[VERSION_LINE]!.startsWith("**Version 3.12 · Effective "), `${code}: the version line`).toBe(true);
    onlyDateChanged(next[VERSION_LINE]!, prior[VERSION_LINE]!, dates.line, `${code}: the version line`);
    expect(next[NEXT_LINE]!.trim(), `${code}: the Next sentence is a plain paragraph`).toMatch(/^[^|#\-<]/u);

    // Section 14: the first sentence takes the new date; the new entry comes next; the rest is the 3.11 line unchanged.
    const log = next[CHANGE_LOG]!;
    const priorLog = prior[priorIndex(CHANGE_LOG)]!;
    const tail = priorLog.slice(entryStart(priorLog, "3.11"));
    expect(log.endsWith(tail), `${code}: from the 3.11 entry to the end, the log is unchanged`).toBe(true);
    const start = entryStart(log, "3.12");
    onlyDateChanged(log.slice(0, start), priorLog.slice(0, entryStart(priorLog, "3.11")), dates.updated, `${code}: the log's first sentence`);
    const entry = log.slice(start, log.length - tail.length);
    expect(entry, `${code}: the new entry names 3.12 and the version it replaced`).toMatch(/3\.12[^]*3\.11/u);
    expect(entry, `${code}: the new entry names no older version`).not.toMatch(/3\.10|3\.9/u);
    expect(entry, `${code}: the new entry names sections 2 and 5`).toMatch(/2[^]*5/u);
    expect(entry, `${code}: the new entry ends its sentence before the 3.11 entry`).toMatch(/[.。।] ?$/u);
    expect(log.includes("3.11") && log.includes("3.10") && log.includes("3.9"), `${code}: legal-report-button's pin still finds the old log`).toBe(true);
  });

  it("English reads exactly as the owner approved", () => {
    const next = lines(draftBytes("en").toString("utf8"));
    const prior = priorLines("en");
    expect(next[EYEBROW]).toBe("eyebrow: PRIVACY POLICY · v3.12 · EFFECTIVE 4 NOVEMBER 2026");
    expect(next[END_MARKER]).toBe("endMarker: END OF POLICY · GDPR (EU) 2016/679 · v3.12");
    expect(next[VERSION_LINE]).toBe("**Version 3.12 · Effective 4 November 2026 · Previous versions at dezbatere.ro/privacy/versions · Controller: DMS Merchandise Shop S.R.L., Piatra Neamț**");
    expect(next[SAVED_ROW_AT]).toBe(SAVED_ROW);
    expect(next[NEXT_LINE]).toBe(`${NEXT_SENTENCE} ${TAB_SENTENCE}`);
    for (const [at, change] of Object.entries(SWAPPED_AT)) {
      expect(next[Number(at)], change).toBe(swapped(prior[priorIndex(Number(at))]!, SWAPS[change]!));
    }
    expect(next[SAVED_RETENTION_AT]).toBe(SAVED_RETENTION_ROW);
    // The leftover take-down sentence goes, and nothing else on that line changes.
    expect(prior[priorIndex(FLAGGED)]!.split(TAKE_DOWN)).toHaveLength(2);
    expect(next[FLAGGED]).toBe(prior[priorIndex(FLAGGED)]!.replace(` ${TAKE_DOWN}`, ""));
    expect(draftBytes("en").toString("utf8")).not.toContain(TAKE_DOWN);
    // Taiwan's part goes from the end of Annex B.7's paragraph, and nothing before it changes.
    const asiaPacific = prior[priorIndex(ASIA_PACIFIC)]!;
    expect(asiaPacific.split(TAIWAN)).toHaveLength(2);
    expect(next[ASIA_PACIFIC]).toBe(asiaPacific.slice(0, asiaPacific.indexOf(TAIWAN)));
    expect(next[ASIA_PACIFIC]!.endsWith("as the Personal Information Protection Act requires.")).toBe(true);
    expect(draftBytes("en").toString("utf8")).not.toContain("Taiwan");
    const priorLog = prior[priorIndex(CHANGE_LOG)]!;
    const tail = priorLog.slice(priorLog.indexOf("Version 3.11 replaced version 3.10:"));
    expect(next[CHANGE_LOG]).toBe(`This policy was last updated on 4 November 2026. ${CHANGE_ENTRY} ${CHANGE_ENTRY_TAB} ${tail}`);
  });

  it("English says the owner's answers S1 A, S3 A and S4 A", () => {
    const text = draftBytes("en").toString("utf8");
    const next = lines(text);
    const row = next[SAVED_ROW_AT]!;
    const kept = next[SAVED_RETENTION_AT]!;
    const entry = entryOf("en");
    // S1 A: the browser tab keeps the words only.
    expect(text).not.toMatch(/site update/u);
    // S3 A: up to 20, and nothing goes without you.
    expect(row).toContain("We keep up to 20");
    expect(entry).toContain("up to 20 at a time");
    expect(text).not.toMatch(/\bsixth\b|\bthe oldest\b/iu);
    // S4 A: a key of its own for each question, destroyed at Delete and at Start.
    expect(row).toContain("It is stored encrypted under keys specific to your account and to that question.");
    expect(cells(kept)[2]).toContain("When you delete it, or start it, the key specific to that question is destroyed, so it can no longer be read, and the record is deleted.");
    expect(entry).toContain("encrypted under keys specific to your account and to that question");
    for (const line of [row, kept, entry]) {
      expect(line).not.toContain("Deleted when you delete it.");
      expect(line).not.toContain("under a key specific to your account");
    }
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the new rows, the Next paragraph and the 3.12 entry", (code) => {
    const pins = AS_83[code]!;
    const gap = sentenceGap(code);
    const text = draftBytes(code).toString("utf8");
    const next = lines(text);

    // Section 2's new row: three cells and a bold category, as its neighbours; section 7's new row names it.
    const row = next[SAVED_ROW_AT]!;
    expect(row.startsWith("| ") && row.endsWith(" |"), `${code}: section 2's new row is a table row`).toBe(true);
    const category = cells(row);
    expect(category, `${code}: section 2's new row shape`).toHaveLength(3);
    expect(category[0], `${code}: a bold category`).toMatch(/^\*\*[^*]+\*\*$/u);
    expect(category[1], `${code}: up to 20 (S3 A)`).toMatch(/(^|\D)20(\D|$)/u);
    const kept = next[SAVED_RETENTION_AT]!;
    expect(kept.startsWith("| ") && kept.endsWith(" |"), `${code}: section 7's new row is a table row`).toBe(true);
    expect(cells(kept), `${code}: section 7's new row shape`).toHaveLength(3);
    expect(cells(kept)[0], `${code}: section 7's new row names section 2's`).toBe(category[0]!.slice(2, -2));

    // The Next paragraph: as many sentences as the English, the first two Task 83's first and third, unchanged.
    const said = sentencesOf(next[NEXT_LINE]!);
    expect(said, `${code}: the Next paragraph's sentences`).toHaveLength(sentencesOf(`${NEXT_SENTENCE} ${TAB_SENTENCE}`).length);
    expect(said.join(gap), `${code}: one gap between the sentences`).toBe(next[NEXT_LINE]);
    expect(sha256Of(`${said[0]!}${gap}${said[1]!}`), `${code}: Task 83's first and third sentences, unchanged`).toBe(pins.kept);
    // Task 83's second sentence ("…held in memory for a few minutes at most…") is no longer true and goes: the third
    // sentence is the new one, naming the 10 minutes and section 2's new row ("the row … above"); the tab sentence is last.
    expect(said[2], `${code}: the third sentence names the 10 minutes`).toMatch(/(^|\D)10(\D|$)/u);
    expect(said[2], `${code}: the third sentence names section 2's new row`).toContain(category[0]!.slice(2, -2));
    expect(said[3], `${code}: the last sentence is the tab's, not the account's`).not.toContain(category[0]!.slice(2, -2));
    // S1 A: no line keeps Task 83b's "after a site update your chosen paths".
    expect(text, `${code}: Task 83b's site-update clause is gone`).not.toContain(CLAUSE_83B[code]!);

    // Section 14: Task 83's 3.12 entry, unchanged, then one sentence on the questions not started yet.
    const entry = entryOf(code);
    expect(entry.endsWith(gap), `${code}: the locale's gap before the 3.11 entry`).toBe(true);
    const also = oneSentenceAfter(entry.slice(0, entry.length - gap.length), pins.entry, code, `${code}: the 3.12 entry`);
    expect(also, `${code}: the added log sentence names 3.12`).toMatch(/3\.12/u);
    expect(also, `${code}: the added log sentence names no older version`).not.toMatch(/3\.11|3\.10|3\.9/u);
    const named = also.replace("3.12", "");
    for (const section of [2, 3, 4, 6, 7, 9, 10]) {
      expect(named, `${code}: the added log sentence names section ${section}`).toMatch(new RegExp(`(^|\\D)${section}(\\D|$)`, "u"));
    }
    expect(named, `${code}: the added log sentence says up to 20 (S3 A)`).toMatch(/(^|\D)20(\D|$)/u);

    if (code === "en") {
      expect(also).toBe(CHANGE_ENTRY_TAB);
    } else {
      expect(row, `${code}: section 2's row is translated`).not.toBe(SAVED_ROW);
      expect(kept, `${code}: section 7's row is translated`).not.toBe(SAVED_RETENTION_ROW);
      expect(said.slice(2).join(gap), `${code}: the Next sentences are translated`).not.toBe(sentencesOf(`${NEXT_SENTENCE} ${TAB_SENTENCE}`).slice(2).join(" "));
      expect(also, `${code}: the log sentence is translated`).not.toBe(CHANGE_ENTRY_TAB);
    }
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the other changed lines keep their shape", (code) => {
    const next = lines(draftBytes(code).toString("utf8"));
    const prior = priorLines(code);
    const pair = (at: number): readonly [string, string] => [next[at]!, prior[priorIndex(at)]!];
    const grows = (now: string, was: string, label: string): void => {
      expect(now.startsWith(was) && now.length > was.length, `${code}: ${label} grows at its end`).toBe(true);
    };

    // Sections 3, 6 and 9: plain paragraphs that grow. Section 6 gains one sentence and nothing else; 3 and 9 change within.
    for (const at of [SENSITIVE_INFORMATION, FREE, SECURITY]) {
      const [now, was] = pair(at);
      expect(now, `${code}: line ${at} is a plain paragraph`).toMatch(/^[^|#\-<]/u);
      expect(now.length, `${code}: line ${at} grows`).toBeGreaterThan(was.length);
    }
    for (const at of [SENSITIVE_INFORMATION, SECURITY]) {
      const [now, was] = pair(at);
      expect(sentencesOf(now), `${code}: line ${at} keeps its sentences`).toHaveLength(sentencesOf(was).length);
    }
    const [free, wasFree] = pair(FREE);
    expect(insertionOf(free, wasFree), `${code}: section 6 gains one stretch of text and nothing else changes`).not.toBeNull();
    expect(sentencesOf(free), `${code}: section 6 gains one sentence`).toHaveLength(sentencesOf(wasFree).length + 1);

    // Section 4: the basis stays; the contract row's purpose and data and the sensitive row's data grow at their end;
    // the question check's data changes, its purpose stays.
    const [contract, wasContract] = pair(CONTRACT).map(cells) as [string[], string[]];
    expect(contract, `${code}: the contract row's shape`).toHaveLength(3);
    expect(contract[2], `${code}: the contract row's basis`).toBe(wasContract[2]);
    grows(contract[0]!, wasContract[0]!, "the contract row's purpose");
    grows(contract[1]!, wasContract[1]!, "the contract row's data");
    const [consent, wasConsent] = pair(SENSITIVE_CONSENT).map(cells) as [string[], string[]];
    expect(consent, `${code}: the sensitive row's shape`).toHaveLength(3);
    expect([consent[0], consent[2]], `${code}: the sensitive row's purpose and basis`).toEqual([wasConsent[0], wasConsent[2]]);
    grows(consent[1]!, wasConsent[1]!, "the sensitive row's data");
    const [check, wasCheck] = pair(QUESTION_CHECK).map(cells) as [string[], string[]];
    expect(check, `${code}: the question check's shape`).toHaveLength(3);
    expect([check[0], check[2]], `${code}: the question check's purpose and basis`).toEqual([wasCheck[0], wasCheck[2]]);
    expect(check[1]!.length, `${code}: the question check's data grows`).toBeGreaterThan(wasCheck[1]!.length);

    // Section 10: each right keeps its name; Access grows at its end; Erasure and Withdraw consent grow within.
    for (const at of [ACCESS, ERASURE, WITHDRAW]) {
      const [now, was] = pair(at).map(cells) as [string[], string[]];
      expect(now, `${code}: the right at ${at}`).toHaveLength(2);
      expect(now[0], `${code}: the right's name at ${at}`).toBe(was[0]);
      expect(now[1]!.length, `${code}: the right at ${at} grows`).toBeGreaterThan(was[1]!.length);
      if (at === ACCESS) grows(now[1]!, was[1]!, "the Access row");
      else expect(sentencesOf(now[1]!), `${code}: the right at ${at} keeps its sentences`).toHaveLength(sentencesOf(was[1]!).length);
    }
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the manifest carries 3.12 for the draft's exact bytes", (code) => {
    const current = manifest().documents.PRIVACY?.[code];
    expect(current).toEqual({ version: "3.12", sha256: createHash("sha256").update(draftBytes(code)).digest("hex") });
  });

  // Tasks 83b and 83c: 3.12 was never published, so each earlier 3.12 draft leaves the archive, as the never-published
  // 3.11 drafts did in 0bbaecc47 and d3bf346e5; the versions page lists one 3.12 text per language, the one that goes up.
  // English first: the archive is brought up to date by the release step, not at every edit, so a draft changed since
  // (an English edit whose translations lag) is not archived yet. The release check refuses to release it while the
  // archive holds another text as 3.12 in that language.
  it.each(LOCALES.map(({ code }) => [code]))("%s: the archive holds one 3.12 text, the draft's once it is archived", (code) => {
    const draft = createHash("sha256").update(draftBytes(code)).digest("hex");
    const archived = Object.entries(manifest().archive.PRIVACY?.[code] ?? {}).filter(([, entry]) => entry.version === "3.12");
    expect(archived).toHaveLength(1);
    if (archived.some(([sha256]) => sha256 === draft)) {
      expect(archived).toEqual([[draft, { version: "3.12", path: `apps/ui/legal/archive/${code}/${draft}.md` }]]);
    }
  });
});

describe("the Register names the two jobs before a debate starts", () => {
  it("adds the two purposes to the purpose list", () => {
    expect(PROVIDER_PURPOSES).toContain("suggestPaths");
    expect(PROVIDER_PURPOSES).toContain("clarifyQuestions");
  });

  it("DeepInfra suggests what to look into; Anthropic does both; the support row names both when Anthropic's is not shown", () => {
    expect(DEEPINFRA_PROVIDER.purposes).toEqual(["arguments", "judging", "story", "suggestPaths"]);
    expect(ANTHROPIC_PREVIEW_PROVIDER.purposes).toEqual(["arguments", "judging", "story", "synthesisCheck", "questionCheck", "reportCheck", "clarifyQuestions", "suggestPaths"]);
    expect(SUPPORT_PROVIDER.purposes).toEqual(["support"]);
    expect(providerRegister(["deepinfra"]).at(-1)?.purposes).toEqual(["synthesisCheck", "questionCheck", "reportCheck", "clarifyQuestions", "suggestPaths", "support"]);
    expect(providerRegister(["anthropic", "deepinfra"]).at(-1)).toBe(SUPPORT_PROVIDER);
  });

  // Whichever companies the API's targets reach, the clarifying questions stand on exactly one row (Anthropic's, else
  // the support chat's) and what to look into on DeepInfra's and Anthropic's rows, else the support chat's.
  it.each([
    ["no answer from the API (the whole reviewed catalogue)", null, ["claude"], ["claude", "deepinfra"]],
    ["targets on DeepInfra only", ["deepinfra"], ["support"], ["deepinfra", "support"]],
    ["targets on Anthropic and DeepInfra", ["anthropic", "deepinfra"], ["claude"], ["claude", "deepinfra"]],
    ["a target on a host no catalogue row knows", ["host:api.acme.example"], ["support"], ["support"]]
  ] as const)("names the rows that do each job before a debate starts: %s", (_build, companies, clarifying, suggesting) => {
    const register = providerRegister(companies);
    const rowsWith = (purpose: "clarifyQuestions" | "suggestPaths") =>
      register.filter((entry) => entry.purposes.includes(purpose)).map((entry) => entry.key);
    expect(rowsWith("clarifyQuestions")).toEqual(clarifying);
    expect(rowsWith("suggestPaths")).toEqual(suggesting);
  });

  it("English labels read exactly as the owner approved", () => {
    const en = legalCatalog("en");
    expect(en["legal.providers.purpose.suggestPaths"]).toBe(LABELS.suggestPaths);
    expect(en["legal.providers.purpose.clarifyQuestions"]).toBe(LABELS.clarifyQuestions);
  });

  it.each(LOCALES.filter(({ code }) => code !== "en").map(({ code }) => [code]))("%s: both labels are translated", (code) => {
    const catalog = legalCatalog(code);
    for (const key of ["suggestPaths", "clarifyQuestions"] as const) {
      const label = catalog[`legal.providers.purpose.${key}`];
      expect(typeof label, `${code}: ${key}`).toBe("string");
      expect(label!.trim(), `${code}: ${key}`).not.toBe("");
      expect(label, `${code}: ${key} is not the English`).not.toBe(LABELS[key]);
    }
    expect(catalog["legal.providers.purpose.suggestPaths"]).not.toBe(catalog["legal.providers.purpose.clarifyQuestions"]);
  });
});
