#!/bin/bash
# stamp-check.sh — the mission's ONE gate-record comparator (D41). Ad-hoc variants are forbidden.
# Usage: stamp-check.sh <lane-worktree> <log-glob-prefix>
# v4.1 (F-TOOL-MUTATE-3; codex r3 B1–B4, N1; 2026-09-07). Reads the v4 RECORD FORMAT of gate-run.sh v4.x / mutate.sh
# v4.x (per-run nonce on the header, the fences and the completion lines) with a STRUCTURAL parser:
#   1. the whole file is walked once with a SPAN STACK: an opener  <<<OUTPUT:<N> | <<<OLD:<N> bytes=n | <<<TOKEN:<N> bytes=n
#      pushes (type,N); the matching closer  OUTPUT>>>:<N> | OLD>>>:<N> | TOKEN>>>:<N>  pops it; a closer of another type or
#      nonce, while a span is open, is payload. Everything inside a span is payload.
#   2. a v4 HEADER is a candidate only OUTSIDE every span (B1: an inner transcript echoed inside an outer OUTPUT is payload);
#      the newest candidate is the record's block; its identity is its commit.
#   3. the block's FRAMING is validated (B2): mutate → exactly one OLD, one TOKEN and one OUTPUT span with the block's nonce,
#      in that order, each closed, each payload's byte length equal to its declared bytes= (the emitter's framing newline
#      after the literal is not counted); gate → exactly one OUTPUT span, closed; no span of the block's nonce left open at EOF.
#   4. COMPLETION is read only from lines outside spans after the header, with the block's nonce, in order:
#      gate   →  EXIT:<N> = n   then  CLEAN-STATE:<N> unchanged…    (a nonzero EXIT is a legitimate failing gate; CHANGED → UNCLEAN)
#      mutate →  EXIT:<N> = n   then  RESULT:<N> ok — <seven fields>  matched by an ANCHORED grammar (B3): pre=0, applied>0,
#                declared==applied or any, restored=0, hashes=match, porcelain=empty, cmd_exit==n; RESULT:<N> FAIL … → APPARATUS-FAIL
#      a header with no complete matching completion is INCOMPLETE; the comparator never falls back to an older block.
# TRUST MODEL (B4): the nonce prevents ACCIDENTAL collisions with command output; it is not a secret from the command and
# not authentication — the parser is structural so that it stays correct with known delimiters; a same-user writable
# transcript is never tamper-proof, and a green result is an IDENTITY check, not proof of fresh execution.
# LEGACY records (v3 headers without a nonce; bare stamps) are judged by the v3.2 rules and counted as legacy.
# Population: files under the prefix except *.sha256, *.pid, *.json, *comparator*, *stamp-check*.
set -u
LANE="$1"; PREFIX="$2"
TIP=$(git -C "$LANE" rev-parse HEAD 2>/dev/null) || { echo "cannot resolve HEAD of $LANE"; exit 2; }
echo "TIP=$TIP  (resolved with git -C $LANE rev-parse HEAD)"
python3 - "$TIP" "$PREFIX" <<'PY'
import sys, re, glob, os
TIP, PREFIX = sys.argv[1], sys.argv[2]
HDR = re.compile(r'^commit=([0-9a-f]{40}) tree=[0-9a-f]{40}.*?( gate=|mutate\.sh v4)[^\n]*? record=v4 nonce=([0-9a-f]{18})')
OPEN = re.compile(r'^<<<(OUTPUT|OLD|TOKEN):([0-9a-f]{18})(?: bytes=(\d+))?$')
CLOSE = re.compile(r'^(OUTPUT|OLD|TOKEN)>>>:([0-9a-f]{18})$')
RESULT_OK = re.compile(r'^RESULT:([0-9a-f]{18}) ok — pre=(\d+) applied=(\d+) declared=(\d+|any) restored=(\d+) hashes=(match|DIFFER) porcelain=(empty|\[[^\]]*\]) cmd_exit=(\d{1,3})$')
LEG_HDR = re.compile(r'^commit=([0-9a-f]{40}) tree=[0-9a-f]{40}.*( gate=|mutate\.sh v3)')
n = fail = legacy = 0
for f in sorted(glob.glob(PREFIX + '*')):
    if not os.path.isfile(f): continue
    base = os.path.basename(f)
    if base.endswith(('.sha256', '.pid', '.json')) or 'comparator' in base or 'stamp-check' in base: continue
    n += 1
    raw = open(f, 'rb').read(); lines = raw.decode('utf-8', 'replace').split('\n')
    if lines and lines[-1] == '': lines.pop()
    # pass 1: structural walk — depth per line, spans (type, nonce, open_line, close_line, payload_bytes), candidate headers
    stack = []; spans = []; depth = []; cands = []
    for i, l in enumerate(lines):
        mo = OPEN.match(l); mc = CLOSE.match(l)
        if stack:
            if mc and (mc.group(1), mc.group(2)) == stack[-1][:2]:
                t, N, start, declared = stack.pop()
                payload = '\n'.join(lines[start+1:i]); pb = len(payload.encode('utf-8'))
                spans.append((t, N, start, i, pb, declared)); depth.append(len(stack)); continue
            depth.append(len(stack))
            if mo: stack.append((mo.group(1), mo.group(2), i, mo.group(3)))   # nested opener (different nonce/type) is payload but tracked
            continue
        depth.append(0)
        if mo: stack.append((mo.group(1), mo.group(2), i, mo.group(3))); continue
        mh = HDR.match(l)
        if mh: cands.append((i, mh.group(1), mh.group(3), 'mutate' if 'mutate.sh v4' in l else 'gate'))
    unclosed = list(stack)
    if cands:
        hi, c, N, kind = cands[-1]
        mine = [s for s in spans if s[1] == N and s[2] > hi]
        open_mine = [s for s in unclosed if s[1] == N]
        def bad(tag, why): print(f"{tag} {f} ({why})")
        # the emitter's own FAIL verdict may precede the command (pre-gate, apply, multiplicity): a structurally complete,
        # failed run — reported before any framing check, never as a passing identity
        rf = next((l for i, l in enumerate(lines) if i > hi and depth[i] == 0 and l.startswith(f'RESULT:{N} FAIL')), None)
        if rf: bad("APPARATUS-FAIL", rf[:80]); fail += 1; continue
        if open_mine: bad("INCOMPLETE", f"a {open_mine[0][0]} span of the block's nonce is never closed"); fail += 1; continue
        types = [s[0] for s in sorted(mine, key=lambda s: s[2])]
        if kind == 'mutate':
            if types != ['OLD', 'TOKEN', 'OUTPUT']: bad("MALFORMED", f"mutate spans {types} ≠ [OLD, TOKEN, OUTPUT]"); fail += 1; continue
            for s in mine:
                if s[0] in ('OLD', 'TOKEN'):
                    if s[5] is None: bad("MALFORMED", f"{s[0]} span lacks bytes="); fail += 1; break
                    if int(s[5]) != s[4]: bad("MALFORMED", f"{s[0]} declared bytes={s[5]} but payload is {s[4]} bytes"); fail += 1; break
            else:
                pass
            if any(s[0] in ('OLD','TOKEN') and (s[5] is None or int(s[5]) != s[4]) for s in mine): continue
        else:
            if types != ['OUTPUT']: bad("MALFORMED", f"gate spans {types} ≠ [OUTPUT]"); fail += 1; continue
        # completion: lines after the header, outside spans, with the block's nonce
        after = [(i, l) for i, l in enumerate(lines) if i > hi and depth[i] == 0]
        ex = next(((i, l) for i, l in after if re.match(rf'^EXIT:{N} = \d{{1,3}}$', l)), None)
        if kind == 'gate':
            cs = next(((i, l) for i, l in after if l.startswith(f'CLEAN-STATE:{N} ')), None)
            if not ex or not cs: bad("INCOMPLETE", f"no EXIT:{N} / CLEAN-STATE:{N} outside the block's spans"); fail += 1; continue
            if cs[0] < ex[0]: bad("INCOMPLETE", "CLEAN-STATE precedes EXIT"); fail += 1; continue
            if not cs[1].startswith(f'CLEAN-STATE:{N} unchanged'): bad("UNCLEAN", cs[1][:80]); fail += 1; continue
        else:
            rs = next(((i, l) for i, l in after if l.startswith(f'RESULT:{N} ')), None)
            if rs and rs[1].startswith(f'RESULT:{N} FAIL'): bad("APPARATUS-FAIL", rs[1][:80]); fail += 1; continue
            if not ex or not rs: bad("INCOMPLETE", f"no EXIT:{N} / RESULT:{N} outside the block's spans"); fail += 1; continue
            if rs[0] < ex[0]: bad("INCOMPLETE", "RESULT precedes EXIT"); fail += 1; continue
            m = RESULT_OK.match(rs[1])
            if not m: bad("MALFORMED", f"RESULT line does not match the success grammar: {rs[1][:90]}"); fail += 1; continue
            _, pre, ap, dc, rs_, hs, po, ce = m.groups(); exv = ex[1].rsplit(' ', 1)[1]
            why = []
            if pre != '0': why.append(f'pre={pre}')
            if int(ap) <= 0: why.append(f'applied={ap}')
            if dc != 'any' and dc != ap: why.append(f'declared={dc}≠applied={ap}')
            if rs_ != '0': why.append(f'restored={rs_}')
            if hs != 'match': why.append(f'hashes={hs}')
            if po != 'empty': why.append(f'porcelain={po}')
            if ce != exv: why.append(f'cmd_exit={ce}≠EXIT={exv}')
            if why: bad("FIELD-MISMATCH", "RESULT ok but: " + ' '.join(why)); fail += 1; continue
        if c != TIP: print(f"STALE    {f} -> {c}"); fail += 1
        continue
    # LEGACY (v3.2 rules)
    legacy += 1
    s = 0; frame = []
    for i, l in enumerate(lines):
        if l.startswith('<<<OUTPUT') or l.startswith('<<<OLD') or l.startswith('<<<TOKEN'): s = 1; continue
        if l.startswith('OUTPUT>>>') or l.startswith('OLD>>>') or l.startswith('TOKEN>>>'): s = 0; continue
        if not s and (LEG_HDR.match(l) or re.match(r'^EXIT = \d+', l) or l.startswith('CLEAN-STATE:') or l.startswith('RESULT: ')): frame.append((i, l))
    hdrs = [(i, l) for i, l in frame if LEG_HDR.match(l)]
    if hdrs:
        hi, hl = hdrs[-1]; c = LEG_HDR.match(hl).group(1); after = [l for i, l in frame if i > hi]
        e = next((k for k, l in enumerate(after) if re.match(r'^EXIT = \d+', l)), None)
        if 'mutate.sh v3' in hl:
            r = next((k for k, l in enumerate(after) if l.startswith('RESULT: ')), None)
            if e is None or r is None or r < e: print(f"INCOMPLETE {f} (legacy v3 mutate block lacks EXIT then RESULT)"); fail += 1; continue
        else:
            k = next((k for k, l in enumerate(after) if l.startswith('CLEAN-STATE:')), None)
            if e is None or k is None or k < e: print(f"INCOMPLETE {f} (legacy v3 gate block lacks EXIT then CLEAN-STATE)"); fail += 1; continue
    else:
        stamps = sorted(set(re.findall(r'commit[=: ]+([0-9a-f]{40})', raw.decode('utf-8','replace'), flags=re.I)))
        if not stamps: print(f"NO-STAMP {f}"); fail += 1; continue
        if len(stamps) > 1: print(f"AMBIGUOUS {f} (bare stamps: {' '.join(x[:8] for x in stamps)})"); fail += 1; continue
        c = stamps[0]
    if c != TIP: print(f"STALE    {f} -> {c}"); fail += 1
print(f"records compared: {n} · failures: {fail} · legacy-framed: {legacy}")
if n == 0: print("REFUSING: the glob matched no records — an empty result is not a pass"); sys.exit(3)
if fail == 0: print("OK (identity only; not proof of fresh execution): every record stamps the filed tip"); sys.exit(0)
sys.exit(1)
PY
