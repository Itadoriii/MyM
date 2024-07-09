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

        const usuarioAResvisar = rows[0];
        const loginCorrecto = await bcrypt.compare(password, usuarioAResvisar.password);
        if (!loginCorrecto) {
            return res.status(400).send({ status: "Error", message: "Error durante login" });
        }

        const token = jsonwebtoken.sign(
            { user: usuarioAResvisar.user, role: usuarioAResvisar.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRATION }
        );

        const cookieOption = {
            expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES * 24 * 60 * 60 * 1000),
            path: "/"
        };
        res.cookie("jwt", token, cookieOption);
        res.send({ status: "ok", message: "Usuario loggeado", redirect: "/admin" });
    } catch (err) {
        res.status(500).send({ status: "Error", message: err.message });
    }
}

async function register(req, res) {
    const { user, password, email } = req.body;
    if (!user || !password || !email) {
        return res.status(400).send({ status: "Error", message: "Los campos están vacíos" });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE user = ?', [user]);
        if (rows.length > 0) {
            return res.status(400).send({ status: "Error", message: "Este usuario ya existe" });
        }

        const salt = await bcrypt.genSalt(5);
        const hashPassword = await bcrypt.hash(password, salt);

        await pool.query('INSERT INTO usuarios (user, email, password, role) VALUES (?, ?, ?, ?)', [user, email, hashPassword, 'user']);
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
