import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { checkApiKey, validateApiKey, resolveFieldsWithAI } from './gemini';
import type { AIFieldPayload } from './types';

/** Build a Gemini generateContent response whose candidate text is `text`. */
function geminiTextResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        candidates: [{ content: { parts: [{ text }] } }],
      }),
  };
}

function httpResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body ?? {}),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

// ── parseAutofillResponse (tested via resolveFieldsWithAI) ────────────────────

describe('parseAutofillResponse (via resolveFieldsWithAI)', () => {
  const FIELDS: AIFieldPayload[] = [{ fieldId: 'f1', type: 'text', label: 'Name' }];

  async function resolveWithText(text: string) {
    fetchMock.mockResolvedValueOnce(geminiTextResponse(text));
    return resolveFieldsWithAI('key', 'gemini-3.5-flash-lite', FIELDS, {});
  }

  it('returns [] when the model output is not JSON', async () => {
    const result = await resolveWithText('this is not json at all');
    expect(result).toEqual([]);
  });

  it('returns [] when the parsed JSON is not an array', async () => {
    const result = await resolveWithText('{"fieldId":"f1","confidence":"high"}');
    expect(result).toEqual([]);
  });

  it('keeps valid items and filters out invalid (non-object) items', async () => {
    const result = await resolveWithText(
      JSON.stringify([
        { fieldId: 'f1', profilePath: 'personal.firstName', confidence: 'high' },
        'not-an-object',
        null,
        42,
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].fieldId).toBe('f1');
  });

  it('rejects items missing a fieldId (or with an empty fieldId)', async () => {
    const result = await resolveWithText(
      JSON.stringify([
        { profilePath: 'personal.firstName', confidence: 'high' },
        { fieldId: '', confidence: 'high' },
        { fieldId: 'ok', confidence: 'low' },
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].fieldId).toBe('ok');
  });

  it('rejects items with an unexpected confidence value', async () => {
    const result = await resolveWithText(
      JSON.stringify([
        { fieldId: 'a', confidence: 'medium' },
        { fieldId: 'b', confidence: 'high' },
        { fieldId: 'c', confidence: null },
      ]),
    );
    expect(result.map((r) => r.fieldId)).toEqual(['b', 'c']);
  });

  it('strips markdown code fences before parsing', async () => {
    const result = await resolveWithText(
      '```json\n[{"fieldId":"f1","confidence":"high"}]\n```',
    );
    expect(result).toHaveLength(1);
    expect(result[0].fieldId).toBe('f1');
  });

  it('returns [] when the response JSON body cannot be read', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('bad body')),
    });
    const result = await resolveFieldsWithAI('key', 'gemini-3.5-flash-lite', FIELDS, {});
    expect(result).toEqual([]);
  });

  it('throws on a non-ok HTTP status', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(500));
    await expect(
      resolveFieldsWithAI('key', 'gemini-3.5-flash-lite', FIELDS, {}),
    ).rejects.toThrow('AI autofill request failed: 500');
  });

  it('throws a network error when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(
      resolveFieldsWithAI('key', 'gemini-3.5-flash-lite', FIELDS, {}),
    ).rejects.toThrow('Network error during AI autofill');
  });
});

// ── checkApiKey ───────────────────────────────────────────────────────────────

describe('checkApiKey', () => {
  it('returns "valid" on a 200 response', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(200));
    expect(await checkApiKey('key')).toBe('valid');
  });

  it('returns "invalid" on 401', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(401));
    expect(await checkApiKey('key')).toBe('invalid');
  });

  it('returns "invalid" on 403', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(403));
    expect(await checkApiKey('key')).toBe('invalid');
  });

  it('returns "network_error" on other non-ok statuses', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(500));
    expect(await checkApiKey('key')).toBe('network_error');
  });

  it('returns "network_error" when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await checkApiKey('key')).toBe('network_error');
  });
});

// ── validateApiKey ────────────────────────────────────────────────────────────

describe('validateApiKey', () => {
  it('returns valid with the first model that responds 200', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(200));
    const result = await validateApiKey('key');
    expect(result.valid).toBe(true);
    expect(result.model).toBe('gemini-3.5-flash-lite'); // GEMINI_MODEL_PRIORITY[0]
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flags an auth failure (401) as keyInvalid without trying more models', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(401));
    const result = await validateApiKey('key');
    expect(result).toEqual({ valid: false, error: 'API key invalid', keyInvalid: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flags a 403 as keyInvalid', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(403));
    const result = await validateApiKey('key');
    expect(result.keyInvalid).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('treats a 400 whose body mentions "API key" as keyInvalid', async () => {
    fetchMock.mockResolvedValueOnce(
      httpResponse(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }),
    );
    const result = await validateApiKey('key');
    expect(result).toEqual({ valid: false, error: 'API key invalid', keyInvalid: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a 400 with a non-key-related body as a model failure and tries the next model', async () => {
    // First model: model-specific 400; second model: success
    fetchMock
      .mockResolvedValueOnce(httpResponse(400, { error: { message: 'Model not found' } }))
      .mockResolvedValueOnce(httpResponse(200));
    const result = await validateApiKey('key');
    expect(result.valid).toBe(true);
    expect(result.model).toBe('gemini-3.6-flash'); // GEMINI_MODEL_PRIORITY[1]
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an unparseable 400 body as a model failure and continues', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.reject(new Error('non-json body')),
      })
      .mockResolvedValueOnce(httpResponse(200));
    const result = await validateApiKey('key');
    expect(result.valid).toBe(true);
    expect(result.model).toBe('gemini-3.6-flash');
  });

  it('skips a 404 model and tries the next', async () => {
    fetchMock
      .mockResolvedValueOnce(httpResponse(404))
      .mockResolvedValueOnce(httpResponse(200));
    const result = await validateApiKey('key');
    expect(result.valid).toBe(true);
    expect(result.model).toBe('gemini-3.6-flash');
  });

  it('returns keyValidNoModel when every model in the priority list fails non-fatally', async () => {
    fetchMock.mockResolvedValue(httpResponse(404));
    const result = await validateApiKey('key');
    expect(result).toEqual({
      valid: false,
      error: 'No supported model available for this key',
      keyValidNoModel: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4); // GEMINI_MODEL_PRIORITY length
  });

  it('returns a network error when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const result = await validateApiKey('key');
    expect(result).toEqual({ valid: false, error: 'Network error while validating key' });
  });
});
