import bcrypt from 'bcrypt';
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import pool from './../db.js'; // Asegúrate de importar tu configuración de base de datos
import crypto from 'crypto';           // 👈 nuevo
import nodemailer from 'nodemailer';   // 👈 nuevo
dotenv.config();

// Mailer simple con Gmail (usa App Password)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function sha256(s){ return crypto.createHash('sha256').update(String(s)).digest('hex'); }

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
            secure: false,  // Para desarrollo local, cambiar a true si estás en producción con HTTPSs
            sameSite: 'Lax', // Asegura que la cookie sea enviada con peticiones "same-site"
            maxAge: process.env.JWT_COOKIE_EXPIRES * 24 * 60 * 60 * 1000
            
        });
        res.send({ status: "ok", message: "Usuario loggeado", redirect: "/admin" });
    } catch (err) {
        res.status(500).send({ status: "Error", message: err.message });
    }
}

async function register(req, res) {
  // Normaliza entradas
  const user     = (req.body.user || '').trim();
  const email    = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const number   = (req.body.number || '').trim() || null; // opcional

  // Validación mínima
  if (!user || !email || !password) {
    return res.status(400).send({ status: "Error", message: "Los campos están vacíos" });
  }

  try {
    // ¿usuario / correo ya existen?
    const [duUser] = await pool.query('SELECT 1 FROM usuarios WHERE `user` = ? LIMIT 1', [user]);
    if (duUser.length) {
      return res.status(400).send({ status: "Error", message: "Este usuario ya existe" });
    }
    const [duMail] = await pool.query('SELECT 1 FROM usuarios WHERE email = ? LIMIT 1', [email]);
    if (duMail.length) {
      return res.status(400).send({ status: "Error", message: "Este correo ya está usado" });
    }

    // Hash de contraseña
    const salt = await bcrypt.genSalt(5);
    const hashPassword = await bcrypt.hash(password, salt);

    // 1) Crea cuenta NO verificada
    const [ins] = await pool.query(
      `INSERT INTO usuarios (\`user\`, email, \`number\`, \`password\`, \`role\`, email_verificado_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [user, email, number, hashPassword, 'user']
    );
    const userId = ins.insertId; // id_usuarios

    // 2) Genera token + expiración
    const raw     = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(raw);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 60 min

    await pool.query(
      `UPDATE usuarios
          SET email_verif_token = ?, email_verif_expires = ?
        WHERE id_usuarios = ?`,
      [tokenHash, expires, userId]
    );

    // 3) Envía correo con enlace
    const verifyUrl = `${BASE_URL}/verify?uid=${userId}&token=${raw}`;
    try {
      await transporter.sendMail({
        from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Verifica tu correo - Maderas MyM',
        html: `
          <p>Hola ${user},</p>
          <p>Confirma tu correo para activar tu cuenta en Maderas MyM:</p>
          <p><a href="${verifyUrl}">Verificar correo</a></p>
          <p>Este enlace expira en 60 minutos.</p>
        `
      });
    } catch (mailErr) {
      console.error('[REGISTER] Error enviando correo:', mailErr?.message || mailErr);
      // No rompemos el registro; podrás ofrecer "reenviar verificación".
    }

    // 4) Respuesta:
    // - Si viene de formulario HTML → redirige a pantalla "revisa tu correo"
    // - Si viene vía fetch/API → devuelve JSON con redirect
    const comesFromForm =
      req.headers.accept?.includes('text/html') ||
      req.headers['content-type']?.includes('application/x-www-form-urlencoded');

    const checkEmailUrl = `/register/check-email?email=${encodeURIComponent(email)}`;

    if (comesFromForm) {
      return res.redirect(checkEmailUrl);
    }
    return res.status(201).send({
      status: "ok",
      message: `Usuario ${user} creado. Revisa tu correo para verificar.`,
      redirect: checkEmailUrl
    });

  } catch (err) {
    console.error('[REGISTER] Error:', err);
    return res.status(500).send({ status: "Error", message: err.message });
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
