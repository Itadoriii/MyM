import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from '../db.js';
import dotenv from 'dotenv';
import jsonwebtoken from 'jsonwebtoken';
import { validarEmailRegistro } from '../utils/email-guard.js';

dotenv.config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // Estaba fijo en http://localhost:3000, así que en producción el login con
    // Google no podía completarse. Se toma del entorno cuando está definido.
    callbackURL: process.env.GOOGLE_CALLBACK_URL
      || process.env.GOOGLE_CALLBACK_URL_PROD
      || 'http://localhost:3000/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = (profile.emails?.[0]?.value || '').trim().toLowerCase();
      if (!email) return done(null, false);

      const COLUMNAS_CUENTA = 'id_usuarios, `user`, email, `role`, bloqueado, email_verificado_at';
      const [rows] = await pool.query(
        `SELECT ${COLUMNAS_CUENTA} FROM usuarios WHERE google_id = ?`,
        [profile.id]
      );
      let user;
      if (rows.length > 0) {
        user = rows[0];
        // Una cuenta suspendida no entra por Google. El login con contraseña ya
        // lo comprobaba, pero este camino lo saltaba por completo.
        if (user.bloqueado) {
          console.warn('[GOOGLE] cuenta bloqueada intentó entrar', { id: user.id_usuarios });
          return done(null, false);
        }
      } else {
        // El alta por Google no pasaba por el filtro de correos, así que se
        // podía esquivar el veto institucional y los dominios desechables
        // creando la cuenta directamente con Google. Se valida aquí igual.
        const revision = await validarEmailRegistro(email);
        if (!revision.ok) {
          console.warn('[GOOGLE] alta rechazada por el filtro de correos', { motivo: revision.motivo });
          return done(null, false);
        }

        const nombre = (profile.displayName || email.split('@')[0]).slice(0, 100);
        const [result] = await pool.query(
          'INSERT INTO usuarios (user, email, google_id, role, email_verificado_at) VALUES (?, ?, ?, ?, NOW())',
          [nombre, email, profile.id, 'user']
        );
        const [creados] = await pool.query(
          `SELECT ${COLUMNAS_CUENTA} FROM usuarios WHERE id_usuarios = ?`,
          [result.insertId]
        );
        user = creados[0];
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id_usuarios);
});

passport.deserializeUser(async (id, done) => {
  try {
    const [rows] = await pool.query(
      'SELECT id_usuarios, `user`, email, `role`, bloqueado FROM usuarios WHERE id_usuarios = ?',
      [id]
    );
    done(null, rows[0]);
  } catch (err) {
    done(err, null);
  }
});
