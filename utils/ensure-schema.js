// utils/ensure-schema.js
import pool from '../db.js';

// Columnas que necesita el flujo de "olvidé mi contraseña".
const RESET_COLUMNS = [
  { name: 'reset_token',   ddl: 'ADD COLUMN `reset_token` CHAR(64) DEFAULT NULL' },
  { name: 'reset_expires', ddl: 'ADD COLUMN `reset_expires` DATETIME DEFAULT NULL' }
];

// Se ejecuta al arrancar: si las columnas ya existen no hace nada.
export async function ensurePasswordResetColumns() {
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'usuarios'
          AND COLUMN_NAME IN ('reset_token','reset_expires')`
    );

    const existentes = new Set(rows.map(r => r.COLUMN_NAME));
    const faltantes  = RESET_COLUMNS.filter(c => !existentes.has(c.name));
    if (!faltantes.length) return;

    await pool.query(`ALTER TABLE usuarios ${faltantes.map(c => c.ddl).join(', ')}`);
    console.log('[SCHEMA] columnas de recuperación creadas:', faltantes.map(c => c.name).join(', '));
  } catch (e) {
    console.error('[SCHEMA] no se pudieron crear las columnas de recuperación:', e?.message || e);
    console.error('[SCHEMA] aplica migrations/add_password_reset.sql manualmente.');
  }
}
