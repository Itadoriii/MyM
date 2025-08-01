// Evita cualquier envío de formulario accidental
document.addEventListener('submit', e => {
  e.preventDefault();
  e.stopImmediatePropagation();
});



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
            case 'trabajadores':
                fetchTrabajadores();
                break;
            case 'adelantos':
                fetchAdelantos();
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
            <ul>${usuarios.map(usuario => `<li>${usuario.user} - ${usuario.email} - ${usuario.number || 'No disponible'}</li>`).join('')}</ul>
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
                        <th>Número</th>
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
                            <td>${pedido.number || 'No disponible'}</td>
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
                            <button 
                                type="button" 
                                class="btn-aceptar" 
                                data-id="${pedido.id_pedido}"
                            >
                                Aceptar
                            </button>
                            <button 
                                type="button" 
                                class="btn-rechazar" 
                                data-id="${pedido.id_pedido}"
                            >
                                Rechazar
                            </button>
                            </td>



                        </tr>`;
                });

                html += '</table>';
            }

            mainContent.innerHTML = html;

            // prevenimos el submit y lanzamos tu función
            document.querySelectorAll('.btn-aceptar').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();                        // <-- aquí detienes el POST/PUT a /profile
                const id = btn.dataset.id;
                aceptarPedido(id);                         // llama a tu fetch al API correcto
            });
            });

            document.querySelectorAll('.btn-rechazar').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                const id = btn.dataset.id;
                rechazarPedido(id);
            });
            });

        } catch (error) {
            console.error('Error al cargar los pedidos:', error);
            mainContent.innerHTML = '<p>Error al cargar los pedidos.</p>';
        }
    }
    
    // Asegúrate de que estas funciones estén definidas al nivel superior
    /*async function aceptarPedido(idPedido) {
    try {
        const res = await fetch(
        `/api/pedidos/${idPedido}/confirmar-mail`, // endpoint exacto
        {
            method: 'PUT',
            credentials: 'same-origin'
        }
        );
        if (res.ok) {
        const data = await res.json();
        alert(data.message);
        fetchPedidos();
        } else {
        const txt = await res.text();
        console.error('Error en respuesta:', txt);
        alert('Error al aceptar el pedido: ' + res.statusText);
        }
    } catch (err) {
        console.error('Fetch error:', err);
        alert('Error de conexión al aceptar el pedido.');
    }
    }*/



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

    async function aceptarPedido(idPedido) {
        try {
            const response = await fetch(`/api/pedidos/${idPedido}/confirmar-mail`, {
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



async function fetchTrabajadores() {
    try {
        const response = await fetch('/api/trabajadores');
        const trabajadores = await response.json();
        
        if (!Array.isArray(trabajadores)) {
            console.error('La respuesta no es un array:', trabajadores);
            mainContent.innerHTML = '<p>Error: La respuesta no tiene el formato esperado.</p>';
            return;
        }

        mainContent.innerHTML = `
            <input type="text" id="search-input" placeholder="Buscar trabajador..." style="width: 100%; padding: 10px; margin-bottom: 20px;">
            <button class="buttonenlace" id="crearTrabajadorBtn">Agregar nuevo trabajador</button>

            <h1 class="titulotable">Trabajadores Actuales:</h1>
            <div class="table-container" style="max-height: 400px; overflow-y: scroll;">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>RUT</th>
                            <th>Nombres</th>
                            <th>Apellidos</th>
                            <th>F. Ingreso</th>
                            <th>Sueldo</th>
                            <th>Teléfono</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="trabajadores-tbody">
                        ${trabajadores.map(trabajador => `
                            <tr>
                                <td>${trabajador.id_trabajador}</td>
                                <td>${trabajador.rut}</td>
                                <td>${trabajador.nombres}</td>
                                <td>${trabajador.apellidos}</td>
                                <td>${trabajador.fechaIngreso}</td>
                                <td>$${trabajador.sueldo.toLocaleString()}</td>
                                <td>${trabajador.fono}</td>
                                <td class="${trabajador.estado}">${trabajador.estado === 'activo' ? 'Activo' : 'Inactivo'}</td>
                                <td>
                                    <button class="editBtn" data-id="${trabajador.id_trabajador}">Editar</button>
                                    <button class="deleteBtn" data-id="${trabajador.id_trabajador}">Eliminar</button>
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
                const trabajadorId = e.target.getAttribute('data-id');
                await editTrabajador(trabajadorId);
            });
        });

        // Agregar event listeners a los botones de eliminar
        document.querySelectorAll('.deleteBtn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const trabajadorId = e.target.getAttribute('data-id');
                await deleteTrabajador(trabajadorId);
            });
        });

        // Búsqueda en tiempo real
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', function() {
            const searchValue = searchInput.value.toLowerCase();
            const filteredTrabajadores = trabajadores.filter(trabajador =>
                trabajador.nombres.toLowerCase().includes(searchValue) ||
                trabajador.apellidos.toLowerCase().includes(searchValue) ||
                trabajador.rut.toLowerCase().includes(searchValue)
            );
            renderTrabajadores(filteredTrabajadores);
        });

        document.getElementById('crearTrabajadorBtn').addEventListener('click', () => {
            showTrabajadorForm();
        });

        function renderTrabajadores(trabajadores) {
            const tbody = document.getElementById('trabajadores-tbody');
            tbody.innerHTML = trabajadores.map(trabajador => `
                <tr>
                    <td>${trabajador.id_trabajador}</td>
                    <td>${trabajador.rut}</td>
                    <td>${trabajador.nombres}</td>
                    <td>${trabajador.apellidos}</td>
                    <td>${trabajador.fechaIngreso}</td>
                    <td>$${trabajador.sueldo.toLocaleString()}</td>
                    <td>${trabajador.fono}</td>
                    <td class="${trabajador.estado}">${trabajador.estado === 'activo' ? 'Activo' : 'Inactivo'}</td>
                    <td>
                        <button class="editBtn" data-id="${trabajador.id_trabajador}">Editar</button>
                        <button class="deleteBtn" data-id="${trabajador.id_trabajador}">Eliminar</button>
                    </td>
                </tr>
            `).join('');

            // Volver a agregar los event listeners después de renderizar 
            document.querySelectorAll('.editBtn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const trabajadorId = e.target.getAttribute('data-id');
                    await editTrabajador(trabajadorId);
                });
            });

            document.querySelectorAll('.deleteBtn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const trabajadorId = e.target.getAttribute('data-id');
                    await deleteTrabajador(trabajadorId);
                });
            });
        }

        renderTrabajadores(trabajadores);
    } catch (error) {
        console.error('Error fetching trabajadores:', error);
        mainContent.innerHTML = '<p>Error al cargar los trabajadores.</p>';
    }
}

async function editTrabajador(trabajadorId) {
    try {
        const response = await fetch(`/api/trabajadores/${trabajadorId}`);
        if (!response.ok) {
            throw new Error('Error al obtener el trabajador');
        }
        const trabajador = await response.json();
        showTrabajadorForm(trabajador);
    } catch (error) {
        console.error('Error al editar trabajador:', error);
        showPopup('Error al cargar el trabajador para editar: ' + error.message);
    }
}

async function deleteTrabajador(trabajadorId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este trabajador?')) {
        return;
    }

    try {
        const response = await fetch(`/api/trabajadores/${trabajadorId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showPopup('Trabajador eliminado con éxito');
            fetchTrabajadores();
        } else {
            const errorData = await response.json();
            console.error('Error al eliminar trabajador:', errorData);
            showPopup('Error al eliminar el trabajador');
        }
    } catch (error) {
        console.error('Error al eliminar trabajador:', error);
        showPopup('Error al eliminar el trabajador');
    }
}

