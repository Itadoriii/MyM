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
                                <td>${trabajador.fecha_ingreso}</td>
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
                    <td>${trabajador.fecha_ingreso}</td>
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
                <label for="fecha_ingreso">Fecha Ingreso:</label>
                <input type="date" id="fecha_ingreso" name="fecha_ingreso" value="${isEditing ? trabajador.fecha_ingreso : ''}" required>
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
                <button type="button" class="btn btn-secondary" onclick="fetchTrabajadores()">Cancelar</button>
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

async function fetchAdelantos() {
    try {
        const response = await fetch('/api/adelantos');
        const adelantos = await response.json();
        
        if (!Array.isArray(adelantos)) {
            console.error('La respuesta no es un array:', adelantos);
            mainContent.innerHTML = '<p>Error: La respuesta no tiene el formato esperado.</p>';
            return;
        }

        mainContent.innerHTML = `
            <div class="filtros-container">
                <div class="row">
                    <div class="col-md-3">
                        <label for="filtro-trabajador">Trabajador</label>
                        <select id="filtro-trabajador" class="form-control">
                            <option value="">Todos los trabajadores</option>
                            <!-- Se llenará dinámicamente -->
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label for="filtro-mes">Mes</label>
                        <select id="filtro-mes" class="form-control">
                            <option value="">Todos</option>
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
                    </div>
                    <div class="col-md-2">
                        <label for="filtro-anio">Año</label>
                        <select id="filtro-anio" class="form-control">
                            <option value="">Todos</option>
                            <!-- Se llenará dinámicamente -->
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label>&nbsp;</label>
                        <button id="btn-filtrar" class="btn btn-primary btn-block">
                            <i class="bx bx-filter-alt"></i> Filtrar
                        </button>
                    </div>
                    <div class="col-md-2">
                        <label>&nbsp;</label>
                        <button id="btn-limpiar" class="btn btn-secondary btn-block">
                            <i class="bx bx-reset"></i> Limpiar
                        </button>
                    </div>
                </div>
            </div>
            
            <button class="buttonenlace" id="crearAdelantoBtn">Agregar nuevo adelanto</button>

            <h1 class="titulotable">Adelantos:</h1>
            <div class="table-container" style="max-height: 400px; overflow-y: scroll;">
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
                    <tbody id="adelantos-tbody">
                        ${adelantos.map(adelanto => `
                            <tr>
                                <td>
                                    <button class="editBtn" data-id="${adelanto.id_adelanto}">Editar</button>
                                    <button class="deleteBtn" data-id="${adelanto.id_adelanto}">Eliminar</button>
                                </td>
                                <td>${adelanto.id_adelanto}</td>
                                <td>${adelanto.nombres} ${adelanto.apellidos}</td>
                                <td>${adelanto.fecha}</td>
                                <td>${adelanto.motivos || '-'}</td>
                                <td>$${adelanto.monto.toLocaleString()}</td>
                                <td>${adelanto.bono ? `$${adelanto.bono.toLocaleString()}` : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Cargar trabajadores en el select de filtro
        const trabajadoresResponse = await fetch('/api/trabajadores');
        const trabajadores = await trabajadoresResponse.json();
        const trabajadorSelect = document.getElementById('filtro-trabajador');
        
        trabajadores.forEach(trabajador => {
            const option = document.createElement('option');
            option.value = trabajador.id_trabajador;
            option.textContent = `${trabajador.nombres} ${trabajador.apellidos}`;
            trabajadorSelect.appendChild(option);
        });

        // Cargar años en el select de filtro
        const anioSelect = document.getElementById('filtro-anio');
        const currentYear = new Date().getFullYear();
        for (let i = currentYear; i >= currentYear - 5; i--) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            anioSelect.appendChild(option);
        }

        // Agregar event listeners a los botones de editar
        document.querySelectorAll('.editBtn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const adelantoId = e.target.getAttribute('data-id');
                await editAdelanto(adelantoId);
            });
        });

        // Agregar event listeners a los botones de eliminar
        document.querySelectorAll('.deleteBtn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const adelantoId = e.target.getAttribute('data-id');
                await deleteAdelanto(adelantoId);
            });
        });

        // Evento para filtrar
        document.getElementById('btn-filtrar').addEventListener('click', async () => {
            const trabajadorId = document.getElementById('filtro-trabajador').value;
            const mes = document.getElementById('filtro-mes').value;
            const anio = document.getElementById('filtro-anio').value;
            
            let url = '/api/adelantos?';
            if (trabajadorId) url += `trabajador=${trabajadorId}&`;
            if (mes) url += `mes=${mes}&`;
            if (anio) url += `año=${anio}&`;
            
            const response = await fetch(url);
            const adelantosFiltrados = await response.json();
            renderAdelantos(adelantosFiltrados);
        });

        // Evento para limpiar filtros
        document.getElementById('btn-limpiar').addEventListener('click', () => {
            document.getElementById('filtro-trabajador').value = '';
            document.getElementById('filtro-mes').value = '';
            document.getElementById('filtro-anio').value = '';
            renderAdelantos(adelantos);
        });

        // Evento para crear nuevo adelanto
        document.getElementById('crearAdelantoBtn').addEventListener('click', () => {
            showAdelantoForm();
        });

        function renderAdelantos(adelantos) {
    const tbody = document.getElementById('adelantos-tbody');
    
    // Calcular totales
    const totalAnticipo = adelantos.reduce((sum, adelanto) => sum + (adelanto.monto || 0), 0);
    const totalBono = adelantos.reduce((sum, adelanto) => sum + (adelanto.bono || 0), 0);
    const totalGeneral = totalAnticipo + totalBono;
    
    tbody.innerHTML = adelantos.map(adelanto => `
        <tr>
            <td>
                <button class="editBtn btn-accion" data-id="${adelanto.id_adelanto}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="deleteBtn btn-accion btn-eliminar" data-id="${adelanto.id_adelanto}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
            <td>${adelanto.id_adelanto}</td>
            <td>${adelanto.nombres} ${adelanto.apellidos}</td>
            <td>${formatDate(adelanto.fecha)}</td>
            <td>${adelanto.motivos || '-'}</td>
            <td class="text-right">$${formatCurrency(adelanto.monto)}</td>
            <td class="text-right">${adelanto.bono ? `$${formatCurrency(adelanto.bono)}` : '-'}</td>
        </tr>
    `).join('') + `
        <tr class="fila-total">
            <td colspan="5" class="text-right"><strong>TOTALES</strong></td>
            <td class="text-right"><strong>$${formatCurrency(totalAnticipo)}</strong></td>
            <td class="text-right"><strong>$${formatCurrency(totalBono)}</strong></td>
        </tr>
        <tr class="fila-total-general">
            <td colspan="5" class="text-right"><strong>TOTAL GENERAL</strong></td>
            <td colspan="2" class="text-right"><strong>$${formatCurrency(totalGeneral)}</strong></td>
        </tr>
    `;

    // Volver a agregar los event listeners
    document.querySelectorAll('.editBtn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const adelantoId = e.target.closest('button').getAttribute('data-id');
            await editAdelanto(adelantoId);
        });
    });

    document.querySelectorAll('.deleteBtn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const adelantoId = e.target.closest('button').getAttribute('data-id');
            await deleteAdelanto(adelantoId);
        });
    });
        }

        // Funciones auxiliares para formato
        function formatCurrency(value) {
            return value.toLocaleString('es-CL');
        }

        function formatDate(dateString) {
            const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
            return new Date(dateString).toLocaleDateString('es-CL', options);
        }
        renderAdelantos(adelantos);
    } catch (error) {
        console.error('Error fetching adelantos:', error);
        mainContent.innerHTML = '<p>Error al cargar los adelantos.</p>';
    }
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
    const isEditing = !!adelanto;
    
    // Primero necesitamos cargar los trabajadores para el select
    fetch('/api/trabajadores')
        .then(response => response.json())
        .then(trabajadores => {
            mainContent.innerHTML = `
                <h1>${isEditing ? 'Editar' : 'Agregar Nuevo'} Adelanto</h1>
                <form id="adelantoForm">
                    ${isEditing ? `<input type="hidden" id="id_adelanto" name="id_adelanto" value="${adelanto.id_adelanto}">` : ''}
                    
                    <div class="form-group">
                        <label for="id_trabajador">Trabajador:</label>
                        <select id="id_trabajador" name="id_trabajador" required>
                            ${trabajadores.map(t => `
                                <option value="${t.id_trabajador}" 
                                    ${isEditing && adelanto.id_trabajador == t.id_trabajador ? 'selected' : ''}>
                                    ${t.nombres} ${t.apellidos} (${t.rut})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="monto">Monto del adelanto:</label>
                        <input type="number" id="monto" name="monto" step="1000" value="${isEditing ? adelanto.monto : ''}" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="bono">Bono:</label>
                        <input type="number" id="bono" name="bono" step="1000" value="${isEditing ? (adelanto.bono || '') : ''}">
                    </div>
                    
                    <div class="form-group">
                        <label for="motivos">Motivos:</label>
                        <textarea id="motivos" name="motivos">${isEditing ? (adelanto.motivos || '') : ''}</textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="fecha">Fecha:</label>
                        <input type="date" id="fecha" name="fecha" value="${isEditing ? adelanto.fecha : new Date().toISOString().split('T')[0]}" required>
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">${isEditing ? 'Guardar Cambios' : 'Agregar Adelanto'}</button>
                        <button type="button" class="btn btn-secondary" onclick="fetchAdelantos()">Cancelar</button>
                    </div>
                </form>
            `;

            document.getElementById('adelantoForm').addEventListener('submit', async (event) => {
                event.preventDefault();
                const formData = new FormData(event.target);
                const adelantoData = Object.fromEntries(formData.entries());

                try {
                    const url = isEditing ? `/api/adelantos/${adelantoData.id_adelanto}` : '/api/adelantos';
                    const method = isEditing ? 'PUT' : 'POST';
                    
                    const response = await fetch(url, {
                        method: method,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        },
                        body: JSON.stringify(adelantoData)
                    });

                    const result = await response.json();

                    if (response.ok) {
                        showPopup(isEditing ? 'Adelanto actualizado con éxito' : 'Adelanto agregado con éxito');
                        fetchAdelantos();
                    } else {
                        console.error('Error saving adelanto:', result);
                        showPopup(`Error: ${result.error || 'Error al guardar el adelanto'}`);
                    }
                } catch (error) {
                    console.error('Error saving adelanto:', error);
                    showPopup('Error al guardar el adelanto');
                }
            });
        })
        .catch(error => {
            console.error('Error al cargar trabajadores:', error);
            showPopup('Error al cargar los trabajadores para el formulario');
        });
}
window.fetchAdelantos = fetchAdelantos;
});