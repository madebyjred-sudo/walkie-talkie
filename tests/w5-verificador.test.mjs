// W5: el verificador revisa el commit del otro en un worktree de solo lectura y da el mismo veredicto
// que una persona. Sintético (corre en cualquier lado) + 5 verificaciones reales (si están en esta máquina).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { canal } from './ayuda.mjs';
import { verificar, correr, humo } from '../src/verificador.mjs';

const g = (d, ...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8', stdio: 'pipe' });

// Un repo chico: suma.js con un error y su prueba.
function repo() {
  const d = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'walkie-repo-'));
  g(d, 'init', '-q', '-b', 'main');
  g(d, 'config', 'user.email', 't@t'); g(d, 'config', 'user.name', 't'); g(d, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(d, 'suma.js'), 'module.exports = (a, b) => a - b;\n');
  writeFileSync(join(d, 'otro.js'), 'module.exports = 1;\n');
  g(d, 'add', '-A'); g(d, 'commit', '-q', '-m', 'base');
  const rama = (n, archivos) => {
    g(d, 'checkout', '-q', '-b', n, 'main');
    for (const [f, t] of Object.entries(archivos)) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), t); }
    g(d, 'add', '-A'); g(d, 'commit', '-q', '-m', n); g(d, 'checkout', '-q', 'main');
  };
  const prueba = "const t = require('node:test'); const a = require('node:assert'); t('suma', () => a.equal(require('../suma.js')(2, 2), 4));\n";
  rama('buena', { 'suma.js': 'module.exports = (a, b) => a + b;\n', 'tests/suma.test.js': prueba });
  rama('prueba-floja', { 'suma.js': 'module.exports = (a, b) => a + b;\n', 'tests/suma.test.js': "require('node:test')('x', () => {});\n" });
  rama('se-pasa', { 'suma.js': 'module.exports = (a, b) => a + b;\n', 'otro.js': 'module.exports = 2;\n', 'tests/suma.test.js': prueba });
  rama('omitida', { 'suma.js': 'module.exports = (a, b) => a + b;\n', 'tests/suma.test.js': "console.log('OMITIDA: falta el navegador'); process.exit(0);\n" });
  rama('rota', { 'suma.js': 'module.exports = (a, b) => a * b + 1;\n', 'tests/suma.test.js': prueba });
  return d;
}

function conConfig(c, conf) {
  const p = join(c.rosa, 'config.json');
  const o = JSON.parse(readFileSync(p, 'utf8'));
  o.verificar = conf;
  writeFileSync(p, JSON.stringify(o));
}
const v = async (c, flags) => { process.env.WALKIE_DIR = c.rosa; try { return await verificar({ 'sin-traer': true, ...flags }); } finally { delete process.env.WALKIE_DIR; } };

test('el mismo veredicto que una persona en los cinco casos de siempre', async () => {
  const c = canal('rosa');
  const d = repo();
  conConfig(c, { app: { ruta: d, base: 'main', prueba: 'node --test {pruebas}', permitido: ['suma.js', 'tests/**'] } });
  const r = {};
  for (const n of ['buena', 'prueba-floja', 'se-pasa', 'omitida', 'rota']) r[n] = await v(c, { repo: 'app', rama: n });
  assert.ok(r.buena.ok, r.buena.texto);
  assert.match(r['prueba-floja'].texto, /pasa también sin el arreglo/);
  assert.match(r['se-pasa'].texto, /fuera del contrato \(otro\.js\)/);
  assert.match(r.omitida.texto, /se omitió/);
  assert.match(r.rota.texto, /no pasa con el arreglo/);
  for (const n of ['prueba-floja', 'se-pasa', 'omitida', 'rota']) assert.equal(r[n].ok, false, n);
  // Solo lectura: el repo no cambió y no quedó ningún worktree.
  assert.equal(g(d, 'status', '--porcelain'), '');
  assert.equal(g(d, 'worktree', 'list').trim().split('\n').length, 1);
});

test('nada se corre desde un mensaje: repo no configurado, rama con inyección', async () => {
  const c = canal('rosa');
  const d = repo();
  conConfig(c, { app: { ruta: d, base: 'main', prueba: 'node --test {pruebas}' } });
  assert.match((await v(c, { repo: 'otro', rama: 'buena' })).texto, /Lo agrega tu dueño/);
  for (const rama of ['buena;touch /tmp/walkie-pwn', '$(touch /tmp/walkie-pwn)', '--upload-pack=touch', '../../etc']) {
    const r = await v(c, { repo: 'app', rama });
    assert.equal(r.ok, false);
  }
  assert.match((await v(c, { repo: 'app', rama: 'buena', prueba: 'x;rm -rf ~' })).texto, /inválida/);
  assert.ok(!existsSync('/tmp/walkie-pwn'));
});

test('lo que corre adentro no lee tus llaves, no escribe afuera y no sale a la red', { skip: process.platform !== 'darwin' }, () => {
  const tmp = realpathSync(mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'walkie-sb-')));
  const wt = join(tmp, 'wt'); mkdirSync(wt);
  const casa = homedir();
  const afuera = join(casa, `.walkie-escape-${process.pid}`);
  const r = correr(`ls ${casa}/.ssh >/dev/null 2>&1 && echo LEYO-SSH; echo x > ${afuera} 2>/dev/null && echo ESCRIBIO; curl -s -m 5 https://example.com >/dev/null 2>&1 && echo SALIO; echo ok > adentro.txt && echo ESCRIBE-ADENTRO`, wt, tmp, {});
  assert.doesNotMatch(r.salida, /LEYO-SSH|ESCRIBIO|SALIO/);
  assert.match(r.salida, /ESCRIBE-ADENTRO/);
  assert.ok(!existsSync(afuera));
});

test('humo: la URL responde y trae lo que cambió', async () => {
  const http = await import('node:http');
  const s = http.createServer((q, r) => { r.writeHead(q.url === '/' ? 200 : 404); r.end('<h1>Agenda nueva</h1>'); }).listen(0);
  const u = `http://127.0.0.1:${s.address().port}`;
  assert.ok((await humo(u + '/', { contiene: 'Agenda nueva' })).ok);
  assert.match((await humo(u + '/', { contiene: 'Pedidos' })).texto, /«Pedidos»: no está/);
  assert.equal((await humo(u + '/x')).ok, false);
  assert.equal((await humo('file:///etc/passwd')).ok, false);
  s.close();
});

// Las 5 verificaciones reales viven fuera del repo (rutas y ramas de un cliente). Sin ese archivo, se salta.
const REALES = process.env.WALKIE_REALES || join(homedir(), '.walkie-talkie', 'verificaciones-reales.json');
test('5 verificaciones reales, mismo veredicto que el líder', { skip: !existsSync(REALES) && 'sin el archivo de casos reales', timeout: 900000 }, async () => {
  const casos = JSON.parse(readFileSync(REALES, 'utf8'));
  const c = canal('rosa');
  conConfig(c, { real: casos.config });
  for (const k of casos.casos) {
    const r = await v(c, { repo: 'real', rama: k.sha, base: k.base, prueba: k.prueba });
    assert.equal(r.ok, k.veredicto === 'verificada', `${k.nombre}\n${r.texto}`);
    if (k.razon) assert.match(r.texto, new RegExp(k.razon), k.nombre);
    for (const e of k.evidencia || []) assert.match(r.texto, new RegExp(e), `${k.nombre}: ${e}`);
  }
});
