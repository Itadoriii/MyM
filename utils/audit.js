// utils/audit.js
// Deja constancia de cada intento de registro, salga bien o mal.
// Los rechazos son la señal más útil: veinte intentos seguidos desde la misma
// IP con correos distintos delatan a quien está creando cuentas en cadena.
import pool from '../db.js';

// Nunca lanza: un fallo al auditar no puede tumbar un registro legítimo.
export async function registrarIntento({ req, usuario, email, telefono, resultado, motivo, idUsuario }) {
  try {
    const ip = req?.ip || req?.socket?.remoteAddress || null;
    const userAgent = (req?.headers?.['user-agent'] || '').slice(0, 255) || null;

    await pool.query(
      `INSERT INTO registros_auditoria
         (fecha, usuario, email, telefono, ip, user_agent, resultado, motivo, id_usuario)
       VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        (usuario  || '').slice(0, 100) || null,
        (email    || '').slice(0, 190) || null,
        (telefono || '').slice(0, 30)  || null,
        ip,
        userAgent,
        resultado,
        motivo || null,
        idUsuario || null
      ]
    );
  } catch (e) {
    console.warn('[AUDIT] no se pudo guardar el intento de registro:', e?.message || e);
  }
}
