// db.js
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',  // Cambia esto a la dirección de tu servidor MySQL
  user: 'root',       // Cambia esto a tu usuario de MySQL
  password: '1312', // Cambia esto a tu contraseña de MySQL
  database: 'mym', // Cambia esto al nombre de tu base de datos
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;
