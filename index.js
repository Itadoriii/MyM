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
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor corriendo en puerto ${port}`);
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
  const cart = req.body;  // Array de objetos con productos del carrito
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

      console.log(`Pedido insertado con ID: ${idPedido}`);

      // Insertar detalles del pedido
      for (const item of cart) {
          // Verificar disponibilidad del producto
          const [productResult] = await connection.query(
              'SELECT disponibilidad FROM productos WHERE id_producto = ?',
              [item.id_producto]
          );

          if (productResult.length === 0) {
              throw new Error(`Producto con id ${item.id_producto} no encontrado`);
          }

          if (productResult[0].disponibilidad < item.quantity) {
              throw new Error(`No hay suficiente disponibilidad para el producto con id ${item.id_producto}`);
          }

          // Insertar el detalle del pedido
          await connection.query(
              'INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_detalle) VALUES (?, ?, ?, ?)',
              [idPedido, item.id_producto, item.quantity, item.precio]
          );

          console.log(`Detalle del pedido insertado, para el producto: ${item.id_producto}`);

          // Actualizar el stock del producto
          await connection.query(
              'UPDATE productos SET disponibilidad = disponibilidad - ? WHERE id_producto = ?',
              [item.quantity, item.id_producto]
          );

          console.log(`Stock actualizado para el producto con ID: ${item.id_producto}`);
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
    // Consulta para obtener los pedidos con la información del usuario asociado
    const [pedidos] = await pool.query(`
      SELECT p.id_pedido, p.id_usuario, p.precio_total, p.fecha_pedido,p.estado,
             u.user AS user, u.email
      FROM pedidos p
      JOIN usuarios u ON p.id_usuario = u.id_usuarios
      ORDER BY p.fecha_pedido DESC
    `);

    // Para cada pedido, obtener sus detalles (productos, cantidades, etc.)
    const pedidosConDetalles = await Promise.all(
      pedidos.map(async (pedido) => {
        const [detalles] = await pool.query(`
          SELECT dp.id_producto, dp.cantidad, dp.precio_detalle, pr.nombre_prod
          FROM detalle_pedido dp
          JOIN productos pr ON dp.id_producto = pr.id_producto
          WHERE dp.id_pedido = ?
        `, [pedido.id_pedido]);

        // Agregar los detalles al pedido
        return {
          ...pedido,
          detalles
        };
      })
    );

    res.json(pedidosConDetalles); // Enviar los pedidos con los detalles al cliente
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
app.put('/api/pedidos/:id/aceptar', async (req, res) => {
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
});

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
  const { rut, nombres, apellidos, fecha_ingreso, sueldo, fono, estado } = req.body;

  console.log('Creando nuevo trabajador:', req.body);

  if (!rut || !nombres || !apellidos || !fecha_ingreso || !sueldo || !fono || !estado) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const query = `
      INSERT INTO trabajadores 
      (rut, nombres, apellidos, fechaIngreso, sueldo, fono, estado) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [rut, nombres, apellidos, fecha_ingreso, sueldo, fono, estado];
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
  const { rut, nombres, apellidos, fecha_ingreso, sueldo, fono, estado } = req.body;

  console.log('Actualizando trabajador:', req.body);

  if (!rut || !nombres || !apellidos || !fecha_ingreso || !sueldo || !fono || !estado) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const query = `
      UPDATE trabajadores 
      SET rut = ?, 
          nombres = ?, 
          apellidos = ?, 
          fecha_ingreso = ?, 
          sueldo = ?, 
          fono = ?, 
          estado = ?
      WHERE id_trabajador = ?
    `;
    const params = [rut, nombres, apellidos, fecha_ingreso, sueldo, fono, estado, id];
    
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
    bono ? 1 : 0, 
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
    bono ? 1 : 0, 
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

