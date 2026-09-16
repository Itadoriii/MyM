import { verifyJWT } from './authorization.js';

const isAuthenticated = (req, res, next) => {
  const token = req.cookies.jwt;
  if (token) {
    try {
      const decoded = verifyJWT(token);
      if (decoded) {
        return res.redirect('/profile');
      }
    } catch (err) {
      // Si el token no es válido, continua a la siguiente ruta
      return next();
    }
  }
  return next();
};

export default isAuthenticated;
