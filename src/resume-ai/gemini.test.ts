import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { checkApiKey, validateApiKey, resolveFieldsWithAI, extractFromResume, KEY_ERROR_MESSAGES, GEMINI_REQUEST_TIMEOUT_MS, RESUME_REQUEST_TIMEOUT_MS } from './gemini';
import type { AIFieldPayload, GeminiModel } from './types';
import type { Profile } from '@/src/types/profile';

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
    return resolveFieldsWithAI('key', 'gemini-3.8-flash', FIELDS, {});
  }

  it('rejects non-JSON model output so the popup can report unavailable AI', async () => {
    await expect(resolveWithText('this is not json at all')).rejects.toThrow('Invalid AI autofill response');
  });

  it('rejects a non-array response', async () => {
    await expect(resolveWithText('{"fieldId":"f1","confidence":"high"}')).rejects.toThrow('Invalid AI autofill response');
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

  it('rejects an unreadable response body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('bad body')),
    });
    await expect(resolveFieldsWithAI('key', 'gemini-3.8-flash', FIELDS, {})).rejects.toThrow('Invalid AI autofill response');
  });

  it('accepts a valid empty response as no changes', async () => {
    expect(await resolveWithText('[]')).toEqual([]);
  });

  it.each([
    '[null]',
    '[{"fieldId":"f1","confidence":"high","profilePath":42}]',
    '[{"fieldId":"f1","confidence":"high","selectedOption":42}]',
    '[{"fieldId":"f1","confidence":"high","selectedOptions":[42]}]',
  ])('rejects a response containing only invalid fields: %s', async output => {
    await expect(resolveWithText(output)).rejects.toThrow('Invalid AI autofill response');
  });

  it('throws on a non-ok HTTP status', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(500));
    await expect(
      resolveFieldsWithAI('key', 'gemini-3.8-flash', FIELDS, {}),
    ).rejects.toThrow('AI autofill request failed: 500');
  });

  it('throws a network error when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(
      resolveFieldsWithAI('key', 'gemini-3.8-flash', FIELDS, {}),
    ).rejects.toThrow('Network error during AI autofill');
  });

  it('falls through to the next model on 429, trying the configured model first', async () => {
    fetchMock
      .mockResolvedValueOnce(httpResponse(429))
      .mockResolvedValueOnce(geminiTextResponse(JSON.stringify([{ fieldId: 'f1', confidence: 'high' }])));
    const result = await resolveFieldsWithAI('key', 'gemini-3.8-flash', FIELDS, {});
    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('gemini-3.8-flash');
    expect(fetchMock.mock.calls[1][0]).toContain('gemini-3.5-flash-lite'); // GEMINI_MODEL_PRIORITY[0]
  });

  it('throws when every model in the fallback list returns 429', async () => {
    fetchMock.mockResolvedValue(httpResponse(429));
    await expect(
      resolveFieldsWithAI('key', 'gemini-3.8-flash', FIELDS, {}),
    ).rejects.toThrow('AI autofill request failed: all models rate limited');
    expect(fetchMock).toHaveBeenCalledTimes(2); // GEMINI_MODEL_PRIORITY length
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

  it('distinguishes denied permissions from an invalid key on 403', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(403));
    expect(await checkApiKey('key')).toBe('permission_denied');
  });

  it('reports a server error separately from a network failure', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(500));
    expect(await checkApiKey('key')).toBe('service_error');
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
    expect(result).toEqual({ valid: false, errorCode: 'invalid', error: KEY_ERROR_MESSAGES.invalid, keyInvalid: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a 403 as a permission failure without invalidating the key', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(403));
    const result = await validateApiKey('key');
    expect(result.keyInvalid).toBe(false);
    expect(result.errorCode).toBe('permission_denied');
    expect(result.valid).toBe(false);
  });

  it('treats a 400 whose body mentions "API key" as keyInvalid', async () => {
    fetchMock.mockResolvedValueOnce(
      httpResponse(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }),
    );
    const result = await validateApiKey('key');
    expect(result).toEqual({ valid: false, errorCode: 'invalid', error: KEY_ERROR_MESSAGES.invalid, keyInvalid: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a 400 with a non-key-related body as a model failure and tries the next model', async () => {
    // First model: model-specific 400; second model: success
    fetchMock
      .mockResolvedValueOnce(httpResponse(400, { error: { message: 'Model not found' } }))
      .mockResolvedValueOnce(httpResponse(200));
    const result = await validateApiKey('key');
    expect(result.valid).toBe(true);
    expect(result.model).toBe('gemini-3.8-flash'); // GEMINI_MODEL_PRIORITY[1]
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
    expect(result.model).toBe('gemini-3.8-flash');
  });

  it('skips a 404 model and tries the next', async () => {
    fetchMock
      .mockResolvedValueOnce(httpResponse(404))
      .mockResolvedValueOnce(httpResponse(200));
    const result = await validateApiKey('key');
    expect(result.valid).toBe(true);
    expect(result.model).toBe('gemini-3.8-flash');
  });

  it('returns keyValidNoModel when every model in the priority list fails non-fatally', async () => {
    fetchMock.mockResolvedValue(httpResponse(404));
    const result = await validateApiKey('key');
    expect(result).toEqual({
      valid: false,
      error: KEY_ERROR_MESSAGES.no_model,
      errorCode: 'no_model',
      keyValidNoModel: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // GEMINI_MODEL_PRIORITY length
  });

  it('returns a network error when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const result = await validateApiKey('key');
    expect(result).toEqual({ valid: false, errorCode: 'network_error', error: KEY_ERROR_MESSAGES.network_error });
  });
});

