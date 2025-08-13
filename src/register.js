document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
<<<<<<< HEAD
    console.log(e.target.children.user.value)
    const res = await fetch("https://sebastiancastro.cl/api/register",{
        method :"POST",
        headers:{
            "Content-Type" : "application/json"
=======

    const user = e.target.user.value;
    const email = e.target.email.value;
    const password = e.target.password.value;
    const number = e.target.number.value;

    const res = await fetch("http://localhost:3000/api/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
>>>>>>> main
        },
        body: JSON.stringify({
            user,
            email,
            password,
            number
        })
    });

    if (!res.ok) return mensajeError.classList.toggle("escondido", false);

    const resJson = await res.json();
    if (resJson.redirect) {
        window.location.href = resJson.redirect;
    }
});
