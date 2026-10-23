// Preview register publish kit v3's base rule from Phase 2 on: compose from the ACTIVE settings version (side-by-side
// spec §13: "assertBaseIsCurrent … is re-aimed at the pointer"; plan 2026-10-21-side-by-side-S-settings Task S18).
//
// Plain words: before Phase 2 a new register version was always made from the newest one, and the preview then ran the
// newest one after a re-pin and a restart. From Phase 2 on the owner switches debate settings by activation, so the
// newest sealed version is no longer necessarily the one in force: a published candidate that was never activated, or
// one activated and then rolled back, sits above the version new debates use. A plan must start from the version new
// debates actually use, never from such a candidate, so that the owner's review shows the change against what runs.
// The version in force ("effective active") is the pointer; with no activation yet, the current release's own site
// version (D1); on a database with no release at all (a fresh database, a test fixture), today's rule stays
// (publish-register-v2.ts assertBaseIsCurrent: nothing sealed above the base but this publication's own replay).
// The pointer is read through the settings operator module (tools/settings-version/settings-operator.ts
// readEffectiveActiveSettings), the one operator module allowed to read it (plan D8; S16 pins its readers). That read
// asks the catalog first (ruling R69): a side-by-side upload plans (SB3) before its migrations run (SB8), so the first
// upload with Phase 2 composes on a database without 0124 (then: no pointer, the current release's site version) and
// one before 0123 has no release table either (then: the old rule).
// Kit v2 (a local-mode preview, byte for byte unchanged) keeps assertBaseIsCurrent; only kit v3 uses this rule.
import type { Pool } from 'pg';
import { parseRegisterVersionText } from '@debateai/register';
import { readEffectiveActiveSettings } from '../../../tools/settings-version/settings-operator.js';
import { assertBaseIsCurrent } from './publish-register-v2.js';

/** The base refusal the native operator prints in words: the operator can act on it (plan again from the active version). */
export const BASE_NOT_ACTIVE = 'PREVIEW_REGISTER_BASE_NOT_ACTIVE: the selected base is not the active settings version; plan again from the active version' as const;
export class PreviewRegisterBaseNotActiveError extends TypeError { readonly code='PREVIEW_REGISTER_BASE_NOT_ACTIVE'; constructor(){ super(BASE_NOT_ACTIVE); } }

/**
 * Side-by-side spec §13: the base must equal the effective active version — the pointer, else the current release's site
 * version (`core.read_current_release()`), else (no release yet) the old currency rule. Versions sealed above the base
 * are allowed (a candidate never activated, or rolled back, is not "current"). `publicationId` serves only the old rule
 * (a crashed publication re-run with the same plan replays its receipt there). Runs before and after the write, like
 * the old rule: an activation that lands meanwhile is reported, not hidden.
 */
export async function assertBaseIsActive(pool:Pool,baseRegisterVersion:string,publicationId:string):Promise<void> {
  const base=parseRegisterVersionText(baseRegisterVersion);
  const status=await readEffectiveActiveSettings(pool);
  if(status.effectiveActive===null)return assertBaseIsCurrent(pool,baseRegisterVersion,publicationId);
  if(String(status.effectiveActive)!==String(base))throw new PreviewRegisterBaseNotActiveError();
}
