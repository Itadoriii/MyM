// Menú responsive
(function(){
    const listElements = document.querySelectorAll('.menu__item--show');
    const list = document.querySelector('.menu__links');
    const menu = document.querySelector('.menu__hamburguer');

    const addClick = () => {
        listElements.forEach(element => {
            element.addEventListener('click', () => {
                let subMenu = element.children[1];
                let height = 0;
                element.classList.toggle('menu__item--active');

                if (subMenu.clientHeight === 0) {
                    height = subMenu.scrollHeight;
                }

                subMenu.style.height = `${height}px`;
            });
        });
    }

    const deleteStyleHeight = () => {
        listElements.forEach(element => {
            if (element.children[1].getAttribute('style')) {
                element.children[1].removeAttribute('style');
                element.classList.remove('menu__item--active');
            }
        });
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth > 800) {
            deleteStyleHeight();
            if (list.classList.contains('menu__links--show'))
                list.classList.remove('menu__links--show');
        } else {
            addClick();
        }
    });

    if (window.innerWidth <= 800) {
        addClick();
    }

    menu.addEventListener('click', () => list.classList.toggle('menu__links--show'));
})();

// Funciones de autenticación
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function checkLoggedIn() {
    const token = getCookie('jwt');
    return !!token;
}

function updateLoginButton() {
    const loginButton = document.getElementById('login-button');
    if (!loginButton) {
        console.error("login-button not found in DOM");
        return;
    }
    
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



// Funciones de pedido
async function isUserLoggedIn() {
    try {
        const response = await fetch('/api/verificar-usuario', {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Usuario no autenticado');
        const data = await response.json();
        return data.loggedIn;
    } catch (error) {
        console.error('Error al verificar autenticación:', error);
        return false;
    }
}


// Funciones auxiliares
function showPopup(message) {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
        <div class="popup-content">
            <p>${message}</p>
            <button class="popup-close">Cerrar</button>
        </div>
    `;
    document.body.appendChild(popup);

    popup.querySelector('.popup-close').addEventListener('click', () => {
        document.body.removeChild(popup);
    });

    setTimeout(() => {
        if (document.body.contains(popup)) {
            document.body.removeChild(popup);
        }
    }, 3000);
}



