document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = e.target.user.value;
    const email = e.target.email.value;
    const password = e.target.password.value;
    const number = e.target.number.value;

    const res = await fetch("https://www.maderasmym.cl/api/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
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
