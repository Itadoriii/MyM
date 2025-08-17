import bcrypt from 'bcrypt';
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import pool from './../db.js'; // Asegúrate de importar tu configuración de base de datos

dotenv.config();

async function login(req, res) {
    const { user, password } = req.body;
    if (!user || !password) {
        return res.status(400).send({ status: "Error", message: "Los campos están incompletos" });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE user = ?', [user]);
        if (rows.length === 0) {
            return res.status(400).send({ status: "Error", message: "Error durante login" });
        }

        const usuarioARevisar = rows[0];
        const loginCorrecto = await bcrypt.compare(password, usuarioARevisar.password);
        if (!loginCorrecto) {
            return res.status(400).send({ status: "Error", message: "Error durante login" });
        }

        const token = jsonwebtoken.sign(
            { user: usuarioARevisar.user, role: usuarioARevisar.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRATION }
        );

        // Establece la cookie con opciones adecuadas para desarrollo
        res.cookie("jwt", token, {
            httpOnly: true,
            secure: true,  // Para desarrollo local, cambiar a true si estás en producción con HTTPS
            sameSite: 'None', // Asegura que la cookie sea enviada con peticiones "same-site"
            maxAge: process.env.JWT_COOKIE_EXPIRES * 24 * 60 * 60 * 1000,
            domain: ".maderasmym.cl"
        });
        res.send({ status: "ok", message: "Usuario loggeado", redirect: "/admin" });
    } catch (err) {
        res.status(500).send({ status: "Error", message: err.message });
    }
}

async function register(req, res) {
    const { user, password, email, number } = req.body;
    if (!user || !password || !email || !number) {
        return res.status(400).send({ status: "Error", message: "Los campos están vacíos" });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE user = ?', [user]);
        if (rows.length > 0) {
            return res.status(400).send({ status: "Error", message: "Este usuario ya existe" });
        }

        const salt = await bcrypt.genSalt(5);
        const hashPassword = await bcrypt.hash(password, salt);

        await pool.query(
    'INSERT INTO usuarios (user, email, number, password, role) VALUES (?, ?, ?, ?, ?)',
    [user, email, number, hashPassword, 'user']
);
        res.status(201).send({ status: "ok", message: `Usuario ${user} agregado`, redirect: "/" });
    } catch (err) {
        res.status(500).send({ status: "Error", message: err.message });
    }
}

function logout(req, res) {
    res.cookie("jwt", "", { expires: new Date(0), path: "/" });
    res.send({ status: "ok", message: "Usuario deslogeado", redirect: "/login" });
}

export const methods = {
    login,
    register,
    logout
};
