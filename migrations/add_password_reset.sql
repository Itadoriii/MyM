-- Columnas para el flujo de "olvidé mi contraseña".
-- El servidor las crea solo al arrancar (utils/ensure-schema.js); este archivo
-- queda para aplicarlas a mano si prefieres migrar la BD por fuera.

ALTER TABLE `usuarios`
  ADD COLUMN `reset_token`   CHAR(64) DEFAULT NULL,
  ADD COLUMN `reset_expires` DATETIME DEFAULT NULL;
