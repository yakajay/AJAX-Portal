import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import * as sso from '../controllers/sso.controller.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Public endpoints: throttled per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });

router.get('/workspace', auth.workspace);
router.get('/logo', auth.logo);
router.get('/sso/config', sso.config);
router.get('/sso/start', limiter, sso.start);
router.get('/sso/callback', limiter, sso.callback);
router.post('/sso/saml/acs', limiter, sso.samlAcs);
router.get('/sso/saml/metadata', sso.samlMetadata);

router.post('/register', limiter, auth.register);
router.post('/verify-email', limiter, auth.verifyEmail);
router.post('/login', limiter, auth.login);
router.post('/login/verify', limiter, auth.verifyLogin);
router.post('/resend-otp', limiter, auth.resendOtp);
router.post('/forgot-password', limiter, auth.forgotPassword);
router.post('/reset-password', limiter, auth.resetPassword);

// Refreshing happens every few minutes per device, so it gets a roomier limit
router.post('/refresh', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }), auth.refresh);
router.post('/logout', authenticate, auth.logout);

router.get('/me', authenticate, auth.me);

export default router;
