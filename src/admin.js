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
            case 'informe general':
                fetchInformeGeneral();
                break
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

        // Generamos tabla
        const tableHTML = `
        <h1>Usuarios</h1>
        <p>Total de usuarios: ${usuarios.length}</p>
        <div style="max-height:400px; overflow-y:auto; border:1px solid #ccc; border-radius:6px;">
            <table style="width:100%; border-collapse:collapse;">
            <thead style="position:sticky; top:0; background:#f5f5f5; z-index:1;">
                <tr>
                <th style="padding:8px; border-bottom:1px solid #ddd; text-align:left;">ID</th>
                <th style="padding:8px; border-bottom:1px solid #ddd; text-align:left;">Usuario</th>
                <th style="padding:8px; border-bottom:1px solid #ddd; text-align:left;">Correo</th>
                <th style="padding:8px; border-bottom:1px solid #ddd; text-align:left;">Teléfono</th>
                <th style="padding:8px; border-bottom:1px solid #ddd; text-align:left;">Rol</th>
                </tr>
            </thead>
            <tbody>
                ${usuarios.map(u => `
                <tr>
                    <td style="padding:6px; border-bottom:1px solid #eee;">${u.id_usuarios || '-'}</td>
                    <td style="padding:6px; border-bottom:1px solid #eee;">${u.user}</td>
                    <td style="padding:6px; border-bottom:1px solid #eee;">${u.email}</td>
                    <td style="padding:6px; border-bottom:1px solid #eee;">${u.number || 'No disponible'}</td>
                    <td style="padding:6px; border-bottom:1px solid #eee;">${u.role || 'user'}</td>
                </tr>
                `).join('')}
            </tbody>
            </table>
        </div>
        `;

        mainContent.innerHTML = tableHTML;

    } catch (error) {
        console.error('Error fetching usuarios:', error);
        mainContent.innerHTML = '<p>Error loading usuarios.</p>';
    }
    }
        // ----- PEDIDOS con pestañas y scroll -----
        async function fetchPedidos(scope = 'generados') {
        // Render header + contenedor
        const tabs = [
            ['generados',       'Generados'],
            ['espera_pago',     'Aceptados (espera de pago)'],
            ['espera_envio', 'Pagados (espera retiro/envío)'],
            ['despacho',        'Enviados / Retirados'],
            ['finalizados',     'Finalizados'],
            ['rechazados',      'Rechazados']
        ];

        mainContent.innerHTML = `
            <div class="pedidos-header">
            <h1>Pedidos</h1>
            <nav class="pill-tabs" id="orders-tabs">
                ${tabs.map(([key,label]) =>
                `<button class="orders-tab ${key===scope?'active':''}" data-scope="${key}">${label}</button>`
                ).join('')}
            </nav>
            </div>
            <div class="table-wrap" id="orders-wrap">
            <p>Cargando…</p>
            </div>
        `;

        // Delegación para cambiar de pestaña
        document.getElementById('orders-tabs').onclick = (e) => {
            const btn = e.target.closest('.orders-tab');
            if (!btn) return;
            fetchPedidos(btn.dataset.scope);
        };

        // Carga datos
        const wrap = document.getElementById('orders-wrap');
        try {
            const res = await fetch(`/api/pedidos?scope=${encodeURIComponent(scope)}`);
            const pedidos = await res.json();

            if (!Array.isArray(pedidos) || pedidos.length === 0) {
            wrap.innerHTML = `<p>No hay pedidos en esta vista.</p>`;
            return;
            }

            wrap.innerHTML = buildPedidosTable(pedidos);
            // Atacha acciones
            wirePedidoActions(wrap);
        } catch (err) {
            console.error(err);
            wrap.innerHTML = `<p>Error al cargar pedidos.</p>`;
        }
        }

        function buildPedidosTable(pedidos){
        const fmt = n => Number(n||0).toLocaleString('es-CL');

        const badge = (estado) => {
            const e = String(estado||'').toLowerCase();
            if (e === 'generado' || e === 'pendiente')
            return `<span class="badge gen">Generado</span>`;
            if (e === 'aceptado_espera_pago')
            return `<span class="badge esp">Aceptado (espera pago)</span>`;
            if (e === 'pagado_espera_envio') // <-- corregido (antes decía ..._despacho)
            return `<span class="badge pay">Pagado (espera retiro/envío)</span>`;
            if (e === 'enviado' || e === 'retirado')
            return `<span class="badge ship">${e==='enviado'?'Enviado':'Retirado'}</span>`;
            if (e === 'finalizado')
            return `<span class="badge fin">Finalizado</span>`;
            if (e === 'rechazado')
            return `<span class="badge rej">Rechazado</span>`;
            return `<span class="badge">${estado}</span>`;
        };

        return `
        <table>
            <thead>
            <tr>
                <th>ID</th>
                <th>Usuario</th>
                <th>Contacto</th>
                <th>Total</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Entrega</th>
                <th>Comentario</th>
                <th>Detalles</th>
                <th>Acciones</th>
            </tr>
            </thead>
            <tbody>
            ${pedidos.map(p => `
                <tr>
                <td>${p.id_pedido}</td>
                <td>${p.user}</td>
                <td>${p.email}<br>${p.number || '-'}</td>
                <td>$ ${fmt(p.precio_total)}</td>
                <td>${new Date(p.fecha_pedido).toLocaleString('es-CL')}</td>
                <td>${badge(p.estado)}</td>
                <td>${p.delivery || '-'}</td>
                <td>${p.descripcion || '-'}</td>
                <td>
                    <ul style="margin-left:16px">
                    ${p.detalles.map(d => `
                        <li>${d.nombre_prod} — ${d.cantidad} x $${fmt(d.precio_detalle)}</li>
                    `).join('')}
                    </ul>
                </td>
                <td class="actions-row">
                    ${buildActionButtons(p.estado, p.id_pedido)}
                </td>
                </tr>
            `).join('')}
            </tbody>
        </table>`;
        }

        function buildActionButtons(estado, id){
        const e = String(estado||'').toLowerCase();
        const btn = (label, to) =>
            `<button data-action="${to}" data-id="${id}">${label}</button>`;

        // Flujo: generado → aceptar/rechazar → espera pago → pagado → enviado/retirado → finalizado
        if (e === 'generado' || e === 'pendiente') {
            return (
            btn('Aceptar (espera pago)', 'aceptado_espera_pago') + // <-- manda directamente el estado canónico
            btn('Rechazar', 'rechazado')
            );
        }
        if (e === 'aceptado_espera_pago') {
            return btn('Marcar PAGADO', 'pagado_espera_envio');     // <-- corregido
        }
        if (e === 'pagado_espera_envio') {                        // <-- corregido
            return (
            btn('Marcar ENVIADO', 'enviado') +
            btn('Marcar RETIRADO', 'retirado')
            );
        }
        if (e === 'enviado' || e === 'retirado') {
            return btn('Finalizar', 'finalizado');
        }
        return ''; // rechazado/finalizado: sin acciones
        }

        function wirePedidoActions(container) {
        // Mapea cualquier "action" del botón al estado canónico que espera el backend
        const toEstado = (action) => {
            const map = {
            'aceptado_espera_pago': 'aceptado_espera_pago',
            'rechazado':            'rechazado',
            'pagado_espera_envio':  'pagado_espera_envio',
            'enviado':              'enviado',
            'retirado':             'retirado',
            'finalizado':           'finalizado'
            };
            return map[String(action).toLowerCase()] || null;
        };

        container.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;

            const id = btn.dataset.id;
            const action = btn.dataset.action;
            const estado = toEstado(action);       // <-- convertimos a canónico

            if (!estado) {
            alert('Acción desconocida.');
            return;
            }

            console.log('[UI] Cambio de estado ->', { id, estado });

            try {
            const res = await fetch(`/api/pedidos/${id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                // Enviamos ambas claves por compatibilidad: {estado} y {to}
                body: JSON.stringify({ estado, to: estado })
            });

            const text = await res.text();
            let data = null;
            try { data = JSON.parse(text); } catch {}

            if (!res.ok || data?.success === false) {
                const msg = data?.error || text || res.statusText;
                console.error('[API] Error estado:', msg);
                alert('No se pudo cambiar el estado: ' + msg);
                return;
            }

            console.log('[API] OK:', data);
            // refresca manteniendo la pestaña actual
            const active = document.querySelector('.orders-tab.active')?.dataset.scope || 'generados';
            fetchPedidos(active);
            } catch (err) {
            console.error('Fetch error:', err);
            alert('Error de red al actualizar el estado.');
            }
        });
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



      // Helpers reutilizables
    async function tryJson(url, opts) {
    try {
        const res = await fetch(url, opts);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) {
        const body = ct.includes('json') ? await res.json().catch(()=>null) : await res.text();
        return { ok: false, status: res.status, body };
        }
        const data = ct.includes('json') ? await res.json() : null;
        return { ok: true, data };
    } catch (e) {
        return { ok: false, error: e };
    }
    }

    async function fetchProductos() {
    // 1) intenta /api/productos
    let r = await tryJson('/api/productos');
    // 2) si falla, usa /productos (público)
    if (!r.ok) {
        const url = new URL('/productos', location.origin);
        url.searchParams.set('limit', 9999);
        r = await tryJson(url);
    }

    if (!r.ok) {
        console.error('No pude obtener productos:', r);
        mainContent.innerHTML = '<p>Error cargando productos.</p>';
        return;
    }

    const raw = r.data;
    const productos = Array.isArray(raw) ? raw : (raw.productos || raw.items || []);
    if (!Array.isArray(productos)) {
        console.error('Formato inesperado al listar productos:', raw);
        mainContent.innerHTML = '<p>Error: formato de respuesta inesperado.</p>';
        return;
    }

    // sets para filtros
    const tipos = Array.from(new Set(productos.map(p => (p.tipo || '').trim()).filter(Boolean))).sort();

    // UI base
    mainContent.innerHTML = `
        <input type="text" id="search-input" placeholder="Buscar (global)..." style="width:100%;padding:10px;margin-bottom:12px;">
        <button class="buttonenlace" id="crearProductoBtn" style="margin-bottom:10px;">Crear nuevo producto</button>

        <h1 class="titulotable">Productos Actuales:</h1>
        <div class="table-container" style="max-height:460px;overflow:auto;">
        <table>
            <thead>
            <tr>
                <th style="min-width:70px">ID</th>
                <th style="min-width:220px">Nombre</th>
                <th style="min-width:110px">Precio</th>
                <th style="min-width:100px">Stock</th>
                <th style="min-width:140px">Tipo</th>
                <th style="min-width:120px">Medidas</th>
                <th style="min-width:140px">Dimensiones</th>
                <th style="min-width:130px">Fecha</th>
                <th style="min-width:120px">Visibilidad</th>
                <th style="min-width:140px">Acciones</th>
            </tr>
            <!-- Fila de filtros por HEAD -->
            <tr class="filters-row">
                <th><input id="f-id"       type="text" placeholder="ID" style="width:100%"></th>
                <th><input id="f-nombre"   type="text" placeholder="Nombre..." style="width:100%"></th>
                <th></th>
                <th>
                <select id="f-stock" style="width:100%">
                    <option value="">Stock (todos)</option>
                    <option value="con">Con stock (&gt; 0)</option>
                    <option value="sin">Sin stock (= 0)</option>
                </select>
                </th>
                <th>
                <select id="f-tipo" style="width:100%">
                    <option value="">Tipo (todos)</option>
                    ${tipos.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
                </th>
                <th><input id="f-medidas"     type="text" placeholder="Medidas..." style="width:100%"></th>
                <th><input id="f-dimensiones" type="text" placeholder="Dimensiones..." style="width:100%"></th>
                <th></th>
                <th>
                <select id="f-visible" style="width:100%">
                    <option value="">Todos</option>
                    <option value="1">Visibles</option>
                    <option value="0">Ocultos</option>
                </select>
                </th>
                <th>
                <button id="f-clear" type="button">Limpiar filtros</button>
                </th>
            </tr>
            </thead>
            <tbody id="productos-tbody"></tbody>
        </table>
        </div>
    `;

    // helpers
    const isVisible = v => (v === 1 || v === '1' || v === true);
    const fmtCL = n => Number(n || 0).toLocaleString('es-CL');

    function render(list) {
        const tbody = document.getElementById('productos-tbody');
        tbody.innerHTML = list.map(p => `
        <tr>
            <td>${p.id_producto}</td>
            <td>${p.nombre_prod ?? ''}</td>
            <td>$ ${fmtCL(p.precio_unidad)}</td>
            <td>${p.disponibilidad ?? ''}</td>
            <td>${p.tipo ?? ''}</td>
            <td>${p.medidas ?? ''}</td>
            <td>${p.dimensiones ?? ''}</td>
            <td>${p.fecha_add ?? ''}</td>
            <td>${isVisible(p.visible) ? 'Visible' : 'Oculto'}</td>
            <td>
            <button class="editBtn" data-id="${p.id_producto}">Editar</button>
            <button class="deleteBtn" data-id="${p.id_producto}">Eliminar</button>
            </td>
        </tr>
        `).join('');

        // listeners de acciones
        document.querySelectorAll('.editBtn').forEach(b=>{
        b.addEventListener('click', e => editProduct(e.currentTarget.dataset.id));
        });
        document.querySelectorAll('.deleteBtn').forEach(b=>{
        b.addEventListener('click', e => deleteProduct(e.currentTarget.dataset.id));
        });
    }

    // ————— FILTRADO COMBINADO (head + búsqueda global) —————
    const $ = sel => document.getElementById(sel);
    const controls = {
        qGlobal: $('search-input'),
        id: $('f-id'),
        nombre: $('f-nombre'),
        stock: $('f-stock'),
        tipo: $('f-tipo'),
        medidas: $('f-medidas'),
        dimensiones: $('f-dimensiones'),
        visible: $('f-visible'),
        clear: $('f-clear')
    };

    function applyFilters() {
        const qg  = (controls.qGlobal.value || '').toLowerCase().trim();
        const fid = (controls.id.value || '').toLowerCase().trim();
        const fnm = (controls.nombre.value || '').toLowerCase().trim();
        const fst = controls.stock.value;     // '' | 'con' | 'sin'
        const ftp = controls.tipo.value;      // '' | <tipo>
        const fmd = (controls.medidas.value || '').toLowerCase().trim();
        const fdm = (controls.dimensiones.value || '').toLowerCase().trim();
        const fvs = controls.visible.value;   // '' | '1' | '0'

        let list = productos.filter(p => {
        // HEAD: visibilidad
        if (fvs !== '') {
            if (fvs === '1' && !isVisible(p.visible)) return false;
            if (fvs === '0' &&  isVisible(p.visible)) return false;
        }
        // HEAD: stock
        if (fst === 'con' && !(Number(p.disponibilidad) > 0)) return false;
        if (fst === 'sin' && !(Number(p.disponibilidad) === 0)) return false;
        // HEAD: tipo
        if (ftp && String(p.tipo || '').trim() !== ftp) return false;
        // HEAD: id
        if (fid && String(p.id_producto || '').toLowerCase().indexOf(fid) === -1) return false;
        // HEAD: nombre
        if (fnm && String(p.nombre_prod || '').toLowerCase().indexOf(fnm) === -1) return false;
        // HEAD: medidas / dimensiones
        if (fmd && String(p.medidas || '').toLowerCase().indexOf(fmd) === -1) return false;
        if (fdm && String(p.dimensiones || '').toLowerCase().indexOf(fdm) === -1) return false;

        // BÚSQUEDA GLOBAL extra (aplica sobre varias columnas)
        if (qg) {
            const hay = (
            String(p.nombre_prod || '').toLowerCase().includes(qg) ||
            String(p.tipo || '').toLowerCase().includes(qg) ||
            String(p.medidas || '').toLowerCase().includes(qg) ||
            String(p.dimensiones || '').toLowerCase().includes(qg) ||
            String(p.id_producto || '').toLowerCase().includes(qg)
            );
            if (!hay) return false;
        }

        return true;
        });

        render(list);
    }

    // eventos de filtros
    controls.qGlobal.addEventListener('input', applyFilters);
    controls.id.addEventListener('input', applyFilters);
    controls.nombre.addEventListener('input', applyFilters);
    controls.stock.addEventListener('change', applyFilters);
    controls.tipo.addEventListener('change', applyFilters);
    controls.medidas.addEventListener('input', applyFilters);
    controls.dimensiones.addEventListener('input', applyFilters);
    controls.visible.addEventListener('change', applyFilters);
    controls.clear.addEventListener('click', () => {
        Object.values(controls).forEach(el => {
        if (!el || el.tagName === 'BUTTON') return;
        if (el.tagName === 'SELECT') el.value = '';
        else el.value = '';
        });
        applyFilters();
    });

    // crear nuevo
    document.getElementById('crearProductoBtn').addEventListener('click', () => {
        showProductForm();
    });

    // primera render + filtros aplicados
    render(productos);
    applyFilters();
    }
    // === OBTENER UNO (para Editar) ===
    async function editProduct(productId) {
    // intenta API admin
    let r = await tryJson(`/api/productos/${productId}`);
    // si no existe, intenta público
    if (!r.ok) r = await tryJson(`/productos/${productId}`);

    if (!r.ok) {
        console.error('Error al obtener producto:', r);
        showPopup('No se pudo cargar el producto.');
        return;
    }
    showProductForm(r.data);
    }

    // === ELIMINAR ===
    async function deleteProduct(productId) {
    if (!confirm('¿Eliminar este producto?')) return;

    // intenta API admin
    let res = await fetch(`/api/productos/${productId}`, { method: 'DELETE' });
    if (!res.ok) {
        // intenta ruta pública (si tu backend la implementa)
        res = await fetch(`/productos/${productId}`, { method: 'DELETE' });
    }

    if (res.ok) {
        showPopup('Producto eliminado con éxito');
        fetchProductos();
    } else {
        const txt = await res.text().catch(()=> '');
        console.error('Error al eliminar:', res.status, txt);
        showPopup('No se pudo eliminar el producto (ver consola).');
    }
    }


    // === FORM CREAR/EDITAR ===
function showProductForm(product = null) {
  const isEditing = !!product;
  mainContent.innerHTML = `
    <h1>${isEditing ? 'Editar' : 'Crear Nuevo'} Producto</h1>
    <form id="productoForm">
      ${isEditing ? `<input type="hidden" id="id_producto" name="id_producto" value="${product.id_producto}">` : ''}
      <div class="form-group">
        <label>Nombre:</label>
        <input type="text" id="nombre_prod" name="nombre_prod" value="${isEditing ? (product.nombre_prod||'') : ''}" required>
      </div>
      <div class="form-group">
        <label>Precio Unidad:</label>
        <input type="number" id="precio_unidad" name="precio_unidad" step="0.01" value="${isEditing ? (product.precio_unidad||'') : ''}" required>
      </div>
      <div class="form-group">
        <label>Disponibilidad:</label>
        <input type="number" id="disponibilidad" name="disponibilidad" value="${isEditing ? (product.disponibilidad||'') : ''}" required>
      </div>
      <div class="form-group">
        <label>Tipo:</label>
        <input type="text" id="tipo" name="tipo" value="${isEditing ? (product.tipo||'') : ''}" required>
      </div>
      <div class="form-group">
        <label>Medidas:</label>
        <input type="text" id="medidas" name="medidas" value="${isEditing ? (product.medidas||'') : ''}" required>
      </div>
      <div class="form-group">
        <label>Dimensiones:</label>
        <input type="text" id="dimensiones" name="dimensiones" value="${isEditing ? (product.dimensiones||'') : ''}" required>
      </div>
      <div class="form-group">
        <label>Fecha Añadido:</label>
        <input type="date" id="fecha_add" name="fecha_add" value="${isEditing && product.fecha_add ? String(product.fecha_add).slice(0,10) : ''}" required>
      </div>
      <div class="form-group">
        <label>Visibilidad:</label>
        <select id="visible" name="visible">
          <option value="1" ${product?.visible == 1 || product === null ? 'selected' : ''}>Visible</option>
          <option value="0" ${product?.visible == 0 ? 'selected' : ''}>Oculto</option>
        </select>
      </div>
      <div class="form-group">
        <label>Ruta:</label>
        <input type="text" id="ruta" name="ruta" value="${isEditing ? (product.ruta||'') : ''}" required>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${isEditing ? 'Guardar Cambios' : 'Crear Producto'}</button>
        <button type="button" class="btn btn-secondary" onclick="fetchProductos()">Cancelar</button>
      </div>
    </form>
  `;

  document.getElementById('productoForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const payload = Object.fromEntries(new FormData(ev.target).entries());
    const body = JSON.stringify(payload);

    // intentamos primero en /api/productos
    const urlA = isEditing ? `/api/productos/${payload.id_producto}` : '/api/productos';
    const urlB = isEditing ? `/productos/${payload.id_producto}`     : '/productos';

    let res = await fetch(urlA, { method: isEditing ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body });
    if (!res.ok) {
      res = await fetch(urlB, { method: isEditing ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body });
    }

    const ok = res.ok;
    const dataOrText = (await res.text()) || '';
    if (ok) {
      showPopup(isEditing ? 'Producto actualizado con éxito' : 'Producto creado con éxito');
      fetchProductos();
    } else {
      console.error('Error guardando producto:', res.status, dataOrText);
      showPopup('No se pudo guardar el producto (ver consola).');
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
  showPopup('Generando comprobante PDF, por favor espere...');

  try {

    let response;
    try {
      response = await fetch(`/api/adelantos/${adelantoId}`, {
        method: 'GET'
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

    const formatCLP = valor =>
      '$' + (Number(valor) || 0).toLocaleString('es-CL', { minimumFractionDigits: 0 });

    const fecha = new Date(data.fecha);
    console.log(fecha);
    // Restar 1 día
    fecha.setDate(fecha.getDate() - 1);

    const fechaFormateada = fecha.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
    });

    console.log(fechaFormateada);

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 12;
    const marginX = 50;

    function cleanText(text) {
      if (!text) return '';
      return text.replace(/\r/g, '').replace(/\n/g, ' ');
    }

    // Cargar logo
    const logoUrl = '/assets/logo act.png'; // Ajusta ruta según sea necesario
    const logoImageBytes = await fetch(logoUrl).then(res => res.arrayBuffer());
    const logoImage = await pdfDoc.embedPng(logoImageBytes);
    const logoScale = 0.3;
    const logoDims = logoImage.scale(logoScale);

    // Dibujar logo a la izquierda arriba
    const logoX = marginX;
    const logoY = height - logoDims.height - 30;
    page.drawImage(logoImage, {
      x: logoX,
      y: logoY,
      width: logoDims.width,
      height: logoDims.height,
    });

    // Definir zonas de texto
    const textStartX = logoX + logoDims.width + 20;
    const textMaxWidth = width - textStartX - marginX;
    const fullWidthStartX = marginX;
    const fullWidthMaxWidth = width - marginX * 2;

    // Función para dibujar texto con salto de línea y ajuste de ancho
    let y; // Declaramos y aquí para manejar posición vertical global
    function drawWrappedText(text, options = {}) {
      text = cleanText(text);
      const {
        font = fontRegular,
        size = fontSize,
        lineHeight = fontSize * 1.4,
        color = rgb(0, 0, 0),
        x = marginX,
        maxWidth = fullWidthMaxWidth
      } = options;

      const words = text.split(' ');
      let line = '';
      for (let i = 0; i < words.length; i++) {
        const testLine = line + (line ? ' ' : '') + words[i];
        const testWidth = font.widthOfTextAtSize(testLine, size);
        if (testWidth > maxWidth && line) {
          page.drawText(line, { x, y, size, font, color });
          y -= lineHeight;
          line = words[i];
        } else {
          line = testLine;
        }
      }
      if (line) {
        page.drawText(line, { x, y, size, font, color });
        y -= lineHeight;
      }
    }

    // Empezamos dibujando fecha arriba a la derecha del logo (alineado vertical medio)
    y = logoY + logoDims.height / 2 + 10; // un poco arriba de la mitad del logo
    drawWrappedText(`Santiago, ${fechaFormateada}`, {
      x: textStartX,
      size: 14,
      lineHeight: 18,
      font: fontRegular,
      maxWidth: textMaxWidth,
    });

    // Ahora texto formal que empieza justo debajo del logo para evitar solapamiento
    y = logoY - 20; // debajo del logo con margen

    const nombreCompleto = `${data.nombres} ${data.apellidos}`.toUpperCase();
    const montoTotal = formatCLP(data.monto + (data.bono || 0));

    drawWrappedText(
      `Por medio del presente, Maderas MyM certifica haber entregado a don(a) ${nombreCompleto} la suma de ${montoTotal}.`,
      { x: fullWidthStartX, size: 13, lineHeight: 20, maxWidth: fullWidthMaxWidth }
    );
    
    // Dibujar "Motivo:"
    drawWrappedText('Motivo:', { x: fullWidthStartX, size: 13, lineHeight: 20, maxWidth: fullWidthMaxWidth });
    y -= 5; // espacio extra

    // Dibujar cada motivo en su propia línea
    const motivos = data.motivos.split(/\r?\n/);
    for (let linea of motivos) {
    drawWrappedText(linea, { x: fullWidthStartX + 10, size: 13, lineHeight: 18, maxWidth: fullWidthMaxWidth - 10 });
    }

    y -= 10;

    const authText =
      'El trabajador autoriza a Maderas MyM a descontar este pago de su sueldo final del presente mes, no teniendo ninguna observación al respecto.';
    drawWrappedText(authText, { x: fullWidthStartX, size: 12, lineHeight: 18, maxWidth: fullWidthMaxWidth });

    y -= 250;

    // Línea firma centrada
    const firmaLineStartX = marginX + 150;
    const firmaLineEndX = width - marginX - 150;

    page.drawLine({
      start: { x: firmaLineStartX, y },
      end: { x: firmaLineEndX, y },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    y -= 20;

    // Texto firma trabajador centrado
    const firmaTexto = 'Firma Trabajador';
    const textWidth = fontBold.widthOfTextAtSize(firmaTexto, 12);
    const firmaTextX = (firmaLineStartX + firmaLineEndX) / 2 - textWidth / 2;

    page.drawText(firmaTexto, {
      x: firmaTextX,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    y -= 50;

    // Nota al pie pequeña y gris
    const nota = 'Nota: Se imprime este boucher para control interno de Maderas MyM el cual para ser válido debe ser firmado por el trabajador.';
    page.drawText(nota, {
      x: marginX,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
      maxWidth: fullWidthMaxWidth 
    });

    // Guardar y descargar PDF
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

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


async function fetchInformeGeneral(mes = new Date().getMonth() + 1, anio = new Date().getFullYear()) {
    try {
        // 1. Obtener trabajadores
        const respTrab = await fetch('/api/trabajadores', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        let trabajadores = await respTrab.json();
        if (!Array.isArray(trabajadores)) {
            trabajadores = trabajadores.trabajadores || trabajadores.data || [];
        }

        // 2. Obtener adelantos
        const respAdelantos = await fetch('/api/adelantos', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        let adelantos = await respAdelantos.json();
        if (!Array.isArray(adelantos)) {
            adelantos = adelantos.adelantos || adelantos.data || [];
        }

        // 3. Procesar información
        const informe = trabajadores.map(t => {
            const adelantosTrab = adelantos.filter(a => 
                a.id_trabajador == t.id_trabajador &&
                new Date(a.fecha).getMonth() + 1 === mes &&
                new Date(a.fecha).getFullYear() === anio
            );

            if (adelantosTrab.length === 0) return null; // 👈 excluir si no tiene adelantos

            const totalAdelantos = adelantosTrab.reduce((sum, a) => sum + (parseFloat(a.monto) || 0), 0);
            const totalBonos = adelantosTrab.reduce((sum, a) => sum + (parseFloat(a.bono) || 0), 0);

            
            //const saldo = (parseFloat(t.sueldo) || 0) - (totalAdelantos + totalBonos);
            const saldo = (parseFloat(t.sueldo) || 0) - totalAdelantos + totalBonos;
            return {
                id_trabajador: t.id_trabajador,
                nombre: `${t.nombres} ${t.apellidos}`,
                sueldo: parseFloat(t.sueldo) || 0,
                totalAdelantos,
                totalBonos,
                saldo
            };
        }).filter(Boolean); // 👈 quitar los null

        renderInformeGeneral(informe, mes, anio);

    } catch (error) {
        console.error("Error al generar informe general:", error);
        showPopup("Error al generar informe general");
    }
}

function renderInformeGeneral(data, mes, anio) {
    const main = document.getElementById('main-content');
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

    // Formato CLP
    const formatoCLP = new Intl.NumberFormat('es-CL', { 
        style: 'currency', 
        currency: 'CLP', 
        minimumFractionDigits: 0 
    });

    // Totales generales
    const totalGeneral = data.reduce((acc, row) => {
        acc.sueldo += row.sueldo;
        acc.adelantos += row.totalAdelantos;
        acc.bonos += row.totalBonos;
        acc.saldo += row.saldo;
        return acc;
    }, { sueldo:0, adelantos:0, bonos:0, saldo:0 });

    main.innerHTML = `
        <style>
            .informe-container {
                font-family: Arial, sans-serif;
            }
            .informe-container h2 {
                margin-bottom: 15px;
                color: #333;
            }
            .informe-container table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.1);
            }
            .informe-container th, .informe-container td {
                padding: 10px 12px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            .informe-container thead {
                background-color: #007BFF;
                color: white;
            }
            .informe-container tfoot {
                background-color: #f5f5f5;
                font-weight: bold;
            }
            .informe-container tr:hover {
                background-color: #f9f9f9;
            }
            .informe-container .saldo-negativo {
                color: red;
                font-weight: bold;
            }
            .informe-container .saldo-positivo {
                color: green;
                font-weight: bold;
            }
            .filtros {
                margin-bottom: 15px;
            }
            .filtros select, .filtros input, .filtros button {
                padding: 5px 8px;
                margin-right: 5px;
                border-radius: 4px;
                border: 1px solid #ccc;
            }
            .filtros button {
                background: #007BFF;
                color: white;
                cursor: pointer;
                border: none;
            }
            .filtros button:hover {
                background: #0056b3;
            }
        </style>

        <div class="informe-container">
            <h2>Informe General - ${meses[mes-1]} ${anio}</h2>
            <div class="filtros">
                <label for="mes">Mes: </label>
                <select id="mes">
                    ${meses.map((m,i) => `
                        <option value="${i+1}" ${i+1===mes ? 'selected':''}>${m}</option>
                    `).join('')}
                </select>
                <label for="anio">Año: </label>
                <input type="number" id="anio" value="${anio}" style="width:90px;">
                <button id="filtrarBtn">Filtrar</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Trabajador</th>
                        <th>Sueldo</th>
                        <th>Total Adelantos</th>
                        <th>Total Bonos</th>
                        <th>Saldo</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td>${row.id_trabajador}</td>
                            <td>${row.nombre}</td>
                            <td>${formatoCLP.format(row.sueldo)}</td>
                            <td>${formatoCLP.format(row.totalAdelantos)}</td>
                            <td>${formatoCLP.format(row.totalBonos)}</td>
                            <td class="${row.saldo < 0 ? 'saldo-negativo' : 'saldo-positivo'}">
                                ${formatoCLP.format(row.saldo)}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2">Totales</td>
                        <td>${formatoCLP.format(totalGeneral.sueldo)}</td>
                        <td>${formatoCLP.format(totalGeneral.adelantos)}</td>
                        <td>${formatoCLP.format(totalGeneral.bonos)}</td>
                        <td>${formatoCLP.format(totalGeneral.saldo)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    // Evento filtro
    document.getElementById('filtrarBtn').addEventListener('click', () => {
        const nuevoMes = parseInt(document.getElementById('mes').value, 10);
        const nuevoAnio = parseInt(document.getElementById('anio').value, 10);
        fetchInformeGeneral(nuevoMes, nuevoAnio);
    });
}




document.querySelector('.button').addEventListener('click', async () => {
    const res = await fetch('/logout', {
      method: 'GET'
    });
    if (res.redirected) {
      window.location.href = res.url; // Redirige al usuario a la página de inicio de sesión
    }
  });

function nextEstado(action) {
  // action viene de tu botón: 'aceptar', 'rechazar', 'marcar-pagado', 'enviar', 'retirar', 'finalizar'
  const map = {
    aceptar:       'aceptado_espera_pago',
    rechazar:      'rechazado',
    'marcar-pagado': 'pagado_espera_envio',
    enviar:        'enviado',
    retirar:       'retirado',
    finalizar:     'finalizado'
  };
  return map[action] || null;
}
