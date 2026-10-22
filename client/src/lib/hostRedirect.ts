// The shared *.web.app / *.firebaseapp.com address Firebase always keeps alive is not meant for people.
// When the real addresses are configured at build time, send visitors there: the Ajax client portal to
// VITE_PLATFORM_URL, everyone else (company admins and employees) to VITE_APP_URL. Unset = no redirect.
const FIREBASE_HOST = /\.(web\.app|firebaseapp\.com)$/;

export const redirectToCompanyAddress = (): boolean => {
  const appUrl = import.meta.env.VITE_APP_URL as string | undefined;
  const platformUrl = import.meta.env.VITE_PLATFORM_URL as string | undefined;
  const { hostname, pathname, search, hash } = window.location;
  if (!FIREBASE_HOST.test(hostname)) return false;

  const target = (pathname.startsWith('/portal') || pathname.startsWith('/platform') ? platformUrl : appUrl)?.replace(/\/+$/, '');
  if (!target) return false;
  window.location.replace(`${target}${pathname}${search}${hash}`);
  return true;
};
