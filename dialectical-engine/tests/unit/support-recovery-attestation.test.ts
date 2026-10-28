import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createHelpCorpusSnapshotLookup,
  loadHelpCorpus,
} from "../../packages/support-kb/src/index.js";

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const corpusDirectory = fileURLToPath(
  new URL("../../packages/support-kb/content/", import.meta.url),
);
const componentPath = fileURLToPath(
  new URL("../../packages/support-kb/recovery/components.json", import.meta.url),
);
const manifestPath = fileURLToPath(
  new URL("../../packages/support-kb/reviews/manifest.json", import.meta.url),
);

// SYNC3 (DL6-F4, the owner's standing rule): the review manifest's evidence
// locators are repository-relative — a path into one contributor's home
// directory may not ride a file the API loads at boot. The reviews, reviewers,
// sessions, dates and every article/projection/fallback hash are unchanged.
const REVIEW = Object.freeze({
  reviewedBy: "SOL",
  reviewerSession: "01a09ef7-e096-7c31-9b35-806840028cf0",
  reviewedOn: "2026-09-15",
  evidence:
    "docs/missions/support-conversation-20260914/reviews/EDITORIAL-RECOVERY-p2.md",
  ratifiedBy: "",
  ratifiedOn: "",
});

const IDENTITY_REVIEW = Object.freeze({
  reviewedBy: "SOL",
  reviewerSession: "01a09ef7-e096-7c31-9b35-806840028cf0",
  reviewedOn: "2026-09-17",
  evidence:
    "docs/missions/support-conversation-20260914/reviews/PRODUCT-IDENTITY-EDITORIAL.md",
  ratifiedBy: "",
  ratifiedOn: "",
});

const GUIDE_REVIEW = Object.freeze({
  reviewedBy: "SOL",
  reviewerSession: "01a09ef7-e096-7c31-9b35-806840028cf0",
  reviewedOn: "2026-09-17",
  evidence:
    "docs/missions/support-conversation-20260914/reviews/GUIDE_EDITORIAL_RECHECK.md",
  ratifiedBy: "",
  ratifiedOn: "",
});

// 2026-09-24: the owner read the /ai-transparency article pair (EN + RO) in chat and
// signed it; the review manifest records it as an OWNER review (reviewedBy "OWNER",
// ratifiedBy "V") with a committed sign-off note as evidence. The catalogue as a whole
// carries the same signature, its only change since the Sol review being that entry.
const OWNER_REVIEW = Object.freeze({
  reviewedBy: "OWNER",
  reviewerSession: "64e6601d-82f1-4fa9-b44d-7ba92d6346ae (coordinator session; the owner read the EN and RO texts in chat and answered 'signed')",
  reviewedOn: "2026-09-24",
  evidence: "docs/missions/support-conversation-20260914/reviews/OWNER-SIGNOFF-ai-transparency.md",
  ratifiedBy: "V",
  ratifiedOn: "2026-09-24",
});

