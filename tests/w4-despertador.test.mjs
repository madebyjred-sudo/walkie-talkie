// W4: 24 h sin mensajes = 0 llamadas al modelo. Un mensaje = una llamada, aunque el harness falle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { canal } from './ayuda.mjs';
import { hablar } from '../src/walkie.mjs';
import { despertar } from '../src/despertador.mjs';

const vuelta = (w, comando) => { process.env.WALKIE_DIR = w; try { return despertar({ comando: JSON.stringify(comando), 'sin-aviso': true }); } finally { delete process.env.WALKIE_DIR; } };
const llamadas = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).length : 0);

test('288 vueltas (24 h cada 5 min) sin mensajes: 0 llamadas', () => {
  const c = canal('rosa', 'teo');
  const cuenta = join(c.base, 'llamadas.txt');
  const harness = ['sh', '-c', `echo x >> ${cuenta}; echo '[SILENT]'`];
  for (let i = 0; i < 288; i++) assert.equal(vuelta(c.teo, harness), 0);
  assert.equal(llamadas(cuenta), 0);
  // Lo que manda uno mismo tampoco despierta.
  hablar({ para: 'rosa', texto: 'Hecha la tarea.' }, c.teo);
  for (let i = 0; i < 5; i++) vuelta(c.teo, harness);
  assert.equal(llamadas(cuenta), 0);
  const log = readFileSync(join(c.teo, 'despertador', 'corridas.log'), 'utf8');
  assert.equal((log.match(/sin cambios/g) || []).length, 293);
});

test('llega un mensaje: una llamada; vueltas después, ninguna más', () => {
  const c = canal('rosa', 'teo');
  const cuenta = join(c.base, 'llamadas.txt');
  const harness = ['sh', '-c', `cat > ${c.base}/prompt.txt; echo x >> ${cuenta}; echo 'Respondí la tarea.'`];
  hablar({ para: 'teo', texto: 'Tarea: revisa la agenda.' }, c.rosa);
  for (let i = 0; i < 10; i++) vuelta(c.teo, harness);
  assert.equal(llamadas(cuenta), 1);
  const prompt = readFileSync(join(c.base, 'prompt.txt'), 'utf8');
  assert.match(prompt, /escuchar/);
  assert.doesNotMatch(prompt, /revisa la agenda/, 'el texto entra por escuchar, enmarcado, no por el prompt');
  hablar({ para: 'teo', texto: 'Otra cosa.' }, c.rosa);
  vuelta(c.teo, harness);
  assert.equal(llamadas(cuenta), 2);
});

test('si el harness falla o se pasa del techo, no se vuelve a despertar por lo mismo', () => {
  const c = canal('rosa', 'teo');
  const cuenta = join(c.base, 'llamadas.txt');
  hablar({ para: 'teo', texto: 'Tarea.' }, c.rosa);
  assert.equal(vuelta(c.teo, ['sh', '-c', `echo x >> ${cuenta}; exit 3`]), 1);
  for (let i = 0; i < 5; i++) vuelta(c.teo, ['sh', '-c', `echo x >> ${cuenta}`]);
  assert.equal(llamadas(cuenta), 1);
  hablar({ para: 'teo', texto: 'Otra.' }, c.rosa);
  process.env.WALKIE_DIR = c.teo;
  try { assert.equal(despertar({ comando: JSON.stringify(['sh', '-c', `echo x >> ${cuenta}; sleep 5`]), techo: '1', 'sin-aviso': true }), 1); } finally { delete process.env.WALKIE_DIR; }
  assert.equal(llamadas(cuenta), 2);
});
