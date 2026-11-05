// Relay: el mismo canal por HTTP, para equipos sin repo compartido. Una llave por persona; el servidor
// sabe quién escribe por su llave, así que nadie puede hablar a nombre de otro.
//   walkie relay --datos <carpeta> [--puerto 8790] [--host 127.0.0.1]
//   walkie relay --datos <carpeta> --nueva <nombre>     crea la llave de una persona (se muestra una vez)
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { autorDeId, errores, ID, NOMBRE, serializar, TODOS } from './mensaje.mjs';
import { detectar, nombreSecreto } from './secretos.mjs';
import { ARCHIVOS } from './canal-git.mjs';

const MAX = 25 * 1024 * 1024;
const hash = (s) => createHash('sha256').update(s).digest('hex');

export function nuevaLlave(datos, nombre) {
  if (!NOMBRE.test(nombre || '') || nombre === TODOS) throw new Error('nombre inválido');
  mkdirSync(datos, { recursive: true });
  const p = join(datos, 'llaves.json');
  const llaves = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  const llave = 'wk_' + randomBytes(24).toString('base64url');
  // Se guarda solo el hash: quien lea el disco del servidor no puede hablar por nadie.
  llaves[nombre] = hash(llave);
  writeFileSync(p, JSON.stringify(llaves, null, 1));
  return llave;
}

