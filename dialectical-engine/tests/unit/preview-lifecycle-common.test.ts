import { describe, expect, it } from 'vitest';
import { mkdtempSync, realpathSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');
const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-common-')));
const me = { uid: process.getuid!(), gid: process.getgid!() };

describe('preview lifecycle shared helpers', () => {
  it('writes atomically with the exact mode and owner and leaves no temporary file', async () => {
    const dir = scratch(), path = join(dir, 'api-launch.json');
    writeFileSync(path, 'old');
    chmodSync(path, 0o600);
    await common.atomicWrite(path, Buffer.from('{"new":true}'), { mode: 0o644, ...me });
    expect(readFileSync(path, 'utf8')).toBe('{"new":true}');
    expect(statSync(path).mode & 0o777).toBe(0o644);
    expect(statSync(path).nlink).toBe(1);
    expect(readdirSync(dir)).toEqual(['api-launch.json']);
  });

  it('refuses to replace a symlink or a directory at the target path', async () => {
    const dir = scratch();
    writeFileSync(join(dir, 'real.json'), 'x');
    symlinkSync(join(dir, 'real.json'), join(dir, 'link.json'));
    mkdirSync(join(dir, 'folder.json'));
    await expect(common.atomicWrite(join(dir, 'link.json'), Buffer.from('y'), { mode: 0o644, ...me })).rejects.toThrow(/LIFECYCLE_WRITE_REFUSED/);
    await expect(common.atomicWrite(join(dir, 'folder.json'), Buffer.from('y'), { mode: 0o644, ...me })).rejects.toThrow(/LIFECYCLE_WRITE_REFUSED/);
    expect(readFileSync(join(dir, 'real.json'), 'utf8')).toBe('x');
    expect(readdirSync(dir).sort()).toEqual(['folder.json', 'link.json', 'real.json']);
  });

  it('creates a missing directory with the exact mode and refuses a symlinked or loose one', async () => {
    const dir = scratch();
    await common.ensureDirectory(join(dir, 'state'), { mode: 0o700, uid: me.uid });
    expect(statSync(join(dir, 'state')).mode & 0o777).toBe(0o700);
    await common.ensureDirectory(join(dir, 'state'), { mode: 0o700, uid: me.uid });
    mkdirSync(join(dir, 'loose'));
    chmodSync(join(dir, 'loose'), 0o777);
    await expect(common.ensureDirectory(join(dir, 'loose'), { mode: 0o700, uid: me.uid })).rejects.toThrow(/LIFECYCLE_DIRECTORY_REFUSED/);
    symlinkSync(join(dir, 'state'), join(dir, 'alias'));
    await expect(common.ensureDirectory(join(dir, 'alias'), { mode: 0o700, uid: me.uid })).rejects.toThrow(/LIFECYCLE_DIRECTORY_REFUSED/);
  });

  it('bounds a child by time and kills its whole process group', async () => {
    const started = Date.now();
    const result = await common.runBounded([process.execPath, '-e', 'setInterval(()=>{},1000)'], { env: {}, timeoutMs: 300, maxOutputBytes: 1024 });
    expect(result.timedOut).toBe(true);
    expect(result.code).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('bounds a child by output size', async () => {
    const result = await common.runBounded([process.execPath, '-e', 'process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)'], { env: {}, timeoutMs: 5000, maxOutputBytes: 1000 });
    expect(result.overflow).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(1000);
  });

  it('passes stdin bytes and returns exact stdout/stderr and exit code', async () => {
    const result = await common.runBounded([process.execPath, '-e', 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{process.stdout.write(b.toUpperCase());process.stderr.write("E");process.exitCode=3;})'], { env: {}, stdin: Buffer.from('abc'), timeoutMs: 5000, maxOutputBytes: 1000 });
    expect(result).toMatchObject({ code: 3, timedOut: false, overflow: false });
    expect(result.stdout.toString()).toBe('ABC');
    expect(result.stderr.toString()).toBe('E');
  });

  it('passes an already-open file as stdin and as stdout', async () => {
    const dir = scratch();
    writeFileSync(join(dir, 'in.txt'), 'from-file');
    const { openSync, closeSync } = await import('node:fs');
    const input = openSync(join(dir, 'in.txt'), 'r'), output = openSync(join(dir, 'out.txt'), 'w');
    try {
      const result = await common.runBounded([process.execPath, '-e', 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>process.stdout.write(b+"!"))'], { env: {}, stdin: input, stdoutFd: output, timeoutMs: 5000, maxOutputBytes: 1000 });
      expect(result.code).toBe(0);
    } finally { closeSync(input); closeSync(output); }
    expect(readFileSync(join(dir, 'out.txt'), 'utf8')).toBe('from-file!');
  });

  it('hands the peer packet to the actor on a real pipe at FD3 and keeps stdin for private control bytes', async () => {
    const actor = 'const fs=require("node:fs");const s=fs.fstatSync(3);let p="";const b=Buffer.alloc(512);for(;;){const n=fs.readSync(3,b,0,512,null);if(!n)break;p+=b.subarray(0,n);}' +
      'let c="";process.stdin.on("data",d=>c+=d).on("end",()=>process.stdout.write(JSON.stringify({fifo:s.isFIFO(),packet:p,control:c,argv:process.argv.slice(2),env:Object.keys(process.env).filter(k=>k!=="__CF_USER_TEXT_ENCODING").sort()})));';
    const script = join(scratch(), 'actor.cjs');
    writeFileSync(script, actor);
    const argv = common.peerShimArgv({ sh: '/bin/sh', packet: '{"peerUrl":"synthetic"}', command: ['/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', process.execPath, script, '--credential-fd', '3'] });
    expect(argv.slice(0, 2)).toEqual(['/bin/sh', '-c']);
    expect(argv.join(' ')).not.toContain('control-secret');
    const result = await common.runBounded(argv, { env: {}, stdin: Buffer.from('control-secret'), timeoutMs: 10000, maxOutputBytes: 4096 });
    expect(result.code).toBe(0);
    // macOS adds __CF_USER_TEXT_ENCODING to every process; Linux adds nothing.
    const seen = JSON.parse(result.stdout.toString());
    expect(seen).toEqual({ fifo: true, packet: '{"peerUrl":"synthetic"}', control: 'control-secret', argv: ['--credential-fd', '3'], env: ['LANG', 'LC_ALL', 'PATH', 'TZ'] });
  });

  it('serialises canonically so key order never changes a comparison', () => {
    expect(common.canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });

  it('logs exactly one JSON line per event', () => {
    const chunks: string[] = [];
    common.logLine({ write: (s: string) => chunks.push(s) }, { event: 'X', n: 1 });
    expect(chunks).toEqual(['{"event":"X","n":1}\n']);
  });
});
