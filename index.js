import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import session from 'express-session';
import { methods as metodos } from './controllers/authentication.controller.js';
import { methods as authorization } from './middlewares/authorization.js';
import isAuthenticated from './middlewares/isAuthenticated.js'; // Importa el nuevo middleware
import './middlewares/passport-setup.js'; // Importa la configuración de passport
import pool from './db.js';
import jsonwebtoken from 'jsonwebtoken';
import dotenv from 'dotenv';
import { revisarCookie } from './middlewares/authorization.js';
// enviarConfirmacion ha sido eliminada, la lógica está en el controlador de estados
import cors from 'cors';
// import mailRouter from './routes/pedidosMail.js';
import nodemailer from 'nodemailer';
import { enviarMailCambioEstado } from './controllers/pedidos.controller.js';
import { register, login, resendVerification, forgotPassword, checkResetToken, resetPassword } from './controllers/authentication.controller.js';
import { sha256 } from './utils/hash.js';
import { ensureSchema } from './utils/ensure-schema.js';
import { requireAuth, requireRole, soloAdmin, soloPublico } from './middlewares/authorization.js';
import { requireApiAuth, requireApiAdmin } from './middlewares/api-auth.js';
import { crearLimitador } from './middlewares/rate-limit.js';
import { captchaActivo } from './utils/turnstile.js';
import { registrarIntento } from './utils/audit.js';
import bcrypt from 'bcrypt';



dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SERVIDOR 
const app = express();
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor corriendo en puerto ${port}`);
});

// Crea las columnas que falten (recuperación de contraseña y antiabuso).
ensureSchema();
 

// CONFIGURACION

// Detrás de un proxy inverso (nginx, Apache, Cloudflare) req.ip trae la IP del
// proxy, no la del visitante, y el rate limit dejaría de servir. Se activa con
// TRUST_PROXY=1 en el .env. No lo actives si Node recibe el tráfico directo:
// permitiría falsear la IP con una cabecera X-Forwarded-For.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  console.log('[CONFIG] trust proxy activado:', app.get('trust proxy'));
}

// Solo nuestro propio sitio puede llamar a la API desde un navegador.
const ORIGENES_PERMITIDOS = (
  process.env.ALLOWED_ORIGINS ||
  'https://maderasmym.cl,https://www.maderasmym.cl,http://localhost:3000'
).split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Sin cabecera Origin = misma página, app móvil o curl: no es un caso
    // que CORS pueda proteger, así que no lo bloqueamos aquí.
    if (!origin) return callback(null, true);
    if (ORIGENES_PERMITIDOS.includes(origin)) return callback(null, true);
    console.warn('[CORS] origen rechazado:', origin);
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src')));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());


// MIDDLEWARE PARA PROTEGER RUTAS
const verifyToken = async (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) {
    return res.redirect('/login');
  }
  try {
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE user = ?', [decoded.user]);
    if (rows.length === 0) {
      return res.redirect('/login');
    }
    req.user = rows[0]; // Asignamos los datos completos del usuario a `req.user`
    next();
  } catch (err) {
    return res.redirect('/login');
  }
};

/* =========================
   LÍMITES DE PETICIONES
   Frenan el registro masivo de cuentas y la generación de pedidos en cadena.
   ========================= */

// Registro: 5 cuentas por IP cada hora.
const limiteRegistro = crearLimitador({
  nombre: 'registro',
  ventanaMs: 60 * 60 * 1000,
  max: 5,
  mensaje: 'Demasiadas cuentas creadas desde esta conexión. Inténtalo más tarde.',
  // Estos intentos no llegan al controlador, así que se auditan aquí: una
  // ráfaga de RATE_LIMIT desde una misma IP es la señal más clara de abuso.
  alBloquear: (req) => registrarIntento({
    req,
    usuario: req.body?.user,
    email: req.body?.email,
    telefono: req.body?.number,
    resultado: 'rechazado',
    motivo: 'RATE_LIMIT'
  })
});

// Login: 10 intentos por IP cada 15 min, contra fuerza bruta.
const limiteLogin = crearLimitador({
  nombre: 'login',
  ventanaMs: 15 * 60 * 1000,
  max: 10,
  mensaje: 'Demasiados intentos de inicio de sesión. Espera unos minutos.'
});

// Correos salientes (verificación y recuperación): 5 por IP cada 15 min.
const limiteCorreo = crearLimitador({
  nombre: 'correo',
  ventanaMs: 15 * 60 * 1000,
  max: 5,
  mensaje: 'Demasiadas solicitudes de correo. Espera unos minutos.'
});

// Pedidos: 10 por IP cada hora. El tope por usuario (3 pendientes) sigue vigente
// dentro del endpoint; este límite ataca al que rota cuentas desde una misma IP.
const limitePedidos = crearLimitador({
  nombre: 'pedidos',
  ventanaMs: 60 * 60 * 1000,
  max: 10,
  mensaje: 'Demasiados pedidos generados desde esta conexión. Contáctanos por WhatsApp si necesitas más.'
});

// Reglas de transición de estado (PEGAR ARRIBA DEL ARCHIVO DE RUTAS)
const NEXTS = {
  generado: ['aceptado_espera_pago', 'rechazado'],
  aceptado_espera_pago: ['pagado_espera_despacho'],
  pagado_espera_despacho: ['enviado', 'retirado'],
  enviado: ['finalizado'],
  retirado: ['finalizado'],
  rechazado: [],
  finalizado: []
};
// RUTAS 


app.get('/login', isAuthenticated, (req, res) => { // Aplica el middleware aquí
  res.sendFile(__dirname + '/src/login.html');
});

app.get('/register', authorization.soloPublico, (req, res) => {
  res.sendFile(__dirname + '/src/register.html');
});
// Pantalla "revisa tu correo"
app.get('/register/check-email', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'check_email.html'));
});

// Recuperación de contraseña
app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'forgot_password.html'));
});
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'reset_password.html'));
});

app.get('/api/captcha-config', (req, res) => {
  res.json({
    activo: captchaActivo(),
    siteKey: process.env.TURNSTILE_SITE_KEY || null
  });
});

app.post('/api/register', limiteRegistro, register);
app.post('/api/login', limiteLogin, login);
app.post('/api/verify/resend', limiteCorreo, resendVerification);
app.post('/api/password/forgot', limiteCorreo, forgotPassword);
app.get('/api/password/reset/check', checkResetToken);
app.post('/api/password/reset', resetPassword);

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    const token = jsonwebtoken.sign({ user: req.user.user, role: req.user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.cookie('jwt', token, { httpOnly: true, secure: false, sameSite: 'lax' }); // sameSite:lax necesario para móviles
    res.redirect('/profile');
  });

app.get('/admin', requireAuth, requireRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'nostatic', 'admin.html'));
});

app.get('/profile', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'profile.html'));
});


app.get('/aboutus', (req, res) => {
  res.sendFile(__dirname + '/src/sobrenosotros.html');
});

// GET /productos?q=texto&page=1&limit=12
app.get('/productos', async (req, res) => {
  const q = (req.query.q || '').trim();
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.max(parseInt(req.query.limit || '12', 10), 1);
  const offset = (page - 1) * limit;

  try {
    // armamos WHERE si hay búsqueda
    const whereParts = [];
    const params = [];
    if (q) {
      whereParts.push(`(nombre_prod LIKE ? OR tipo LIKE ? OR medidas LIKE ? OR dimensiones LIKE ? OR precio_unidad LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    // total
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM productos ${whereSql}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // page data
    const [rows] = await pool.query(
      `SELECT * FROM productos ${whereSql}
       ORDER BY fecha_add DESC, id_producto DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      productos: rows,
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (err) {
    console.error('Error /productos paginado:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('jwt'); // Elimina la cookie JWT
  res.redirect('/'); // Redirige al usuario a la página de inicio de sesión
});
app.get('/productos/:productId', async (req, res) => {
  const productId = req.params.productId;

  try {
    const [rows] = await pool.query('SELECT * FROM productos WHERE id_producto = ?', [productId]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ error: 'Producto no encontrado' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/user', verifyToken, (req, res) => {
  res.json({
    user: req.user.user,
    email: req.user.email,
    role: req.user.role,
    google_id: req.user.google_id,
    number: req.user.number
  });
});

app.get('/api/usuarios', requireApiAdmin, async (req, res) => {
  try {
    // Nunca SELECT *: esta tabla guarda el hash de la contraseña y los tokens
    // de verificación y recuperación. Solo salen las columnas que usa el panel.
    const [rows] = await pool.query(
      `SELECT id_usuarios, \`user\`, email, \`number\`, \`role\`,
              email_verificado_at, bloqueado, motivo_bloqueo, ip_registro
         FROM usuarios
        ORDER BY id_usuarios DESC`
    );
    console.log('Número de usuarios encontrados:', rows.length);
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/usuarios/:id/password', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ status: 'Error', message: 'La nueva contraseña es requerida' });
  }

  // Validación básica de contraseña (puedes ajustar según tus necesidades)
  if (newPassword.length < 8) {
    return res.status(400).json({ status: 'Error', message: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(newPassword, salt);

    const [result] = await pool.query(
      'UPDATE usuarios SET password = ? WHERE id_usuarios = ?',
      [hashPassword, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'Error', message: 'Usuario no encontrado' });
    }

    res.json({ status: 'ok', message: 'Contraseña restablecida con éxito' });
  } catch (err) {
    console.error('Error al restablecer contraseña:', err);
    res.status(500).json({ status: 'Error', message: 'Error interno del servidor' });
  }
});
// Actualizar la ruta POST para crear productos
// Ruta POST para crear productos (ahora permite definir id_producto)
app.post('/api/productos', requireApiAdmin, async (req, res) => {
  const { id_producto, nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add, visible, ruta } = req.body;

  console.log('Creando nuevo producto:', req.body);

  if (!nombre_prod || !precio_unidad || !tipo || !medidas || !dimensiones || !fecha_add || visible === undefined || !ruta) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios excepto disponibilidad' });
  }

  try {
    // Si no viene id_producto, calculamos el siguiente manualmente
    let newId = id_producto;
    if (!newId || newId === '') {
      const [rows] = await pool.query('SELECT MAX(id_producto) AS maxId FROM productos');
      newId = (rows[0].maxId || 0) + 1;
    }

    const query = `
      INSERT INTO productos (
        id_producto, nombre_prod, precio_unidad, disponibilidad,
        tipo, medidas, dimensiones, fecha_add, visible, ruta
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [newId, nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add, visible, ruta];

    const [result] = await pool.query(query, params);
    res.status(201).json({ message: 'Producto creado exitosamente', id: newId });
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generar-pedido', limitePedidos, requireApiAuth, async (req, res) => {
    const { cart: bodyCart = [], delivery = null, comentarios = '' } = req.body || {};
    const cart = Array.isArray(bodyCart) ? bodyCart : [];
    if (!cart.length) return res.status(400).json({ success:false, error:'Carrito vacío' });

    // hasta 3 reintentos si hay deadlock
    const MAX_RETRY = 3;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      const connection = await pool.getConnection();
      let liberada = false;
      let pedidoConfirmado = false;   // true en cuanto el commit tiene éxito
      let idPedido = null;
      try {
        // La identidad ya la validó requireApiAuth: no hace falta releer la cookie.
        const u = { id_usuarios: req.cuenta.id_usuarios };
        const ipCliente = req.ip || req.socket?.remoteAddress || null;

        // --- Normaliza y valida el carrito antes de abrir la transacción ---
        // Se agrupan las líneas repetidas del mismo producto: antes, dos líneas
        // de 5 unidades se comparaban por separado contra el stock y un producto
        // con 6 en bodega dejaba pasar un pedido de 10.
        const MAX_UNIDADES_POR_PRODUCTO = 100;
        const MAX_PRODUCTOS_DISTINTOS = 30;
        const cantidades = new Map();
        let carritoInvalido = null;

        if (cart.length > MAX_PRODUCTOS_DISTINTOS) {
          carritoInvalido = 'El carrito tiene demasiados productos distintos.';
        }

        for (const item of cart) {
          if (carritoInvalido) break;
          const pid  = Number(item.id_producto);
          const cant = Number(item.quantity);

          if (!Number.isInteger(pid) || pid <= 0) {
            carritoInvalido = 'Hay un producto inválido en el carrito.';
            break;
          }
          if (!Number.isInteger(cant) || cant <= 0) {
            carritoInvalido = 'Las cantidades deben ser números enteros positivos.';
            break;
          }

          const acumulado = (cantidades.get(pid) || 0) + cant;
          if (acumulado > MAX_UNIDADES_POR_PRODUCTO) {
            carritoInvalido = `No puedes pedir más de ${MAX_UNIDADES_POR_PRODUCTO} unidades del mismo producto. Escríbenos por WhatsApp para pedidos mayores.`;
            break;
          }
          cantidades.set(pid, acumulado);
        }

        if (carritoInvalido) {
          connection.release();
          liberada = true;
          return res.status(400).json({ success: false, error: carritoInvalido });
        }

        await connection.beginTransaction();

        // Limitar pedidos pendientes por usuario
        const [[countPendientes]] = await connection.query(
          `SELECT COUNT(*) as total
             FROM pedidos
            WHERE id_usuario = ?
              AND estado IN ('generado', 'pendiente')`,
          [u.id_usuarios]
        );

        if (countPendientes.total >= 3) {
          await connection.rollback();
          connection.release();
          liberada = true;
          return res.status(400).json({
            success: false,
            error: 'Tienes demasiados pedidos pendientes. Espera a que se procesen antes de crear uno nuevo.'
          });
        }

        // Ordena ids para bloquear SIEMPRE en el mismo orden
        const ids = [...cantidades.keys()].sort((a, b) => a - b);

        // Bloquea filas de productos en orden
        const [rows] = await connection.query(
          `SELECT id_producto, disponibilidad, precio_unidad
             FROM productos
            WHERE id_producto IN (?)
            FOR UPDATE`,
          [ids]
        );

        const productosBD = new Map(rows.map(r => [Number(r.id_producto), r]));

        // Verifica stock y calcula el total CON EL PRECIO DE LA BASE DE DATOS.
        // El precio que manda el navegador se ignora: era manipulable y permitía
        // generar pedidos a $0.
        let precioTotal = 0;
        for (const pid of ids) {
          const prod = productosBD.get(pid);
          if (!prod) throw new Error(`El producto ${pid} ya no está disponible`);

          const need = cantidades.get(pid);
          const have = Number(prod.disponibilidad) || 0;
          if (have < need) throw new Error(`Stock insuficiente para producto ${pid}`);

          precioTotal += (Number(prod.precio_unidad) || 0) * need;
        }

        // Inserta pedido
        const [pedidoResult] = await connection.query(
          'INSERT INTO pedidos (id_usuario, precio_total, fecha_pedido, estado) VALUES (?, ?, NOW(), ?)',
          [u.id_usuarios, precioTotal, 'generado']
        );
        idPedido = pedidoResult.insertId;

        // Inserta detalle en el MISMO orden de bloqueo
        for (const pid of ids) {
          await connection.query(
            'INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_detalle) VALUES (?, ?, ?, ?)',
            [idPedido, pid, cantidades.get(pid), Number(productosBD.get(pid).precio_unidad) || 0]
          );
        }

        await connection.commit();
        pedidoConfirmado = true;
        // La conexión se devuelve al pool aquí. Antes no se devolvía nunca en el
        // camino de éxito y, con connectionLimit=10, el sitio se colgaba entero
        // tras una decena de pedidos.
        connection.release();
        liberada = true;

        // Registro de la IP, sin bloquear el pedido si la columna aún no existe.
        try {
          await pool.query('UPDATE pedidos SET ip_pedido = ? WHERE id_pedido = ?', [ipCliente, idPedido]);
        } catch (e) {
          console.warn('[PEDIDO] no se pudo guardar la IP:', e?.message || e);
        }
    const [[pedidoInfo]] = await pool.query(
      `SELECT p.id_pedido AS id,
              p.precio_total AS total,
              p.fecha_pedido AS fecha,
              u.user AS nombre,
              u.email,
              u.number AS telefono
       FROM pedidos p
       JOIN usuarios u ON p.id_usuario = u.id_usuarios
       WHERE p.id_pedido = ?`,
      [idPedido]
    );

    // Traemos detalles
    const [detalles] = await pool.query(
      `SELECT dp.id_producto,
              pr.nombre_prod AS nombre,
              pr.tipo,
              dp.cantidad,
              dp.precio_detalle AS precio
      FROM detalle_pedido dp
      JOIN productos pr ON dp.id_producto = pr.id_producto
      WHERE dp.id_pedido = ?`,
      [idPedido]
    );

    // ===========================
    //  ENVÍO DE CORREOS
    // ===========================
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASS
        }
      });

      // Formateadores
      const fmt = (n) => Number(n || 0).toLocaleString('es-CL');
      const fechaStr = pedidoInfo?.fecha
        ? new Date(pedidoInfo.fecha).toLocaleString('es-CL')
        : '';

      const filas = detalles.map(d => {
        const subtotal = (Number(d.cantidad)||0) * (Number(d.precio)||0);
        return `
          <tr>
            <td style="padding:8px;border:1px solid #eee;text-align:center;">${d.id_producto}</td>
            <td style="padding:8px;border:1px solid #eee;">${d.nombre}</td>
            <td style="padding:8px;border:1px solid #eee;">${d.tipo || '—'}</td>
            <td style="padding:8px;border:1px solid #eee;text-align:center;">${d.cantidad}</td>
            <td style="padding:8px;border:1px solid #eee;text-align:right;">$${fmt(d.precio)}</td>
            <td style="padding:8px;border:1px solid #eee;text-align:right;">$${fmt(subtotal)}</td>
          </tr>
        `;
      }).join('');

      const tablaHTML = `
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:700px;margin:10px 0;">
          <thead>
            <tr style="background:#f6f6f6;">
              <th style="padding:10px;border:1px solid #eee;text-align:left;">Producto</th>
              <th style="padding:10px;border:1px solid #eee;text-align:center;">Cant.</th>
              <th style="padding:10px;border:1px solid #eee;text-align:right;">Precio</th>
              <th style="padding:10px;border:1px solid #eee;text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:10px;border:1px solid #eee;text-align:right;font-weight:600;">Total</td>
              <td style="padding:10px;border:1px solid #eee;text-align:right;font-weight:600;">$${fmt(pedidoInfo.total)}</td>
            </tr>
          </tfoot>
        </table>
      `;

      // Datos que recibiste (no necesariamente guardados en DB, pero los incluimos en el correo)
      const deliveryTxt = delivery === 'retiro' ? 'Retiro en tienda' : 'Flete externo';
      const comentariosTxt = (comentarios || '').trim() ? comentarios.trim() : '—';

      // HTML para el cliente
      const htmlCliente = `
        <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#333;max-width:720px;margin:auto;">
          <h2>¡Pedido recibido con éxito!</h2>
          <p>Hola <b>${pedidoInfo.nombre || ''}</b>,</p>
          <p>Tu pedido <b>#${pedidoInfo.id}</b> fue generado correctamente el <b>${fechaStr}</b>.</p>
          <p>La tienda se pondrá en contacto contigo a la brevedad para <b>confirmar/aceptar</b> el pedido.
             Ante cualquier duda, escríbenos por WhatsApp:
             <a href="https://wa.me/56976200646" target="_blank">+56 9 7620 0646</a>.
          </p>

          <h3>Resumen</h3>
          <p><b>Método de entrega:</b> ${deliveryTxt}</p>
          <p><b>Comentarios:</b> ${comentariosTxt}</p>

          ${tablaHTML}

          <p style="margin-top:20px;">Gracias por preferir <b>Maderas MyM</b>.</p>
        </div>
      `;

      // HTML para la tienda
      const htmlTienda = `
        <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#333;max-width:720px;margin:auto;">
          <h2>Nuevo pedido recibido</h2>
          <p><b>Pedido #${pedidoInfo.id}</b> — ${fechaStr}</p>
          <p><b>Cliente:</b> ${pedidoInfo.nombre} — <b>Email:</b> ${pedidoInfo.email} — <b>Tel:</b> ${pedidoInfo.telefono || '—'}</p>
          <p><b>Método de entrega:</b> ${deliveryTxt}</p>
          <p><b>Comentarios del cliente:</b> ${comentariosTxt}</p>

          ${tablaHTML}

          <p style="margin-top:20px;">Recuerda aceptar el pedido desde el panel de Admin para enviar la confirmación.</p>
        </div>
      `;

      // Enviar al cliente
      try {
        await transporter.sendMail({
          from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
          to: pedidoInfo.email,
          subject: `Hemos recibido tu pedido #${pedidoInfo.id}`,
          html: htmlCliente
        });
        console.log('[MAIL] Enviado a cliente:', pedidoInfo.email);
      } catch (e) {
        console.warn('[MAIL] Falló envío a cliente:', e?.message);
      }

      // Enviar a la tienda (copia)
      try {
        await transporter.sendMail({
          from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
          to: process.env.GMAIL_USER,
          subject: `Nuevo pedido #${pedidoInfo.id} — ${pedidoInfo.nombre}`,
          html: htmlTienda
        });
        console.log('[MAIL] Copia a tienda enviada');
      } catch (e) {
        console.warn('[MAIL] Falló envío a tienda:', e?.message);
      }
    } catch (mailErr) {
      // no rompemos la creación del pedido por un problema de correo
      console.warn('[MAIL] Error general enviando correos:', mailErr?.message);
    }

    // Respuesta final al frontend
     return res.json({ success: true, id_pedido: idPedido });
    } catch (err) {
      // Si el fallo ocurrió después del commit (por ejemplo al enviar el correo)
      // la conexión ya se devolvió: hacerle rollback lanzaría otro error.
      if (!liberada) {
        try {
          await connection.rollback();
        } catch (e) {
          console.warn('[PEDIDO] rollback falló:', e?.message || e);
        }
        connection.release();
        liberada = true;
      }

      // El pedido ya está guardado: lo que falló fue el correo o el resumen
      // posterior. Reintentar aquí crearía un pedido duplicado, y devolver un
      // error haría que el cliente lo pidiera otra vez.
      if (pedidoConfirmado) {
        console.error('[PEDIDO] guardado, pero falló un paso posterior:', err);
        return res.json({
          success: true,
          id_pedido: idPedido,
          aviso: 'El pedido se registró, pero no pudimos enviar el correo de confirmación.'
        });
      }

      // Si es deadlock y quedan reintentos, espera un poco y reintenta
      if ((err.code === 'ER_LOCK_DEADLOCK' || err.sqlState === '40001') && attempt < MAX_RETRY) {
        await new Promise(r => setTimeout(r, 200 + Math.random()*400));
        continue;
      }
      console.error('Error al generar el pedido:', err);
      const msg = (err && (err.message || err.sqlMessage)) || 'Error interno';
      return res.status(500).json({ success:false, error: msg });
    }
  }
});


