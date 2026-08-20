// utils/ensure-schema.js
import pool from '../db.js';

// Columnas que necesita el flujo de "olvidé mi contraseña".
const RESET_COLUMNS = [
  { name: 'reset_token',   ddl: 'ADD COLUMN `reset_token` CHAR(64) DEFAULT NULL' },
  { name: 'reset_expires', ddl: 'ADD COLUMN `reset_expires` DATETIME DEFAULT NULL' }
];

// Columnas para bloquear cuentas abusivas y poder rastrear de dónde vienen.
const USUARIOS_ANTIABUSO = [
  { name: 'bloqueado',        ddl: 'ADD COLUMN `bloqueado` TINYINT(1) NOT NULL DEFAULT 0' },
  { name: 'motivo_bloqueo',   ddl: 'ADD COLUMN `motivo_bloqueo` VARCHAR(255) DEFAULT NULL' },
  { name: 'bloqueado_at',     ddl: 'ADD COLUMN `bloqueado_at` DATETIME DEFAULT NULL' },
  { name: 'ip_registro',      ddl: 'ADD COLUMN `ip_registro` VARCHAR(45) DEFAULT NULL' }
];

const PEDIDOS_ANTIABUSO = [
  { name: 'ip_pedido', ddl: 'ADD COLUMN `ip_pedido` VARCHAR(45) DEFAULT NULL' }
];

// Historial de intentos de registro, para poder revisar quién intenta crear
// cuentas y con qué correo/IP, y banear a quien corresponda.
const TABLA_AUDITORIA = `
  CREATE TABLE IF NOT EXISTS registros_auditoria (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    fecha        DATETIME     NOT NULL,
    usuario      VARCHAR(100) DEFAULT NULL,
    email        VARCHAR(190) DEFAULT NULL,
    telefono     VARCHAR(30)  DEFAULT NULL,
    ip           VARCHAR(45)  DEFAULT NULL,
    user_agent   VARCHAR(255) DEFAULT NULL,
    resultado    VARCHAR(20)  NOT NULL,
    motivo       VARCHAR(60)  DEFAULT NULL,
    id_usuario   INT          DEFAULT NULL,
    INDEX idx_fecha (fecha),
    INDEX idx_ip (ip),
    INDEX idx_email (email),
    INDEX idx_resultado (resultado)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

export async function ensureTablaAuditoria() {
  try {
    await pool.query(TABLA_AUDITORIA);
  } catch (e) {
    console.error('[SCHEMA] no se pudo crear registros_auditoria:', e?.message || e);
  }
}

// Añade solo las columnas que falten. Si ya existen, no hace nada.
async function asegurarColumnas(tabla, columnas, etiqueta) {
  try {
    const nombres = columnas.map(c => c.name);
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME IN (?)`,
      [tabla, nombres]
    );

    const existentes = new Set(rows.map(r => r.COLUMN_NAME));
    const faltantes  = columnas.filter(c => !existentes.has(c.name));
    if (!faltantes.length) return;

    await pool.query(`ALTER TABLE \`${tabla}\` ${faltantes.map(c => c.ddl).join(', ')}`);
    console.log(`[SCHEMA] ${etiqueta}: columnas creadas en ${tabla}:`, faltantes.map(c => c.name).join(', '));
  } catch (e) {
    console.error(`[SCHEMA] no se pudieron crear las columnas de ${etiqueta} en ${tabla}:`, e?.message || e);
  }
}

export async function ensurePasswordResetColumns() {
  await asegurarColumnas('usuarios', RESET_COLUMNS, 'recuperación de contraseña');
}

export async function ensureAntiAbuseColumns() {
  await asegurarColumnas('usuarios', USUARIOS_ANTIABUSO, 'antiabuso');
  await asegurarColumnas('pedidos',  PEDIDOS_ANTIABUSO,  'antiabuso');
}

// Punto único de entrada para el arranque.
export async function ensureSchema() {
  await ensurePasswordResetColumns();
  await ensureAntiAbuseColumns();
  await ensureTablaAuditoria();
}
