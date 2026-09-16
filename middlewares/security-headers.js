// middlewares/security-headers.js
// Cabeceras de seguridad básicas, sin dependencias nuevas (helmet no está en el
// proyecto y no queremos que el despliegue dependa de un npm install).
//
// No se añade Content-Security-Policy a propósito: las páginas usan scripts y
// estilos en línea y una CSP mal calibrada dejaría el sitio en blanco. Queda
// como pendiente documentado en SEGURIDAD.md.

const HSTS_MAX_AGE = 60 * 60 * 24 * 180; // 180 días

export function cabecerasSeguridad() {
  return function agregarCabeceras(req, res, next) {
    // Evita que el navegador adivine el tipo de contenido.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // El panel de administración no debe poder embeberse en un iframe ajeno
    // (clickjacking sobre los botones de bloquear/cancelar).
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // Aísla la ventana del resto de pestañas.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // Oculta que el backend es Express.
    res.removeHeader('X-Powered-By');

    // HSTS solo cuando la petición ya llegó por HTTPS (directo o vía proxy).
    const porHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (porHttps) {
      res.setHeader('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE}; includeSubDomains`);
    }

    next();
  };
}
