// Extracted verbatim from ui_designs/DebateAI Design Document.html (2026-09-06) — the data behind artboards 10a/10b/10c and their token map.

const tokensFor = (dk) => dk ? {
      page: '#14110E', headerBg: 'rgba(20,17,14,.7)', shell: '#221D17', core: '#181410', railBg: '#171310',
      ink: '#F2EAD9', mute: '#9C907A', hair: 'rgba(242,234,217,.09)', hairStrong: 'rgba(242,234,217,.18)',
      gridDot: 'rgba(242,234,217,.08)', gold: '#C8A055', pro: '#6E9E96', con: '#C8834F', hint: '#B5A88F',
      shadow: '0 22px 48px -22px rgba(0,0,0,.8)', shadowBig: '0 36px 70px -30px rgba(0,0,0,.9)'
    } : {
      page: '#F9F6F1', headerBg: 'rgba(251,249,244,.8)', shell: '#EFE9E0', core: '#FDFBF6', railBg: '#F4F0E8',
      ink: '#29261F', mute: '#6E675C', hair: 'rgba(41,38,31,.1)', hairStrong: 'rgba(41,38,31,.2)',
      gridDot: 'rgba(41,38,31,.12)', gold: '#A8823E', pro: '#3F7466', con: '#C15F3C', hint: '#555147',
      shadow: '0 18px 40px -20px rgba(41,38,31,.24)', shadowBig: '0 30px 60px -26px rgba(41,38,31,.32)'
    };
    const tA = tokensFor(dark);

const accentsFor = (dk) => { const t = tokensFor(dk); return { pro: t.pro, con: t.con, reasoning: dk ? '#C8A055' : '#3D5A80' }; };


const accentsA = accentsFor(dark);


const tint = (hex, a) => {
      const h = hex.replace('#', '');
      return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;
    };


const okC = dark ? '#86B58D' : '#3E7A4E';

const badC = dark ? '#D67F65' : '#B0432F';

const goldBg = tint(tA.gold, dark ? .13 : .1);

const goldBorder = tint(tA.gold, dark ? .5 : .45);

NOT FOUND: vOk

NOT FOUND: vBad

const okBorder = tint(okC, .55);

const mkCat = (name, tag, tagC, desc, detail, on, locked) => ({
      name, tag, tagC, tagBg: tint(tagC, dark ? .14 : .1), tagBorder: tint(tagC, dark ? .5 : .4), desc, detail,
      trackBg: on ? (locked ? tint(okC, dark ? .35 : .28) : okC) : tA.shell,
      trackBorder: on ? tint(okC, .55) : tA.hairStrong,
      knob: on ? tA.core : tA.mute, knobPos: on ? 'flex-end' : 'flex-start',
      cursor: locked ? 'not-allowed' : 'pointer'
    });


const policyJump = ['CONTROLLER', 'WHAT WE COLLECT', 'LAWFUL BASIS', 'PUBLISHING', 'MODELS & TRANSFERS', 'RETENTION', 'YOUR GDPR RIGHTS', 'COMPLAINTS'];


const mkSec = (no, title, c, body, items) => ({ no, title, c, body, items: items || [], hasList: !!(items && items.length) });


