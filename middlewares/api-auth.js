// middlewares/api-auth.js
// Autenticación para rutas /api/*: responde JSON en vez de redirigir a /login,
// que es lo que necesita el front cuando llama con fetch().
import pool from '../db.js';
import { revisarCookie } from './authorization.js';

// Lee la identidad desde la cookie y la contrasta contra la BD.
// El rol se toma SIEMPRE de la base, no del JWT: así, si degradas o bloqueas
// a alguien, deja de ser admin al instante sin esperar a que expire su token.
async function identificar(req, res) {
  const decoded = await revisarCookie(req, res);
  if (!decoded) return null;

  const [rows] = await pool.query(
    'SELECT id_usuarios, `user`, `role`, email_verificado_at, bloqueado FROM usuarios WHERE id_usuarios = ? OR `user` = ? LIMIT 1',
    [decoded.uid || 0, decoded.user || '']
  );
  if (!rows.length) return null;

  return rows[0];
}

// Exige sesión iniciada y cuenta activa.
export async function requireApiAuth(req, res, next) {
  const cuenta = await identificar(req, res);

  if (!cuenta) {
    return res.status(401).json({ success: false, error: 'Debes iniciar sesión', code: 'NO_AUTH' });
  }
  if (cuenta.bloqueado) {
    console.warn('[API-AUTH] cuenta bloqueada intentó operar', { id: cuenta.id_usuarios, user: cuenta.user });
    return res.status(403).json({ success: false, error: 'Cuenta suspendida', code: 'ACCOUNT_BLOCKED' });
  }

  req.cuenta = cuenta;
  return next();
}

// Exige además uno de los roles indicados.
export function requireApiRole(...roles) {
  return async (req, res, next) => {
    const cuenta = req.cuenta || await identificar(req, res);

    if (!cuenta) {
      return res.status(401).json({ success: false, error: 'Debes iniciar sesión', code: 'NO_AUTH' });
    }
    if (cuenta.bloqueado) {
      return res.status(403).json({ success: false, error: 'Cuenta suspendida', code: 'ACCOUNT_BLOCKED' });
    }
    if (!roles.includes(cuenta.role)) {
      console.warn('[API-AUTH] acceso denegado', {
        user: cuenta.user,
        role: cuenta.role,
        requiere: roles,
        ruta: req.originalUrl,
        ip: req.ip
      });
      return res.status(403).json({ success: false, error: 'No autorizado', code: 'FORBIDDEN' });
    }

    req.cuenta = cuenta;
    return next();
  };
}

export const requireApiAdmin = requireApiRole('admin');
