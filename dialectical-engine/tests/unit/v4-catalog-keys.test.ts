import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { basisKey, OPEN_QUESTION_KINDS, READING_LEVELS, DIG_MODES, TRUST_BASES, TRUST_WORDS } from "../../apps/ui/lib/v4/types.js";
import { DIG_LEVEL_MAX, MAIN_ANSWER_TRIGGERS, POINT_OF_VIEW_OUTCOMES, POINT_OF_VIEW_SCOPES } from "../../packages/contract/src/web.js";

/*
 * V4 initial (2026-10-28): the v4 namespace has no English backstop in t() (only chrome/home/newDebate/support/time
 * do), so a key missing from messages/en/v4.json would show as the raw key on the page. Every literal "v4.…" key the
 * V4 code reads must exist, with a non-empty value, and every key built from a shared word list must exist for every word.
 */
const ui = resolve(import.meta.dirname, "../../apps/ui");
const catalog = JSON.parse(readFileSync(join(ui, "messages/en/v4.json"), "utf8")) as Record<string, string>;
const v4Dirs = ["app/v4", "components/v4", "lib/v4"];

/** The approved page lines of the web search and the digs (PERPLEXITY-DESIGN.md §7.1; owner Q14: a percentage). */
const APPROVED_LINES: Readonly<Record<string, string>> = Object.freeze({
  "v4.web.sureBasis": "A second AI agreed, and the point rests on a page we looked up.",
  "v4.web.failed": "We couldn't look things up on the web this time. The points below come from the AIs' own knowledge.",
  "v4.web.free": "Not checked on the web; paid plans look things up.",
  "v4.dig.quotaShare": "This dig uses about {percent}% of today. After it you can still finish your report.",
  "v4.dig.quotaDayUsed": "You've used what today allows for digging. Write your report now, or keep digging after {time}.",
  "v4.rail.writeReport": "Write my report"
});

/**
 * Dig model revision (W2-7): the verdict lines on the person's point of view, draft 5.3 of
 * docs/superpowers/plans/2026-10-30-dig-model-revision.md, approved as written by the owner (30 Oct). Code picks the line
 * from the outcome and scope; a NOT_SETTLED verdict has one line whatever its scope.
 */
const APPROVED_VIEW_LINES: Readonly<Record<string, string>> = Object.freeze({
  "v4.view.HELPED.PATH": "Your point of view helped this path.",
  "v4.view.HELPED.MAIN_QUESTION": "Your point of view helped this path and the main question.",
  "v4.view.DID_NOT_HELP.PATH": "Your point of view did not help this path.",
  "v4.view.DID_NOT_HELP.MAIN_QUESTION": "Your point of view did not help this path or the main question.",
  "v4.view.NOT_SETTLED": "The dig could not settle whether your point of view helps.",
  "v4.view.asYours": "The AIs weighed your point of view as yours. They did not take it as a finding.",
  "v4.view.why": "Why: {reason}"
});

/**
 * R22 W5-1: the final report over an investigation. The section headings are W0-1 §2.6's (owner approved); F13's line on
 * a shortened dossier and N14's line when no story could be written are the owner's answers, word for word.
 */
const APPROVED_REPORT_LINES: Readonly<Record<string, string>> = Object.freeze({
  "v4.investigation.heading.answer": "The answer",
  "v4.investigation.heading.wouldChange": "What would change it",
  "v4.investigation.heading.howItWent": "How the investigation went",
  "v4.investigation.heading.stillOpen": "What is still open",
  "v4.investigation.heading.sources": "Sources",
  "v4.investigation.shortened": "The investigation was very large, so the report was written from a shortened version of it.",
  "v4.investigation.noStory": "We couldn't write a short answer this time. The parts below show everything the AIs found."
});

