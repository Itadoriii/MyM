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
import { enviarConfirmacion } from './controllers/pedidos.controller.js';
import cors from 'cors';
import mailRouter from './routes/pedidosMail.js';
import nodemailer from 'nodemailer';






dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SERVIDOR 
const app = express();
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor corriendo en puerto ${port}`);
});
 

// CONFIGURACION
app.use(cors());
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
// RUTAS 

app.get('/', authorization.soloPublico, (req, res) => {
  res.send('Hello World!');
});

app.get('/login', isAuthenticated, (req, res) => { // Aplica el middleware aquí
  res.sendFile(__dirname + '/src/login.html');
});

app.get('/register', authorization.soloPublico, (req, res) => {
  res.sendFile(__dirname + '/src/register.html');
});

app.post('/api/register', metodos.register);
app.post('/api/login', metodos.login);

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    const token = jsonwebtoken.sign({ user: req.user.user, role: req.user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.cookie('jwt', token, { httpOnly: true, secure: false }); // Asegúrate de que `secure` esté en false para pruebas locales
    res.redirect('/profile');
  });

app.get('/admin', verifyToken, authorization.soloAdmin, (req, res) => {
  res.sendFile(__dirname + '/src/admin.html');
});

app.get('/profile', verifyToken, (req, res) => {
  res.sendFile(__dirname + '/src/profile.html');
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

app.get('/api/usuarios', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM usuarios');
    console.log('Número de usuarios encontrados:', rows.length);
    console.log('Usuarios:', rows);
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: err.message });
  }
});
app.get('/checkout', (req, res) => {
  res.sendFile(__dirname + '/src/checkout.html'); // Asegúrate de ajustar la ruta correctamente
});


// Actualizar la ruta POST para crear productos
app.post('/api/productos', async (req, res) => {
    const { nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add } = req.body;

    console.log('Creando nuevo producto:', req.body);

    if (!nombre_prod || !precio_unidad || !tipo || !medidas || !dimensiones || !fecha_add) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios excepto disponibilidad' });
    }

    try {
      const query = 'INSERT INTO productos (nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add) VALUES (?, ?, ?, ?, ?, ?, ?)';
      const params = [nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add];
      const [result] = await pool.query(query, params);
      res.status(201).json({ message: 'Producto creado exitosamente', id: result.insertId });
    } catch (err) {
      console.error('Error al crear producto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/generar-pedido', async (req, res) => {
    const { cart: bodyCart = [], delivery = null, comentarios = '' } = req.body || {};
    const cart = Array.isArray(bodyCart) ? bodyCart : [];
    if (!cart.length) return res.status(400).json({ success:false, error:'Carrito vacío' });

    // hasta 3 reintentos si hay deadlock
    const MAX_RETRY = 3;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      const connection = await pool.getConnection();
      try {
        const user = await revisarCookie(req);
        if (!user) { connection.release(); return res.status(401).json({ success:false, error:'Usuario no autenticado' }); }

        await connection.beginTransaction();

        const [[u]] = await connection.query('SELECT id_usuarios FROM usuarios WHERE user = ?', [user.user]);
        if (!u) throw new Error('Usuario no encontrado');

        // Ordena ids para bloquear SIEMPRE en el mismo orden
        const ids = [...new Set(cart.map(i => Number(i.id_producto)))].sort((a,b)=>a-b);

        // Bloquea filas de productos en orden
        const [rows] = await connection.query(
          `SELECT id_producto, disponibilidad
            FROM productos
            WHERE id_producto IN (?)
            FOR UPDATE`,
          [ids]
        );

        // Mapa de disponibilidades
        const stockMap = new Map(rows.map(r => [Number(r.id_producto), Number(r.disponibilidad) || 0]));

        // Verifica stock
        for (const item of cart) {
          const need = Number(item.quantity)||0;
          const have = stockMap.get(Number(item.id_producto)) ?? 0;
          if (have < need) throw new Error(`Stock insuficiente para producto ${item.id_producto}`);
        }

        // Precio total
        const precioTotal = cart.reduce((t,i)=> t + (Number(i.precio)||0)*(Number(i.quantity)||0), 0);

        // Inserta pedido (ajusta columnas si tienes más)
        const [pedidoResult] = await connection.query(
          'INSERT INTO pedidos (id_usuario, precio_total, fecha_pedido, estado) VALUES (?, ?, NOW(), ?)',
          [u.id_usuarios, precioTotal, 'pendiente']
        );
        const idPedido = pedidoResult.insertId;

        // Inserta detalle y descuenta stock en el MISMO orden
        for (const pid of ids) {
          const itemsDeEste = cart.filter(i => Number(i.id_producto) === pid);
          for (const it of itemsDeEste) {
            await connection.query(
              'INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_detalle) VALUES (?, ?, ?, ?)',
              [idPedido, pid, Number(it.quantity)||0, Number(it.precio)||0]
            );
            await connection.query(
              'UPDATE productos SET disponibilidad = disponibilidad - ? WHERE id_producto = ?',
              [Number(it.quantity)||0, pid]
            );
          }
        }

        await connection.commit();
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
      `SELECT pr.nombre_prod AS nombre,
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
            <td style="padding:8px;border:1px solid #eee;">${d.nombre}</td>
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
      const deliveryTxt = delivery === 'retiro' ? 'Retiro en tienda' : 'Envío a domicilio';
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
      await connection.rollback(); connection.release();
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

