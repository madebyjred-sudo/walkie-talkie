#!/usr/bin/env node
// Convierte una bandeja (entrada/, procesados/, respuestas/, tareas.json, avisos.json, aprendizajes.json)
// a mensajes de Walkie Talkie. Todo lo que la bandeja guardaba en campos queda dicho en el texto.
// Uso: node herramientas/bandeja-a-walkie.mjs <bandeja> <carpeta-del-canal> [--lider rosa] [--equipo teo]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializar, errores } from '../src/mensaje.mjs';

const ESTADO = {
  'tarea-verificada': 'Verificada.',
  'tarea-no-verificada': 'No verificada todavía.',
  confirmado: 'Confirmado.',
  'necesita-evidencia': 'Falta evidencia.',
  'no-es-defecto': 'No es un defecto.',
  duplicado: 'Duplicado.',
  'en-revision': 'En revisión.',
  respondida: '',
  'reflexion-leida': 'Leído.',
  'tareas-asignadas': 'Te asigné tareas nuevas.',
};
const ROTULOS = [['para', 'Para'], ['por_que', 'Por qué importa'], ['detalle', 'Qué'], ['entregable', 'Entregas'], ['aprendes', 'Vas a aprender'], ['doc', 'Documento']];
const ARCHIVO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpe?g|mp4|mov|pdf|webm)$/i;

const json = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
const dir = (p) => (existsSync(p) ? readdirSync(p).filter((n) => n.endsWith('.json')).map((n) => json(join(p, n))) : []);
const hex4 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 4);
const ts = (iso) => new Date(iso).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const idDe = (iso, de, suf) => `${ts(iso)}-${de}-${suf}`;
// H-20261020-164653-23dc → 20261020-164653-<autor>-23dc: las referencias viejas siguen resolviendo.
export const idNuevo = (viejo, de) => { const m = /^[A-Z]-(\d{8}-\d{6})-([0-9a-f]{4})$/.exec(viejo); return m && `${m[1]}-${de}-${m[2]}`; };

function textoEnvio(o) {
  switch (o.tipo) {
    case 'hallazgo':
      return [
        `Hallazgo · gravedad ${o.gravedad} · app ${o.app} · mundo ${o.mundo}`,
        o.donde && `Dónde: ${o.donde}`,
        o.titulo,
        `Pasos: ${o.pasos}`,
        `Esperado: ${o.esperado}`,
        `Obtenido: ${o.obtenido}`,
        `Veces: ${o.veces}`,
        o.evidencia && `Evidencia: ${o.evidencia}`,
      ].filter(Boolean).join('\n');
    case 'tarea-hecha': return `Hecha ${o.tarea}.${o.nota ? ' ' + o.nota : ''}`;
    case 'reflexion': return `Aprendí: ${o.texto}`;
    case 'pregunta': return o.texto;
    case 'pedir-tareas': return `Terminé lo publicado, ¿me das más tareas?${o.texto ? ' ' + o.texto : ''}`;
    default: throw new Error(`tipo desconocido: ${o.tipo}`);
  }
}

function textoTarea(x) {
  const l = [`Tarea ${x.id} · ${x.titulo} · mundo ${x.mundo}`];
  for (const [k, r] of ROTULOS) if (x[k]) l.push(`${r}: ${x[k]}`);
  return l.join('\n');
}

