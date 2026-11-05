// W8: el mismo test de W2, por HTTP. Una llave por persona; nadie habla a nombre de otro.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BIN, correr } from './ayuda.mjs';
import { unirse, hablar, escuchar, hilo, guardar } from '../src/walkie.mjs';
import { nuevaLlave } from '../src/relay.mjs';
import { nuevoId } from '../src/mensaje.mjs';

const base = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'walkie-relay-'));
const datos = join(base, 'datos');
const llaves = { rosa: nuevaLlave(datos, 'rosa'), teo: nuevaLlave(datos, 'teo'), eva: nuevaLlave(datos, 'eva') };
const puerto = 20000 + Math.floor(Math.random() * 20000);
const relay = spawn(process.execPath, [BIN, 'relay', '--datos', datos, '--puerto', String(puerto)]);
await new Promise((ok) => relay.stdout.on('data', ok));
after(() => relay.kill());
const URL_ = `http://127.0.0.1:${puerto}`;
const w = {};
for (const n of ['rosa', 'teo', 'eva']) { mkdirSync(join(base, n)); w[n] = unirse(URL_, n, join(base, n), undefined, llaves[n]).w; }

test('30 mensajes a la vez desde dos carpetas: llegan los 30', async () => {
  const envios = [];
  for (let i = 0; i < 15; i++) {
    envios.push(correr(w.rosa, ['hablar', '--para', 'teo', `rosa ${i}`]));
    envios.push(correr(w.teo, ['hablar', '--para', 'rosa', `teo ${i}`]));
  }
  await Promise.all(envios);
  const a = escuchar({}, w.rosa).nuevos, b = escuchar({}, w.teo).nuevos;
  assert.equal(a.length, 15); assert.equal(b.length, 15);
  assert.deepEqual(a.map((r) => r.m.texto).sort(), [...Array(15)].map((_, i) => `teo ${i}`).sort());
  assert.equal(escuchar({}, w.rosa).nuevos.length, 0);
});

test('un hilo: asignar, hecho, verificado', () => {
  const t = hablar({ para: 'teo', texto: 'Tarea: arregla el botón de guardar.' }, w.rosa);
  escuchar({}, w.teo);
  hablar({ para: 'rosa', hilo: t.id, texto: 'Hecha. Rama arreglo-guardar.', adjuntos: ['rama:arreglo-guardar'] }, w.teo);
  hablar({ para: 'teo', hilo: t.id, texto: 'Verificada.' }, w.rosa);
  const h = hilo({ id: t.id }, w.teo);
  assert.deepEqual([...h.matchAll(/<mensaje [^>]*de="(\w+)"/g)].map((x) => x[1]), ['rosa', 'teo', 'rosa']);
  assert.match(h, /firma="verificada"/);
});

test('las capturas viajan por el relay', () => {
  const png = join(base, 'captura.png');
  writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 9, 8, 7]));
  hablar({ para: 'rosa', texto: 'Hallazgo con captura.', adjuntos: [png] }, w.teo);
  const m = escuchar({}, w.rosa).nuevos.find((x) => x.m.texto === 'Hallazgo con captura.');
  assert.deepEqual(readFileSync(join(w.rosa, 'canal', m.m.adjuntos[0])), readFileSync(png));
});

test('los archivos del canal se editan sin pisar al otro', () => {
  escuchar({}, w.teo);
  writeFileSync(join(w.rosa, 'canal', 'metodo.md'), '# Método\n\nCaptura con hora.\n');
  assert.deepEqual(guardar('', w.rosa), ['metodo.md']);
  const r = escuchar({}, w.teo);
  assert.deepEqual(r.cambios.map((x) => x.archivo), ['metodo.md']);
  assert.match(readFileSync(join(w.teo, 'canal', 'metodo.md'), 'utf8'), /Captura con hora/);
  // teo parte de una versión vieja: el relay no deja pisar.
  writeFileSync(join(w.rosa, 'canal', 'metodo.md'), '# Método\n\nv2 de rosa.\n');
  guardar('', w.rosa);
  writeFileSync(join(w.teo, 'canal', 'metodo.md'), '# Método\n\nv2 de teo.\n');
  const viejo = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'PUT', '-H', `authorization: Bearer ${llaves.teo}`, '-H', 'if-match: cualquiera', '--data-binary', 'x', `${URL_}/archivos/metodo.md`], { encoding: 'utf8' });
  assert.equal(viejo, '409');
});

test('sin llave no entra; con la suya no habla por otro', () => {
  const pedir = (llave, metodo, ruta, cuerpo) => execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', metodo, '-H', `authorization: Bearer ${llave}`, ...(cuerpo ? ['--data-binary', JSON.stringify(cuerpo)] : []), URL_ + ruta], { encoding: 'utf8' });
  assert.equal(pedir('wk_falsa', 'GET', '/mensajes'), '401');
  assert.equal(pedir(llaves.eva, 'POST', '/mensajes', { id: nuevoId('rosa'), m: { para: 'teo', texto: 'soy rosa' } }), '400');
  const id = nuevoId('eva');
  assert.equal(pedir(llaves.eva, 'POST', '/mensajes', { id, m: { de: 'rosa', para: 'teo', texto: 'dice que soy rosa', adjuntos: [] } }), '201');
  const r = escuchar({}, w.teo).nuevos.find((x) => x.id === id);
  assert.equal(r.m.de, 'eva');
  assert.equal(pedir(llaves.eva, 'POST', '/mensajes', { id: nuevoId('eva'), m: { para: 'teo', texto: 'ghp' + '_Zq8xW2mK9pL4vN7rT1sY6uB3eH5gJ0dF2aC8', adjuntos: [] } }), '400');
  assert.equal(pedir(llaves.eva, 'PUT', `/adjuntos/${nuevoId('rosa')}/x.png`), '403');
  // La llave queda solo como hash en el disco del relay.
  assert.doesNotMatch(readFileSync(join(datos, 'llaves.json'), 'utf8'), /wk_/);
});
