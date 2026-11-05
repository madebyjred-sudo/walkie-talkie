import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unirse } from '../src/walkie.mjs';

export const BIN = new URL('../bin/walkie.mjs', import.meta.url).pathname;

// Un canal de cero: un repo bare (hace de repo privado) y una carpeta por persona.
export function canal(...nombres) {
  const base = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'walkie-'));
  const remoto = join(base, 'canal.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remoto]);
  const p = { base, remoto };
  for (const n of nombres) {
    const d = join(base, n);
    mkdirSync(d);
    unirse(remoto, n, d);
    p[n] = join(d, '.walkie');
  }
  return p;
}

export function correr(w, args, input) {
  return new Promise((ok, mal) => {
    const c = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, WALKIE_DIR: w } });
    let out = '', err = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (err += d));
    if (input) c.stdin.end(input); else c.stdin.end();
    c.on('close', (code) => (code === 0 ? ok(out) : mal(new Error(`walkie ${args[0]} salió ${code}: ${err || out}`))));
  });
}

export const gitEn = (dir, args, extra = {}) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', ...extra });
