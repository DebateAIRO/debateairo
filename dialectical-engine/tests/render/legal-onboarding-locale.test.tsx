import {expect,it} from 'vitest';
import {Children,isValidElement} from 'react';
function legalDocument(page:any){const documents=Children.toArray(page.props.children).filter((child:any)=>isValidElement(child)&&(child as any).props.document);expect(documents).toHaveLength(1);return (documents[0]as any).props.document;}
import TermsPage from '../../apps/ui/app/terms/page.js';
import PrivacyPage from '../../apps/ui/app/privacy/page.js';
import {currentDocument} from '@debateai/legal-manifest';
import {LOCALES} from '../../apps/ui/lib/i18n/locales.js';
import {TERMS_OF_SERVICE as termsEn} from '../../apps/ui/lib/termsOfService.js';
import {PRIVACY_POLICY as privacyEn} from '../../apps/ui/lib/privacyPolicy.js';
import {TERMS_OF_SERVICE as termsFr} from '../../apps/ui/lib/legal/fr/termsOfService.js';
import {PRIVACY_POLICY as privacyFr} from '../../apps/ui/lib/legal/fr/privacyPolicy.js';
import {TERMS_OF_SERVICE as termsRo} from '../../apps/ui/lib/legal/ro/termsOfService.js';
import {PRIVACY_POLICY as privacyRo} from '../../apps/ui/lib/legal/ro/privacyPolicy.js';
import {TERMS_OF_SERVICE as termsDe} from '../../apps/ui/lib/legal/de/termsOfService.js';
import {PRIVACY_POLICY as privacyDe} from '../../apps/ui/lib/legal/de/privacyPolicy.js';
// Every language's generated legal modules (English's sit at apps/ui/lib/termsOfService.ts and privacyPolicy.ts).
const LEGAL_MODULES=import.meta.glob<any>(['../../apps/ui/lib/legal/*/termsOfService.ts','../../apps/ui/lib/legal/*/privacyPolicy.ts']);
const legalModule=async(lang:string,file:'termsOfService'|'privacyPolicy')=>{if(lang==='en')return file==='termsOfService'?{TERMS_OF_SERVICE:termsEn}:{PRIVACY_POLICY:privacyEn};const load=LEGAL_MODULES[`../../apps/ui/lib/legal/${lang}/${file}.ts`];expect(load,`${lang}/${file}`).toBeDefined();return load!();};
// The render stubs' locale cookie ("token:test") names no catalogue language, so a page without a usable ?lang reads English.
const pages=async(lang:string)=>[await TermsPage({searchParams:Promise.resolve({lang})}) as any,await PrivacyPage({searchParams:Promise.resolve({lang})}) as any];
it('server-returned ?lang legal links resolve the actual French text/version/hash (Canada, and an offered language) rather than the English cookie default',async()=>{const [terms,privacy]=await pages('fr');expect(legalDocument(terms)).toEqual(termsFr);expect(legalDocument(privacy)).toEqual(privacyFr);expect(legalDocument(terms).sha256).toBe(termsFr.sha256);expect(legalDocument(privacy).sha256).toBe(privacyFr.sha256);});
// Since 24 November 2026 every catalogue language is offered and its legal texts follow the English 1.1 text, so a ?lang naming any of them shows that language's text in force.
it('a ?lang naming German shows the German text, in German words',async()=>{const [terms,privacy]=await pages('de');expect(legalDocument(terms)).toEqual(termsDe);expect(legalDocument(privacy)).toEqual(privacyDe);expect(legalDocument(terms).eyebrow).toMatch(/^NUTZUNGSBEDINGUNGEN · v1\.1 · GÜLTIG AB /u);expect(legalDocument(privacy).eyebrow).toMatch(/^DATENSCHUTZERKLÄRUNG · v1\.1 · GÜLTIG AB /u);expect(legalDocument(terms).endMarker).toBe('ENDE DER NUTZUNGSBEDINGUNGEN · v1.1');});
it('a ?lang naming any of the 35 catalogue languages shows that language\'s own text in force, never the English one',async()=>{const codes=LOCALES.map(({code})=>code);expect(codes).toHaveLength(35);for(const lang of codes){const [terms,privacy]=await pages(lang);const shownTerms=legalDocument(terms),shownPrivacy=legalDocument(privacy);expect({version:shownTerms.version,sha256:shownTerms.sha256},`${lang} terms`).toEqual(currentDocument('TERMS',lang));expect({version:shownPrivacy.version,sha256:shownPrivacy.sha256},`${lang} privacy`).toEqual(currentDocument('PRIVACY',lang));const {TERMS_OF_SERVICE}=await legalModule(lang,'termsOfService');const {PRIVACY_POLICY}=await legalModule(lang,'privacyPolicy');expect(shownTerms,`${lang} terms`).toEqual(TERMS_OF_SERVICE);expect(shownPrivacy,`${lang} privacy`).toEqual(PRIVACY_POLICY);if(lang!=='en'){expect(shownTerms.sha256,`${lang} terms`).not.toBe(termsEn.sha256);expect(shownPrivacy.sha256,`${lang} privacy`).not.toBe(privacyEn.sha256);}}});
// A ?lang that names no catalogue language (an unknown code, wrong case, a region the catalogue does not have, nothing) counts as no ?lang: English.
it('a ?lang naming no catalogue language shows the English text, as no ?lang does',async()=>{for(const lang of ['xx','','RO','DE','fr-CA','en-AU','de-DE']){const [terms,privacy]=await pages(lang);expect(legalDocument(terms),lang).toEqual(termsEn);expect(legalDocument(privacy),lang).toEqual(privacyEn);}});
it('?lang may name English, a regional English choice or Romanian',async()=>{for(const lang of ['en','en-GB','en-US']){const [terms,privacy]=await pages(lang);expect(legalDocument(terms).sha256,lang).toBe(termsEn.sha256);expect(legalDocument(privacy).sha256,lang).toBe(privacyEn.sha256);}const [terms,privacy]=await pages('ro');expect(legalDocument(terms)).toEqual(termsRo);expect(legalDocument(privacy)).toEqual(privacyRo);});
