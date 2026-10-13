import { vi } from 'vitest';

// Capture outgoing mail instead of sending it
export const outbox = [];
vi.mock('../../src/utils/mailer.js', () => ({
  sendMail: async (mail) => { outbox.push(mail); }
}));
