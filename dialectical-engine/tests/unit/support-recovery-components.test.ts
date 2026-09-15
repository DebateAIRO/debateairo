import { createHash } from "node:crypto";
import { mkdtempSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach,describe,expect,it } from "vitest";

import { loadHelpCorpus } from "../../packages/support-kb/src/index.js";
import { SUPPORT_CATALOG_CANONICAL } from "../../packages/support-kb/src/catalog.js";

const directories: string[] = [];
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const directory = mkdtempSync(join(tmpdir(),"support-recovery-"));
  directories.push(directory);
  const articles = [
    { id: "alpha-guide",lang: "en" as const,title: "Alpha guide",body: "Raw EN body with /private/route." },
    { id: "alpha-guide",lang: "ro" as const,title: "Ghid alfa",body: "Corp RO brut cu /ruta/privata." }
  ];
  const articleHashes = new Map<string,string>();
  for (const article of articles) {
    const bytes = [
      "---",`id: ${article.id}`,`lang: ${article.lang}`,`title: ${article.title}`,"status: shipped",
      "sources:","  - fixture.ts:1","verified_against: fixture","ratified_by: V",
      "ratified_on: 2026-09-01","---","",article.body,""
    ].join("\n");
    writeFileSync(join(directory,`${article.id}.${article.lang}.md`),bytes);
    articleHashes.set(`${article.id}.${article.lang}`,sha256(bytes));
  }
  const components = {
    schemaVersion: 1,
    components: articles.map((article) => ({
      id: article.id,lang: article.lang,articleSha256: articleHashes.get(`${article.id}.${article.lang}`)!,
      modelProjection: article.lang === "en"
        ? "The reviewed English facts remain complete." : "Faptele românești verificate rămân complete.",
      fallback: article.lang === "en"
        ? "Use the reviewed Alpha guidance." : "Folosește îndrumarea Alfa verificată."
    }))
  };
  const componentBytes = Buffer.from(`${JSON.stringify(components,null,2)}\n`);
  const reviewManifest = {
    schemaVersion: 2,
    catalog: {
      sha256: sha256(SUPPORT_CATALOG_CANONICAL),reviewedBy: "SOL",reviewerSession: "/fixture/editor",
      reviewedOn: "2026-09-14",evidence: "/fixture/catalog-review.md"
    },
    articles: [],
    recovery: {
      componentFileSha256: sha256(componentBytes),
      components: components.components.map((component) => ({
        id: component.id,lang: component.lang,articleSha256: component.articleSha256,
        modelProjectionSha256: sha256(component.modelProjection),fallbackSha256: sha256(component.fallback),
        reviewedBy: "SOL",reviewerSession: "/fixture/editor",reviewedOn: "2026-09-14",
        evidence: "/fixture/recovery-review.md",ratifiedBy: "",ratifiedOn: ""
      }))
    }
  };
  return { directory,componentBytes,reviewManifest };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory,{ recursive: true,force: true });
});

describe("reviewed Support recovery components", () => {
  it("admits a complete exact-hash bilingual component set into an immutable snapshot", () => {
    const data = fixture();
    const corpus = loadHelpCorpus(data.directory,{
      reviewManifest: data.reviewManifest,recoveryComponents: data.componentBytes,
      requireReviewedRecovery: true
    } as never);

    expect(corpus.entries).toHaveLength(2);
    expect(corpus.entries.map(({ modelProjection }) => modelProjection)).toEqual([
      "The reviewed English facts remain complete.","Faptele românești verificate rămân complete."
    ]);
    expect(corpus.recoveryReviewedCount).toBe(1);
    expect(corpus.recoveryOwnerRatifiedCount).toBe(0);
    expect(Object.isFrozen(corpus.entries[0])).toBe(true);
    expect(Object.isFrozen(corpus.entries)).toBe(true);
  });

  it("fails strict loading when recovery review is missing, malformed, stale, or tampered", () => {
    const data = fixture();
    const excluded = loadHelpCorpus(data.directory,{
      recoveryComponents: data.componentBytes
    });
    expect(excluded.entries).toEqual([]);
    expect(excluded.recoveryReviewedCount).toBe(0);
    expect(() => loadHelpCorpus(data.directory,{
      recoveryComponents: data.componentBytes,requireReviewedRecovery: true
    } as never)).toThrowError(expect.objectContaining({ code: "SUPPORT_KB_RECOVERY_REVIEW_REQUIRED" }));

    const stale = structuredClone(data.reviewManifest);
    stale.recovery.components[0]!.fallbackSha256 = "f".repeat(64);
    expect(() => loadHelpCorpus(data.directory,{
      reviewManifest: stale,recoveryComponents: data.componentBytes,
      requireReviewedRecovery: true
    } as never)).toThrowError(expect.objectContaining({ code: "SUPPORT_KB_RECOVERY_REVIEW_INVALID" }));

    const tampered = Buffer.from(data.componentBytes);
    tampered[tampered.length - 2] = 0x20;
    expect(() => loadHelpCorpus(data.directory,{
      reviewManifest: data.reviewManifest,recoveryComponents: tampered,
      requireReviewedRecovery: true
    } as never)).toThrowError(expect.objectContaining({
      code: "SUPPORT_KB_RECOVERY_COMPONENT_INVALID"
    }));
  });

  it("changes snapshot identity when exact admitted component bytes change", () => {
    const first = fixture();
    const corpusA = loadHelpCorpus(first.directory,{
      reviewManifest: first.reviewManifest,recoveryComponents: first.componentBytes,
      requireReviewedRecovery: true
    } as never);
    const document = JSON.parse(first.componentBytes.toString("utf8"));
    document.components[0].fallback = "Use the amended reviewed Alpha guidance.";
    const bytes = Buffer.from(`${JSON.stringify(document,null,2)}\n`);
    const review = structuredClone(first.reviewManifest);
    review.recovery.componentFileSha256 = sha256(bytes);
    review.recovery.components[0].fallbackSha256 = sha256(document.components[0].fallback);
    const corpusB = loadHelpCorpus(first.directory,{
      reviewManifest: review,recoveryComponents: bytes,
      requireReviewedRecovery: true
    } as never);
    expect(corpusB.kbVersion).not.toBe(corpusA.kbVersion);
  });
});
