#!/usr/bin/env bash
# scripts/logs-seguridad.sh
#
# Recoge un informe de seguridad del servidor para poder revisarlo (o pasarlo a
# otra persona) sin exponer credenciales, hashes de contraseña ni datos de
# clientes que no vengan al caso.
#
# Uso, en el servidor, desde la carpeta del proyecto:
#
#   bash scripts/logs-seguridad.sh                 # panorama general
#   bash scripts/logs-seguridad.sh 102.31.149.126  # todo lo de esa IP
#   bash scripts/logs-seguridad.sh 102.31.149.126 > informe.txt
#
# No modifica nada: solo lee.

set -u

IP_OBJETIVO="${1:-}"
DIAS="${DIAS:-7}"

seccion() { printf '\n===== %s =====\n' "$1"; }
nota()    { printf '  (%s)\n' "$1"; }

echo "Informe de seguridad — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "Host: $(hostname)   IP objetivo: ${IP_OBJETIVO:-<ninguna, solo panorama>}"

# ---------------------------------------------------------------------------
# 1. Base de datos: historial de intentos de registro/login (registros_auditoria)
# ---------------------------------------------------------------------------
seccion "1. Intentos registrados en la base (últimos ${DIAS} días)"

if [ -f .env ]; then
  # Las credenciales se leen del .env y se pasan por un archivo temporal con
  # permisos 600, para que no aparezcan en `ps` ni en el historial.
  DB_HOST=$(grep -E '^DB_HOST=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
  DB_PORT=$(grep -E '^DB_PORT=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
  DB_USER=$(grep -E '^DB_USER=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
  DB_PASS=$(grep -E '^DB_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
  DB_NAME=$(grep -E '^DB_NAME=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')

  CNF=$(mktemp)
  chmod 600 "$CNF"
  # shellcheck disable=SC2064
  trap "rm -f '$CNF'" EXIT
  {
    printf '[client]\n'
    printf 'host=%s\n' "${DB_HOST:-localhost}"
    printf 'port=%s\n' "${DB_PORT:-3306}"
    printf 'user=%s\n' "${DB_USER:-root}"
    printf 'password=%s\n' "${DB_PASS:-}"
    printf 'database=%s\n' "${DB_NAME:-}"
  } > "$CNF"

  MYSQL=$(command -v mysql || command -v mariadb || true)
  if [ -n "$MYSQL" ]; then
    consulta() { "$MYSQL" --defaults-extra-file="$CNF" --batch --raw -e "$1" 2>/dev/null; }

    echo "-- IPs con más intentos --"
    consulta "SELECT ip, COUNT(*) AS intentos,
                     SUM(resultado='rechazado') AS rechazados,
                     SUM(resultado='creado') AS creadas,
                     MIN(fecha) AS desde, MAX(fecha) AS hasta
                FROM registros_auditoria
               WHERE fecha >= DATE_SUB(NOW(), INTERVAL ${DIAS} DAY) AND ip IS NOT NULL
               GROUP BY ip ORDER BY intentos DESC LIMIT 20;"

    echo
    echo "-- Motivos más frecuentes --"
    consulta "SELECT motivo, COUNT(*) AS veces
                FROM registros_auditoria
               WHERE fecha >= DATE_SUB(NOW(), INTERVAL ${DIAS} DAY)
               GROUP BY motivo ORDER BY veces DESC LIMIT 20;"

    if [ -n "$IP_OBJETIVO" ]; then
      echo
      echo "-- Detalle de la IP ${IP_OBJETIVO} --"
      consulta "SELECT fecha, usuario, email, resultado, motivo, user_agent
                  FROM registros_auditoria
                 WHERE ip = '${IP_OBJETIVO}'
                 ORDER BY fecha DESC LIMIT 60;"
    fi
  else
    nota "no hay cliente mysql/mariadb en el servidor"
  fi
else
  nota "no encontré el .env en $(pwd); ejecútalo desde la carpeta del proyecto"
fi

# ---------------------------------------------------------------------------
# 2. Logs del proceso Node (aquí salen los [RATE-LIMIT] y los [AUTH])
# ---------------------------------------------------------------------------
seccion "2. Logs del proceso Node"

if command -v pm2 >/dev/null 2>&1 && pm2 pid >/dev/null 2>&1; then
  pm2 list 2>/dev/null | sed -n '1,20p'
  echo
  nota "últimas advertencias relevantes (pm2)"
  pm2 logs --nostream --lines 4000 2>/dev/null \
    | grep -aiE "RATE-LIMIT|AUTH|GOOGLE|FATAL|error|bloquead" \
    | tail -n 200
elif command -v journalctl >/dev/null 2>&1; then
  # Primero, intenta identificar el servicio por su nombre aunque no sea
  # exactamente "mym" o "node".
  nota "servicios que parecen la app:"
  systemctl list-units --type=service --state=running --no-legend 2>/dev/null \
    | grep -iE "mym|maderas|node" | head -5 || true

  ENCONTRADO=0
  for unidad in $(systemctl list-units --type=service --all --no-legend 2>/dev/null \
                  | awk '{print $1}' | grep -iE "mym|maderas|node" | head -5); do
    echo "--- journalctl -u $unidad ---"
    journalctl -u "$unidad" --since "-${DIAS} days" --no-pager 2>/dev/null \
      | grep -aiE "RATE-LIMIT|AUTH|GOOGLE|FATAL|error|bloquead" | tail -n 200
    ENCONTRADO=1
  done

  if [ "$ENCONTRADO" = "0" ]; then
    # Sin unidad identificada: busca en todo el journal del periodo. Es más
    # lento, pero encuentra los [RATE-LIMIT] igual.
    nota "sin servicio identificado; buscando en todo el journal"
    journalctl --since "-${DIAS} days" --no-pager 2>/dev/null \
      | grep -aiE "RATE-LIMIT|\[AUTH\]|\[GOOGLE\]|FATAL" | tail -n 200
  fi

  nota "si la app corre con 'node index.js' dentro de tmux/screen o con nohup, sus logs están en el archivo de la sección siguiente"
else
  nota "no hay pm2 ni journalctl disponibles"
fi

if [ -n "$IP_OBJETIVO" ]; then
  echo
  echo "-- Menciones de ${IP_OBJETIVO} en logs locales --"
  # --exclude-dir=journal: los .journal son binarios y llenaban el informe de
  # bytes nulos. Los logs del proceso se leen con journalctl (sección 2).
  grep -ras --exclude-dir=journal --exclude-dir=wtmpdb "${IP_OBJETIVO}" /var/log 2>/dev/null | tail -n 50
fi

# Logs propios de la app (nohup, redirecciones, pm2 dentro del proyecto)
echo
echo "-- Archivos de log en la carpeta del proyecto --"
find . -maxdepth 2 -type f \( -name "nohup.out" -o -name "*.log" \) -not -path "./node_modules/*" 2>/dev/null | head -10
for f in nohup.out app.log server.log out.log; do
  if [ -r "$f" ]; then
    echo "--- $f (últimas líneas relevantes) ---"
    grep -aiE "RATE-LIMIT|AUTH|GOOGLE|FATAL|error|bloquead" "$f" 2>/dev/null | tail -n 80
  fi
done

# ---------------------------------------------------------------------------
# 3. nginx / Apache: quién llamó a qué
# ---------------------------------------------------------------------------
seccion "3. Servidor web (nginx / Apache)"

LOGS_WEB=""
for f in /var/log/nginx/access.log /var/log/nginx/access.log.1 \
         /var/log/apache2/access.log /var/log/apache2/access.log.1 \
         /var/log/httpd/access_log; do
  [ -r "$f" ] && LOGS_WEB="$LOGS_WEB $f"
done

if [ -z "$LOGS_WEB" ]; then
  nota "no puedo leer los access.log (¿hace falta sudo?). Prueba: sudo bash $0 ${IP_OBJETIVO}"
  nota "si el sitio entra por Cloudflare Tunnel (cloudflared) no hay nginx: mirar Cloudflare -> Security -> Events / Analytics"
else
  echo "-- IPs con más peticiones --"
  # shellcheck disable=SC2086
  cat $LOGS_WEB 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -20

  if [ -n "$IP_OBJETIVO" ]; then
    echo
    echo "-- Rutas que pidió ${IP_OBJETIVO} --"
    # shellcheck disable=SC2086
    grep -ah "${IP_OBJETIVO}" $LOGS_WEB 2>/dev/null | awk '{print $6, $7, $9}' \
      | sort | uniq -c | sort -rn | head -40

    echo
    echo "-- ¿Alguna petición suya respondió 2xx? (si no hay líneas, no pasó nada) --"
    # shellcheck disable=SC2086
    grep -ah "${IP_OBJETIVO}" $LOGS_WEB 2>/dev/null | awk '$9 ~ /^2/ {print}' | tail -n 30
  fi
fi

# ---------------------------------------------------------------------------
# 4. SSH: por si también probaron entrar al servidor
# ---------------------------------------------------------------------------
seccion "4. Intentos de SSH fallidos (últimos)"

if [ -r /var/log/auth.log ]; then
  grep -a "Failed password" /var/log/auth.log 2>/dev/null | tail -n 20
elif command -v lastb >/dev/null 2>&1; then
  lastb 2>/dev/null | head -20
else
  nota "sin acceso a auth.log / lastb (usa sudo si te interesa)"
fi

seccion "Fin del informe"
echo "Revisa el informe antes de compartirlo: no incluye el .env ni hashes,"
echo "pero los logs pueden contener correos de clientes."
