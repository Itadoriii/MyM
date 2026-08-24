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

## Cuando una cuenta aparece sin IP

Caso real: la cuenta `pavlov-9ao9i@rambler.ua` (22 de agosto) quedó sin
`ip_registro`. Hay tres explicaciones posibles y se distinguen con dos consultas.

```sql
-- 1) ¿Quedó constancia del intento en el historial?
SELECT id, fecha, usuario, email, ip, user_agent, resultado, motivo
  FROM registros_auditoria
 WHERE email = 'pavlov-9ao9i@rambler.ua';

-- 2) ¿Cómo se ven las IP del resto de cuentas y pedidos?
SELECT ip_registro, COUNT(*) FROM usuarios  GROUP BY ip_registro ORDER BY 2 DESC;
SELECT ip_pedido,   COUNT(*) FROM pedidos   GROUP BY ip_pedido   ORDER BY 2 DESC;
```

- **No hay ninguna fila en `registros_auditoria`** → cuando se creó esa cuenta
  el código nuevo todavía no estaba corriendo. El `git pull` no basta: hay que
  reiniciar el proceso Node. Se confirma en el log de arranque, que debe traer
  `[SCHEMA]` y `[CONFIG]`.
- **Hay fila, pero con `ip` vacía o repetida en todas las cuentas**
  (`127.0.0.1`, `::1`, o siempre la misma dirección) → Node está detrás de
  nginx/Apache/Cloudflare y falta `TRUST_PROXY=1` en el `.env`. Sin eso se
  guarda la IP del proxy, no la del visitante.
- **Hay fila con una IP real** → el rastro sí está; lo que faltó fue copiarlo a
  la tabla de usuarios (ver el backfill de abajo).

Para ver qué IP está viendo el servidor ahora mismo, con la sesión de admin
abierta: `GET /api/diag/ip`. Devuelve `req.ip`, la dirección del socket, el
valor de `TRUST_PROXY` y las cabeceras `X-Forwarded-For`, `CF-Connecting-IP` y
`X-Real-IP`. Si `ipGuardada` sale `127.0.0.1` pero `x-forwarded-for` trae una IP
pública, el diagnóstico es el proxy.

### Recuperar las IP que sí quedaron auditadas

El historial de `registros_auditoria` conserva la IP aunque `usuarios` la tenga
vacía. Este backfill la copia:

```sql
UPDATE usuarios u
  JOIN registros_auditoria r
    ON r.id_usuario = u.id_usuarios AND r.resultado = 'creado'
   SET u.ip_registro = r.ip
 WHERE u.ip_registro IS NULL AND r.ip IS NOT NULL;
```

### Qué se corrigió en el código

- `utils/client-ip.js` (nuevo): un solo sitio decide cuál es la IP del
  visitante. Normaliza las IPv6 mapeadas (`::ffff:190.1.2.3` se guardaba
  distinto de `190.1.2.3`, así que la misma persona parecían dos) y, **solo si
  `TRUST_PROXY` está definido**, prefiere `CF-Connecting-IP` / `X-Real-IP`, que
  es donde Cloudflare pone la IP real y que Express no mira por su cuenta. Sin
  esa variable las cabeceras se ignoran, porque cualquiera puede falsificarlas.
- El registro guarda la IP **en el propio `INSERT`**. Antes se hacía con un
  `UPDATE` posterior dentro de un `try/catch` que se tragaba el error: si la
  columna no existía, la cuenta se creaba sin rastro y en silencio. Ahora, si
  falta la columna, queda un `console.error` explícito en el log.
- El arranque avisa por consola cuando `TRUST_PROXY` no está configurado.

## Auditoría completa (24 de agosto de 2026)

Revisión de las 50 rutas del backend, los middlewares de sesión, el filtro de
correos y el panel, a raíz de los registros automatizados desde dominios rusos.

### 🔴 La brecha principal no está en el código: el repositorio es público

`github.com/Itadoriii/MyM` es **público** y tiene versionados siete volcados de
la base de datos (`back8oct.sql`, `bd0807.sql`, `bd11sep.sql`, `bd1sep.sql`,
`mymconphp.sql`, `sebasti9_mym2 (1).sql`). Dentro va la tabla `usuarios`
completa: nombres, correos, teléfonos y **261 hashes de contraseña**, de los
cuales **139 son bcrypt de coste 5** — un coste tan bajo que se prueban miles
de millones de contraseñas por hora en una tarjeta gráfica corriente. Entre
esos hashes están las **dos cuentas de administrador** (`a@a.cl` y
`maderas.mym@gmail.com`).

