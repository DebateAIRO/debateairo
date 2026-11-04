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
 * Every locale's draft is compared, line by line, with its last 3.11 text in the archive: the same number of lines,
 * and only the eyebrow, the end marker, the version line, the Next sentence and the change log's first sentence and
 * new entry differ. The rest of the change log stays byte for byte, so `legal-report-button`'s pin still finds 3.11,
 * 3.10 and 3.9 on that line. English is pinned word for word; the 34 translations are drafts for native readers.
 *
 * Plan Task 83b (the owner, 4 Nov 2026: card "Privacy 3.12", "Add one sentence"; card "3.12 words", "The draft as
 * shown"): 3.12 is still unpublished, so it takes one more sentence in place — the question's words and, after a site
 * update, the chosen paths are also kept in the browser tab (owner answers Q3 A and Q8, Tasks 76c and 76e). In every
 * locale the Next paragraph is Task 83's (by its sha256) and one sentence more, and so is the change log's 3.12 entry,
 * whose added sentence says what 3.12 also says, as the 3.8 and 3.11 entries do.
 */

/**
 * Answer 14: 3.12 takes effect on the upload day, written in when the owner approves the upload. Until then the build
 * carries this placeholder, the build day; plan Task 93 Step 4 re-dates it (this date, the DATES table and the drafts).
 */
const EFFECTIVE = "2026-11-04";

/** Answer 13, verbatim: section 2's sentence. */
const NEXT_SENTENCE =
  "When you press Next, several AIs from several companies read your question to suggest what to look into, even if you never start. The suggestions are held in memory for a few minutes at most on our side, and on your page until you start or leave. These calls count in your allowance.";

/** Answer 13, verbatim: section 14's new entry. */
const CHANGE_ENTRY =
  "Version 3.12 replaced version 3.11: when you press Next, several AIs from several companies read your question to suggest what to look into, even if you never start, and these calls count in your allowance (sections 2 and 5).";

/** Task 83b, verbatim as the owner approved it (card "3.12 words"): the sentence the Next paragraph gains, last. */
const TAB_SENTENCE =
  "Your question's words, and after a site update your chosen paths, are also kept in this browser tab until you close it; we cannot read them there.";

/** Task 83b: the sentence the 3.12 entry gains, in the approved sentence's words, as "Version 3.8 also says …" does. */
const CHANGE_ENTRY_TAB =
  "Version 3.12 also says that your question's words, and after a site update your chosen paths, are kept in this browser tab until you close it (section 2).";

/**
 * Task 83's 3.12 texts of each locale, by sha256: section 2's Next paragraph (index 53) and section 14's 3.12 entry, as
 * they stood at 54d431e14. Task 83b keeps both and adds one sentence after each.
 */
const AS_83: Readonly<Record<string, Readonly<{ next: string; entry: string }>>> = {
  ar: { next: "f5edfd7e2a9c00d3cba140719aa211d45b7fe1e546e9eeb9a7ea42bf0bf09190", entry: "75e64b19e6d93b422dfa2162372956d08f976f079166d99750d43e3a5739c04f" },
  bg: { next: "3b8362d4b761d0fbb7916373a37d7f06f2a1239eecc02e2ed54812773160b379", entry: "965b139d2f0e6226858815578c9d11b209d42f091254b6691a7043708e63ad83" },
  cs: { next: "5823074e12fe6acd55fbc9ae6e5f1f244b733966bcd70143555fb175918a7d66", entry: "a03fd4cbf313824012b2a05c41be8ac7e1fdffb67ec13ba35dda60d0f148a78f" },
  da: { next: "981d34ab2ad961072094c689a6b5fce588884c138f7da7d47b46c1dad0608289", entry: "32d589e50700c0a4015b789a7bf5c7b22afaa75d242541bb7cd9f18f044bc079" },
  de: { next: "daaf0aa289d64925cb5da9bd5a9e9593de1cff27f1d8922d6e4cc5676c4e4ffe", entry: "62f1dd700d04e1c3a86e79a73cdcf0502a68a354a71f6db99c4396caa1056a70" },
  el: { next: "cba0298fcce3ed50fd26d5df20bae3ead26c7a37f7803512fbcbab9c4d7e6d2c", entry: "f8a34339ab8f021537635d1c15d4cc82ea58bae16944cf176ee96ff4cbb2b246" },
  en: { next: "761a66bf96c92f88cbfe9e3a13e84bdf21f01b567fb2177dad7315d887bbfa38", entry: "6d84ad2dc4d3ab57e641e0d9dfe8453a4f1e8b87202d383f0e07eaf0ab605dd4" },
  es: { next: "40ab47fed80d3020f8f0a638e30163b15d4d0e26742025479be54f0e48b987b5", entry: "dba270c238e53a396080c6bd0d21e5b0dee685c2275a716272a1ed0768a3e076" },
  et: { next: "ffedc4496f1fade8dc213504a9e6d291f74a798bbac275bafe5babfeb44c2fd1", entry: "f99eac716ee8a0fffe9109f311de0aabc1c57bcd823486ad964855faaa28ee81" },
  fi: { next: "1bf44ea68e8c0056118442defb66b9e364f687f493ba9d4db292d89cf4101fee", entry: "d8d4b1c0f89a60be5653ebed888f90047ee9fc34a2e6a78243acf730cd1a5c29" },
  fr: { next: "17693aa2cdd71ee58bd5e57d7da000f2039bd26763a45552bb518c5fa3fe33e4", entry: "aabfe3f6924f139b80d9d54081158b09f75568f108d6331de53226d59f17c763" },
  ga: { next: "33a7668b82b1df92f673a5e2bf63f85d430d334f60e624dd5da1ef0372f7d58c", entry: "31f5b246bf3c2bc13e7197e3e70fb387e576f1b7deed8b2a03344d3554c4de13" },
  he: { next: "386159a79a3e40e38fd3690dfc23b6c5f5dd9ac95f3556587c5a27073957a50a", entry: "effea96b3cb4e119a628facaf692c88cb91f3035ab88f1737f013e21505bca4f" },
  hi: { next: "4f6f3b06ef4652a8cc13a81518aadad910188167f11df29728bc8ff677244275", entry: "0bb12b99572b90db86f95507851e92a5ed25f18dc931fce3b80f03e087afe7ad" },
  hr: { next: "7cf6495980f03644bb6e1bb7a2007d5eb8cf424be06280475e53c69c54f032ac", entry: "43d400d0c93bfc8cb023057dcd0766dde97dc62d097869788465646c0bc38b12" },
  hu: { next: "6aca26995ab6800196b055f101483ceefa9f64ea4133534192d465228c8b71aa", entry: "b717b75ed5733555bb36b07343cf25ba9cc6a522214aa3722388b7ba2cd9454b" },
  id: { next: "c87e385fb0b517e51b921c423e59d5b0a777286a5e4a4763c4bde8d027eb584f", entry: "cdffd76ca8d9fa3177305134a79886b1dc59addbe6e47d4dfaa816ec5c1b98b5" },
  it: { next: "0cef4e516c9dd6c900b0fad4985c01af52fa24ba0446b67978171b3fe303ec40", entry: "c891bb80d191565f35cd87a37a9265edbd4ab339c2160aedfbdf9b8128664d37" },
  ja: { next: "ff89f2586b929d83a4e825a6858b9e32518a9bef1cf9fb6d8baa8ab71d5e7240", entry: "a21aae12f016e596fcba6798f754689c262d3aba1c5dab1bd55d43950fbf6e7e" },
  ko: { next: "b2ef1c54b934a68fcc4274d9e047161a740db9f5195ae6292542b2dc792c7f01", entry: "cf8a1fad36f9c6b3e8625b1c767e0d6c2ca09e18362c1c588b69d73b9bd5b3ce" },
  lt: { next: "55e68ca08e5c8eb23003515de9fa299f2e71e3005bfa4b73fcd357a791c2af4d", entry: "22de0e294fefb56ad5fe9ec512837967ce5915a4f76c1269f8aa7572ff5c4601" },
  lv: { next: "d5046a01ebf31a8d265b8c94425ce86ad23111ee44f6e956ad094f498b22f51c", entry: "223f67b893a16fe0a1cf35a480b4747961e29fbc0655331e09e5a04f09f24eae" },
  mt: { next: "7dc9195e79d1dddb66172f8d23f3ee04780025e3e675cbd54a4df6ea50e53598", entry: "2ca95d6a0822541afce6ab090b4a5129d1f25bd50d7df415ddd1f9c6cb541758" },
  nl: { next: "6938318d65b360c4db0bfc7d6190c6efe83b8f169f486c92c75c4e617464ea91", entry: "87c45524a9226b41e2053f2e11d9a71ea778a6549e93f66ce777550e8e801c43" },
  pl: { next: "95c2bff06d2bd405fa5dc531f88a8106f3bde28cdef0dc57bdfb1f269377c766", entry: "6de15add656e97fdb7e18740a8788f66471bfe559f659aa1ca0c43cd585a0d03" },
  pt: { next: "d4912a4b8b606502ef06f8123058afb80c8d51dc9110a414a247557ee050d5bc", entry: "710ef92612a272d304738789943ac555b287b49bb43387a88dca8fbede0ae969" },
  ro: { next: "d18bf5ed2cf5adf5a653f871d4980ccb0dcff81629232f29a81eecd33e21c9d8", entry: "42de10019464cd10ed45780d39269287cd71442047fb3be2f72c1b3a8b51e14e" },
  ru: { next: "785825ffbcf3dbb8dd62428ef72fa80ce561b4947fb76843b11879f98d1f8c7e", entry: "56dcc66790ea41f8052e6f51076870be2aed6db44827bb05dff2a30ab86a98e2" },
  sk: { next: "ab8b0f9b2b4517f83cf0e0cc489ea113b4f7b7c8a2d48b5ec6f17ed129bae4f6", entry: "f90975b6cbf133b845f459a5734e63b42e04723219b8535c5a2eaf6aa767e564" },
  sl: { next: "8e37791e2bde13250b53497cd73f9abc6708b59f51c93f4217c6e82a48293cb5", entry: "887be41fa85e3a364b5bf2fc1da77006cd7555d3df09af82e87980a2f80ff3a9" },
  sv: { next: "e98bb8f6a5269c5b38267a9403270e60e4d0a6e2f50e3abe3a2faef8d54c1b9a", entry: "992347e86b014232fd9ef39d1c90ebc3a7d670819a21be690eb2e08eed680b3a" },
  tr: { next: "27dc968ee5492e96de34fae9ed1b0f8c43d4f68006362f7d97ff2e85040b46ef", entry: "547025da12928bfbb7f5f10c3f5486f8576230599b40403c071a86317a2e2d45" },
  uk: { next: "81d03cfd6fdb92f0d25c85cb0d3db8ee55a87f3a29a2a9bd8d7826783086fd19", entry: "25200b4c4ebf35b59c2a5efb994cccfdd5b4d49d7e184229123dfbbad711d8b9" },
  vi: { next: "52d8f3d185d226fd9b2e0d197e8318a406c05b3c60180b0522210212f132f9b0", entry: "e30204ebcf4883d7c18fb05427d7f554f65dcc339b50e0b78fb4214e4b3cdda6" },
  zh: { next: "7aade62038475e3fa68bf99f132023d98401fce9af4ee7fb613d166f3a3c0d07", entry: "fcf4776b78de38a1cf89e5daef9869dc416878f1d9be58a265dc6500720a48f0" }
};

/** Answer 13, verbatim: the two purpose labels of the Register. */
const LABELS = {
  suggestPaths: "Before a debate starts: suggesting what to look into",
  clarifyQuestions: "Before a debate starts: suggesting clarifying questions"
} as const;

/** The last 3.11 text of each locale (d3bf346e5), by the sha256 the archive names it with. */
const PRIOR: Readonly<Record<string, string>> = {
  ar: "55e255f34ef47ed4df60f7a697780bdd8244b2cbd53ca28fc511ce36741b1726",
  bg: "049ef7254a789601d3f6c232c7723886d20f7ac6cf68cfcaa6a064b02d078883",
  cs: "a423b633c08e342c0661611ee3a48e6ea21532d6673d66bbda67361acaf71bf6",
  da: "a2696348b253292309891f4763201f54561470357a0145ab8e103741ca52c723",
  de: "147c3ab0b9fa5ab7af64e7951e7125c9436b880f386fc028694e37c592583ddd",
  el: "df69b511b781b9b0b850b2832312f374731cb568e7e863ef556ceab01344ac2a",
  en: "7252fafd0b72f3a23a822668170bc76b93297e067dd5f12324a900dd43167a53",
  es: "e2af98103eede479613bc92943a3166e0980dbc7e496243742ddf5e6b03e166b",
  et: "808986df541038f9751485cbb0787fffd9a2281d358ee945e19c778483a9bb2c",
  fi: "8d123be9cbed68e93341e52050ade21b63725394b18069ed46ffe47b603c35bf",
  fr: "cd19a3a39f727e49b53a436fb4792e822f4b6016bf4cc9c929bc56eced0bd7a3",
  ga: "f748cbc8525f8da09eea4c271cb7aea339af9533c46a4e5a0389fc81a77e649f",
  he: "866c7322c7ed68ef74f2d9f1712ac9ec672e8717074610f44c489e2a56de512b",
  hi: "87b4a05ab7c17cb13e72e23ae79ee8a876ab215b596ed7cf4bb0ef7fb503aed9",
  hr: "5f9be5a72049a4f3b268483cd1014bec9525521addbbf94399aaa2817819f2f4",
  hu: "5e07c727acc4cd6dc312f9bc8b01d1710d2dd2c67213d83b8369248cbf72995e",
  id: "2c43c29d715154df598a25e41eefe56bec4f8bc81a6394631efdda5157ae9d24",
  it: "5163148781cbb2a1898ee955a53b53232c376671faae663d09b4b41f602b29f2",
  ja: "d4270d811eff235939ebe281f5582d6a144c65eb7f1536a11ffe4420b08a53d2",
  ko: "77b4b99213b9d2d97fd8c5682caaa51591b6aa803326a94f6a4b26fb24daa799",
  lt: "dd31acce76be672dd590297f673ba66151143c99c3e0b96bc7948953a4016420",
  lv: "527ece34a3c8700840fde85e051c24613322b44e286f4b6579955d6d174e7b6f",
  mt: "8ce4002927548f43e523be4f193b5c06556f63c21c08245f1f1061cecda11be0",
  nl: "c3d6d45fdc0d1e9796b6f3eef35bf2eef3b3fcfc362a8913b7aa40588db44862",
  pl: "7c04e12e57acc8d5f247dc746cf38a8a1a6ae5a2e4e8bb4b7df68f98048d336c",
  pt: "c481f355704c67d82a811fb650bd211248d35d4796e9927b6be15f488e1ab4dc",
  ro: "fc400136334354f3658928d2ea9d0f23b693a883a63c13e3919134a34ed5423c",
  ru: "746d01e372296d5a1305f35c6856bffe0f5ac28fc6695e9e5e22acaf1cb6842a",
  sk: "fc02b3072c1c6d8d037e2363398841e4caa15b6fbf9726fcbc9f28d575dad035",
  sl: "6d1931f30ddcce72b357ab255bedd53b92626b146d6219e3a2f20bb799db3cec",
  sv: "266aa35ec19e21290c28619ed57d9db54c01057ee565b7d93176319e186ffa82",
  tr: "5685b3cac61196cb9bb6cc77be42af8e9eb1409e82daea686152848b8a9a2716",
  uk: "85b307bb12e3501c6fb099baab43f0550dc3bb85bd0f6dac61b5624f3473b466",
  vi: "8762fb92aacea0f4e0847c1a8b2d729ed89fa1d8c383578ddc3b53557d00e8d0",
  zh: "b130c700a5821fc7ccead39f8a5a5bd32249c5964382cfd50599f2cb75b46210"
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

/** 0-based line indexes: the eyebrow, the end marker, the version line, section 2's Next sentence, section 14's log. */
const EYEBROW = 4;
const END_MARKER = 7;
const VERSION_LINE = 21;
const NEXT_LINE = 53;
const CHANGE_LOG = 255;
const CHANGED = [EYEBROW, END_MARKER, VERSION_LINE, NEXT_LINE, CHANGE_LOG];

const root = process.cwd();
const draftBytes = (code: string): Buffer => readFileSync(resolve(root, "apps/ui/legal", code, "privacy-policy.md"));
const lines = (text: string): string[] => text.split("\n");
const manifest = (): {
  documents: Record<string, Record<string, { version: string; sha256: string }>>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));
const legalCatalog = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(root, "apps/ui/messages", code, "legal.json"), "utf8"));

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

