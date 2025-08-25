const validator = require('validator');
const deep = require('deep-email-validator');
const disposableDomains = require('disposable-email-domains'); // array de dominios
const dns = require('dns').promises;

function isDisposableDomain(email) {
  const dom = String(email.split('@')[1] || '').toLowerCase();
  return disposableDomains.includes(dom);
}

async function validateEmailHard(email) {
  // 1) Sintaxis
  if (!validator.isEmail(email || '')) {
    return { ok: false, reason: 'bad_format' };
  }
  // 2) Desechables
  if (isDisposableDomain(email)) {
    return { ok: false, reason: 'disposable_domain' };
  }
  // 3) MX (rápido y sin tocar SMTP)
  try {
    const domain = email.split('@')[1];
    const mx = await dns.resolveMx(domain);
    if (!mx || mx.length === 0) return { ok: false, reason: 'mx_missing' };
  } catch {
    return { ok: false, reason: 'mx_error' };
  }
  // 4) (Opcional) verificación profunda
  // const { valid, validators } = await deep.validate(email);
  // if (!valid) return { ok: false, reason: 'smtp_unreachable', detail: validators };
  return { ok: true };
}

module.exports = { validateEmailHard, isDisposableDomain };
