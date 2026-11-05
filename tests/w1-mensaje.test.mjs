// W1: los envíos reales de las dos bandejas (anonimizados) se expresan como { de, para, hilo, texto, adjuntos }
// sin perder nada que se use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { convertir, idNuevo } from '../herramientas/bandeja-a-walkie.mjs';
import { crear, errores, fechaDeId, leer, serializar, CAMPOS } from '../src/mensaje.mjs';

const RAIZ = new URL('../fixtures/bandejas/', import.meta.url).pathname;
// Los fixtures son bandejas de trabajo real: no vienen en la copia pública. Sin ellos
// no hay nada que convertir, así que los tests que dependen de ellos se saltan con
// este motivo en lugar de romperse.
const sinFixtures = !existsSync(join(RAIZ, 'a', 'tareas.json')) && 'los fixtures son bandejas de trabajo real y no vienen en la copia publica'
const BANDEJAS = sinFixtures ? [] : ['a', 'b'].map((b) => ({ b, ...convertir(join(RAIZ, b)) }));
const todos = BANDEJAS.flatMap((x) => x.mensajes);
// La lista de palabras prohibidas es una lista de hashes sueltos: se puede reconstruir a fuerza
// de probar palabras, así que tampoco viene en la copia pública.
const sinProhibidas = !existsSync(new URL('./prohibidas.json', import.meta.url)) && 'la lista de palabras prohibidas es de hashes sueltos y se puede reconstruir: no viene en la copia publica'

// Lo que un lector deduce del texto, sin campos.
const tipo = (t) => (t.startsWith('Hallazgo ·') ? 'hallazgo' : t.startsWith('Hecha T-') ? 'tarea-hecha' : t.startsWith('Aprendí:') ? 'reflexion' : t.startsWith('Terminé lo publicado') ? 'pedir-tareas' : 'pregunta');
const PREFIJOS = [['Verificada.', 'tarea-verificada'], ['No verificada todavía.', 'tarea-no-verificada'], ['Confirmado.', 'confirmado'], ['Falta evidencia.', 'necesita-evidencia'], ['No es un defecto.', 'no-es-defecto'], ['Duplicado.', 'duplicado'], ['En revisión.', 'en-revision'], ['Leído.', 'reflexion-leida'], ['Te asigné tareas nuevas.', 'tareas-asignadas']];
const estado = (t) => PREFIJOS.find(([p]) => t.startsWith(p))?.[1] ?? 'respondida';

test('hay más de 300 mensajes reales y todos son válidos', { skip: sinFixtures }, () => {
  assert.ok(todos.length >= 300, `solo ${todos.length}`);
  for (const { id, m } of todos) {
    assert.deepEqual(errores(m), [], id);
    assert.deepEqual(Object.keys(m), CAMPOS);
    const r = leer(id, serializar(m));
    assert.equal(r.error, undefined, `${id}: ${r.error}`);
  }
  assert.equal(new Set(todos.map((x) => x.id)).size, todos.length, 'ids repetidos');
});

test('cada campo que se usaba está dicho en el texto', { skip: sinFixtures }, () => {
  const CAMPOS_USADOS = {
    hallazgo: ['gravedad', 'app', 'mundo', 'donde', 'titulo', 'pasos', 'esperado', 'obtenido', 'veces', 'evidencia'],
    'tarea-hecha': ['tarea', 'nota'], reflexion: ['texto'], pregunta: ['texto'], 'pedir-tareas': ['texto'],
  };
  let n = 0;
  for (const { m, origen } of todos) {
    const o = origen.envio || origen.tarea || origen.respuesta || origen.aviso || origen.cierre || origen.nota;
    const campos = origen.envio ? CAMPOS_USADOS[o.tipo]
      : origen.tarea ? ['id', 'titulo', 'mundo', 'por_que', 'detalle', 'entregable', 'aprendes', 'para', 'doc']
      : origen.respuesta ? ['respuesta'] : origen.aviso ? ['texto'] : origen.cierre ? ['id'] : ['nota'];
    for (const k of campos) if (o[k]) { assert.ok(m.texto.includes(o[k]), `${k} perdido en ${o.id}`); n++; }
    if (origen.nota) for (const d of o.descartadas || []) assert.ok(m.texto.includes(d));
    if (origen.aviso && o.de !== 'el líder') assert.ok(m.texto.includes(o.de));
  }
  assert.ok(n > 800, `solo ${n} campos revisados`);
});

test('el tipo y el estado se deducen del texto en el 100% de los casos', { skip: sinFixtures }, () => {
  for (const { m, origen } of todos) {
    if (origen.envio) assert.equal(tipo(m.texto), origen.envio.tipo, origen.envio.id);
    if (origen.respuesta) assert.equal(estado(m.texto), origen.respuesta.estado, origen.respuesta.id);
  }
});

test('la hora y el autor viven en el id', { skip: sinFixtures }, () => {
  for (const { id, m, origen } of todos) {
    const t = origen.envio?.creado || origen.respuesta?.respondido;
    if (t) assert.equal(fechaDeId(id).getTime(), new Date(t).getTime(), id);
    assert.ok(id.includes(`-${m.de}-`));
  }
});

