// Dónde vive Walkie Talkie en esta carpeta: .walkie/ junto al proyecto del harness.
// WALKIE_DIR apunta directo a esa carpeta (lo usa el servidor MCP).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function buscar(desde = process.cwd()) {
  if (process.env.WALKIE_DIR) return resolve(process.env.WALKIE_DIR);
  let d = resolve(desde);
  for (;;) {
    if (existsSync(join(d, '.walkie', 'config.json'))) return join(d, '.walkie');
    const p = dirname(d);
    if (p === d) return null;
    d = p;
  }
}

export function leerConfig(w) {
  return JSON.parse(readFileSync(join(w, 'config.json'), 'utf8'));
}

export function guardarJson(p, o) {
  writeFileSync(p + '.tmp', JSON.stringify(o, null, 1) + '\n');
  writeFileSync(p, readFileSync(p + '.tmp'));
}

export function leerJson(p, d) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; }
}
