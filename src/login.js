const form = document.getElementById('login-form');
const msg = document.getElementById('msg');

function showMsg(text, type = 'error') {
  msg.textContent = text;
  msg.className = ''; // limpia clases previas
  msg.classList.add(type === 'ok' ? 'ok' : 'error');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = form.user.value.trim();
  const password = form.password.value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password })
    });

    const data = await res.json();

    if (!res.ok) {
      // error desde backend (credenciales, no verificado, etc.)
      showMsg(data.message || 'Error al iniciar sesión', 'error');

      // si el código es EMAIL_NOT_VERIFIED
      if (data.code === 'EMAIL_NOT_VERIFIED') {
        // ejemplo: mostrar botón para reenviar verificación
        const btn = document.createElement('button');
        btn.textContent = 'Reenviar verificación';
        btn.onclick = async () => {
          await fetch('/api/verify/resend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ email: prompt('Ingresa tu correo') })
          });
          showMsg('Se reenviaron las instrucciones. Revisa tu bandeja de entrada.', 'ok');
        };
        msg.appendChild(document.createElement('br'));
        msg.appendChild(btn);
      }

      return;
    }

    // login correcto → redirigir
    showMsg('Login correcto. Redirigiendo...', 'ok');
    if (data.redirect) {
      location.href = data.redirect;
    } else {
      location.reload();
    }

  } catch (err) {
    console.error(err);
    showMsg('Error de conexión con el servidor', 'error');
  }
});
