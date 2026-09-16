// middlewares/authorization.js
import jsonwebtoken from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pool from './../db.js';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

// El secreto NUNCA puede tener un valor por defecto conocido: quien lo sepa
// se firma un token {role:'admin'} y entra al panel sin contraseña. Como este
// código está publicado, un literal en el fuente equivale a no tener clave.
// Si falta en producción se genera uno aleatorio: el sitio sigue en pie y
// nadie puede falsificar tokens, pero cada reinicio cierra las sesiones. El
// log lo grita para que se configure de verdad.
const JWT_SECRET = (() => {
  const configurado = process.env.JWT_SECRET;
  if (configurado && configurado.length >= 24) return configurado;

  if (configurado) {
    console.error('[FATAL] JWT_SECRET es demasiado corto (mínimo 24 caracteres). Genera uno con: openssl rand -hex 32');
  } else {
    console.error('[FATAL] falta JWT_SECRET en el .env. Genera uno con: openssl rand -hex 32');
  }
  console.error('[FATAL] se usa un secreto aleatorio temporal: las sesiones se cerrarán en cada reinicio.');
  return crypto.randomBytes(48).toString('hex');
})();

const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';

// Renovación automática si quedan < 15 min
const RENEW_THRESHOLD_SECONDS = 15 * 60;

// --------- Utils de JWT/Cookie ----------
export function signJWT(payload) {
  return jsonwebtoken.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

// Único verificador del proyecto. Antes cada archivo llamaba a
// jsonwebtoken.verify(token, process.env.JWT_SECRET) por su cuenta, así que
// bastaba con que la variable no estuviera puesta para que unos módulos
// firmaran con un secreto y otros validaran con otro.
export function verifyJWT(token) {
  return jsonwebtoken.verify(token, JWT_SECRET);
}

export function setAuthCookie(res, token, req = null) {
  if (!res) return;
  // `secure` no puede depender solo de NODE_ENV: si esa variable no está puesta
  // (como pasaba aquí) la cookie viajaba también por HTTP. Se marca segura si
  // NODE_ENV es producción, si se pide con COOKIE_SECURE=1 o si la petición ya
  // llegó por HTTPS (req.secure respeta trust proxy y X-Forwarded-Proto).
  const porHttps = Boolean(req && (req.secure || req.headers?.['x-forwarded-proto'] === 'https'));
  const seguro = isProd || process.env.COOKIE_SECURE === '1' || porHttps;

  res.cookie('jwt', token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: seguro,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
  });
}

export function clearAuthCookie(res) {
  if (!res) return;
  res.cookie('jwt', '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProd,
    path: '/',
    maxAge: 0
  });
}

// --------- Core: revisar cookie ----------
export async function revisarCookie(req, res = null) {
  try {
    const cookieJWT = req.cookies?.jwt;
    console.log('[AUTH] JWT Cookie:', cookieJWT ? '[present]' : '[missing]');
    if (!cookieJWT) return false;

    const decoded = verifyJWT(cookieJWT); // { uid?, user, role, iat, exp }
    console.log('[AUTH] JWT Decoded:', decoded);

    // La cuenta se relee en cada petición: el token dura 7 días y en ese plazo
    // se puede haber bloqueado la cuenta o quitado el rol de admin. Lo que diga
    // el token sobre el rol no vale nada; manda la base de datos.
    let cuenta = null;
    if (decoded.uid) {
      const [rows] = await pool.query(
        'SELECT id_usuarios, `user`, `role`, bloqueado FROM usuarios WHERE id_usuarios = ? LIMIT 1',
        [decoded.uid]
      );
      cuenta = rows[0] || null;
    } else if (decoded.user) {
      const [rows] = await pool.query(
        'SELECT id_usuarios, `user`, `role`, bloqueado FROM usuarios WHERE `user` = ? LIMIT 1',
        [decoded.user]
      );
      cuenta = rows[0] || null;
    }

    if (!cuenta) return false;

    if (cuenta.bloqueado) {
      console.warn('[AUTH] cuenta bloqueada intentó usar su sesión', { id: cuenta.id_usuarios, user: cuenta.user });
      if (res) clearAuthCookie(res);
      return false;
    }

    decoded.role = cuenta.role;      // el rol real, no el que venga firmado
    decoded.uid  = cuenta.id_usuarios;
    decoded.user = cuenta.user;

    // Renovación deslizante si queda poco
    const now = Math.floor(Date.now() / 1000);
    const timeLeft = (decoded.exp || 0) - now;
    if (res && timeLeft > 0 && timeLeft < RENEW_THRESHOLD_SECONDS) {
      const fresh = signJWT({ uid: decoded.uid, user: decoded.user, role: decoded.role });
      setAuthCookie(res, fresh, req);
      console.log('[AUTH] JWT renovado (sliding). Segundos restantes previos:', timeLeft);
    }

    return decoded;
  } catch (err) {
    console.log('[AUTH] JWT Verification Error:', err);
    if (res) clearAuthCookie(res); // limpia si está vencido/invalid
    return false;
  }
}

// --------- Middlewares ----------
export async function requireAuth(req, res, next) {
  const u = await revisarCookie(req, res);
  if (!u) return res.status(401).redirect('/login');
  req.user = u;
  return next();
}

export function requireRole(role) {
  return async (req, res, next) => {
    const u = req.user || await revisarCookie(req, res);
    if (!u) return res.status(401).redirect('/login');
    if (u.role !== role) return res.status(403).send('No autorizado');
    req.user = u;
    return next();
  };
}

// Compatibilidad con tu código previo:
async function soloAdmin(req, res, next) {
  const logueado = await revisarCookie(req, res);
  if (logueado && logueado.role === 'admin') return next();
  return res.redirect('/');
}

async function soloPublico(req, res, next) {
  const logueado = await revisarCookie(req, res);
  if (!logueado) return next();
  return res.redirect('/profile');
}

// Export “methods” para mantener tu import existente:
export const methods = {
  soloAdmin,
  soloPublico,
};

// (Opcional) exportar también directamente:
export { soloAdmin, soloPublico };
