// Complexity policy for chosen passwords (mirrors server/src/utils/password.js)
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p: string) => p.length >= PASSWORD_MIN_LENGTH },
  { id: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One number', test: (p: string) => /\d/.test(p) },
  { id: 'symbol', label: 'One symbol (e.g. ! @ # $)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export const isStrongPassword = (p: string) => PASSWORD_RULES.every((r) => r.test(p));
