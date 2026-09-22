const ORDERINGS=new Set(["COOKIE_BEFORE_COMPACT_ACTIVATION","LEGACY_COOKIE_AFTER_READY"]);

export async function runGuideCaptureOpenMode({
  mode,language,ordering="COOKIE_BEFORE_COMPACT_ACTIVATION",openGuideSupportSurface,
  navigate,waitForHydration,observe,activateCompact,waitForReady,settleCookieConsent,
  selectLanguage,recordStage,checkpoint
}) {
  if ((mode!=="full"&&mode!=="compact") || (language!=="en"&&language!=="ro")
    || !ORDERINGS.has(ordering)
    || ![openGuideSupportSurface,navigate,waitForHydration,observe,waitForReady,
      settleCookieConsent,selectLanguage,recordStage,checkpoint].every(value=>typeof value==="function")
    || (mode==="compact"&&typeof activateCompact!=="function")) {
    throw new Error("GUIDE_CAPTURE_OPEN_MODE_CONTRACT_INVALID");
  }
  const settle=async()=>{
    await recordStage("COOKIE_SETTLING","ENTERED");
    try { await settleCookieConsent(); }
    catch { throw new Error("GUIDE_HARNESS_POST_READY_COOKIE_SETTLING_FAILED"); }
    await recordStage("COOKIE_SETTLING","PASSED");
  };
  const activate=mode!=="compact"?activateCompact:async()=>{
    if(ordering==="COOKIE_BEFORE_COMPACT_ACTIVATION") await settle();
    await activateCompact();
  };
  await openGuideSupportSurface({
    surface:mode,language,navigate,waitForHydration,observe,activateCompact:activate,waitForReady,
    selectLanguage:async selected=>{
      if (mode!=="compact"||ordering==="LEGACY_COOKIE_AFTER_READY") await settle();
      await recordStage("LOCALE_SELECTION","ENTERED");
      try { await selectLanguage(selected); }
      catch { throw new Error("GUIDE_HARNESS_POST_READY_LOCALE_SELECTION_FAILED"); }
      await recordStage("LOCALE_SELECTION","PASSED");
    },
    checkpoint
  });
}
