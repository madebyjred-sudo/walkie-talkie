// Un mensaje es esto y nada más: { de, para, hilo, texto, adjuntos }.
// Sin tipos: si es una tarea, un aviso o un veredicto lo dice el texto.
// El id es el nombre del archivo y lleva la hora: AAAAMMDD-HHMMSS-<de>-<8 hex>.
// Se aceptan también los de 4 hex de antes: con dos bytes, 15 envíos del mismo autor en el mismo segundo chocaban.
import { randomBytes } from 'node:crypto';

export const CAMPOS = ['de', 'para', 'hilo', 'texto', 'adjuntos'];
export const NOMBRE = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const ID = /^(\d{8})-(\d{6})-([a-z0-9][a-z0-9-]{0,31})-([0-9a-f]{4}(?:[0-9a-f]{4})?)$/;
export const TODOS = 'todos';
const MAX_TEXTO = 20000, MAX_ADJUNTOS = 20, MAX_ADJUNTO = 500;

export function nuevoId(de, fecha = new Date(), sufijo = randomBytes(4).toString('hex')) {
  const iso = fecha.toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}-${de}-${sufijo}`;
}

export function fechaDeId(id) {
  const m = ID.exec(id);
  if (!m) return null;
  const [, d, h] = m;
  return new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}Z`);
}

export function autorDeId(id) {
  return ID.exec(id)?.[3] ?? null;
}

// Devuelve los errores; vacío = válido.
export function errores(m) {
  const e = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['no es un objeto'];
  for (const k of Object.keys(m)) if (!CAMPOS.includes(k)) e.push(`campo de más: ${k}`);
  if (typeof m.de !== 'string' || !NOMBRE.test(m.de)) e.push('de: nombre inválido');
  if (typeof m.para !== 'string' || !NOMBRE.test(m.para)) e.push('para: nombre inválido');
  if (typeof m.hilo !== 'string' || !ID.test(m.hilo)) e.push('hilo: id inválido');
  if (typeof m.texto !== 'string' || !m.texto.trim()) e.push('texto vacío');
  else if (m.texto.length > MAX_TEXTO) e.push(`texto de más de ${MAX_TEXTO} caracteres`);
  if (!Array.isArray(m.adjuntos)) e.push('adjuntos: no es una lista');
  else {
    if (m.adjuntos.length > MAX_ADJUNTOS) e.push(`más de ${MAX_ADJUNTOS} adjuntos`);
    for (const a of m.adjuntos) if (typeof a !== 'string' || !a || a.length > MAX_ADJUNTO) e.push('adjunto inválido');
  }
  return e;
}

export function crear({ de, para, hilo, texto, adjuntos = [] }, fecha = new Date()) {
  const id = nuevoId(de, fecha);
  const m = { de, para, hilo: hilo || id, texto, adjuntos };
  const e = errores(m);
  if (e.length) throw new Error(e.join('; '));
  return { id, m };
}

// Lee el JSON de un archivo de mensaje. Lo que no es de los cinco campos se descarta y se avisa.
export function leer(id, crudo) {
  let o;
  try { o = JSON.parse(crudo); } catch { return { id, error: 'JSON ilegible' }; }
  if (!ID.test(id)) return { id, error: 'nombre de archivo inválido' };
  const ignorados = o && typeof o === 'object' ? Object.keys(o).filter((k) => !CAMPOS.includes(k)) : [];
  const m = {};
  for (const k of CAMPOS) if (o && k in o) m[k] = o[k];
  const e = errores(m);
  if (e.length) return { id, error: e.join('; '), ignorados };
  if (autorDeId(id) !== m.de) return { id, m, ignorados, error: 'el id no es del autor que dice el mensaje' };
  return { id, m, ignorados };
}

export function serializar(m) {
  return JSON.stringify(Object.fromEntries(CAMPOS.map((k) => [k, m[k]])), null, 1) + '\n';
}