app.get('/api/verificar-usuario', async (req, res) => {
  try {
      const cookieJWT = req.cookies.jwt;
      if (!cookieJWT) return res.status(401).send({ loggedIn: false });
      
      const decoded = jsonwebtoken.verify(cookieJWT, process.env.JWT_SECRET);
      return res.status(200).send({ loggedIn: true, user: decoded.user });
  } catch (error) {
      return res.status(401).send({ loggedIn: false });
  }
});

// GET /api/pedidos?scope=generados|espera_pago|espera_despacho|despacho|finalizados|rechazados
// (Opcional: también acepta ?estado=... o múltiples ?estado=a&estado=b)
// GET /api/pedidos?scope=...
app.get('/api/pedidos', requireApiAdmin, async (req, res) => {
  try {
    const scopeRaw = String(req.query.scope || 'generados').toLowerCase();

    // Aceptamos alias: "espera_envio" y "espera_despacho" significan lo mismo
    const scope = ({
      'generados': 'generados',
      'pendientes': 'generados',

      'espera_pago': 'espera_pago',

      'espera_envio': 'espera_envio',
      'espera_despacho': 'espera_envio',     // <-- alias importante

      'despacho': 'despacho',
      'enviados': 'despacho',
      'retirados': 'despacho',

      'finalizados': 'finalizados',

      'rechazados': 'rechazados'
    })[scopeRaw] || 'generados';

    // Construye el WHERE según el scope canónico
    let where = '1=1';
    switch (scope) {
      case 'generados':
        where = "LOWER(p.estado) IN ('generado','pendiente')";
        break;
      case 'espera_pago':
        where = "LOWER(p.estado) = 'aceptado_espera_pago'";
        break;
      case 'espera_envio': // pagados esperando despacho/retiro
        where = "LOWER(p.estado) = 'pagado_espera_envio'";
        break;
      case 'despacho':
        where = "LOWER(p.estado) IN ('enviado','retirado')";
        break;
      case 'finalizados':
        where = "LOWER(p.estado) = 'finalizado'";
        break;
      case 'rechazados':
        where = "LOWER(p.estado) = 'rechazado'";
        break;
    }

    // Trae pedidos + usuario
    const [pedidos] = await pool.query(`
      SELECT 
        p.id_pedido, p.id_usuario, p.precio_total, p.fecha_pedido,
        p.estado, p.delivery, p.descripcion,
        u.user AS user, u.email, u.number
      FROM pedidos p
      JOIN usuarios u ON p.id_usuario = u.id_usuarios
      WHERE ${where}
      ORDER BY p.fecha_pedido DESC
    `);

    // Trae detalles para cada pedido
    const pedidosConDetalles = await Promise.all(
      pedidos.map(async (pedido) => {
        const [detalles] = await pool.query(`
          SELECT dp.id_producto, dp.cantidad, dp.precio_detalle,
                 pr.nombre_prod, pr.medidas, pr.dimensiones
          FROM detalle_pedido dp
          JOIN productos pr ON dp.id_producto = pr.id_producto
          WHERE dp.id_pedido = ?
        `, [pedido.id_pedido]);
        return { ...pedido, detalles };
      })
    );

    res.json(pedidosConDetalles);
  } catch (err) {
    console.error('GET /api/pedidos', err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});



// Ruta PUT para actualizar productos (ahora permite cambiar id_producto)
app.put('/api/productos/:id', requireApiAdmin, async (req, res) => {
  const { id } = req.params;
  const { id_producto: nuevoId, nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add, visible, ruta } = req.body;

  console.log('Actualizando producto:', req.body);

  if (!nombre_prod || !precio_unidad || !tipo || !medidas || !dimensiones || !fecha_add || !ruta) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios excepto disponibilidad' });
  }

  try {
    // Si el id cambió, verificar que no esté ocupado
    if (nuevoId && nuevoId != id) {
      const [existe] = await pool.query('SELECT id_producto FROM productos WHERE id_producto = ?', [nuevoId]);
      if (existe.length > 0) {
        return res.status(400).json({ error: 'El nuevo ID ya existe, elige otro.' });
      }
    }

    const query = `
      UPDATE productos
      SET id_producto = ?, nombre_prod = ?, precio_unidad = ?, disponibilidad = ?,
          tipo = ?, medidas = ?, dimensiones = ?, fecha_add = ?, visible = ?, ruta = ?
      WHERE id_producto = ?
    `;
    const params = [nuevoId || id, nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add, visible, ruta, id];

    const [result] = await pool.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ message: 'Producto actualizado exitosamente', id: nuevoId || id });
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----- helpers: normalizar y mapear estados -----
function slugifyEstado(s = '') {
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')                      // espacios/símbolos → _
    .replace(/^_+|_+$/g, '');
}

function canonEstado(s) {
  const slug = slugifyEstado(s);
  const map = {
    // Generado / pendiente
    generado: 'generado',
    pendiente: 'generado',

    // Aceptado en espera de pago
    aceptado: 'aceptado_espera_pago',
    aceptado_espera_pago: 'aceptado_espera_pago',
    aceptado_en_espera_de_pago: 'aceptado_espera_pago',
    en_espera_de_pago: 'aceptado_espera_pago',
    espera_de_pago: 'aceptado_espera_pago',

    // Pagado en espera de envío/retiro
    pagado: 'pagado_espera_envio',
    pagado_espera_envio: 'pagado_espera_envio',
    pagado_en_espera_de_envio: 'pagado_espera_envio',
    pagado_en_espera_de_retiro: 'pagado_espera_envio',

    // Enviado / Despachado / Retirado
    enviado: 'enviado',
    despachado: 'enviado',
    envio: 'enviado',
    retirado: 'retirado',

    // Finalizado / Cerrado
    finalizado: 'finalizado',
    cerrado: 'finalizado',

    // Rechazado
    rechazado: 'rechazado',
    rechazado_por_tienda: 'rechazado'
  };
  return map[slug] || null;
}

const ALLOWED_ESTADOS = new Set([
  'generado',
  'aceptado_espera_pago',
  'pagado_espera_envio',
  'enviado',
  'retirado',
  'finalizado',
  'rechazado'
]);

// ----- RUTA: PUT /api/pedidos/:id/estado -----
app.put('/api/pedidos/:id/estado', requireApiAdmin, async (req, res) => {
  const { id } = req.params;
  const raw = (req.body && (req.body.estado ?? req.body.to)) || '';
  const estadoCanon = canonEstado(raw);

  if (!estadoCanon || !ALLOWED_ESTADOS.has(estadoCanon)) {
    return res.status(400).json({
      success: false,
      error: 'Estado inválido',
      got: raw || null,
      allowed: [...ALLOWED_ESTADOS]
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Obtener estado actual
    const [[pedido]] = await connection.query(
      'SELECT estado FROM pedidos WHERE id_pedido = ? FOR UPDATE',
      [id]
    );

    if (!pedido) {
      connection.release();
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    const estadoAnterior = pedido.estado.toLowerCase();

    // 2. Si el nuevo estado es "aceptado_espera_pago" y el anterior era "generado/pendiente", descontamos stock
    if (estadoCanon === 'aceptado_espera_pago' && (estadoAnterior === 'generado' || estadoAnterior === 'pendiente')) {
      const [detalles] = await connection.query(
        'SELECT id_producto, cantidad FROM detalle_pedido WHERE id_pedido = ?',
        [id]
      );

      for (const det of detalles) {
        await connection.query(
          'UPDATE productos SET disponibilidad = disponibilidad - ? WHERE id_producto = ?',
          [Number(det.cantidad) || 0, det.id_producto]
        );
      }
    }

    // 3. Actualizar estado
    await connection.query(
      'UPDATE pedidos SET estado = ? WHERE id_pedido = ?',
      [estadoCanon, id]
    );

    await connection.commit();
    connection.release();

    // 4. Disparar mail (fuera de la transacción para no bloquear)
    if (typeof enviarMailCambioEstado === 'function') {
      enviarMailCambioEstado(id, estadoCanon).catch(err =>
        console.error('[MAIL estado]', err)
      );
    }

    res.json({ success: true, id, estado: estadoCanon });
  } catch (e) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('PUT /api/pedidos/:id/estado error:', e);
    res.status(500).json({ success: false, error: 'Error al actualizar el estado y stock' });
  }
});


// La lógica de confirmar-mail ahora está integrada en /api/pedidos/:id/estado
// enviando el estado 'aceptado_espera_pago'

/* ============================================================
   HERRAMIENTAS ANTIABUSO (solo admin)
   ============================================================ */

// Estados en los que el stock YA se descontó de la bodega. Si un pedido en
// alguno de ellos se cancela, hay que devolver las unidades.
const ESTADOS_CON_STOCK_DESCONTADO = new Set([
  'aceptado_espera_pago', 'pagado_espera_despacho', 'enviado', 'retirado', 'finalizado'
]);

// Suspender o reactivar una cuenta.
// Body: { bloqueado: true|false, motivo?: string, cancelarPedidos?: boolean }
app.put('/api/usuarios/:id/bloqueo', requireApiAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const bloquear = Boolean(req.body?.bloqueado);
  const motivo = (req.body?.motivo || '').trim().slice(0, 255) || null;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'Id de usuario inválido' });
  }
  if (id === req.cuenta.id_usuarios) {
    return res.status(400).json({ success: false, error: 'No puedes bloquear tu propia cuenta' });
  }

  try {
    const [[objetivo]] = await pool.query(
      'SELECT id_usuarios, `user`, `role` FROM usuarios WHERE id_usuarios = ? LIMIT 1',
      [id]
    );
    if (!objetivo) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    if (objetivo.role === 'admin') {
      return res.status(400).json({ success: false, error: 'No se puede bloquear a otro administrador' });
    }

    await pool.query(
      `UPDATE usuarios
          SET bloqueado = ?,
              motivo_bloqueo = ?,
              bloqueado_at = ?
        WHERE id_usuarios = ?`,
      [bloquear ? 1 : 0, bloquear ? motivo : null, bloquear ? new Date() : null, id]
    );

    console.log('[ANTIABUSO] cuenta', bloquear ? 'bloqueada' : 'reactivada', {
      id, user: objetivo.user, por: req.cuenta.user, motivo
    });

    // Opcionalmente cancela de una vez los pedidos que dejó abiertos.
    let pedidosCancelados = 0;
    if (bloquear && req.body?.cancelarPedidos) {
      const [pendientes] = await pool.query(
        `SELECT id_pedido FROM pedidos
          WHERE id_usuario = ? AND estado NOT IN ('rechazado', 'finalizado')`,
        [id]
      );
      const resultado = await cancelarPedidos(pendientes.map(p => p.id_pedido), req.cuenta.user);
      pedidosCancelados = resultado.cancelados;
    }

    return res.json({
      success: true,
      id,
      user: objetivo.user,
      bloqueado: bloquear,
      pedidosCancelados
    });
  } catch (e) {
    console.error('PUT /api/usuarios/:id/bloqueo error:', e);
    return res.status(500).json({ success: false, error: 'No se pudo actualizar el estado de la cuenta' });
  }
});

