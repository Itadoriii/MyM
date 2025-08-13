// db.js
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: '207.210.102.100',
  port: 3306,   // Cambia esto a la dirección de tu servidor MySQL
  user: 'sebasti9_sebasti9',       // Cambia esto a tu usuario de MySQL
  password: 'oa4P6]Y9!5FkYw', // Cambia esto a tu contraseña de MySQL
  database: 'sebasti9_mym2', // Cambia esto al nombre de tu base de datos
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;