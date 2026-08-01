import { describe, it, expect } from 'vitest';
import { buildAutofillPrompt, AUTOFILL_SYSTEM_PROMPT } from './autofillPrompt';

describe('buildAutofillPrompt', () => {
  it('prefixes the system prompt before the fields/profile payload', () => {
    const prompt = buildAutofillPrompt([{ fieldId: 'field_001' }], { personal: { firstName: 'Jane' } });
    expect(prompt.startsWith(AUTOFILL_SYSTEM_PROMPT)).toBe(true);
  });

  it('embeds the fields and profile as JSON after the system prompt', () => {
    const prompt = buildAutofillPrompt([{ fieldId: 'field_001' }], { personal: { firstName: 'Jane' } });
    expect(prompt).toContain('"field_001"');
    expect(prompt).toContain('"Jane"');
  });
});
