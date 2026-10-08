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
