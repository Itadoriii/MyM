// middlewares/passport-setup.js
// Alta e inicio de sesión con Google.
//
// Esta puerta se saltaba TODO el antiabuso: creaba cuentas sin captcha, sin
// filtro de dominios, sin límite por IP, sin dejar rastro en el historial de
// registros, y el callback entregaba la sesión sin mirar si la cuenta estaba
// bloqueada. Ahora pasa por los mismos controles que el registro normal y,
// si no está configurada, ni siquiera se monta.
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from '../db.js';
import dotenv from 'dotenv';
import { validarEmailRegistro } from '../utils/email-guard.js';
import { registrarIntento } from '../utils/audit.js';
import { obtenerIp } from '../utils/client-ip.js';

dotenv.config();

// Bastan el Client ID y el Secret. La URL de callback se calcula por petición
// según el dominio por el que entra el usuario (ver urlCallbackGoogle en
// index.js), así funciona igual en local que en maderasmym.cl con o sin www.
// Antes estaba fija en "http://localhost:3000/...", que en producción no
// funcionaba y en cambio dejaba abierta una ruta de alta sin controles.
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL  = (process.env.GOOGLE_CALLBACK_URL
  || process.env.GOOGLE_CALLBACK_URL_PROD
  || 'http://localhost:3000/auth/google/callback').trim();

export const googleActivo = Boolean(CLIENT_ID && CLIENT_SECRET);

if (!googleActivo) {
  console.log('[CONFIG] login con Google desactivado (faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET).');
} else {
  passport.use(new GoogleStrategy({
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
      passReqToCallback: true   // necesario para poder auditar la IP
    },
    async (req, accessToken, refreshToken, profile, done) => {
      const email = (profile.emails?.[0]?.value || '').trim().toLowerCase();
      const nombre = (profile.displayName || '').trim().slice(0, 100) || email.split('@')[0];
      const ip = obtenerIp(req);

      try {
        // 1. ¿Ya existe la cuenta? Se busca por google_id y también por correo,
        //    para no crear una cuenta duplicada de alguien ya registrado.
        const [rows] = await pool.query(
          'SELECT id_usuarios, `user`, email, `role`, bloqueado FROM usuarios WHERE google_id = ? OR email = ? LIMIT 1',
          [profile.id, email]
        );

        if (rows.length) {
          const cuenta = rows[0];
          if (cuenta.bloqueado) {
            console.warn('[GOOGLE] cuenta bloqueada intentó entrar', { id: cuenta.id_usuarios, email });
            await registrarIntento({ req, usuario: cuenta.user, email, resultado: 'rechazado', motivo: 'CUENTA_BLOQUEADA' });
            return done(null, false, { message: 'Cuenta suspendida' });
          }
          return done(null, cuenta);
        }

        // 2. Cuenta nueva: mismo filtro de correo que el registro normal.
        const revision = await validarEmailRegistro(email);
        if (!revision.ok) {
          console.warn('[GOOGLE] correo rechazado', { email, motivo: revision.motivo });
          await registrarIntento({ req, usuario: nombre, email, resultado: 'rechazado', motivo: revision.motivo });
          return done(null, false, { message: revision.mensaje });
        }

        // El correo de Google ya está verificado por Google: se marca como tal.
        const [result] = await pool.query(
          'INSERT INTO usuarios (`user`, email, google_id, `role`, email_verificado_at, ip_registro) VALUES (?, ?, ?, ?, NOW(), ?)',
          [nombre, email, profile.id, 'user', ip]
        );

        const cuenta = { id_usuarios: result.insertId, user: nombre, email, role: 'user', bloqueado: 0 };
        console.log('[GOOGLE] cuenta creada', { id: cuenta.id_usuarios, email, ip });
        await registrarIntento({ req, usuario: nombre, email, resultado: 'creado', motivo: 'GOOGLE', idUsuario: cuenta.id_usuarios });

        return done(null, cuenta);
      } catch (err) {
        console.error('[GOOGLE] error en el alta:', err);
        return done(err, null);
      }
    }
  ));
}

passport.serializeUser((user, done) => {
  done(null, user.id_usuarios);
});

passport.deserializeUser(async (id, done) => {
  try {
    const [rows] = await pool.query(
      'SELECT id_usuarios, `user`, email, `role`, bloqueado FROM usuarios WHERE id_usuarios = ? LIMIT 1',
      [id]
    );
    done(null, rows[0] || false);
  } catch (err) {
    done(err, null);
  }
});
