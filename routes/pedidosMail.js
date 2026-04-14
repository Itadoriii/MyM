import { Router } from 'express';
import isAuthenticated from '../middlewares/isAuthenticated.js';
// import { enviarConfirmacion } from '../controllers/pedidos.controller.js';

const router = Router();

// PUT /api/pedidos/:id/confirmar-mail
// Esta ruta es obsoleta, use /api/pedidos/:id/estado
router.put(
  '/pedidos/:id/confirmar-mail',
  async (req, res) => {
    res.status(410).json({ error: 'Ruta obsoleta. Use /api/pedidos/:id/estado' });
  }
);

export default router;
