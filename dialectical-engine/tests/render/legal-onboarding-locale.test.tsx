import {expect,it} from 'vitest';
import TermsPage from '../../apps/ui/app/terms/page.js';
import PrivacyPage from '../../apps/ui/app/privacy/page.js';
import {TERMS_OF_SERVICE as termsDe} from '../../apps/ui/lib/legal/de/termsOfService.js';
import {PRIVACY_POLICY as privacyDe} from '../../apps/ui/lib/legal/de/privacyPolicy.js';
it('server-returned ?lang legal links resolve the actual German text/version/hash rather than the English cookie default',async()=>{const terms:any=await TermsPage({searchParams:Promise.resolve({lang:'de'})}),privacy:any=await PrivacyPage({searchParams:Promise.resolve({lang:'de'})});expect(terms.props.children.props.document).toEqual(termsDe);expect(privacy.props.children.props.document).toEqual(privacyDe);expect(terms.props.children.props.document.sha256).toBe(termsDe.sha256);expect(privacy.props.children.props.document.sha256).toBe(privacyDe.sha256);});
