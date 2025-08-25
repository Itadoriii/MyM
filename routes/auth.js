const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const db = require('../db'); // tu pool MySQL
const { validateEmailHard } = require('../utils/emailValidation');
const { signupLimiter } = require('../middleware/limits');
const { sendMail } = require('../utils/mailer'); // tu wrapper nodemailer

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

router.post('/register', signupLimiter, async (req, res) => {
  const { nombre, email, password } = req.body;
  const v = await validateEmailHard(email);
  if (!v.ok) return res.status(400).json({ error: 'EMAIL_INVALID', reason: v.reason });

  // Crea usuario (hash de password como ya tengas)
  const [dup] = await db.query('SELECT id FROM usuarios WHERE email=?', [email]);
  if (dup.length) return res.status(409).json({ error: 'EMAIL_EXISTS' });

  const [result] = await db.query(
    'INSERT INTO usuarios (nombre, email, password_hash) VALUES (?,?,?)',
    [nombre, email, '...hash...']
  );
  const userId = result.insertId;

  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(raw);
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 60 min

  await db.query(
    'UPDATE usuarios SET email_verif_token=?, email_verif_expires=? WHERE id=?',
    [tokenHash, expires, userId]
  );

  const verifyUrl = `https://www.mym.cl/verify?uid=${userId}&token=${raw}`;
  await sendMail({
    to: email,
    subject: 'Verifica tu correo - Maderas MyM',
    html: `
      <p>Hola ${nombre},</p>
      <p>Confirma tu correo para activar tu cuenta en Maderas MyM:</p>
      <p><a href="${verifyUrl}">Verificar correo</a></p>
      <p>Este enlace expira en 60 minutos.</p>
    `
  });

  res.json({ ok: true, message: 'CHECK_EMAIL' });
});

router.get('/verify', async (req, res) => {
  const { uid, token } = req.query;
  if (!uid || !token) return res.status(400).send('Bad request');

  const tokenHash = hashToken(token);
  const [rows] = await db.query(
    'SELECT id, email_verif_expires FROM usuarios WHERE id=? AND email_verif_token=?',
    [uid, tokenHash]
  );
  if (!rows.length) return res.status(400).send('Token inválido');
  if (new Date(rows[0].email_verif_expires) < new Date()) return res.status(410).send('Token expirado');

  await db.query(
    'UPDATE usuarios SET email_verificado_at=NOW(), email_verif_token=NULL, email_verif_expires=NULL WHERE id=?',
    [uid]
  );

  // Redirige a login o perfil con mensaje de éxito
  return res.redirect('/perfil?verified=1');
});

module.exports = router;
