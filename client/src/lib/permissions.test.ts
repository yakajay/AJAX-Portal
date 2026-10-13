import { describe, expect, it } from 'vitest';
import { can, parsePermissions } from './permissions';

const admin = (permissions: string) => ({ role: 'ADMIN', permissions });

describe('can()', () => {
  it('lets a super admin do everything and a plain user nothing', () => {
    expect(can({ role: 'SUPER_ADMIN', permissions: '' }, 'payroll', 'delete')).toBe(true);
    expect(can({ role: 'USER', permissions: 'all' }, 'payroll', 'read')).toBe(false);
    expect(can(null, 'payroll', 'read')).toBe(false);
  });

  it('applies global tokens to every module', () => {
    expect(can(admin('read,write'), 'payroll', 'write')).toBe(true);
    expect(can(admin('read,write'), 'payroll', 'delete')).toBe(false);
  });

  it('scopes module tokens to their module', () => {
    const a = admin('read,payroll:write');
    expect(can(a, 'payroll', 'write')).toBe(true);
    expect(can(a, 'users', 'write')).toBe(false);
    expect(can(a, 'users', 'read')).toBe(true);
  });

  it('treats write as implying read for that module only', () => {
    expect(can(admin('hr:write'), 'hr', 'read')).toBe(true);
    expect(can(admin('hr:write'), 'payroll', 'read')).toBe(false);
    expect(can(admin('hr:*'), 'hr', 'delete')).toBe(true);
    expect(can(admin('all'), 'org', 'delete')).toBe(true);
  });

  it('parses comma strings and arrays the same way', () => {
    expect(parsePermissions(' Read , payroll:Write ,')).toEqual(['read', 'payroll:write']);
    expect(parsePermissions(['read', 'write'])).toEqual(['read', 'write']);
    expect(parsePermissions(undefined)).toEqual([]);
  });
});
