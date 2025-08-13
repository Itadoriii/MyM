import { Router } from 'express';
import isAuthenticated from '../middlewares/isAuthenticated.js';
import { enviarConfirmacion } from '../controllers/pedidos.controller.js';

const router = Router();

// PUT /api/pedidos/:id/confirmar-mail
router.put(
  '/pedidos/:id/confirmar-mail',
  enviarConfirmacion
);

export default router;
