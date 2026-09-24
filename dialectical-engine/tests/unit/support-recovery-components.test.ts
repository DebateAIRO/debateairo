import { createHash } from "node:crypto";
import { mkdtempSync,readFileSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach,describe,expect,it } from "vitest";

import {
  loadHelpCorpus,selectSupportRecoveryEntry,supportSourceIdsSatisfyPolicy
} from "../../packages/support-kb/src/index.js";
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
  it("selects the declared reviewed recovery source and fails closed on invalid coverage", () => {
    const policy = Object.freeze({
      id:"your-and-public-debates",
      requiredSourceIds:Object.freeze(["app-navigation"]),
      allowedSourceIds:Object.freeze(["app-navigation","browse-public-debates"]),
      recoverySourceIds:Object.freeze(["app-navigation"])
    });
    const app = Object.freeze({ id:"app-navigation",fallback:"Use the reviewed Home guidance." });
    const browse = Object.freeze({
      id:"browse-public-debates",fallback:"Use the reviewed public-library guidance."
    });

    expect(supportSourceIdsSatisfyPolicy([app.id],policy)).toBe(true);
    expect(supportSourceIdsSatisfyPolicy([browse.id,app.id],policy)).toBe(true);
    expect(supportSourceIdsSatisfyPolicy([browse.id],policy)).toBe(false);
    expect(supportSourceIdsSatisfyPolicy([app.id,"getting-started-debate"],policy)).toBe(false);
    expect(selectSupportRecoveryEntry([browse,app],policy)).toBe(app);
    expect(selectSupportRecoveryEntry([browse],policy)).toBeUndefined();
    expect(selectSupportRecoveryEntry([app],{
      ...policy,recoverySourceIds:["browse-public-debates"]
    })).toBeUndefined();
  });
  it("uses the visible Transcripts label in both navigation drafts", () => {
    const document = JSON.parse(readFileSync(new URL(
      "../../packages/support-kb/recovery/components.json",import.meta.url
    ),"utf8")) as { components: Array<Readonly<{ id:string;lang:string;modelProjection:string }>> };
    for (const lang of ["en","ro"] as const) {
      const article = readFileSync(new URL(
        `../../packages/support-kb/content/app-navigation.${lang}.md`,import.meta.url
      ),"utf8");
      const component = document.components.find(({ id,lang: candidate }) =>
        id === "app-navigation" && candidate === lang)!;
      expect(article).toContain("Transcripts");
      expect(component.modelProjection).toContain("Transcripts");
      expect(article).not.toMatch(/links to Method and a Sample debate|legături către Method și Sample debate/u);
      expect(component.modelProjection).not.toMatch(/links to Method and a Sample debate|oferă Method și Sample debate/u);
    }
  });

  it("keeps the bug-report composer primer distinct from human escalation and email", () => {
    const document = JSON.parse(readFileSync(new URL(
      "../../packages/support-kb/recovery/components.json",import.meta.url
    ),"utf8")) as { components: Array<Readonly<{
      id:string;lang:string;modelProjection:string;fallback:string
    }>> };
    const expectations = {
      en:["Report a bug primes ordinary public-guide text","does not create a human case"],
      ro:["Report a bug completează text obișnuit pentru ghidul public","nu creează un caz uman"]
    } as const;
    for (const id of ["app-navigation","settings-help-menus"] as const) {
      for (const lang of ["en","ro"] as const) {
        const article = readFileSync(new URL(
          `../../packages/support-kb/content/${id}.${lang}.md`,import.meta.url
        ),"utf8");
        const component = document.components.find(({ id: candidate,lang: candidateLang }) =>
          candidate === id && candidateLang === lang)!;
        for (const phrase of expectations[lang]) {
          expect(article).toContain(phrase);
          expect(`${component.modelProjection} ${component.fallback}`).toContain(phrase);
        }
      }
    }
  });

  it("carries the exact eight public-guide drafts without review metadata", () => {
    const document = JSON.parse(readFileSync(new URL(
      "../../packages/support-kb/recovery/components.json",import.meta.url
    ),"utf8")) as { components: Array<Readonly<{ id:string;lang:string;articleSha256:string;
      modelProjection:string;fallback:string }>> };
    const expected = ["app-navigation","debate-workspace-menus","settings-help-menus","support-status-limits"];
    const drafts = document.components.filter(({ id }) => expected.includes(id));

    expect(drafts.map(({ id,lang }) => `${id}.${lang}`)).toEqual(expected.flatMap((id) => [
      `${id}.en`,`${id}.ro`
    ]));
    for (const component of drafts) {
      const article = readFileSync(new URL(
        `../../packages/support-kb/content/${component.id}.${component.lang}.md`,import.meta.url
      ));
      expect(component.articleSha256).toBe(sha256(article));
      expect(component.modelProjection).not.toBe("");
      expect(component.fallback).not.toBe("");
      expect(component).not.toHaveProperty("reviewedBy");
      expect(component).not.toHaveProperty("ratifiedBy");
    }
  });

  it("carries an exact bilingual product-identity draft for separate review", () => {
    const document = JSON.parse(readFileSync(new URL(
      "../../packages/support-kb/recovery/components.json",import.meta.url
    ),"utf8")) as { components: Array<Readonly<{ id:string;lang:string;articleSha256:string;
      modelProjection:string;fallback:string }>> };
    const identity = document.components.filter(({ id }) => id === "product-identity");
    expect(identity.map(({ lang }) => lang).sort()).toEqual(["en","ro"]);
    for (const component of identity) {
      const article = readFileSync(new URL(
        `../../packages/support-kb/content/product-identity.${component.lang}.md`,import.meta.url
      ));
      expect(component.articleSha256).toBe(sha256(article));
      expect(component.modelProjection).not.toBe("");
      expect(component.fallback).not.toBe("");
    }
  });

  it("carries an exact bilingual AI transparency draft for separate review", () => {
    const document = JSON.parse(readFileSync(new URL(
      "../../packages/support-kb/recovery/components.json",import.meta.url
    ),"utf8")) as { components: Array<Readonly<{ id:string;lang:string;articleSha256:string;
      modelProjection:string;fallback:string }>> };
    const drafts = document.components.filter(({ id }) => id === "ai-transparency");
    expect(drafts.map(({ lang }) => lang)).toEqual(["en","ro"]);
    for (const component of drafts) {
      const article = readFileSync(new URL(
        `../../packages/support-kb/content/ai-transparency.${component.lang}.md`,import.meta.url
      ));
      expect(component.articleSha256).toBe(sha256(article));
      expect(component.modelProjection).not.toBe("");
      expect(component.fallback).not.toBe("");
    }
  });

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
    review.recovery.components[0]!.fallbackSha256 = sha256(document.components[0].fallback);
    const corpusB = loadHelpCorpus(first.directory,{
      reviewManifest: review,recoveryComponents: bytes,
      requireReviewedRecovery: true
    } as never);
    expect(corpusB.kbVersion).not.toBe(corpusA.kbVersion);
  });
});
