# Endurecimiento antiabuso — Maderas MyM

Respuesta al abuso en producción: cuentas falsas y pedidos que vaciaban el stock.

> **Actualización (auditoría posterior).** Al revisar el sitio aparecieron brechas
> nuevas y una explicación para la columna IP que mostraba `127.0.0.1`. Están
> todas detalladas al final, en
> [Auditoría 2026 — brechas encontradas](#auditoría-2026--brechas-encontradas).

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

# Auditoría 2026 — brechas encontradas

Segunda revisión del código completo (rutas, middlewares, controladores y panel).

## Primero: por qué la IP salía 127.0.0.1

No era un problema de la columna ni de la consulta. Node está detrás de un proxy
(nginx/Apache y probablemente Cloudflare), así que la conexión que recibe Node
viene **del propio servidor**: `req.ip` era `127.0.0.1` para todo el mundo. El
dato se guardaba bien, pero guardaba al proxy, no al visitante.

Consecuencias, que era lo grave:

- El **rate limit de registro (5/hora) se agotaba entre todos**. Cinco registros
  de cualquier persona dejaban sin poder registrarse al resto del país.
- La auditoría no servía para rastrear abuso: todas las filas decían `127.0.0.1`.
- Lo mismo para el límite de login, correos y pedidos.

**Corregido.** `utils/client-ip.js` resuelve la IP real:

1. Si el sitio está detrás de Cloudflare, usa `CF-Connecting-IP` (Cloudflare lo
   sobrescribe; el cliente no puede falsificarlo).
2. Si no, `X-Real-IP` de nginx.
3. Si no, la **última** entrada de `X-Forwarded-For` (la que agrega el proxy más
   cercano; la primera la controla el cliente).

Las cabeceras solo se aceptan si la conexión directa llega de `127.0.0.1` o de una
red privada, o si se activa `TRUST_PROXY`. Un atacante en internet no puede hacer
que su conexión parezca local, así que no puede falsear la IP. La utilidad la usan
ahora la auditoría, el rate limit, el registro y el guardado de `ip_pedido`.

Recomendado añadir al `.env` de producción:

```
TRUST_PROXY=1            # una capa de proxy (nginx)
# TRUST_PROXY=cloudflare # si además hay Cloudflare delante
```

Sin esto igual funciona cuando el proxy es local; `TRUST_PROXY` solo hace
explícita la configuración y cubre proxies que no sean locales.

## Brechas corregidas

| # | Gravedad | Qué era | Cómo quedó |
|---|---|---|---|
| 1 | Crítica | `reset_admin_password.js` traía `admin` / `Admin123!` **hardcodeado y en GitHub**. Cualquiera con acceso al repo conocía la contraseña del administrador. | El script pide usuario y contraseña por parámetro; si no se pasa, genera una aleatoria. **Hay que cambiar ya la contraseña del admin en producción.** |
| 2 | Crítica | `JWT_SECRET=textosecretoDECIFRADO` y `SESSION_SECRET=your_secret_key`. Con esa clave se puede firmar un JWT de admin. | Se rotaron a valores aleatorios de 48 bytes en el `.env`. **Hay que hacer lo mismo en el servidor: al rotar, todas las sesiones se cierran.** |
| 3 | Crítica | El **login con Google saltaba todo** el antiabuso: no pasaba por el filtro de correos (se podía entrar con `duocuc.cl`), no comprobaba `bloqueado` y no pasaba por captcha ni rate limit. | Google ahora valida el correo con `email-guard`, rechaza cuentas bloqueadas y marca el correo como verificado. |
| 4 | Alta | La **IP del proxy** en toda la auditoría (ver arriba). | `utils/client-ip.js`. |
| 5 | Alta | La autorización leía el **rol del JWT**, no de la base: a un admin degradado o bloqueado le seguía funcionando `/admin`, `/api/trabajadores`, `/api/adelantos` y el cambio de contraseñas hasta 7 días. | `requireAuth`, `requireRole` y `soloAdmin` leen la cuenta de la base y comprueban `bloqueado`. |
| 6 | Alta | Los volcados `.sql` del repo tienen **124 correos reales y 312 hashes bcrypt** de clientes. | `*.sql` agregado a `.gitignore`. **Falta sacarlos del repo y de su historial (ver abajo).** |
| 7 | Media | Las rutas de trabajadores y adelantos usaban `verifyToken`, que **redirige a `/login`** en vez de responder JSON; además traían `SELECT *`. | Pasan por `requireApiAdmin` (JSON, rol desde la base). |
| 8 | Media | Casi todos los `catch` devolvían `err.message` al cliente: filtraba nombres de tablas y columnas de MySQL. | Mensaje genérico al cliente; el detalle queda en el log del servidor. |
| 9 | Media | El panel no tenía **cabeceras de seguridad**: clickjacking sobre los botones de bloquear/cancelar, sniffing de tipos. | `middlewares/security-headers.js`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS solo sobre HTTPS y sin `X-Powered-By`. |
| 10 | Media | La cookie `jwt` se marcaba `Secure` solo si `NODE_ENV=production`, variable que **no estaba definida**: viajaba también por HTTP. | `setAuthCookie` la marca `Secure` si `NODE_ENV` es producción, si `COOKIE_SECURE=1` o si la petición llegó por HTTPS. |
| 11 | Media | XSS almacenado en el panel: nombre/tipo/medidas de productos, datos de trabajadores, adelantos y motivos se insertaban sin escapar. | Todo pasa por `esc()` (tablas, formularios, selects y el popup). |
| 12 | Media | El HTML de los correos (verificación, reset, pedido) insertaba el nombre de usuario y los comentarios sin escapar. | Se escapan con `escaparHtml()`. |
| 13 | Baja | `/api/verify/resend` devolvía 404 cuando el correo no existía: **enumeraba cuentas**. | Responde siempre `{ ok: true }`. |
| 14 | Baja | `/api/verificar-usuario` daba por conectada una cuenta borrada o bloqueada. | Comprueba `bloqueado` y existencia en la base. |
| 15 | Baja | El callback de Google estaba fijo en `http://localhost:3000`. | Usa `GOOGLE_CALLBACK_URL_PROD` (que ya existía en el `.env` sin usarse). |
| 16 | Bug de stock | Al cancelar un pedido ya pagado no se devolvía el stock: la lista de estados decía `pagado_espera_despacho` y el estado real es `pagado_espera_envio`. | Corregido, con el alias antiguo para las filas existentes. |

## Acciones que dependen de ti (no se pueden hacer desde el código)

1. **Cambiar la contraseña del admin.** El script con `Admin123!` estuvo en
   GitHub; hay que asumir que esa clave es pública.
2. **Rotar `JWT_SECRET` y `SESSION_SECRET` en el servidor** (aquí ya se rotaron en
   el `.env` local). Cierra todas las sesiones abiertas, incluidas las de quien
   hubiera entrado con el secreto viejo.
3. **Sacar los `.sql` del historial de Git.** Ya no se versionan a futuro, pero
   siguen en los commits anteriores:
   ```bash
   git rm --cached *.sql
   git commit -m "quitar volcados con datos de clientes"
   # y reescribir el historial con git-filter-repo o BFG, luego forzar push
   ```
   Al filtrar el historial hay que **rotar también las contraseñas de todos los
   usuarios**: los 312 hashes quedaron expuestos y son crackeables.
4. **Definir `BASE_URL` en el `.env`.** Sin esa variable los enlaces de
   verificación y de recuperación se arman con `http://maderasmym.cl` (HTTP, sin
   `www`). Si el sitio real es otro dominio, los correos llegan con enlaces rotos
   y el token viaja sin cifrar.
5. **Activar el captcha.** `TURNSTILE_SECRET_KEY` no está definido, así que el
   captcha está desactivado y el registro queda sin esa fricción.
6. Revisar los registros de `registros_auditoria` anteriores a esta corrección:
   las IP guardadas son `127.0.0.1`, no sirven para rastrear nada.

## Login con Google: por qué "quedó desconectado" y cómo se reconectó

El backend (`/auth/google` y `/auth/google/callback`) **nunca se borró**. Lo que
desapareció fue el botón: en el commit `e1b13ce` ("online test") se eliminó de
`src/login.html` el bloque

```html
<a href="/auth/google"><button type="button">Iniciar sesión con Google</button></a>
```

y quedó una línea en blanco. Sin botón, no había forma de llegar a la ruta.

Qué se hizo:

- Se restauró el botón en `login.html` ("Continuar con Google"), con su estilo en
  `stylelr.css` (`.auth-sep` y `.btn-google`), coherente con el resto del diseño.
- El `callbackURL` estaba fijo en `http://localhost:3000`, así que en el dominio
  real Google devolvía `redirect_uri_mismatch`. Ahora se calcula por petición
  según el dominio de entrada: coincide con `GOOGLE_CALLBACK_URL_PROD` cuando el
  host es ese, arma `http://localhost:3000/...` en local y usa el host real para
  cualquier otro dominio. Comprobado con los tres casos:
  - `localhost:3000` → `http://localhost:3000/auth/google/callback`
  - `sebastiancastro.cl` → `https://sebastiancastro.cl/auth/google/callback`
  - `maderasmym.cl` → `https://maderasmym.cl/auth/google/callback`
- Si el login falla, ahora vuelve a `/login?google=error` y la página muestra un
  aviso claro en vez de dejar al usuario sin explicación.

**Para que funcione hay que registrar la URI de redireccionamiento en Google
Cloud Console** (APIs y servicios → Credenciales → tu cliente OAuth → URI de
redireccionamiento autorizados). Deben estar **todas** las que uses:

```
https://maderasmym.cl/auth/google/callback
https://www.maderasmym.cl/auth/google/callback
https://sebastiancastro.cl/auth/google/callback
http://localhost:3000/auth/google/callback   (solo para desarrollo)
```

Si usas varios dominios, puedes declararlos en el `.env` para que la coincidencia
sea explícita (separados por coma):

```
GOOGLE_CALLBACK_URLS=https://maderasmym.cl/auth/google/callback,https://www.maderasmym.cl/auth/google/callback
```

La cuenta que entra por Google ya queda con el correo marcado como verificado
(Google lo comprobó), pero sigue pasando por el filtro de correos, así que un
`@duocuc.cl` o un dominio desechable se rechaza igual que en el registro normal.

## Pendiente / conocido (nuevo)
- **No hay CSP.** Las páginas usan scripts y estilos en línea; una CSP mal
  calibrada deja el sitio en blanco. Es la siguiente cabecera a añadir, probándola
  primero en un entorno de pruebas.
- **El rate limit sigue en memoria** y está por IP, no por cuenta: un atacante con
  muchas IPs (o con proxies) puede repartir los intentos de login. Falta bloqueo
  progresivo por cuenta.
- `app.listen()` se llama **antes** de definir las rutas. Funciona, pero durante
  los primeros milisegundos del arranque las peticiones reciben 404.
- El `logger` de la última línea de `index.js` está después de todas las rutas,
  así que no registra nada del tráfico que sí se atiende.
- Los volcados `.sql` siguen en el disco y en el historial hasta que se complete
  el punto 3 de arriba.

