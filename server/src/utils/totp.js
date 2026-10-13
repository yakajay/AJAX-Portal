import crypto from 'node:crypto';

// RFC 4226 / 6238 one-time passwords (SHA-1, 6 digits, 30 s step) - compatible with Google Authenticator & co.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (text) => {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

export const generateSecret = () => base32Encode(crypto.randomBytes(20));

export const hotp = (secret, counter, digits = 6) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
};

export const totp = (secret, atMs = Date.now(), stepSeconds = 30) =>
  hotp(secret, Math.floor(atMs / 1000 / stepSeconds));

// Returns the 30-second step the code belongs to (accepting one step of drift either side), or null.
// Callers store the step to refuse the same code twice.
export const matchTotp = (secret, code, atMs = Date.now(), window = 1) => {
  const candidate = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(candidate) || !secret) return null;
  const step = Math.floor(atMs / 1000 / 30);
  let matched = null;
  for (let i = -window; i <= window; i++) {
    const expected = Buffer.from(hotp(secret, step + i));
    // Evaluate every window so timing doesn't reveal which step matched
    if (crypto.timingSafeEqual(expected, Buffer.from(candidate))) matched = step + i;
  }
  return matched;
};

export const verifyTotp = (secret, code, atMs = Date.now(), window = 1) => matchTotp(secret, code, atMs, window) !== null;

export const otpauthUrl = ({ secret, account, issuer }) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
