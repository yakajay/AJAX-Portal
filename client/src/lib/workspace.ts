import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import type { Module } from './permissions';

/** What the address in the browser belongs to: a company workspace or the platform (Super Admin) console. */
export interface Workspace {
  kind: 'tenant' | 'platform';
  name: string;
  slug?: string;
  status?: 'active' | 'suspended' | 'inactive' | 'deleted';
  statusMessage?: string;
  modules?: Module[];
  allowSelfSignup?: boolean;
  sso?: { enabled: boolean; providerName: string; protocol: 'oidc' | 'saml' | null };
}

let cached: Promise<Workspace | null> | null = null;

/** Public call (no sign-in needed). Resolves to null when the address is not a known workspace. */
export const loadWorkspace = (force = false): Promise<Workspace | null> => {
  if (!cached || force) {
    cached = fetch(`${API_BASE_URL}/auth/workspace`)
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
