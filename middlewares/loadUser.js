// middlewares/loadUser.js
import db from '../db.js';

export default async function loadUser(req, res, next) {
  try {
    const uid = req.session?.userId;
    if (!uid) return next();
    const [rows] = await db.query(
      'SELECT id, nombre, email, email_verificado_at FROM usuarios WHERE id=?',
      [uid]
    );
    req.user = rows[0] || null;
    next();
  } catch (e) {
    next(e);
  }
}
