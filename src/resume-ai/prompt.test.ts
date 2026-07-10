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

describe('buildPrompt — schema structure matches Profile', () => {
  const prompt = buildPrompt('{}');

  it('includes salary.current with amount, currency, country and period', () => {
    expect(prompt).toContain('"current": { "amount"');
    expect(prompt).toContain('"currency"');
    expect(prompt).toContain('"country"');
    expect(prompt).toContain('"period": "monthly" | "annual"');
  });

  it('declares salary.expected as an always-empty array', () => {
    expect(prompt).toContain('"expected": []');
    expect(prompt).toContain('salary.expected: always return empty array []');
  });

  it('excludes fields that must not be extracted (derived, documents, coverLetter, id)', () => {
    expect(prompt).toContain('Do not include: id, derived, documents, coverLetter');
    // coverLetter must never appear as a schema key
    expect(prompt).not.toContain('"coverLetter"');
  });

  it('states the education date rules (YYYY-MM or YYYY, never inferred)', () => {
    expect(prompt).toContain('"startDate": "YYYY-MM" | "YYYY"');
    expect(prompt).toContain('NEVER infer, guess, estimate, or backfill education startDate or endDate');
  });

  it('requires workHistory startDate to carry a month (YYYY-MM)', () => {
    expect(prompt).toContain('workHistory uses YYYY-MM (month required)');
  });

  it('lists the top-level schema sections', () => {
    for (const key of ['personal', 'address', 'professional', 'salary', 'workAuthorization', 'workHistory', 'education', 'languages', 'links']) {
      expect(prompt).toContain(`"${key}"`);
    }
  });
});
