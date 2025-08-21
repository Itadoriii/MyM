// controllers/pedidos.controller.js
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import nodemailer from 'nodemailer';
import pool from '../db.js';


// === Utils de formato ===
const PAY_LINK = 'https://www.webpay.cl/company/31257';

const LABELS = {
  generado: 'Generado',
  aceptado_espera_pago: 'Aceptado (espera de pago)',
  pagado_espera_envio: 'Pagado (espera retiro/envío)',
  enviado: 'Enviado',
  retirado: 'Retirado',
  finalizado: 'Finalizado',
  rechazado: 'Rechazado'
};

const STEPS_LABELS = [
  'Generado',
  'Aceptado (espera de pago)',
  'Pagado (espera retiro/envío)',
  'Enviado/Retirado',
  'Finalizado'
];

function stepIndexFromEstado(estado) {
  if (estado === 'generado') return 0;
  if (estado === 'aceptado_espera_pago') return 1;
  if (estado === 'pagado_espera_envio') return 2;
  if (estado === 'enviado' || estado === 'retirado') return 3;
  if (estado === 'finalizado') return 4;
  return -1; // rechazado u otro
}

const CLP = n => '$' + Number(n || 0).toLocaleString('es-CL');
const fechaCL = d => new Date(d).toLocaleDateString('es-CL');
const entregaLabel = v => v === 'retiro' ? 'Retiro en tienda' : 'Envío a domicilio';