// The merged catalogue (paid plans P24, 2026-10-02): #62's signed catalogue plus the nine paid-plan pages under #62's
// per-locale names. The owner read the nine entries (EN + RO labels) and the merged fingerprint in chat and signed it
// (docs/missions/paid-plans/OWNER-SIGNOFF-billing-pages-catalog.md, "Merge with origin/dev"); #62's articles and recovery rows keep S02's and S05's signatures below.
const CATALOG_REVIEW = Object.freeze({"reviewedBy": "SOL", "reviewerSession": "/root/dev_auth_integration_recovery", "reviewedOn": "2026-10-06", "evidence": "docs/missions/account-onboarding/dev-integration-kb-editorial.md"});
const ACCOUNT_FLOW_REVIEW = Object.freeze({...CATALOG_REVIEW, ratifiedBy:"", ratifiedOn:""});
// cookie-compliance S02 (SPEC-v2 R10): the owner's V0 signature of the catalogue, the 8 rewritten articles and
// their 8 recovery rows. The orchestrator writes reviewerSession, reviewedOn and ratifiedOn at V0
// (probes/ARCH-CC-S02/s02-sign.py); until then this case is RED on the branch by design. The session is
// blank on purpose: the loader refuses a blank session, so no manifest can match this pin before V0
// writes V's (REV-S02 p1 SD-N1 — a placeholder string here was itself a loader-valid OWNER record).
const S02_OWNER_REVIEW = Object.freeze({
  reviewedBy: "OWNER",
  reviewerSession: "6f8863c5-3b17-4860-99d7-b3543f7474c7 (Claude Code desktop, cookie-compliance orchestrator chat, V answered the V0-1 question on 2026-10-01)",
  reviewedOn: "2026-10-01",
  evidence: "docs/missions/cookie-compliance/OWNER-SIGNOFF-S02-support-kb.md",
  ratifiedBy: "V",
  ratifiedOn: "2026-10-01",
});
// cookie-compliance S05 (SPEC-v4 R08): the owner's V1 signature of 12 article files and 13 recovery rows. The
// orchestrator writes reviewerSession, reviewedOn and ratifiedOn at V1 (probes/ARCH-CC-S05/s05-sign.py); until then
// this case is RED on the branch by design (blank session: the loader refuses it, so no manifest can match early).
const S05_OWNER_REVIEW = Object.freeze({
  reviewedBy: "OWNER",
  reviewerSession: "6f8863c5-3b17-4860-99d7-b3543f7474c7 (Claude Code desktop, cookie-compliance orchestrator chat, V answered the V1 question on 2026-10-01)",
  reviewedOn: "2026-10-01",
  evidence: "docs/missions/cookie-compliance/OWNER-SIGNOFF-S05-support-kb.md",
  ratifiedBy: "V",
  ratifiedOn: "2026-10-01",
});
const S05_R2_OWNER_REVIEW = Object.freeze({"reviewedBy": "OWNER", "reviewerSession": "f43657c1-25f1-4ea5-94dd-fd90bc3b599f", "reviewedOn": "2026-10-23", "evidence": "docs/missions/synthesis-flag/OWNER-SIGNOFF-S05-support-kb.md", "ratifiedBy": "V", "ratifiedOn": "2026-10-23"});
const S05_KEYS = new Set(["account-access.en", "account-access.ro", "ai-transparency.ro", "budget-tier-choice.ro",
  "debate-topic-and-description.ro", "debate-workspace-menus.ro", "getting-started-debate.ro", "guide-how-it-works.ro",
  "risk-tier-choice.ro", "support-cases.ro", "support-status-limits.en", "support-status-limits.ro", "unsupported-capabilities.ro"]);
const S02_IDS = new Set(["privacy-consent", "settings-help-menus", "app-navigation", "account-settings"]);

const QUALITY_REVIEW = Object.freeze({
  reviewedBy: "SOL",
  reviewerSession: "01a09ef7-e096-7c31-9b35-806840028cf0",
  reviewedOn: "2026-09-20",
  evidence:
    "docs/missions/support-conversation-20260914/reviews/GUIDE_QUALITY_REVIEW.md",
  ratifiedBy: "",
  ratifiedOn: "",
});

const QUALITY_SUPPLEMENT_REVIEW = Object.freeze({
  ...QUALITY_REVIEW,
  evidence:
    ".hermes/reports/support-conversation-20260914/evidence/GUIDE_QUALITY_REVIEW-wording-supplement.json",
});

const GUIDE_IDS = new Set([
  "app-navigation",
  "settings-help-menus",
  "support-status-limits",
]);

