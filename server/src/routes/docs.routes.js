import { Router } from 'express';
import { buildOpenApi } from '../docs/openapi.js';

const router = Router();

router.get('/openapi.json', (req, res) => res.json(buildOpenApi()));

// Swagger UI, loaded from a CDN (pinned). Served with a relaxed CSP only on this page.
router.get('/docs', (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self'");
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>YakFlow API</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: ${JSON.stringify(`${req.baseUrl}/openapi.json`)}, dom_id: '#ui', persistAuthorization: true });</script>
</body></html>`);
});

export default router;
