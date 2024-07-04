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
    const containers = ['itemcont1', 'itemcont2', 'itemcont3'];
    products.forEach((product, index) => {
        if (containers[index]) {
            const container = document.querySelector(`.${containers[index]}`);
            container.innerHTML = `
                <div class="product">
                    <img src="${product.Linkimg}" alt="${product.name}" class="product-img">
                    <h2 class="product-name">${product.name}</h2>
                    <p class="product-tipo">${product.tipo}</p>
                    <p class="product-medida">${product.medida}</p>
                    <p class="product-description">${product.descripcion}</p>
                    <p class="product-price">$${product.precio}</p>
                    <button class="addtocart" onclick='addToCart({
                        "name": "${product.name}",
                        "tipo": "${product.tipo}",
                        "medida": "${product.medida}",
                        "descripcion": "${product.descripcion}",
                        "precio": ${product.precio},
                        "Linkimg": "${product.Linkimg}"
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
    const existingProductIndex = cart.findIndex(p => p.name === product.name);

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
                    <img src="${product.Linkimg}" alt="${product.name}" class="cart-product-img">
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
