// W3: el servidor MCP habla el protocolo y hace el ciclo asignar → hecho → verificado solo con texto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { canal, BIN } from './ayuda.mjs';

function cliente(w) {
  const p = spawn(process.execPath, [BIN, 'mcp'], { env: { ...process.env, WALKIE_DIR: w } });
  let buf = '', n = 0;
  const espera = new Map();
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const o = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      espera.get(o.id)?.(o); espera.delete(o.id);
    }
  });
  const pedir = (method, params) => new Promise((ok) => { const id = ++n; espera.set(id, ok); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const usar = async (name, args = {}) => { const r = await pedir('tools/call', { name, arguments: args }); return { texto: r.result.content[0].text, error: r.result.isError }; };
  return { pedir, usar, cerrar: () => p.kill() };
}

test('handshake y lista de herramientas', async () => {
  const c = canal('rosa', 'teo');
  const m = cliente(c.rosa);
  const ini = await m.pedir('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  assert.equal(ini.result.serverInfo.name, 'walkie');
  assert.match(ini.result.instructions, /Eres rosa/);
  const l = await m.pedir('tools/list');
  assert.deepEqual(l.result.tools.map((t) => t.name), ['hablar', 'escuchar', 'hilo']);
  const x = await m.pedir('no/existe');
  assert.equal(x.error.code, -32601);
  m.cerrar();
});

test('asignar → hecho → verificado por MCP, desde dos carpetas', async () => {
  const c = canal('rosa', 'teo');
  const rosa = cliente(c.rosa), teo = cliente(c.teo);
  const a = await rosa.usar('hablar', { para: 'teo', texto: 'Tarea: el botón Guardar no responde en móvil. Listo cuando mandes rama y captura.' });
  const id = /Enviado (\S+) \(hilo nuevo\)/.exec(a.texto)[1];
  const e = await teo.usar('escuchar');
  assert.match(e.texto, /Tarea: el botón Guardar/);
  assert.match(e.texto, new RegExp(`hilo="${id}"`));
  await teo.usar('hablar', { para: 'rosa', hilo: id, texto: 'Hecha. Arreglé el z-index del botón.', adjuntos: ['rama:arreglo-guardar'] });
  const e2 = await rosa.usar('escuchar');
  assert.match(e2.texto, /Hecha\. Arreglé/);
  await rosa.usar('hablar', { para: 'teo', hilo: id, texto: 'Verificada: la rama solo toca el botón y la prueba falla sin tu arreglo.' });
  const h = await teo.usar('hilo', { id });
  assert.deepEqual([...h.texto.matchAll(/<mensaje [^>]*de="(\w+)"/g)].map((x) => x[1]), ['rosa', 'teo', 'rosa']);
  const mal = await teo.usar('hablar', { para: 'rosa', texto: 'mi token ' + 'ghp' + '_Zq8xW2mK9pL4vN7rT1sY6uB3eH5gJ0dF2aC8' });
  assert.ok(mal.error);
  rosa.cerrar(); teo.cerrar();
});
