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

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function checkLoggedIn() {
    const token = getCookie('jwt');
    console.log("JWT Token in checkLoggedIn:", token); // Verificar el token
    return !!token; // Retorna true si el token existe
}

function updateLoginButton() {
    const loginButton = document.getElementById('login-button');
    if (!loginButton) {
        console.error("login-button not found in DOM");
        return;
    }
    console.log("Updating login button"); // Añadir log
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
    updateCartDisplay(); // Actualiza la visualización del carrito al cargar la página
}

function displayProducts(products) {
    const containers = ['itemcont1', 'itemcont2', 'itemcont3', 'itemcont4', 'itemcont5', 'itemcont6'];
    products.forEach((product, index) => {
        if (containers[index]) {
            const container = document.querySelector(`.${containers[index]}`);
            container.innerHTML = `
                <div class="product" onclick="displayCard('${product.id_producto}')">
                    <img src="assets/productos/${product.id_producto}.jpg" alt="${product.nombre_prod}" class="product-img">
                    <h2 class="product-name">${product.nombre_prod}</h2>
                    <p class="product-tipo">${product.tipo}</p>
                    <p class="product-medida">${product.medidas}</p>
                    <p class="product-description">${product.dimensiones}</p>
                    <p class="product-price">$${product.precio_unidad}</p>
                    <button class="addtocart" onclick="event.stopPropagation(); addToCart({
                        id_producto: '${product.id_producto}',
                        name: '${product.nombre_prod}',
                        tipo: '${product.tipo}',
                        medida: '${product.medidas}',
                        descripcion: '${product.dimensiones}',
                        precio: ${product.precio_unidad},
                        Linkimg: '${product.id_producto}.jpg'
                    })">
                        Añadir al carro
                        <i class="fa-solid fa-cart-shopping" style="color: #ffffff;"></i>
                    </button>  
                </div>
            `;
        }
    });
}

function displayCard(productId) {
    fetch(`/productos/${productId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(product => {
            const contentContainer = document.getElementById('conteiner');
            if (!contentContainer) {
                console.error('Content container not found');
                return;
            }

            contentContainer.innerHTML = '';

            const productContainer = document.createElement('div');
            productContainer.className = 'product-details';
            productContainer.innerHTML = `
                <img src="assets/productos/${product.id_producto}.jpg" alt="${product.nombre_prod}" class="pproduct-img">
                <h2 class="product-name">${product.nombre_prod}</h2>
                <p class="product-tipo"><strong>Tipo:</strong> ${product.tipo}</p>
                <p class="product-medida"><strong>Medidas:</strong> ${product.medidas}</p>
                <p class="product-description"><strong>Dimensiones:</strong> ${product.dimensiones}</p>
                <p class="product-disponibilidad"><strong>Disponibilidad:</strong> ${product.disponibilidad}</p>
                <p class="product-price"><strong>Precio:</strong> $${product.precio_unidad}</p>
                <button class="paddtocart" onclick="addToCart({
                    id_producto: '${product.id_producto}',
                    name: '${product.nombre_prod}',
                    tipo: '${product.tipo}',
                    medida: '${product.medidas}',
                    descripcion: '${product.dimensiones}',
                    disponibilidad: '${product.disponibilidad}',
                    precio: ${product.precio_unidad},
                    Linkimg: '${product.id_producto}.jpg'
                })">
                    Añadir al carro
                    <i class="fa-solid fa-cart-shopping" style="color: #ffffff;"></i>
                </button>  
            `;
            contentContainer.appendChild(productContainer);
        })
        .catch(error => {
            console.error('Error fetching product:', error);
        });
        const conteitemcarrusel = document.getElementById('conteitemcarrusel');
        if (conteitemcarrusel) {
            conteitemcarrusel.remove();
            resultadobusqueda.innerHTML = `<p>Resultado de su búsqueda: "${query}"</p>`;
        }
}

let cart = JSON.parse(localStorage.getItem('cart')) || [];

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function addToCart(product) {
    const existingProductIndex = cart.findIndex(p => p.id_producto === product.id_producto);

    if (existingProductIndex !== -1) {
        cart[existingProductIndex].quantity += 1;
    } else {
        product.quantity = 1;
        cart.push(product);
    }
    
    saveCart();
    updateCartDisplay();
}

function removeFromCart(productIndex) {
    cart.splice(productIndex, 1);
    saveCart();
    updateCartDisplay();
}

function updateQuantity(index, amount) {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    if (cart[index].quantity + amount > 0) {
        cart[index].quantity += amount;
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartDisplay(); // Actualiza el carrito y el contador en el menú
    }
}
function removeFromCart(index) {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    cart.splice(index, 1); // Elimina el producto del carrito
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartDisplay(); // Actualiza el carrito y el contador en el menú
}
// Función mejorada para realizar búsquedas
const performSearch = async (query) => {
    try {
        if (!query || query.trim() === '') {
            // Si la búsqueda está vacía, recargar los productos normales
            const productos = await (await fetch("/productos")).json();
            displayProducts(productos);
            return;
        }

        const response = await fetch(`/productos?q=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error('Error en la búsqueda');
        }

        const products = await response.json();
        const resultadobusqueda = document.getElementById('resultq');
        
        // Mostrar resultados de búsqueda
        if (resultadobusqueda) {
            resultadobusqueda.innerHTML = `<p>Resultado de su búsqueda: "${query}"</p>`;
            resultadobusqueda.classList.remove('resultadooculto');
        }

        // Ocultar carrusel si existe
        const conteitemcarrusel = document.getElementById('conteitemcarrusel');
        if (conteitemcarrusel) {
            conteitemcarrusel.style.display = 'none';
        }

        // Limpiar contenedores de productos
        ['itemcont1', 'itemcont2', 'itemcont3', 'itemcont4', 'itemcont5', 'itemcont6'].forEach(containerClass => {
            const container = document.querySelector(`.${containerClass}`);
            if (container) container.innerHTML = '';
        });

        // Mostrar productos encontrados
        displayProducts(products);
    } catch (error) {
        console.error('Error en la búsqueda:', error);
        const resultadobusqueda = document.getElementById('resultq');
        if (resultadobusqueda) {
            resultadobusqueda.innerHTML = `<p>Error en la búsqueda: ${error.message}</p>`;
        }
    }
    };

    // Manejador del formulario de búsqueda mejorado
    document.getElementById('search-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            await performSearch(searchInput.value.trim());
        }
    });

    // Manejadores para categorías
    document.querySelectorAll('.category-link').forEach(link => {
        link.addEventListener('click', async (event) => {
            event.preventDefault();
            const category = event.target.textContent.trim();
            await performSearch(category);
        });
    });

    // Actualizar el precio total
    if (cartTotalElement) {
        cartTotalElement.textContent = totalPrice.toFixed(2);
    }