export function crearRelay(datos) {
  for (const d of ['mensajes', 'adjuntos', 'archivos']) mkdirSync(join(datos, d), { recursive: true });
  const indice = join(datos, 'indice.log');
  const orden = existsSync(indice) ? readFileSync(indice, 'utf8').split('\n').filter(Boolean) : [];
  const quien = (q) => {
    const llaves = JSON.parse(readFileSync(join(datos, 'llaves.json'), 'utf8'));
    const h = Buffer.from(hash(String(q.headers.authorization || '').replace(/^Bearer\s+/i, '')));
    return Object.keys(llaves).find((n) => { const b = Buffer.from(llaves[n]); return b.length === h.length && timingSafeEqual(b, h); });
  };
  const leerCuerpo = (q) => new Promise((ok, mal) => {
    const partes = []; let n = 0;
    q.on('data', (d) => { n += d.length; if (n > MAX) { mal(new Error('demasiado grande')); q.destroy(); } else partes.push(d); });
    q.on('end', () => ok(Buffer.concat(partes)));
    q.on('error', mal);
  });
  const atomico = (p, datos_) => { writeFileSync(p + '.tmp', datos_); renameSync(p + '.tmp', p); };

  return createServer(async (q, r) => {
    const json = (code, o) => { r.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); r.end(JSON.stringify(o)); };
    try {
      const yo = quien(q);
      if (!yo) return json(401, { error: 'llave inválida' });
      const u = new URL(q.url, 'http://x');
      const partes = u.pathname.split('/').filter(Boolean);
      if (q.method === 'GET' && u.pathname === '/personas') return json(200, { personas: Object.keys(JSON.parse(readFileSync(join(datos, 'llaves.json'), 'utf8'))), yo });
      if (q.method === 'GET' && u.pathname === '/mensajes') {
        const desde = Number(u.searchParams.get('desde') || 0);
        return json(200, { total: orden.length, mensajes: orden.slice(desde).map((id, i) => ({ id, orden: desde + i + 1, m: JSON.parse(readFileSync(join(datos, 'mensajes', id + '.json'), 'utf8')) })) });
      }
      if (q.method === 'POST' && u.pathname === '/mensajes') {
        const { id, m } = JSON.parse((await leerCuerpo(q)).toString('utf8'));
        if (!ID.test(id || '') || autorDeId(id) !== yo) return json(400, { error: 'el id tiene que ser tuyo' });
        const msg = { ...m, de: yo, hilo: m.hilo || id };
        const e = errores(msg);
        if (e.length) return json(400, { error: e.join('; ') });
        if (detectar(msg.texto).length) return json(400, { error: 'el mensaje trae un secreto' });
        if (msg.para !== TODOS && !(msg.para in JSON.parse(readFileSync(join(datos, 'llaves.json'), 'utf8')))) return json(400, { error: `${msg.para} no está en el canal` });
        if (msg.hilo !== id && !existsSync(join(datos, 'mensajes', msg.hilo + '.json'))) return json(400, { error: `no existe el hilo ${msg.hilo}` });
        const p = join(datos, 'mensajes', id + '.json');
        if (existsSync(p)) return json(409, { error: 'ese id ya existe' });
        atomico(p, serializar(msg));
        // Node atiende de a un pedido por vez en este punto: el orden es el de llegada.
        orden.push(id); appendFileSync(indice, id + '\n');
        return json(201, { id, hilo: msg.hilo, orden: orden.length });
      }
      if (partes[0] === 'adjuntos' && partes.length === 3) {
        const [, id, nombre] = partes;
        if (!ID.test(id) || !/^[A-Za-z0-9._-]{1,120}$/.test(nombre) || nombre.startsWith('.')) return json(400, { error: 'ruta inválida' });
        const p = join(datos, 'adjuntos', id, nombre);
        if (q.method === 'GET') { if (!existsSync(p)) return json(404, { error: 'no existe' }); r.writeHead(200); return r.end(readFileSync(p)); }
        if (q.method === 'PUT') {
          if (autorDeId(id) !== yo) return json(403, { error: 'solo adjuntas a tus mensajes' });
          if (nombreSecreto(nombre)) return json(400, { error: 'archivo de secretos' });
          const cuerpo = await leerCuerpo(q);
          if (!cuerpo.subarray(0, 1024 * 1024).includes(0) && detectar(cuerpo.toString('utf8')).length) return json(400, { error: 'el adjunto trae un secreto' });
          mkdirSync(join(datos, 'adjuntos', id), { recursive: true });
          atomico(p, cuerpo);
          return json(201, { ruta: `adjuntos/${id}/${nombre}` });
        }
      }
      if (partes[0] === 'archivos' && partes.length === 2 && ARCHIVOS.includes(partes[1])) {
        const p = join(datos, 'archivos', partes[1]);
        const actual = existsSync(p) ? readFileSync(p) : Buffer.from('');
        const etag = hash(actual);
        if (q.method === 'GET') { r.writeHead(200, { etag }); return r.end(actual); }
        if (q.method === 'PUT') {
          // Sin pisar: solo se guarda si partiste de la versión vigente.
          if (q.headers['if-match'] !== etag) return json(409, { error: 'alguien lo cambió antes; trae la versión nueva' });
          const cuerpo = await leerCuerpo(q);
          if (detectar(cuerpo.toString('utf8')).length) return json(400, { error: 'trae un secreto' });
          atomico(p, cuerpo);
          appendFileSync(join(datos, 'archivos.log'), `${new Date().toISOString()}\t${yo}\t${partes[1]}\t${hash(cuerpo)}\n`);
          return json(200, { etag: hash(cuerpo) });
        }
      }
      if (q.method === 'GET' && u.pathname === '/archivos') {
        const log = existsSync(join(datos, 'archivos.log')) ? readFileSync(join(datos, 'archivos.log'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')) : [];
        return json(200, { cambios: log.map(([fecha, autor, archivo]) => ({ fecha, autor, archivo })) });
      }
      return json(404, { error: 'no existe' });
    } catch (e) {
      return json(500, { error: e.message });
    }
  });
}

export function servir(flags) {
  const datos = flags.datos;
  if (!datos) { console.error('falta --datos <carpeta>'); process.exit(2); }
  if (flags.nueva) { console.log(`Llave de ${flags.nueva} (se muestra una sola vez): ${nuevaLlave(datos, flags.nueva)}`); return; }
  if (!existsSync(join(datos, 'llaves.json'))) { console.error('No hay personas: crea la primera llave con --nueva <nombre>'); process.exit(2); }
  const puerto = Number(flags.puerto || 8790), host = flags.host || '127.0.0.1';
  crearRelay(datos).listen(puerto, host, () => console.log(`relay en http://${host}:${puerto} · datos en ${datos} (ponlo detrás de HTTPS para usarlo fuera de esta máquina)`));
}
