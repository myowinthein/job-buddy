import { feedback } from '@/src/ui/feedback';
import { KEY_ERROR_MESSAGES } from './keyErrors';
export { KEY_ERROR_MESSAGES } from './keyErrors';
import type { Profile } from '@/src/types/profile';
import type { GeminiModel, KeyValidationResult, ImportError, AIFieldPayload, AIFieldResponse, KeyCheckStatus, ResumeModelAttempt } from './types';
import { GEMINI_MODEL_PRIORITY } from './types';
import { buildPrompt } from './prompt';
import { stripMarkdown } from './normalize';
import { validateResumeProfile } from './validateResume';
import { buildAutofillPrompt } from './autofillPrompt';
import { autofillProfilePayload } from './profilePayload';
import { resumeDocumentType } from './documentAssessment';
import type { ResumeDocumentType } from './types';
import {
  mappingReviewBody,
  parseMappingAssessments,
  type MappingReviewItem,
  type ReviewCatalogField,
} from '../learned-mappings/review';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function endpoint(model: string): string {
  return `${GEMINI_BASE}/${model}:generateContent`;
}

export const GEMINI_REQUEST_TIMEOUT_MS = 15_000;
export const RESUME_REQUEST_TIMEOUT_MS = 30_000;
async function geminiRequest<T>(
  url: string,
  apiKey: string,
  init: RequestInit,
  consume: (response: Response) => Promise<T>,
  timeoutMs = GEMINI_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const startedAt = Date.now();
  let responseStatus: number | undefined;
  let outcome: 'success' | 'error' | 'timeout' | 'cancelled' = 'success';
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs,
  );
  let onAbort: (() => void) | undefined;
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () =>
        reject(controller.signal.reason ?? new DOMException('Cancelled', 'AbortError'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    return await Promise.race([
      aborted,
      (async () => {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: { ...init.headers, 'x-goog-api-key': apiKey },
        });
        responseStatus = response.status;
        if (!response.ok) outcome = 'error';
        return await consume(response);
      })(),
    ]);
  } catch (error) {
    outcome = controller.signal.aborted
      ? (controller.signal.reason as { name?: string })?.name === 'TimeoutError'
        ? 'timeout'
        : 'cancelled'
      : 'error';
    if (controller.signal.aborted) throw controller.signal.reason ?? error;
    throw error;
  } finally {
    clearTimeout(timer);
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    init.signal?.removeEventListener('abort', abort);
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('jb:dev:request', {
          detail: {
            operation: url.includes(':generateContent') ? 'model-request' : 'key-check',
            model: /models\/([^:/?]+):generateContent/.exec(url)?.[1],
            status: responseStatus,
            outcome,
            durationMs: Date.now() - startedAt,
          },
        }),
      );
    }
  }
}

