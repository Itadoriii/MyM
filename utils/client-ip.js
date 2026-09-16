// utils/client-ip.js
// Punto único para saber desde qué IP llega una petición.
//
// Antes cada sitio hacía `req.ip || req.socket?.remoteAddress`, y eso deja tres
// agujeros:
//   1. Guarda direcciones IPv6 mapeadas ("::ffff:190.1.2.3") que no casan con la
//      misma IP escrita en IPv4.
//   2. No lee `CF-Connecting-IP`, que es donde Cloudflare pone la IP real del
//      visitante — Express solo mira `X-Forwarded-For` y, con varios saltos
//      delante, puede quedarse con la del proxy.
//   3. Si no se define TRUST_PROXY, devuelve la IP del proxy (127.0.0.1) para
//      todo el mundo, con lo que el rate limit se agota entre todos los
//      visitantes y la auditoría no sirve para rastrear nada.

// Rangos que no pueden ser la IP pública de un visitante.
const IPV4_PRIVADAS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./
];

export function normalizarIp(valor) {
  if (!valor) return null;
  let ip = String(valor).trim();
  // Si viene una cadena tipo "cliente, proxy1, proxy2", el cliente es el primero.
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (!ip) return null;

  // Algunos proxies agregan el puerto: 1.2.3.4:5678
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, '');

  let minusculas = ip.toLowerCase();
  if (minusculas.startsWith('::ffff:')) ip = ip.slice(7); // IPv4 mapeada
  if (ip === '::1') ip = '127.0.0.1';                     // localhost IPv6

  // IPv6 entre corchetes, con o sin puerto.
  const corchetes = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (corchetes) ip = corchetes[1];

  if (!ip || ip === '::' || ip.toLowerCase() === 'unknown') return null;
  return ip.slice(0, 45) || null;                                // cabe en VARCHAR(45)
}

// ¿Es una IP que solo puede venir de la propia máquina o de la red interna?
export function esIpPrivada(valor) {
  const ip = normalizarIp(valor);
  if (!ip) return false;
  if (ip === '127.0.0.1') return true;
  if (IPV4_PRIVADAS.some(re => re.test(ip))) return true;
  const minusculas = ip.toLowerCase();
  if (minusculas.startsWith('fe80:')) return true;        // link-local
  return /^f[cd][0-9a-f]{2}:/.test(minusculas);           // ULA fc00::/7
}

// De "cliente, proxy1, proxy2" interesa la ÚLTIMA: es la que agregó el proxy
// más cercano. La primera la controla quien hace la petición (nginx con
// $proxy_add_x_forwarded_for conserva lo que ya venía en la cabecera).
function ultimaDeXForwardedFor(cabecera) {
  if (!cabecera) return null;
  const partes = String(cabecera).split(',');
  for (let i = partes.length - 1; i >= 0; i--) {
    const ip = normalizarIp(partes[i]);
    if (ip) return ip;
  }
  return null;
}

let avisadoSinTrustProxy = false;

// Se lee en cada llamada, no al importar: los `import` se ejecutan antes de
// que `dotenv.config()` haya poblado process.env.
function confiaEnProxy(req) {
  const config = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
  if (config && config !== '0' && config !== 'false') return true;

  // Sin TRUST_PROXY declarado, se aceptan las cabeceras SOLO si la conexión
  // directa llega del propio servidor o de una red privada: eso es un proxy
  // local (nginx/Apache) y sus cabeceras son fiables. Un atacante en internet
  // no puede hacer que su conexión parezca venir de 127.0.0.1, así que no puede
  // falsear la IP. Si Node estuviera expuesto directamente, el par sería una IP
  // pública y sus cabeceras se ignoran.
  const directa = normalizarIp(req?.socket?.remoteAddress);
  if (esIpPrivada(directa)) {
    if (!avisadoSinTrustProxy) {
      avisadoSinTrustProxy = true;
      console.warn(
        '[IP] proxy local detectado sin TRUST_PROXY en el .env: la IP se resuelve ' +
        'por cabeceras. Define TRUST_PROXY=1 (o TRUST_PROXY=cloudflare) para dejarlo explícito.'
      );
    }
    return true;
  }
  return false;
}

/**
 * IP del visitante, ya normalizada y lista para guardar o para agrupar en el
 * rate limit. Devuelve null solo si la petición no trae socket (tests).
 */
export function obtenerIp(req) {
  if (!req) return null;

  if (confiaEnProxy(req)) {
    // Cloudflare sobrescribe CF-Connecting-IP, así que es la fuente más fiable
    // cuando el sitio pasa por ahí.
    const cf = normalizarIp(req.headers?.['cf-connecting-ip']);
    if (cf) return cf;
    // nginx lo escribe con $remote_addr.
    const real = normalizarIp(req.headers?.['x-real-ip']);
    if (real) return real;
    // Último recurso: la última entrada de X-Forwarded-For.
    const xff = ultimaDeXForwardedFor(req.headers?.['x-forwarded-for']);
    if (xff) return xff;
  }

  return normalizarIp(req.ip) || normalizarIp(req.socket?.remoteAddress) || null;
}

/**
 * Lo que el servidor ve de verdad. Solo para diagnóstico: sirve para saber si
 * falta TRUST_PROXY cuando todas las IP guardadas salen 127.0.0.1.
 */
export function diagnosticoIp(req) {
  return {
    ipGuardada: obtenerIp(req),
    reqIp: req?.ip || null,
    socketRemoteAddress: req?.socket?.remoteAddress || null,
    trustProxyEnv: process.env.TRUST_PROXY || null,
    cabeceras: {
      'x-forwarded-for': req?.headers?.['x-forwarded-for'] || null,
      'cf-connecting-ip': req?.headers?.['cf-connecting-ip'] || null,
      'x-real-ip': req?.headers?.['x-real-ip'] || null,
      'true-client-ip': req?.headers?.['true-client-ip'] || null
    }
  };
}
