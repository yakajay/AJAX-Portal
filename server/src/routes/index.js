import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/auth', authRoutes);    // public (login, OTP, register, reset)
router.use('/user', userRoutes);    // any authenticated role, own data only
router.use('/admin', adminRoutes);  // ADMIN / SUPER_ADMIN

export default router;
