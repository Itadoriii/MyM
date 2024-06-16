document.addEventListener("DOMContentLoaded", function() {
    const button = document.querySelector(".button");
    if (button) {
        button.addEventListener("click", () => {
            document.cookie = 'jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            document.location.href = "/";
        });
    } else {
        console.error("Button with class 'button' not found");
    }
});