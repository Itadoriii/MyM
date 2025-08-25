// metodos.js
import crypto from 'crypto';
import db from './db.js';
import { sendMail } from './utils/mailer.js';

const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');

export default {
  register: async (req, res) => {
    try {
      const { user, email, password, number } = req.body || {};
      if (!user || !email || !password) {
        return res.status(400).json({ error: 'FIELDS_REQUIRED' });
      }

      // ¿ya existe ese email?
      const [dup] = await db.query('SELECT id FROM usuarios WHERE email=?', [email]);
      if (dup.length) return res.status(409).json({ error: 'EMAIL_EXISTS' });

      // crea usuario sin verificar (ajusta nombres de columnas a tu tabla real)
      const password_hash = sha256(password); // cambia a bcrypt si quieres
      const [ins] = await db.query(
        `INSERT INTO usuarios (nombre, email, password_hash, telefono, email_verificado_at)
         VALUES (?,?,?,?, NULL)`,
        [user, email, password_hash, number || null]
      );
      const userId = ins.insertId;

      // genera token + expiración
      const raw = crypto.randomBytes(32).toString('hex');
      const tokenHash = sha256(raw);
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 60 min

      await db.query(
        `UPDATE usuarios SET email_verif_token=?, email_verif_expires=? WHERE id=?`,
        [tokenHash, expires, userId]
      );

      // envía correo con enlace
      const base = process.env.BASE_URL || 'http://localhost:3000';
      const verifyUrl = `${base}/verify?uid=${userId}&token=${raw}`;

      // si el mail falla, NO rompemos (el usuario puede re-enviar después)
      try {
        await sendMail({
          to: email,
          subject: 'Verifica tu correo - Maderas MyM',
          html: `
            <p>Hola ${user},</p>
            <p>Confirma tu correo para activar tu cuenta en Maderas MyM:</p>
            <p><a href="${verifyUrl}">Verificar correo</a></p>
            <p>Este enlace expira en 60 minutos.</p>
          `
        });
      } catch (err) {
        console.error('[REGISTER] Mail error:', err?.message || err);
      }

      return res.json({ ok: true, redirect: '/login?check_email=1' });
    } catch (e) {
      console.error('[REGISTER] Error:', e);
      return res.status(500).json({ error: 'SERVER_ERROR' });
    }
  },

  // (Cuando quieras, aquí ajustas tu login para bloquear si no está verificado)
};
