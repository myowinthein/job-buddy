import { describe, it, expect } from 'vitest';
import { withScheme } from './url';

describe('withScheme', () => {
  it('adds https:// to a bare domain', () => {
    expect(withScheme('linkedin.com/in/jane')).toBe('https://linkedin.com/in/jane');
  });

  it('leaves an existing https:// URL unchanged', () => {
    expect(withScheme('https://linkedin.com/in/jane')).toBe('https://linkedin.com/in/jane');
  });

  it('leaves an existing http:// URL unchanged', () => {
    expect(withScheme('http://example.com')).toBe('http://example.com');
  });

  it('matches the scheme case-insensitively', () => {
    expect(withScheme('HTTPS://example.com')).toBe('HTTPS://example.com');
  });

  it('does not treat a scheme appearing mid-string as already-scheme-prefixed', () => {
    expect(withScheme('example.com/redirect?to=https://evil.com')).toBe('https://example.com/redirect?to=https://evil.com');
  });

  it('produces "https://" for an empty string — callers must guard against this themselves', () => {
    expect(withScheme('')).toBe('https://');
  });
});