function showTrabajadorForm(trabajador = null) {
    const isEditing = !!trabajador;
    mainContent.innerHTML = `
        <h1>${isEditing ? 'Editar' : 'Agregar Nuevo'} Trabajador</h1>
        <form id="trabajadorForm">
            ${isEditing ? `<input type="hidden" id="id_trabajador" name="id_trabajador" value="${trabajador.id_trabajador}">` : ''}
            <div class="form-group">
                <label for="rut">RUT:</label>
                <input type="text" id="rut" name="rut" value="${isEditing ? trabajador.rut : ''}" required>
            </div>
            <div class="form-group">
                <label for="nombres">Nombres:</label>
                <input type="text" id="nombres" name="nombres" value="${isEditing ? trabajador.nombres : ''}" required>
            </div>
            <div class="form-group">
                <label for="apellidos">Apellidos:</label>
                <input type="text" id="apellidos" name="apellidos" value="${isEditing ? trabajador.apellidos : ''}" required>
            </div>
            <div class="form-group">
                <label for="fechaIngreso">Fecha Ingreso:</label>
                <input type="date" id="fechaIngreso" name="fechaIngreso" value="${isEditing ? trabajador.fechaIngreso : ''}" required>
            </div>
            <div class="form-group">
                <label for="sueldo">Sueldo:</label>
                <input type="number" id="sueldo" name="sueldo" step="1000" value="${isEditing ? trabajador.sueldo : ''}" required>
            </div>
            <div class="form-group">
                <label for="fono">Teléfono:</label>
                <input type="tel" id="fono" name="fono" value="${isEditing ? trabajador.fono : ''}" required>
            </div>
            <div class="form-group">
                <label for="estado">Estado:</label>
                <select id="estado" name="estado" required>
                    <option value="Y" ${isEditing && trabajador.estado === 'Y' ? 'selected' : ''}>Y</option>
                    <option value="N" ${isEditing && trabajador.estado === 'N' ? 'selected' : ''}>N</option>
                </select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">${isEditing ? 'Guardar Cambios' : 'Agregar Trabajador'}</button>
                
            </div>
        </form>
    `;

    document.getElementById('trabajadorForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const trabajadorData = Object.fromEntries(formData.entries());

        try {
            const url = isEditing ? `/api/trabajadores/${trabajadorData.id_trabajador}` : '/api/trabajadores';
            const method = isEditing ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(trabajadorData)
            });

            const result = await response.json();

            if (response.ok) {
                showPopup(isEditing ? 'Trabajador actualizado con éxito' : 'Trabajador agregado con éxito');
                fetchTrabajadores();
            } else {
                console.error('Error saving trabajador:', result);
                showPopup(`Error: ${result.message || 'Error al guardar el trabajador'}`);
            }
        } catch (error) {
            console.error('Error saving trabajador:', error);
            showPopup('Error al guardar el trabajador');
        }
    });
}


