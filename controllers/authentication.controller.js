import bcrypt from 'bcrypt';
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import pool from './../db.js'; // Asegúrate de importar tu configuración de base de datos
import crypto from 'crypto';
import { sha256 } from '../utils/hash.js';
import { transporter } from '../utils/mailer.js';
dotenv.config();
const BASE_URL = (process.env.BASE_URL || 'http://maderasmym.cl').replace(/\/+$/, '');

export async function login(req, res) {
  const user = (req.body.user || '').trim();
  const password = req.body.password || '';

  console.log('[LOGIN] intento', { user });

  if (!user || !password) {
    console.warn('[LOGIN] campos incompletos');
    return res.status(400).json({ status: 'Error', message: 'Campos incompletos' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id_usuarios, `password` AS pass, email_verificado_at FROM usuarios WHERE `user`=? LIMIT 1',
      [user]
    );
    if (!rows.length) {
      console.warn('[LOGIN] usuario no existe', user);
      return res.status(400).json({ status: 'Error', message: 'Credenciales inválidas' });
    }

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.pass);
    if (!ok) {
      console.warn('[LOGIN] password incorrecta', user);
      return res.status(400).json({ status: 'Error', message: 'Credenciales inválidas' });
    }

    // 🔒 bloqueo si NO verificado
    if (!u.email_verificado_at) {
      console.warn('[LOGIN] email no verificado', { user, id: u.id_usuarios });
      return res.status(403).json({
        status: 'Error',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Debes verificar tu correo para iniciar sesión'
      });
    }

    console.log('[LOGIN] ok', { user, id: u.id_usuarios });
    // aquí emites tu JWT/cookie si corresponde; por ahora:
    return res.json({ status: 'ok', redirect: '/' });

  } catch (err) {
    console.error('[LOGIN] error inesperado:', err);
    return res.status(500).json({ status: 'Error', message: err.message });
  }
}

export async function register(req, res) {
  const user     = (req.body.user || '').trim();
  const email    = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const number   = (req.body.number || '').trim() || null;

  console.log('[REGISTER] intento', { user, email, number: Boolean(number) ? 'present' : 'null' });

  if (!user || !email || !password) {
    console.warn('[REGISTER] faltan campos', { user: !!user, email: !!email, password: !!password });
    return res.status(400).send({ status: 'Error', message: 'Los campos están vacíos' });
  }

  // --- validadores extra ---
  // contraseña fuerte: min 8, mayúscula, minúscula, número
    const strongPwd = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strongPwd.test(password)) {
    console.warn('[REGISTER] contraseña débil');
    return res.status(400).send({
        status: 'Error',
        message: 'La contraseña debe tener mínimo 8 caracteres e incluir mayúscula, minúscula y número.'
    });
    }

  // teléfono opcional, si viene debe ser válido
  if (number) {
    // E.164 genérico (ej: +56912345678)
    const phoneRe = /^\+?[1-9]\d{7,14}$/;
    // 🇨🇱 si solo quieres celulares Chile: const phoneRe = /^(\+?56)?\s?9\d{8}$/;
    if (!phoneRe.test(number)) {
      console.warn('[REGISTER] número inválido', number);
      return res.status(400).send({
        status: 'Error',
        message: 'El número de teléfono no es válido.'
      });
    }
  }
  // --- fin validadores extra ---

  try {
    const [duUser] = await pool.query('SELECT 1 FROM usuarios WHERE `user`=? LIMIT 1', [user]);
    const [duMail] = await pool.query('SELECT 1 FROM usuarios WHERE email=? LIMIT 1', [email]);
    if (duUser.length) {
      console.warn('[REGISTER] user duplicado', user);
      return res.status(400).send({ status: 'Error', message: 'Este usuario ya existe' });
    }
    if (duMail.length) {
      console.warn('[REGISTER] email duplicado', email);
      return res.status(400).send({ status: 'Error', message: 'Este correo ya está usado' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    const [ins] = await pool.query(
      'INSERT INTO usuarios (`user`, email, `number`, `password`, `role`, email_verificado_at) VALUES (?,?,?,?,?, NULL)',
      [user, email, number, hashPassword, 'user']
    );
    const userId = ins.insertId;
    console.log('[REGISTER] usuario creado (pendiente)', { userId, user, email });

    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(raw);
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'UPDATE usuarios SET email_verif_token=?, email_verif_expires=? WHERE id_usuarios=?',
      [tokenHash, expires, userId]
    );
    console.log('[REGISTER] token generado', { userId, expira: expires.toISOString() });

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
          <p>El enlace expira en 60 minutos.</p>
        `
      });
      console.log('[REGISTER] correo de verificación enviado', { to: email });
    } catch (mailErr) {
      console.error('[REGISTER] fallo enviando correo:', mailErr?.message || mailErr);
    }

    const comesFromForm =
      req.headers.accept?.includes('text/html') ||
      req.headers['content-type']?.includes('application/x-www-form-urlencoded');

    const checkUrl = `/register/check-email?email=${encodeURIComponent(email)}`;
    if (comesFromForm) {
      console.log('[REGISTER] redirect check-email', checkUrl);
      return res.redirect(checkUrl);
    }
    return res.status(201).send({ status: 'ok', redirect: checkUrl });

  } catch (err) {
    console.error('[REGISTER] error inesperado:', err);
    return res.status(500).send({ status: 'Error', message: err.message });
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

export async function resendVerification(req, res) {
  const email = (req.body.email || '').trim().toLowerCase();
  console.log('[RESEND] intento', { email });

  if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' });

  try {
    const [rows] = await pool.query(
      'SELECT id_usuarios, `user`, email_verificado_at FROM usuarios WHERE email=? LIMIT 1',
      [email]
    );
    if (!rows.length) {
      console.warn('[RESEND] email no encontrado', email);
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }

    const u = rows[0];
    if (u.email_verificado_at) {
      console.log('[RESEND] ya verificado', { email });
      return res.json({ ok: true, alreadyVerified: true });
    }

    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(raw);
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'UPDATE usuarios SET email_verif_token=?, email_verif_expires=? WHERE id_usuarios=?',
      [tokenHash, expires, u.id_usuarios]
    );
    console.log('[RESEND] token regenerado', { id: u.id_usuarios, expira: expires.toISOString() });

    const verifyUrl = `${BASE_URL}/verify?uid=${u.id_usuarios}&token=${raw}`;
    try {
      await transporter.sendMail({
        from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Reenvío de verificación - Maderas MyM',
        html: `<p>Hola ${u.user || ''},</p>
               <p><a href="${verifyUrl}">Verificar correo</a> (expira en 60 min)</p>`
      });
      console.log('[RESEND] correo enviado', { to: email });
    } catch (e) {
      console.error('[RESEND] fallo correo:', e?.message || e);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[RESEND] error inesperado:', e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}