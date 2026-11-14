import { afterEach, expect, it, vi } from 'vitest';
import { resolveFieldsWithAI } from './gemini';

afterEach(() => vi.unstubAllGlobals());
it('uses low reasoning for Flash autofill and preserves the faster Flash-Lite default on fallback', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    });
  vi.stubGlobal('fetch', fetchMock);
  await resolveFieldsWithAI(
    'synthetic',
    'gemini-3.8-flash',
    [{ fieldId: 'field_001', type: 'text', label: 'Name' }],
    {},
  );
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.thinkingConfig).toEqual({
    thinkingLevel: 'low',
  });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).generationConfig).not.toHaveProperty(
    'thinkingConfig',
  );
});