/**
 * Where the last sentence of `text` begins: just after the last sentence end before its own (". " after a non-digit,
 * so the "2. " of "2. szakasz" ends nothing; the CJK full stop; or the Devanagari danda and a space).
 */
const lastSentenceStart = (text: string): number => {
  const last = [...text.slice(0, -1).matchAll(/(?<!\d)\. |。|। /gu)].at(-1);
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

describe("Privacy Policy 3.12: what happens when you press Next", () => {
  it("covers the 35 languages, each with a prior 3.11 text and the effective date in its own words", () => {
    expect(LOCALES).toHaveLength(35);
    expect(Object.keys(PRIOR).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(Object.keys(DATES).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(Object.keys(AS_83).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    const [year, month, day] = EFFECTIVE.split("-").map(Number) as [number, number, number];
    for (const [code, dates] of Object.entries(DATES)) {
      for (const date of [dates.eyebrow, dates.line, dates.updated]) {
        expect(date, `${code}: the year`).toContain(String(year));
        expect(date, `${code}: the day`).toMatch(new RegExp(`(^|\\D)${day}(\\D|$)`, "u"));
        if (["ja", "ko", "vi", "zh"].includes(code)) expect(date, `${code}: the month`).toMatch(new RegExp(`(^|\\D)${month}(\\D|$)`, "u"));
      }
    }
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: only the five lines differ from the last 3.11 text", (code) => {
    const sha256 = PRIOR[code]!;
    const archived = manifest().archive.PRIVACY?.[code]?.[sha256];
    expect(archived, `${code}: the prior text is in the archive index`).toEqual({ version: "3.11", path: `apps/ui/legal/archive/${code}/${sha256}.md` });
    const priorBytes = readFileSync(resolve(root, archived!.path));
    expect(createHash("sha256").update(priorBytes).digest("hex"), `${code}: the archived bytes`).toBe(sha256);
    const prior = lines(priorBytes.toString("utf8"));
    const next = lines(draftBytes(code).toString("utf8"));

    expect(next, `${code}: the line count is unchanged`).toHaveLength(prior.length);
    const differing = next.flatMap((line, index) => (line === prior[index] ? [] : [index]));
    expect(differing, `${code}: the changed lines`).toEqual(CHANGED);

    const dates = DATES[code]!;
    expect(next[EYEBROW], `${code}: the eyebrow names 3.12`).toMatch(/ v3\.12 · /u);
    onlyDateChanged(next[EYEBROW]!, prior[EYEBROW]!, dates.eyebrow, `${code}: the eyebrow`);
    expect(next[END_MARKER], `${code}: the end marker`).toBe(prior[END_MARKER]!.replace(/v3\.11$/u, "v3.12"));
    expect(next[VERSION_LINE]!.startsWith("**Version 3.12 · Effective "), `${code}: the version line`).toBe(true);
    onlyDateChanged(next[VERSION_LINE]!, prior[VERSION_LINE]!, dates.line, `${code}: the version line`);
    expect(next[NEXT_LINE]!.trim(), `${code}: the Next sentence is a plain paragraph`).toMatch(/^[^|#\-<]/u);

    // Section 14: the first sentence takes the new date; the new entry comes next; the rest is the 3.11 line unchanged.
    const log = next[CHANGE_LOG]!;
    const priorLog = prior[CHANGE_LOG]!;
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
    expect(next[EYEBROW]).toBe("eyebrow: PRIVACY POLICY · v3.12 · EFFECTIVE 4 NOVEMBER 2026");
    expect(next[END_MARKER]).toBe("endMarker: END OF POLICY · GDPR (EU) 2016/679 · v3.12");
    expect(next[VERSION_LINE]).toBe("**Version 3.12 · Effective 4 November 2026 · Previous versions at dezbatere.ro/privacy/versions · Controller: DMS Merchandise Shop S.R.L., Piatra Neamț**");
    expect(next[NEXT_LINE]).toBe(`${NEXT_SENTENCE} ${TAB_SENTENCE}`);
    const prior = lines(readFileSync(resolve(root, "apps/ui/legal/archive/en", `${PRIOR.en}.md`), "utf8"));
    const tail = prior[CHANGE_LOG]!.slice(prior[CHANGE_LOG]!.indexOf("Version 3.11 replaced version 3.10:"));
    expect(next[CHANGE_LOG]).toBe(`This policy was last updated on 4 November 2026. ${CHANGE_ENTRY} ${CHANGE_ENTRY_TAB} ${tail}`);
  });

  // Task 83b: the Next paragraph and the 3.12 entry are Task 83's, each followed by one sentence on the browser tab.
  it.each(LOCALES.map(({ code }) => [code]))("%s: the Next paragraph and the 3.12 entry each gain one sentence on the browser tab", (code) => {
    const pins = AS_83[code]!;
    const next = lines(draftBytes(code).toString("utf8"));
    const tab = oneSentenceAfter(next[NEXT_LINE]!, pins.next, code, `${code}: the Next paragraph`);

    const priorLog = lines(readFileSync(resolve(root, "apps/ui/legal/archive", code, `${PRIOR[code]!}.md`), "utf8"))[CHANGE_LOG]!;
    const tail = priorLog.slice(entryStart(priorLog, "3.11"));
    const log = next[CHANGE_LOG]!;
    expect(log.endsWith(tail), `${code}: from the 3.11 entry to the end, the log is unchanged`).toBe(true);
    const entry = log.slice(entryStart(log, "3.12"), log.length - tail.length);
    const gap = sentenceGap(code);
    expect(entry.endsWith(gap), `${code}: the locale's gap before the 3.11 entry`).toBe(true);
    const also = oneSentenceAfter(entry.slice(0, entry.length - gap.length), pins.entry, code, `${code}: the 3.12 entry`);
    expect(also, `${code}: the added log sentence names 3.12`).toMatch(/3\.12/u);
    expect(also, `${code}: the added log sentence names no older version`).not.toMatch(/3\.11|3\.10|3\.9/u);
    expect(also, `${code}: the added log sentence names section 2`).toMatch(/(^|\D)2(\D|$)/u);

    if (code === "en") {
      expect(tab).toBe(TAB_SENTENCE);
      expect(also).toBe(CHANGE_ENTRY_TAB);
    } else {
      expect(tab, `${code}: the Next sentence is translated`).not.toBe(TAB_SENTENCE);
      expect(also, `${code}: the log sentence is translated`).not.toBe(CHANGE_ENTRY_TAB);
    }
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the manifest carries 3.12 for the draft's exact bytes", (code) => {
    const current = manifest().documents.PRIVACY?.[code];
    expect(current).toEqual({ version: "3.12", sha256: createHash("sha256").update(draftBytes(code)).digest("hex") });
  });

  // Task 83b: 3.12 was never published, so its Task 83 draft leaves the archive, as the never-published 3.11 drafts
  // did in 0bbaecc47 and d3bf346e5; the versions page lists one 3.12 text per language, the one that goes up.
  it.each(LOCALES.map(({ code }) => [code]))("%s: the archive holds one 3.12 text, the draft's", (code) => {
    const draft = createHash("sha256").update(draftBytes(code)).digest("hex");
    const archived = Object.entries(manifest().archive.PRIVACY?.[code] ?? {}).filter(([, entry]) => entry.version === "3.12");
    expect(archived).toEqual([[draft, { version: "3.12", path: `apps/ui/legal/archive/${code}/${draft}.md` }]]);
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
