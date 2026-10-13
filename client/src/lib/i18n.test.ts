import { describe, expect, it } from 'vitest';
import { translate } from './i18n';
import { dictionaries, LANGUAGES } from './locales';

describe('translate()', () => {
  it('returns the message in the chosen language', () => {
    expect(translate('es', 'nav.dashboard')).toBe('Panel');
    expect(translate('hi', 'nav.leave')).toBe('छुट्टी');
  });

  it('fills {placeholders}', () => {
    expect(translate('en', 'dash.inDays', { n: 3 })).toBe('in 3 days');
    expect(translate('es', 'dash.anniversary', { n: 5 })).toBe('Aniversario de 5 años');
  });

  it('falls back to English for a missing translation and to the key for an unknown one', () => {
    expect(translate('en', 'nav.auditLog')).toBe('Audit log');
    // @ts-expect-error deliberately unknown key
    expect(translate('es', 'no.such.key')).toBe('no.such.key');
  });
});

describe('locale files', () => {
  const english = dictionaries.en;
  it.each(LANGUAGES.filter((l) => l.id !== 'en'))('$id only uses known keys and keeps the same placeholders', ({ id }) => {
    for (const [key, text] of Object.entries(dictionaries[id])) {
      expect(english, `unknown key ${key}`).toHaveProperty(key);
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
      expect(placeholders(String(text)), key).toBe(placeholders(String(english[key as keyof typeof english])));
    }
  });

  it.each(LANGUAGES.filter((l) => l.id !== 'en'))('$id translates the shell and dashboard keys', ({ id }) => {
    const missing = Object.keys(english).filter((k) => !(k in dictionaries[id]));
    expect(missing).toEqual([]);
  });
});