let currentPage = 1;
const pageSize = 50;


async function fetchAdelantos(page = 1) {
    try {
        mainContent.innerHTML = `<p>Cargando adelantos...</p>`;

        // Obtener trabajadores para el filtro
        const trabajadoresResponse = await fetch('/api/trabajadores');
        const trabajadores = await trabajadoresResponse.json();

        // Obtener adelantos con paginación
        const adelantosResponse = await fetch(`/api/adelantos?page=${page}&limit=${pageSize}`);
        const { adelantos, total } = await adelantosResponse.json();

        renderAdelantosTable(adelantos, trabajadores, total, page);

    } catch (error) {
        console.error('Error al cargar adelantos:', error);
        mainContent.innerHTML = `<p>Error al cargar los adelantos.</p>`;
    }
}

function renderAdelantosTable(adelantos, trabajadores, total, page) {
    mainContent.innerHTML = `
    <h1 class="titulotable">Adelantos</h1>

    <!-- Filtros -->
    <div class="filters" style="margin-bottom: 1rem;">
        <button id="nuevoAdelantoBtn" style="padding: 0.5rem 1rem; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
        + Nuevo Adelanto
        </button>
        <select id="filtroTrabajador">
            <option value="">Todos los trabajadores</option>
            ${trabajadores.map(t => 
                `<option value="${t.id_trabajador}">${t.id_trabajador}.- ${t.nombres} ${t.apellidos}</option>`
            ).join('')}
        </select>
        
        <select id="filtroMes">
            <option value="">Todos los meses</option>
            <option value="1">Enero</option>
            <option value="2">Febrero</option>
            <option value="3">Marzo</option>
            <option value="4">Abril</option>
            <option value="5">Mayo</option>
            <option value="6">Junio</option>
            <option value="7">Julio</option>
            <option value="8">Agosto</option>
            <option value="9">Septiembre</option>
            <option value="10">Octubre</option>
            <option value="11">Noviembre</option>
            <option value="12">Diciembre</option>
        </select>
        
        <input type="number" id="filtroAnio" placeholder="Año" style="width: 80px;" />
        <button id="buscarBtn">Buscar</button>
        <button id="resetBtn">Resetear</button>
    </div>

    <!-- Resultados del filtro -->
    <div id="resultados-filtro" style="margin: 1rem 0; font-weight: bold;"></div>

    <!-- Tabla de resultados -->
    <div class="table-container" style="margin-top: 1rem; max-height: 500px; overflow-y: auto;">
        <table>
            <thead>
                <tr>
                    <th>Acciones</th>
                    <th>Correlativo</th>
                    <th>Empleado</th>
                    <th>Fecha</th>
                    <th>Motivos</th>
                    <th>Anticipo</th>
                    <th>Bono</th>
                </tr>
            </thead>
            <tbody id="adelantos-tbody"></tbody>
            <tfoot>
                <tr>
                    <td colspan="5" style="text-align: right;"><strong>Totales</strong></td>
                    <td><strong id="total-anticipos">$ 0</strong></td>
                    <td><strong id="total-bonos">$ 0</strong></td>
                </tr>
            </tfoot>
        </table>
    </div>
    
    <div id="pagination-controls" class="pagination"></div>
`;

    // Renderizar los datos iniciales
    renderAdelantosData(adelantos);
    renderPaginationControls(total, page);

    // Eventos
    document.getElementById('buscarBtn').addEventListener('click', async () => {
        const trabajadorId = document.getElementById('filtroTrabajador').value;
        const mes = document.getElementById('filtroMes').value;
        const anio = document.getElementById('filtroAnio').value;
        
        // Construir URL de filtro
        let url = `/api/adelantos?page=1&limit=${pageSize}`;
        
        if (trabajadorId) url += `&trabajador=${trabajadorId}`;
        if (mes) url += `&mes=${mes}`;
        if (anio) url += `&año=${anio}`;

        try {
            const response = await fetch(url);
            const { adelantos, total } = await response.json();
            
            renderAdelantosData(adelantos);
            renderPaginationControls(total, 1);
            
            // Mostrar información del filtro
            if (trabajadorId) {
                const trabajador = trabajadores.find(t => t.id_trabajador == trabajadorId);
                document.getElementById('resultados-filtro').textContent = 
                    `Resultados para: ${trabajador.id_trabajador}.- ${trabajador.nombres} ${trabajador.apellidos}`;
            } else {
                document.getElementById('resultados-filtro').textContent = 'Todos los trabajadores';
            }
        } catch (error) {
            console.error('Error al filtrar adelantos:', error);
            showPopup('Error al aplicar los filtros');
        }
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        document.getElementById('filtroTrabajador').value = '';
        document.getElementById('filtroMes').value = '';
        document.getElementById('filtroAnio').value = '';
        document.getElementById('resultados-filtro').textContent = '';
        fetchAdelantos(1);
    });
    document.getElementById('nuevoAdelantoBtn').addEventListener('click', () => {
    showAdelantoForm(); // Esta función ya está definida para mostrar el formulario
    });

}