function removeFromCart(index) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    cart.splice(index, 1); // Elimina el producto del carrito
    localStorage.setItem('cart', JSON.stringify(cart)); // Guarda el carrito actualizado
    updateCartDisplay(); // Actualiza la visualización del carrito
}
document.getElementById('cart-link').addEventListener('click', () => {
    const modal = document.getElementById('cartModal');
    modal.style.display = 'block'; // Muestra el modal
    updateCartDisplay(); // Actualiza el contenido del carrito al abrir el modal
});

document.querySelector('.close').addEventListener('click', () => {
    const modal = document.getElementById('cartModal');
    modal.style.display = 'none'; // Cierra el modal
});

function clearCart() {
    cart = [];
    saveCart();
    updateCartDisplay();
}

document.getElementById('clear-cart-btn').addEventListener('click', () => {
    localStorage.removeItem('cart');
    updateCartDisplay();
});
// Función para obtener el valor de una cookie específica
function getCookie(name) {
    const cookieString = document.cookie;
    const cookies = cookieString.split('; ').map(cookie => cookie.split('='));
    for (const [key, value] of cookies) {
        if (key === name) {
            return decodeURIComponent(value);
        }
    }
    return null;
}

async function isUserLoggedIn() {
    try {
        const response = await fetch('/api/verificar-usuario', {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Usuario no autenticado');
        }

        const data = await response.json();
        console.log('Estado de autenticación:', data);
        return data.loggedIn;
    } catch (error) {
        console.error('Error al verificar autenticación:', error);
        return false;
    }
}

document.getElementById('checkout-btn').addEventListener('click', async () => {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    console.log("Botón 'Generar pedido' presionado");

    if (cart.length === 0) {
        alert('El carrito está vacío.');
        return;
    }

    // Verificar si el usuario está autenticado
    const loggedIn = await isUserLoggedIn();
    if (!loggedIn) {
        alert('Debes iniciar sesión para generar el pedido.');
        window.location.href = '/login';
        return;
    }

    try {
        console.log('Enviando solicitud al servidor para generar el pedido...');
        // Realiza la solicitud POST al servidor
        const response = await fetch('/api/generar-pedido', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cart),
            credentials: 'include' // Envía cookies para mantener autenticación
        });

        console.log('Respuesta recibida, estado:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error en la respuesta:', errorText);
            throw new Error(`Error al generar el pedido: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Resultado del pedido:', result);

        alert(`Pedido generado con éxito. Número de pedido: ${result.id_pedido}`);

        // Limpia el carrito y actualiza la visualización
        localStorage.removeItem('cart');
        updateCartDisplay();
    } catch (error) {
        console.error('Error detallado al generar el pedido:', error);
        alert('Hubo un error al generar el pedido. Intenta de nuevo.');
    }
});


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

    const closeButton = popup.querySelector('.popup-close');
    closeButton.addEventListener('click', () => {
        document.body.removeChild(popup);
    });

    // Quitar el popup después de unos segundos
    setTimeout(() => {
        if (popup) {
            document.body.removeChild(popup);
        }
    }, 3000);
}

function addToCart(product) {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const existingProductIndex = cart.findIndex(p => p.id_producto === product.id_producto);

    if (existingProductIndex !== -1) {
        cart[existingProductIndex].quantity += 1;
    } else {
        product.quantity = 1;
        cart.push(product);
    }

    localStorage.setItem('cart', JSON.stringify(cart)); // Guarda el carrito en localStorage
    updateCartDisplay(); // Actualiza la visualización del carrito y el contador del menú
    showPopup('Producto añadido al carrito');
}


// Llama a la función cuando la página cargue
document.addEventListener('DOMContentLoaded', () => {
    fetchFeaturedProducts();
});


function checkout() {
    alert('Procediendo al pago...');
}

document.addEventListener('DOMContentLoaded', () => {
    updateCartDisplay();
    const cartLink = document.getElementById('cart-link');
    const modal = document.getElementById('cartModal');
    const span = document.getElementsByClassName('close')[0];
    var printButton = document.getElementById('printCart');
    var generateButton = document.getElementById('generateOrder');
    
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }
    printButton.onclick = function() {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        console.log("imprimiendo carrito")
        console.log(cart);
        
    }

    generateButton.onclick = async function() {
        try {
            console.log('Iniciando generación de pedido');
            const cart = JSON.parse(localStorage.getItem('cart')) || [];
            console.log('Carrito:', cart);
    
            if (cart.length === 0) {
                console.log('El carrito está vacío');
                alert('El carrito está vacío');
                return;
            }
    
            console.log('Enviando solicitud al servidor');
            const response = await fetch('/api/generar-pedido', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(cart),
                credentials: 'include'
            });
    
            console.log('Respuesta recibida, status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Respuesta no ok:', errorText);
                throw new Error(`Error al generar el pedido: ${response.status} ${errorText}`);
            }
    
            const result = await response.json();
            console.log('Resultado:', result);
    
            alert(`Pedido generado con éxito. Número de pedido: ${result.id_pedido}`);
            localStorage.removeItem('cart');
            updateCartDisplay();
        } catch (error) {
            console.error('Error detallado:', error);
            alert('Hubo un error al generar el pedido. Por favor, intenta de nuevo. Detalles: ' + error.message);
        }
    };
    if (cartLink) {
        cartLink.addEventListener('click', () => {
            modal.style.display = 'block';
        });
    }

    if (span) {
        span.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    const button = document.querySelector(".button");
    if (button) {
        button.addEventListener("click", () => {
            document.cookie = 'jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            document.location.href = "/";
        });
    } else {
        console.error("Button with class 'button' not found");
    }

    const performSearch = async (query) => {
        const response = await fetch(`/productos?q=${encodeURIComponent(query)}`);
        const products = await response.json();
        const conteitemcarrusel = document.getElementById('conteitemcarrusel');
        const resultadobusqueda = document.getElementById('resultq');
        if (resultadobusqueda) {
            resultadobusqueda.innerHTML = `<p>Resultado de su búsqueda: "${query}"</p>`;
        }
        if (conteitemcarrusel) {
            conteitemcarrusel.remove();
            resultadobusqueda.innerHTML = `<p>Resultado de su búsqueda: "${query}"</p>`;
        }
        ['itemcont1', 'itemcont2', 'itemcont3', 'itemcont4', 'itemcont5', 'itemcont6'].forEach(containerClass => {
            const container = document.querySelector(`.${containerClass}`);
            container.innerHTML = '';
        });
        displayProducts(products);
    };

    document.getElementById('search-form').addEventListener('submit', async (event) => {
        event.preventDefault(); 
        const searchInput = document.getElementById('search-input').value;
        await performSearch(searchInput);
    });
  

    const categoryLinks = document.querySelectorAll('.category-link');
    categoryLinks.forEach(link => {
        link.addEventListener('click', async (event) => {
            event.preventDefault();
            const category = event.target.textContent.trim();
            await performSearch(category);
        });
    });
    document.addEventListener('DOMContentLoaded', () => {
        updateCartDisplay(); // Actualiza la visualización del carrito cuando la página se carga
    });
    

    
    updateLoginButton();// Asegúrate de actualizar el botón después de que el DOM esté completamente cargado
});