export function convertir(base, { lider = 'rosa', equipo = 'teo' } = {}) {
  const envios = [...dir(join(base, 'entrada')), ...dir(join(base, 'procesados'))].sort((a, b) => a.creado.localeCompare(b.creado));
  const resp = Object.fromEntries(dir(join(base, 'respuestas')).map((r) => [r.id, r]));
  const tareas = json(join(base, 'tareas.json'), { tareas: [] });
  const avisos = json(join(base, 'avisos.json'), { avisos: [] }).avisos || [];
  const apr = json(join(base, 'aprendizajes.json'), { aprendizajes: [] });
  const out = [];
  const hiloTarea = {};

  // Las tareas se publican como mensajes del líder. La hora: la de publicación, o antes si alguien ya la usó.
  for (const x of tareas.tareas) {
    const primera = envios.find((o) => o.tarea === x.id);
    const dia = /^T-(\d{4})(\d{2})(\d{2})/.exec(x.id);
    const candidatas = [tareas.actualizado, dia && `${dia[1]}-${dia[2]}-${dia[3]}T12:00:00Z`, primera && new Date(new Date(primera.creado) - 60000).toISOString()].filter(Boolean);
    const cuando = candidatas.sort()[0];
    const id = idDe(cuando, lider, hex4(x.id));
    hiloTarea[x.id] = id;
    out.push({ id, m: { de: lider, para: equipo, hilo: id, texto: textoTarea(x), adjuntos: [] }, origen: { tarea: x } });
  }
  if (tareas.nota || tareas.descartadas?.length) {
    const id = idDe(tareas.actualizado, lider, hex4('nota' + tareas.actualizado));
    const t = [tareas.nota, tareas.descartadas?.length && 'Descartado por ahora: ' + tareas.descartadas.join(' · ')].filter(Boolean).join('\n\n');
    out.push({ id, m: { de: lider, para: equipo, hilo: id, texto: t, adjuntos: [] }, origen: { nota: tareas } });
  }
  for (const o of envios) {
    const id = idNuevo(o.id, equipo);
    const hilo = (o.tipo === 'tarea-hecha' && hiloTarea[o.tarea]) || id;
    const adjuntos = (o.evidencia || '').split(/[\s,;]+/).filter((s) => ARCHIVO.test(s)).map((s) => `adjuntos/${s}`);
    out.push({ id, m: { de: equipo, para: lider, hilo, texto: textoEnvio(o), adjuntos }, origen: { envio: o } });
    const r = resp[o.id];
    if (r) {
      const rid = idDe(r.respondido, lider, hex4(r.id + 'r'));
      out.push({ id: rid, m: { de: lider, para: equipo, hilo, texto: [ESTADO[r.estado], r.respuesta].filter(Boolean).join(' '), adjuntos: [] }, origen: { respuesta: r } });
    }
  }
  // Una tarea cerrada a mano, sin veredicto en el hilo, se cierra con un mensaje.
  for (const x of tareas.tareas) {
    if (x.estado !== 'hecha') continue;
    const hilo = hiloTarea[x.id];
    const ver = out.some((y) => y.m.hilo === hilo && y.origen.respuesta?.estado === 'tarea-verificada');
    if (!ver) out.push({ id: idDe(tareas.actualizado, lider, hex4(x.id + 'c')), m: { de: lider, para: equipo, hilo, texto: `Cerrada ${x.id}.`, adjuntos: [] }, origen: { cierre: x } });
  }
  for (const a of avisos) {
    const id = idDe(a.fecha, lider, hex4(a.fecha + a.texto));
    const texto = `Aviso${a.de && a.de !== 'el líder' ? ' de ' + a.de : ''}: ${a.texto}`;
    out.push({ id, m: { de: lider, para: equipo, hilo: id, texto, adjuntos: [] }, origen: { aviso: a } });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  for (const { id, m } of out) {
    const e = errores(m);
    if (e.length) throw new Error(`${id}: ${e.join('; ')}`);
  }
  const lineas = ['# Aprendizajes', ''];
  for (const [tipo, rot] of [['metodo', 'Método'], ['producto', 'Producto']]) {
    const xs = (apr.aprendizajes || []).filter((x) => x.tipo === tipo);
    if (!xs.length) continue;
    lineas.push(`## ${rot}`, '');
    for (const x of xs) lineas.push(`- ${x.texto}${x.fuente || x.fecha ? ` (${[x.fuente, x.fecha].filter(Boolean).join(', ')})` : ''}`);
    lineas.push('');
  }
  if (apr.siguiente_paso) lineas.push('## Siguiente paso', '', apr.siguiente_paso, '');
  return { mensajes: out, archivos: { 'aprendizajes.md': lineas.join('\n') } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [base, canal] = process.argv.slice(2);
  if (!base || !canal) { console.error('uso: bandeja-a-walkie.mjs <bandeja> <canal> [--lider x] [--equipo y]'); process.exit(2); }
  const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const { mensajes, archivos } = convertir(base, { lider: opt('--lider'), equipo: opt('--equipo') });
  mkdirSync(join(canal, 'mensajes'), { recursive: true });
  for (const { id, m } of mensajes) writeFileSync(join(canal, 'mensajes', id + '.json'), serializar(m));
  for (const [n, t] of Object.entries(archivos)) writeFileSync(join(canal, n), t);
  console.log(`${mensajes.length} mensajes y ${Object.keys(archivos).length} archivo en ${canal}`);
}