function renderAdelantosData(adelantos) {
    const tbody = document.getElementById('adelantos-tbody');
    tbody.innerHTML = '';
    
    let totalAnticipos = 0;
    let totalBonos = 0;

    adelantos.forEach(adelanto => {
        // Formatear los motivos con saltos de línea
        const motivosFormateados = adelanto.motivos ? 
            adelanto.motivos.split('\n').map(m => `${m}<br>`).join('') : 
            '-';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <button class="editBtn" data-id="${adelanto.id_adelanto}">Modificar</button>
                <button class="deleteBtn" data-id="${adelanto.id_adelanto}">Eliminar</button>
                <button class="generarpdf" data-id="${adelanto.id_adelanto}">Generar PDF</button>
            </td>
            <td>${adelanto.id_adelanto}</td>
            <td>${adelanto.id_trabajador}.- ${adelanto.nombres} ${adelanto.apellidos}</td>
            <td>${formatDate(adelanto.fecha)}</td>
            <td>${motivosFormateados}</td>
            <td>$ ${formatNumber(adelanto.monto)}</td>
            <td>${adelanto.bono ? `$ ${formatNumber(adelanto.bono)}` : '$ 0'}</td>
        `;
        tbody.appendChild(row);
        
        // Sumar a los totales
        totalAnticipos += parseFloat(adelanto.monto) || 0;
        totalBonos += parseFloat(adelanto.bono) || 0;
    });

    // Actualizar totales
    document.getElementById('total-anticipos').textContent = `$ ${formatNumber(totalAnticipos)}`;
    document.getElementById('total-bonos').textContent = `$ ${formatNumber(totalBonos)}`;

    // Agregar event listeners a los botones
    document.querySelectorAll('.editBtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const adelantoId = e.target.getAttribute('data-id');
            editAdelanto(adelantoId);
        });
    });

    document.querySelectorAll('.deleteBtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const adelantoId = e.target.getAttribute('data-id');
            deleteAdelanto(adelantoId);
        });
    });
    document.querySelectorAll('.generarpdf').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const adelantoId = e.target.getAttribute('data-id');
            generarPDF(adelantoId);
        });
    });
}
function renderPaginationControls(totalItems, currentPage) {
    const totalPages = Math.ceil(totalItems / pageSize);
    const container = document.getElementById('pagination-controls');
    container.innerHTML = '';

    if (totalPages <= 1) return;

    const fragment = document.createDocumentFragment();

    // Botón anterior
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = 'Anterior';
        prevBtn.addEventListener('click', () => {
            const trabajadorId = document.getElementById('filtroTrabajador').value;
            const mes = document.getElementById('filtroMes').value;
            const anio = document.getElementById('filtroAnio').value;
            fetchFilteredAdelantos(currentPage - 1, trabajadorId, mes, anio);
        });
        fragment.appendChild(prevBtn);
    }

    // Números de página
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage || i <= 2 || i > totalPages - 2 || Math.abs(i - currentPage) <= 1) {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.classList.toggle('active', i === currentPage);
            pageBtn.addEventListener('click', () => {
                const trabajadorId = document.getElementById('filtroTrabajador').value;
                const mes = document.getElementById('filtroMes').value;
                const anio = document.getElementById('filtroAnio').value;
                fetchFilteredAdelantos(i, trabajadorId, mes, anio);
            });
            fragment.appendChild(pageBtn);
        } else if (i === 3 && currentPage > 4 || i === totalPages - 2 && currentPage < totalPages - 3) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            fragment.appendChild(dots);
        }
    }

    // Botón siguiente
    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Siguiente';
        nextBtn.addEventListener('click', () => {
            const trabajadorId = document.getElementById('filtroTrabajador').value;
            const mes = document.getElementById('filtroMes').value;
            const anio = document.getElementById('filtroAnio').value;
            fetchFilteredAdelantos(currentPage + 1, trabajadorId, mes, anio);
        });
        fragment.appendChild(nextBtn);
    }

    container.appendChild(fragment);
}

async function fetchFilteredAdelantos(page, trabajadorId, mes, anio) {
    try {
        // Construir URL de filtro
        let url = `/api/adelantos?page=${page}&limit=${pageSize}`;
        
        if (trabajadorId) url += `&trabajador=${trabajadorId}`;
        if (mes) url += `&mes=${mes}`;
        if (anio) url += `&año=${anio}`;

        const response = await fetch(url);
        const { adelantos, total } = await response.json();
        
        renderAdelantosData(adelantos);
        renderPaginationControls(total, page);
        
    } catch (error) {
        console.error('Error al cargar adelantos filtrados:', error);
        showPopup('Error al cargar los datos');
    }
}

function formatNumber(value) {
    return new Intl.NumberFormat('es-CL').format(value);
}

function formatDate(dateString) {
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const date = new Date(dateString);
    const dia = date.getDate();
    const mes = meses[date.getMonth()];
    const anio = date.getFullYear();
    return `${dia}/${mes}/${anio}`;
}

// Resto de las funciones (editAdelanto, deleteAdelanto) se mantienen igual
// Resto de las funciones (renderPaginationControls, editAdelanto, deleteAdelanto) se mantienen igual
function renderPaginationControls(totalItems, currentPage) {
    const totalPages = Math.ceil(totalItems / pageSize);
    const container = document.getElementById('pagination-controls');
    container.innerHTML = '';

    if (totalPages <= 1) return;

    const fragment = document.createDocumentFragment();

    // Botón anterior
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = 'Anterior';
        prevBtn.addEventListener('click', () => fetchAdelantos(currentPage - 1));
        fragment.appendChild(prevBtn);
    }

    // Números de página
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage || i <= 2 || i > totalPages - 2 || Math.abs(i - currentPage) <= 1) {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.classList.toggle('active', i === currentPage);
            pageBtn.addEventListener('click', () => fetchAdelantos(i));
            fragment.appendChild(pageBtn);
        } else if (i === 3 && currentPage > 4 || i === totalPages - 2 && currentPage < totalPages - 3) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            fragment.appendChild(dots);
        }
    }

    // Botón siguiente
    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Siguiente';
        nextBtn.addEventListener('click', () => fetchAdelantos(currentPage + 1));
        fragment.appendChild(nextBtn);
    }

    container.appendChild(fragment);
}

// Utilidades
function formatCurrency(value) {
    return Number(value || 0).toLocaleString('es-CL');
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Date(dateString).toLocaleDateString('es-CL', options);
}


async function editAdelanto(adelantoId) {
    try {
        const response = await fetch(`/api/adelantos/${adelantoId}`);
        if (!response.ok) {
            throw new Error('Error al obtener el adelanto');
        }
        const adelanto = await response.json();
        showAdelantoForm(adelanto);
    } catch (error) {
        console.error('Error al editar adelanto:', error);
        showPopup('Error al cargar el adelanto para editar: ' + error.message);
    }
}

async function deleteAdelanto(adelantoId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este adelanto?')) {
        return;
    }

    try {
        const response = await fetch(`/api/adelantos/${adelantoId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            showPopup('Adelanto eliminado con éxito');
            fetchAdelantos();
        } else {
            const errorData = await response.json();
            console.error('Error al eliminar adelanto:', errorData);
            showPopup('Error al eliminar el adelanto');
        }
    } catch (error) {
        console.error('Error al eliminar adelanto:', error);
        showPopup('Error al eliminar el adelanto');
    }
}

function showAdelantoForm(adelanto = null) {
    // Crear el formulario modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-btn">&times;</span>
            <h2>${adelanto ? 'Editar Adelanto' : 'Nuevo Adelanto'}</h2>
            <form id="adelantoForm">
                <input type="hidden" id="id_adelanto" value="${adelanto ? adelanto.id_adelanto : ''}">
                
                <div class="form-group">
                    <label for="id_trabajador">Trabajador:</label>
                    <select id="id_trabajador" required>
                        <option value="">Seleccione un trabajador</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="fecha">Fecha:</label>
                    <input type="date" id="fecha" required value="${adelanto ? adelanto.fecha : ''}">
                </div>
                
                <div class="form-group">
                    <label for="monto">Monto:</label>
                    <input type="number" id="monto" required value="${adelanto ? adelanto.monto : ''}">
                </div>
                <div class="form-group">
                    <label for="bono">Bono:</label>
                    <input type="number" id="bono" required value="${adelanto ? adelanto.bono : ''}">
                </div>
                <div class="form-group">
                    <label for="motivos">Motivos:</label>
                    <textarea id="motivos" rows="3">${adelanto ? adelanto.motivos : ''}</textarea>
                </div>
                
                <button type="submit">Guardar</button>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // Cargar trabajadores en el select
    loadTrabajadoresForForm(adelanto ? adelanto.id_trabajador : null);

    // Cerrar modal
    modal.querySelector('.close-btn').addEventListener('click', () => {
        modal.remove();
    });

    // Enviar formulario
    document.getElementById('adelantoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveAdelanto(adelanto ? 'edit' : 'create');
        modal.remove();
    });
}
async function generarPDF(adelantoId) {
  // Mostrar indicador de carga
  showPopup('Generando comprobante PDF, por favor espere...');

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      showPopup('No se encontró token de autenticación');
      return;
    }

    // Fetch con manejo explícito de errores de red
    let response;
    try {
      response = await fetch(`/api/adelantos/${adelantoId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (networkError) {
      console.error('Error de red:', networkError);
      showPopup('No se pudo conectar con el servidor');
      return;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Error al obtener adelanto:', errorData);
      showPopup('Error al obtener datos del adelanto: ' + (errorData.error || response.statusText));
      return;
    }

    const data = await response.json();

    // Función auxiliar para formato CLP
    const formatCLP = valor =>
      '$' + (Number(valor) || 0).toLocaleString('es-CL', { minimumFractionDigits: 0 });

    // Formatear fecha de forma amigable en español
    const fechaFormateada = new Date(data.fecha).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    // Crear PDF y configurar página
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([800, 600]);
    const { width, height } = page.getSize();

    // Embedir fuentes
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 12;
    const marginX = 50;
    const maxTextWidth = width - marginX * 2;
    let y = height - 50;

    // Función para dibujar texto con word wrap
    function drawWrappedText(text, options = {}) {
      const {
        font = fontRegular,
        size = fontSize,
        lineHeight = fontSize * 1.2,
        color = rgb(0, 0, 0),
      } = options;

      // Dividir texto en líneas que quepan en maxTextWidth
      const words = text.split(' ');
      let line = '';
      for (let i = 0; i < words.length; i++) {
        const testLine = line + (line ? ' ' : '') + words[i];
        const testWidth = font.widthOfTextAtSize(testLine, size);
        if (testWidth > maxTextWidth && line) {
          page.drawText(line, { x: marginX, y, size, font, color });
          y -= lineHeight;
          line = words[i];
        } else {
          line = testLine;
        }
      }
      if (line) {
        page.drawText(line, { x: marginX, y, size, font, color });
        y -= lineHeight;
      }
    }

    // Escribir contenido
    drawWrappedText(`En Santiago a ${fechaFormateada}`);

    const nombreCompleto = `${data.nombres} ${data.apellidos}`.toUpperCase();
    drawWrappedText(
      `Maderas MyM ha entregado a don: ${nombreCompleto} la suma de ${formatCLP(data.monto)} por motivos: ${data.motivos || 'No especificados'}.`
    );

    const authText =
      'El trabajador autoriza a Maderas MyM a descontar este pago de su sueldo final del presente mes. No teniendo ninguna observación al respecto.';
    drawWrappedText(authText, { lineHeight: fontSize * 1.5 });

    y -= fontSize; // Espacio extra

    // Firma
    page.drawText('**Firme aquí**', {
      x: marginX,
      y,
      size: fontSize,
      font: fontBold,
      color: rgb(0, 0, 0)
    });
    y -= fontSize * 1.5;

    page.drawLine({
      start: { x: marginX, y },
      end: { x: width - marginX, y },
      thickness: 1,
      color: rgb(0, 0, 0)
    });
    y -= fontSize * 2;

    page.drawText(nombreCompleto, {
      x: marginX,
      y,
      size: fontSize,
      font: fontRegular,
      color: rgb(0, 0, 0)
    });
    y -= fontSize * 3;

    // Nota al pie
    const nota =
      'Nota: Se imprime este voucher para control interno de Maderas MyM, el cual para ser válido debe ser firmado por el trabajador.';
    drawWrappedText(nota, { size: fontSize - 2, lineHeight: fontSize });

    // Guardar PDF
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    // Crear enlace solo si no existe para evitar spam
    let a = document.getElementById('download-pdf-link');
    if (!a) {
      a = document.createElement('a');
      a.id = 'download-pdf-link';
      a.style.display = 'none';
      document.body.appendChild(a);
    }
    a.href = url;
    a.download = `comprobante_adelanto_${adelantoId}.pdf`;
    a.click();

    // Revocar URL después de descarga
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showPopup('Comprobante PDF generado correctamente');

  } catch (error) {
    console.error('Error al generar PDF:', error);
    showPopup('Error al generar el comprobante PDF');
  }
}


async function loadTrabajadoresForForm(selectedId = null) {
    try {
        const response = await fetch('/api/trabajadores');
        const trabajadores = await response.json();
        
        const select = document.getElementById('id_trabajador');
        trabajadores.forEach(t => {
            const option = document.createElement('option');
            option.value = t.id_trabajador;
            option.textContent = `${t.id_trabajador}.- ${t.nombres} ${t.apellidos}`;
            if (selectedId && t.id_trabajador == selectedId) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error al cargar trabajadores:', error);
        showPopup('Error al cargar la lista de trabajadores');
    }
}

async function saveAdelanto(action) {
    const formData = {
        id_adelanto: document.getElementById('id_adelanto').value,
        id_trabajador: document.getElementById('id_trabajador').value,
        fecha: document.getElementById('fecha').value,
        monto: document.getElementById('monto').value,
        bono: document.getElementById('bono').value,
        motivos: document.getElementById('motivos').value
    };

    try {
        let response;
        if (action === 'edit') {
            response = await fetch(`/api/adelantos/${formData.id_adelanto}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });
        } else {
            response = await fetch('/api/adelantos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });
        }

        if (response.ok) {
            showPopup('Adelanto guardado con éxito');
            fetchAdelantos();
        } else {
            const errorData = await response.json();
            console.error('Error al guardar adelanto:', errorData);
            showPopup('Error al guardar el adelanto: ' + (errorData.error || ''));
        }
    } catch (error) {
        console.error('Error al guardar adelanto:', error);
        showPopup('Error al guardar el adelanto');
    }
}


});

document.querySelector('.button').addEventListener('click', async () => {
    const res = await fetch('/logout', {
      method: 'GET'
    });
    if (res.redirected) {
      window.location.href = res.url; // Redirige al usuario a la página de inicio de sesión
    }
  });

