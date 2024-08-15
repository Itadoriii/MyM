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

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SERVIDOR 
const app = express();
const port = 3000;
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

// CONFIGURACION
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src')));
app.use(cookieParser());
app.use(session({ secret: 'your_secret_key', resave: false, saveUninitialized: true }));
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

app.get('/productos', async (req, res) => {
  const searchQuery = req.query.q; 

  try {
    let query = 'SELECT * FROM productos';
    const params = [];

    if (searchQuery) {
      query += ` WHERE nombre_prod LIKE ? OR tipo LIKE ? OR medidas LIKE ? OR dimensiones LIKE ? OR precio_unidad LIKE ?`;
      const likeQuery = `%${searchQuery}%`;
      params.push(likeQuery, likeQuery, likeQuery, likeQuery, likeQuery);
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    google_id: req.user.google_id
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
  const cart = req.body;
  const connection = await pool.getConnection();

  try {
      const userData = await revisarCookie(req);
      if (!userData) {
          return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
      }

      await connection.beginTransaction();

      // Obtener el id_usuarios del usuario autenticado
      const [userResult] = await connection.query(
          'SELECT id_usuarios FROM usuarios WHERE user = ?',
          [userData.user]
      );
      
      if (userResult.length === 0) {
          throw new Error('Usuario no encontrado');
      }
      
      const userId = userResult[0].id_usuarios;

      console.log('Intentando insertar pedido para usuario ID:', userId);

      // Calcular el precio total del carrito
      const precioTotal = cart.reduce((total, item) => total + item.precio * item.quantity, 0);

      // Insertar en la tabla pedidos
      const [pedidoResult] = await connection.query(
          'INSERT INTO pedidos (id_usuario, precio_total, fecha_pedido) VALUES (?, ?, NOW())',
          [userId, precioTotal]
      );

      const idPedido = pedidoResult.insertId;

      // Insertar detalles del pedido
      for (const item of cart) {
          await connection.query(
              'INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_detalle) VALUES (?, ?, ?, ?)',
              [idPedido, item.id_producto, item.quantity, item.precio]
          );

          // Actualizar el stock del producto
          await connection.query(
              'UPDATE productos SET disponibilidad = disponibilidad - ? WHERE id_producto = ?',
              [item.quantity, item.id_producto]
          );
      }

      await connection.commit();
      res.json({ success: true, id_pedido: idPedido });
  } catch (error) {
      await connection.rollback();
      console.error('Error al generar el pedido:', error);
      res.status(500).json({ success: false, error: 'Error al generar el pedido: ' + error.message });
  } finally {
      connection.release();
  }
});

app.get('/api/pedidos', async (req, res) => {
  try {
      const [pedidos] = await pool.query(`
          SELECT p.id_pedido, p.id_usuario, p.precio_total, p.fecha_pedido,
                 u.user, u.email
          FROM pedidos p
          JOIN usuarios u ON p.id_usuario = u.id_usuarios
          ORDER BY p.fecha_pedido DESC
      `);

      const pedidosConDetalles = await Promise.all(pedidos.map(async (pedido) => {
          const [detalles] = await pool.query(`
              SELECT dp.id_producto, dp.cantidad, dp.precio_detalle,
                     pr.nombre_prod
              FROM detalle_pedido dp
              JOIN productos pr ON dp.id_producto = pr.id_producto
              WHERE dp.id_pedido = ?
          `, [pedido.id_pedido]);

          return {
              ...pedido,
              detalles
          };
      }));

      res.json(pedidosConDetalles);
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