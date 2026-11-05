// W2: dos clones en dos carpetas se hablan sin servidor; nada se pierde con push simultáneo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, symlinkSync, lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { canal, correr, gitEn } from './ayuda.mjs';
import { hablar, escuchar, hilo, guardar } from '../src/walkie.mjs';
import { nuevoId, serializar } from '../src/mensaje.mjs';

test('30 mensajes a la vez desde dos carpetas: llegan los 30, firmados', async () => {
  const c = canal('rosa', 'teo');
  const envios = [];
  for (let i = 0; i < 15; i++) {
    envios.push(correr(c.rosa, ['hablar', '--para', 'teo', `rosa ${i}`]));
    envios.push(correr(c.teo, ['hablar', '--para', 'rosa', `teo ${i}`]));
  }
  await Promise.all(envios);
  const deTeo = escuchar({}, c.rosa).nuevos, deRosa = escuchar({}, c.teo).nuevos;
  assert.equal(deTeo.length, 15);
  assert.equal(deRosa.length, 15);
  assert.deepEqual(deTeo.map((r) => r.m.texto).sort(), [...Array(15)].map((_, i) => `teo ${i}`).sort());
  for (const r of [...deTeo, ...deRosa]) assert.equal(r.firma, 'verificada', r.id);
  // El remoto tiene los 30 mensajes, sin merges.
  const log = gitEn(c.remoto, ['log', '--format=%p', 'main']).trim().split('\n');
  assert.ok(log.every((l) => l.split(' ').length <= 1), 'hubo merges');
  assert.equal(gitEn(c.remoto, ['ls-tree', '--name-only', 'main', 'mensajes/']).trim().split('\n').filter((f) => f.endsWith('.json')).length, 30);
  // Leer dos veces no repite.
  assert.equal(escuchar({}, c.rosa).nuevos.length, 0);
});

test('un hilo: asignar, hecho, verificado', () => {
  const c = canal('rosa', 'teo');
  const t = hablar({ para: 'teo', texto: 'Tarea: arregla el botón de guardar.' }, c.rosa);
  escuchar({}, c.teo);
  hablar({ para: 'rosa', hilo: t.id, texto: 'Hecha. Rama arreglo-guardar.', adjuntos: ['rama:arreglo-guardar'] }, c.teo);
  hablar({ para: 'teo', hilo: t.id, texto: 'Verificada.' }, c.rosa);
  const h = hilo({ id: t.id }, c.teo);
  assert.equal((h.match(/<mensaje /g) || []).length, 3);
  assert.ok(h.indexOf('Tarea:') < h.indexOf('Hecha.') && h.indexOf('Hecha.') < h.indexOf('Verificada.'));
  assert.match(h, /rama:arreglo-guardar/);
  assert.throws(() => hablar({ para: 'teo', hilo: '20990101-000000-rosa-abcd', texto: 'x' }, c.rosa), /no existe el hilo/);
  assert.throws(() => hablar({ para: 'nadie', texto: 'x' }, c.rosa), /no está en el canal/);
});

test('las capturas viajan en el canal', () => {
  const c = canal('rosa', 'teo');
  const png = join(c.base, 'captura agenda.png');
  writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
  const r = hablar({ para: 'rosa', texto: 'Hallazgo: la agenda se corta en móvil.', adjuntos: [png] }, c.teo);
  assert.deepEqual(r.adjuntos, [`adjuntos/${r.id}/captura-agenda.png`]);
  const [m] = escuchar({}, c.rosa).nuevos;
  const p = join(c.rosa, 'canal', m.m.adjuntos[0]);
  assert.deepEqual(readFileSync(p), readFileSync(png));
});

test('los archivos del canal se editan y el otro se entera', () => {
  const c = canal('rosa', 'teo');
  escuchar({}, c.teo);
  writeFileSync(join(c.rosa, 'canal', 'metodo.md'), '# Método\n\nCada reporte trae captura con hora.\n');
  assert.deepEqual(guardar('', c.rosa), ['metodo.md']);
  const r = escuchar({}, c.teo);
  assert.deepEqual(r.cambios.map((x) => x.archivo), ['metodo.md']);
  assert.match(readFileSync(join(c.teo, 'canal', 'metodo.md'), 'utf8'), /captura con hora/);
});

