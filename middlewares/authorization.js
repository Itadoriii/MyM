import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
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
    return res.redirect("/admin");
}

async function revisarCookie(req) {
    try {
        const cookieJWT = req.headers.cookie.split("; ").find(cookie => cookie.startsWith("jwt=")).slice(4);
        const decodificada = jsonwebtoken.verify(cookieJWT, process.env.JWT_SECRET);
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE user = ?', [decodificada.user]);
        if (rows.length === 0) {
            return false;
        }
        return decodificada; // Devolvemos la información decodificada del usuario
    } catch {
        return false;
    }
}

export const methods = {
    soloAdmin,
    soloPublico
};