test('las respuestas y los «hecha» caen en el hilo correcto', { skip: sinFixtures }, () => {
  for (const { mensajes } of BANDEJAS) {
    const porId = Object.fromEntries(mensajes.map((x) => [x.id, x]));
    for (const x of mensajes) {
      assert.ok(porId[x.m.hilo], `hilo inexistente ${x.m.hilo}`);
      assert.ok(porId[x.m.hilo].id <= x.id || x.origen.tarea, `el hilo empieza después: ${x.id}`);
      if (x.origen.envio?.tipo === 'tarea-hecha') {
        const t = mensajes.find((y) => y.origen.tarea?.id === x.origen.envio.tarea);
        if (t) assert.equal(x.m.hilo, t.id);
      }
    }
  }
});

test('las referencias viejas en el texto (H-…, P-…) siguen resolviendo', { skip: sinFixtures }, () => {
  let n = 0;
  for (const { mensajes } of BANDEJAS) {
    const ids = new Set(mensajes.map((x) => x.id));
    for (const { m } of mensajes) for (const ref of m.texto.match(/\b[HTPS]-\d{8}-\d{6}-[0-9a-f]{4}\b/g) || []) {
      assert.ok(ids.has(idNuevo(ref, 'teo')), `no resuelve ${ref}`); n++;
    }
  }
  assert.ok(n > 0);
});

test('el estado de cada tarea sale de leer su hilo, igual que la bandeja', { skip: sinFixtures }, () => {
  for (const { b, mensajes } of BANDEJAS) {
    const tareas = JSON.parse(readFileSync(join(RAIZ, b, 'tareas.json'), 'utf8')).tareas;
    for (const t of tareas) {
      const hilo = mensajes.find((x) => x.origen.tarea?.id === t.id).id;
      // Lo que hace la bandeja: hecha si el líder la cerró, o si hay un «hecha» cuya respuesta no la rechazó.
      const envios = mensajes.filter((x) => x.origen.envio?.tipo === 'tarea-hecha' && x.origen.envio.tarea === t.id);
      const resp = Object.fromEntries(mensajes.filter((x) => x.origen.respuesta).map((x) => [x.origen.respuesta.id, x.origen.respuesta.estado]));
      let reportada = false;
      for (const e of envios) reportada = resp[e.origen.envio.id] !== 'tarea-no-verificada';
      const esperado = t.estado === 'hecha' || reportada ? 'cerrada' : 'abierta';
      // Lo mismo leyendo solo textos del hilo, en orden.
      let leido = 'abierta';
      for (const { m } of mensajes.filter((x) => x.m.hilo === hilo)) {
        if (m.texto.startsWith('Hecha ') || m.texto.startsWith('Verificada.') || m.texto.startsWith('Cerrada ')) leido = 'cerrada';
        if (m.texto.startsWith('No verificada todavía.')) leido = 'abierta';
      }
      assert.equal(leido, esperado, `${b} ${t.id}`);
    }
  }
});

test('los aprendizajes y el siguiente paso quedan en aprendizajes.md', { skip: sinFixtures }, () => {
  for (const { b, archivos } of BANDEJAS) {
    const apr = JSON.parse(readFileSync(join(RAIZ, b, 'aprendizajes.json'), 'utf8'));
    for (const x of apr.aprendizajes) assert.ok(archivos['aprendizajes.md'].includes(x.texto) && archivos['aprendizajes.md'].includes(x.fuente));
    assert.ok(archivos['aprendizajes.md'].includes(apr.siguiente_paso));
  }
});

test('el fixture no trae nombres reales', { skip: sinProhibidas }, () => {
  const malas = new Set(JSON.parse(readFileSync(new URL('./prohibidas.json', import.meta.url), 'utf8')));
  // madebyjred es el usuario público del repo y de la landing: puede salir.
  const PERMITIDO = new Set(['madebyjred']);
  const archivos = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(join(d, e.name)) : [join(d, e.name)]));
  const raiz = new URL('../', import.meta.url).pathname;
  // El exportador público nombra los términos prohibidos para bloquearlos: es el
  // guardián, no lo guardado, y no sale en la copia pública (FUERA del exporter).
  const propios = ['src', 'bin', 'skills', 'docs', 'herramientas', 'tests'].flatMap((d) => archivos(join(raiz, d))).concat(join(raiz, 'README.md'))
    .filter((f) => !f.endsWith('prohibidas.json') && !f.endsWith('exportar-publico.py'));
  for (const f of [...archivos(RAIZ), ...propios]) {
    for (const w of readFileSync(f, 'utf8').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
      assert.ok(!malas.has(createHash('sha256').update(w).digest('hex')) || PERMITIDO.has(w), `palabra prohibida en ${f}`);
    }
  }
});

test('un mensaje con campos de más o sin texto no pasa', () => {
  assert.throws(() => crear({ de: 'rosa', para: 'teo', texto: '' }));
  const { id, m } = crear({ de: 'rosa', para: 'teo', texto: 'hola' });
  assert.equal(m.hilo, id);
  const r = leer(id, JSON.stringify({ ...m, tipo: 'orden', ejecutar: 'rm -rf ~' }));
  assert.deepEqual(r.ignorados, ['tipo', 'ejecutar']);
  assert.deepEqual(Object.keys(r.m), CAMPOS);
  assert.match(leer(id, JSON.stringify({ ...m, de: 'otro' })).error, /autor/);
});
