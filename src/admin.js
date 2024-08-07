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

    enlacesMenu.forEach(enlace => {
        enlace.addEventListener("click", () => {
            menuDashboard.classList.add("open");
            iconoMenu.classList.replace("bx-menu", "bx-x");

            // Cargar contenido dinámico
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
                fetchPedidos()
                break;
            default:
                mainContent.innerHTML = '<h1>Bienvenido</h1><p>Seleccione una opción del menú.</p>';
        }
    }
    async function fetchPedidos() {
        try {
            console.log('Iniciando fetchPedidos');
            const response = await fetch('/api/pedidos');
            console.log('Respuesta recibida:', response);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const pedidos = await response.json();
            console.log('Pedidos recibidos:', pedidos);
    
            let html = '<h1>Pedidos</h1>';
            
            if (pedidos.length === 0) {
                html += '<p>No hay pedidos registrados.</p>';
            } else {
                html += '<table border="1">';
                html += '<tr><th>ID Pedido</th><th>Usuario</th><th>Fecha</th><th>Precio Total</th><th>Detalles</th></tr>';
                
                pedidos.forEach(pedido => {
                    html += `
                        <tr>
                            <td>${pedido.id_pedido}</td>
                            <td>${pedido.user}</td>
                            <td>${new Date(pedido.fecha_pedido).toLocaleString()}</td>
                            <td>$${pedido.precio_total.toFixed(2)}</td>
                            <td>
                                <ul>
                    `;
                    
                    pedido.detalles.forEach(detalle => {
                        html += `
                            <li>
                                ${detalle.nombre_prod} - 
                                Cantidad: ${detalle.cantidad} - 
                                Precio: $${detalle.precio_detalle.toFixed(2)}
                            </li>
                        `;
                    });
    
                    html += `
                                </ul>
                            </td>
                        </tr>
                    `;
                });
    
                html += '</table>';
            }
    
            mainContent.innerHTML = html;
        } catch (error) {
            console.error('Error en fetchPedidos:', error);
            mainContent.innerHTML = '<h1>Pedidos</h1><p>Error al cargar los pedidos: ' + error.message + '</p>';
        }
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

    async function fetchProductos() {
        try {
            const response = await fetch('/productos');
            const productos = await response.json();
            console.log(productos); // Verifica la estructura de los datos recibidos
            if (Array.isArray(productos)) {
                mainContent.innerHTML = `
                    <button class="button enlace" id="crearProductoBtn">Crear nuevo producto</button>

                    <h1>Productos Actuales:</h1>
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
                            </tr>
                        </thead>
                        <tbody>
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
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;

                document.getElementById('crearProductoBtn').addEventListener('click', () => {
                    mainContent.innerHTML = `
                        <h1>Crear Nuevo Producto</h1>
                        <form id="nuevoProductoForm">
                            <label for="nombre_prod">Nombre:</label>
                            <input type="text" id="nombre_prod" name="nombre_prod" required><br>
                            <label for="precio_unidad">Precio Unidad:</label>
                            <input type="number" id="precio_unidad" name="precio_unidad" required><br>
                            <label for="disponibilidad">Disponibilidad:</label>
                            <input type="number" id="disponibilidad" name="disponibilidad" required><br>
                            <label for="tipo">Tipo:</label>
                            <input type="text" id="tipo" name="tipo" required><br>
                            <label for="medidas">Medidas:</label>
                            <input type="text" id="medidas" name="medidas" required><br>
                            <label for="dimensiones">Dimensiones:</label>
                            <input type="text" id="dimensiones" name="dimensiones" required><br>
                            <label for="fecha_add">Fecha Añadido:</label>
                            <input type="date" id="fecha_add" name="fecha_add" required><br>
                            <button type="submit">Guardar Producto</button>
                        </form>
                    `;

                    document.getElementById('nuevoProductoForm').addEventListener('submit', async (event) => {
                        event.preventDefault();
                        const formData = new FormData(event.target);
                        const producto = {
                            nombre_prod: formData.get('nombre_prod'),
                            precio_unidad: formData.get('precio_unidad'),
                            disponibilidad: formData.get('disponibilidad'),
                            tipo: formData.get('tipo'),
                            medidas: formData.get('medidas'),
                            dimensiones: formData.get('dimensiones'),
                            fecha_add: formData.get('fecha_add'),
                        };

                        console.log(producto); // Verifica que todos los campos están presentes y tienen valores correctos

                        try {
                            const response = await fetch('/api/productos', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(producto)
                            });

                            const result = await response.json();
                            console.log('Server response:', result);

                            if (response.ok) {
                                loadContent('productos');
                            } else {
                                console.error('Error saving producto:', result);
                                mainContent.innerHTML = `<p>Error saving producto: ${result.error}</p>`;
                            }
                        } catch (error) {
                            console.error('Error saving producto:', error);
                            mainContent.innerHTML = '<p>Error saving producto.</p>';
                        }
                    });
                });
            } else {
                mainContent.innerHTML = '<p>No se encontraron productos.</p>';
            }
        } catch (error) {
            console.error('Error fetching productos:', error);
            mainContent.innerHTML = '<p>Error loading productos.</p>';
        }
    }
});
