import type { Profile } from '@/src/types/profile';
import type { GeminiModel, KeyValidationResult, ImportError, AIFieldPayload, AIFieldResponse, AIOptionPayload } from './types';
import { GEMINI_MODEL_PRIORITY } from './types';
import { buildPrompt } from './prompt';
import { normalizeExtractedProfile, stripMarkdown } from './normalize';
import { AUTOFILL_SYSTEM_PROMPT } from './autofillPrompt';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function endpoint(model: string, apiKey: string): string {
  return `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
}

// ── Key validation (decoupled from model selection) ───────────────────────────

export async function checkApiKey(apiKey: string): Promise<'valid' | 'invalid' | 'network_error'> {
  try {
    const resp = await fetch(
      `${GEMINI_BASE}?key=${encodeURIComponent(apiKey)}&pageSize=1`,
      { method: 'GET' },
    );
    if (resp.ok) return 'valid';
    if (resp.status === 401 || resp.status === 403) return 'invalid';
    return 'network_error';
  } catch {
    return 'network_error';
  }
}

function importError(code: ImportError['code'], message: string): ImportError {
  return { code, message };
}

export async function validateApiKey(apiKey: string): Promise<KeyValidationResult> {
  for (const model of GEMINI_MODEL_PRIORITY) {
    let resp: Response;
    try {
      resp = await fetch(endpoint(model, apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      });
    } catch {
      return { valid: false, error: 'Network error while validating key' };
    }

    if (resp.ok) return { valid: true, model: model as GeminiModel };

    // 401/403 = authentication failure; key is definitively rejected
    if (resp.status === 401 || resp.status === 403) {
      return { valid: false, error: 'API key invalid', keyInvalid: true };
    }

    // 400 is ambiguous: could be "API key not valid" OR "model not found / bad request".
    // Read the body to decide; if we can't parse it, assume model-specific and try next.
    if (resp.status === 400) {
      let body: { error?: { message?: string } } | null = null;
      try { body = await resp.json(); } catch { /* non-JSON body, treat as model error */ }
      const msg = (body?.error?.message ?? '').toLowerCase();
      if (msg.includes('api key') || msg.includes('api_key')) {
        return { valid: false, error: 'API key invalid', keyInvalid: true };
      }
      continue; // model-specific 400 (e.g. "Model not found"); try next
    }

    // 404 = model unavailable for this account; try next
    if (resp.status === 404) continue;
    // any other non-200 = temporary or model-specific failure; try next
  }
  return { valid: false, error: 'No supported model available for this key', keyValidNoModel: true };
}

export async function extractFromResume(
  apiKey: string,
  model: string,
  fileBase64: string,
  mimeType: string,
  currentProfile: Partial<Profile>,
  signal?: AbortSignal,
  links: string[] = [],
): Promise<Partial<Profile>> {
  const prompt = buildPrompt(JSON.stringify(currentProfile, null, 2), links);
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
      resp = await fetch(endpoint(tryModel, apiKey), {
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

    const text = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      ?.candidates?.[0]?.content?.parts?.[0]?.text;

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
  model: string,
  fields: AIFieldPayload[],
  profile: object,
): Promise<AIFieldResponse[]> {
  const body = JSON.stringify({ fields, profile }, null, 2);

  let resp: Response;
  try {
    resp = await fetch(endpoint(model, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${AUTOFILL_SYSTEM_PROMPT}\n\n${body}` }] }],
        generationConfig: { temperature: 0 },
      }),
    });
  } catch {
    throw new Error('Network error during AI autofill');
  }

  if (!resp.ok) throw new Error(`AI autofill request failed: ${resp.status}`);

  let data: unknown;
  try { data = await resp.json(); } catch { return []; }

  const text = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return parseAutofillResponse(text);
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
