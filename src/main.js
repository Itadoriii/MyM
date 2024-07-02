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
            <a href="#">Añadir al carro
                <i class="fa-solid fa-cart-shopping" style="color: #ffffff;"></i>
            </a>
          </div>
        `;
      }
    });
  }
window.onload = async () => {
    const productos = await (await fetch("/productos")).json();
    console.log(productos);
    displayProducts(productos)

}
