// Relative by default: each company is served from its own subdomain, and the API works out which company
// a request is for from the address the browser used. nginx (production) and the Vite dev server proxy
// /api to the API without changing the Host header. Set VITE_API_URL only when the API lives elsewhere
// and understands the same Host-based routing.
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? '/api';
