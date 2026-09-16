// reset_admin_password.js
//
// Utilidad de consola para restablecer la contraseña de una cuenta.
//
// ANTES este archivo traía el usuario y la contraseña escritos en el código
// (`admin` / `Admin123!`) y estaba versionado en GitHub, así que cualquiera con
// acceso al repositorio conocía la contraseña del administrador. Ahora hay que
// pasarlos por parámetro y, si no se indica contraseña, se genera una aleatoria.
//
// Uso:
//   node reset_admin_password.js <usuario>
//   node reset_admin_password.js <usuario> "<nueva contraseña>"
//
// No se ejecuta solo: hay que invocarlo a propósito en el servidor.

import crypto from 'crypto';
import pool from './db.js';
import bcrypt from 'bcrypt';

const [, , usuario, passwordArg] = process.argv;

if (!usuario) {
  console.error('Uso: node reset_admin_password.js <usuario> ["<nueva contraseña>"]');
  process.exit(1);
}

const nuevaPassword = passwordArg || crypto.randomBytes(12).toString('base64url');

if (nuevaPassword.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

async function reset() {
  try {
    console.log(`Buscando usuario: ${usuario}...`);
    const [rows] = await pool.query('SELECT id_usuarios FROM usuarios WHERE user = ?', [usuario]);

    if (rows.length === 0) {
      console.error(`ERROR: Usuario '${usuario}' no encontrado.`);
      process.exit(1);
    }

    const userId = rows[0].id_usuarios;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(nuevaPassword, salt);

    await pool.query('UPDATE usuarios SET password = ? WHERE id_usuarios = ?', [hash, userId]);

    console.log('--------------------------------------------------');
    console.log(`Contraseña restablecida para '${usuario}'.`);
    console.log(`Nueva contraseña: ${nuevaPassword}`);
    console.log('Cámbiala al iniciar sesión y no la compartas.');
    console.log('--------------------------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('ERROR INESPERADO:', err?.message || err);
    process.exit(1);
  }
}

reset();
