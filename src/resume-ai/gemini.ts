import type { Profile } from '@/src/types/profile';
import type { GeminiModel, KeyValidationResult, ImportError } from './types';
import { GEMINI_MODEL_PRIORITY } from './types';
import { buildPrompt } from './prompt';

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
): Promise<Partial<Profile>> {
  const prompt = buildPrompt(JSON.stringify(currentProfile, null, 2));

  let resp: Response;
  try {
    resp = await fetch(endpoint(model, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: fileBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
      signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    throw importError('network', 'Connection failed. Check your internet.');
  }

  if (!resp.ok) {
    if (resp.status === 429) throw importError('rate_limit', 'Daily limit reached. Try again tomorrow.');
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

  return parseResponse(text);
}

function parseResponse(text: string): Partial<Profile> {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Partial<Profile>;
  } catch {
    throw importError('parse', "Couldn't read the response. Try again.");
  }
}

// ── AI autofill field resolution ─────────────────────────────────────────────

export interface AIFieldPayload {
  fieldId:      string;
  type:         'text' | 'radio' | 'checkbox';
  label:        string;
  placeholder?: string;
  name?:        string;
  nearbyText?:  string;
  options?:     string[];
}

export interface AIFieldResponse {
  fieldId:          string;
  profilePath?:     string | null;
  selectedOption?:  string | null;
  selectedOptions?: string[] | null;
  confidence:       'high' | 'low' | null;
}

const AUTOFILL_SYSTEM_PROMPT = `You are an autofill assistant for a job application tool.

Given a list of form fields and the user's profile JSON, return ONLY a valid JSON array. No markdown, no explanation — raw JSON only.

Response format per field type:
- text:     { "fieldId": "...", "profilePath": "dot.path.into.profile | null", "confidence": "high|low|null" }
- radio:    { "fieldId": "...", "selectedOption": "exact option label | null", "confidence": "high|low|null" }
- checkbox: { "fieldId": "...", "selectedOptions": ["label1", ...] or [], "confidence": "high|low|null" }

Rules:
- Never invent information not explicitly present in the profile
- For text: return a dot-notation path into the profile object, or null
- For radio: return the exact option label that best matches the profile, or null
- For checkbox: return an array of matching option labels (may be empty)
- confidence "high" = certain; "low" = plausible; null = no match
- When uncertain, return null / empty rather than guessing`;

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
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

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
