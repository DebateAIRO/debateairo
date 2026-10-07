import {expect,it} from 'vitest';
import {Children,isValidElement} from 'react';
function legalDocument(page:any){const documents=Children.toArray(page.props.children).filter((child:any)=>isValidElement(child)&&(child as any).props.document);expect(documents).toHaveLength(1);return (documents[0]as any).props.document;}
import TermsPage from '../../apps/ui/app/terms/page.js';
import PrivacyPage from '../../apps/ui/app/privacy/page.js';
import {TERMS_OF_SERVICE as termsDe} from '../../apps/ui/lib/legal/de/termsOfService.js';
import {PRIVACY_POLICY as privacyDe} from '../../apps/ui/lib/legal/de/privacyPolicy.js';
it('server-returned ?lang legal links resolve the actual German text/version/hash rather than the English cookie default',async()=>{const terms:any=await TermsPage({searchParams:Promise.resolve({lang:'de'})}),privacy:any=await PrivacyPage({searchParams:Promise.resolve({lang:'de'})});expect(legalDocument(terms)).toEqual(termsDe);expect(legalDocument(privacy)).toEqual(privacyDe);expect(legalDocument(terms).sha256).toBe(termsDe.sha256);expect(legalDocument(privacy).sha256).toBe(privacyDe.sha256);});
