// NV-54: tsx 4.23 chooses its transform cache ONCE, when its modules are first evaluated
// (`process.env.TSX_DISABLE_CACHE ? new Map : new FileCache`). Its FileCache lives in os.tmpdir()/tsx-<euid>
// and serves a stored entry instead of transpiling the integrity-checked source, so a uid that can write there
// first could replace verified code. Every preview entry loads tsx through this module: the switch is set
// here, before the first evaluation, by the process that loads tsx itself. No unit file, drop-in or env -i
// list needs to carry it (native-peer.mjs admits only PATH/LANG/LC_ALL/TZ: see restoreCacheSwitch).
export const TSX_CACHE_SWITCH='TSX_DISABLE_CACHE';
/**
 * The release's own tsx API plus `restoreCacheSwitch`, which puts the switch back as the caller had it (deleted when
 * absent): tsx keeps the choice it made at evaluation, and an actor check that admits four keys must see what the
 * caller passed, no more and no less. `importApi` is a test seam only; the default resolves tsx from this folder.
 */
export async function loadTsxApi({importApi=()=>import('tsx/esm/api')}={}) {
 const had=Object.hasOwn(process.env,TSX_CACHE_SWITCH),prior=process.env[TSX_CACHE_SWITCH];
 const restoreCacheSwitch=()=>{if(had)process.env[TSX_CACHE_SWITCH]=prior;else delete process.env[TSX_CACHE_SWITCH];};
 process.env[TSX_CACHE_SWITCH]='1';
 return Object.freeze({...await importApi(),restoreCacheSwitch});
}