app.get('/api/pedidos', async (req, res) => {
  try {
    // Consulta para obtener los pedidos con la información del usuario y los nuevos campos
    const [pedidos] = await pool.query(`
      SELECT 
        p.id_pedido, 
        p.id_usuario, 
        p.precio_total, 
        p.fecha_pedido, 
        p.estado,
        p.delivery,
        p.descripcion,
        u.user AS user, 
        u.email, 
        u.number
      FROM pedidos p
      JOIN usuarios u ON p.id_usuario = u.id_usuarios
      ORDER BY p.fecha_pedido DESC
    `);

    // Para cada pedido, obtener sus detalles (productos, cantidades, etc.)
    const pedidosConDetalles = await Promise.all(
      pedidos.map(async (pedido) => {
        const [detalles] = await pool.query(`
          SELECT 
            dp.id_producto, 
            dp.cantidad, 
            dp.precio_detalle, 
            pr.nombre_prod
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

    res.json(pedidosConDetalles); // Enviar los pedidos con todos los datos
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});


// Ruta PUT para actualizar productos
app.put('/api/productos/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add } = req.body;

  console.log('Actualizando producto:', req.body);

  if (!nombre_prod || !precio_unidad || !tipo || !medidas || !dimensiones || !fecha_add) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios excepto disponibilidad' });
  }

  try {
    const query = `
      UPDATE productos 
      SET nombre_prod = ?, 
          precio_unidad = ?, 
          disponibilidad = ?, 
          tipo = ?, 
          medidas = ?, 
          dimensiones = ?, 
          fecha_add = ?
      WHERE id_producto = ?
    `;
    const params = [nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add, id];
    
    const [result] = await pool.query(query, params);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    res.json({ message: 'Producto actualizado exitosamente' });
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: err.message });
  }
});

// Ruta para aceptar un pedido
/*app.put('/api/pedidos/:id/aceptar', async (req, res) => {
  const { id } = req.params;
  try {
      const [result] = await pool.query(
          'UPDATE pedidos SET estado = "aceptado" WHERE id_pedido = ?',
          [id]
      );

      if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Pedido no encontrado' });
      }

      res.json({ message: 'Pedido aceptado exitosamente' });
  } catch (error) {
      console.error('Error al aceptar el pedido:', error);
      res.status(500).json({ error: 'Error al aceptar el pedido' });
  }
});*/

// Ruta para rechazar un pedido
app.put('/api/pedidos/:id/rechazar', async (req, res) => {
  const { id } = req.params;
  try {
      const [result] = await pool.query(
          'UPDATE pedidos SET estado = "rechazado" WHERE id_pedido = ?',
          [id]
      );

      if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Pedido no encontrado' });
      }

      res.json({ message: 'Pedido rechazado exitosamente' });
  } catch (error) {
      console.error('Error al rechazar el pedido:', error);
      res.status(500).json({ error: 'Error al rechazar el pedido' });
  }
});


app.put(
  '/api/pedidos/:id/confirmar-mail',
  enviarConfirmacion
);

app.put(
  '/api/pedidos/:id/aceptar',
  enviarConfirmacion
);

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

app.get('/api/mis-pedidos', async (req, res) => {
  try {
    const username = req.query.user;
    if (!username) return res.status(400).json({ error: 'Falta nombre de usuario' });

    // Buscar el id del usuario por username
    const [users] = await pool.query(
      'SELECT id_usuarios FROM usuarios WHERE user = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userId = users[0].id_usuarios;

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
