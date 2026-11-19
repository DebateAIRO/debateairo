import {expect,it} from 'vitest';
import {Children,isValidElement} from 'react';
function legalDocument(page:any){const documents=Children.toArray(page.props.children).filter((child:any)=>isValidElement(child)&&(child as any).props.document);expect(documents).toHaveLength(1);return (documents[0]as any).props.document;}
import TermsPage from '../../apps/ui/app/terms/page.js';
import PrivacyPage from '../../apps/ui/app/privacy/page.js';
import {TERMS_OF_SERVICE as termsEn} from '../../apps/ui/lib/termsOfService.js';
import {PRIVACY_POLICY as privacyEn} from '../../apps/ui/lib/privacyPolicy.js';
import {TERMS_OF_SERVICE as termsFr} from '../../apps/ui/lib/legal/fr/termsOfService.js';
import {PRIVACY_POLICY as privacyFr} from '../../apps/ui/lib/legal/fr/privacyPolicy.js';
import {TERMS_OF_SERVICE as termsRo} from '../../apps/ui/lib/legal/ro/termsOfService.js';
import {PRIVACY_POLICY as privacyRo} from '../../apps/ui/lib/legal/ro/privacyPolicy.js';
// The render stubs' locale cookie names no offered language, so a page without a usable ?lang reads English.
const pages=async(lang:string)=>[await TermsPage({searchParams:Promise.resolve({lang})}) as any,await PrivacyPage({searchParams:Promise.resolve({lang})}) as any];
it('server-returned ?lang legal links resolve the actual French text/version/hash (Canada) rather than the English cookie default',async()=>{const [terms,privacy]=await pages('fr');expect(legalDocument(terms)).toEqual(termsFr);expect(legalDocument(privacy)).toEqual(privacyFr);expect(legalDocument(terms).sha256).toBe(termsFr.sha256);expect(legalDocument(privacy).sha256).toBe(privacyFr.sha256);});
// The other catalogue languages' drafts carry the current version number over older, unchecked text: ?lang=de is ignored.
it('a ?lang naming a language whose legal texts the release does not check shows the English text, as no ?lang does',async()=>{for(const lang of ['de','pl','es','xx','']){const [terms,privacy]=await pages(lang);expect(legalDocument(terms),lang).toEqual(termsEn);expect(legalDocument(privacy),lang).toEqual(privacyEn);}});
it('?lang may still name English, a regional English choice or Romanian',async()=>{for(const lang of ['en','en-GB','en-US']){const [terms,privacy]=await pages(lang);expect(legalDocument(terms).sha256,lang).toBe(termsEn.sha256);expect(legalDocument(privacy).sha256,lang).toBe(privacyEn.sha256);}const [terms,privacy]=await pages('ro');expect(legalDocument(terms)).toEqual(termsRo);expect(legalDocument(privacy)).toEqual(privacyRo);});
