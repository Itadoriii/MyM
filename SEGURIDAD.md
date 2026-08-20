# Endurecimiento antiabuso — Maderas MyM

Respuesta al abuso en producción: cuentas falsas y pedidos que vaciaban el stock.

## Qué estaba pasando

El problema no eran las cuentas falsas. Seis rutas de administración estaban
abiertas a internet **sin ninguna autenticación**, de modo que cualquiera podía
llamarlas con `curl` sin siquiera registrarse:

| Ruta | Qué permitía |
|---|---|
| `PUT /api/productos/:id` | Cambiar el stock y el precio de cualquier producto |
| `PUT /api/pedidos/:id/estado` | Aceptar pedidos, que es lo único que descuenta stock |
| `POST /api/productos` | Crear productos |
| `GET /api/usuarios` | `SELECT *` de usuarios: correos, teléfonos, hashes de contraseña y tokens |
| `GET /api/pedidos` | Todos los pedidos con datos de clientes |
| `GET /api/mis-pedidos?user=X` | Los pedidos de cualquier cliente |

## Cambios aplicados

### Fase 1 — Control de acceso
- `middlewares/api-auth.js` (nuevo): `requireApiAuth` y `requireApiAdmin`.
  Responden JSON en vez de redirigir a `/login`, que es lo que necesita el
  panel al llamar con `fetch()`. El rol se lee **de la base de datos**, no del
  JWT: al degradar o bloquear a alguien deja de ser admin al instante.
- Las seis rutas de arriba exigen ahora sesión de administrador.
- `GET /api/usuarios` ya no hace `SELECT *`: devuelve solo las columnas que usa
  el panel. Nunca vuelve a exponer hashes ni tokens.
- `GET /api/mis-pedidos` toma la identidad de la cookie. El `?user=` solo lo
  respeta si quien pregunta es admin.

### Fase 2 — Quitar las palancas
- **Precio desde la base de datos.** `/api/generar-pedido` usaba el `precio` que
  mandaba el navegador; se podían generar pedidos a $0. Ahora se ignora.
- **Fuga de conexiones.** El camino de éxito nunca hacía `connection.release()`.
  Con `connectionLimit: 10`, el sitio se colgaba entero tras una decena de
  pedidos. Corregido, con bandera `liberada` para no liberar dos veces.
- **Sin duplicados.** Si algo falla después del `commit` (por ejemplo el correo),
  ya no se reintenta el pedido ni se devuelve error de algo que sí se guardó.
- **Carrito validado.** Se agrupan las líneas repetidas del mismo producto:
  antes, dos líneas de 5 unidades se comparaban por separado contra el stock y
  un producto con 6 en bodega dejaba pasar un pedido de 10. Tope de 100 unidades
  por producto y 30 productos distintos.
- **Rate limit** (`middlewares/rate-limit.js`, sin dependencias nuevas):
  registro 5/hora por IP, login 10/15min, correos 5/15min, pedidos 10/hora.
- **CORS restringido** a los orígenes de `ALLOWED_ORIGINS`.

### Fase 3 — Antiabuso de cuentas
- **Captcha** Cloudflare Turnstile en el registro (`utils/turnstile.js`).
  Si no hay clave configurada queda desactivado y el registro sigue funcionando.
- **Filtro de correos** (`utils/email-guard.js`): rechaza ~60 dominios
  desechables y los dominios sin registro MX (inventados).
- **Veto al correo institucional DUOC** (`duocuc.cl`, `duoc.cl` y sus
  subdominios, como `alumnos.duocuc.cl` o `profesor.duoc.cl`), por decisión del
  negocio tras el abuso reiterado desde esa institución. Se revierte poniendo
  `EMAIL_INSTITUCIONALES_PERMITIDOS=1` en el `.env`, sin tocar código.
  Ojo: esto no obliga a nadie a dar datos reales — un Gmail es igual de anónimo
  y más fácil de conseguir. Lo que hace es cortar el flujo del grupo concreto
  que estaba abusando.
- **Bloqueo de cuentas**: botón en el panel de usuarios. Una cuenta bloqueada no
  inicia sesión ni genera pedidos, y opcionalmente se le cancelan los pedidos
  abiertos devolviendo el stock a bodega.
- **Cancelación en lote**: casillas en la tabla de pedidos y botón "Cancelar
  seleccionados". Devuelve stock solo si de verdad se había descontado.
