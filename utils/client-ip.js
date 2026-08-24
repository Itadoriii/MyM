// utils/client-ip.js
// Punto único para saber desde qué IP llega una petición.
//
// Antes cada sitio hacía `req.ip || req.socket?.remoteAddress`, y eso deja dos
// agujeros: guarda direcciones IPv6 mapeadas ("::ffff:190.1.2.3") que no casan
// con la misma IP escrita en IPv4, y no lee `CF-Connecting-IP`, que es donde
// Cloudflare pone la IP real del visitante — Express solo mira
// `X-Forwarded-For`, y con varios saltos delante puede quedarse con la del
// proxy.

// Se lee en cada llamada, no al importar: los `import` se ejecutan antes de
// que `dotenv.config()` haya poblado process.env.
function confiaEnProxy() {
  return Boolean(process.env.TRUST_PROXY);
}

export function normalizarIp(valor) {
  if (!valor) return null;
  let ip = String(valor).trim();
  // Si viene una cadena tipo "cliente, proxy1, proxy2", el cliente es el primero.
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (!ip) return null;
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7); // IPv4 mapeada
  if (ip === '::1') ip = '127.0.0.1';                            // localhost IPv6
  return ip.slice(0, 45) || null;                                // cabe en VARCHAR(45)
}

/**
 * IP del visitante, ya normalizada y lista para guardar o para agrupar en el
 * rate limit. Devuelve null solo si la petición no trae socket (tests).
 */
export function obtenerIp(req) {
  if (!req) return null;

  // Las cabeceras solo se miran si el .env declara que hay un proxy delante.
  // Sin eso, cualquiera podría mandar su propia CF-Connecting-IP y falsear
  // de dónde viene.
  if (confiaEnProxy()) {
    const cf = normalizarIp(req.headers?.['cf-connecting-ip']);
    if (cf) return cf;
    const real = normalizarIp(req.headers?.['x-real-ip']);
    if (real) return real;
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
