// utils/html.js
// Escape de HTML para todo lo que escribe un visitante y termina dentro de un
// correo o de una página. Sin esto, un comentario de pedido como
// `<a href="http://sitio-falso">Paga aquí</a>` llega tal cual a la bandeja del
// administrador y parece parte del correo de la tienda.
export function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapa y corta: los campos libres no tienen por qué ocupar un correo entero.
export function textoSeguro(valor, maxLargo = 500) {
  const limpio = String(valor ?? '').trim().slice(0, maxLargo);
  return escaparHtml(limpio);
}
