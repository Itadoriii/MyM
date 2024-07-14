 
const mensajeError = document.getElementsByClassName("error")[0]

document.getElementById("login-form").addEventListener("submit",async (e)=>{
  e.preventDefault();
  const user = e.target.children.user.value;
  const password = e.target.children.password.value;
  const res = await fetch("http://localhost:3000/api/login",{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      user,password
    })
  });
  if(!res.ok) return mensajeError.classList.toggle("escondido",false);
  const resJson = await res.json();
  if(resJson.redirect){
    window.location.href = resJson.redirect;
  }
})
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

function checkLoggedIn() {
  const token = getCookie('jwt');
  console.log("JWT Token in checkLoggedIn:", token); // Agregar para verificar el token
  return !!token; // Retorna true si el token existe
}

function updateLoginButton() {
  const loginButton = document.getElementById('login-button');
  if (checkLoggedIn()) {
      loginButton.href = "/profile";
      loginButton.innerHTML = `
          <img src="assets/Cuenta.png" alt="Cuenta" class="menu__img">
      `;
  } else {
      loginButton.href = "/login";
      loginButton.innerHTML = `
          <img src="assets/Cuenta.png" alt="Cuenta" class="menu__img">
      `;
  }
}

window.onload = async () => {
  const productos = await (await fetch("/productos")).json();
  console.log(productos);
  displayProducts(productos);
  updateLoginButton(); // Actualiza el botón al cargar la página
  updateCartDisplay(); // Actualiza la visualización del carrito al cargar la página
}
