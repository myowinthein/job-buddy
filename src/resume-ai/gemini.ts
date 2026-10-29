import { KEY_ERROR_MESSAGES } from './keyErrors';
export { KEY_ERROR_MESSAGES } from './keyErrors';
import type { Profile } from '@/src/types/profile';
import type { GeminiModel, KeyValidationResult, ImportError, AIFieldPayload, AIFieldResponse, KeyCheckStatus } from './types';
import { GEMINI_MODEL_PRIORITY } from './types';
import { buildPrompt } from './prompt';
import { normalizeExtractedProfile, stripMarkdown } from './normalize';
import { buildAutofillPrompt } from './autofillPrompt';
import { autofillProfilePayload } from './profilePayload';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function endpoint(model: string): string {
  return `${GEMINI_BASE}/${model}:generateContent`;
}

export const GEMINI_REQUEST_TIMEOUT_MS = 15_000;
async function geminiFetch(url: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    GEMINI_REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { ...init.headers, 'x-goog-api-key': apiKey },
    });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}

function extractGeminiText(data: unknown): string | undefined {
  return (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function responseError(resp: Response): Promise<Exclude<KeyCheckStatus, 'valid'> | 'no_model'> {
  let error: { message?: string; details?: { reason?: string }[] } = {};
  try { error = (await resp.json())?.error ?? {}; } catch { /* A non-JSON error carries no credential evidence. */ }
  const reasons = error.details?.map(detail => detail.reason).join(' ') ?? '';
  const message = error.message ?? '';
  if (resp.status === 401 || /API_KEY_(INVALID|EXPIRED)/i.test(reasons) ||
    /api[ _]key (?:is )?(?:not valid|invalid|expired)|invalid api[ _]key/i.test(message)) return 'invalid';
  if (resp.status === 403) return 'permission_denied';
  if (resp.status === 429) return 'rate_limit';
  if (resp.status === 404 || (resp.status === 400 && /model.*(?:not found|not supported|unavailable)/i.test(message))) return 'no_model';
  return 'service_error';
}
function requestError(error: unknown, signal?: AbortSignal): Exclude<KeyCheckStatus, 'valid'> {
  if (signal?.aborted) return 'cancelled';
  if ((error as { name?: string })?.name === 'TimeoutError') return 'timeout';
  return 'network_error';
}

export async function checkApiKey(apiKey: string, signal?: AbortSignal): Promise<KeyCheckStatus> {
  try {
    const resp = await geminiFetch(`${GEMINI_BASE}?pageSize=1`, apiKey, { method: 'GET', signal });
    if (resp.ok) return 'valid';
    const status = await responseError(resp);
    return status === 'no_model' ? 'service_error' : status;
  } catch (error) { return requestError(error, signal); }
}
function importError(code: ImportError['code'], message: string): ImportError {
  return { code, message };
}

export async function validateApiKey(
  apiKey: string, signal?: AbortSignal, preferred?: GeminiModel,
): Promise<KeyValidationResult> {
  let failure: Exclude<KeyCheckStatus, 'valid'> | 'no_model' = 'no_model';
  for (const model of preferred ? [preferred] : GEMINI_MODEL_PRIORITY) {
    let resp: Response;
    try {
      resp = await geminiFetch(endpoint(model), apiKey, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
      });
    } catch (error) {
      const errorCode = requestError(error, signal);
      return { valid: false, errorCode, error: KEY_ERROR_MESSAGES[errorCode] };
    }
    if (resp.ok) return { valid: true, model };
    const errorCode = await responseError(resp);
    if (errorCode === 'invalid' || errorCode === 'permission_denied') {
      return { valid: false, errorCode, error: KEY_ERROR_MESSAGES[errorCode], keyInvalid: errorCode === 'invalid' };
    }
    if (errorCode !== 'no_model') failure = errorCode;
  }
  return { valid: false, errorCode: failure, error: KEY_ERROR_MESSAGES[failure], ...(failure === 'no_model' && { keyValidNoModel: true }) };
}

export async function extractFromResume(
  apiKey: string,
  model: GeminiModel,
  fileBase64: string,
  mimeType: string,
  _currentProfile: Partial<Profile>,
  signal?: AbortSignal,
  links: string[] = [],
): Promise<Partial<Profile>> {
  // Review compares against the current profile locally; extraction needs only the selected file.
  const prompt = buildPrompt('{}', links);
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inlineData: { mimeType, data: fileBase64 } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature: 0 },
  });

  // Start with the configured model, then fall through the priority list on 429
  const modelsToTry = [model, ...GEMINI_MODEL_PRIORITY.filter(m => m !== model)];

  for (const tryModel of modelsToTry) {
    let resp: Response;
    try {
      resp = await geminiFetch(endpoint(tryModel), apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      throw importError('network', 'Connection failed. Check your internet.');
    }

    if (resp.status === 429) continue;

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) throw importError('auth', 'API key invalid. Check your key in Settings.');
      throw importError('network', 'Connection failed. Check your internet.');
    }

    let data: unknown;
    try {
      data = await resp.json();
    } catch {
      throw importError('parse', "Couldn't read the response. Try again.");
    }

    const text = extractGeminiText(data);

    if (!text) throw importError('parse', "Couldn't read the response. Try again.");

    return normalizeExtractedProfile(parseResponse(text));
  }

  // All models in the probe list returned 429
  throw importError('rate_limit', 'All AI models are currently busy. Try again later or check your usage at Google AI Studio.');
}

function parseResponse(text: string): Partial<Profile> {
  const cleaned = stripMarkdown(text);
  try {
    return JSON.parse(cleaned) as Partial<Profile>;
  } catch {
    throw importError('parse', "Couldn't read the response. Try again.");
  }
}

// ── AI autofill field resolution ─────────────────────────────────────────────

export async function resolveFieldsWithAI(
  apiKey: string,
  model: GeminiModel,
  fields: AIFieldPayload[],
  profile: object,
): Promise<AIFieldResponse[]> {
  const prompt = buildAutofillPrompt(fields, autofillProfilePayload(profile, fields));
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0 },
  });

  // Start with the configured model, then fall through the priority list on
  // 429 — mirrors extractFromResume()'s fallback so a manually-picked model
  // that's rate-limited doesn't silently disable AI autofill (its caller in
  // src/autofill/ai.ts swallows any thrown error as a silent no-op).
  const modelsToTry = [model, ...GEMINI_MODEL_PRIORITY.filter(m => m !== model)];

  for (const tryModel of modelsToTry) {
    let resp: Response;
    try {
      resp = await geminiFetch(endpoint(tryModel), apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      throw new Error('Network error during AI autofill');
    }

    if (resp.status === 429) continue;
    if (!resp.ok) throw new Error(`AI autofill request failed: ${resp.status}`);

    let data: unknown;
    try { data = await resp.json(); } catch { return []; }

    const text = extractGeminiText(data) ?? '';
    return parseAutofillResponse(text);
  }

  // All models in the fallback list returned 429
  throw new Error('AI autofill request failed: all models rate limited');
}

function parseAutofillResponse(text: string): AIFieldResponse[] {
  const cleaned = stripMarkdown(text);

  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  return (parsed as unknown[]).filter((item): item is AIFieldResponse => {
    if (typeof item !== 'object' || item === null) return false;
    const r = item as Record<string, unknown>;
    if (typeof r.fieldId !== 'string' || !r.fieldId) return false;
    if (r.confidence !== 'high' && r.confidence !== 'low' && r.confidence !== null) return false;
    return true;
  });
}
