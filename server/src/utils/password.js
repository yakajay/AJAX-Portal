import crypto from 'node:crypto';

// scrypt hashes look like `scrypt$<salt>$<hash>`; legacy plaintext values are still accepted
export const hashPassword = (plain) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(plain, salt, 64).toString('hex')}`;
};

export const isHashed = (stored) => !!stored && stored.startsWith('scrypt$');

export const verifyPassword = (plain, stored) => {
  if (!stored || !plain) return false;
  if (!isHashed(stored)) return plain === stored;
  const [, salt, hash] = stored.split('$');
  const candidate = crypto.scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
};

// Complexity policy for passwords people choose (mirrored in client/src/lib/passwordPolicy.ts)
export const PASSWORD_MIN_LENGTH = 8;

// Returns an error message, or null when the password is acceptable
export const passwordPolicyError = (plain) => {
  const p = typeof plain === 'string' ? plain : '';
  if (p.length < PASSWORD_MIN_LENGTH
    || !/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, a lowercase letter, a number and a symbol.`;
  }
  return null;
};
