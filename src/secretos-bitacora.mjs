// Redactor de secretos. Se corre sobre todo texto antes de mandarlo a un modelo o a un destino.
// Módulo suelto a propósito: no importa nada del resto de Bitácora.
//
//   tachar(texto, { correos }) → { texto, hallados: [{ tipo, desde, hasta }] }
//
// Dos capas: formatos conocidos (lista) y cadenas largas de alta entropía junto a una palabra
// que suena a secreto o sueltas si son muy largas.

const MARCA = tipo => `[secreto:${tipo}]`

// El orden importa: los más específicos primero.
export const PATRONES = [
  ['llave-privada', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g],
  ['anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  ['openrouter', /\bsk-or-(?:v1-)?[A-Za-z0-9]{20,}/g],
  ['openai', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g],
  ['stripe', /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ['github', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g],
  ['gitlab', /\bglpat-[A-Za-z0-9_-]{20,}/g],
  ['slack', /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ['slack-webhook', /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g],
  ['aws', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['google', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['google-oauth', /\bya29\.[0-9A-Za-z_-]{20,}/g],
  ['notion', /\b(?:secret_[A-Za-z0-9]{40,}|ntn_[A-Za-z0-9]{40,})/g],
  ['huggingface', /\bhf_[A-Za-z0-9]{30,}/g],
  ['npm', /\bnpm_[A-Za-z0-9]{36}\b/g],
  ['sendgrid', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g],
  ['resend', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/g],
  ['telegram', /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['url-con-clave', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]{3,})@/gi],
  ['bearer', /\b(?:Bearer|Token|Basic)\s+([A-Za-z0-9._~+/=-]{16,})/g],
  // VAR=valor de un .env o de un export, cuando el nombre suena a secreto.
  // Lo ya tachado por un patrón de arriba no se vuelve a tachar.
  ['variable', /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD|CREDENTIAL|AUTH|PRIVATE|SESSION)[A-Z0-9_]*)\s*[=:]\s*(["']?)(?!\[secreto:)([^\s"'`]{6,})\2/g],
  ['clave-json', /"((?:[a-z_]*)(?:api_?key|token|secret|password|passwd|client_secret|access_key|private_key))"\s*:\s*"(?!\[secreto:)([^"]{6,})"/gi],
]

const PALABRA = /(key|token|secret|password|passwd|clave|contraseña|llave|bearer|auth|credential|api)/i

export function entropia(s) {
  const f = new Map()
  for (const c of s) f.set(c, (f.get(c) || 0) + 1)
  let h = 0
  for (const n of f.values()) h -= (n / s.length) * Math.log2(n / s.length)
  return h
}

const clases = s => [/[a-z]/, /[A-Z]/, /\d/].filter(r => r.test(s)).length

// Cadenas que no son secretos aunque lo parezcan: hashes de commit, uuids, rutas.
const INOCENTE = /^(?:[0-9a-f]{7,40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

function sospechosa(tok, antes) {
  if (tok.length < 20 || INOCENTE.test(tok) || tok.includes('/') || tok.startsWith('[secreto')) return false
  if (clases(tok) < 2) return false
  const h = entropia(tok)
  if (PALABRA.test(antes) && h >= 3.5) return true
  return tok.length >= 32 && clases(tok) === 3 && h >= 4.2
}

export function tachar(texto, { correos = false } = {}) {
  if (!texto) return { texto: texto || '', hallados: [] }
  const hallados = []
  let out = String(texto)
  for (const [tipo, re] of PATRONES) {
    out = out.replace(re, (todo, ...g) => {
      hallados.push({ tipo })
      if (tipo === 'variable') return `${g[0]}=${MARCA(tipo)}`
      if (tipo === 'clave-json') return `"${g[0]}": "${MARCA(tipo)}"`
      if (tipo === 'url-con-clave') return todo.replace(g[0], MARCA(tipo))
      if (tipo === 'bearer') return todo.replace(g[0], MARCA(tipo))
      return MARCA(tipo)
    })
  }
  out = out.replace(/(?<![A-Za-z0-9_+/=.-])[A-Za-z0-9_+/=.-]{20,}/g, (tok, pos, todo) => {
    if (!sospechosa(tok.replace(/[.=]+$/, ''), todo.slice(Math.max(0, pos - 24), pos))) return tok
    hallados.push({ tipo: 'entropia' })
    return MARCA('entropia')
  })
  if (correos) {
    out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, () => {
      hallados.push({ tipo: 'correo' })
      return '[correo]'
    })
  }
  return { texto: out, hallados }
}

// Archivos cuyo contenido nunca debe salir, ni su texto citado.
export const ARCHIVO_SECRETO = /(^|\/)(\.env(\..+)?|.*\.pem|.*\.key|id_[a-z0-9]+|credentials(\.json)?|\.npmrc|\.netrc|secrets?\.(json|ya?ml|toml))$/i
