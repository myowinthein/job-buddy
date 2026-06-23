import type { Profile } from '@/src/types/profile';
import type { GeminiModel, KeyValidationResult, ImportError } from './types';
import { GEMINI_MODEL_PRIORITY } from './types';
import { buildPrompt } from './prompt';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function endpoint(model: string, apiKey: string): string {
  return `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
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
    // 400/401/403 = key rejected; stop immediately
    if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
      return { valid: false, error: 'API key invalid', keyInvalid: true };
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
