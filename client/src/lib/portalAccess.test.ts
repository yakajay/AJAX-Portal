import { describe, it, expect, afterEach, vi } from 'vitest';
import { portalCan, portalLevel } from './permissions';
import { visibleNav } from './nav';
import type { User } from '../types';

const user = (role: string, platformRole?: User['platformRole']): User => ({ id: '1', name: 'T', email: 't@x.com', role, platformRole });
const paths = (u: User) => visibleNav(u).map((i) => i.path);

describe('portal roles', () => {
  it('treats platform accounts without a role as Portal Super Admins', () => {
    expect(portalLevel(user('PLATFORM_ADMIN'))).toBe('super');
    expect(portalLevel(user('ADMIN'))).toBeNull();
  });

  it('ranks viewer < admin < super', () => {
    expect(portalCan(user('PLATFORM_ADMIN', 'viewer'), 'admin')).toBe(false);
    expect(portalCan(user('PLATFORM_ADMIN', 'admin'), 'admin')).toBe(true);
    expect(portalCan(user('PLATFORM_ADMIN', 'admin'), 'super')).toBe(false);
    expect(portalCan(user('USER'), 'viewer')).toBe(false);
  });

  it('shows each role only the portal screens it can use', () => {
    expect(paths(user('PLATFORM_ADMIN', 'viewer'))).not.toContain('/portal/onboard');
    expect(paths(user('PLATFORM_ADMIN', 'admin'))).toContain('/portal/onboard');
    expect(paths(user('PLATFORM_ADMIN', 'admin'))).not.toContain('/portal/team');
    expect(paths(user('PLATFORM_ADMIN', 'super'))).toContain('/portal/team');
  });
});

describe('who sees which tool', () => {
  it('keeps the CRM and Branding away from employees and Branding to the company Super Admin', () => {
    expect(paths(user('USER'))).not.toContain('/crm');
    expect(paths(user('ADMIN'))).toContain('/crm');
    expect(paths(user('ADMIN'))).not.toContain('/crm/branding');
    expect(paths(user('SUPER_ADMIN'))).toContain('/crm/branding');
    expect(paths(user('SUPER_ADMIN'))).not.toContain('/portal');
  });
});

describe('the CRM address', () => {
  afterEach(() => vi.unstubAllGlobals());
  const at = async (hostname: string) => {
    vi.stubGlobal('location', { hostname });
    vi.resetModules();
    return import('./host');
  };

  it('is recognised as crm.<domain> only', async () => {
    expect((await at('crm.example.com')).isCrmHost()).toBe(true);
    expect((await at('acme.example.com')).isCrmHost()).toBe(false);
    expect((await at('crm.localhost')).isCrmHost()).toBe(true);
  });
});
