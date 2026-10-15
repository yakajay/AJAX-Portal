import dns from 'node:dns/promises';
import net from 'node:net';
import { env } from '../config/env.js';

// Company admins choose the identity-provider URLs this server calls, so they must not be able to aim
// the server at internal services (cloud metadata, databases, localhost). Requests are limited to
// https URLs whose host resolves only to public addresses.
export const isPrivateAddress = (address) => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]);
    return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
  }
  return true; // not an IP at all: refuse
};

export const assertPublicUrl = async (rawUrl) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Not a valid URL.');
  }
  if (env.sso.allowPrivateHosts) return url;
  if (url.protocol !== 'https:') throw new Error('Identity provider URLs must use https.');
  if (url.username || url.password) throw new Error('Identity provider URLs must not contain credentials.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('Identity provider URLs must point to a public address.');
  }
  return url;
};

// Same guard for a bare hostname (a company's own mail server): must resolve only to public addresses
export const assertPublicHost = async (rawHost) => {
  const host = String(rawHost || '').trim().replace(/^\[|\]$/g, '');
  if (!host || /[\s/@:]/.test(host.replace(/^[0-9a-f:]+$/i, ''))) throw new Error('Not a valid mail server host name.');
  if (env.sso.allowPrivateHosts) return host;
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('The mail server must be a public address.');
  }
  return host;
};

// fetch() for identity-provider calls: public https only, time-limited, no redirects
export const providerFetch = async (rawUrl, init = {}) => {
  const url = await assertPublicUrl(rawUrl);
  return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(env.sso.requestTimeoutMs) });
};
