import {readFileSync,existsSync} from 'node:fs';
import {it,expect} from 'vitest';
it('ordinary account settings no longer ships legacy claim UI',()=>{expect(existsSync('apps/ui/components/LegacyRunClaimControls.tsx')).toBe(false);expect(readFileSync('apps/ui/components/SettingsPageClient.tsx','utf8')).not.toContain('LegacyRunClaimControls');expect(readFileSync('packages/support-kb/src/catalog.ts','utf8')).not.toContain('claim-legacy');});
