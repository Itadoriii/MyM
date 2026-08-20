import bcrypt from 'bcrypt';
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";
import pool from './../db.js'; // Asegúrate de importar tu configuración de base de datos
import crypto from 'crypto';
import { sha256 } from '../utils/hash.js';
import { transporter } from '../utils/mailer.js';
import { validarEmailRegistro } from '../utils/email-guard.js';
import { verificarCaptcha, captchaActivo } from '../utils/turnstile.js';
import { registrarIntento } from '../utils/audit.js';
dotenv.config();
const BASE_URL = (process.env.BASE_URL || 'http://maderasmym.cl').replace(/\/+$/, '');

// Política de contraseña: mín. 8, mayúscula, minúscula y número.
const STRONG_PWD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PWD_RULE_MSG = 'La contraseña debe tener mínimo 8 caracteres e incluir mayúscula, minúscula y número.';

// Vigencia del enlace de recuperación.
const RESET_TTL_MIN = 60;



// 👇 Asegúrate de tener este util (tal cual te lo pasé)
import { signJWT, setAuthCookie } from '../middlewares/authorization.js';

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
      'SELECT id_usuarios, `password` AS pass, email_verificado_at, `role`, bloqueado FROM usuarios WHERE `user`=? LIMIT 1',
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

    // 🚫 Cuentas suspendidas por abuso: no entran, aunque la clave sea correcta.
    if (u.bloqueado) {
      console.warn('[LOGIN] cuenta bloqueada', { user, id: u.id_usuarios });
      return res.status(403).json({
        status: 'Error',
        code: 'ACCOUNT_BLOCKED',
        message: 'Esta cuenta está suspendida. Escríbenos si crees que es un error.'
      });
    }

    // ✅ Solo usuarios con email verificado
    if (!u.email_verificado_at) {
      console.warn('[LOGIN] email no verificado', { user, id: u.id_usuarios });
      return res.status(403).json({
        status: 'Error',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Debes verificar tu correo para iniciar sesión'
      });
    }

    // 🔐 Firmar JWT y guardarlo en cookie httpOnly
    //    (el util setAuthCookie ya configura httpOnly/sameSite/secure/maxAge)
    const payload = { uid: u.id_usuarios, user, role: u.role };
    const token = signJWT(payload);
    setAuthCookie(res, token);

    // ↪️ Redirección según rol
    const redirect = u.role === 'admin' ? '/admin' : '/';
    console.log('[LOGIN] ok', { user, id: u.id_usuarios, role: u.role, redirect });

    return res.json({ status: 'ok', redirect });
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
  const captcha  = req.body['cf-turnstile-response'] || req.body.captcha || '';
  const ip       = req.ip || req.socket?.remoteAddress || null;

  console.log('[REGISTER] intento', { user, email, ip, number: Boolean(number) ? 'present' : 'null' });

  // Deja constancia del intento pase lo que pase, para poder revisarlo después
  // desde el panel y banear a quien esté creando cuentas en cadena.
  const auditar = (resultado, motivo, idUsuario = null) =>
    registrarIntento({ req, usuario: user, email, telefono: number, resultado, motivo, idUsuario });

  if (!user || !email || !password) {
    console.warn('[REGISTER] faltan campos', { user: !!user, email: !!email, password: !!password });
    await auditar('rechazado', 'CAMPOS_VACIOS');
    return res.status(400).send({ status: 'Error', message: 'Los campos están vacíos' });
  }

  // --- validadores extra ---

  // captcha: descarta el registro automatizado en masa
  if (captchaActivo()) {
    const resultado = await verificarCaptcha(captcha, ip);
    if (!resultado.ok) {
      console.warn('[REGISTER] captcha rechazado', { user, email, motivo: resultado.motivo, ip });
      await auditar('rechazado', 'CAPTCHA');
      return res.status(400).send({
        status: 'Error',
        code: 'CAPTCHA_FAILED',
        message: 'No pudimos verificar que seas una persona. Recarga la página e inténtalo de nuevo.'
      });
    }
  }

  // correo: sin buzones temporales ni dominios inexistentes
  const revisionEmail = await validarEmailRegistro(email);
  if (!revisionEmail.ok) {
    console.warn('[REGISTER] correo rechazado', { email, motivo: revisionEmail.motivo, ip });
    await auditar('rechazado', revisionEmail.motivo);
    return res.status(400).send({
      status: 'Error',
      code: revisionEmail.motivo,
      message: revisionEmail.mensaje
    });
  }

  // contraseña fuerte: min 8, mayúscula, minúscula, número
    if (!STRONG_PWD.test(password)) {
    console.warn('[REGISTER] contraseña débil');
    await auditar('rechazado', 'PASSWORD_DEBIL');
    return res.status(400).send({
        status: 'Error',
        message: PWD_RULE_MSG
    });
    }

  // teléfono opcional, si viene debe ser válido
  if (number) {
    // E.164 genérico (ej: +56912345678)
    const phoneRe = /^\+?[1-9]\d{7,14}$/;
    // 🇨🇱 si solo quieres celulares Chile: const phoneRe = /^(\+?56)?\s?9\d{8}$/;
    if (!phoneRe.test(number)) {
      console.warn('[REGISTER] número inválido', number);
      await auditar('rechazado', 'TELEFONO_INVALIDO');
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
      await auditar('rechazado', 'USUARIO_DUPLICADO');
      return res.status(400).send({ status: 'Error', message: 'Este usuario ya existe' });
    }
    if (duMail.length) {
      console.warn('[REGISTER] email duplicado', email);
      await auditar('rechazado', 'EMAIL_DUPLICADO');
      return res.status(400).send({ status: 'Error', message: 'Este correo ya está usado' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    const [ins] = await pool.query(
      'INSERT INTO usuarios (`user`, email, `number`, `password`, `role`, email_verificado_at) VALUES (?,?,?,?,?, NULL)',
      [user, email, number, hashPassword, 'user']
    );
    const userId = ins.insertId;
    console.log('[REGISTER] usuario creado (pendiente)', { userId, user, email, ip });
    await auditar('creado', null, userId);

    // Deja rastro de la IP para poder identificar registros en cadena.
    try {
      await pool.query('UPDATE usuarios SET ip_registro = ? WHERE id_usuarios = ?', [ip, userId]);
    } catch (e) {
      console.warn('[REGISTER] no se pudo guardar ip_registro:', e?.message || e);
    }

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
    await auditar('rechazado', 'ERROR_SERVIDOR');
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

/* ============================================================
   Recuperación de contraseña
   ============================================================ */

// Anti-spam simple en memoria: un envío por identificador cada 60 s.
const ultimoEnvio = new Map();
const THROTTLE_MS = 60 * 1000;

function estaThrottleado(clave) {
  const previo = ultimoEnvio.get(clave);
  const ahora = Date.now();
  if (previo && ahora - previo < THROTTLE_MS) return true;
  ultimoEnvio.set(clave, ahora);
  // Limpieza perezosa para que el Map no crezca sin control.
  if (ultimoEnvio.size > 500) {
    for (const [k, t] of ultimoEnvio) {
      if (ahora - t > THROTTLE_MS) ultimoEnvio.delete(k);
    }
  }
  return false;
}

// Busca la cuenta con un token de reseteo vigente. Devuelve null si no aplica.
async function buscarCuentaPorToken(uid, token) {
  if (!uid || !token) return null;

  const [rows] = await pool.query(
    'SELECT id_usuarios, `user`, reset_expires FROM usuarios WHERE id_usuarios=? AND reset_token=? LIMIT 1',
    [uid, sha256(token)]
  );
  if (!rows.length) return null;

  const cuenta = rows[0];
  if (!cuenta.reset_expires || new Date(cuenta.reset_expires) < new Date()) return null;
  return cuenta;
}

// POST /api/password/forgot  → siempre responde ok (no revela si la cuenta existe)
export async function forgotPassword(req, res) {
  const identificador = (req.body.identificador || req.body.email || req.body.user || '').trim();
  console.log('[FORGOT] intento', { identificador });

  if (!identificador) {
    return res.status(400).json({ status: 'Error', message: 'Ingresa tu correo o nombre de usuario' });
  }

  // Respuesta genérica: no confirma ni desmiente que la cuenta exista.
  const respuestaGenerica = () => res.json({
    ok: true,
    message: 'Si la cuenta existe, te enviamos un enlace para restablecer tu contraseña.'
  });

  if (estaThrottleado(identificador.toLowerCase())) {
    console.warn('[FORGOT] throttle', identificador);
    return respuestaGenerica();
  }

  try {
    const [cuentas] = await pool.query(
      'SELECT id_usuarios, `user`, email FROM usuarios WHERE email=? OR `user`=? LIMIT 5',
      [identificador.toLowerCase(), identificador]
    );

    if (!cuentas.length) {
      console.warn('[FORGOT] sin coincidencias', identificador);
      return respuestaGenerica();
    }

    // Un mismo correo puede tener más de una cuenta: se envía un enlace por cuenta.
    for (const cuenta of cuentas) {
      if (!cuenta.email || !cuenta.email.includes('@')) {
        console.warn('[FORGOT] cuenta sin correo válido', { id: cuenta.id_usuarios });
        continue;
      }

      const raw = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);

      await pool.query(
        'UPDATE usuarios SET reset_token=?, reset_expires=? WHERE id_usuarios=?',
        [sha256(raw), expires, cuenta.id_usuarios]
      );

      const resetUrl = `${BASE_URL}/reset-password?uid=${cuenta.id_usuarios}&token=${raw}`;
      try {
        await transporter.sendMail({
          from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
          to: cuenta.email,
          subject: 'Restablece tu contraseña - Maderas MyM',
          html: `
            <p>Hola ${cuenta.user || ''},</p>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta
               <strong>${cuenta.user || ''}</strong> en Maderas MyM.</p>
            <p><a href="${resetUrl}">Restablecer mi contraseña</a></p>
            <p>El enlace expira en ${RESET_TTL_MIN} minutos y solo puede usarse una vez.</p>
            <p>Si no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando.</p>
          `
        });
        console.log('[FORGOT] correo enviado', { id: cuenta.id_usuarios, expira: expires.toISOString() });
      } catch (mailErr) {
        console.error('[FORGOT] fallo enviando correo:', mailErr?.message || mailErr);
      }
    }

    return respuestaGenerica();
  } catch (e) {
    console.error('[FORGOT] error inesperado:', e);
    return res.status(500).json({ status: 'Error', message: 'Error del servidor' });
  }
}

// GET /api/password/reset/check?uid=&token=  → valida el enlace antes de mostrar el formulario
export async function checkResetToken(req, res) {
  try {
    const uid   = Number(req.query.uid || 0);
    const token = req.query.token || '';

    const cuenta = await buscarCuentaPorToken(uid, token);
    if (!cuenta) {
      console.warn('[RESET] token inválido o expirado', { uid });
      return res.status(400).json({ ok: false, code: 'INVALID_TOKEN' });
    }

    return res.json({ ok: true, user: cuenta.user });
  } catch (e) {
    console.error('[RESET] error validando token:', e);
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
  }
}

// POST /api/password/reset  → aplica la nueva contraseña
export async function resetPassword(req, res) {
  const uid      = Number(req.body.uid || 0);
  const token    = req.body.token || '';
  const password = req.body.password || '';

  console.log('[RESET] intento', { uid });

  if (!uid || !token || !password) {
    return res.status(400).json({ status: 'Error', message: 'Solicitud incompleta' });
  }

  if (!STRONG_PWD.test(password)) {
    console.warn('[RESET] contraseña débil', { uid });
    return res.status(400).json({ status: 'Error', message: PWD_RULE_MSG });
  }

  try {
    const cuenta = await buscarCuentaPorToken(uid, token);
    if (!cuenta) {
      console.warn('[RESET] token inválido o expirado', { uid });
      return res.status(400).json({
        status: 'Error',
        code: 'INVALID_TOKEN',
        message: 'El enlace no es válido o ya expiró. Solicita uno nuevo.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    // Quien abre el enlace demostró tener acceso al correo: se marca verificado
    // si aún no lo estaba, para que pueda iniciar sesión de inmediato.
    await pool.query(
      `UPDATE usuarios
          SET \`password\`=?,
              reset_token=NULL,
              reset_expires=NULL,
              email_verificado_at=COALESCE(email_verificado_at, NOW())
        WHERE id_usuarios=?`,
      [hashPassword, cuenta.id_usuarios]
    );

    console.log('[RESET] contraseña actualizada', { uid: cuenta.id_usuarios, user: cuenta.user });
    return res.json({ status: 'ok', redirect: '/login?reset=1' });
  } catch (e) {
    console.error('[RESET] error inesperado:', e);
    return res.status(500).json({ status: 'Error', message: 'Error del servidor' });
  }
}

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