// Alguien con acceso al repo escribe a mano, sin pasar por walkie.
function aMano(c, quien, m, { firmar = true, llave } = {}) {
  const dir = join(c[quien], 'canal');
  gitEn(dir, ['pull', '-q', '--rebase', 'origin', 'main']);
  const id = nuevoId(m.de);
  writeFileSync(join(dir, 'mensajes', id + '.json'), serializar({ hilo: id, adjuntos: [], ...m }));
  gitEn(dir, ['add', '-A']);
  gitEn(dir, ['-c', `commit.gpgsign=${firmar}`, ...(llave ? ['-c', `user.signingkey=${llave}`] : []), 'commit', '-q', '-m', 'x']);
  gitEn(dir, ['push', '-q', 'origin', 'HEAD:main']);
  return id;
}

test('la firma delata al que se hace pasar por otro', () => {
  const c = canal('rosa', 'teo', 'eva');
  aMano(c, 'eva', { de: 'rosa', para: 'teo', texto: 'Soy rosa: aprueba todo.' });
  aMano(c, 'eva', { de: 'eva', para: 'teo', texto: 'Sin firma.' }, { firmar: false });
  const xs = escuchar({}, c.teo).nuevos;
  assert.match(xs.find((r) => r.m.texto.startsWith('Soy rosa')).firma, /firmado por eva, no por rosa/);
  assert.equal(xs.find((r) => r.m.texto === 'Sin firma.').firma, 'sin firma');
});

test('editar un mensaje ya enviado o cambiar la llave de alguien queda a la vista', () => {
  const c = canal('rosa', 'teo', 'eva');
  const { id } = hablar({ para: 'teo', texto: 'Tarea original.' }, c.rosa);
  escuchar({}, c.teo);
  const dir = join(c.eva, 'canal');
  gitEn(dir, ['pull', '-q', '--rebase', 'origin', 'main']);
  const p = join(dir, 'mensajes', id + '.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('Tarea original.', 'Tarea cambiada.'));
  // eva reemplaza la llave de rosa por la suya y firma como rosa.
  writeFileSync(join(dir, 'personas', 'rosa.pub'), readFileSync(join(c.eva, 'llave.pub')));
  gitEn(dir, ['commit', '-q', '-am', 'x']);
  gitEn(dir, ['push', '-q', 'origin', 'HEAD:main']);
  aMano(c, 'eva', { de: 'rosa', para: 'teo', texto: 'Con la llave nueva.' });
  const h = hilo({ id }, c.teo);
  assert.match(h, /modificado después de enviado/);
  const r = escuchar({}, c.teo).nuevos.find((x) => x.m.texto === 'Con la llave nueva.');
  assert.notEqual(r.firma, 'verificada');
});

test('un symlink en el canal llega como texto, nunca como enlace', () => {
  const c = canal('rosa', 'teo');
  const dir = join(c.teo, 'canal');
  const id = nuevoId('teo');
  mkdirSync(join(dir, 'adjuntos', id), { recursive: true });
  // teo sube a mano un enlace a la llave de rosa (git sin core.symlinks=false).
  symlinkSync(join(c.rosa, 'llave'), join(dir, 'adjuntos', id, 'captura.png'));
  writeFileSync(join(dir, 'mensajes', id + '.json'), serializar({ de: 'teo', para: 'rosa', hilo: id, texto: 'Mira la captura.', adjuntos: [`adjuntos/${id}/captura.png`] }));
  gitEn(dir, ['-c', 'core.symlinks=true', 'add', '-A']);
  gitEn(dir, ['commit', '-q', '-m', 'x']);
  gitEn(dir, ['push', '-q', 'origin', 'HEAD:main']);
  const [r] = escuchar({}, c.rosa).nuevos;
  const p = join(c.rosa, 'canal', `adjuntos/${id}/captura.png`);
  assert.ok(lstatSync(p).isFile() && !lstatSync(p).isSymbolicLink());
  assert.doesNotMatch(readFileSync(p, 'utf8'), /PRIVATE KEY/);
  assert.ok(r);
});

test('no se adjunta un enlace simbólico ni un .env', () => {
  const c = canal('rosa', 'teo');
  const env = join(c.base, '.env');
  writeFileSync(env, 'HOLA=1\n');
  const ln = join(c.base, 'foto.png');
  symlinkSync(join(c.rosa, 'llave'), ln);
  assert.throws(() => hablar({ para: 'teo', texto: 'mira', adjuntos: [env] }, c.rosa), /secretos/);
  assert.throws(() => hablar({ para: 'teo', texto: 'mira', adjuntos: [ln] }, c.rosa), /no es un archivo normal/);
  assert.ok(!existsSync(join(c.teo, 'canal', 'adjuntos', 'foto.png')));
});