Además, `reset_admin_password.js` trae escrita en el fuente la contraseña
temporal del usuario `admin`: `Admin123!`. Si alguna vez se ejecutó y no se
cambió después, la clave del panel está publicada en internet.

Nadie necesitó encontrar un fallo: el repositorio entrega los correos a los que
apuntar, los hashes que romper y el mapa completo de la API. Mientras siga
público, cualquier arreglo de código es secundario.

**Qué hacer, en este orden:**

1. Poner el repositorio en **privado** (Settings → General → Danger Zone →
   Change visibility).
2. Cambiar la contraseña de **las dos cuentas admin** y rotar `JWT_SECRET`
   (esto último cierra cualquier sesión que un atacante tuviera abierta).
3. Sacar los volcados del repositorio:
   ```bash
   git rm --cached back8oct.sql bd0807.sql bd11sep.sql bd1sep.sql \
                   mymconphp.sql "sebasti9_mym2 (1).sql"
   git commit -m "Saca los volcados de la base de datos del repositorio"
   ```
   El `.gitignore` ya los excluye a futuro (`*.sql`, salvo `migrations/`).
4. Borrarlos también del **historial**, o seguirán descargables:
   ```bash
   pip install git-filter-repo
   git filter-repo --path-glob '*.sql' --invert-paths --force
   git push --force
   ```
   Reescribe el historial: avisa a quien tenga una copia del repositorio antes.
5. Borrar `reset_admin_password.js` o quitarle la contraseña fija.
6. Volver a hashear las contraseñas de coste 5. Como no se pueden descifrar,
   lo práctico es forzar el cambio: vaciar la contraseña de esas cuentas y
   avisarles que usen "olvidé mi contraseña". Los registros nuevos ya salen
   con coste 10.

### 🟠 Agujeros de código corregidos

| Qué | Por qué importaba |
|---|---|
| `JWT_SECRET` tenía el valor por defecto `'dev-secret'`, visible en el repo | Con ese secreto cualquiera se firma un token `{role:'admin'}` y entra al panel sin contraseña. Ahora, si falta la variable, se genera uno aleatorio al arrancar y el log lo avisa: nadie puede falsificar tokens |
| `SESSION_SECRET` tenía por defecto `'your_secret_key'` | Igual que el anterior, para las sesiones de Passport |
| Cada archivo verificaba el JWT por su cuenta con `process.env.JWT_SECRET` | Si la variable faltaba, unos módulos firmaban con un secreto y otros validaban con otro. Ahora todos pasan por `verifyJWT()` |
| **El rol salía del token**, que dura 7 días | Quitarle el rol de admin a alguien, o bloquearlo, no le cerraba el panel hasta que expirase su cookie. Ahora `revisarCookie()` relee rol y bloqueo de la base en cada petición, y una cuenta bloqueada pierde la sesión al instante |
| `/auth/google` creaba cuentas **saltándose todo el antiabuso** | Sin captcha, sin filtro de dominios, sin límite por IP, sin registrar la IP y sin dejar rastro en el historial; y el callback entregaba la sesión sin mirar si la cuenta estaba bloqueada, así que un bloqueado volvía a entrar por ahí. Además emitía la cookie con `secure:false`, que viaja también por HTTP. Ahora la ruta **no se monta** salvo que estén las tres variables de Google, y cuando se monta pasa por el mismo filtro de correo, deja auditoría con IP y respeta el bloqueo |
| `/api/trabajadores` y `/api/adelantos` (10 rutas) leían el rol del token | Sueldos y adelantos del personal. Migradas a `requireApiAdmin`, que consulta la base |
| El nombre de usuario admitía cualquier carácter | Registrarse como `<img src=x onerror=...>` metía código en el panel y en los correos. Ahora solo letras, números, espacio, punto, guion y guion bajo, de 3 a 50 |
| Los correos de pedido metían el comentario del cliente **sin escapar** | Se podían colar enlaces con formato en el correo que llega al administrador: un "paga aquí" que apunta a otro sitio y parece de la tienda. Ahora todo campo libre se escapa y se corta a 500 caracteres |
| `/api/verify/resend` respondía `404 USER_NOT_FOUND` | Servía para averiguar qué correos están registrados, y para reenviar correos a una dirección ajena en bucle. Ahora la respuesta es idéntica exista o no la cuenta |
| El límite de login era solo por IP | Una botnet prueba contraseñas desde miles de direcciones distintas y ninguna llega al tope. Se añadió un segundo límite **por cuenta atacada**: 15 intentos cada 15 min sobre el mismo usuario, vengan de donde vengan |
| Sin cabeceras de seguridad | Se añadieron `X-Frame-Options` (el panel no se puede enmarcar en otra página), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y HSTS en producción |
| `express.json()` sin tope de tamaño | Un POST de varios MB ocupaba memoria del proceso. Tope de 100 kB |
| `/productos?limit=` sin tope | `?limit=999999` volcaba el catálogo entero. Tope de 100 |
| `verifyToken` hacía `SELECT *` de usuarios | Traía el hash y los tokens de recuperación a memoria en cada petición. Ahora solo las columnas que se usan, y comprueba `bloqueado` |
| `ESTADOS_CON_STOCK_DESCONTADO` decía `pagado_espera_despacho` | Ese estado no existe: el canónico es `pagado_espera_envio`. Al cancelar un pedido ya pagado **el stock no volvía a bodega**. Mismo error en la tabla `NEXTS` |