function geminiFetch(url: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
  return geminiRequest(url, apiKey, init, async response => response);
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

/** Semantic mapping review shares Gemini's authenticated, abortable transport. */
export async function reviewMappingsWithAI(
  apiKey: string,
  model: GeminiModel,
  items: MappingReviewItem[],
  catalog: ReviewCatalogField[],
  signal: AbortSignal,
  onAttempt?: (model: GeminiModel) => void,
) {
  const models = [model, ...GEMINI_MODEL_PRIORITY.filter((candidate) => candidate !== model)];
  let lastError = feedback.resumeServiceUnavailable as string;
  for (const candidate of models) {
    signal.throwIfAborted();
    onAttempt?.(candidate);
    try {
      const result = await geminiRequest(
        endpoint(candidate),
        apiKey,
        {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body: mappingReviewBody(items, catalog),
        },
        async (response) => {
          if (!response.ok) return { error: await responseError(response) };
          return { text: extractGeminiText(await response.json()) };
        },
      );
      signal.throwIfAborted();
      if (result.error) {
        lastError = KEY_ERROR_MESSAGES[result.error];
        if (['rate_limit', 'no_model', 'service_error'].includes(result.error)) continue;
        throw new Error(lastError);
      }
      return {
        assessments: parseMappingAssessments(result.text ?? '', items, catalog),
        model: candidate,
      };
    } catch (error) {
      signal.throwIfAborted();
      if ((error as { name?: string })?.name === 'TimeoutError') {
        lastError = KEY_ERROR_MESSAGES.timeout;
        continue;
      }
      if (
        error instanceof Error &&
        (error.message === feedback.mappingReviewInvalid ||
          Object.values(KEY_ERROR_MESSAGES).some((message) => message === error.message))
      )
        throw error;
      throw new Error(feedback.mappingReviewFailed);
    }
  }
  throw new Error(lastError);
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
  onAttempt?: (attempt: ResumeModelAttempt) => void,
  onDocumentType?: (type: ResumeDocumentType) => void,
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

  const modelsToTry = [model, ...GEMINI_MODEL_PRIORITY.filter(m => m !== model)];
  let reason: ResumeModelAttempt['reason'];
  let lastError: ImportError = importError('rate_limit', feedback.resumeUsageLimit);
  for (const tryModel of modelsToTry) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError');
    onAttempt?.({ model: tryModel, reason });
    try {
      const result = await geminiRequest(endpoint(tryModel), apiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal,
      }, async response => {
        if (!response.ok) return { status: response.status, error: await responseError(response) };
        let data: unknown;
        try { data = await response.json(); }
        catch { throw importError('parse', feedback.resumeUnreadableResponse); }
        const text = extractGeminiText(data);
        if (typeof text !== 'string' || !text) throw importError('parse', feedback.resumeUnreadableResponse);
        let profile: unknown;
        try { profile = JSON.parse(stripMarkdown(text)); }
        catch { throw importError('parse', feedback.resumeUnreadableResponse); }
        const documentType = resumeDocumentType(profile);
        try { return { profile: validateResumeProfile(profile), documentType }; }
        catch { throw importError('parse', feedback.resumeInvalidData); }
      }, RESUME_REQUEST_TIMEOUT_MS);
      if (result.profile) {
        onDocumentType?.(result.documentType!);
        return result.profile;
      }
      if (result.error === 'invalid' || result.error === 'permission_denied')
        throw importError('auth', result.error === 'invalid'
          ? feedback.resumeKeyInvalid
          : feedback.resumeModelDenied);
      if (result.status === 429) {
        reason = 'rate_limit';
        lastError = importError('rate_limit', feedback.resumeUsageLimit);
        continue;
      }
      if (result.status >= 500 || result.error === 'no_model') {
        reason = 'unavailable';
        lastError = importError('service', feedback.resumeServiceUnavailable);
        continue;
      }
      throw importError('service', feedback.resumeAnalysisFailed);
    } catch (error) {
      if (signal?.aborted || (error as { name?: string })?.name === 'AbortError') throw error;
      if ((error as { name?: string })?.name === 'TimeoutError') {
        reason = 'timeout';
        lastError = importError('timeout', feedback.resumeTimedOut);
        continue;
      }
      if ((error as ImportError)?.code) throw error;
      throw importError('network', feedback.resumeConnectionFailed);
    }
  }
  throw lastError;
}

// ── AI autofill field resolution ─────────────────────────────────────────────

export const MAX_AI_FIELDS_PER_REQUEST = 20;
export const MAX_AI_FIELDS_PER_RUN = 200;
export const MAX_AI_REQUEST_BYTES = 96_000;
const AUTOFILL_OUTPUT_TOKENS = 4_096;