/** Owner Q20: labels drafted for the owner's click-test, not yet approved. */
const DRAFTED_UNTIL_CLICK_TEST: readonly string[] = Object.freeze([
  // The wave-2 checks (4 Nov): a public dig's period line without the map's "you can still finish your report" (journey-f8's
  // own "of today" / "of this month"; the week's form follows them). Owner question.
  "v4.public.dig.period.PERSON_DAY",
  "v4.public.dig.period.PERSON_WEEK",
  "v4.public.dig.period.PERSON_MONTH",
  // ACCESS-13 (the wave-2 checks): "Light or dark"'s name also says what a press does. Owner question.
  "v4.header.menu.themeToDark",
  "v4.header.menu.themeToLight",
  "v4.web.noSearch",
  "v4.web.noSearch.noReason",
  "v4.web.switchedOff",
  "v4.web.previewOnly",
  "v4.web.fewerReaders",
  "v4.web.otherPages",
  "v4.web.addResearched",
  "v4.web.addResearchedHint",
  "v4.web.researched.ADDING",
  "v4.web.researched.tryAgain",
  "v4.web.researched.waitsForReset",
  "v4.web.researched.READING",
  "v4.web.researched.ADDS",
  "v4.web.researched.ADDS_NOTHING",
  "v4.web.researched.FAILED",
  "v4.room.blockedUntil",
  "v4.suggest.kind.CONTRADICTING",
  "v4.suggest.kind.UNDOCUMENTED",
  "v4.suggest.kind.NEEDS_MORE_WEB",
  "v4.suggest.kind.HELPS_MAIN_QUESTION.FOR",
  "v4.suggest.kind.HELPS_MAIN_QUESTION.AGAINST",
  "v4.suggest.ownView",
  // Dig model revision (W2-7): the page labels of section 5.5 (no search-words box: the owner corrected that on 30 Oct).
  "v4.view.heading",
  "v4.rewrite.changedSince.one",
  "v4.rewrite.changedSince.other",
  "v4.rewrite.changedSinceReport",
  "v4.rewrite.whatChanged",
  "v4.rewrite.rewrittenOnce",
  "v4.rewrite.rewrittenMany",
  "v4.rewrite.showEarlier",
  "v4.rewrite.hideEarlier",
  "v4.rewrite.before",
  "v4.rewrite.seeDigPoints",
  "v4.rewrite.openDigMap",
  "v4.rewrite.state.WRITING",
  "v4.rewrite.state.NO_CHANGE",
  "v4.rewrite.state.FAILED",
  "v4.rewrite.changedBelow",
  "v4.rewrite.digCard.CHANGED",
  "v4.rewrite.digCard.NO_CHANGE",
  "v4.rewrite.digCard.RUNNING",
  "v4.rewrite.digCard.WAITING",
  "v4.rewrite.digCard.FAILED",
  // Dig model revision W4-6 (31 Oct): the labels the map needed beyond 5.5's, drafted for the click-test (owner C2b): a dig
  // card once done (no path rewritten, rewriting, the rewrite failed), a dig paused at the month wall, a failed rewrite's
  // short line on a path's card, hiding the dig's points again, where the dig's points are when this page has not read
  // them, and the name of a dig's trail.
  "v4.rewrite.digCard.DONE",
  "v4.rewrite.digCard.REWRITING",
  "v4.rewrite.digCard.REWRITE_FAILED",
  "v4.rewrite.digCard.PAUSED",
  "v4.rewrite.card.FAILED",
  "v4.rewrite.hideDigPoints",
  "v4.rewrite.digPointsElsewhere",
  "v4.nest.trailLabel",
  "v4.nest.trailRoot",
  "v4.nest.level",
  "v4.nest.deepest",
  "v4.nest.tooDeep",
  // R22 W3-8: the two dig refusals with their own codes (DIG_PICKS_ONE_PATH, DIG_FREE_PICKS_MAX), drafted for the click-test.
  "v4.nest.picksOnePath",
  "v4.nest.freePicksMax",
  // The owner's screen review (3 Nov), the quota track (C2a, C2b): lines written beyond the record's own words, for the
  // click-test. The header past 100% (map-f9 says "more than today's quota", not the pill's words) and the name of its
  // detail list (public-d3 A); the week's and the month's forms of the record's "of today" lines (read-f19 names "of this
  // week" and "of this month" and leaves the words to the owner); the month's "on {date}" for a dig button that waits
  // (journey-f15 writes only "after 08:00"); the two Quick look / Thorough hints (read-f20: the wording is the owner's;
  // Thorough's no longer names today, the period is said once by the switch).
  "v4.header.over.PERSON_DAY",
  "v4.header.over.PERSON_WEEK",
  "v4.header.over.PERSON_MONTH",
  "v4.header.over.PERSON_GRANT",
  "v4.header.quotaDetails",
  "v4.room.startShare.PERSON_WEEK",
  "v4.room.startShare.PERSON_MONTH",
  "v4.dig.period.PERSON_WEEK",
  "v4.dig.on",
  "v4.undo.digShare.PERSON_WEEK",
  "v4.undo.digShare.PERSON_MONTH",
  "v4.debate.questionShare.PERSON_WEEK",
  "v4.debate.questionShare.PERSON_MONTH",
  "v4.panel.modeHint.quick",
  "v4.panel.modeHint.thorough",
  "v4.digPage.lookedInto",
  "v4.digPage.rewrote",
  "v4.digPage.backToPath",
  "v4.digPage.rewriting",
  "v4.changes.digChanged",
  "v4.changes.digNoChange",
  "v4.report.pathsChangedHeading",
  // The money rule (owner, 31 Oct): the estimate before a new question, the borrow notice, new starts after the reset,
  // the month pause and Continue.
  "v4.room.startShare",
  "v4.money.borrowed.PERSON_DAY",
  "v4.money.borrowed.PERSON_WEEK",
  "v4.money.startsWait.PERSON_DAY",
  "v4.money.startsWait.PERSON_WEEK",
  "v4.money.startsWait.PERSON_MONTH",
  "v4.debate.state.PAUSED_MONTH",
  "v4.money.paused",
  "v4.money.pausedReady",
  "v4.money.continue",
  "v4.money.continueNote",
  "v4.money.continuing",
  "v4.money.continueTooEarly",
  // Perplexity plan W3-4 (31 Oct): choosing what to dig on the map — the two lines a dig's question asks a suggestion and
  // the person's own view with, the panel's "Choose what to dig" (the one-path rule, Free's cap, edits, own view), and
  // Continue's failure line. No search-words label (the owner's correction of 31 Oct).
  "v4.digText.suggestion",
  "v4.digText.ownView",
  "v4.suggest.heading",
  "v4.suggest.onePath",
  "v4.suggest.otherPath",
  "v4.suggest.full",
  "v4.suggest.empty",
  "v4.suggest.tooLong",
  "v4.suggest.pick",
  "v4.suggest.none",
  "v4.suggest.more",
  "v4.suggest.editLabel",
  "v4.suggest.editDone",
  "v4.suggest.edited",
  "v4.suggest.cancel",
  "v4.suggest.ownViewLabel",
  "v4.suggest.ownViewAdd",
  "v4.suggest.remove",
  "v4.money.continueFailed",
  // R22 W5-1 (31 Oct): the final report's versions, its waits, a failed version, "Keep digging", and the map's answer from
  // the current version with the first debate's answer one click away (owner Q-D11). "Write my report" is the rail's key.
  "v4.investigation.versions",
  "v4.investigation.versionCurrent",
  "v4.investigation.version",
  "v4.investigation.waitingDigs.one",
  "v4.investigation.waitingDigs.other",
  "v4.investigation.failed",
  "v4.investigation.keepDigging",
  "v4.investigation.fromReport",
  "v4.investigation.firstAnswer",
  // The owner's screen review of 3 Nov (OWNER-PICKS-2026-11-03.md, "report"): the report page's states and presses, drafted
  // from the approved fix texts for the click-test. No time is promised that nobody measured (the old "5 to 10 minutes" went).
  "v4.report.share",
  "v4.report.shareButton",
  "v4.report.copyLink",
  "v4.report.linkCopied",
  "v4.report.copyFailed",
  "v4.report.pdfMaking",
  "v4.report.pdfFailed",
  "v4.report.notFound",
  "v4.report.loadingReport",
  "v4.report.notWrittenYet",
  "v4.report.firstAnswerNotReport",
  "v4.investigation.versionWritten",
  "v4.investigation.heading.paths",
  "v4.investigation.onlyAnswer",
  "v4.investigation.loadFailed",
  "v4.investigation.startUnconfirmed",
  "v4.investigation.reopenUnconfirmed",
  "v4.investigation.writingSince",
  "v4.investigation.waitingDig",
  "v4.investigation.versionWriting",
  "v4.investigation.downloadVersion",
  "v4.investigation.slow",
  "v4.investigation.checkAgain",
  "v4.investigation.writeAgain",
  "v4.investigation.digMore",
  "v4.web.freeOnPaper",
  // The review of the fix branch (4 Nov): lines the builders wrote beyond the record's approved fix texts, shown to the owner
  // at the click-test. The report's line when this visit cannot know when writing started (review F1); the missing-answer
  // line without "You can dig or write your report now." where no dig can start (review F10); the team grant's header word;
  // the public page's dig credit, which the record words "A dig by Quiet Heron changed …" (dig-f25); the problem
  // report's thank-you and its two "say more" lines (public-f5 gives no words).
  "v4.investigation.writing",
  "v4.panel.noShortAnswerNoDig",
  "v4.header.used.PERSON_GRANT",
  "v4.public.digFrom",
  "v4.public.digFromGone",
  "v4.public.digFromAnother",
  "v4.public.flag.thanks",
  "v4.public.flag.whereMore",
  "v4.public.flag.claimMore",
  // The wave-1 review fixes (4 Nov 2026), drafted where the owner's record has no words: the grey line under Next for a
  // signed-out visitor until the start-step's sign-in panel lands (the record's "Your question stays here." is true only
  // with that panel), a dig still starting after a minute, a dig sent after its map was closed that met a screen nobody
  // saw, a dig whose start could not be confirmed, the outline's fold button, and the sideways-scroll hint without a side
  // (right-to-left pages).
  "v4.ask.signInFirst",
  "v4.undo.sendingSlow",
  "v4.dig.notStartedAway",
  "v4.dig.unconfirmed",
  "v4.outline.fold",
  "v4.outline.unfold",
  "v4.map.scrollHint",
  // The browser check of the fix branch (4 Nov): the report header's short "Map" on phones, where the record's
  // "← Back to the map" (report-f12) was cut off; the record gives no short form.
  "v4.report.backToMapShort",
  // ask-d6 A (owner's screen review, 3 Nov): the round account button's name for screen readers (and its menu's). The menu's
  // own words ("Language", "Light or dark", "Settings", "Sign out") are the record's; this one is not, and "My maps" is an
  // owner question (below: ask-d6 A drew "My questions").
  "v4.header.account",
  // V4 screen review (3 Nov), map-d4 A: a point's sources folded into one line. The drawn option said "From 3 pages: …";
  // journey-f23 says nothing counts sources, so the line names every site and counts nothing ("From iea.org and
  // oecd-nea.org"; an owner question until the click-test).
  "v4.web.sourcesFrom",
  // The owner's screen review of 3 Nov (dig-d1 B): the two words a running dig's steps need that the record does not give,
  // the list's name for screen readers and the hidden word after a step that is done.
  "v4.digLive.stepsLabel",
  "v4.digLive.stepDone",
  // The owner's screen review of 3 Nov, report-d1 A (the strip "Write my report" turns into on the map) and report-f15 (on
  // Free, only the trust words that can appear there): the record describes these lines but gives no words for them.
  // "Write it", "Not yet", "This question is public, so your report will be public too." and "Digging opens again when
  // your report is written." are the record's own words and are not drafts.
  "v4.reportStrip.covers",
  "v4.reportStrip.coversNoDigs",
  "v4.reportStrip.share",
  "v4.reportStrip.digsWait",
  "v4.report.checkedWordsIntroFree",
  // The owner's screen review of 3 Nov, public-d1 / public-f4 / public-f9 (wave 2): the lines the record does not word. The way back from the public
  // page's read-only map, the phone menu that holds "Report a problem", and the ready line for a report someone else started (the page knows of it
  // only from the server). "For", "Against", "Explore the map" and "Check again" are the record's own words.
  "v4.public.mapBack",
  "v4.public.menu",
  "v4.public.report.ready",
  // The owner's screen review of 3 Nov, wave 2 (public-f11, public-d2 A, public-f26, journey-f20): the public dig flow's and the public marks' lines the
  // record does not word ("the exact sentences go into the wording card"). The record's own words (Dig done, Checked, On the public page, See it on the
  // page, Kept with you…, Confirmed…, Or write your own, Someone dug near here on…, Public, See its page, Copy link, This will be public.) are pinned in
  // tests/unit/public-lane.test.ts.
  "v4.public.dig.chipsLabel",
  // The wave-2 review fixes (4 Nov 2026), drafted where the record has no words: the visible reason under a public dig box's
  // Start while nothing is picked (journey-f14), a public dig sent after its page was closed that met a screen nobody saw,
  // and one whose start could not be confirmed (the map's own lines name the map), and the running dig's empty findings
  // list (the drawn line comes from a path card of the wait, not from dig-d1).
  "v4.public.dig.pickFirst",
  "v4.public.dig.writeFirst",
  "v4.public.dig.notStartedAway",
  "v4.public.dig.unconfirmed",
  "v4.digLive.foundNone",
  "v4.public.digCard.running",
  "v4.public.digCard.stopReached",
  "v4.public.digCard.stopOpen",
  "v4.public.digCard.before",
  "v4.public.digCard.after",
  "v4.public.digCard.removed",
  "v4.publicMark.linkCopied",
  "v4.publicMark.copyFailed",
  "v4.publicMark.WILL_BE_PUBLIC",
  "v4.publicMark.BEING_CHECKED",
  "v4.publicMark.KEPT_PRIVATE",
  "v4.publicMark.addsToPublic",
  // The 3-4 Nov screen-review build's own words (checked line by line against OWNER-PICKS-2026-11-03.md on 4 Nov): the
  // record gives no words for these places, so they are drafts, held here until the owner approves them at the click-test.
  "v4.report.backToQuestion",
  "v4.ask.usedUp.PERSON_WEEK",
  "v4.maps.empty",
  "v4.maps.ask",
  "v4.maps.failed",
  "v4.maps.more",
  "v4.debate.askAgainNoteQuestion",
  "v4.debate.digFailedBackNote",
  "v4.state.WAITING.noTime",
  "v4.state.SHORT_BREAK.noTime",
  "v4.state.PAUSED.canContinue",
  "v4.wait.choices",
  "v4.report.eyebrow",
  "v4.report.pathsHeading",
  "v4.undo.still",
  "v4.undo.more",
  "v4.bar.goodTimeClose",
  "v4.dig.picksClearedUndoLabel",
  "v4.dig.picksClearedStill",
  "v4.dig.picksClearedAnnounce",
  "v4.map.legendLooking",
  "v4.map.legendNew",
  "v4.map.level",
  "v4.map.digWholePath",
  "v4.map.openGround",
  "v4.sure.none",
  "v4.sure.mixed",
  "v4.sure.SURE.most",
  "v4.sure.STILL_ARGUED.most",
  "v4.sure.DIDNT_HOLD.all",
  "v4.sure.DIDNT_HOLD.most",
  "v4.sure.argued.some",
  "v4.sure.fell.one",
  "v4.sure.fell.some",
  "v4.result.card.NOTHING_NEW",
  "v4.result.box.NOTHING_NEW",
  "v4.rail.goodTimeStarDone",
  "v4.rail.goodTimeHint",
  "v4.answerCard.region",
  "v4.answerCard.folded",
  "v4.answerCard.fold",
  "v4.answerCard.first",
  "v4.answerCard.firstOn",
  "v4.answerCard.readWhole",
  "v4.answerCard.updated.PATH_REWRITE",
  "v4.answerCard.updated.CHILD_PATH",
  "v4.phone.position",
  "v4.phone.openMap",
  "v4.rewrite.youAsked",
  "v4.digsDid.news.HOLDS",
  "v4.digsDid.news.FAILED",
  "v4.digsDid.news.FAILED.noLine",
  "v4.digsDid.news.ONE_DONE",
  "v4.digsDid.news.ANSWER",
  "v4.digsDid.news.OTHER",
  "v4.ready.digPage",
  "v4.ready.report",
  "v4.ready.close",
  "v4.tour.label",
  "v4.suggest.leaveStay",
  "v4.suggest.leaveGo",
  "v4.public.addedByGone",
  "v4.public.oneMoment",
  "v4.public.dig.termsMore",
  "v4.public.flag.NOT_FOUND",
  "v4.public.dig.notJoined",
  // The same check (4 Nov): lines whose words differ from the record, held as owner questions until the click-test. The
  // account menu's "My maps" (ask-d6 A drew "My questions" before ask-d5 B named the list "Your maps"); the dig result
  // box's two sentences as drawn in dig-d4 (journey-f10's one win sentence is "Confirmed: the answer holds."); the map's
  // "+N more" (map-f10 names "+3 open", but the fold also holds digs and suggestions since map-f22); the rail's failed
  // digs (journey-f22's "Didn't finish" sits there beside another state word); one point not checked (map-f28 words only
  // the plural); and a signed-out visitor's lead before "Create a free account · Sign in" (public-f3, then r2-21 A).
  "v4.maps.menu",
  "v4.result.box.CONFIRMED_HOLDS",
  "v4.result.box.CONFIRMED",
  "v4.map.moreOpen",
  "v4.rail.digsFailed.one",
  "v4.rail.digsFailed.other",
  "v4.panel.unchecked.one",
  "v4.public.signedOut.dig",
  "v4.public.signedOut.report",
  // The final check of that list (5 Nov): two more of the build's own words (ask-f4 words only the day and month pills;
  // no record words a pause whose date is unknown), and lines whose words are only in the drawings the owner picked from
  // or join two record phrases. REVIEW_LINES below keeps their drawn words; the owner confirms them at the click-test.
  "v4.header.used.PERSON_WEEK",
  "v4.state.PAUSED.noDate",
  "v4.report.digWait",
  "v4.digsDid.line.CORRECTED",
  "v4.digsDid.line.ADDED_TO",
  "v4.digsDid.line.CONFIRMED",
  "v4.dig.started",
  "v4.debate.state.HOLDING.noTime",
  "v4.panel.found",
  "v4.digLive.found",
  "v4.digLive.pathNow",
  // V4 start step, Task 63 (draft wording): the label over the person's own words in a public path debate's row.
  "v4.public.pathOwnWords",
  // V4 start step, Task 61 (P6): the map's chosen paths, their wait and their panel; wait-d1 C's, wait-f16's and the plan's
  // words, and draft wording; every v4.paths.* key waits for the click-test. Then r2-1 A's five rewordings ("path" on the map).
  "v4.paths.looking",
  "v4.paths.failed",
  "v4.paths.answerSoFar",
  "v4.paths.asks",
  "v4.paths.viewpoints",
  "v4.paths.yourWords",
  "v4.paths.whatChanged",
  "v4.paths.more.one",
  "v4.paths.more.other",
  "v4.paths.moreHeading",
  "v4.paths.moreHint",
  "v4.paths.moreNew",
  "v4.paths.digThis",
  "v4.paths.alsoRaised",
  "v4.paths.tag.TOGETHER",
  "v4.paths.tag.COMBINED",
  "v4.paths.tag.EDITED",
  "v4.paths.tag.ADDED",
  "v4.paths.trustWord",
  "v4.paths.mainTrust",
  "v4.paths.running",
  "v4.paths.step.FINDING_SOURCES",
  "v4.paths.step.ARGUING",
  "v4.paths.step.CHECKING",
  "v4.paths.dots",
  "v4.paths.dotsNote",
  "v4.paths.lookingPanel",
  "v4.paths.moreLater",
  "v4.paths.choosing",
  "v4.paths.carryOn.ANSWER",
  "v4.paths.carryOn.DIGS",
  "v4.paths.carryOn.DIGS_FREE",
  "v4.paths.carryOn.REPORT",
  "v4.paths.carryOn.nothingToDo",
  "v4.map.pathUntitled",
  "v4.panel.kind.path",
  "v4.map.noPaths",
  "v4.panel.pathNoMore",
  "v4.panel.noOpenPath",
  // V4 start step, Task 62 (wait-d1, map-f4, answer Q15, wait-f10): drafts until the click-test.
  "v4.paths.filled",
  "v4.paths.movedUp",
  "v4.paths.yourPaths",
  "v4.paths.writingAnswer",
  "v4.ready.shortAnswer",
  // V4 start step, Task 68 (draft wording): a plan change since Next (splice ruling), and fewer allowed paths after a site
  // update (owner answer Q8). There is no out-of-date key: suggestions never go out of date by time.
  "v4.start.readAgainNeeded",
  "v4.start.narrowed.one",
  "v4.start.narrowed.other",
  // V4 start step, Task 69 (choose-f14, choose-f7, journey-f8, r2-2; draft wording, combine's share owner answer Q7): the
  // one share line per path count, its grey change, and the shares beside combine and look wider (no period named there).
  "v4.start.share.day",
  "v4.start.share.month",
  "v4.start.shareUp",
  "v4.start.shareDown",
  "v4.start.combineFrees.one",
  "v4.start.combineFrees.other",
  "v4.start.lookWider",
  // V4 start step, Task 70b (read-f13, ask-f2, r2-4, ask-f8; the spec's and the record's words, shown at the click-test): Next's
  // "Reading…" after the consent, "Getting ready…" while the plan is read, the grey quota line under Next, and the line under
  // Next after a declined consent with its link.
  "v4.ask.reading",
  "v4.ask.gettingReady",
  "v4.ask.readingUsesQuota",
  "v4.ask.consentDeclined",
  "v4.ask.consentShowAgain",
  // V4 start step, Task 75 (read-d5, choose-f16, read-f24, choose-f4, choose-f10, r2-3; the spec's words, shown at the
  // click-test): the bottom bar's "You'll get", its path count, How wide, Start's words, the carry-on box, the ready note
  // and the phone's Options sheet.
  "v4.start.youGet.one",
  "v4.start.youGet.other",
  "v4.start.youGetExpert.one",
  "v4.start.youGetExpert.other",
  "v4.start.pathCount.one",
  "v4.start.pathCount.other",
  "v4.start.howWide",
  "v4.start.pathsComing",
  "v4.start.start",
  "v4.start.writingWait",
  "v4.start.carryOn",
  "v4.start.readyNote",
  "v4.start.options",
  "v4.start.optionsDone",
  // V4 start step, Task 75b (ask-d2; the owner's words, record :168, shown at the click-test): the level block's button that
  // opens the honest note. Its grey line v4.ask.levelKept is not here: the owner approved it on 5 Nov (answer Q15).
  "v4.ask.levelWhat",
  // V4 start step, Task 72 (choose-d3, choose-f6, choose-f7, choose-d4; the spec's words and draft wording, shown at the
  // click-test): the path rows, their chips, tags and ⋯ menus, Rewrite and its question, and the combine line.
  "v4.start.row.a11y",
  "v4.start.row.viewpoints.one",
  "v4.start.row.viewpoints.other",
  "v4.start.row.notSelected",
  "v4.start.row.picked",
  "v4.start.row.together.other",
  "v4.start.row.more",
  "v4.start.chip.a11y",
  "v4.start.tag.PUT_TOGETHER_BY_US",
  "v4.start.tag.COMBINED_BY_YOU",
  "v4.start.tag.ADDED_BY_YOU",
  "v4.start.tag.ADDED_WHEN_WIDENED",
  "v4.start.tag.new",
  "v4.start.tag.split",
  "v4.start.menu.rewrite",
  "v4.start.menu.combineWith",
  "v4.start.menu.split",
  "v4.start.menu.moveUp",
  "v4.start.menu.moveDown",
  "v4.start.menu.remove",
  "v4.start.chipMenu.label",
  "v4.start.chipMenu.moveTo",
  "v4.start.chipMenu.ownPath",
  "v4.start.chipMenu.remove",
  "v4.start.rewrite.open",
  "v4.start.rewrite.title",
  "v4.start.rewrite.wording",
  "v4.start.rewrite.save",
  "v4.start.rewrite.cancel",
  "v4.start.writing",
  "v4.start.reword.changed",
  "v4.start.reword.rewrite",
  "v4.start.reword.keep",
  "v4.start.combineWith.pick",
  "v4.start.combineWith.rowA11y",
  "v4.start.combineWith.cancel",
  // V4 start step, Task 55e (spec §4.4; draft wording, shown at the click-test): the main answer updated because a dig of a path
  // left out before Start added it to the question.
  "v4.mainAnswer.trigger.PATH_ADDED",
  "v4.answerCard.updated.PATH_ADDED",
  // V4 start step, Task 73 (read-d4, choose-d1, choose-f2, choose-f4, choose-f5, choose-f7, choose-f8, choose-f11, choose-f15,
  // choose-f16; the spec's words and draft wording, shown at the click-test; the refusals in the owner's answer "Four per path"
  // A words): the card's title and lines, the waiting band, why a list is missing, the notices, your own path, the full-list
  // choice and the refusals.
  "v4.start.title",
  "v4.start.freeLine.one",
  "v4.start.freeLine.other",
  "v4.start.reloadLine",
  "v4.start.phase.CHECKING",
  "v4.start.phase.LANGUAGE_CHOICE",
  "v4.start.phase.READING",
  "v4.start.phase.MERGING",
  "v4.start.answered",
  "v4.start.morePlaces",
  "v4.start.readyAnnounce.one",
  "v4.start.readyAnnounce.other",
  "v4.start.lateIdeas",
  "v4.start.lateIdeasAnnounce",
  "v4.start.none.PASSING",
  "v4.start.none.NOT_OFFERED",
  "v4.start.none.TOO_SLOW",
  "v4.start.none.OFFLINE",
  "v4.start.none.SIGNED_OUT",
  "v4.start.none.QUOTA",
  "v4.start.refused",
  "v4.start.answersFolded",
  "v4.start.showQuestions",
  "v4.start.undo",
  "v4.start.combinedAnnounce.one",
  "v4.start.combinedAnnounce.other",
  "v4.start.combinedAnnounceMonth.one",
  "v4.start.combinedAnnounceMonth.other",
  "v4.start.combinedAnnounceNoShare.one",
  "v4.start.combinedAnnounceNoShare.other",
  "v4.start.notice.combined",
  "v4.start.notice.combineFailed",
  "v4.start.notice.madeRoom.one",
  "v4.start.notice.madeRoom.other",
  "v4.start.notice.narrowed.one",
  "v4.start.notice.narrowed.other",
  "v4.start.own.label",
  "v4.start.own.hint",
  "v4.start.own.add",
  "v4.start.own.finding",
  "v4.start.own.fits",
  "v4.start.own.addThere",
  "v4.start.own.ownPath",
  "v4.start.full.wider",
  "v4.start.full.widest",
  "v4.start.full.free",
  "v4.start.full.addTo",
  "v4.start.full.swap",
  "v4.start.full.path",
  "v4.start.full.cancel",
  "v4.start.refusal.VIEWPOINTS_FULL",
  "v4.start.refusal.OWN_WORDS_FULL",
  "v4.start.refusal.EMPTY",
  "v4.start.refusal.TOO_LONG",
  "v4.start.refusal.LAST_PATH",
  // V4 start step, Task 74 (choose-f18, choose-f6, choose-f7; the spec's words and draft wording, shown at the click-test):
  // "+ N more to explore" and its drawer, "Another way to see it" with its kinds and "Make this my question", the one-tap
  // suggestions, and the lines that say where a new path went.
  "v4.start.more.open",
  "v4.start.more.title",
  "v4.start.more.done",
  "v4.start.more.useful",
  "v4.start.more.directions",
  "v4.start.more.byArea",
  "v4.start.more.addedByYou",
  "v4.start.lookInto",
  "v4.start.added.to",
  "v4.start.added.asPath",
  "v4.start.ways.title",
  "v4.start.ways.kind.CHOICE_NOT_WEIGHED",
  "v4.start.ways.kind.EITHER_OR",
  "v4.start.ways.kind.WHAT_WOULD_CHANGE_IT",
  "v4.start.ways.kind.OTHER_READING",
  "v4.start.ways.addTo",
  "v4.start.ways.addAsPath",
  "v4.start.ways.makeMine",
  "v4.start.ways.swapped",
  "v4.start.ways.swappedNow",
  "v4.start.ways.noRoom",
  "v4.start.suggest.label",
  "v4.start.suggest.combine",
  "v4.start.suggest.combineButton",
  "v4.start.suggest.keepApart",
  "v4.start.suggest.fits",
  "v4.start.suggest.addTo",
  "v4.start.suggest.notNow",
  // V4 start step, Task 76 (r2-6, choose-f15, ask-f7; 4 Nov night ask-f13, the owner's words of record :239): step 2's calm
  // no-questions line, Free's one joined line, the screens' way back and "Use my words instead", shown at the click-test.
  "v4.read.noQuestions",
  "v4.read.freeJoined",
  "v4.ask.editMyQuestion",
  "v4.ask.useMyWords",
  // V4 start step, Task 76b (answers Q11 and Q13; 4 Nov night read-f3: the record's example words and the coordinator's):
  // Start's Undo note, its line read out once and its confirmation, and the two lines of a plan read at the press.
  "v4.start.undo.note",
  "v4.start.undo.noteNoShare",
  "v4.start.undo.announce",
  "v4.start.undo.done",
  "v4.ask.checkingPlan",
  "v4.ask.planUnknown",
  // V4 start step, Task 76c (read-f2, choose-f2, choose-f21; the spec's words for answers Q2 and Q3): step 1's line after Back,
  // the logo's question, and a started question's line with its map, shown at the click-test.
  "v4.ask.pathsKept",
  "v4.ask.leavePaths",
  "v4.ask.started",
  "v4.ask.openItsMap",
  // V4 start step, Task 76h (ask-d3: the owner's words of 4 Nov night; read-f8: the record's example, approved at the
  // click-test): the clarifying call's slow-wait lines, its "Try again", and Free's cap line.
  "v4.read.clarifyStill",
  "v4.read.clarifyLonger",
  "v4.read.clarifyTryAgain",
  "v4.read.capReached",
  // V4 start step, Task 76g (read-f1, the owner's words of record :303): a new reading's line for an answer it set aside, and
  // its button, shown at the click-test.
  "v4.read.setAside",
  "v4.read.putBack"
]);