- **Rastro**: se guarda `ip_registro` en usuarios e `ip_pedido` en pedidos.
- **Historial de registros** (`registros_auditoria` + `utils/audit.js`): queda
  constancia de cada intento de crear cuenta, salga bien o mal — usuario,
  correo, teléfono, IP, navegador y el motivo del rechazo. Se ve en el panel en
  la sección **Registros**, con filtros por resultado, buscador por
  usuario/correo/IP y un resumen de las IPs con varios intentos en 24 h. Desde
  ahí se banea directamente. También se auditan los intentos cortados por el
  rate limit (`motivo = RATE_LIMIT`), que no llegan al controlador y son la
  señal más clara de que alguien está creando cuentas en cadena.
- **Escape de HTML en el panel** (`esc()` en `admin.js`): las tablas mostraban
  sin escapar el nombre de usuario, el correo y el comentario del pedido, que
  son texto que escribe el visitante. Alguien podía registrarse como
  `<img src=x onerror=...>` y ejecutar código en el navegador del administrador
  al abrir la tabla. Corregido en usuarios, pedidos y registros.

## Despliegue

1. `git pull` y reiniciar el proceso. **No hace falta `npm install`**: no se
   añadieron dependencias, a propósito, para que el despliegue no pueda fallar.
2. Las columnas nuevas (`bloqueado`, `motivo_bloqueo`, `bloqueado_at`,
   `ip_registro`, `ip_pedido`) las crea solo `ensureSchema()` al arrancar. Si el
   usuario de MySQL no tiene permiso de `ALTER`, aplícalas a mano.
3. Añadir al `.env` de producción:

```
# Origenes permitidos para llamar a la API (separados por coma)
ALLOWED_ORIGINS=https://maderasmym.cl,https://www.maderasmym.cl

# Solo si Node está detrás de nginx/Apache/Cloudflare. Sin esto el rate limit
# ve la IP del proxy y no la del visitante. NO lo actives si Node recibe el
# tráfico directo: permitiría falsear la IP con X-Forwarded-For.
TRUST_PROXY=1

# Captcha (https://dash.cloudflare.com → Turnstile). Sin estas claves el
# registro funciona igual, pero sin captcha.
TURNSTILE_SITE_KEY=0x...
TURNSTILE_SECRET_KEY=0x...

# Opcional: dominios extra a rechazar en el registro (aplica a subdominios)
# EMAIL_DOMINIOS_BLOQUEADOS=dominio1.cl,dominio2.com

# Opcional: volver a admitir el correo institucional DUOC
# EMAIL_INSTITUCIONALES_PERMITIDOS=1
```

4. **Rotar credenciales.** Los hashes de contraseña salieron por
   `/api/usuarios`, así que hay que cambiar la contraseña de admin y el
   `JWT_SECRET` (rotarlo cierra todas las sesiones abiertas, incluidas las que
   pudieran tener los atacantes).

## Purga del historial

`registros_auditoria` crece con cada intento. No se purga sola. Si con el tiempo
molesta, basta con:

```sql
DELETE FROM registros_auditoria WHERE fecha < DATE_SUB(NOW(), INTERVAL 6 MONTH);
```

## Limpiar las cuentas DUOC que ya existen

El veto solo afecta a los registros nuevos. Para encontrar las que ya están
creadas y bloquearlas desde el panel:

```sql
SELECT id_usuarios, `user`, email, ip_registro, email_verificado_at
  FROM usuarios
 WHERE email LIKE '%duocuc.cl' OR email LIKE '%duoc.cl'
 ORDER BY id_usuarios DESC;
```

Con esos ids, el botón **Bloquear** de la tabla de usuarios ofrece cancelar de
paso sus pedidos abiertos y devolver el stock a bodega.

## Pendiente / conocido

- `src/register.js` no lo carga ningún HTML: el formulario envía de forma
  nativa. Es código muerto.
- `src/admin.js` define `rechazarPedido()` y `aceptarPedido()`, que llaman a
  `/api/pedidos/:id/rechazar` y `/confirmar-mail`; esas rutas no existen en el
  backend. Solo están expuestas en `window`, ningún botón las usa: el flujo real
  pasa por `/api/pedidos/:id/estado`.
- `admin.js` llama a `DELETE /api/productos/:id`, que tampoco existe (404).
- El rate limit vive en memoria del proceso. Si algún día levantas varias
  instancias de Node, hay que moverlo a Redis para que compartan el contador.
- Los volcados `.sql` están versionados en el repo de GitHub. Conviene sacarlos
  del control de versiones si contienen datos de clientes.
