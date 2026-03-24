import pool from './db.js';
import bcrypt from 'bcrypt';

const resetUser = 'admin'; // Cambia esto al nombre de usuario que necesites
const newPass = 'Admin123!'; // La nueva contraseña temporal

async function reset() {
  try {
    console.log(`Buscando usuario: ${resetUser}...`);
    const [rows] = await pool.query('SELECT id_usuarios FROM usuarios WHERE user = ?', [resetUser]);
    
    if (rows.length === 0) {
      console.error(`ERROR: Usuario '${resetUser}' no encontrado.`);
      process.exit(1);
    }

    const userId = rows[0].id_usuarios;
    console.log(`Generando hash para la nueva contraseña...`);
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPass, salt);

    console.log(`Actualizando contraseña en la base de datos...`);
    await pool.query('UPDATE usuarios SET password = ? WHERE id_usuarios = ?', [hash, userId]);

    console.log('--------------------------------------------------');
    console.log(`ÉXITO: La contraseña del usuario '${resetUser}' ha sido restablecida.`);
    console.log(`Usuario: ${resetUser}`);
    console.log(`Nueva Contraseña: ${newPass}`);
    console.log('--------------------------------------------------');
    console.log('Ahora puedes iniciar sesión y usar el panel de administración.');
    
    process.exit(0);
  } catch (err) {
    console.error('ERROR INESPERADO:', err);
    process.exit(1);
  }
}

reset();
