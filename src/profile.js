document.addEventListener('DOMContentLoaded', async () => {
    try {
      const response = await fetch('/api/user');
      const userData = await response.json();
  
      // Muestra los datos del usuario en el perfil
      document.getElementById('user-name').textContent = userData.user;
      document.getElementById('user-email').textContent = userData.email;
      document.getElementById('user-role').textContent = userData.role;
      document.getElementById('user-number').textContent = userData.number || 'No disponible';
      if (userData.google_id) {
        document.getElementById('user-google-id').textContent = userData.google_id;
      } else {
        document.getElementById('user-google-id').textContent = 'No vinculado con Google';
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
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
  