// Cancela varios pedidos de una vez y devuelve a bodega el stock que se hubiera
// descontado. Pensado para limpiar una tanda de pedidos falsos.
async function cancelarPedidos(ids, quien) {
  const limpios = [...new Set((ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if (!limpios.length) return { cancelados: 0, stockDevuelto: 0, omitidos: [] };

  const connection = await pool.getConnection();
  let liberada = false;

  try {
    await connection.beginTransaction();

    let cancelados = 0;
    let stockDevuelto = 0;
    const omitidos = [];

    // De uno en uno y en orden ascendente, para no cruzarse con otra operación.
    for (const idPedido of limpios.sort((a, b) => a - b)) {
      const [[pedido]] = await connection.query(
        'SELECT id_pedido, estado FROM pedidos WHERE id_pedido = ? FOR UPDATE',
        [idPedido]
      );

      if (!pedido) { omitidos.push({ id: idPedido, motivo: 'no existe' }); continue; }

      const estadoActual = String(pedido.estado || '').toLowerCase();
      if (estadoActual === 'rechazado') { omitidos.push({ id: idPedido, motivo: 'ya estaba rechazado' }); continue; }

      // Solo se devuelve stock si de verdad se había descontado.
      if (ESTADOS_CON_STOCK_DESCONTADO.has(estadoActual)) {
        const [detalles] = await connection.query(
          'SELECT id_producto, cantidad FROM detalle_pedido WHERE id_pedido = ? ORDER BY id_producto',
          [idPedido]
        );
        for (const det of detalles) {
          await connection.query(
            'UPDATE productos SET disponibilidad = disponibilidad + ? WHERE id_producto = ?',
            [Number(det.cantidad) || 0, det.id_producto]
          );
          stockDevuelto += Number(det.cantidad) || 0;
        }
      }

      await connection.query('UPDATE pedidos SET estado = ? WHERE id_pedido = ?', ['rechazado', idPedido]);
      cancelados += 1;
    }

    await connection.commit();
    connection.release();
    liberada = true;

    console.log('[ANTIABUSO] pedidos cancelados', { cancelados, stockDevuelto, por: quien });
    return { cancelados, stockDevuelto, omitidos };
  } catch (e) {
    if (!liberada) {
      try { await connection.rollback(); } catch (_) {}
      connection.release();
    }
    throw e;
  }
}

// Historial de intentos de registro.
// Query: ?resultado=todos|creado|rechazado  &q=texto  &limite=100
app.get('/api/registros', requireApiAdmin, async (req, res) => {
  const resultado = String(req.query.resultado || 'todos').toLowerCase();
  const q = (req.query.q || '').trim();
  const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 500);

  const condiciones = [];
  const params = [];

  if (resultado === 'creado' || resultado === 'rechazado') {
    condiciones.push('r.resultado = ?');
    params.push(resultado);
  }

  // Búsqueda libre por usuario, correo o IP: sirve para seguirle la pista a
  // una IP concreta y ver todas las cuentas que intentó crear.
  if (q) {
    condiciones.push('(r.usuario LIKE ? OR r.email LIKE ? OR r.ip LIKE ?)');
    const patron = `%${q}%`;
    params.push(patron, patron, patron);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  try {
    // El LEFT JOIN dice si la cuenta sigue existiendo y si ya está bloqueada,
    // para poder banear directamente desde esta misma vista.
    const [filas] = await pool.query(
      `SELECT r.id, r.fecha, r.usuario, r.email, r.telefono, r.ip,
              r.user_agent, r.resultado, r.motivo,
              u.id_usuarios, u.bloqueado, u.role
         FROM registros_auditoria r
         LEFT JOIN usuarios u ON u.id_usuarios = r.id_usuario
         ${where}
        ORDER BY r.fecha DESC, r.id DESC
        LIMIT ?`,
      [...params, limite]
    );

    // Cuántos intentos acumula cada IP en las últimas 24 h: delata al que rota
    // correos desde una misma conexión.
    const [porIp] = await pool.query(
      `SELECT ip, COUNT(*) AS intentos
         FROM registros_auditoria
        WHERE fecha >= DATE_SUB(NOW(), INTERVAL 1 DAY) AND ip IS NOT NULL
        GROUP BY ip
       HAVING intentos > 1
        ORDER BY intentos DESC
        LIMIT 10`
    );

    const [[{ totalGlobal }]] = await pool.query(
      'SELECT COUNT(*) AS totalGlobal FROM registros_auditoria'
    );

    return res.json({ success: true, registros: filas, ipsFrecuentes: porIp, totalGlobal });
  } catch (e) {
    console.error('GET /api/registros error:', e);
    return res.status(500).json({ success: false, error: 'No se pudo cargar el historial de registros' });
  }
});

// Body: { ids: [1,2,3] }
app.post('/api/pedidos/cancelar-lote', requireApiAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

  if (!ids.length) {
    return res.status(400).json({ success: false, error: 'No indicaste ningún pedido' });
  }
  if (ids.length > 200) {
    return res.status(400).json({ success: false, error: 'Máximo 200 pedidos por operación' });
  }

  try {
    const resultado = await cancelarPedidos(ids, req.cuenta.user);
    return res.json({ success: true, ...resultado });
  } catch (e) {
    console.error('POST /api/pedidos/cancelar-lote error:', e);
    return res.status(500).json({ success: false, error: 'No se pudieron cancelar los pedidos' });
  }
});

// Obtener todos los trabajadores
app.get('/api/trabajadores', verifyToken, authorization.soloAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM trabajadores ORDER BY id_trabajador DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener trabajadores:', err);
    res.status(500).json({ error: err.message });
  }
});

