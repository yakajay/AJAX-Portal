import authRoutes from '../routes/auth.routes.js';
import userRoutes from '../routes/user.routes.js';
import adminRoutes from '../routes/admin.routes.js';
import platformRoutes from '../routes/platform.routes.js';

// The OpenAPI document is generated from the live Express routers, so it can never miss an endpoint.
// Hand-written text lives in DESCRIPTIONS below; everything else is derived (method, path, auth,
// required permission, and a summary from the handler's name).
const MOUNTS = [
  { prefix: '/auth', router: authRoutes, access: 'public' },
  { prefix: '/user', router: userRoutes, access: 'user' },
  { prefix: '/admin', router: adminRoutes, access: 'admin' },
  { prefix: '/platform', router: platformRoutes, access: 'platform' }
];

const DESCRIPTIONS = {
  'POST /auth/login': 'Step 1 of sign-in. Verifies email + password, then either emails a one-time code (`method: "email"`) or asks for an authenticator-app code (`method: "totp"`).',
  'POST /auth/login/verify': 'Step 2 of sign-in. Exchanges the one-time code for `{ token, refreshToken, user }`. The access token is short-lived; renew it with `/auth/refresh`.',
  'POST /auth/refresh': 'Exchanges a refresh token for a new access token. The refresh token rotates on every call.',
  'POST /auth/logout': 'Ends the current device session.',
  'GET /user/leaves/balance': 'Balances per leave type as of today, with monthly accrual and carry-forward applied.',
  'POST /user/leaves': 'Creates a leave request. Days are computed server-side (weekdays minus public holidays); `halfDay` + `halfDayPart` request a half day.',
  'GET /user/leaves/calendar': 'Team calendar for `?month=YYYY-MM`: approved/pending leave and public holidays.',
  'POST /user/attendance/check-in': 'Clocks in. Optional body `{ location: { lat, lng, accuracy } }`; may be rejected by the configured IP / geofence rules.',
  'GET /user/attendance/summary': 'Monthly summary (`?month=YYYY-MM&tz=Area/City`): days present, hours, late and early-out days.',
  'GET /user/attendance/export': 'CSV download of the monthly attendance summary.',
  'GET /user/payslips/{id}/pdf': 'Downloads one of your payslips as a PDF.',
  'POST /admin/users/import': 'Bulk-creates employees from a CSV body (`Content-Type: text/csv`; columns name, email, department, designation, manager_email, join_date, date_of_birth). All-or-nothing: any invalid row returns 422 with line numbers. `?dryRun=1` only validates. Returns one-time temporary passwords.',
  'GET /admin/users/import/template': 'Example CSV for the bulk import.',
  'GET /admin/attendance/records': 'One employee\'s attendance entries for a month (`?userId=&month=YYYY-MM`).',
  'POST /admin/attendance': 'Adds an attendance entry for an employee: `{ userId, checkInAt, checkOutAt, reason }`. Refused when the day already has an entry.',
  'PUT /admin/attendance/{id}': 'Corrects an entry\'s times or status: `{ checkInAt?, checkOutAt?, status?, reason }`. A reason is required and the change is audited.',
  'DELETE /admin/attendance/{id}': 'Removes an attendance entry (needs delete permission; `reason` in the body).',
  'GET /admin/attendance/report': 'Month report for all employees. Add `format=csv` for a spreadsheet export.',
  'POST /admin/payroll/run-monthly': 'Generates payslips for every employee with a salary structure (skips ones that already exist). Unpaid leave prorates pay.',
  'GET /admin/audit': 'Company admin (SUPER_ADMIN) only. Filterable, paginated audit trail for the company, including actions the platform took on it.',
  'GET /auth/workspace': 'Public. Who the request address belongs to (a company or the platform console), its enabled modules and whether single sign-on is available.',
  'POST /auth/sso/saml/acs': 'SAML 2.0 assertion consumer service: the identity provider posts the signed response here.',
  'DELETE /admin/users/{id}': 'Company admins cannot delete directly: this files a delete request (202, status Pending) for the platform Super Admin to approve or reject. The other admin DELETE routes behave the same way.',
  'PATCH /platform/delete-requests/{id}': 'Approve (carries out the deletion) or reject (needs a note) a delete request raised by a company.',
  'GET /platform/companies/{id}/employees': 'Employee list with sensitive fields (salary, bank details, government IDs) masked, unless the company admin granted temporary support access. Unmasked views are audited.',
  'POST /user/2fa/setup': 'Generates an authenticator secret and `otpauth://` URL. Not active until confirmed with `/user/2fa/enable`.',
  'PUT /user/team/leaves/{id}': 'Managers approve or reject leave requests from their direct reports.'
};

