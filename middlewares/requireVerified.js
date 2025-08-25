// middlewares/requireVerified.js
export default function requireVerified(req, res, next) {
  // Aquí adaptas según cómo guardes el usuario en sesión
  if (!req.user || !req.user.email_verificado_at) {
    return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED' });
  }
  next();
}
