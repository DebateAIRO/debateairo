// Root's one-time change to the preview's front door (side-by-side spec §6). Linux, Node v26.8.2, `env -i`.
//
// Plain words: today Caddy sends every request to one website port (slot A, 3100). For two releases to run side by
// side, both slots' website ports (3100 and 3200) must be its upstreams. Caddy then asks each website's /readyz every
// 2 s, straight at the slot's port (with the edge secret, or the website treats the check as an untrusted peer), and
// sends each request to the first ready slot. The public route itself refuses /readyz (Caddy's own 404, before the
// password: every proxied request carries the edge secret, so the website would trust a visitor's /readyz too). A request that arrives while neither slot is ready, during a switch, waits up to 12 s instead of failing.
// The preview's Caddy runs with `admin off`, so this is a file change and a restart, done once in the transition
// window (side-by-side plan D15), never a reload. A loopback-only listener (127.0.0.1:3090, no password) lets root
// poll /readyz through Caddy itself: it proxies GET /readyz and nothing else (every other request is a plain 404).
//
//   caddy-slots.mjs transform --in <live Caddyfile> --out <new file>
//       Reads the live file (root-owned, 0644, in a folder only root can write), writes the changed copy to <out>
//       (0644, created new: an existing <out> is refused with OUTPUT_EXISTS and kept), reads it back through the same
//       custody reader and compares every byte, and prints one JSON line
//       {"event":"PREVIEW_CADDY_TWO_SLOTS","proxiesChanged":<n>,"edgeListener":3090}. It never touches the live file,
//       never validates with caddy and never restarts anything: the transition runbook does those steps.
//       A partial or unequal <out> (OUTPUT_WRITE_FAILED, OUTPUT_READBACK_REFUSED) is kept where it is, never unlinked
//       here: the operator moves it aside before a rerun (until then a rerun refuses OUTPUT_EXISTS).
//
//   caddy-slots.mjs add-payment-marks --in <live Caddyfile> --out <new file>
//       After the transition upload T the live file already has two slots, so `transform` refuses it (CADDY_ALREADY_TWO_SLOTS).
//       This command takes that two-slot file and adds only Caddy's rule for the payment marks (NETOPIA, Visa,
//       Mastercard at /payment-marks/<name>.svg): the three named files, served from root's own folder outside every
//       release, behind the password, right before the public route's main proxy. Same custody, new-file write, read-back
//       and root-only rules as `transform`; prints one JSON line
//       {"event":"PREVIEW_CADDY_PAYMENT_MARKS","folder":<the marks folder>,"files":[<the three names>]}. A one-slot file
//       (CADDY_NOT_TWO_SLOTS), a file that already mentions the marks (CADDY_ALREADY_PAYMENT_MARKS) or a file of another
//       shape (CADDY_SHAPE_REFUSED) is refused and nothing is written. The release guide's PM2 runs it
//       inside a maintenance window (MT1/MT2), then validates with caddy, installs, restarts and checks.
//
// Every refusal is one JSON line {"event":"PREVIEW_CADDY_REFUSED","reason":<code>} on stderr and exit 1. Nothing read
// from the Caddyfile is printed (its password lines are placeholders, but the file is the server's).
import { constants, readFileSync } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { dirname, isAbsolute, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { protectedPath, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { PREVIEW_SLOTS } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { assertActor } from './release-artifacts.mjs';

/** Side-by-side spec §6: root polls readiness through Caddy here, on loopback only, without the password; GET /readyz only. */
export const EDGE_LISTENER = Object.freeze({ port: 3090, bind: '127.0.0.1' });
/** Both slots' website ports, slot A first: with `lb_policy first`, A takes traffic whenever both are ready. */
export const SLOT_UPSTREAMS = Object.keys(PREVIEW_SLOTS).sort().map(slot => `127.0.0.1:${PREVIEW_SLOTS[slot].uiPort}`).join(' ');
/** The shared proxy rules (caddy/debateai-slots.caddy, tab-indented), imported by every two-slot proxy block. */
export const SLOTS_SNIPPET = readFileSync(fileURLToPath(new URL('./caddy/debateai-slots.caddy', import.meta.url)), 'utf8');

const SNIPPET_NAME = /^\(([a-z_]+)\) \{$/.exec(SLOTS_SNIPPET.split('\n')[0])[1];
const SLOT_A = `127.0.0.1:${PREVIEW_SLOTS.A.uiPort}`;
const escape = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** Today's proxy line: exactly slot A's website, opening a block. */
const SLOT_A_PROXY = new RegExp(`^([ \\t]*)reverse_proxy ${escape(SLOT_A)} \\{$`);
const ANY_PROXY = /^[ \t]*reverse_proxy(?:[ \t]|$)/;
const EDGE_SECRET_LINE = /^[ \t]*header_up X-Debateai-Edge-Secret \{file\.[^}\s]+\}$/;
const MAX_CADDYFILE_BYTES = 65_536;
/** The public route's own answer to /readyz (final fix wave W2), with the line that says why. */
export const PUBLIC_READYZ_REFUSAL = 'respond /readyz 404';
const PUBLIC_READYZ_COMMENT = '# Readiness is never read through the public name: Caddy checks the slots directly, root asks 127.0.0.1:3090.';

/** README §14.7: the payment marks are root's own files (0644 in a 0755 folder), outside every release; Caddy serves exactly these. */
export const PAYMENT_MARKS = Object.freeze({ folder: '/etc/debateai-v3-preview/public/payment-marks', files: Object.freeze(['netopia.svg', 'visa.svg', 'mastercard.svg']) });
/** The URL prefix the website's footer asks for (`/payment-marks/<name>.svg`), stripped before the folder lookup. */
const PAYMENT_MARKS_PREFIX = '/payment-marks';
/** The rule, tab-indented relative to the main proxy line (reindented to the file's own unit like the snippet). */
const PAYMENT_MARKS_RULE = Object.freeze([
  '# The payment marks (NETOPIA, Visa, Mastercard; README §14.7): root\'s own files, outside every release, served by Caddy behind the password.',
  `@paymentMarks path ${PAYMENT_MARKS.files.map(file => `${PAYMENT_MARKS_PREFIX}/${file}`).join(' ')}`,
  'handle @paymentMarks {',
  `\troot * ${PAYMENT_MARKS.folder}`,
  `\turi strip_prefix ${PAYMENT_MARKS_PREFIX}`,
  '\theader Content-Type image/svg+xml',
  '\theader Content-Security-Policy "default-src \'none\'; style-src \'unsafe-inline\'; sandbox"',
  '\theader X-Content-Type-Options nosniff',
  '\tfile_server',
  '}'
]);

class CaddySlotsRefusal extends Error { constructor(code) { super(code); this.name = 'CaddySlotsRefusal'; this.code = code; } }
const refuse = code => { throw new CaddySlotsRefusal(code); };
const indentOf = line => /^[ \t]*/.exec(line)[0];
/** Net brace depth of one line (placeholders like {remote_host} open and close on the same line). */
const depthChange = line => [...line].reduce((depth, char) => depth + (char === '{' ? 1 : char === '}' ? -1 : 0), 0);

/**
 * The global options block: the first line that is neither blank nor a comment is a lone `{`, and the block holds
 * `admin off` at its own top level. Returns the index of its closing line and the file's indentation unit (the global
 * block's first indented line: a tab, or that many spaces).
 */
function globalBlock(lines) {
  const start = lines.findIndex(line => line.trim() !== '' && !line.trim().startsWith('#'));
  if (start < 0 || lines[start] !== '{') refuse('CADDY_SHAPE_REFUSED');
  let depth = 1, adminOff = false;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (depth === 1 && lines[index].trim() === 'admin off') adminOff = true;
    depth += depthChange(lines[index]);
    if (depth === 0) {
      if (lines[index] !== '}' || !adminOff) refuse('CADDY_SHAPE_REFUSED');
      const first = lines.slice(start + 1, index).map(indentOf).find(indent => indent !== '') ?? '\t';
      return { close: index, unit: first.startsWith('\t') ? '\t' : /^ +/.exec(first)[0] };
    }
  }
  return refuse('CADDY_SHAPE_REFUSED');
}

/** The line opening the block that holds line `index` (scanning up, the first line whose braces leave that block). */
function enclosingOpen(lines, index) {
  let depth = 0;
  for (let at = index - 1; at >= 0; at -= 1) {
    depth += depthChange(lines[at]);
    if (depth > 0) return at;
  }
  return refuse('CADDY_SHAPE_REFUSED');
}

/** The lines inside the proxy block opened at `open` (up to its closing brace). */
function blockBody(lines, open) {
  let depth = 1;
  for (let index = open + 1; index < lines.length; index += 1) {
    depth += depthChange(lines[index]);
    if (depth === 0) return lines.slice(open + 1, index);
  }
  return refuse('CADDY_SHAPE_REFUSED');
}

/** The change itself; also returns how many proxy lines it changed (the CLI prints it). */
function transform(liveText) {
  if (typeof liveText !== 'string') refuse('CADDY_SHAPE_REFUSED');
  // A second run, or a file someone already changed by hand: never stack a second set of rules or listeners.
  if (liveText.includes(SNIPPET_NAME) || new RegExp(`(^|[^0-9]):${EDGE_LISTENER.port}(?![0-9])`).test(liveText)
    || new RegExp(`${escape(`127.0.0.1:${PREVIEW_SLOTS.B.uiPort}`)}(?![0-9])`).test(liveText)) refuse('CADDY_ALREADY_TWO_SLOTS');
  const lines = liveText.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const { close, unit } = globalBlock(lines);
  const proxies = lines.flatMap((line, index) => (ANY_PROXY.test(line) ? [index] : []));
  // Every proxy is today's slot-A block: another upstream (or a second one) means a file this change was not written for.
  if (proxies.length === 0 || proxies.some(index => !SLOT_A_PROXY.test(lines[index]))) refuse('CADDY_SHAPE_REFUSED');
  // The main route's block (the last one) is the one the listener copies: it must carry the edge secret.
  const main = blockBody(lines, proxies.at(-1));
  if (!main.some(line => EDGE_SECRET_LINE.test(line))) refuse('CADDY_SHAPE_REFUSED');
  const headers = main.filter(line => /^[ \t]*header_up /.test(line)).map(line => line.trim());
  // The public route refuses /readyz first thing in the block holding the main proxy (final fix wave W2): in a `route`
  // it runs before everything written after it (the wrong-host check, the password), and in a site or `handle` block
  // Caddy orders `respond` before `reverse_proxy` anyway. Only Caddy's health checks (straight at the slot ports) and
  // the loopback listener below reach a website's /readyz.
  const publicOpen = enclosingOpen(lines, proxies.at(-1));
  if (publicOpen <= close) refuse('CADDY_SHAPE_REFUSED');
  const publicIndent = indentOf(lines[proxies.at(-1)]);
  const reindent = text => text.replace(/^\t+/, tabs => unit.repeat(tabs.length));
  const snippet = SLOTS_SNIPPET.replace(/\n$/, '').split('\n').map(reindent);
  const out = [];
  for (const [index, line] of lines.entries()) {
    const match = SLOT_A_PROXY.exec(line);
    if (match) out.push(`${match[1]}reverse_proxy ${SLOT_UPSTREAMS} {`, `${match[1]}${unit}import ${SNIPPET_NAME}`);
    else out.push(line);
    if (index === close) out.push('', ...snippet);
    if (index === publicOpen) out.push(`${publicIndent}${PUBLIC_READYZ_COMMENT}`, `${publicIndent}${PUBLIC_READYZ_REFUSAL}`);
  }
  // The listener is for readiness only (controller ruling, D9): exactly GET /readyz is proxied, always asking the
  // website for /readyz itself (Caddy's path matcher compares the cleaned path, so /readyz/../api does not match, and
  // keeps a trailing slash, so /readyz/ does not either); `rewrite * /readyz?` sets the path and, with its bare `?`,
  // clears the query string (D9 review; the transition's TA0 confirms the adapted rewrite with `caddy adapt`); every
  // other request answers 404 from Caddy, unproxied and without the edge secret.
  const [u1, u2, u3] = [unit, unit.repeat(2), unit.repeat(3)];
  out.push('', `:${EDGE_LISTENER.port} {`, `${u1}bind ${EDGE_LISTENER.bind}`,
    `${u1}@readyz {`, `${u2}method GET`, `${u2}path /readyz`, `${u1}}`,
    `${u1}handle @readyz {`, `${u2}rewrite * /readyz?`, `${u2}reverse_proxy ${SLOT_UPSTREAMS} {`, `${u3}import ${SNIPPET_NAME}`,
    ...headers.map(header => `${u3}${header}`), `${u2}}`, `${u1}}`,
    `${u1}handle {`, `${u2}respond 404`, `${u1}}`, '}');
  return { text: `${out.join('\n')}\n`, proxiesChanged: proxies.length };
}

/**
 * Side-by-side spec §6, the one-time change. Inserts the shared rules right after the global options block, turns
 * every `reverse_proxy 127.0.0.1:3100 {` into a two-slot proxy that imports them, makes `respond /readyz 404` the first
 * line of the block holding the main proxy (the public route never answers readiness, W2), and appends the loopback listener:
 * GET /readyz only, proxied with the main route's header_up lines (so the website sees the same host, forwarding and
 * edge secret), and 404 for everything else. Every other
 * line stays byte for byte; new lines follow the file's own indentation. Refuses CADDY_ALREADY_TWO_SLOTS (the rules,
 * the listener port or slot B already there) and CADDY_SHAPE_REFUSED (no global block with `admin off`, no slot-A
 * proxy, any other proxy, or a main proxy block without the edge secret).
 */
export function transformCaddyfile(liveText) {
  return transform(liveText).text;
}

/**
 * README §14.7, after T: adds Caddy's payment marks rule to the live two-slot file, and nothing else. The rule goes
 * immediately before the main proxy (`reverse_proxy <both slots> {` at the own top level of the block that holds the
 * one `respond /readyz 404`, i.e. the public route), at that line's indentation in the file's own unit: after the
 * readiness refusal and the password, never inside the notify handle or the loopback listener (their proxies sit
 * deeper or in another block). Refuses CADDY_NOT_TWO_SLOTS (no `import debateai_slots` line or no slot-B upstream),
 * CADDY_ALREADY_PAYMENT_MARKS (the text already mentions payment-marks) and CADDY_SHAPE_REFUSED (no global block with
 * `admin off`, not exactly one readiness refusal, not exactly one proxy at that block's top level, or no `basic_auth`
 * before it there).
 */
export function addPaymentMarks(liveText) {
  if (typeof liveText !== 'string') refuse('CADDY_SHAPE_REFUSED');
  if (!new RegExp(`^[ \\t]*import ${SNIPPET_NAME}$`, 'm').test(liveText)
    || !new RegExp(`${escape(`127.0.0.1:${PREVIEW_SLOTS.B.uiPort}`)}(?![0-9])`).test(liveText)) refuse('CADDY_NOT_TWO_SLOTS');
  if (liveText.includes('payment-marks')) refuse('CADDY_ALREADY_PAYMENT_MARKS');
  const lines = liveText.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const { close, unit } = globalBlock(lines);
  const refusals = lines.flatMap((line, index) => (line.trim() === PUBLIC_READYZ_REFUSAL ? [index] : []));
  if (refusals.length !== 1) refuse('CADDY_SHAPE_REFUSED');
  const publicOpen = enclosingOpen(lines, refusals[0]);
  if (publicOpen <= close) refuse('CADDY_SHAPE_REFUSED');
  // The lines at the public block's own top level (depth 0 inside it), up to its closing brace.
  const top = [];
  for (let index = publicOpen + 1, depth = 0; ; index += 1) {
    if (index >= lines.length) refuse('CADDY_SHAPE_REFUSED');
    if (depth === 0 && lines[index].trim() !== '}') top.push(index);
    depth += depthChange(lines[index]);
    if (depth < 0) break;
  }
  const proxies = top.filter(index => ANY_PROXY.test(lines[index]));
  const proxy = proxies[0];
  if (proxies.length !== 1 || lines[proxy].trim() !== `reverse_proxy ${SLOT_UPSTREAMS} {`) refuse('CADDY_SHAPE_REFUSED');
  // In a `route` Caddy runs the directives as written: the marks are served only behind the password.
  if (!top.some(index => index < proxy && /^[ \t]*basic_auth(?:[ \t]|$)/.test(lines[index]))) refuse('CADDY_SHAPE_REFUSED');
  const indent = indentOf(lines[proxy]);
  const rule = PAYMENT_MARKS_RULE.map(line => `${indent}${line.replace(/^\t+/, tabs => unit.repeat(tabs.length))}`);
  return `${[...lines.slice(0, proxy), ...rule, ...lines.slice(proxy)].join('\n')}\n`;
}

const absolute = path => typeof path === 'string' && isAbsolute(path) && normalize(path) === path && !path.endsWith('/') && !/[\0-\x1f\x7f]/.test(path);

/** The two commands: the text change and the event line it prints (a fresh object, keys in this order). */
const COMMANDS = Object.freeze({
  transform: liveText => {
    const { text, proxiesChanged } = transform(liveText);
    return { text, event: { event: 'PREVIEW_CADDY_TWO_SLOTS', proxiesChanged, edgeListener: EDGE_LISTENER.port } };
  },
  'add-payment-marks': liveText => ({ text: addPaymentMarks(liveText), event: { event: 'PREVIEW_CADDY_PAYMENT_MARKS', folder: PAYMENT_MARKS.folder, files: [...PAYMENT_MARKS.files] } })
});

/** Exactly `transform|add-payment-marks --in <abs> --out <abs>`, each once. */
function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!Object.hasOwn(COMMANDS, command ?? '') || rest.length !== 4) refuse('ARGUMENTS_REFUSED');
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const [flag, value] = [rest[index], rest[index + 1]];
    if (!['--in', '--out'].includes(flag) || Object.hasOwn(options, flag) || !absolute(value)) refuse('ARGUMENTS_REFUSED');
    options[flag] = value;
  }
  return { command, input: options['--in'], output: options['--out'] };
}