const humanize = (name) => {
  const words = (name || 'handler').replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const toOpenApiPath = (path) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
const pathParams = (path) => [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);

// Walks a router's stack and returns one record per method+path
export const collectRoutes = () => {
  const out = [];
  for (const { prefix, router, access } of MOUNTS) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const handlers = layer.route.stack.map((l) => l.handle);
      const permission = handlers.find((h) => h.meta)?.meta;
      const authenticated = access !== 'public' || handlers.some((h) => h.name === 'authenticate');
      for (const method of Object.keys(layer.route.methods)) {
        out.push({
          method: method.toUpperCase(),
          path: toOpenApiPath(`${prefix}${layer.route.path}`),
          access,
          authenticated,
          permission,
          handler: handlers[handlers.length - 1].name
        });
      }
    }
  }
  return out;
};

const errorResponses = {
  400: { description: 'Validation error' },
  401: { description: 'Missing, invalid or expired token' },
  403: { description: 'Not allowed' },
  404: { description: 'Not found' }
};

export const buildOpenApi = () => {
  const paths = {
    '/health': { get: { tags: ['system'], summary: 'Liveness probe', responses: { 200: { description: 'API process is up' } } } },
    '/health/ready': { get: { tags: ['system'], summary: 'Readiness probe (503 until MongoDB is connected)', responses: { 200: { description: 'Ready' }, 503: { description: 'Database unavailable' } } } },
    '/metrics': { get: { tags: ['system'], summary: 'Prometheus-style metrics', description: 'Requires `Authorization: Bearer <METRICS_TOKEN>` when METRICS_TOKEN is set.', responses: { 200: { description: 'Metrics in text exposition format' } } } }
  };

  for (const r of collectRoutes()) {
    const key = `${r.method} ${r.path}`;
    const notes = [];
    if (r.access === 'admin') notes.push('Requires an ADMIN or SUPER_ADMIN account of the company whose subdomain is used.');
    if (r.access === 'platform') notes.push('Requires the platform Super Admin (PLATFORM_ADMIN), on the platform host (admin.<base domain>).');
    if (r.permission) notes.push(`Requires permission \`${r.permission.module ? `${r.permission.module}:` : ''}${r.permission.permission}\` (or the global \`${r.permission.permission}\` / \`all\`).`);
    if (r.path === '/admin/audit' || r.path.startsWith('/admin/company') || r.path.startsWith('/admin/support-access')) notes.push('Company admin (SUPER_ADMIN) only.');
    const description = [DESCRIPTIONS[key], ...notes].filter(Boolean).join('\n\n');
    const segment = r.path.split('/')[2] || r.path.split('/')[1];

    const operation = {
      tags: [`${r.access}: ${segment}`],
      summary: humanize(r.handler),
      ...(description ? { description } : {}),
      ...(pathParams(r.path).length
        ? { parameters: pathParams(r.path).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })) }
        : {}),
      ...(r.authenticated ? { security: [{ bearerAuth: [] }] } : {}),
      ...(['POST', 'PUT', 'PATCH'].includes(r.method)
        ? { requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } } }
        : {}),
      responses: { 200: { description: 'Success' }, ...errorResponses }
    };
    (paths[r.path] ||= {})[r.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'YakFlow API',
      version: '2.0.0',
      description: 'HR portal API. Sign in with `/auth/login` + `/auth/login/verify`, then send `Authorization: Bearer <token>`. Generated from the live route table. Multi-tenant: the company is chosen by the request host (<slug>.<base domain>); the Super Admin console lives at admin.<base domain>.'
    },
    servers: [{ url: '/api' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths
  };
};