const policySections = [
      mkSec('01', 'What we collect', okC, 'Only what an account needs to function, plus what you choose to give us.', [
        'Account: email, recovery email, password hash, MFA secret, recovery codes.',
        'Security: device name, browser, IP and timestamp for each session.',
        'Content: the claims you post, your challenges, and the model output they produce.'
      ]),
      mkSec('02', 'Why we hold it', tA.gold, 'Each category has one purpose and is not reused for another. Session and device records exist so you can recognise and revoke a login you did not make. Debate content exists so a debate can be reopened, replayed and audited against the scores it was given.'),
      mkSec('03', 'Publishing and visibility', accentsA.reasoning, 'Debates are private until you publish them. Publishing shows the claim, the tree, the scores and your display name \u2014 never your email, device records or session history. Unpublishing removes it from public listings; copies already made by readers are outside our control.'),
      mkSec('04', 'Model providers and international transfers', tA.con, 'Claims and arguments are sent to the model providers you select in order to generate the debate. We send debate text only \u2014 never your email, device record or session data \u2014 and we do not permit providers to train on it. Providers outside the EEA receive data under Standard Contractual Clauses (Art. 46 GDPR); a list of current sub-processors and their locations is maintained at dezbatere.ro/subprocessors.'),
      mkSec('05', 'Controller and contact', tA.ink, 'The controller of your personal data is DebateAIRO SRL, Bucharest, Romania. Our data protection contact is privacy@dezbatere.ro. We have no obligation to appoint a DPO but this address is monitored and answers within 30 days.'),
      mkSec('06', 'Lawful basis for each purpose', okC, 'We rely on a single, stated basis per purpose under Art. 6(1) GDPR:', [
        'Contract, Art. 6(1)(b) \u2014 account, authentication, running and storing your debates.',
        'Legitimate interests, Art. 6(1)(f) \u2014 security, abuse prevention, and the session and device records that let you spot a login you did not make.',
        'Consent, Art. 6(1)(a) \u2014 optional analytics and model-quality telemetry, and publishing a debate. Withdrawable at any time, without affecting your account.',
        'Legal obligation, Art. 6(1)(c) \u2014 retaining records we are required by law to keep.'
      ]),
      mkSec('07', 'Retention', tA.gold, 'Session and device records are kept 30 days; optional analytics and telemetry 90 days; account data for as long as the account exists. Deleting your account erases account data and unpublished debates within 30 days, and removes published debates from public listings. Backups age out within a further 90 days.'),
      mkSec('08', 'Your rights under the GDPR', accentsA.reasoning, 'You may exercise any of these free of charge from Settings \u2192 Privacy, or by writing to privacy@dezbatere.ro. We answer within one month (Art. 12(3)).', [
        'Access (Art. 15) \u2014 a copy of your data, exportable as JSON from Settings.',
        'Rectification (Art. 16) and erasure (Art. 17) \u2014 correct or delete your data.',
        'Restriction (Art. 18) and objection (Art. 21) \u2014 including objecting to processing based on legitimate interests.',
        'Portability (Art. 20) \u2014 your debates and account data in a machine-readable form.',
        'Withdraw consent (Art. 7(3)) \u2014 for analytics, telemetry, or a published debate.'
      ]),
      mkSec('09', 'Automated decisions and profiling', tA.mute, 'Model scores, condition marks and verdicts are automated evaluations of arguments, not of people. No decision with legal or similarly significant effect on you is made automatically (Art. 22), and we do not profile you for advertising.'),
      mkSec('10', 'Security and breach notification', tA.con, 'Passwords are hashed, MFA is mandatory, and access to production data is logged. In the event of a personal data breach we notify the Romanian supervisory authority within 72 hours (Art. 33) and inform you directly where the risk to your rights is high (Art. 34).'),
      mkSec('11', 'Children, complaints and changes', tA.ink, 'The service is for adults; accounts require an 18-or-over affirmation and we do not knowingly process children\u2019s data. You may lodge a complaint with the Romanian supervisory authority (ANSPDCP, Bucharest) or the authority where you live. Material changes to this policy are announced in-app at least 14 days before they take effect, and prior versions remain available.')
    ];


const cookieCats = [
      mkCat('Essential', 'ALWAYS ON', okC, 'Session, MFA state and the device record that lets you spot a login you do not recognise.', 'de_session · de_mfa · de_device — 30 days', true, true),
      mkCat('Model quality telemetry', 'OPTIONAL', tA.gold, 'Which arguments you challenge or flag, used to tune judge panels. Never tied to your debates\u2019 text.', 'de_quality — 90 days · first-party', true, false),
      mkCat('Product analytics', 'OPTIONAL', tA.mute, 'Aggregate page and feature usage. No cross-site tracking, no advertising, never sold.', 'de_analytics — 90 days · first-party', false, false)
    ];

