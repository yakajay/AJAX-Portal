import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { getToken } from './api';
import type { Module } from './permissions';

/** What the address belongs to: a company workspace, the platform (Super Admin) console, or the shared portal address (decided at sign-in). */
export interface Workspace {
  kind: 'tenant' | 'platform' | 'portal';
  name: string;
  slug?: string;
  status?: 'active' | 'suspended' | 'inactive' | 'deleted';
  statusMessage?: string;
  modules?: Module[];
  features?: { customLogo: boolean };
  /** The company's own logo (only when the platform enabled it for them); otherwise our logo is shown */
  logoUrl?: string | null;
  /** The company's display name and whether "Powered by" shows (custom branding, when enabled) */
  brand?: { name: string; showPoweredBy: boolean } | null;
  allowSelfSignup?: boolean;
  sso?: { enabled: boolean; providerName: string; protocol: 'oidc' | 'saml' | null };
}

let cached: Promise<Workspace | null> | null = null;

/** Public call (no sign-in needed). Resolves to null when the address is not a known workspace. */
export const loadWorkspace = (force = false): Promise<Workspace | null> => {
  if (!cached || force) {
    // The token (when signed in) tells a shared address which company this is
    const token = getToken();
    cached = fetch(`${API_BASE_URL}/auth/workspace`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then((res) => (res.ok ? (res.json() as Promise<Workspace>) : null))
      .catch(() => null);
  }
  return cached;
};

export const useWorkspace = () => {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    void loadWorkspace().then((w) => {
      if (!live) return;
      setWorkspace(w);
      setLoading(false);
    });
    return () => { live = false; };
  }, []);
  return { workspace, loading };
};
