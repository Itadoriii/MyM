// utils/client-ip.js
// Resuelve la IP real del visitante cuando Node está detrás de un proxy.
//
// El problema que resuelve: si nginx/Apache/Cloudflare recibe al visitante y le
// pasa la petición a Node, el socket de Node viene del proxy. Sin esto, `req.ip`
// es 127.0.0.1 y todo lo que dependía de la IP (rate limit, auditoría, rastreo de
// abuso) queda inservible: todos los visitantes comparten la misma IP y una sola
// persona puede agotar el límite de registro de todo el sitio.
//
// Orden de confianza:
//   1. CF-Connecting-IP  -> lo escribe Cloudflare y sobrescribe lo que mande el
//      cliente. Es la fuente más fiable cuando el sitio pasa por Cloudflare.
//   2. X-Real-IP         -> lo escribe nginx con $remote_addr.
//   3. X-Forwarded-For   -> se toma la ÚLTIMA entrada, que es la que agregó el
//      proxy más cercano. La primera es controlable por el cliente (nginx con
//      $proxy_add_x_forwarded_for la conserva), así que no sirve.
//
// Las cabeceras solo se aceptan si la conexión directa viene de un proxy local o
// de una red privada, o si se activó TRUST_PROXY explícitamente. Un atacante en
// internet no puede hacer que su conexión parezca venir de 127.0.0.1, así que no
// puede falsear la IP; si Node está expuesto directamente, sus cabeceras se
// ignoran.

const IPV4_PRIVADAS = [
  [/^10\./, true],
  [/^127\./, true],
  [/^169\.254\./, true],
  [/^172\.(1[6-9]|2\d|3[01])\./, true],
  [/^192\.168\./, true],
  [/^0\./, true]
];

// ::ffff:1.2.3.4 es una IPv4 mapeada en IPv6; se devuelve como IPv4 para que la
// columna se lea igual que el resto.
export function normalizarIp(valor) {
  let ip = String(valor || '').trim();
  if (!ip) return null;

  // Algunos proxies agregan el puerto: 1.2.3.4:5678
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, '');

  const mapeada = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapeada) ip = mapeada[1];

  // IPv6 entre corchetes, con o sin puerto
  const conCorchetes = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (conCorchetes) ip = conCorchetes[1];

  if (ip === '::1') return '127.0.0.1';
  if (!ip || ip === '::' || ip === 'unknown') return null;

  // La columna es VARCHAR(45): un valor más largo no es una IP.
  if (ip.length > 45) return null;
  return ip;
}

export function esIpPrivada(ip) {
  const limpia = normalizarIp(ip);
  if (!limpia) return false;

  if (limpia === '127.0.0.1') return true;
  for (const [re, privada] of IPV4_PRIVADAS) {
    if (re.test(limpia)) return privada;
  }
  const minusculas = limpia.toLowerCase();
  if (minusculas.startsWith('fe80:')) return true;          // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(minusculas)) return true;    // ULA fc00::/7
  return false;
}

function confiarEnCabeceras(req, ipDirecta) {
  const config = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
  if (config && config !== '0' && config !== 'false') return true;
  // Sin configuración explícita: solo si la conexión llega desde el propio
  // servidor o desde una red privada, que es el caso de un proxy local.
  return esIpPrivada(ipDirecta);
}

function primeraValida(...valores) {
  for (const v of valores) {
    const ip = normalizarIp(v);
    if (ip) return ip;
  }
  return null;
}

function ultimaDeXForwardedFor(cabecera) {
  if (!cabecera) return null;
  const partes = String(cabecera).split(',');
  for (let i = partes.length - 1; i >= 0; i--) {
    const ip = normalizarIp(partes[i]);
    if (ip) return ip;
  }
  return null;
}

/**
 * Devuelve la IP del visitante, ya normalizada, o null si no se puede resolver.
 * No lanza nunca: quien la use no debe caerse por una cabecera rara.
 */
export function ipDe(req) {
  try {
    const ipDirecta = normalizarIp(req?.socket?.remoteAddress);
    const ipDeExpress = normalizarIp(req?.ip);

    if (confiarEnCabeceras(req, ipDirecta)) {
      const cabeceras = primeraValida(
        req?.headers?.['cf-connecting-ip'],
        req?.headers?.['x-real-ip'],
        ultimaDeXForwardedFor(req?.headers?.['x-forwarded-for'])
      );
      if (cabeceras) return cabeceras;
    }

    // req.ip ya considera `trust proxy` de Express cuando está configurado.
    if (ipDeExpress && ipDeExpress !== '127.0.0.1') return ipDeExpress;
    if (ipDirecta) return ipDirecta;
    return ipDeExpress;
  } catch {
    return null;
  }
}

// Agrupa intentos por IP para el rate limit. Cae a 'desconocida' para que una
// petición sin IP resoluble no comparta contador con todo el mundo.
export function claveIp(req) {
  return ipDe(req) || 'desconocida';
}