// ── extractFromResume ────────────────────────────────────────────────────────

describe('extractFromResume', () => {
  const PROFILE_STUB = { personal: { firstName: 'Jane' } } as Partial<Profile>;

  function extract(model: GeminiModel = 'gemini-3.8-flash') {
    return extractFromResume('key', model, 'base64data', 'application/pdf', PROFILE_STUB);
  }

  it('returns the extracted profile parsed from a successful response', async () => {
    fetchMock.mockResolvedValueOnce(
      geminiTextResponse(JSON.stringify({ personal: { firstName: 'Jane', lastName: 'Doe' } })),
    );
    const result = await extract();
    expect(result).toMatchObject({ personal: { firstName: 'Jane', lastName: 'Doe' } });
  });

  it('strips markdown code fences before parsing the extracted profile', async () => {
    fetchMock.mockResolvedValueOnce(geminiTextResponse('```json\n{"personal":{"firstName":"Jane"}}\n```'));
    const result = await extract();
    expect(result).toMatchObject({ personal: { firstName: 'Jane' } });
  });

  it('falls through to the next model on 429, trying the configured model first', async () => {
    fetchMock
      .mockResolvedValueOnce(httpResponse(429))
      .mockResolvedValueOnce(geminiTextResponse(JSON.stringify({ personal: {} })));
    await extract('gemini-3.8-flash');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('gemini-3.8-flash');
    expect(fetchMock.mock.calls[1][0]).toContain('gemini-3.5-flash-lite'); // GEMINI_MODEL_PRIORITY[0]
  });

  it('throws rate_limit when every model in the probe list returns 429', async () => {
    fetchMock.mockResolvedValue(httpResponse(429));
    await expect(extract()).rejects.toMatchObject({ code: 'rate_limit' });
    expect(fetchMock).toHaveBeenCalledTimes(2); // GEMINI_MODEL_PRIORITY length, deduped against the configured model
  });

  it('rethrows AbortError as-is, not wrapped as a network error', async () => {
    const abortErr = new DOMException('aborted', 'AbortError');
    fetchMock.mockRejectedValueOnce(abortErr);
    await expect(extract()).rejects.toBe(abortErr);
  });

  it('wraps a generic fetch failure as a network ImportError', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(extract()).rejects.toMatchObject({ code: 'network' });
  });

  it('throws an auth ImportError on 401', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(401));
    await expect(extract()).rejects.toMatchObject({ code: 'auth' });
  });

  it('throws an auth ImportError on 403', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(403));
    await expect(extract()).rejects.toMatchObject({ code: 'auth' });
  });

  it('tries each model on server failures and reports a service error', async () => {
    fetchMock.mockResolvedValue(httpResponse(503));
    await expect(extract()).rejects.toMatchObject({ code: 'service' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a parse ImportError when the response body cannot be read as JSON', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.reject(new Error('bad body')) });
    await expect(extract()).rejects.toMatchObject({ code: 'parse' });
  });

  it('throws a parse ImportError when the response has no candidate text', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [] }) });
    await expect(extract()).rejects.toMatchObject({ code: 'parse' });
  });

  it('throws a parse ImportError when the candidate text is not valid JSON', async () => {
    fetchMock.mockResolvedValueOnce(geminiTextResponse('this is not json'));
    await expect(extract()).rejects.toMatchObject({ code: 'parse' });
  });
});


afterEach(() => {
  vi.useRealTimers();
});

describe('Gemini credential transport and validation failures', () => {
  it('uses a header, never a request URL, for every Gemini operation', async () => {
    fetchMock.mockResolvedValue(
      httpResponse(200, { candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    );
    await checkApiKey('synthetic-private-key');
    await validateApiKey('synthetic-private-key');
    await extractFromResume(
      'synthetic-private-key',
      'gemini-3.8-flash',
      'synthetic-file',
      'application/pdf',
      {},
    );
    fetchMock.mockResolvedValueOnce(geminiTextResponse('[]'));
    await resolveFieldsWithAI('synthetic-private-key', 'gemini-3.8-flash', [], {});
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).not.toContain('synthetic-private-key');
      expect(url).not.toContain('key=');
      expect(init.headers['x-goog-api-key']).toBe('synthetic-private-key');
    }
  });
  it('recognizes an explicit API_KEY_INVALID 400 response', async () => {
    fetchMock.mockResolvedValue(
      httpResponse(400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }),
    );
    expect(await checkApiKey('bad-key')).toBe('invalid');
  });
  it.each([429, 500, 503])('does not misreport HTTP %s as missing models', async (status) => {
    fetchMock.mockResolvedValue(httpResponse(status));
    const result = await validateApiKey('key');
    expect(result.keyValidNoModel).not.toBe(true);
    expect(result.errorCode).toBe(status === 429 ? 'rate_limit' : 'service_error');
  });
  it('times out a stalled validation request', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        }),
    );
    const pending = checkApiKey('key');
    await vi.advanceTimersByTimeAsync(GEMINI_REQUEST_TIMEOUT_MS);
    expect(await pending).toBe('timeout');
  });
  it('cancels a validation request without labeling the key invalid', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        }),
    );
    const controller = new AbortController();
    const pending = checkApiKey('key', controller.signal);
    controller.abort();
    expect(await pending).toBe('cancelled');
  });
  it('checks only the chosen model for an explicit model preference', async () => {
    fetchMock.mockResolvedValue(httpResponse(404));
    await validateApiKey('key', undefined, 'gemini-3.8-flash');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('gemini-3.8-flash');
  });
});


