import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Public endpoints: throttled per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });

router.post('/register', limiter, auth.register);
router.post('/verify-email', limiter, auth.verifyEmail);
router.post('/login', limiter, auth.login);
router.post('/login/verify', limiter, auth.verifyLogin);
router.post('/resend-otp', limiter, auth.resendOtp);
router.post('/forgot-password', limiter, auth.forgotPassword);
router.post('/reset-password', limiter, auth.resetPassword);

router.get('/me', authenticate, auth.me);

export default router;
