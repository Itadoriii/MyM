(function(){
    const listElements = document.querySelectorAll('.menu__item--show');
    const list = document.querySelector('.menu__links');
    const menu = document.querySelector('.menu__hamburguer');

    const addClick = ()=>{
        listElements.forEach(element =>{
            element.addEventListener('click', ()=>{
                let subMenu = element.children[1];
                let height = 0;
                element.classList.toggle('menu__item--active');

                if(subMenu.clientHeight === 0){
                    height = subMenu.scrollHeight;
                }

                subMenu.style.height = `${height}px`;
            });
        });
    }

    const deleteStyleHeight = ()=>{
        listElements.forEach(element=>{
            if(element.children[1].getAttribute('style')){
                element.children[1].removeAttribute('style');
                element.classList.remove('menu__item--active');
            }
        });
    }

    window.addEventListener('resize', ()=>{
        if(window.innerWidth > 800){
            deleteStyleHeight();
            if(list.classList.contains('menu__links--show'))
                list.classList.remove('menu__links--show');
        }else{
            addClick();
        }
    });

    if(window.innerWidth <= 800){
        addClick();
    }

    menu.addEventListener('click', ()=> list.classList.toggle('menu__links--show'));
})();

function displayProducts(products) {
    const containers = ['itemcont1', 'itemcont2', 'itemcont3', 'itemcont4','itemcont5','itemcont6'];
    products.forEach((product, index) => {
        if (containers[index]) {
            const container = document.querySelector(`.${containers[index]}`);
            container.innerHTML = `
                <div class="product">
                    <img src="assets/productos/1.jpg" alt="${product.nombre_prod}" class="product-img">
                    <h2 class="product-name">${product.nombre_prod}</h2>
                    <p class="product-tipo">${product.tipo}</p>
                    <p class="product-medida">${product.medidas}</p>
                    <p class="product-description">${product.dimensiones}</p>
                    <p class="product-price">$${product.precio_unidad}</p>
                    <button class="addtocart" onclick='addToCart({
                        "id_producto": "${product.id_producto}",
                        "name": "${product.nombre_prod}",
                        "tipo": "${product.tipo}",
                        "medida": "${product.medidas}",
                        "descripcion": "${product.dimensiones}",
                        "precio": ${product.precio_unidad},
                        "Linkimg": "${product.id_producto}.jpg"
                    })'>
                        Añadir al carro
                        <i class="fa-solid fa-cart-shopping" style="color: #ffffff;"></i>
                    </button>  
                </div>
            `;
        }
    });
}


window.onload = async () => {
    const productos = await (await fetch("/productos")).json();
    console.log(productos);
    displayProducts(productos);
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

function updateQuantity(index, quantity) {
    cart[index].quantity += quantity;
    if (cart[index].quantity < 1) {
        cart[index].quantity = 1;
    }
    saveCart();
    updateCartDisplay();
}


function updateCartDisplay() {
    const cartCount = document.querySelector('.cart-count');
    if (cartCount) {
        cartCount.textContent = cart.length;
    }

    const cartContainer = document.querySelector('#cartModal .cart-container');
    if (cartContainer) {
        cartContainer.innerHTML = ''; // Limpiar el contenido anterior
        let totalPrice = 0; // Inicializar el precio total

        cart.forEach((product, index) => {
            totalPrice += product.precio * product.quantity; // Calcular el precio total

            const productElement = document.createElement('div');
            productElement.className = 'cart-item';
            productElement.innerHTML = `
                <div class="cart-product">
                    <img src="assets/productos/1.jpg" alt="${product.name}" class="cart-product-img">
                    <h2 class="cart-product-name">${product.name}</h2>
                    <p class="cart-product-tipo">${product.tipo}</p>
                    <p class="cart-product-medida">${product.medida}</p>
                    <p class="cart-product-description">${product.descripcion}</p>
                    <p class="cart-product-price">$${product.precio}</p>
                    <div class="cartcant-container">
                        <button class="decrement" onclick="updateQuantity(${index}, -1)">-</button>
                        <span class="cartcant">${product.quantity}</span>
                        <button class="increment" onclick="updateQuantity(${index}, 1)">+</button>
                    </div>
                    <button class="cartelimin" onclick="removeFromCart(${index})">Eliminar</button>
                </div>
            `;
            cartContainer.appendChild(productElement);
        });

        // Mostrar el precio total
        const totalPriceElement = document.createElement('div');
        totalPriceElement.className = 'cart-total';
        totalPriceElement.innerHTML = `<h3>Total: $${totalPrice.toFixed(2)}</h3>`;
        cartContainer.appendChild(totalPriceElement);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    updateCartDisplay();

    const cartLink = document.getElementById('cart-link');
    const modal = document.getElementById('cartModal');
    const span = document.getElementsByClassName('close')[0];

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
});

document.addEventListener('DOMContentLoaded', (event) => {
    const performSearch = async (query) => {
        const response = await fetch(`/productos?q=${encodeURIComponent(query)}`);
        const products = await response.json();
        // Elimina el contenido del contenedor 'conteitemcarrusel'
        const conteitemcarrusel = document.getElementById('conteitemcarrusel');
        
        // Actualiza el texto del resultado de búsqueda
        const resultadobusqueda = document.getElementById('resultq');
        if (resultadobusqueda) {
            resultadobusqueda.innerHTML = `<p>Resultado de su búsqueda: "${query}"</p>`;
        }
        if (conteitemcarrusel) {
            conteitemcarrusel.remove()
            resultadobusqueda.innerHTML = `<p>Resultado de su búsqueda: "${query}"</p>`;
            console.log('Contenido de conteitemcarrusel eliminado');
        } else {
            console.log('Elemento conteitemcarrusel no encontrado');
        }
        // Limpia los contenedores anteriores
        ['itemcont1', 'itemcont2', 'itemcont3', 'itemcont4', 'itemcont5', 'itemcont6'].forEach(containerClass => {
            const container = document.querySelector(`.${containerClass}`);
            container.innerHTML = '';
        });
        // Muestra los nuevos productos
        displayProducts(products);
    };

    document.getElementById('search-form').addEventListener('submit', async (event) => {
        event.preventDefault(); // Evita el comportamiento por defecto del formulario
        const searchInput = document.getElementById('search-input').value;
        await performSearch(searchInput);
    });

    // Añadir manejadores de clics a los enlaces de la barra lateral
    const categoryLinks = document.querySelectorAll('.category-link');
    categoryLinks.forEach(link => {
        link.addEventListener('click', async (event) => {
            event.preventDefault();
            const category = event.target.textContent.trim();
            await performSearch(category);
        });
    });
});
