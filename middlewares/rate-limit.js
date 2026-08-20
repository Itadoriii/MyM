// middlewares/rate-limit.js
// Limitador de peticiones en memoria, sin dependencias externas.
// Suficiente para un solo proceso Node; si algún día levantas varias instancias,
// habría que moverlo a Redis para que compartan el contador.

const registros = new Map(); // clave -> { conteo, reinicioEn }

// Evita que el Map crezca sin control en un proceso de larga vida.
function limpiar(ahora) {
  for (const [clave, dato] of registros) {
    if (dato.reinicioEn <= ahora) registros.delete(clave);
  }
}

let ultimaLimpieza = Date.now();
const INTERVALO_LIMPIEZA = 5 * 60 * 1000;

/**
 * @param {object} opts
 * @param {number} opts.ventanaMs  Duración de la ventana.
 * @param {number} opts.max        Peticiones permitidas por ventana.
 * @param {string} opts.nombre     Etiqueta para los logs.
 * @param {(req)=>string} [opts.clave]  Cómo agrupar (por defecto, la IP).
 * @param {string} [opts.mensaje]
 * @param {(req)=>void} [opts.alBloquear]  Se llama al rechazar, para auditar.
 */
export function crearLimitador({ ventanaMs, max, nombre, clave, mensaje, alBloquear }) {
  const obtenerClave = clave || ((req) => req.ip || req.socket?.remoteAddress || 'desconocida');
  const texto = mensaje || 'Demasiadas peticiones. Espera un momento antes de reintentar.';

  return function limitador(req, res, next) {
    const ahora = Date.now();

    if (ahora - ultimaLimpieza > INTERVALO_LIMPIEZA) {
      limpiar(ahora);
      ultimaLimpieza = ahora;
    }

    const id = `${nombre}:${obtenerClave(req)}`;
    let dato = registros.get(id);

    if (!dato || dato.reinicioEn <= ahora) {
      dato = { conteo: 0, reinicioEn: ahora + ventanaMs };
      registros.set(id, dato);
    }

    dato.conteo += 1;

    if (dato.conteo > max) {
      const esperaSeg = Math.ceil((dato.reinicioEn - ahora) / 1000);
      console.warn('[RATE-LIMIT] bloqueado', { id, conteo: dato.conteo, ruta: req.originalUrl });

      if (alBloquear) {
        // Auditar no puede impedir que el bloqueo surta efecto.
        try { alBloquear(req); } catch (e) { console.warn('[RATE-LIMIT] alBloquear falló:', e?.message || e); }
      }

      res.set('Retry-After', String(esperaSeg));
      return res.status(429).json({
        success: false,
        status: 'Error',
        code: 'RATE_LIMITED',
        error: texto,
        message: texto,
        reintentarEnSegundos: esperaSeg
      });
    }

    return next();
  };
}

// Permite indultar una petición que resultó legítima, para no castigar
// al cliente que sí completó bien su acción.
export function perdonar(nombre, valorClave) {
  const dato = registros.get(`${nombre}:${valorClave}`);
  if (dato && dato.conteo > 0) dato.conteo -= 1;
}