### 🟡 Lo que hay que configurar en el `.env` (si no, no sirve de nada)

Tres variables deciden si la mitad de las defensas funciona. Al arrancar, el
log dice ahora el estado de cada una:

```
[CONFIG] captcha Turnstile DESACTIVADO: el registro está abierto a bots.
[CONFIG] trust proxy DESACTIVADO: ... las IP registradas serán las del proxy.
[FATAL]  falta JWT_SECRET en el .env.
```

Si aparece cualquiera de esas líneas, esa defensa **no está puesta**. Sin
`TURNSTILE_SECRET_KEY` el registro no tiene captcha, que es exactamente lo que
permite crear cuentas en cadena.

### Filtro de correo ampliado

`rambler.ua` no era un buzón desechable: es un proveedor ruso real, con MX
válidos, así que pasaba todos los filtros. Se añadió a `email-guard.js` la
lista de proveedores gratuitos de Rusia y Ucrania que usan las granjas de
cuentas (`mail.ru`, `rambler.*`, `yandex.*`, `ukr.net`, `bk.ru`, `list.ru`,
`i.ua`, `tut.by`…). Para una maderera que vende en Chile no hay cliente
legítimo detrás de esos dominios; aun así se revierte con
`EMAIL_PERMITIR_EXTRANJEROS=1` en el `.env`, sin tocar código.

### Lo que se revisó y está bien

- **Inyección SQL**: todas las consultas usan parámetros `?`. No hay
  concatenación de entrada del usuario en ningún `WHERE`.
- **Control de acceso**: las 50 rutas tienen middleware. No queda ninguna
  ruta de administración abierta.
- **Contraseñas**: bcrypt con coste 10 en registro y recuperación; el login
  responde el mismo mensaje exista o no el usuario.
- **Tokens de verificación y recuperación**: aleatorios de 32 bytes, guardados
  hasheados con SHA-256, de un solo uso y con caducidad.
- **Precio de los pedidos**: se toma de la base, nunca del navegador.
- **Secretos**: el `.env` nunca se subió al repositorio (comprobado en todo el
  historial) y no hay credenciales escritas en el código, salvo la de
  `reset_admin_password.js`.

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
- Los volcados `.sql` siguen en el **historial** de un repositorio público
  hasta que se haga la limpieza descrita arriba. Es el punto abierto más grave.
- El captcha de Turnstile falla abierto: si Cloudflare no responde en 6 s, el
  registro pasa igual. Es deliberado (no dejar de vender por una caída ajena),
  pero un atacante que sepa provocar el timeout se lo salta.
- El límite de peticiones vive en memoria: reiniciar el proceso pone los
  contadores a cero.
- No hay Content-Security-Policy. Las páginas usan `<script>` en línea, así que
  activarla exige moverlos a archivos antes.
