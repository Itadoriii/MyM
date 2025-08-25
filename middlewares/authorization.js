import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from './../db.js';

dotenv.config();

async function soloAdmin(req, res, next) {
    const logueado = await revisarCookie(req);
    if (logueado && logueado.role === 'admin') return next();
    return res.redirect("/");
}

async function soloPublico(req, res, next) {
    const logueado = await revisarCookie(req);
    if (!logueado) return next();
    return res.redirect("/profile");
}

export async function revisarCookie(req) {
    try {
        const cookieJWT = req.cookies.jwt; // Cambiar para usar req.cookies.jwt
        console.log("JWT Cookie:", cookieJWT); // Verificar la cookie
        if (!cookieJWT) return false;
        const decodificada = jsonwebtoken.verify(cookieJWT, process.env.JWT_SECRET);
        console.log("JWT Decoded:", decodificada); // Verificar la decodificación
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE user = ?', [decodificada.user]);
        if (rows.length === 0) {
            return false;
        }
        return decodificada; // Devolvemos la información decodificada del usuario
    } catch (err) {
        console.log("JWT Verification Error:", err); // Verificar errores
        return false;
    }
}

export const methods = {
    soloAdmin,
    soloPublico
};

