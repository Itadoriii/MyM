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

function displayProducts(productList, html) {
    let productsHTML = '';
    productList.forEach(element => {
        productsHTML +=
		`<div class="product-container">
		<img src=${element.imagen}/>
		<h3>${element.name}</h3>
		<h2>Precio: <h1>
		<h1>$ ${element.precio}</h2>
		<button class="button-add" onclick="add('${element.name}', ${element.precio})">Agregar</button>
		</div>`
    });
    document.getElementById(html).innerHTML = productsHTML;
}
window.onload = async () => {
    const productos = await (await fetch("/productos")).json();
    console.log(productos);
    displayProducts(productos,"conteiner")

}