// Obtener un trabajador específico
app.get('/api/trabajadores/:id', verifyToken, authorization.soloAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const [rows] = await pool.query('SELECT * FROM trabajadores WHERE id_trabajador = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Trabajador no encontrado' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al obtener trabajador:', err);
    res.status(500).json({ error: err.message });
  }
});

// Crear nuevo trabajador
app.post('/api/trabajadores', verifyToken, authorization.soloAdmin, async (req, res) => {
  const { rut, nombres, apellidos, fechaIngreso, sueldo, fono, estado } = req.body;

  console.log('Creando nuevo trabajador:', req.body);

  if (!rut || !nombres || !apellidos || !fechaIngreso || !sueldo || !fono || !estado) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const query = `
      INSERT INTO trabajadores 
      (rut, nombres, apellidos, fechaIngreso, sueldo, fono, estado) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [rut, nombres, apellidos, fechaIngreso, sueldo, fono, estado];
    const [result] = await pool.query(query, params);
    res.status(201).json({ 
      message: 'Trabajador creado exitosamente', 
      id_trabajador: result.insertId 
    });
  } catch (err) {
    console.error('Error al crear trabajador:', err);
    res.status(500).json({ error: err.message });
  }
});

// Actualizar trabajador
app.put('/api/trabajadores/:id', verifyToken, authorization.soloAdmin, async (req, res) => {
  const { id } = req.params;
  const { rut, nombres, apellidos, fechaIngreso, sueldo, fono, estado } = req.body;

  console.log('Actualizando trabajador:', req.body);

  if (!rut || !nombres || !apellidos || !fechaIngreso || !sueldo || !fono || !estado) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const query = `
      UPDATE trabajadores 
      SET rut = ?, 
          nombres = ?, 
          apellidos = ?, 
          fechaIngreso = ?, 
          sueldo = ?, 
          fono = ?, 
          estado = ?
      WHERE id_trabajador = ?
    `;
    const params = [rut, nombres, apellidos, fechaIngreso, sueldo, fono, estado, id];
    
    const [result] = await pool.query(query, params);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Trabajador no encontrado' });
    }
    
    res.json({ message: 'Trabajador actualizado exitosamente' });
  } catch (err) {
    console.error('Error al actualizar trabajador:', err);
    res.status(500).json({ error: err.message });
  }
});

// Eliminar trabajador
app.delete('/api/trabajadores/:id', verifyToken, authorization.soloAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM trabajadores WHERE id_trabajador = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Trabajador no encontrado' });
    }
    
    res.json({ message: 'Trabajador eliminado exitosamente' });
  } catch (err) {
    console.error('Error al eliminar trabajador:', err);
    res.status(500).json({ error: err.message });
  }
});
// ==============================================
// ENDPOINTS PARA ADELANTOS
// ==============================================

// Obtener todos los adelantos

app.get('/api/adelantos', verifyToken, authorization.soloAdmin, async (req, res) => {
  try {
    const { trabajador, mes, año, page = 1, limit = 50 } = req.query;

    let query = `
      SELECT a.*, t.nombres, t.apellidos, t.rut, t.sueldo 
      FROM adelantos a
      JOIN trabajadores t ON a.id_trabajador = t.id_trabajador
      WHERE 1=1
    `;
    const params = [];

    if (trabajador && !isNaN(trabajador)) {
      query += ' AND a.id_trabajador = ?';
      params.push(parseInt(trabajador));
    }

    if (mes && !isNaN(mes) && año && !isNaN(año)) {
      query += ' AND MONTH(a.fecha) = ? AND YEAR(a.fecha) = ?';
      params.push(parseInt(mes), parseInt(año));
    } else if (año && !isNaN(año)) {
      query += ' AND YEAR(a.fecha) = ?';
      params.push(parseInt(año));
    }

    query += ' ORDER BY a.fecha DESC, a.id_adelanto DESC';

    // Obtener total antes de aplicar paginación
    const [totalRows] = await pool.query(query, params);
    const total = totalRows.length;

    // Aplicar paginación
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [pagedRows] = await pool.query(query, params);

    // Formatear fechas
    const formattedRows = pagedRows.map(row => ({
      ...row,
      fecha: new Date(row.fecha).toISOString().split('T')[0]
    }));

    res.json({
      adelantos: formattedRows,
      total
    });
  } catch (err) {
    console.error('Error al obtener adelantos:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// Obtener un adelanto específico
app.get('/api/adelantos/:id', verifyToken, authorization.soloAdmin, async (req, res) => {
const { id } = req.params;

try {
  const query = `
    SELECT a.*, t.nombres, t.apellidos 
    FROM adelantos a
    JOIN trabajadores t ON a.id_trabajador = t.id_trabajador
    WHERE a.id_adelanto = ?
  `;
  const [rows] = await pool.query(query, [id]);
  
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Adelanto no encontrado' });
  }
  
  res.json(rows[0]);
} catch (err) {
  console.error('Error al obtener adelanto:', err);
  res.status(500).json({ error: err.message });
}
});

// Crear nuevo adelanto
app.post('/api/adelantos', verifyToken, authorization.soloAdmin, async (req, res) => {
const { id_trabajador, bono, motivos, monto, fecha } = req.body;

console.log('Creando nuevo adelanto:', req.body);

if (!id_trabajador || monto === undefined || !fecha) {
  return res.status(400).json({ error: 'ID trabajador, monto y fecha son obligatorios' });
}

try {
  // Verificar que el trabajador existe
  const [trabajador] = await pool.query('SELECT * FROM trabajadores WHERE id_trabajador = ?', [id_trabajador]);
  if (trabajador.length === 0) {
    return res.status(400).json({ error: 'Trabajador no encontrado' });
  }

  const query = `
    INSERT INTO adelantos 
    (id_trabajador, bono, motivos, monto, fecha) 
    VALUES (?, ?, ?, ?, ?)
  `;
  const params = [
    id_trabajador, 
    bono , 
    motivos || '', 
    monto, 
    fecha
  ];
  
  const [result] = await pool.query(query, params);
  
  // Obtener el adelanto recién creado con datos del trabajador
  const [newAdelanto] = await pool.query(`
    SELECT a.*, t.nombres, t.apellidos 
    FROM adelantos a
    JOIN trabajadores t ON a.id_trabajador = t.id_trabajador
    WHERE a.id_adelanto = ?
  `, [result.insertId]);
  
  res.status(201).json(newAdelanto[0]);
} catch (err) {
  console.error('Error al crear adelanto:', err);
  res.status(500).json({ error: err.message });
}
});

// Actualizar adelanto
app.put('/api/adelantos/:id', verifyToken, authorization.soloAdmin, async (req, res) => {
const { id } = req.params;
const { id_trabajador, bono, motivos, monto, fecha } = req.body;

console.log('Actualizando adelanto:', req.body);

if (!id_trabajador || monto === undefined || !fecha) {
  return res.status(400).json({ error: 'ID trabajador, monto y fecha son obligatorios' });
}

try {
  // Verificar que el adelanto existe
  const [adelanto] = await pool.query('SELECT * FROM adelantos WHERE id_adelanto = ?', [id]);
  if (adelanto.length === 0) {
    return res.status(404).json({ error: 'Adelanto no encontrado' });
  }

  // Verificar que el trabajador existe
  const [trabajador] = await pool.query('SELECT * FROM trabajadores WHERE id_trabajador = ?', [id_trabajador]);
  if (trabajador.length === 0) {
    return res.status(400).json({ error: 'Trabajador no encontrado' });
  }

  const query = `
    UPDATE adelantos 
    SET id_trabajador = ?, 
        bono = ?, 
        motivos = ?, 
        monto = ?, 
        fecha = ?
    WHERE id_adelanto = ?
  `;
  const params = [
    id_trabajador, 
    bono, 
    motivos || '', 
    monto, 
    fecha, 
    id
  ];
  
  const [result] = await pool.query(query, params);
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Adelanto no encontrado' });
  }
  
  // Obtener el adelanto actualizado con datos del trabajador
  const [updatedAdelanto] = await pool.query(`
    SELECT a.*, t.nombres, t.apellidos 
    FROM adelantos a
    JOIN trabajadores t ON a.id_trabajador = t.id_trabajador
    WHERE a.id_adelanto = ?
  `, [id]);
  
  res.json(updatedAdelanto[0]);
} catch (err) {
  console.error('Error al actualizar adelanto:', err);
  res.status(500).json({ error: err.message });
}
});

// Eliminar adelanto
app.delete('/api/adelantos/:id', verifyToken, authorization.soloAdmin, async (req, res) => {
const { id } = req.params;

try {
  // Verificar que el adelanto existe
  const [adelanto] = await pool.query('SELECT * FROM adelantos WHERE id_adelanto = ?', [id]);
  if (adelanto.length === 0) {
    return res.status(404).json({ error: 'Adelanto no encontrado' });
  }

  const [result] = await pool.query('DELETE FROM adelantos WHERE id_adelanto = ?', [id]);
  
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Adelanto no encontrado' });
  }
  
  res.json({ message: 'Adelanto eliminado exitosamente' });
} catch (err) {
  console.error('Error al eliminar adelanto:', err);
  res.status(500).json({ error: err.message });
}

});

app.get('/api/mis-pedidos', requireApiAuth, async (req, res) => {
  try {
    // La identidad sale de la cookie, no del ?user= de la URL: antes bastaba
    // con saber el nombre de alguien para leer todos sus pedidos.
    // Un admin sí puede consultar los de otra persona pasando ?user=.
    let userId = req.cuenta.id_usuarios;

    const solicitado = (req.query.user || '').trim();
    if (solicitado && solicitado !== req.cuenta.user) {
      if (req.cuenta.role !== 'admin') {
        console.warn('[MIS-PEDIDOS] intento de leer pedidos ajenos', {
          quien: req.cuenta.user, pedido: solicitado, ip: req.ip
        });
        return res.status(403).json({ error: 'No autorizado' });
      }
      const [users] = await pool.query(
        'SELECT id_usuarios FROM usuarios WHERE `user` = ? LIMIT 1',
        [solicitado]
      );
      if (!users.length) return res.status(404).json({ error: 'Usuario no encontrado' });
      userId = users[0].id_usuarios;
    }

    const [pedidos] = await pool.query(`
      SELECT p.id_pedido, p.precio_total, p.fecha_pedido, p.estado, p.delivery, p.descripcion
      FROM pedidos p
      WHERE p.id_usuario = ?
      ORDER BY p.fecha_pedido DESC
    `, [userId]);

    const pedidosConDetalles = await Promise.all(
      pedidos.map(async (pedido) => {
        const [detalles] = await pool.query(`
          SELECT dp.cantidad, dp.precio_detalle, pr.nombre_prod
          FROM detalle_pedido dp
          JOIN productos pr ON dp.id_producto = pr.id_producto
          WHERE dp.id_pedido = ?
        `, [pedido.id_pedido]);

        return {
          ...pedido,
          detalles
        };
      })
    );

    res.json(pedidosConDetalles);
  } catch (err) {
    console.error('Error al obtener pedidos del usuario:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});
// Verificación del enlace
app.get('/verify', async (req, res) => {
  try {
    const uid   = Number(req.query.uid || 0);
    const token = req.query.token || '';
    if (!uid || !token) return res.status(400).send('Solicitud inválida');

    const tokenHash = sha256(token);
    const [rows] = await pool.query(
      'SELECT email_verif_expires FROM usuarios WHERE id_usuarios=? AND email_verif_token=? LIMIT 1',
      [uid, tokenHash]
    );

    if (!rows.length) return res.status(400).send('Token inválido');
    if (new Date(rows[0].email_verif_expires) < new Date()) {
      return res.status(410).send('Token expirado. Solicita reenvío.');
    }

    await pool.query(
      `UPDATE usuarios
          SET email_verificado_at=NOW(),
              email_verif_token=NULL,
              email_verif_expires=NULL
        WHERE id_usuarios=?`,
      [uid]
    );

    return res.redirect('/login?verified=1');
  } catch (e) {
    console.error('[VERIFY] Error:', e);
    return res.status(500).send('Error del servidor');
  }
});

// logger simple con hora
app.use((req, res, next) => {
  const started = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);

  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log(`[${new Date().toISOString()}] ${res.statusCode} ${req.method} ${req.originalUrl} (${ms}ms)`);
  });

  next();
});