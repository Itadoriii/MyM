async function cargarMisPedidos(username) {
  try {
    if (!username) throw new Error('Falta nombre de usuario para cargar pedidos');

    const res = await fetch(`/api/mis-pedidos?user=${encodeURIComponent(username)}`, {
      credentials: 'include'
    });
    const pedidos = await res.json();

    const container = document.getElementById('pedidos-container');
    container.innerHTML = '';

    pedidos.forEach(pedido => {
      const div = document.createElement('div');
      div.classList.add('pedido');

      div.innerHTML = `
        <h3>Pedido ID: ${pedido.id_pedido}</h3>
        <p>Fecha: ${new Date(pedido.fecha_pedido).toLocaleString()}</p>
        <p>Total: $${pedido.precio_total.toFixed(2)}</p>
        <p>Estado: ${pedido.estado}</p>
        <p>Tipo de Entrega: ${pedido.delivery || 'No especificado'}</p>
        <p>Comentario: ${pedido.descripcion || 'Sin comentario'}</p>
        <h4>Productos:</h4>
        <ul>
          ${pedido.detalles.map(d => `
            <li>${d.nombre_prod} - ${d.cantidad} x $${d.precio_detalle.toFixed(2)}</li>
          `).join('')}
        </ul>
        <hr>
      `;
      container.appendChild(div);
    });
  } catch (error) {
    console.error('Error al cargar tus pedidos:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/user', { credentials: 'include' });
    const userData = await response.json();

    document.getElementById('user-name').textContent = userData.user;
    document.getElementById('user-email').textContent = userData.email;
    document.getElementById('user-role').textContent = userData.role;
    document.getElementById('user-number').textContent = userData.number || 'No disponible';
    document.getElementById('user-google-id').textContent = userData.google_id || 'No vinculado con Google';

    await cargarMisPedidos(userData.user);
  } catch (error) {
    console.error('Error al cargar datos del usuario:', error);
  }
});

document.querySelector('.button').addEventListener('click', async () => {
    const res = await fetch('/logout', {
      method: 'GET'
    });
    if (res.redirected) {
      window.location.href = res.url; // Redirige al usuario a la página de inicio de sesión
    }
  });



