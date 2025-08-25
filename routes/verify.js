import crypto from 'crypto';
import db from './db.js';

app.get('/verify', async (req, res) => {
  try {
    const { uid, token } = req.query;
    if (!uid || !token) return res.status(400).send('Solicitud inválida');

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await db.query(
      'SELECT id, email_verif_expires FROM usuarios WHERE id=? AND email_verif_token=?',
      [uid, tokenHash]
    );
    if (!rows.length) return res.status(400).send('Token inválido');
    if (new Date(rows[0].email_verif_expires) < new Date()) {
      return res.status(410).send('Token expirado. Solicita reenvío.');
    }

    await db.query(
      'UPDATE usuarios SET email_verificado_at=NOW(), email_verif_token=NULL, email_verif_expires=NULL WHERE id=?',
      [uid]
    );

    return res.redirect('/login?verified=1');
  } catch (e) {
    console.error('verify error:', e);
    return res.status(500).send('Error del servidor');
  }
});
