document.querySelector('.button').addEventListener('click', async () => {
    const res = await fetch('/logout', {
      method: 'GET'
    });
    if (res.redirected) {
      window.location.href = res.url; // Redirige al usuario a la página de inicio de sesión
    }
  });