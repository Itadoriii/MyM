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

    const toggle = document.querySelector(".toggle");
    const menuDashboard = document.querySelector(".menu-dashboard");
    const iconoMenu = toggle.querySelector("i");
    const enlacesMenu = document.querySelectorAll(".enlace");
    const mainContent = document.getElementById("main-content");

    toggle.addEventListener("click", () => {
        menuDashboard.classList.toggle("open");

        if (iconoMenu.classList.contains("bx-menu")) {
            iconoMenu.classList.replace("bx-menu", "bx-x");
        } else {
            iconoMenu.classList.replace("bx-x", "bx-menu");
        }
    });

    // Mostrar los productos automáticamente al cargar la página
    fetchProductos();

    enlacesMenu.forEach(enlace => {
        enlace.addEventListener("click", () => {
            const content = enlace.getAttribute("data-content");
            loadContent(content);
        });
    });

    function loadContent(content) {
        switch(content) {
            case 'usuarios':
                fetchUsuarios();
                break;
            case 'productos':
                fetchProductos();
                break;
            case 'pedidos':
                fetchPedidos();
                break;
            default:
                mainContent.innerHTML = '<h1>Bienvenido</h1><p>Seleccione una opción del menú.</p>';
        }
    }

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
        const existingProductIndex = cart.findIndex(p => p.id_producto === product.id_producto);
    
        if (existingProductIndex !== -1) {
            cart[existingProductIndex].quantity += 1;
        } else {
            product.quantity = 1;
            cart.push(product);
        }
    
        saveCart();
        updateCartDisplay();
        showPopup('Producto añadido al carrito');
    }
    
    async function fetchUsuarios() {
        try {
          const response = await fetch('/api/usuarios');
          const usuarios = await response.json();
          console.log('Respuesta recibida:', usuarios);
          console.log('Número de usuarios:', usuarios.length);
          
          if (!Array.isArray(usuarios)) {
            console.error('La respuesta no es un array:', usuarios);
            mainContent.innerHTML = '<p>Error: La respuesta no tiene el formato esperado.</p>';
            return;
          }
          
          mainContent.innerHTML = `
            <h1>Usuarios</h1>
            <p>Total de usuarios: ${usuarios.length}</p>
            <ul>${usuarios.map(usuario => `<li>${usuario.user} - ${usuario.email}</li>`).join('')}</ul>
          `;
        } catch (error) {
          console.error('Error fetching usuarios:', error);
          mainContent.innerHTML = '<p>Error loading usuarios.</p>';
        }
      }
      // Obtener lista de pedidos
      async function fetchPedidos() {
        try {
            const response = await fetch('/api/pedidos');
            const pedidos = await response.json();

            let html = '<h1>Pedidos</h1>';
            if (pedidos.length === 0) {
                html += '<p>No hay pedidos registrados.</p>';
            } else {
                html += '<table border="1">';
                html += `
                    <tr>
                        <th>ID Pedido</th>
                        <th>Usuario</th>
                        <th>Email</th>
                        <th>Precio Total</th>
                        <th>Fecha Pedido</th>
                        <th>Estado</th>
                        <th>Detalles</th>
                        <th>Acciones</th>
                    </tr>`;

                pedidos.forEach(pedido => {
                    html += `
                        <tr>
                            <td>${pedido.id_pedido}</td>
                            <td>${pedido.user}</td>
                            <td>${pedido.email}</td>
                            <td>$${pedido.precio_total.toFixed(2)}</td>
                            <td>${pedido.fecha_pedido}</td>
                            <td>${pedido.estado}</td>
                            <td>
                                <ul>
                    `;

                    // Mostrar cada detalle del pedido
                    pedido.detalles.forEach(detalle => {
                        html += `
                            <li>
                                Producto: ${detalle.nombre_prod} - 
                                Cantidad: ${detalle.cantidad} - 
                                Precio Detalle: $${detalle.precio_detalle.toFixed(2)}
                            </li>`;
                    });

                    html += `
                                </ul>
                            </td>
                            <td>
                                <button onclick="aceptarPedido(${pedido.id_pedido})">Aceptar</button>
                                <button onclick="rechazarPedido(${pedido.id_pedido})">Rechazar</button>
                            </td>
                        </tr>`;
                });

                html += '</table>';
            }

            mainContent.innerHTML = html;
        } catch (error) {
            console.error('Error al cargar los pedidos:', error);
            mainContent.innerHTML = '<p>Error al cargar los pedidos.</p>';
        }
    }
    
    // Asegúrate de que estas funciones estén definidas al nivel superior
    async function aceptarPedido(idPedido) {
        try {
            const response = await fetch(`/api/pedidos/${idPedido}/aceptar`, {
                method: 'PUT'
            });
            if (response.ok) {
                alert('Pedido aceptado con éxito');
                fetchPedidos(); // Recargar la lista de pedidos después de la acción
            } else {
                alert('Error al aceptar el pedido');
            }
        } catch (error) {
            console.error('Error al aceptar el pedido:', error);
            alert('Hubo un error al aceptar el pedido');
        }
    }

    async function rechazarPedido(idPedido) {
        try {
            const response = await fetch(`/api/pedidos/${idPedido}/rechazar`, {
                method: 'PUT'
            });
            if (response.ok) {
                alert('Pedido rechazado con éxito');
                fetchPedidos(); // Recargar la lista de pedidos después de la acción
            } else {
                alert('Error al rechazar el pedido');
            }
        } catch (error) {
            console.error('Error al rechazar el pedido:', error);
            alert('Hubo un error al rechazar el pedido');
        }
    }

    // Asignar las funciones al objeto global `window`
    window.aceptarPedido = aceptarPedido;
    window.rechazarPedido = rechazarPedido;



      async function fetchProductos() {
    try {
        const response = await fetch('/productos');
        const productos = await response.json();
        console.log(productos);
        if (Array.isArray(productos)) {
            mainContent.innerHTML = `
                <input type="text" id="search-input" placeholder="Buscar producto..." style="width: 100%; padding: 10px; margin-bottom: 20px;">
                <button class="buttonenlace" id="crearProductoBtn">Crear nuevo producto</button>

                <h1 class="titulotable">Productos Actuales:</h1>
                <div class="table-container" style="max-height: 400px; overflow-y: scroll;">
                    <table>
                        <thead>
                            <tr>
                                <th>ID Producto</th>
                                <th>Nombre</th>
                                <th>Precio Unidad</th>
                                <th>Disponibilidad</th>
                                <th>Tipo</th>
                                <th>Medidas</th>
                                <th>Dimensiones</th>
                                <th>Fecha Añadido</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="productos-tbody">
                            ${productos.map(producto => `
                                <tr>
                                    <td>${producto.id_producto}</td>
                                    <td>${producto.nombre_prod}</td>
                                    <td>${producto.precio_unidad}</td>
                                    <td>${producto.disponibilidad}</td>
                                    <td>${producto.tipo}</td>
                                    <td>${producto.medidas}</td>
                                    <td>${producto.dimensiones}</td>
                                    <td>${producto.fecha_add}</td>
                                    <td>
                                        <button class="editBtn" data-id="${producto.id_producto}">Editar</button>
                                        <button class="deleteBtn" data-id="${producto.id_producto}">Eliminar</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            // Agregar event listeners a los botones de editar
            document.querySelectorAll('.editBtn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const productId = e.target.getAttribute('data-id');
                    await editProduct(productId);
                });
            });

            // Agregar event listeners a los botones de eliminar
            document.querySelectorAll('.deleteBtn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const productId = e.target.getAttribute('data-id');
                    await deleteProduct(productId);
                });
            });

            // Resto del código de búsqueda...
            const searchInput = document.getElementById('search-input');
            searchInput.addEventListener('input', function() {
                const searchValue = searchInput.value.toLowerCase();
                const filteredProducts = productos.filter(producto =>
                    producto.nombre_prod.toLowerCase().includes(searchValue)
                );
                renderProductos(filteredProducts);
            });

            document.getElementById('crearProductoBtn').addEventListener('click', () => {
                showProductForm();
            });

            function renderProductos(productos) {
                const tbody = document.getElementById('productos-tbody');
                tbody.innerHTML = productos.map(producto => `
                    <tr>
                        <td>${producto.id_producto}</td>
                        <td>${producto.nombre_prod}</td>
                        <td>${producto.precio_unidad}</td>
                        <td>${producto.disponibilidad}</td>
                        <td>${producto.tipo}</td>
                        <td>${producto.medidas}</td>
                        <td>${producto.dimensiones}</td>
                        <td>${producto.fecha_add}</td>
                        <td>
                            <button class="editBtn" data-id="${producto.id_producto}">Editar</button>
                            <button class="deleteBtn" data-id="${producto.id_producto}">Eliminar</button>
                        </td>
                    </tr>
                `).join('');

                // Volver a agregar los event listeners después de renderizar
                document.querySelectorAll('.editBtn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const productId = e.target.getAttribute('data-id');
                        await editProduct(productId);
                    });
                });

                document.querySelectorAll('.deleteBtn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const productId = e.target.getAttribute('data-id');
                        await deleteProduct(productId);
                    });
                });
            }

            renderProductos(productos);
        } else {
            mainContent.innerHTML = '<p>No se encontraron productos.</p>';
        }
    } catch (error) {
        console.error('Error fetching productos:', error);
        mainContent.innerHTML = '<p>Error loading productos.</p>';
    }
}
    async function editProduct(productId) {
    try {
        // Obtener los datos del producto
        const response = await fetch(`/productos/${productId}`);
        if (!response.ok) {
            throw new Error('Error al obtener el producto');
        }
        const product = await response.json();
        
        // Mostrar el formulario de edición
        showProductForm(product);
    } catch (error) {
        console.error('Error al editar producto:', error);
        showPopup('Error al cargar el producto para editar: ' + error.message);
    }
}
async function deleteProduct(productId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este producto?')) {
        return;
    }

    try {
        const response = await fetch(`/api/productos/${productId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showPopup('Producto eliminado con éxito');
            fetchProductos(); // Recargar la lista de productos
        } else {
            const errorData = await response.json();
            console.error('Error al eliminar producto:', errorData);
            showPopup('Error al eliminar el producto');
        }
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        showPopup('Error al eliminar el producto');
    }
}

function showProductForm(product = null) {
    const isEditing = !!product;
    mainContent.innerHTML = `
        <h1>${isEditing ? 'Editar' : 'Crear Nuevo'} Producto</h1>
        <form id="productoForm">
            ${isEditing ? `<input type="hidden" id="id_producto" name="id_producto" value="${product.id_producto}">` : ''}
            <div class="form-group">
                <label for="nombre_prod">Nombre:</label>
                <input type="text" id="nombre_prod" name="nombre_prod" value="${isEditing ? product.nombre_prod : ''}" required>
            </div>
            <div class="form-group">
                <label for="precio_unidad">Precio Unidad:</label>
                <input type="number" id="precio_unidad" name="precio_unidad" step="0.01" value="${isEditing ? product.precio_unidad : ''}" required>
            </div>
            <div class="form-group">
                <label for="disponibilidad">Disponibilidad:</label>
                <input type="number" id="disponibilidad" name="disponibilidad" value="${isEditing ? product.disponibilidad : ''}" required>
            </div>
            <div class="form-group">
                <label for="tipo">Tipo:</label>
                <input type="text" id="tipo" name="tipo" value="${isEditing ? product.tipo : ''}" required>
            </div>
            <div class="form-group">
                <label for="medidas">Medidas:</label>
                <input type="text" id="medidas" name="medidas" value="${isEditing ? product.medidas : ''}" required>
            </div>
            <div class="form-group">
                <label for="dimensiones">Dimensiones:</label>
                <input type="text" id="dimensiones" name="dimensiones" value="${isEditing ? product.dimensiones : ''}" required>
            </div>
            <div class="form-group">
                <label for="fecha_add">Fecha Añadido:</label>
                <input type="date" id="fecha_add" name="fecha_add" value="${isEditing ? product.fecha_add.split('T')[0] : ''}" required>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">${isEditing ? 'Guardar Cambios' : 'Crear Producto'}</button>
                <button type="button" class="btn btn-secondary" onclick="fetchProductos()">Cancelar</button>
            </div>
        </form>
    `;

    document.getElementById('productoForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const productoData = Object.fromEntries(formData.entries());

        try {
            const url = isEditing ? `/api/productos/${productoData.id_producto}` : '/api/productos';
            const method = isEditing ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(productoData)
            });

            const result = await response.json();
            console.log('Server response:', result);

            if (response.ok) {
                showPopup(isEditing ? 'Producto actualizado con éxito' : 'Producto creado con éxito');
                fetchProductos(); // Recargar la lista de productos
            } else {
                console.error('Error saving producto:', result);
                showPopup(`Error: ${result.message || 'Error al guardar el producto'}`);
            }
        } catch (error) {
            console.error('Error saving producto:', error);
            showPopup('Error al guardar el producto');
        }
    });
}

    
});
