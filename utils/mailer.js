import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

// Verifica al iniciar (loguea pero no rompe)
export async function verifyTransport() {
  try {
    await transporter.verify();
    console.log('[MAILER] Transporte OK');
  } catch (e) {
    console.error('[MAILER] Transporte FALLÓ:', e.message);
  }
}

export async function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
    to, subject, html
  });
}
