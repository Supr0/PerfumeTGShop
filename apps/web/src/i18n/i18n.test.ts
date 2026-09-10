import { describe, expect, it } from 'vitest';
import uk from './uk.json';
import ru from './ru.json';

const PLACEHOLDER_RE = /\{[a-z_]+\}/g;

function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_RE)].map((m) => m[0]).sort();
}

describe('i18n dictionaries', () => {
  it('should have full key parity: every uk key exists in ru and vice versa', () => {
    const ukKeys = Object.keys(uk).sort();
    const ruKeys = Object.keys(ru).sort();
    expect(ruKeys, 'keys missing in ru').toEqual(ukKeys);
  });

  it('should have no empty values in either locale', () => {
    for (const [locale, dict] of [['uk', uk], ['ru', ru]] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${locale}.${key} is empty`).not.toBe('');
      }
    }
  });

  it('should use identical interpolation placeholders per key in both locales', () => {
    for (const key of Object.keys(uk)) {
      expect(
        placeholders(ru[key as keyof typeof ru]),
        `placeholder mismatch for ${key}`,
      ).toEqual(placeholders(uk[key as keyof typeof uk]));
    }
  });
});
