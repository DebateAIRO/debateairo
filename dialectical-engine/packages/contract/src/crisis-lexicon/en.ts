import type { CrisisLexicon, CrisisPattern } from "./types.js";

// Kin and people close to the writer, for `other-person`.
const CLOSE = String.raw`(?:friend|best friend|boyfriend|girlfriend|partner|husband|wife|son|daughter|brother|sister|mother|mom|mum|father|dad|child|kid|teen|teenager|roommate|flatmate|classmate|student|colleague|coworker|co-worker|cousin|niece|nephew|grandson|granddaughter)`;
const THEMSELF = String.raw`(?:himself|herself|themselves|themself)`;
const THEIR = String.raw`(?:his|her|their)`;

export const EN: CrisisLexicon = Object.freeze({
  language: "en",
  patterns: Object.freeze<CrisisPattern[]>([
    // intent
    { signal: "intent", pattern: String.raw`\b(?:kill|killing|murder|off|offing|unalive|unaliving) my ?self\b` },
    { signal: "intent", pattern: String.raw`\b(?:end|ending|ended|take|taking|took) my (?:own )?life\b(?!'s| savings| insurance| story| work| in | into| back| seriously| more seriously)` },
    { signal: "intent", pattern: String.raw`\bi (?:want|wanna|need|wish|would like|'d like|am ready|'m ready) to die\b(?! for| on| in| of| laughing)` },
    { signal: "intent", pattern: String.raw`\bi wish i (?:was|were) (?:dead|never born)\b` },
    { signal: "intent", pattern: String.raw`\bi wish i (?:had never been|was never|were never) born\b` },
    { signal: "intent", pattern: String.raw`\bi (?:don't|do not|dont|no longer) want to (?:be alive|exist any ?more|wake up(?: again| tomorrow)?|live any ?more|go on living|keep living|be here any ?more)\b` },
    { signal: "intent", pattern: String.raw`\bi (?:don't|do not|dont) want to live\s*(?:$|[.!?,;])` },
    { signal: "intent", pattern: String.raw`\b(?:i|i'm|im|i am|i've|i have|i feel|i've been|me|my)\b.{0,30}\bsuicidal\b` },
    { signal: "intent", pattern: String.raw`\bsuicidal\b.{0,20}\b(?:again|lately|right now|tonight|today|these days)\b` },
    { signal: "intent", pattern: String.raw`\b(?:i|me)\b (?:[a-z']+ ){0,3}commit(?:ting)? suicide\b` },
    { signal: "intent", pattern: String.raw`\bend it all\b` },
    { signal: "intent", pattern: String.raw`\bbetter off dead\b` },
    { signal: "intent", pattern: String.raw`\b(?:no|nothing|not any) (?:reason|point|purpose) (?:to|in|for) (?:live|living|go on|going on|being alive|staying alive)\b(?! in| with| on| near| abroad| here| there)` },
    { signal: "intent", pattern: String.raw`\bi can(?:'t|not|nt) (?:go on|keep going|keep living|do this|take (?:it|this)|live like this) any ?more\b` },
    { signal: "intent", pattern: String.raw`\bmy life (?:is|isn't|is not) (?:not |no longer )?worth living\b` },
    { signal: "intent", pattern: String.raw`\b(?:kill yourself|kys)\b` },
    { signal: "intent", pattern: String.raw`\b(?:i'm|i am|im|i've been|i have been|been|keep|i keep) (?:thinking|thought) (?:about|of) (?:suicide|killing my ?self|ending (?:it|it all|my life)|dying|taking my (?:own )?life)\b` },
    { signal: "intent", pattern: String.raw`\b(?:i|me|my)\b.{0,40}\b(?:want|wanna|wish|need) to die\b(?! for| on| in| of| laughing| happy| old| rich| peacefully in my sleep when)` },
    { signal: "intent", pattern: String.raw`\bi (?:feel|felt|kinda feel) like (?:dying|killing my ?self|ending it(?: all)?|ending my life)\b` },
    { signal: "intent", pattern: String.raw`\b(?:wanna|want to|gonna|going to|should i|i'?ll|might|about to|just|i will|i'm going to|im going to) kms\b` },
    { signal: "intent", pattern: String.raw`\b(?:i'm|i am|im) (?:so |really |just )?(?:done|finished|tired|sick) (?:with|of) (?:life|living|being alive|existing)\b` },
    { signal: "intent", pattern: String.raw`\bi (?:want|wanna|wish i could|want to just) (?:to )?disappear (?:forever|for good|permanently)\b` },
    { signal: "decision", pattern: String.raw`\b(?:is|would) (?:dying|death|being dead) (?:be )?better than (?:living|life|this|staying alive|going on)\b(?! forever| for ever| as a| with| in )` },
    { signal: "decision", pattern: String.raw`\bbetter (?:for (?:everyone|everybody|my family|them|all of us) |off )?if i (?:died|was dead|were dead|was gone|were gone|killed my ?self|wasn't here|wasn't around|weren't here|weren't alive|wasn't alive)\b` },
    { signal: "decision", pattern: String.raw`\b(?:nobody|no one|no-one|noone) would (?:even )?(?:miss|notice|care about) me\b(?:\s*(?:$|[.!?,;])| if i (?:died|was gone|were gone|disappeared|was dead|were dead|killed my ?self|wasn't here|weren't here|wasn't around))` },
    { signal: "decision", pattern: String.raw`\bworth (?:it )?(?:to )?(?:keep|keeping|go|going|carry|carrying) on living\b|\bworth (?:it )?(?:to )?(?:keep|keeping) living\b|\bworth (?:staying|being) alive\b` },
    { signal: "decision", pattern: String.raw`\b(?:no|don't see a|dont see a|don't have a|can't find a|cant find a|can't see a|not a single|not one) (?:reason|point) to (?:keep going|keep living|go on|carry on|live|stay alive|be alive|keep existing)\b(?! with| on with| in )` },
    { signal: "method", pattern: String.raw`\bi(?:'m| am|'ll| will| want to| wanna| am going to|'m going to|'m gonna| am gonna| might| plan to| am planning to) (?:overdose|od|take an overdose)\b` },
    { signal: "method", pattern: String.raw`\b(?:painless|painlessly|least painful|peaceful|quickest|quick|easiest) way to go\s*(?:$|[.!?,;])` },
    { signal: "method", pattern: String.raw`\b(?:high|tall|deep) enough to (?:jump|die|kill (?:me|my ?self|you|yourself))\b` },
    { signal: "method", pattern: String.raw`\bjump(?:ing)? (?:off|from)\b.{0,30}\bto (?:die|end it|end my life|kill my ?self)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:cut|cutting|slit|slitting|slash|slashing) (?:my|his|her|their) wrists?\b` },
    // self-harm
    { signal: "self-harm", pattern: String.raw`\b(?:cut|cutting|burn|burning|harm|harming|starve|starving|scratch|scratching) my ?self\b` },
    { signal: "self-harm", pattern: String.raw`\bhurt(?:ing)? my ?self\b.{0,20}\b(?:on purpose|intentionally|deliberately|again)\b` },
    { signal: "self-harm", pattern: String.raw`\bi (?:want to |keep |still |have been )?(?:self[- ]?harm|self[- ]?injure)` },
    { signal: "self-harm", pattern: String.raw`\bmy self[- ]?(?:harm|harming|injury|injuring)\b` },
    { signal: "self-harm", pattern: String.raw`\b(?:stop|quit) (?:self[- ]?harming|cutting my ?self|hurting my ?self)\b` },
    // decision
    { signal: "decision", pattern: String.raw`\bshould i (?:just )?(?:die|end (?:it|my life)|keep living|stay alive|go on living|live or die|live)\s*(?:$|[.!?,;])` },
    { signal: "decision", pattern: String.raw`\bshould i (?:just )?(?:live or die|stay alive|keep living|go on living)\b` },
    { signal: "decision", pattern: String.raw`\bis my life (?:even |still |really )?worth (?:living|it)\b` },
    { signal: "decision", pattern: String.raw`\bsuicide\b.{0,40}\b(?:for me|for someone like me|for people like me|my (?:only|best) (?:option|choice|way out))\b` },
    { signal: "decision", pattern: String.raw`\b(?:my|the) only (?:option|way out|choice) (?:left )?(?:is|would be) (?:suicide|death|to die|dying)\b` },
    { signal: "decision", pattern: String.raw`\breasons? (?:not )?to (?:kill my ?self|end my life|stay alive|keep living)\b` },
    { signal: "decision", pattern: String.raw`\bwhat(?:'s| is) the point (?:of|in) (?:my )?(?:living|staying alive|being alive|my life|life any ?more|going on)\b` },
    { signal: "decision", pattern: String.raw`\bwould (?:anyone|anybody|people|my family) (?:even )?(?:care|miss me|notice) if i (?:died|was gone|were gone|killed my ?self|disappeared)\b` },
    // method
    { signal: "method", pattern: String.raw`\bhow (?:to|do i|can i|could i|should i|would i|do you|does one|to best) (?:kill (?:my ?self|yourself|oneself)|commit suicide|end (?:my|your|one's) (?:own )?life|hang (?:my ?self|yourself|oneself)|overdose|od)\b` },
    { signal: "method", pattern: String.raw`\b(?:painless|painlessly|easiest|easy|quickest|quick|fastest|peaceful|best|surest|most effective|least painful) (?:way|ways|method|methods) (?:to|of) (?:die|dying|kill (?:my ?self|yourself|oneself)|commit(?:ting)? suicide|end (?:it|my life|your life|one's life))\b` },
    { signal: "method", pattern: String.raw`\bsuicide (?:method|methods|note|plan|pact)\b` },
    { signal: "method", pattern: String.raw`\b(?:lethal|fatal|deadly|overdose) (?:dose|amount|quantity) of\b` },
    { signal: "method", pattern: String.raw`\bhow (?:many|much)\b.{0,40}\b(?:to die|to kill (?:me|my ?self|you|yourself|a person)|to overdose|to od|would kill me|is lethal|is fatal|is a lethal dose)\b` },
    { signal: "method", pattern: String.raw`\bhow (?:high|far|tall)\b.{0,40}\b(?:to die|to kill (?:me|my ?self|you|yourself))\b` },
    { signal: "method", pattern: String.raw`\b(?:hang|drown|shoot|poison|gas|electrocute|suffocate) my ?self\b` },
    { signal: "method", pattern: String.raw`\bi(?:'m| am| want to| will|'ll| could| might| am going to|'m going to|'m gonna| am gonna) (?:jump|throw my ?self) (?:off|from|in front of)\b` },
    { signal: "method", pattern: String.raw`\boverdos(?:e|ing) on purpose\b` },
    { signal: "method", pattern: String.raw`\b(?:take|swallow|took|swallowed|taking|swallowing) (?:all|a bottle of|a whole bottle of|the whole bottle of) (?:my |the |of my )?(?:pills|tablets|meds|medication|sleeping pills)\b` },
    // other-person
    { signal: "other-person", pattern: String.raw`\bmy ${CLOSE}\b.{0,40}\b(?:is suicidal|feels suicidal|(?:wants?|is going|plans?|tried|attempted|threatens?|threatened|keeps? threatening) to (?:die|kill ${THEMSELF}|end ${THEIR} (?:own )?life|commit suicide)|is (?:cutting|harming|hurting|burning) ${THEMSELF}|self[- ]?harms?)\b` },
    { signal: "other-person", pattern: String.raw`\b(?:someone|somebody|a friend) i (?:know|love|care about)\b.{0,40}\b(?:suicidal|kill ${THEMSELF}|end ${THEIR} (?:own )?life|self[- ]?harm)` },
    { signal: "other-person", pattern: String.raw`\b(?:wants?|is going|are going|threatens?|threatening|plans?|planning) to (?:kill ${THEMSELF}|end ${THEIR} (?:own )?life)\b` }
  ])
});
