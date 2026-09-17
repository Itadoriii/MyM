// utils/audit.js
// Deja constancia de cada intento de registro/login, salga bien o mal.
// Los rechazos son la señal más útil: veinte intentos seguidos desde la misma
// IP con correos distintos delatan a quien está creando cuentas en cadena.
//
// Además, cuando una misma IP acumula rechazos en poco tiempo, avisa por correo
// a la tienda. De poco sirve enterarse del ataque un mes después al mirar el
// panel: lo que se quiere es saberlo el mismo día.
import pool from '../db.js';
import { obtenerIp } from './client-ip.js';
import { transporter } from './mailer.js';

// --- Detección de ráfagas (en memoria) -------------------------------------
// Se cuenta por proceso. Con varias instancias de Node cada una llevaría su
// cuenta; serviría igual, solo que el umbral se alcanzaría algo más tarde.
const VENTANA_MS   = 10 * 60 * 1000;   // ventana de observación
const UMBRAL       = 20;               // rechazos en la ventana para alertar
const COOLDOWN_MS  = 60 * 60 * 1000;   // como mucho un aviso por IP y hora

const rafagas = new Map(); // ip -> { conteo, desde, ultimoAviso, motivos }

function revisarRafaga(ip, motivo) {
  if (!ip) return false;

  const ahora = Date.now();
  let reg = rafagas.get(ip);

  if (!reg || ahora - reg.desde > VENTANA_MS) {
    reg = { conteo: 0, desde: ahora, ultimoAviso: reg?.ultimoAviso || 0, motivos: new Map() };
    rafagas.set(ip, reg);
  }

  reg.conteo += 1;
  reg.motivos.set(motivo || 'sin-motivo', (reg.motivos.get(motivo || 'sin-motivo') || 0) + 1);

  // Limpieza perezosa para que el Map no crezca sin control.
  if (rafagas.size > 1000) {
    for (const [clave, dato] of rafagas) {
      if (ahora - dato.desde > VENTANA_MS * 6) rafagas.delete(clave);
    }
  }

  if (reg.conteo < UMBRAL) return false;
  if (ahora - reg.ultimoAviso < COOLDOWN_MS) return false;

  reg.ultimoAviso = ahora;
  return { conteo: reg.conteo, motivos: [...reg.motivos.entries()] };
}

async function avisarPorCorreo(ip, resumen) {
  const destino = process.env.ALERTA_EMAIL || process.env.GMAIL_USER;
  if (!destino) return;

  const detalle = resumen.motivos.map(([m, n]) => `  - ${m}: ${n}`).join('\n');

  await transporter.sendMail({
    from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
    to: destino,
    subject: `⚠️ Ataque detectado desde ${ip}`,
    text: [
      `Se detectaron ${resumen.conteo} intentos rechazados desde la IP ${ip}`,
      `en los últimos ${Math.round(VENTANA_MS / 60000)} minutos.`,
      '',
      'Motivos:',
      detalle,
      '',
      'Qué hacer:',
      '  1. Revisar el panel, sección Registros, filtrando por esa IP.',
      '  2. Bloquearla en Cloudflare (Security -> WAF -> Tools -> IP Access Rules).',
      '  3. Comprobar en Cloudflare -> Security -> Events a qué rutas apuntó.',
      '',
      `Fecha: ${new Date().toLocaleString('es-CL')}`
    ].join('\n')
  });
}

// Nunca lanza: un fallo al auditar no puede tumbar un registro legítimo.
export async function registrarIntento({ req, usuario, email, telefono, resultado, motivo, idUsuario }) {
  try {
    const ip = obtenerIp(req);
    if (!ip) console.warn('[AUDIT] intento sin IP identificable', { email, resultado, motivo });
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

    // Aviso por ráfaga, solo para rechazos (los aciertos no son una amenaza).
    if (resultado === 'rechazado') {
      const resumen = revisarRafaga(ip, motivo);
      if (resumen) {
        console.warn('[AUDIT] ráfaga detectada', { ip, conteo: resumen.conteo });
        avisarPorCorreo(ip, resumen).catch(e =>
          console.warn('[AUDIT] no se pudo enviar el aviso:', e?.message || e)
        );
      }
    }
  } catch (e) {
    console.warn('[AUDIT] no se pudo guardar el intento de registro:', e?.message || e);
  }
}
