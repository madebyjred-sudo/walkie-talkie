// Encuentra secretos en un texto: patrones conocidos + entropía para lo que no tiene forma conocida.
// Se usa al hablar (se rechaza el mensaje) y al escuchar (se tacha, por si el otro lado no lo revisó).
// La base es el redactor de Bitácora, copiado tal cual en secretos-bitacora.mjs; esto suma lo que la
// defensa entre harness necesita encima (posiciones, URL con contraseña, tramos de rutas).
import * as bitacora from './secretos-bitacora.mjs';

const PATRONES = [
  ['llave privada', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g],
  ['llave de AWS', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['secreto de AWS', /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/gi],
  ['token de GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g],
  ['llave de Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  ['llave de OpenRouter', /\bsk-or-v1-[A-Za-z0-9]{32,}/g],
  ['llave de OpenAI', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g],
  ['llave de Stripe', /\b[rsp]k_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ['token de Slack', /\bxox[abeprs]-[A-Za-z0-9-]{10,}/g],
  ['llave de Google', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['llave de Resend', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['URL con contraseña', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]{3,}@[^\s]+/gi],
];
// password=..., token: "...", API_KEY=...: el valor tiene que parecer una llave, no una palabra.
const ASIGNACION = /\b([A-Za-z_]*(?:password|passwd|contrase[nñ]a|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|clave)[A-Za-z_]*)\s*[:=]\s*["']?([^\s"'`,;]{8,})/gi;
const LARGO = /[A-Za-z0-9+/_=-]{32,}/g;

export function entropia(s) {
  const f = {};
  for (const c of s) f[c] = (f[c] || 0) + 1;
  return -Object.values(f).reduce((a, n) => a + (n / s.length) * Math.log2(n / s.length), 0);
}
const clases = (s) => [/[a-z]/, /[A-Z]/, /\d/].filter((r) => r.test(s)).length;
const pareceLlave = (v) => v.length >= 8 && entropia(v) >= 3 && clases(v) >= 2 && !/^(true|false|null|undefined)$/i.test(v) && !/^https?:/.test(v);

export function detectar(texto) {
  const out = [];
  const tomar = (tipo, i, f) => { if (!out.some((x) => i < x.fin && f > x.inicio)) out.push({ tipo, inicio: i, fin: f }); };
  for (const [tipo, re] of PATRONES) for (const m of texto.matchAll(re)) tomar(tipo, m.index, m.index + m[0].length);
  for (const m of texto.matchAll(ASIGNACION)) {
    if (pareceLlave(m[2])) { const i = m.index + m[0].lastIndexOf(m[2]); tomar('valor secreto', i, i + m[2].length); }
  }
  for (const m of texto.matchAll(LARGO)) {
    // Una ruta (/var/folders/7p/l9ch…/T/…) se mira por tramos: lo que tiene forma de llave es un tramo largo, no la ruta.
    let i = m.index;
    for (const tramo of m[0].includes('/') ? m[0].split('/') : [m[0]]) {
      // Los sha de git y los hex son de dos clases: no cuentan. Una llave de verdad mezcla las tres.
      if (tramo.length >= 32 && clases(tramo) === 3 && entropia(tramo) >= 4.2) tomar('cadena con forma de llave', i, i + tramo.length);
      i += tramo.length + 1;
    }
  }
  // Lo que Bitácora encuentra y esto no, cuenta igual (sin posición: se tacha con su tachar).
  for (const h of bitacora.tachar(texto).hallados) if (!out.some((x) => x.tipo === h.tipo)) out.push({ tipo: h.tipo, inicio: -1, fin: -1 });
  return out.sort((a, b) => a.inicio - b.inicio);
}

export function tachar(texto) {
  let r = bitacora.tachar(texto).texto.replace(/\[secreto:([^\]]+)\]/g, '[secreto tachado: $1]');
  if (r !== texto) return tachar(r);
  for (const x of detectar(texto).filter((x) => x.inicio >= 0).reverse()) r = r.slice(0, x.inicio) + `[secreto tachado: ${x.tipo}]` + r.slice(x.fin);
  return r;
}

// Archivos que nunca se adjuntan, digan lo que digan.
const NOMBRES = /(^|\/)(\.env(\..*)?|\.npmrc|\.netrc|\.pgpass|id_(rsa|dsa|ecdsa|ed25519)|credentials(\.json)?|.*\.(pem|key|p12|pfx|keystore|kdbx))$/i;
export const nombreSecreto = (nombre) => (NOMBRES.test(nombre) || bitacora.ARCHIVO_SECRETO.test(nombre)) && !/\.pub$/.test(nombre);