async function buildPdf(pedido, detalles) {
  const plantillaPath = path.join(process.cwd(), 'templates', 'Detalles de pedido-1.pdf');
  const plantillaBytes = fs.readFileSync(plantillaPath);
  const pdfDoc = await PDFDocument.load(plantillaBytes);

  let page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();

  const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - 140;

  // Encabezado
  page.drawText(`Pedido #: ${pedido.id}`, { x: margin, y, size: 14, font: fontBold });
  if (pedido.fecha) {
    const fechaTxt = new Date(pedido.fecha).toLocaleDateString('es-CL');
    page.drawText(`Fecha: ${fechaTxt}`, {
      x: width - margin - 120, y, size: 12, font: fontNormal
    });
  }

  // Datos cliente
  y -= 25;
  page.drawText(`Cliente: ${pedido.nombre}`, { x: margin, y, size: 12, font: fontBold });
  y -= 18;
  page.drawText(`Teléfono: ${pedido.telefono || '—'}`, { x: margin, y, size: 12, font: fontNormal });
  y -= 18;
  page.drawText(`Email: ${pedido.email}`, { x: margin, y, size: 12, font: fontNormal });

  // Tabla detalles
  y -= 30;
  page.drawText('Detalles de Pedido:', { x: margin, y, size: 12, font: fontBold });

  // Columnas: nombre, cantidad, precio, subtotal
  const xNombre   = margin;
  const xCantidad = margin + 250;
  const xPrecio   = margin + 330;
  const xSubtotal = margin + 430;

  // Header de tabla
  y -= 20;
  page.drawText('Producto',  { x: xNombre,   y, size: 11, font: fontBold });
  page.drawText('Cantidad',  { x: xCantidad, y, size: 11, font: fontBold });
  page.drawText('Precio (u.)',{ x: xPrecio,   y, size: 11, font: fontBold });
  page.drawText('Subtotal',  { x: xSubtotal, y, size: 11, font: fontBold });

  page.drawLine({
    start: { x: margin,       y: y - 2 },
    end:   { x: width - margin, y: y - 2 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Filas
  y -= 18;
  for (const item of detalles) {
    if (y < 100) {
      page = pdfDoc.addPage();
      y = height - margin;
    }
    const lineSubtotal = item.cantidad * item.precio;
    page.drawText(item.nombre,              { x: xNombre,   y, size: 10, font: fontNormal, maxWidth: xCantidad - xNombre - 5 });
    page.drawText(item.cantidad.toString(), { x: xCantidad, y, size: 10, font: fontNormal });
    page.drawText(`$${item.precio.toFixed(2)}`, { x: xPrecio,   y, size: 10, font: fontNormal });
    page.drawText(`$${lineSubtotal.toFixed(2)}`, { x: xSubtotal, y, size: 10, font: fontNormal });
    y -= 18;
  }

  // Total general
  y -= 10;
  page.drawLine({
    start: { x: margin,       y },
    end:   { x: width - margin, y },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 18;
  page.drawText(`TOTAL: $${pedido.total.toFixed(2)}`, {
    x: width - margin - 150,
    y,
    size: 12,
    font: fontBold
  });

  return pdfDoc.save();
}

export async function enviarConfirmacion(req, res) {
  const { id } = req.params;
  try {
    // Marcar como aceptado
    await pool.query('UPDATE pedidos SET estado = ? WHERE id_pedido = ?', ['ACEPTADO', id]);

    // Datos del pedido
    const [[pedido]] = await pool.query(
      `SELECT p.id_pedido AS id,
              p.precio_total AS total,
              p.fecha_pedido AS fecha,
              u.email,
              u.user AS nombre,
              u.number AS telefono
       FROM pedidos p
       JOIN usuarios u ON p.id_usuario = u.id_usuarios
       WHERE p.id_pedido = ?`,
      [id]
    );

    // Detalles
    const [detalles] = await pool.query(
      `SELECT pr.nombre_prod AS nombre,
              dp.cantidad,
              dp.precio_detalle AS precio
       FROM detalle_pedido dp
       JOIN productos pr ON dp.id_producto = pr.id_producto
       WHERE dp.id_pedido = ?`,
      [id]
    );

    // Generar PDF
    const pdfBytes = await buildPdf(pedido, detalles);

    // Configurar nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    const mailOpts = {
      from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
      to: pedido.email,
      subject: `Pedido #${pedido.id} Confirmado`,
      text: `Hola ${pedido.nombre},\nTu pedido ha sido aceptado. Adjunto encontrarás el detalle en PDF.\nGracias por tu preferencia.`,
      attachments: [{
        filename: `pedido_${pedido.id}.pdf`,
        content: pdfBytes
      }]
    };

    // Enviar al cliente y copia a tienda
    await transporter.sendMail(mailOpts);
    await transporter.sendMail({ ...mailOpts, to: process.env.GMAIL_USER });

    res.json({ message: 'Pedido aceptado y correos enviados.' });
  } catch (err) {
    console.error('enviarConfirmacion:', err);
    res.status(500).json({ error: 'No se pudo enviar la confirmación.' });
  }
}

function progressBarEmailHTML(estado = 'generado') {
  const GREEN = '#16a34a', BLUE = '#2563eb', GRAY = '#e5e7eb', DARK = '#111827', MUTED = '#6b7280';
  const steps = ['Generado','Aceptado (espera de pago)','Pagado (espera retiro/envío)','Enviado/Retirado','Finalizado'];
  const idx = Math.max(0, stepIndexFromEstado(String(estado).toLowerCase())); // <- usar estado real

  let circlesRow = '';
  for (let i = 0; i < steps.length; i++) {
    const isCurrent = i === idx;
    const isDone = i < idx;
    const fill = isDone ? GREEN : isCurrent ? BLUE : GRAY;

    circlesRow += `
      <td width="24" align="center" style="padding:0;">
        <div style="width:22px;height:22px;line-height:22px;border-radius:999px;background:${fill};color:#fff;font:700 12px Arial;text-align:center;">
          ${i+1}
        </div>
      </td>
    `;
    if (i < steps.length - 1) {
      const color = i < idx ? GREEN : GRAY;
      circlesRow += `<td width="56" style="padding:0 4px;"><div style="height:4px;background:${color};border-radius:2px;"></div></td>`;
    }
  }

  let labelsRow = '';
  for (let i = 0; i < steps.length; i++) {
    const isCurrent = i === idx;
    const isDone = i < idx;
    const colSpan = (i < steps.length - 1) ? 2 : 1;
    labelsRow += `
      <td colspan="${colSpan}" align="center" style="padding-top:6px;">
        <div style="font:500 12px system-ui,Segoe UI,Arial;color:${isCurrent ? BLUE : (isDone ? DARK : MUTED)};">
          ${steps[i]}
        </div>
      </td>
    `;
  }

  return `
    <table width="100%" role="presentation" style="margin:10px 0;border-collapse:collapse;">
      <tr>${circlesRow}</tr>
      <tr>${labelsRow}</tr>
    </table>
  `;
}

// Tabla HTML del detalle
function detallesHTML(detalles = []) {
  const head = `
    <table width="100%" role="presentation" style="border-collapse:collapse;border:1px solid #e5e7eb;">
      <thead>
        <tr>
          <th align="left" style="padding:8px;border-bottom:1px solid #e5e7eb;">ID</th>
          <th align="left" style="padding:8px;border-bottom:1px solid #e5e7eb;">Producto</th>
          <th align="left" style="padding:8px;border-bottom:1px solid #e5e7eb;">Medidas</th>
          <th align="right" style="padding:8px;border-bottom:1px solid #e5e7eb;">Cant.</th>
          <th align="right" style="padding:8px;border-bottom:1px solid #e5e7eb;">Precio (u.)</th>
          <th align="right" style="padding:8px;border-bottom:1px solid #e5e7eb;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
  `;
  const rows = detalles.map(d => `
    <tr>
      <td style="padding:8px;border-top:1px solid #f3f4f6;">${d.id_producto}</td>
      <td style="padding:8px;border-top:1px solid #f3f4f6;">${d.nombre_prod}</td>
      <td style="padding:8px;border-top:1px solid #f3f4f6;">${d.medidas || d.dimensiones || '—'}</td>
      <td align="right" style="padding:8px;border-top:1px solid #f3f4f6;">${d.cantidad}</td>
      <td align="right" style="padding:8px;border-top:1px solid #f3f4f6;">${CLP(d.precio_detalle)}</td>
      <td align="right" style="padding:8px;border-top:1px solid #f3f4f6;">${CLP(d.cantidad * d.precio_detalle)}</td>
    </tr>
  `).join('');
  return head + rows + '</tbody></table>';
}

// Obtiene pedido + usuario + detalle desde tu BD
async function fetchPedidoCompleto(idPedido) {
  const [[pedido]] = await pool.query(
    `SELECT p.id_pedido AS id,
            p.precio_total AS total,
            p.fecha_pedido AS fecha,
            p.estado,
            p.delivery,
            p.descripcion,
            u.user AS nombre,
            u.email,
            u.number AS telefono
     FROM pedidos p
     JOIN usuarios u ON p.id_usuario = u.id_usuarios
     WHERE p.id_pedido = ?`,
    [idPedido]
  );

  const [detalles] = await pool.query(
    `SELECT dp.id_producto,
            dp.cantidad,
            dp.precio_detalle,
            pr.nombre_prod,
            pr.medidas,
            pr.dimensiones
     FROM detalle_pedido dp
     JOIN productos pr ON dp.id_producto = pr.id_producto
     WHERE dp.id_pedido = ?`,
    [idPedido]
  );

  return { pedido, detalles };
}

// Reutilizable para mandar al cliente y copia a la tienda
async function enviarDobleCorreo({ toCliente, subject, htmlCliente, htmlInterno, attachments }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
  });

  await transporter.sendMail({
    from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
    to: toCliente,
    subject,
    html: htmlCliente,
    attachments
  });

  await transporter.sendMail({
    from: `"Maderas MyM" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    subject: `[COPIA] ${subject}`,
    html: htmlInterno,
    attachments
  });
}

export async function enviarMailCambioEstado(idPedido, nuevoEstado) {
  try {
    nuevoEstado = String(nuevoEstado || '').toLowerCase();

    const { pedido, detalles } = await fetchPedidoCompleto(idPedido);
    if (!pedido) {
      console.error('Pedido no encontrado', idPedido);
      return;
    }

    const bar = progressBarEmailHTML(nuevoEstado);
    const htmlTabla = detallesHTML(detalles);
    const entregaTxt = entregaLabel(pedido.delivery);

    let subject = `Actualización de pedido #${pedido.id}`;
    let cuerpoExtra = '';
    let attachments;

    switch (nuevoEstado) {
      case 'aceptado_espera_pago':
        subject = `Pedido #${pedido.id} aceptado — en espera de pago`;
        cuerpoExtra = `
          <p>Tu pedido fue aceptado. Para pagar, utiliza el siguiente enlace seguro:</p>
          <p><a href="${PAY_LINK}" target="_blank">${PAY_LINK}</a></p>
          <p>Una vez confirmado el pago, prepararemos tu ${entregaTxt.toLowerCase()}.</p>
        `;
        break;

      case 'pagado_espera_envio':
        subject = `Pago recibido — Pedido #${pedido.id}`;
        const mapped = detalles.map(d => ({ nombre: d.nombre_prod, cantidad: d.cantidad, precio: d.precio_detalle }));
        const pdfBytes = await buildPdf(
          {
            id: pedido.id,
            total: pedido.total,
            fecha: pedido.fecha,
            nombre: pedido.nombre,
            telefono: pedido.telefono,
            email: pedido.email
          },
          mapped
        );
        attachments = [{ filename: `pedido_${pedido.id}.pdf`, content: pdfBytes }];
        cuerpoExtra = `<p>¡Gracias! Hemos recibido tu pago. Estamos preparando tu ${entregaTxt.toLowerCase()}.</p>`;
        break;

      case 'enviado':
        subject = `Tu pedido #${pedido.id} ha sido enviado`;
        cuerpoExtra = `<p>Tu pedido fue despachado. Pronto lo recibirás.</p>`;
        break;

      case 'retirado':
        subject = `Pedido #${pedido.id} retirado`;
        cuerpoExtra = `<p>Registramos el retiro de tu pedido. ¡Gracias por tu compra!</p>`;
        break;

      case 'finalizado':
        subject = `Pedido #${pedido.id} finalizado`;
        cuerpoExtra = `<p>Tu pedido ha sido finalizado. ¡Gracias por preferirnos!</p>`;
        break;

      case 'rechazado':
        subject = `Pedido #${pedido.id} rechazado`;
        cuerpoExtra = `<p>Tu pedido no pudo ser aceptado. Si tienes dudas, contáctanos por WhatsApp.</p>`;
        break;
    }

    const htmlCliente = `
      <div style="font-family:system-ui,Segoe UI,Arial;line-height:1.5;">
        <h2 style="margin:0 0 8px;">Pedido #${pedido.id} — ${LABELS[nuevoEstado] || nuevoEstado}</h2>
        ${bar}
        <p><strong>Fecha:</strong> ${fechaCL(pedido.fecha)}<br>
           <strong>Entrega:</strong> ${entregaTxt}<br>
           <strong>Total:</strong> ${CLP(pedido.total)}</p>

        <h3 style="margin:16px 0 8px;">Detalle</h3>
        ${htmlTabla}
        <p style="margin-top:12px;text-align:right;font-weight:700;">Total: ${CLP(pedido.total)}</p>

        ${cuerpoExtra}
      </div>
    `;

    const htmlInterno = `
      <div style="font-family:system-ui,Segoe UI,Arial;line-height:1.5;">
        <h2>Estado actualizado: #${pedido.id} → ${LABELS[nuevoEstado] || nuevoEstado}</h2>
        ${bar}
        <p>Cliente: ${pedido.nombre} — ${pedido.email} — ${pedido.telefono || 'Sin número'}</p>
      </div>
    `;

    await enviarDobleCorreo({
      toCliente: pedido.email,
      subject,
      htmlCliente,
      htmlInterno,
      attachments
    });

    console.log('[MAIL] Cambio de estado enviado:', pedido.id, nuevoEstado);
  } catch (e) {
    console.error('enviarMailCambioEstado error:', e);
  }
}

// --- ESTA es la función que necesitas: mail al generar pedido (SIN PDF) ---
export async function notificarPedidoGenerado(idPedido) {
  try {
    const { pedido, detalles } = await fetchPedidoCompleto(idPedido);

    const htmlTabla = detallesHTML(detalles);
    const entrega = pedido.delivery === 'retiro' ? 'Retiro en tienda' : 'Envío a domicilio';

    const htmlCliente = `
      <div style="font-family:system-ui,Segoe UI,Arial;line-height:1.45;">
        <h2 style="margin:0 0 8px;">¡Hemos recibido tu pedido #${pedido.id}!</h2>
        ${progressBarEmailHTML('generado')}
        <p><strong>Estado:</strong> Generado</p>
        <p><strong>Fecha:</strong> ${fechaCL(pedido.fecha)}<br>
           <strong>Entrega:</strong> ${entrega}<br>
           <strong>Total:</strong> ${CLP(pedido.total)}<br>
           <strong>Comentario:</strong> ${pedido.descripcion || '—'}</p>
        <h3 style="margin:16px 0 8px;">Detalle</h3>
        ${htmlTabla}
        <p style="margin-top:12px;text-align:right;font-weight:700;">Total: ${CLP(pedido.total)}</p>
        <p style="margin-top:16px;">Revisaremos tu pedido y te contactaremos a la brevedad.</p>
      </div>`;

    const htmlInterno = `
      <div style="font-family:system-ui,Segoe UI,Arial;line-height:1.45;">
        <h2 style="margin:0 0 8px;">Nuevo pedido generado #${pedido.id}</h2>
        ${progressBarEmailHTML('generado')}
        <p><strong>Cliente:</strong> ${pedido.nombre} — ${pedido.email} — ${pedido.telefono || 'Sin número'}</p>
        <p><strong>Entrega:</strong> ${entrega} — <strong>Total:</strong> ${CLP(pedido.total)}</p>
      </div>`;

    await enviarDobleCorreo({
      toCliente: pedido.email,
      subject: `Pedido #${pedido.id} recibido`,
      htmlCliente,
      htmlInterno
    });

    console.log('[MAIL] Pedido generado enviado (sin PDF).');
  } catch (e) {
    console.error('notificarPedidoGenerado error:', e);
  }
}
