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
                fetchProductos()
                break;
            case 'pedidos':
                mainContent.innerHTML = '<h1>Pedidos</h1><p>Contenido de pedidos...</p>';
                break;
            default:
                mainContent.innerHTML = '<h1>Bienvenido</h1><p>Seleccione una opción del menú.</p>';
        }
    }

    async function fetchUsuarios() {
        try {
            const response = await fetch('/api/usuarios');
            const usuarios = await response.json();
            mainContent.innerHTML = `<h1>Usuarios</h1><ul>${usuarios.map(usuario => `<li>${usuario.nombre} - ${usuario.email}</li>`).join('')}</ul>`;
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
                    <h1>Productos</h1>
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
            } else {
                mainContent.innerHTML = '<p>No se encontraron productos.</p>';
            }
        } catch (error) {
            console.error('Error fetching productos:', error);
            mainContent.innerHTML = '<p>Error loading productos.</p>';
        }
    }

   
});