function sources(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push({ path: relative(ui, full), text: readFileSync(full, "utf8") });
    }
  };
  for (const dir of v4Dirs) walk(join(ui, dir));
  return out;
}

describe("V4 catalogue keys", () => {
  it("every key in messages/en/v4.json is a v4 key with English text", () => {
    for (const [key, value] of Object.entries(catalog)) {
      expect(key.startsWith("v4."), key).toBe(true);
      expect(typeof value === "string" && value.trim().length > 0, key).toBe(true);
    }
  });

  it("every literal v4 key the V4 code reads exists", () => {
    const missing: string[] = [];
    for (const { path, text } of sources()) {
      // storage.ts names this browser's storage slots ("v4.seen.<id>", …), which share the prefix but are not text keys.
      if (path === "lib/v4/storage.ts") continue;
      for (const match of text.matchAll(/["'`](v4\.[A-Za-z0-9_.]+)["'`]/g)) {
        const key = match[1]!;
        // A plural read names its stem; the catalogue holds the .one/.other forms.
        if (key in catalog || `${key}.other` in catalog) continue;
        missing.push(`${path}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every key built from a shared word list exists for every word", () => {
    const built = [
      ...TRUST_WORDS.flatMap((word) => [`v4.trust.${word}`, `v4.trustCount.${word}`]),
      // W2-6: the new "Sure" basis reads the approved "v4.web.sureBasis"; every other basis its "v4.basis.<BASIS>".
      ...TRUST_BASES.map(basisKey),
      ...["HELD_UP", "PARTLY_HELD", "FELL", "SET_ASIDE"].map((fate) => `v4.fate.${fate}`),
      ...READING_LEVELS.map((level) => `v4.readingLevel.${level}`),
      ...DIG_MODES.map((mode) => `v4.digMode.${mode}`),
      // V4 start step, Task 55e: the main answer's line and the answer card's line for every trigger, PATH_ADDED's included.
      ...MAIN_ANSWER_TRIGGERS.flatMap((trigger) => [`v4.mainAnswer.trigger.${trigger}`, `v4.answerCard.updated.${trigger}`])
    ];
    expect(built.filter((key) => !(key in catalog))).toEqual([]);
    // Every key built at run time from a literal stem ("v4.x.${…}") has at least one catalogue key under that stem, and a
    // stem that words open-question kinds words all three of them.
    for (const { path, text } of sources()) {
      for (const match of text.matchAll(/`(v4\.[A-Za-z0-9_.]+\.)\$\{[^}]*\}`/g)) {
        const stem = match[1]!;
        expect(Object.keys(catalog).some((key) => key.startsWith(stem)), `${path}: ${stem}…`).toBe(true);
        // STILL_ARGUED is also a trust word, so only the two kinds of its own mark a stem as worded per kind.
        if (!(`${stem}OBJECTION` in catalog) && !(`${stem}WOULD_CHANGE` in catalog)) continue;
        const absent = OPEN_QUESTION_KINDS.filter((kind) => !(`${stem}${kind}` in catalog));
        expect(absent, `${path}: ${stem}<kind>`).toEqual([]);
      }
    }
  });

  it("the owner-approved web and dig lines are in the catalogue word for word", () => {
    // Perplexity plan W1-7 (2026-10-30): PERPLEXITY-DESIGN.md §7.1 "User-facing words", all approved by the owner; the dig
    // line shows a PERCENTAGE of today (owner Q14). "Write my report" is the rail's existing key.
    expect(Object.fromEntries(Object.keys(APPROVED_LINES).map((key) => [key, catalog[key]]))).toEqual(APPROVED_LINES);
  });

  it("the drafted labels (owner Q20) are all there until the owner approves them at the click-test", () => {
    // Owner Q20 (2026-10-30): these labels are drafted in plain English and approved by the owner at the click-test, in
    // place on the map (checkpoints C1 and C2). Until then they are DRAFTS: change their words here and in v4.json together.
    expect(DRAFTED_UNTIL_CLICK_TEST.filter((key) => !(key in catalog))).toEqual([]);
    expect(DRAFTED_UNTIL_CLICK_TEST.filter((key) => key in APPROVED_LINES || key in APPROVED_VIEW_LINES || key in APPROVED_REPORT_LINES)).toEqual([]);
    expect(new Set(DRAFTED_UNTIL_CLICK_TEST).size).toBe(DRAFTED_UNTIL_CLICK_TEST.length);
  });

  it("the approved point-of-view lines (draft 5.3) are in the catalogue word for word, one per outcome and scope", () => {
    expect(Object.fromEntries(Object.keys(APPROVED_VIEW_LINES).map((key) => [key, catalog[key]]))).toEqual(APPROVED_VIEW_LINES);
    const built = POINT_OF_VIEW_OUTCOMES.flatMap((outcome) => outcome === "NOT_SETTLED"
      ? [`v4.view.${outcome}`]
      : POINT_OF_VIEW_SCOPES.map((scope) => `v4.view.${outcome}.${scope}`));
    expect(built.filter((key) => !(key in APPROVED_VIEW_LINES))).toEqual([]);
  });

  it("W3-4: the map's dig lines are the drafts and approved lines the page reads, and say the plan's caps", () => {
    // Free's cap is read from the contract (FREE_DIG_PICKS_MAX) into the line, never written into it.
    expect(catalog["v4.suggest.freeCap"]).toContain("{count}");
    // A dig's question asks the person's own view as theirs, never as a finding (approved line v4.view.asYours).
    expect(catalog["v4.digText.ownView"]).toMatch(/not taken as a finding/u);
    for (const key of ["v4.digText.suggestion", "v4.digText.ownView"]) expect(catalog[key], key).toContain("{text}");
    // Users see shares of their quota, never prices: no money sign or amount in any V4 line.
    expect(Object.entries(catalog).filter(([, value]) => /[$€£¢]|\b(?:USD|EUR|RON|lei|cents?|dollars?)\b/iu.test(value))).toEqual([]);
  });

  it("W3-8: the two dig refusals say nothing was used, and Free's reads its cap from the contract into {count}", () => {
    for (const key of ["v4.nest.picksOnePath", "v4.nest.freePicksMax"]) expect(catalog[key], key).toMatch(/Nothing was used from your quota\./u);
    expect(catalog["v4.nest.freePicksMax"]).toContain("{count}");
    expect(catalog["v4.nest.freePicksMax"]).not.toMatch(/\d/u);
  });

  it("no search-words label is drafted (the owner's correction of 30 Oct), and the level labels name DIG_LEVEL_MAX", () => {
    expect(Object.entries(catalog).filter(([key, value]) => /search ?words/iu.test(`${key} ${value}`))).toEqual([]);
    const levelLabels = ["v4.nest.level", "v4.nest.deepest", "v4.nest.tooDeep"];
    for (const key of levelLabels) expect(catalog[key], key).toContain(String(DIG_LEVEL_MAX));
  });

  it("the report page (screen review, 3 Nov): no unmeasured time, no count of points, Free's paper line is the honest half", () => {
    // report-f7, f8 and the record's code facts: no "minutes" figure until a timing run measures one.
    const report = Object.entries(catalog).filter(([key]) => key.startsWith("v4.report.") || key.startsWith("v4.investigation."));
    expect(report.filter(([, value]) => /\b\d+\s*(?:to|-|–)\s*\d+\s*minutes?\b|\bminutes?\b/iu.test(value))).toEqual([]);
    // report-f18: the checking sentence counts nothing.
    expect(catalog["v4.report.checkedSecondAi"]).toBe("A second AI checked each point. Points it did not check are shown in grey.");
    expect(Object.keys(catalog).filter((key) => key.startsWith("v4.report.pathUnchecked"))).toEqual([]);
    // Round 2 r2-13 (A): on paper and in the PDF, Free's web line is the first, honest half of the approved E3b line.
    expect(catalog["v4.web.free"]!.startsWith(catalog["v4.web.freeOnPaper"]!.replace(/\.$/u, ""))).toBe(true);
    expect(catalog["v4.web.freeOnPaper"]).toBe("Not checked on the web.");
  });

  it("W5-1: the final report's approved headings, F13 and N14 lines are in the catalogue word for word", () => {
    expect(Object.fromEntries(Object.keys(APPROVED_REPORT_LINES).map((key) => [key, catalog[key]]))).toEqual(APPROVED_REPORT_LINES);
    // N14 is the same approved sentence the debate's own report says when its story could not be written.
    expect(catalog["v4.investigation.noStory"]).toBe(catalog["v4.report.storyUnavailable"]);
    // The drafted lines name a version by its number and a wait by how many digs: no engine word, no score.
    const drafts = DRAFTED_UNTIL_CLICK_TEST.filter((key) => key.startsWith("v4.investigation.")).map((key) => catalog[key]!);
    expect(drafts.filter((line) => /\b(?:score|strength|threshold|READY|WRITING|FAILED|checker|GLM|Haiku)\b/u.test(line))).toEqual([]);
  });

  it("placeholders are well formed", () => {
    for (const [key, value] of Object.entries(catalog)) {
      const opens = (value.match(/\{/g) ?? []).length;
      const closes = (value.match(/\}/g) ?? []).length;
      expect(opens, key).toBe(closes);
      for (const placeholder of value.matchAll(/\{([^}]*)\}/g)) expect(placeholder[1], key).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    }
  });

  it("W4-6: the dig card words cover every state a dig of the new model can be in, and none names an engine word", () => {
    const cards = ["WAITING", "RUNNING", "PAUSED", "FAILED", "DONE", "REWRITING", "CHANGED", "NO_CHANGE", "REWRITE_FAILED"]
      .map((state) => `v4.rewrite.digCard.${state}`);
    expect(cards.filter((key) => !(key in catalog))).toEqual([]);
    // V4 screen review (3 Nov), journey-f2 / journey-f22: a dig at work says the one state word "Looking into it" (its card
    // already carries what is being dug); the other card lines keep their "Dig · " start.
    expect(catalog["v4.rewrite.digCard.RUNNING"]).toBe("Looking into it");
    for (const key of cards.filter((card) => card !== "v4.rewrite.digCard.RUNNING")) expect(catalog[key], key).toMatch(/^Dig · /u);
    // The new lines say what happened in plain words: no score, no state code, no reviewer or checker name.
    const fresh = DRAFTED_UNTIL_CLICK_TEST.filter((key) => key.startsWith("v4.rewrite.") || key.startsWith("v4.nest.")).map((key) => catalog[key]!);
    expect(fresh.filter((line) => /\b(?:score|strength|threshold|READY|WRITING|FAILED|checker|GLM|Haiku)\b/u.test(line))).toEqual([]);
  });
});

/**
 * The owner's V4 screen review (OWNER-PICKS-2026-11-03.md): the chat answers ("Next", "quota"), Round 2 r2-11, and the
 * wording fixes dig-f15, wait-f20, wait-f21 and map-f16, word for word.
 */
const NO_WAIT = "You don't need to wait. You can dig or write your report now.";
const REVIEW_LINES: Readonly<Record<string, string>> = Object.freeze({
  "v4.ask.continue": "Next",
  "v4.suggest.edit": "Change the wording",
  // dig-f10 (the undo-bottom track): the person stays where they are; the note says when it started, with its own [See it].
  "v4.dig.started": "Started {time} · You can leave this page.",
  // report-d1 / report-d2 / report-f15 (the report from the map): the strip's two buttons, Free's line before writing,
  // and the quiet reason dig buttons rest with while the report is written.
  "v4.reportStrip.write": "Write it",
  "v4.reportStrip.notYet": "Not yet",
  "v4.report.publicToo": "This question is public, so your report will be public too.",
  "v4.reportWait.digsRest": "Digging opens again when your report is written.",
  "v4.debate.state.HOLDING": "Taking a short break · continues about {time}",
  "v4.debate.state.HOLDING.noTime": "Taking a short break",
  // map-f16: the approved N14 sentence (the report's own), then r2-11 A's line.
  "v4.panel.storyMissing": `${APPROVED_REPORT_LINES["v4.investigation.noStory"]} ${NO_WAIT}`,
  "v4.panel.fallbackMissing": `${APPROVED_REPORT_LINES["v4.investigation.noStory"]} ${NO_WAIT}`,
  // Wave 2, the panel and choosing what to dig: dig-f9 (the question check names the dig), dig-f22 (the visible reason
  // over greyed boxes), dig-f34 (the two labels). Under the own-view box, journey-f20's "This will be public." where the
  // debate's own public state says so (v4.publicMark.willBePublic, pinned in tests/unit/public-lane.test.ts), and on a
  // Free debate whose state says no more than private, dig-f26's own sentence (the wave-2 review, lib/v4/publicNotes.ts).
  // One pick's button reads dig-f5 / dig-f31's "Dig into your pick" (QUOTA_RECORD_LINES below), the one dig-button helper
  // of lib/v4/digQuota.ts; map-f14's "Dig into this" is an owner question.
  "v4.suggest.ownViewPublic": "Free debates are public, so your view may be shown on this public page.",
  // map-d4 A, as drawn on the page the owner picked from: the findings' heading.
  "v4.panel.found": "What we found",
  // dig-d1 B (it includes all of A), as drawn on the page the owner picked from: the running dig's checked findings and
  // the folded current text of the path.
  "v4.digLive.found": "Checked so far",
  "v4.digLive.pathNow": "This path says now",
  "v4.dig.checkAbout": "About your dig on “{path}”:",
  "v4.suggest.picksOn": "Your picks are on “{path}”.",
  "v4.suggest.freeCap": "On the Free plan a dig combines up to {count} picks.",
  "v4.suggest.openTag": "Open question",
  "v4.suggest.ownViewTag": "Your view",
  // journey-f22: the rail says the shared state word "Ready" for finished digs (the build had "Done"); map-f28, whose Where
  // names v4.panel.unchecked.*: "Some points were not checked by a second AI" (the build had added "here").
  "v4.rail.digsDone.one": "Ready",
  "v4.rail.digsDone.other": "Ready",
  "v4.panel.unchecked.other": "Some points were not checked by a second AI."
});

/**
 * The owner's screen review (OWNER-PICKS-2026-11-03.md), the quota track: the record's own words for the dig buttons, the
 * period by the switch, the can't-start states and "This question" (journey-f13, dig-f5, dig-f31, public-d3 A,
 * journey-f14, journey-f15, map-f9), word for word.
 */
const QUOTA_RECORD_LINES: Readonly<Record<string, string>> = Object.freeze({
  "v4.panel.dig": "Dig here",
  "v4.undo.barShare": "up to {percent}%",
  "v4.dig.yourPicks.one": "Dig into your pick",
  "v4.dig.yourPicks.other": "Dig into your picks",
  "v4.dig.trayDigThese": "Dig into these",
  "v4.dig.chooseWhat": "Choose what to dig ›",
  "v4.dig.after": "after {time}",
  "v4.dig.addToTray": "Add to tray",
  "v4.dig.period.PERSON_DAY": "of today · you can still finish your report",
  "v4.dig.period.PERSON_MONTH": "of this month · you can still finish your report",
  "v4.suggest.waitingOn": "Your picks are waiting on “{path}”.",
  "v4.suggest.goToPicks": "Go to them",
  "v4.suggest.clearPicks": "Clear them",
  "v4.debate.questionShare.PERSON_DAY": "This question: {percent}% of today"
});

describe("the owner's 3 Nov screen review", () => {
  it("the quota track's dig, period and can't-start lines are the record's words, and 'Dig here too' is gone", () => {
    expect(Object.fromEntries(Object.keys(QUOTA_RECORD_LINES).map((key) => [key, catalog[key]]))).toEqual(QUOTA_RECORD_LINES);
    // journey-f13: one dig button everywhere; "Dig here too" and "Dig deeper here" are on no page.
    expect(Object.entries(catalog).filter(([, value]) => /Dig here too|Dig deeper here/u.test(value))).toEqual([]);
    // journey-f8 / r2-2 A: nothing says what is left.
    expect(Object.entries(catalog).filter(([key, value]) => (key.startsWith("v4.dig.") || key.startsWith("v4.header.")) && /\bleft\b/u.test(value)))
      .toEqual([]);
    // journey-f15: a month waits "on" its date ({date}); a day and a week wait "after" a time ({time}).
    expect(catalog["v4.money.startsWait.PERSON_MONTH"]).toContain("on {date}");
    for (const key of ["v4.money.startsWait.PERSON_DAY", "v4.money.startsWait.PERSON_WEEK", "v4.dig.quotaDayUsed"]) expect(catalog[key], key).toContain("after {time}");
  });

  it("the first button reads Next, and the dig, wait and missing-answer lines are the review's words", () => {
    expect(Object.fromEntries(Object.keys(REVIEW_LINES).map((key) => [key, catalog[key]]))).toEqual(REVIEW_LINES);
    // Review F10: where no dig can start, the same approved words stop after "You don't need to wait."
    expect(catalog["v4.panel.noShortAnswerNoDig"]).toBe(`${APPROVED_REPORT_LINES["v4.investigation.noStory"]} You don't need to wait.`);
    expect(`${catalog["v4.panel.noShortAnswerNoDig"]} You can dig or write your report now.`).toBe(catalog["v4.panel.storyMissing"]);
    // Review F1: the report's line when the start of writing is not known is the timed line without its time.
    expect(catalog["v4.investigation.writing"]).toBe(catalog["v4.investigation.writingSince"]!.replace(" Started {time}.", ""));
  });

  it("the share word is quota: no V4 line says allowance", () => {
    expect(Object.entries(catalog).filter(([, value]) => /allowance/iu.test(value))).toEqual([]);
    const shares = ["v4.header.used.PERSON_DAY", "v4.header.used.PERSON_WEEK", "v4.header.used.PERSON_MONTH", "v4.header.used.PERSON_GRANT",
      "v4.panel.modeHint.thorough", "v4.money.borrowed.PERSON_DAY", "v4.money.borrowed.PERSON_WEEK",
      "v4.money.startsWait.PERSON_MONTH", "v4.money.paused"];
    for (const key of shares) expect(catalog[key], key).toMatch(/\bquota\b/u);
    // wait-f5 (fail-pause track): after the reset the pause block says only "Your new month has started." with Continue.
    expect(catalog["v4.money.pausedReady"]).toBe("Your new month has started.");
  });

  it("wait-f3 / map-f3: no wait names a figure before it is measured, and the question's wait says where to find it", () => {
    for (const key of ["v4.debate.usually", "v4.investigation.writingSince", "v4.investigation.writing"]) {
      expect(catalog[key], key).not.toMatch(/\d|minute|hour|usually|few/iu);
      expect(catalog[key], key).toMatch(/This takes a while\./u);
    }
    // ask-d5 B (the step-1 track): the list on the first page is "Your maps" now.
    expect(catalog["v4.debate.usually"]).toContain(`“${catalog["v4.maps.title"]}”`);
  });

  it("wait-f20: 'Paused' is the month wall's word only", () => {
    const paused = Object.entries(catalog).filter(([, value]) => /\bpaused\b/iu.test(value)).map(([key]) => key).sort();
    // Every one of these is the month's quota (fail-pause's dig card, phone bar and rail words; the waiting card's state words).
    expect(paused).toEqual([
      "v4.debate.state.PAUSED_MONTH", "v4.money.paused", "v4.pause.digCard", "v4.pause.phoneBar", "v4.rail.digsPaused.one",
      "v4.rail.digsPaused.other", "v4.rewrite.digCard.PAUSED", "v4.state.PAUSED", "v4.state.PAUSED.noDate"
    ].sort());
    expect(catalog["v4.state.SHORT_BREAK"]).not.toMatch(/\bpaused\b/iu);
  });
});

/**
 * V4 start step, Task 61 (spec 2026-11-03 §2 items 7 and 8): the map's chosen paths. Every v4.paths.* key is a draft until
 * the click-test; r2-1 A says "path" on the map in five existing lines. Not here: v4.paths.lookedInto (it waits for the
 * owner's wait-f9 (b) card, Task 62), v4.paths.carryOn (wait-f16's line replaces it) and a "Dig deeper here" key (journey-f13:
 * one dig button everywhere, in the record's words).
 */
describe("V4 start step, Task 61: the map's paths", () => {
  const paths = Object.keys(catalog).filter((key) => key.startsWith("v4.paths."));

  it("every v4.paths.* key is drafted until the click-test", () => {
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((key) => !DRAFTED_UNTIL_CLICK_TEST.includes(key))).toEqual([]);
    for (const key of ["v4.paths.lookedInto", "v4.paths.carryOn", "v4.paths.digDeeper"]) expect(key in catalog, key).toBe(false);
  });

  it("r2-1 A: the map says 'path' in its five lines, each drafted", () => {
    const lines: Readonly<Record<string, string>> = {
      "v4.map.pathUntitled": "A path the AIs looked into",
      "v4.panel.kind.path": "A path the AIs looked into",
      "v4.map.noPaths": "No paths to show yet.",
      "v4.panel.pathNoMore": "Nothing more is written about this path yet.",
      "v4.panel.noOpenPath": "Nothing is open here. You can still dig deeper into this path."
    };
    expect(Object.fromEntries(Object.keys(lines).map((key) => [key, catalog[key]]))).toEqual(lines);
    expect(Object.keys(lines).filter((key) => !DRAFTED_UNTIL_CLICK_TEST.includes(key))).toEqual([]);
  });

  it("the path words name no engine word, no figure, no time and no quota left; the share word is never 'allowance'", () => {
    const words = paths.map((key) => catalog[key]!);
    expect(words.filter((line) => /\b(?:score|strength|threshold|READY|WRITING|FAILED|LOOKING|ARGUED|checker|judge|GLM|Haiku|Luna|branch|node)\b/u.test(line)))
      .toEqual([]);
    // ("What you left out before Start." is what the person chose not to look into, never a quota left. Task 62: the phone's
    // "Your paths" heading over the rows is spec §2 item 7's words, not a mark on a card, so only "Your path" alone is refused.)
    expect(words.filter((line) => /allowance|usually|minute|\bleft\b(?! out)|You picked|Your path(?!s)/iu.test(line))).toEqual([]);
    expect(words.filter((line) => /\d/u.test(line.replace("+ 1 more", "")))).toEqual([]);
  });
});
