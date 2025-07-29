// controllers/pedidos.controller.js
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import nodemailer from 'nodemailer';
import pool from '../db.js';

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
