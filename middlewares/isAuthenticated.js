import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const isAuthenticated = (req, res, next) => {
  const token = req.cookies.jwt;
  if (token) {
    try {
      const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
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
