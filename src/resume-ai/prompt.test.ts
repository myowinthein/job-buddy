import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompt';

describe('buildPrompt', () => {
  it('returns a non-empty string', () => {
    expect(buildPrompt('{}').length).toBeGreaterThan(0);
  });

  it('omits the hyperlinks section when no links are provided', () => {
    const prompt = buildPrompt('{}');
    expect(prompt).not.toContain('Extracted hyperlinks');
  });

  it('omits the hyperlinks section when an empty array is passed', () => {
    const prompt = buildPrompt('{}', []);
    expect(prompt).not.toContain('Extracted hyperlinks');
  });

  it('includes the hyperlinks section when links are present', () => {
    const links = ['https://linkedin.com/in/jane', 'https://github.com/jane'];
    const prompt = buildPrompt('{}', links);
    expect(prompt).toContain('Extracted hyperlinks');
    expect(prompt).toContain('https://linkedin.com/in/jane');
    expect(prompt).toContain('https://github.com/jane');
  });

  it('includes each link on its own line', () => {
    const links = ['https://example.com/a', 'https://example.com/b'];
    const prompt = buildPrompt('{}', links);
    expect(prompt).toContain('https://example.com/a\nhttps://example.com/b');
  });

  it('instructs the model to return raw JSON only', () => {
    const prompt = buildPrompt('{}');
    expect(prompt).toContain('raw JSON only');
  });
});