/** Create `path` new (O_EXCL, no symlink followed), 0644, write every byte and fsync. The output is never replaced. */
async function writeNewFile(path, bytes) {
  let handle;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  } catch (error) { refuse(error?.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_PATH_REFUSED'); }
  try {
    await handle.chmod(0o644);
    for (let offset = 0; offset < bytes.length;) offset += (await handle.write(bytes, offset)).bytesWritten;
    await handle.sync();
  } catch { refuse('OUTPUT_WRITE_FAILED'); } finally { await handle.close().catch(() => undefined); }
}

/** Both commands: custody-read the live file, change its text, write the copy new and read it back (header). */
async function writeCommand({ command, input, output }, layout, deps = {}) {
  const owner = layout.ownerUid ?? 0;
  // The output's folder is root's alone, and nothing is at the output yet: checked before the live file is read.
  try { await protectedPath(output, { root: dirname(output), uid: owner }); } catch { refuse('OUTPUT_PATH_REFUSED'); }
  const present = await lstat(output).then(() => true, error => (error?.code === 'ENOENT' ? false : refuse('OUTPUT_PATH_REFUSED')));
  if (present) refuse('OUTPUT_EXISTS');
  let liveText;
  try {
    liveText = await withPrivateBytes(input, { root: dirname(input), uid: owner, mode: 0o644, maxBytes: MAX_CADDYFILE_BYTES }, raw => new TextDecoder('utf8', { fatal: true }).decode(raw));
  } catch { refuse('INPUT_REFUSED'); }
  const { text, event } = COMMANDS[command](liveText);
  const bytes = Buffer.from(text, 'utf8');
  try { await (deps.write ?? writeNewFile)(output, bytes); } catch (error) { refuse(error instanceof CaddySlotsRefusal ? error.code : 'OUTPUT_WRITE_FAILED'); }
  // What is on disk is what the runbook validates and installs: read it back (root-owned, 0644, one link, no more bytes
  // than were written) and compare every byte. A file that differs is kept for the operator (header).
  let equal = false;
  try {
    equal = await withPrivateBytes(output, { root: dirname(output), uid: owner, mode: 0o644, maxBytes: bytes.length }, raw => Buffer.compare(raw, bytes) === 0);
  } catch { refuse('OUTPUT_READBACK_REFUSED'); }
  if (!equal) refuse('OUTPUT_READBACK_REFUSED');
  return Object.freeze(event);
}

const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** One JSON line on stdout and 0, or one refusal line on stderr and 1. `deps.write(path, bytes)` replaces the output writer (tests). */
export async function main(argv, { actor = {}, layout = {}, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const args = parseArguments(argv);
    try { assertActor(actor); } catch { refuse('ACTOR_REFUSED'); }
    stdout.write(`${JSON.stringify(await writeCommand(args, layout, deps))}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${JSON.stringify({ event: 'PREVIEW_CADDY_REFUSED', reason: error instanceof CaddySlotsRefusal && CODE.test(error.code) ? error.code : 'UNEXPECTED' })}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
