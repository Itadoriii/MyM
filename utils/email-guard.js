// utils/email-guard.js
// Filtro de correos para el registro: descarta desechables y dominios que
// no pueden recibir correo. La verificación por enlace ya existía; esto evita
// que alguien se registre en masa con buzones temporales de 10 minutos.
import dns from 'dns/promises';

// Proveedores de correo temporal más usados.
const DESECHABLES = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'anonbox.net',
  'dispostable.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'mailinator.com', 'mailinator.net', 'maildrop.cc', 'mailnesia.com',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com',
  'grr.la', 'spam4.me', 'temp-mail.org', 'tempmail.com', 'tempmailo.com',
  'tempr.email', 'throwawaymail.com', 'trashmail.com', 'trashmail.de',
  'getnada.com', 'nada.email', 'inboxkitten.com', 'emailondeck.com',
  'fakemail.net', 'fakeinbox.com', 'mohmal.com', 'mytemp.email',
  'moakt.com', 'tmpmail.org', 'tmpmail.net', 'burnermail.io',
  'mailcatch.com', 'spambog.com', 'spamgourmet.com', 'mintemail.com',
  'tempinbox.com', 'emailfake.com', 'generator.email', 'internxt.com',
  'linshiyouxiang.net', 'harakirimail.com', 'discard.email', 'mailde.de',
  'luxusmail.org', 'einrot.com', 'cuvox.de', 'dayrep.com', 'armyspy.com',
  'teleworm.us', 'rhyta.com', 'jourrapide.com', 'superrito.com',
  'gustr.com', 'fleckens.hu', 'edu.tw.tw', 'byom.de'
]);

// Proveedores de correo gratuito de Rusia/Ucrania. No son desechables — son
// buzones reales y por eso pasan el filtro de MX — pero son los que usan las
// granjas de cuentas automatizadas, y de ahí salió el registro del 22 de
// agosto (pavlov-9ao9i@rambler.ua). Para una maderera que vende en Chile no
// hay ningún cliente legítimo detrás de estos dominios.
// Se revierte con EMAIL_PERMITIR_EXTRANJEROS=1 en el .env, sin tocar código.
const CORREO_MASIVO_EXTRANJERO = [
  'mail.ru', 'inbox.ru', 'bk.ru', 'list.ru', 'internet.ru',
  'rambler.ru', 'rambler.ua', 'lenta.ru', 'autorambler.ru', 'myrambler.ru', 'ro.ru',
  'yandex.ru', 'yandex.com', 'yandex.ua', 'yandex.by', 'yandex.kz', 'ya.ru',
  'ukr.net', 'i.ua', 'meta.ua', 'bigmir.net', 'email.ua', 'ex.ua',
  'qip.ru', 'pochta.ru', 'nm.ru', 'newmail.ru', 'land.ru',
  'mail.ua', 'mail.kz', 'tut.by', 'sibmail.com', 'vk.com'
];

function extranjerosBloqueados() {
  if (process.env.EMAIL_PERMITIR_EXTRANJEROS === '1') return [];
  return CORREO_MASIVO_EXTRANJERO;
}

// Dominios institucionales vetados por decisión del negocio, a raíz del abuso
// reiterado de pedidos falsos desde esa institución.
// Se puede vaciar la lista con EMAIL_INSTITUCIONALES_PERMITIDOS=1 sin tocar código.
const INSTITUCIONALES = [
  'duocuc.cl',   // cubre también alumnos.duocuc.cl y demás subdominios
  'duoc.cl'      // cubre profesor.duoc.cl
];

function institucionalesBloqueados() {
  if (process.env.EMAIL_INSTITUCIONALES_PERMITIDOS === '1') return [];
  return INSTITUCIONALES;
}

// Permite ampliar la lista sin tocar el código:
// EMAIL_DOMINIOS_BLOQUEADOS=dominio1.cl,dominio2.com
function bloqueadosPorEnv() {
  return (process.env.EMAIL_DOMINIOS_BLOQUEADOS || '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
}

// Coincide con el dominio exacto o con cualquiera de sus subdominios, para que
// bloquear "duocuc.cl" alcance también a "alumnos.duocuc.cl".
function coincideDominio(dominio, lista) {
  return lista.some(base => dominio === base || dominio.endsWith('.' + base));
}

const FORMATO = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function dominioDe(email) {
  return String(email || '').trim().toLowerCase().split('@')[1] || '';
}

// Comprueba que el dominio tenga servidores de correo. Un dominio inventado
// no los tiene, así que el correo de verificación nunca llegaría.
async function tieneMX(dominio) {
  try {
    const registros = await Promise.race([
      dns.resolveMx(dominio),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), 4000))
    ]);
    return Array.isArray(registros) && registros.length > 0;
  } catch (e) {
    // Ante un fallo de DNS o timeout no bloqueamos: preferimos dejar pasar
    // a un cliente real antes que rechazarlo por un problema de red nuestro.
    if (e?.code === 'ENOTFOUND' || e?.code === 'NXDOMAIN') return false;
    console.warn('[EMAIL-GUARD] no se pudo consultar MX de', dominio, e?.message || e);
    return true;
  }
}

/**
 * @returns {Promise<{ok:true} | {ok:false, motivo:string, mensaje:string}>}
 */
export async function validarEmailRegistro(email) {
  const limpio = String(email || '').trim().toLowerCase();

  if (!FORMATO.test(limpio)) {
    return { ok: false, motivo: 'FORMATO', mensaje: 'El correo no tiene un formato válido.' };
  }

  const dominio = dominioDe(limpio);

  if (coincideDominio(dominio, institucionalesBloqueados())) {
    console.warn('[EMAIL-GUARD] dominio institucional rechazado', dominio);
    return {
      ok: false,
      motivo: 'INSTITUCIONAL',
      mensaje: 'No aceptamos registros con correo institucional. Usa tu correo personal (Gmail, Outlook u otro).'
    };
  }

  if (coincideDominio(dominio, extranjerosBloqueados())) {
    console.warn('[EMAIL-GUARD] proveedor de correo masivo rechazado', dominio);
    return {
      ok: false,
      motivo: 'CORREO_EXTRANJERO',
      mensaje: 'No aceptamos registros desde ese proveedor de correo. Usa Gmail, Outlook u otro correo habitual.'
    };
  }

  if (DESECHABLES.has(dominio) || coincideDominio(dominio, bloqueadosPorEnv())) {
    console.warn('[EMAIL-GUARD] dominio rechazado', dominio);
    return {
      ok: false,
      motivo: 'DESECHABLE',
      mensaje: 'Usa un correo personal permanente. No aceptamos correos temporales.'
    };
  }

  if (!(await tieneMX(dominio))) {
    console.warn('[EMAIL-GUARD] dominio sin MX', dominio);
    return {
      ok: false,
      motivo: 'SIN_MX',
      mensaje: 'Ese dominio de correo no existe o no puede recibir mensajes. Revisa que esté bien escrito.'
    };
  }

  return { ok: true };
}