export async function resolveFieldsWithAI(
  apiKey: string,
  model: GeminiModel,
  fields: AIFieldPayload[],
  profile: object,
  options: { signal?: AbortSignal; isActive?: () => boolean; onUnavailable?: () => void } = {},
): Promise<AIFieldResponse[]> {
  const models = [model, ...GEMINI_MODEL_PRIORITY.filter((m) => m !== model)];
  const responses: AIFieldResponse[] = [];
  const encoder = new TextEncoder();
  const bodyFor = (batch: AIFieldPayload[]) =>
    JSON.stringify({
      contents: [
        { parts: [{ text: buildAutofillPrompt(batch, autofillProfilePayload(profile, batch)) }] },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: AUTOFILL_OUTPUT_TOKENS },
    });
  if (fields.length > MAX_AI_FIELDS_PER_RUN) options.onUnavailable?.();
  const batches: AIFieldPayload[][] = [];
  let batch: AIFieldPayload[] = [];
  for (const field of fields.slice(0, MAX_AI_FIELDS_PER_RUN)) {
    if (
      batch.length &&
      (batch.length >= MAX_AI_FIELDS_PER_REQUEST ||
        encoder.encode(bodyFor([...batch, field])).length > MAX_AI_REQUEST_BYTES)
    ) {
      batches.push(batch);
      batch = [];
    }
    // An unusually large option list must not bypass the request budget.
    if (encoder.encode(bodyFor([field])).length <= MAX_AI_REQUEST_BYTES) batch.push(field);
    else options.onUnavailable?.();
  }
  if (batch.length || !fields.length) batches.push(batch);
  for (const items of batches) {
    const body = bodyFor(items);
    let lastError: unknown = new Error('AI autofill request failed: all models rate limited');
    for (let i = 0; i < models.length; i++) {
      options.signal?.throwIfAborted();
      if (options.isActive && !options.isActive())
        throw new DOMException('Autofill cancelled', 'AbortError');
      try {
        const result = await geminiRequest(
          endpoint(models[i]),
          apiKey,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: options.signal,
          },
          async (response) => {
            if (!response.ok) return { status: response.status, data: undefined };
            try {
              return { status: response.status, data: (await response.json()) as unknown };
            } catch {
              throw new Error('Invalid AI autofill response');
            }
          },
        );
        options.signal?.throwIfAborted();
        if (result.status < 200 || result.status >= 300) {
          lastError = new Error(
            result.status === 429
              ? 'AI autofill request failed: all models rate limited'
              : `AI autofill request failed: ${result.status}`,
          );
          if ([404, 408, 429, 500, 502, 503, 504].includes(result.status)) continue;
          throw lastError;
        }
        responses.push(...parseAutofillResponse(extractGeminiText(result.data) ?? ''));
        lastError = undefined;
        break;
      } catch (error) {
        options.signal?.throwIfAborted();
        if ((error as { name?: string })?.name === 'TimeoutError') {
          lastError = error;
          continue;
        }
        if (responses.length) {
          options.onUnavailable?.();
          return responses;
        }
        throw error instanceof Error && /^(Invalid AI|AI autofill)/.test(error.message)
          ? error
          : new Error('Network error during AI autofill');
      }
    }
    // Retain answers from earlier batches if a later batch cannot be processed.
    if (lastError) {
      if (responses.length) {
        options.onUnavailable?.();
        return responses;
      }
      throw lastError;
    }
  }
  return responses;
}

function parseAutofillResponse(text: string): AIFieldResponse[] {
  const cleaned = stripMarkdown(text);

  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error('Invalid AI autofill response'); }
  if (!Array.isArray(parsed)) throw new Error('Invalid AI autofill response');

  const valid = (parsed as unknown[]).filter((item): item is AIFieldResponse => {
    if (typeof item !== 'object' || item === null) return false;
    const r = item as Record<string, unknown>;
    if (typeof r.fieldId !== 'string' || !r.fieldId) return false;
    if (r.confidence !== 'high' && r.confidence !== 'low' && r.confidence !== null) return false;
    if (r.profilePath != null && typeof r.profilePath !== 'string') return false;
    if (r.selectedOption != null && typeof r.selectedOption !== 'string') return false;
    if (r.selectedOptions != null && (!Array.isArray(r.selectedOptions) || !r.selectedOptions.every(value => typeof value === 'string'))) return false;
    return true;
  });
  if (parsed.length && !valid.length) throw new Error('Invalid AI autofill response');
  return valid;
}
