import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import session from 'express-session';
import { methods as metodos } from './controllers/authentication.controller.js';
import { methods as authorization } from './middlewares/authorization.js';
import './middlewares/passport-setup.js'; // Importa la configuración de passport
import pool from './db.js';

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

// RUTAS 
app.get('/', authorization.soloPublico, (req, res) => {
  res.send('Hello World!');
});

app.get('/login', (req, res) => {
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
    res.redirect('/admin');
  });

app.get('/admin', authorization.soloAdmin, (req, res) => {
  res.sendFile(__dirname + '/src/admin.html');
});

app.get('/profile', (req, res) => {
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





app.get('/api/usuarios', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM clientes'); // Asegúrate de que la tabla 'usuarios' existe y contiene datos.
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
);
// Nueva ruta POST para crear productos
app.post('/api/productos', async (req, res) => {
  const { nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add } = req.body;

  console.log(req.body); // Verifica que los datos están llegando correctamente

  if (!nombre_prod || !precio_unidad || !disponibilidad || !tipo || !medidas || !dimensiones || !fecha_add) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const query = 'INSERT INTO productos (nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add) VALUES (?, ?, ?, ?, ?, ?, ?)';
    const params = [nombre_prod, precio_unidad, disponibilidad, tipo, medidas, dimensiones, fecha_add];
    await pool.query(query, params);
    res.status(201).json({ message: 'Producto creado exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
