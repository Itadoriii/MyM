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

// Funciones del carrito
function getCart() {
    return JSON.parse(localStorage.getItem('cart')) || [];
}

function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function addToCart(product) {
    const cart = getCart();
    const existingProductIndex = cart.findIndex(p => p.id_producto === product.id_producto);

    if (existingProductIndex !== -1) {
        cart[existingProductIndex].quantity += 1;
    } else {
        product.quantity = 1;
        cart.push(product);
    }
    
    saveCart(cart);
    updateCartDisplay();
    showPopup('Producto añadido al carrito');
}

function updateQuantity(index, amount) {
    const cart = getCart();
    if (cart[index].quantity + amount > 0) {
        cart[index].quantity += amount;
        saveCart(cart);
        updateCartDisplay();
    }
}

function removeFromCart(index) {
    const cart = getCart();
    cart.splice(index, 1);
    saveCart(cart);
    updateCartDisplay();
}

function clearCart() {
    saveCart([]);
    updateCartDisplay();
}

function updateCartDisplay() {
    const cart = getCart();
    const cartContainer = document.querySelector('.cart-container');
    const cartTotalElement = document.getElementById('cart-total');
    const cartCountElement = document.querySelector('.cart-count');

    if (!cartContainer) {
        console.error('Cart container not found');
        return;
    }

    cartContainer.innerHTML = ''; 
    let totalPrice = 0;

    // Actualizar contador
    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
    if (cartCountElement) {
        cartCountElement.textContent = totalItems;
    }

    if (cart.length === 0) {
        cartContainer.innerHTML = '<p>El carrito está vacío.</p>';
    } else {
        cart.forEach((product, index) => {
            totalPrice += product.precio * product.quantity;

            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.innerHTML = `
                <img src="assets/productos/${product.Linkimg || product.id_producto}.jpg" alt="${product.name}">
                <div class="cart-item-info">
                    <h4>${product.name}</h4>
                    <p>Precio: $${product.precio}</p>
                </div>
                <div class="cart-quantity">
                    <button onclick="updateQuantity(${index}, -1)">-</button>
                    <span>${product.quantity}</span>
                    <button onclick="updateQuantity(${index}, 1)">+</button>
                </div>
                <button class="remove-btn" onclick="removeFromCart(${index})">Eliminar</button>
            `;
            cartContainer.appendChild(cartItem);
        });
    }

    if (cartTotalElement) {
        cartTotalElement.textContent = totalPrice.toFixed(2);
    }
}

// Funciones de productos
async function fetchProducts(url = 'https://maderasmym.cl/productos') {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Error al cargar productos');
        return await response.json();
    } catch (error) {
        console.error('Error:', error);
        return [];
    }
}

function displayProducts(products) {
    const containers = ['itemcont1', 'itemcont2', 'itemcont3', 'itemcont4', 'itemcont5', 'itemcont6'];
    products.forEach((product, index) => {
        if (containers[index]) {
            const container = document.querySelector(`.${containers[index]}`);
            if (container) {
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
        }
    });
}

function displayCard(productId) {
    fetch(`/productos/${productId}`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
        .catch(error => console.error('Error fetching product:', error));
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

async function performSearch(query) {
    const products = await fetchProducts(`/productos?q=${encodeURIComponent(query)}`);
    const resultadobusqueda = document.getElementById('resultq');
    
    if (resultadobusqueda) {
        resultadobusqueda.innerHTML = `<p>Resultado de su búsqueda: "${query}"</p>`;
    }
    
    const conteitemcarrusel = document.getElementById('conteitemcarrusel');
    if (conteitemcarrusel) {
        conteitemcarrusel.remove();
    }
    
    ['itemcont1', 'itemcont2', 'itemcont3', 'itemcont4', 'itemcont5', 'itemcont6'].forEach(containerClass => {
        const container = document.querySelector(`.${containerClass}`);
        if (container) container.innerHTML = '';
    });
    
    displayProducts(products);
}

// Inicialización
window.onload = async () => {
    const productos = await fetchProducts();
    displayProducts(productos);
    updateCartDisplay();
    updateLoginButton();
};

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('cartModal');
    const openBtn = document.getElementById('cart-link');
    const closeBtn = modal?.querySelector('.close');
    const clearCartButton = document.getElementById('clear-cart-btn');
    const generateOrderButton = document.getElementById('generateOrder');

    function openModal(e) {
        if (e) e.preventDefault();
        modal?.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        updateCartDisplay();
    }
    function closeModal() {
        modal?.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    openBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    clearCartButton?.addEventListener('click', (e) => {
        e.preventDefault();
        clearCart();
    });

    generateOrderButton?.addEventListener('click', async (e) => {
        e.preventDefault();
        await generateOrder(closeModal);
    });
    

  // ---- Búsqueda ----
  const searchForm  = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  searchForm?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = searchInput?.value || '';
    if (typeof performSearch === 'function') await performSearch(q);
  });

  // ---- Categorías ----
  document.querySelectorAll('.category-link').forEach(link => {
    link.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const q = ev.target.textContent.trim();
      if (typeof performSearch === 'function') await performSearch(q);
    });
  });

  // ---- Logout (si existe ese botón) ----
  const logoutButton = document.getElementById('logout-btn');
  logoutButton?.addEventListener('click', () => {
    document.cookie = 'jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.location.href = '/';
  });
});