const EXPECTED = [
  ["account-access", "en", "819d4fe7ce40b241a28f26122c4ba81e9b2b05071604c47358fc0c5ef0af6498", "57f2565e54ea4bde4fbf624dcc8ccddfc1c2e7d67eac18052470dd511962975c", "57f2565e54ea4bde4fbf624dcc8ccddfc1c2e7d67eac18052470dd511962975c"],
  ["account-access", "ro", "a0f08ec4f5862b24350a6a8e750d688be0e45337a3d0fab055ecd541f35f1f72", "73af487d0a2fbd1f4824f678bf78cd756deee6ab4190d467f26a777d4e5e331a", "73af487d0a2fbd1f4824f678bf78cd756deee6ab4190d467f26a777d4e5e331a"],
  ["account-settings", "en", "41e826b5d3c07aa6b2f9651072aa4902babb66dd2a5f4f5e41dd5e15106433b2", "bf677b042f9ecf290defa774541729c00faa3fb276864c07f464a126516171de", "bf677b042f9ecf290defa774541729c00faa3fb276864c07f464a126516171de"],
  ["account-settings", "ro", "f887ccbfcc05fb99a095a451e6b2b872cdc3d85135a3e3eadd0496d80d10b21c", "5b8a424ec1749c7578a92aa44165d41f4d100a743375395dd201ad4a82ba8958", "5b8a424ec1749c7578a92aa44165d41f4d100a743375395dd201ad4a82ba8958"],
  ["ai-transparency", "en", "b2d3c4dc1ee4d40d46a30861aede89faf2bf092e2800e6b978cdf0c66acc6388", "a84af8cfaea76ce84a29bd9f8d8fffbcd37457c61ffdca349af0dfaf18f1ae9e", "a116a35102a2208d4713e6df95e77148543f90cc5128e7374c869c4a2d2e32bd"],
  ["ai-transparency", "ro", "bcaa2f47d9ba78227bff74e32e4391b4a8e0020fd842ed7751068dfa81e56bf9", "e3dca4aa8b108fefec0add59ca8b216539a08d6352f558ffa869cf5772563a19", "914d0ea1afddcef9bae62c8741f3916d7c100337edca74fa8dbd32d4e1875604"],
  ["app-navigation", "en", "19b071be3dcc43e9d0cdba3558a29d9ba78d573764aa915173e753fcf01b12a9", "62d5b79e6070a88f9a7c54e50a6781b7f73e484902a7e5c38878e79d2d9081d3", "5f72d0d447cb61481951585f2bc42d3a0c5450ab504c1c8204a0c1a78505360a"],
  ["app-navigation", "ro", "38e7a627bc14a056935abb6cde12b76bd26237f7f317fca0f2cdf8e515f1ccdc", "26c2daccbcb5b797a3cb9dba4871a51086ec799d320540492aeb8d103e1497f9", "ce9355e41bd2e02b7197e69b09391bc44c4e3f5dfd57859ae54aca289df630c1"],
  ["browse-public-debates", "en", "8059a2e46af231765a80f61854752aa5a9ec49e60c95dc715eb3e82a39618fad", "c5c6d262a33abda6c4cf76024cfaa5f42c2b51f2e3242ae3ed3d3bf157ba1034", "c5294a4cae6fc88b300ec64634fbbb2531e7eef783bed814f387834804f21bb6"],
  ["browse-public-debates", "ro", "0fb2aa501c0980af4afb52520c10e51ca0814266bd2258b1f727fa52d16e0241", "87cb63222b2a74f1c75e4d25c28e69e35de0673049d4be055f7de201459e0897", "37bd679ea02946cbdcf7948c7d1345376592335f4e8bde3b2e78adf339e0f40d"],
  ["budget-tier-choice", "en", "a49d563ef7bfec75ed179a70adb54c25947aa9cbe4db557698eacc84d1d3c683", "e6d5adf85f44c3fd1aaa2c70d095f6f2474723a5b72393d4a006f0206fa64104", "cb920483c56311f42b1adf89c581320a4a5344dcc90028fa458ad6028867d601"],
  ["budget-tier-choice", "ro", "cf06b479e61a00510082943d904c7999e2375fba942c6fd2670894e34b20b89a", "b593d7c0ed2d166849df568cb76bf3873a04d4fca4604908ccf6cd626d67e892", "c32cf5a845ad6fa8d51cef9952430b27c8579ca9f4d42e8dfcb2e1ef58d10690"],
  ["debate-topic-and-description", "en", "695b7b405e599260acd7c5a51f897f46b52b238f2860a20168cd14cfdc176bad", "290097ca24858424c4bc2a6845182a9c1cbcd0214c6a3109e2b32cf7e0bd0f56", "7234ce24457ad97fe943e93b1caf0e28a8d74e30aa1748f1d29b158cdcba67b7"],
  ["debate-topic-and-description", "ro", "1a07bb0133eca4b8039984945b3f58137f1b6c1d77d74b59b30c37cb2aec2a64", "0dfb64e716c3c402ff62538e682d8b2ca04edfc45d840a140f20e4120585db32", "7b8d200c8c31b60c633111556f4957847a0194069c4596be88600383d554cc6c"],
  ["debate-workspace-menus", "en", "e3f92be13a7d880e259c331e2c5dc3881abd9693e1846b90fcddafeda151170d", "d4da3f54b348b1c78dad80b67cbe1db12d196f396e6385c2dc0d2fd0ef5d0f34", "28525e3135cc7b623a00f52d7f9aa520579959f4238bb51117866ad3ba89bcce"],
  ["debate-workspace-menus", "ro", "8ad990c00886c52fb547cac2d5f4d3351d5c0fc48b937d36ec8e3459fedbf6b1", "b9a0bf0de664fcb0b6548121e532e4bcbf27861d68614fef9cbb00563f3f87ec", "5e558ff25dda284435df41eca3e9de5f6b1f940f95cb0b8a3126801bba415e97"],
  ["delete-a-private-debate", "en", "7c37881f26d875f87a0177bc35593d9f52a1739b25a848df98ad2d478c7bdb26", "9ae0d23732c129d4b3e3e06b4c81833a5546b214506ecc53c3b531b4856dc49c", "92409ee15ce6ed5f380136ab090d3ce2a82ee355e379e7d068609baf9e92365b"],
  ["delete-a-private-debate", "ro", "afc631bec586e463df1b217d79fc9ea694f873f5690b028c7b79aa65d83cfaa9", "1f4b3b1719c76d8223159dd73049c47761dd4fd6482103d40cf31d53fd2b54a3", "46037245889b3c11b737e40222ce1c6d1b800020a92ee4e92725ad03d8338727"],
  ["export-json", "en", "c31c5bd3a2eb80e1352f27431e459f8272ae37605a9988210cff2aa82d6b7ea5", "690569195ed4098fd00b5bf102658f9bd26b2610897ca816163f8abb2a47946d", "6abec339af9fc96715c8964a17341461db4042701acb1f54e1e9deea37421afb"],
  ["export-json", "ro", "5016b1370fbbd83ed2e647cfdeb8a2c10b4052ef8861807abed2ee4b0ae8f02b", "70c63bd09f0577e45c6c20ab542013cf6caba0e2f0290782f4d6589ef868720f", "78dc48a23f8a2de1e4af205d26f1d743a9000ed2c375437b0cfe2acb66d82cd3"],
  ["getting-started-debate", "en", "a438b7c7a91342dee7c5edb2efe48e586be2cc33d9a2eafabaadad2882f6f9e8", "059900a11c6ec871145ee61e4aaca7214c76c02e8dab61dbec67eb08e6a3017e", "c844161c3430edcfb0a195df7ffff6bcf82c0826ab454bf817631933649bed48"],
  ["getting-started-debate", "ro", "1edec9fe3ae21b3f1f4ea59e6be3e4124be7b5332bf5b29e1e2d31977cd4deca", "33a8fc6a0bd1dd38de5e0bdea12600a422f00d7d0d4819c7bc182554e0d9d734", "a5d2d9f051896716213aabe9f48c97257778ded6cb054dec0d7b32d615549c4a"],
  ["guide-how-it-works", "en", "05316f05e559cd866948ab7f464a681d6875fe8aad5143e956eeb20077bc46c5", "758085d81051393bd3520c43c84a23689a652c5dc6b15e0154a46a1fcf7cd528", "c1ed3a89b00d46ac7f1710280ef768f9d66adec20d20aaa18815596e6a5c2265"],
  ["guide-how-it-works", "ro", "c396a00502bb96aaf7e981d20482a4068ba14f4d796fb1f8079162d3aa5b0568", "f34118491cc1fdfd73f1a810c00e6acd298928a51cb906710179ec8e644599b7", "cbf7d875d34bbb3a6a9ae338cb47a622340ddb3de3f6c1278336b1515d52a872"],
  ["privacy-consent", "en", "0fef2fa6fc9b8ac75ad7134d4b5f746b0be230a4292c9d983b24dfa00f42951f", "8ba452e770941a43e53f7131cb1513f34ee787755d71a8b1900e171e5fbe269e", "3fe7da1ecfe2848622b10234fac52d5283a30a4473a0adada8eb9e6555b24824"],
  ["privacy-consent", "ro", "a25a5f56268e7bdda4d1cbc0264e53cb332acfe592acc7260e6c1ff16f4d7eb6", "e64bb25be8385d23793bf41fb6e5c9d439ae56e47b9568fc9fba0d13bd407b33", "d90423906e3d6502ae6585462f2a8e4fca9608c6c2bc99fba4be6e4c74ea0c4c"],
  ["product-identity", "en", "3841870d3e2310a8fbee6325e59b4c25e92437b644b6a311910ade1e304ef4aa", "797d3ca04d545f868a633dd67d7f52a9758ddb86fa26aaf87d3d87ee5ff32d64", "0f08312a2f6fcd13a67f7694dfefe1ac084bbda210df900eda65ec589cc4c032"],
  ["product-identity", "ro", "d05337815983d83f075964b6db5063dfbff40721a720013aaeeff19c98262391", "5ca60396146b9390d5f2848c703a221d75e0f3e2c88740cc44d1abde6c77ae40", "d2102ff844843efc368e4458e7928fbb6ccd64675cb3c8d4b1657ff015acf812"],
  ["public-answer-disclosure", "en", "e67c271558e6bb5b4100fa735059e781e453c268808d555c6e85af36e3e678ea", "1ee826de541e74d701fd502bfe70e85c009da2b94d3e6d38c1fc98924f251670", "9c733e8f40697f0cd9f15f5984947edaff532a10bc3375d10ca94747e10cc569"],
  ["public-answer-disclosure", "ro", "6e845c95414ae5b9190cf5917136776d7af931eaf626b2da4a0540b3bf7925f1", "4ee30438ed6e75bb79f2e458bb78a6e8e8b79d3271e59c372dff626ce23a3819", "903906d5fc6d89668a42a2108cf30e21b1ec166a9fdce9e7aeff1bf4882fa45d"],
  ["publish-a-debate", "en", "9385f0dd00f8014e3445d1ee4c8c5230dc12d0379766d35c9c7845814f288e29", "83119e6803f854c04ad0153b55cc69212563a92f6b7e350ef29f656ff6c90a3c", "b2974fdf83f15e7142380698b7b21a95bd9efe7cbcfaa5d07028f292bcfd53ef"],
  ["publish-a-debate", "ro", "41858b13ebb6bcec19430b6a63cae6f5854b25ad02e8ac74617d83b087355c3c", "834ec781e6645753549cfca72d8d7bdc70ecb425f1eba125b25c5e04410ea598", "a6f1ef4a94b53df2d77fdd63a14c3f596adaac6b437ab3586424d21815284b26"],
  ["risk-tier-choice", "en", "3ca67a93a3b159c0b284b2bd75093fd9bc70e20d03c357f4ac1fdcb3df522715", "37a5e399d53e5c284febfd79f40fe36bfc611eddb254ccb9a758469e66557929", "7908d0b36c5c62a863ee064095bc3f528792d9588fba9f88c523ea978dffb7f2"],
  ["risk-tier-choice", "ro", "00cffb0532c7f79072da508618c3f2f0b5d93fac02dc5c574b662f3355032173", "cbdf51987dff98813c12728216ba81b88559869d2e165018698ed286dcb928a5", "3d938be89e4673f9958381aa1e652ce2ee377d38cb5701c689701391f8774874"],
  ["settings-help-menus", "en", "95f8dcb1ca768508b109f34c97b12642f0ce1659fd7115acc8783bc365a5e417", "022b625b96e3ee87a83fbfe30a374f6dee48eebed9cad33087640af70d4c6396", "022b625b96e3ee87a83fbfe30a374f6dee48eebed9cad33087640af70d4c6396"],
  ["settings-help-menus", "ro", "80f369918e938cd38f49ca499fd5b3f75c54e9f435786658d19764c87402457b", "a61978797da260bc155d808bd01b15f1cfbf239319332527286fcb03ce062b46", "a61978797da260bc155d808bd01b15f1cfbf239319332527286fcb03ce062b46"],
  ["support-cases", "en", "0c0de8398d6625a7bba50a52a7f054f76ab1cd6c8af07549adac37aafa8e61ad", "30ea4d21a0add2d17b79583ffdd77d23b8a391f148c5e2ee6cd3a393212cadbc", "7670279a78a29487e85a3224738a70218c933455b7eba4d975471773497cbf4d"],
  ["support-cases", "ro", "ad7400b88023ca821b9020ca08e791c6c946f5d6c5fcca00880b9158cd8ff063", "313935a4998ac1747840861ecdfba7d4ac724600c987f704d22623b903ea0c93", "747bb83cfe32d06311ff491d464c80efbba3e1da0066231f0657d6db51c764c9"],
  ["support-status-limits", "en", "f5344e3c0e5f0bec3bb3b5b10dff77b12a85d90233a6d7a7cf8a31f38cc7bfe7", "932f33969c279c6e7db4dc9d0d47fee7eb535b0d1cb593f9b9e9ccc743913385", "875854ecea195464759705f8035052bd5389c71a1acc439713326784bb5e2981"],
  ["support-status-limits", "ro", "ca0b2c95cbce0f684867a92c6f2551829b89c0c18e83b9c1af921a9f8af3d2be", "6976ed6a37edafff50ea7d0e82d31cc2fc82a6ee4f194cc1e13aa911904a093e", "f4a18f49bb1010aa86579a2eac64761a0ac85f6fbbe2afeba8495acbe2e084da"],
  ["unpublish-a-debate", "en", "70e53322f323778974e50ca4f4342a4e8cba5c41d5139d51452530a40c7563a2", "64f871c823dd78f05d18f50ec45373fa07a9ad79f72b4234c8adc9aae443db0b", "db2b5340f4c9089567e0c8b4559cc9ac4749039b91bd3a8b2fbbd5c799991c1f"],
  ["unpublish-a-debate", "ro", "a741f94571245aadbb6f25d6da5c3c5b87bdf5bf72fa4c5aaf8e03980abce9d0", "9be645d5de8cd8f8c26603966f9e9b8f3d58b7cb7c8a95e9cb7b0fd71289fe25", "b8e1ec1cf886a71658412f2b4bcfdb0dd8c91cd424c94aad3df4c377ecd2af7f"],
  ["unsupported-capabilities", "en", "6e7f19d6d7c00fe4d10660e4dff7ad52e16ae8ff3d85cea13717780af586ec6f", "784bf45291c975c87dd6bb1a11f5b1812ecbefc7f0f52ee5cfb66dbdb4f6e9bd", "4feec8aa3b78a1d52916a3484adce247fb94a68b2107c1d5816fdc9c29e7f41f"],
  ["unsupported-capabilities", "ro", "b2ebdc765ec96488ec564c1b5cd00d9d3f9e390abaf17cd5868ec7b505197f85", "b8d3adac101ca1f2814fa32e3b7cd307ed497f3158881dc834ea7cd2d5136da4", "b223418e6d366bd25ac2d36bfc64b43c40206776c1fc298839327349e721b8d0"],
  ["view-public-debate", "en", "995068c814cec3ba1dd0f0ecf320bea04fc8c66acc9703b8cd70cec72cfca053", "c0185e375681e9d609b041f1e7fbbc1e33bd4c4c6489a3ea715fd52797ba35ab", "6d06676fd87b3c96b5194ea459eec98846f322ef28a7890a1261667a37f71ac5"],
  ["view-public-debate", "ro", "9faf157365acb8b560208eb822cda7cd42c83e845d2a551853ea5c97ccf9c260", "b084890fbed2cc9e663966f07ddeff0be6c3bef33bbfb9edfb6b8f38d579df40", "a69efa62f629372892e35d12f5d258c93409e4ca585205c7616bb637e01e7de6"],
] as const;

