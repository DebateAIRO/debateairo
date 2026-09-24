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
  ["account-access", "en", "17aac248d75d7ad161fba2a44068d20743a9759ae56c9b30359c7e1d5550c2e7", "c138d4ed2ecd19847cb74b1fd7ad91eb9b047369cb2a391f15563e0915ec192a", "6b5d2dcff5c21d11eae6c6a92cabea39ec253e8e54b5d890d9b25d56f9eab32d"],
  ["account-access", "ro", "5048de52b22b474fb8185e718fcaf235cd23896eff8fd7e42f4399d5266e9410", "e3ca804d9cd657ec82e9a9f81fd2dc1299997ee59cc4a752e757cd9e67d6ef98", "47d2b4b41acc0d0ef976bab9e08e5f617303612bfeda2b969a2958d6618ad8c0"],
  ["account-settings", "en", "2cab95047c1c34109794f3fc1ad620784bbb97b9267160d471551454d296f628", "67f5ce1fd18952c94a981f772e32e29c8c526b5591d656c202260486826a0d62", "6d99d7eeb445525b3bf3cf55f4283ee24fec536ff4f9ccc3a3b1f928904091bf"],
  ["account-settings", "ro", "e2b2834ff96da50a0511b2647ae490f6f99af80e317a74caddb16ee8262bc5d9", "f941492f0a6bed283a0fd70aa6ffeb20304b40c5bdfdd8e01f438cf3094f08f8", "1b7be7bebd1932a4630bea3df60d016218ecedca1ef538ac14510ef66d5f2aad"],
  ["ai-transparency", "en", "e7deab21d5d105769017fc40431c26ec94f3b8ea4385b2547d0eceac8a7f92a6", "fc313334a897d806c7c968752fb16eac7cb8ca4e5535ae18dc7b1ff89362c879", "611cf0c13e949362a3bd17c4e1c899fa291b9f6ed249b007ecc216de7601999a"],
  ["ai-transparency", "ro", "df69c138d5166b5070ff3156e2ce205e3f9509f7accb89fd4dcbe254af1f9822", "4c7cd7c97c6a43f34083acb72adb6dbf2f2fd4ad9b363601a7fb19d0f8ae7d7f", "ef0e8df3377df3e5c2cdb37ac04c4b1f479f5ec09c2ab1ba744773d8fc04fd82"],
  ["app-navigation", "en", "a92e96c24c3df6d7a9b3e73a3fafde79321cd7445612588024ea205fb5c6e6db", "3f17d7323fcd88f34b6f9f1a4da904b0da28a18a09f6fa7f814e6333f4b83b29", "4264551f61745540e92932ee99a99405152e94edf8b167e0ee19c5463526411d"],
  ["app-navigation", "ro", "a6f79cd55e0856780bff01ec3134df02a068b41453f44a8847c5c58050af8a23", "04001a0ddc6b3f743946fec81d2d3d5caed672f5f14d430eb3af74dc1421e3a3", "e6a00272d90624b8367c54d60b8ecad42ee69ddf8155729b972eb8463a2d1cde"],
  ["browse-public-debates", "en", "8059a2e46af231765a80f61854752aa5a9ec49e60c95dc715eb3e82a39618fad", "c5c6d262a33abda6c4cf76024cfaa5f42c2b51f2e3242ae3ed3d3bf157ba1034", "c5294a4cae6fc88b300ec64634fbbb2531e7eef783bed814f387834804f21bb6"],
  ["browse-public-debates", "ro", "0fb2aa501c0980af4afb52520c10e51ca0814266bd2258b1f727fa52d16e0241", "87cb63222b2a74f1c75e4d25c28e69e35de0673049d4be055f7de201459e0897", "37bd679ea02946cbdcf7948c7d1345376592335f4e8bde3b2e78adf339e0f40d"],
  ["budget-tier-choice", "en", "a49d563ef7bfec75ed179a70adb54c25947aa9cbe4db557698eacc84d1d3c683", "e6d5adf85f44c3fd1aaa2c70d095f6f2474723a5b72393d4a006f0206fa64104", "cb920483c56311f42b1adf89c581320a4a5344dcc90028fa458ad6028867d601"],
  ["budget-tier-choice", "ro", "e648150ae607bb98c55059eaea6162ffc2cd09df437721b75c8c7b226ef4984d", "d8648bd28c6eddb018f6508c7c1eed9e0a20941807979d42701e35e4351ea371", "1496048887bc41ba3968fdaf7d0fe17e43feffaba1f1c997f46f0b420d30652f"],
  ["debate-topic-and-description", "en", "695b7b405e599260acd7c5a51f897f46b52b238f2860a20168cd14cfdc176bad", "290097ca24858424c4bc2a6845182a9c1cbcd0214c6a3109e2b32cf7e0bd0f56", "7234ce24457ad97fe943e93b1caf0e28a8d74e30aa1748f1d29b158cdcba67b7"],
  ["debate-topic-and-description", "ro", "90f1fff60a4245eeda7b5131b671772b425e8ab682f967c4c31c2ad42c7207a2", "8cd97dedffdf9b059f4d809b73f60f59174007b42a7a99998989c354af93bee8", "c6470bf637f904245f4c5f468c1b33c1d43d03fa0b45d1d3ba32eb47f12840f7"],
  ["debate-workspace-menus", "en", "e3f92be13a7d880e259c331e2c5dc3881abd9693e1846b90fcddafeda151170d", "d4da3f54b348b1c78dad80b67cbe1db12d196f396e6385c2dc0d2fd0ef5d0f34", "28525e3135cc7b623a00f52d7f9aa520579959f4238bb51117866ad3ba89bcce"],
  ["debate-workspace-menus", "ro", "eb2b85327509e4e9e0e4b29009af11b109e225f70e784b09f447d17ed7aa162a", "095fe2fae248ca61c4b7e99100ab4bc4343d0ab7e525576bf747baa79d6816c8", "5e558ff25dda284435df41eca3e9de5f6b1f940f95cb0b8a3126801bba415e97"],
  ["delete-a-private-debate", "en", "7c37881f26d875f87a0177bc35593d9f52a1739b25a848df98ad2d478c7bdb26", "9ae0d23732c129d4b3e3e06b4c81833a5546b214506ecc53c3b531b4856dc49c", "92409ee15ce6ed5f380136ab090d3ce2a82ee355e379e7d068609baf9e92365b"],
  ["delete-a-private-debate", "ro", "afc631bec586e463df1b217d79fc9ea694f873f5690b028c7b79aa65d83cfaa9", "1f4b3b1719c76d8223159dd73049c47761dd4fd6482103d40cf31d53fd2b54a3", "46037245889b3c11b737e40222ce1c6d1b800020a92ee4e92725ad03d8338727"],
  ["export-json", "en", "c31c5bd3a2eb80e1352f27431e459f8272ae37605a9988210cff2aa82d6b7ea5", "690569195ed4098fd00b5bf102658f9bd26b2610897ca816163f8abb2a47946d", "6abec339af9fc96715c8964a17341461db4042701acb1f54e1e9deea37421afb"],
  ["export-json", "ro", "5016b1370fbbd83ed2e647cfdeb8a2c10b4052ef8861807abed2ee4b0ae8f02b", "70c63bd09f0577e45c6c20ab542013cf6caba0e2f0290782f4d6589ef868720f", "78dc48a23f8a2de1e4af205d26f1d743a9000ed2c375437b0cfe2acb66d82cd3"],
  ["getting-started-debate", "en", "a438b7c7a91342dee7c5edb2efe48e586be2cc33d9a2eafabaadad2882f6f9e8", "059900a11c6ec871145ee61e4aaca7214c76c02e8dab61dbec67eb08e6a3017e", "c844161c3430edcfb0a195df7ffff6bcf82c0826ab454bf817631933649bed48"],
  ["getting-started-debate", "ro", "f2a848dbaa9131d3165f50ce2004f1fba874032a48d7bdf1ba90f96c8aa205af", "23c930ba398c6bdf4c119b30bae509946ca8a483c9b0cb18e9ac6bd238220d80", "ef982f6420391eeaaf23c475afb230fcee91afc2183c4b945403283802d09e8a"],
  ["guide-how-it-works", "en", "05316f05e559cd866948ab7f464a681d6875fe8aad5143e956eeb20077bc46c5", "758085d81051393bd3520c43c84a23689a652c5dc6b15e0154a46a1fcf7cd528", "c1ed3a89b00d46ac7f1710280ef768f9d66adec20d20aaa18815596e6a5c2265"],
  ["guide-how-it-works", "ro", "94acc4db2ccecb9a0d4f5b82350e91d26643b76c6caff879019edc107a3e3000", "65482fb1f90d62942b4e6f87a289c151978250fb385efc10d12c8e239780c195", "cb344a791adc4616c177c993b4f186595725f6ea3de8b1f95fcd8a6f0ff07ed8"],
  ["privacy-consent", "en", "54cca7dbfb790c9d6aac077b00775e5ac6d5bc277be38733e92047bc63c262d5", "5de30c60b097bc464f12d9aef13fbc67e0c15c6d5aa4ca1a91f82fe77fc394ae", "419fbdd08f1d581b9484d6df1cb6b63077aef93ab627b9ab87c0c6054ce66d49"],
  ["privacy-consent", "ro", "e9b04331a2aa76d3ed9bd45c2199263dc476ae62d15c33db30ed537fedeb5c5d", "7db208bec972f230adaddf05162305126e6aeeb431fd66bad468886e2c62710e", "940316e6b1a66598baa91183116c92477be57df65885dc22b1ce4954393e11f6"],
  ["product-identity", "en", "3841870d3e2310a8fbee6325e59b4c25e92437b644b6a311910ade1e304ef4aa", "797d3ca04d545f868a633dd67d7f52a9758ddb86fa26aaf87d3d87ee5ff32d64", "0f08312a2f6fcd13a67f7694dfefe1ac084bbda210df900eda65ec589cc4c032"],
  ["product-identity", "ro", "d05337815983d83f075964b6db5063dfbff40721a720013aaeeff19c98262391", "5ca60396146b9390d5f2848c703a221d75e0f3e2c88740cc44d1abde6c77ae40", "d2102ff844843efc368e4458e7928fbb6ccd64675cb3c8d4b1657ff015acf812"],
  ["public-answer-disclosure", "en", "e67c271558e6bb5b4100fa735059e781e453c268808d555c6e85af36e3e678ea", "1ee826de541e74d701fd502bfe70e85c009da2b94d3e6d38c1fc98924f251670", "9c733e8f40697f0cd9f15f5984947edaff532a10bc3375d10ca94747e10cc569"],
  ["public-answer-disclosure", "ro", "6e845c95414ae5b9190cf5917136776d7af931eaf626b2da4a0540b3bf7925f1", "4ee30438ed6e75bb79f2e458bb78a6e8e8b79d3271e59c372dff626ce23a3819", "903906d5fc6d89668a42a2108cf30e21b1ec166a9fdce9e7aeff1bf4882fa45d"],
  ["publish-a-debate", "en", "9385f0dd00f8014e3445d1ee4c8c5230dc12d0379766d35c9c7845814f288e29", "83119e6803f854c04ad0153b55cc69212563a92f6b7e350ef29f656ff6c90a3c", "b2974fdf83f15e7142380698b7b21a95bd9efe7cbcfaa5d07028f292bcfd53ef"],
  ["publish-a-debate", "ro", "41858b13ebb6bcec19430b6a63cae6f5854b25ad02e8ac74617d83b087355c3c", "834ec781e6645753549cfca72d8d7bdc70ecb425f1eba125b25c5e04410ea598", "a6f1ef4a94b53df2d77fdd63a14c3f596adaac6b437ab3586424d21815284b26"],
  ["risk-tier-choice", "en", "3ca67a93a3b159c0b284b2bd75093fd9bc70e20d03c357f4ac1fdcb3df522715", "37a5e399d53e5c284febfd79f40fe36bfc611eddb254ccb9a758469e66557929", "7908d0b36c5c62a863ee064095bc3f528792d9588fba9f88c523ea978dffb7f2"],
  ["risk-tier-choice", "ro", "f40e8583d9ec012f6510c4f6ae6a6527680bc279f393388dc8cd2a31762f4d96", "0845807a9ba9cc68c608a5be752fdbaa08147fe8aed5a06a61021bb91675a34a", "d35f24c30f5998d0a8945f6efdd97cbebf45c0612b6181ff47c48c81951b02ab"],
  ["settings-help-menus", "en", "2f1fd92ebe1f560f631a0990b8883e0aa857783114751f9532cabcf97ba86ede", "3677572a1b6fe513930ad82259a89b985f0c3ce023c57be4489794be27147a79", "ea5720fab4e9755c489c63daec5e85d0cf6b3a0fa9d30a97827dadc7d0e166b5"],
  ["settings-help-menus", "ro", "57b5e6f5d34327177b504261fcc2b4f24e1e7693093f2d42cfd3348fc17872f7", "4c8e8ab9af79965af5234b0da312f2970bf9d36f3b131765c4ac31353c5d2495", "574aef1c82b5203dcab7fd229ad3c6b9bcaa13c64a55924e7ffc49c5bab2d3cc"],
  ["support-cases", "en", "300f6b63a1798ee15ba335538bdc9eb0e1c5dca11c770ce11f5e11edee9cee9e", "04ff511b177c062b1fa66397db84ac7295b75319e2c27fc870aaff171c43ae76", "df37d0f11029ff345c6f303c425bdeb36435ab0a51e0dbddf22ffd0877ca49a1"],
  ["support-cases", "ro", "4073ca95886bd56063c9f6ff49b959e3affa5c5a0a9000b6ecf6ff2171535977", "23df826d8a8701abb080a371df942b978885224bb612140c54221f2806615c2a", "62bbe76506089edca69ffca3d820f7ebd9610f831cf6a3b007efe00125cb971f"],
  ["support-status-limits", "en", "f5344e3c0e5f0bec3bb3b5b10dff77b12a85d90233a6d7a7cf8a31f38cc7bfe7", "932f33969c279c6e7db4dc9d0d47fee7eb535b0d1cb593f9b9e9ccc743913385", "3aafc3b34626b517e8827a8ff0ab9fa6deadf978dee235bd6d78936f37354375"],
  ["support-status-limits", "ro", "0ba2909d0b6bf0dbb731e6c19ceff73cd99babbfed69949aec3b28d57f732bfa", "05ede1015a5f66f5a5e2e564d061353d433c3af82ea2871bf9489764a27915f0", "b14e495dcccbcf8d01c1e6213e28ee4c738ee405c6ea8eb4cc572d79f7a73b5e"],
  ["unpublish-a-debate", "en", "70e53322f323778974e50ca4f4342a4e8cba5c41d5139d51452530a40c7563a2", "64f871c823dd78f05d18f50ec45373fa07a9ad79f72b4234c8adc9aae443db0b", "db2b5340f4c9089567e0c8b4559cc9ac4749039b91bd3a8b2fbbd5c799991c1f"],
  ["unpublish-a-debate", "ro", "a741f94571245aadbb6f25d6da5c3c5b87bdf5bf72fa4c5aaf8e03980abce9d0", "9be645d5de8cd8f8c26603966f9e9b8f3d58b7cb7c8a95e9cb7b0fd71289fe25", "b8e1ec1cf886a71658412f2b4bcfdb0dd8c91cd424c94aad3df4c377ecd2af7f"],
  ["unsupported-capabilities", "en", "6e7f19d6d7c00fe4d10660e4dff7ad52e16ae8ff3d85cea13717780af586ec6f", "784bf45291c975c87dd6bb1a11f5b1812ecbefc7f0f52ee5cfb66dbdb4f6e9bd", "4feec8aa3b78a1d52916a3484adce247fb94a68b2107c1d5816fdc9c29e7f41f"],
  ["unsupported-capabilities", "ro", "c07bb1a6a85f14a034a134a08250f22721f772ce54bd77d18ff63f7df93d350b", "c9865d48ace58951f1c0c5bf85cd99b50dd6985d276fdeff7d4094e060c9acb5", "48de85c1329b80861e5bc5a7d1e2ce2dee433ec1f7bfd67ce0cd4596644702d2"],
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
        ...(id === "ai-transparency"
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
          "ebf458f1cceb6aa5681534a391f239466f92d68680e21af448bd4b7225436032",
        ...OWNER_REVIEW,
      },
      recovery: {
        componentFileSha256:
          "06703ff9df60a0c77261e0ab57a36d3180e7b6823d235f2751d57e4cfa851ee1",
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
      recoveryOwnerRatifiedCount: 1,
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
