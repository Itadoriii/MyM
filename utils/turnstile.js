// utils/turnstile.js
// Verificación del captcha de Cloudflare Turnstile (gratis, sin "elige los semáforos").
// Si TURNSTILE_SECRET_KEY no está configurada, el captcha queda desactivado
// para no romper el registro mientras terminas de darlo de alta.
const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function captchaActivo() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * @param {string} token  El valor de cf-turnstile-response que envía el widget.
 * @param {string} ip     IP del visitante, opcional pero recomendada.
 * @returns {Promise<{ok:boolean, motivo?:string}>}
 */
export async function verificarCaptcha(token, ip) {
  if (!captchaActivo()) return { ok: true };

  if (!token) return { ok: false, motivo: 'FALTA_TOKEN' };

  try {
    const cuerpo = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token
    });
    if (ip) cuerpo.append('remoteip', ip);

    const respuesta = await Promise.race([
      fetch(ENDPOINT, { method: 'POST', body: cuerpo }),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), 6000))
    ]);

    const datos = await respuesta.json();
    if (!datos.success) {
      console.warn('[TURNSTILE] captcha rechazado', datos['error-codes']);
      return { ok: false, motivo: 'CAPTCHA_INVALIDO' };
    }
    return { ok: true };
  } catch (e) {
    // Cloudflare caído no puede dejarte sin poder vender: dejamos pasar,
    // pero queda en el log para que se note.
    console.error('[TURNSTILE] no se pudo verificar, se deja pasar:', e?.message || e);
    return { ok: true };
  }
}
