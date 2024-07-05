import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { methods as metodos } from './controllers/authentication.controller.js';
import { methods as authorization } from './middlewares/authorization.js';
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

// RUTAS 
app.get('/', authorization.soloPublico, (req, res) => {
  res.send('Hello World!');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname  + '/src/login.html');
});

app.get('/register', authorization.soloPublico, (req, res) => {
  res.sendFile(__dirname  + '/src/register.html');
});

app.post('/api/register', metodos.register);
app.post('/api/login', metodos.login);
app.get('/admin', authorization.soloAdmin, (req, res) => {
  res.sendFile(__dirname + '/src/admin.html');
});

app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/src/admin.html');
});

// app.js o el archivo principal de tu servidor Express
app.get('/productos', async (req, res) => {
  const searchQuery = req.query.q; // Obtiene el parámetro de búsqueda de la consulta

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

app.get('/api/usuarios', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM clientes'); // Asegúrate de que la tabla 'usuarios' existe y contiene datos.
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
