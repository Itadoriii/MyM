// middlewares/authorization.js
import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from './../db.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';
const isProd = process.env.NODE_ENV === 'production';

// Renovación automática si quedan < 15 min
const RENEW_THRESHOLD_SECONDS = 15 * 60;

// --------- Utils de JWT/Cookie ----------
export function signJWT(payload) {
  return jsonwebtoken.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

export function setAuthCookie(res, token) {
  if (!res) return;
  res.cookie('jwt', token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProd,         // true SOLO en producción con HTTPS
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

    const decoded = jsonwebtoken.verify(cookieJWT, JWT_SECRET); // { uid?, user, role, iat, exp }
    console.log('[AUTH] JWT Decoded:', decoded);

    // Verifica existencia del usuario en BD (prefiere uid)
    if (decoded.uid) {
      const [rows] = await pool.query('SELECT 1 FROM usuarios WHERE id_usuarios = ? LIMIT 1', [decoded.uid]);
      if (!rows.length) return false;
    } else if (decoded.user) {
      const [rows] = await pool.query('SELECT 1 FROM usuarios WHERE `user` = ? LIMIT 1', [decoded.user]);
      if (!rows.length) return false;
    }

    // Renovación deslizante si queda poco
    const now = Math.floor(Date.now() / 1000);
    const timeLeft = (decoded.exp || 0) - now;
    if (res && timeLeft > 0 && timeLeft < RENEW_THRESHOLD_SECONDS) {
      const fresh = signJWT({ uid: decoded.uid, user: decoded.user, role: decoded.role });
      setAuthCookie(res, fresh);
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
