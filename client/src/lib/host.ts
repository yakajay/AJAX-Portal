// The CRM is served from its own address (crm.<domain>); the employee portal and the platform console have theirs.
// VITE_CRM_URL / VITE_APP_URL name the other addresses so the HRMS/CRM switcher can cross between them.
const sub = (name: string) => window.location.hostname.toLowerCase().split('.')[0] === name;

/** True when the page was opened at crm.<domain>: only the CRM is shown there. */
export const isCrmHost = (): boolean => {
  const configured = (import.meta.env.VITE_CRM_HOST as string | undefined)?.toLowerCase();
  return configured ? window.location.hostname.toLowerCase() === configured : sub('crm');
};

const clean = (url: unknown) => (typeof url === 'string' && url.trim() ? url.trim().replace(/\/+$/, '') : '');
/** Address of the CRM when it lives on a different host from this page, else ''. */
export const crmUrl = (): string => (isCrmHost() ? '' : clean(import.meta.env.VITE_CRM_URL));
/** Address of the employee portal when this page is the CRM host, else ''. */
export const appUrl = (): string => (isCrmHost() ? clean(import.meta.env.VITE_APP_URL) : '');