describe('resume model fallback and response validation', () => {
  it('announces attempts and switches models after a timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    })).mockResolvedValueOnce(geminiTextResponse('{"personal":{"firstName":"Jane"}}'));
    const onAttempt = vi.fn();
    const pending = extractFromResume('key', 'gemini-3.8-flash', 'pdf', 'application/pdf', {}, undefined, [], onAttempt);
    await vi.advanceTimersByTimeAsync(RESUME_REQUEST_TIMEOUT_MS);
    expect(await pending).toMatchObject({ personal: { firstName: 'Jane' } });
    expect(onAttempt.mock.calls.map(([attempt]) => attempt)).toEqual([
      { model: 'gemini-3.8-flash', reason: undefined },
      { model: 'gemini-3.5-flash-lite', reason: 'timeout' },
    ]);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('times out the response body as well as waiting for headers', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url, init) => Promise.resolve({
      ok: true, status: 200,
      json: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
    })).mockResolvedValueOnce(geminiTextResponse('{}'));
    const pending = extractFromResume('key', 'gemini-3.8-flash', 'pdf', 'application/pdf', {});
    await vi.advanceTimersByTimeAsync(RESUME_REQUEST_TIMEOUT_MS);
    expect(await pending).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports timeout after both models stall, rather than blaming the internet', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
    const outcome = extractFromResume('key', 'gemini-3.8-flash', 'pdf', 'application/pdf', {}).catch(error => error);
    await vi.advanceTimersByTimeAsync(RESUME_REQUEST_TIMEOUT_MS * 2);
    expect(await outcome).toMatchObject({ code: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('announces rate limiting and unavailable models without changing the saved preference', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(429)).mockResolvedValueOnce(geminiTextResponse('{}'));
    const onAttempt = vi.fn();
    await extractFromResume('key', 'gemini-3.8-flash', 'pdf', 'application/pdf', {}, undefined, [], onAttempt);
    expect(onAttempt).toHaveBeenLastCalledWith({ model: 'gemini-3.5-flash-lite', reason: 'rate_limit' });
  });

  it('does not try another model after cancellation', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
    const pending = extractFromResume('key', 'gemini-3.8-flash', 'pdf', 'application/pdf', {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['[]', 'null', '{"education":"not an array"}', '{"personal":{"email":42}}'])('rejects malformed profile JSON before comparison: %s', output => {
    fetchMock.mockResolvedValueOnce(geminiTextResponse(output));
    return expect(extractFromResume('key', 'gemini-3.8-flash', 'pdf', 'application/pdf', {})).rejects.toMatchObject({ code: 'parse' });
  });
});

it.each(['resume', 'uncertain', undefined, null] as const)(
  'separates %s document assessment from profile data in the same request',
  async (documentType) => {
    fetchMock.mockResolvedValueOnce(
      geminiTextResponse(JSON.stringify({ documentType, personal: { firstName: 'Jane' } })),
    );
    const assessment = vi.fn();
    const profile = await extractFromResume(
      'key',
      'gemini-3.8-flash',
      'pdf',
      'application/pdf',
      {},
      undefined,
      [],
      undefined,
      assessment,
    );
    expect(assessment).toHaveBeenCalledWith(documentType ?? 'uncertain');
    expect(profile).toMatchObject({ personal: { firstName: 'Jane' } });
    expect(profile).not.toHaveProperty('documentType');
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
it('stops a clear non-resume before validating or returning its personal fields, without model fallback', async () => {
  fetchMock.mockResolvedValueOnce(
    geminiTextResponse(JSON.stringify({ documentType: 'other', personal: { email: 42 } })),
  );
  await expect(
    extractFromResume('key', 'gemini-3.8-flash', 'pdf', 'application/pdf', {}),
  ).rejects.toMatchObject({ code: 'not_resume' });
  expect(fetchMock).toHaveBeenCalledOnce();
});
it('rejects invalid assessment metadata rather than silently assuming a resume', async () => {
  fetchMock.mockResolvedValueOnce(geminiTextResponse('{"documentType":"probably","personal":{}}'));
  await expect(
    extractFromResume('key', 'gemini-3.8-flash', 'pdf', 'application/pdf', {}),
  ).rejects.toMatchObject({ code: 'parse' });
});