describe("production Support recovery attestation", () => {
  it("admits the exact separately reviewed 46-record corpus as a deterministic immutable snapshot", () => {
    const componentBytes = readFileSync(componentPath);
    const components = JSON.parse(componentBytes.toString("utf8")) as {
      components: Array<{
        id: string;
        lang: "en" | "ro";
        articleSha256: string;
        modelProjection: string;
        fallback: string;
      }>;
    };
    const reviewManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;

    const corpus = loadHelpCorpus(corpusDirectory, {
      reviewManifest,
      recoveryComponents: componentBytes,
      requireReviewedRecovery: true,
    });

    const expectedRows = EXPECTED.map(
      ([id, lang, articleSha256, modelProjectionSha256, fallbackSha256]) => ({
        id,
        lang,
        articleSha256,
        modelProjectionSha256,
        fallbackSha256,
        ...(["support-cases","settings-help-menus","app-navigation","ai-transparency"].includes(id) ? S05_R2_OWNER_REVIEW : ["account-access","account-settings"].includes(id) ? ACCOUNT_FLOW_REVIEW : S05_KEYS.has(`${id}.${lang}`)
          ? S05_OWNER_REVIEW
          : S02_IDS.has(id)
          ? S02_OWNER_REVIEW
          : id === "ai-transparency"
          ? OWNER_REVIEW
          : id === "debate-workspace-menus"
          ? QUALITY_REVIEW
          : id === "support-cases"
            ? QUALITY_SUPPLEMENT_REVIEW
            : GUIDE_IDS.has(id)
          ? GUIDE_REVIEW
          : id === "product-identity"
            ? IDENTITY_REVIEW
            : REVIEW),
      }),
    );
    expect(corpus.reviewManifest).toMatchObject({
      schemaVersion: 2,
      catalog: {
        sha256:
          "97ebc6f3cfcef958acf380ced6c4e05ce2750f79e17dc998dfd72b26a8ae8ac3",
        ...S05_R2_OWNER_REVIEW,
      },
      recovery: {
        componentFileSha256:
          "a5092b830127f79624bc82da8cfc6505a6fa846c8e7a5020a6533a1cd0aa0f8a",
        components: expectedRows,
      },
    });
    expect(corpus.reviewManifest.articles).toHaveLength(34);
    expect(corpus.entries.map(({ id, lang }) => `${id}.${lang}`)).toEqual(
      EXPECTED.map(([id, lang]) => `${id}.${lang}`),
    );
    expect(corpus).toMatchObject({
      shippedCount: 23,
      ignoredCount: 0,
      previewReviewedCount: 17,
      ownerRatifiedCount: 6,
      recoveryReviewedCount: 23,
      recoveryOwnerRatifiedCount: 6,
    });

    for (const [index, expected] of EXPECTED.entries()) {
      const [id, lang, articleSha256, modelProjectionSha256, fallbackSha256] = expected;
      const component = components.components[index];
      const entry = corpus.entries[index];
      expect(component).toMatchObject({ id, lang, articleSha256 });
      expect(entry).toMatchObject({
        id,
        lang,
        modelProjection: component?.modelProjection,
        fallback: component?.fallback,
        recoveryReview: expectedRows[index],
      });
      expect(sha256(readFileSync(join(corpusDirectory, `${id}.${lang}.md`)))).toBe(articleSha256);
      expect(sha256(component?.modelProjection ?? "")).toBe(modelProjectionSha256);
      expect(sha256(component?.fallback ?? "")).toBe(fallbackSha256);
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry?.recoveryReview)).toBe(true);
    }

    const repeated = loadHelpCorpus(corpusDirectory, {
      reviewManifest,
      recoveryComponents: componentBytes,
      requireReviewedRecovery: true,
    });
    const lookup = createHelpCorpusSnapshotLookup(corpus);
    expect(repeated.kbVersion).toBe(corpus.kbVersion);
    expect(repeated.manifest).toBe(corpus.manifest);
    expect(lookup.currentVersion).toBe(corpus.kbVersion);
    expect(lookup.get(corpus.kbVersion)).toBe(corpus);
    expect(lookup.get("0".repeat(64))).toBeUndefined();
    expect(Object.isFrozen(corpus)).toBe(true);
    expect(Object.isFrozen(corpus.entries)).toBe(true);
    expect(Object.isFrozen(corpus.reviewManifest)).toBe(true);
    expect(Object.isFrozen(corpus.reviewManifest.recovery)).toBe(true);
    expect(Object.isFrozen(corpus.reviewManifest.recovery?.components)).toBe(true);
  });
});
