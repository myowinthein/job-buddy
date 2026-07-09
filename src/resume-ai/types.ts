export type GeminiModel =
  | 'gemini-3.5-flash'
  | 'gemini-3.1-flash-lite'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-pro';

// Models tried in order during the background probe. gemini-2.5-flash-lite is
// recognised as a valid stored model but is not a probe candidate.
// gemini-3.x entries are reserved for future Gemini releases — they are probe
// candidates but not yet in production. When Google releases these models,
// remove this comment and verify the model IDs match the official naming.
export const GEMINI_MODEL_PRIORITY: GeminiModel[] = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

export const MODEL_DISPLAY_NAMES: Record<GeminiModel, string> = {
  'gemini-3.5-flash':      'Gemini 3.5 Flash',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'gemini-2.5-flash':      'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
  'gemini-2.5-pro':        'Gemini 2.5 Pro',
};

export type ImportProgressStep = 'reading' | 'sending' | 'processing';

export type ImportErrorCode = 'rate_limit' | 'auth' | 'parse' | 'network' | 'file_too_large';

export interface ImportError {
  code: ImportErrorCode;
  message: string;
}

export type FieldStatus = 'new' | 'conflict' | 'unchanged';

export interface FieldChange {
  id: string;
  label: string;
  section: string;
  currentValue: unknown;
  suggestedValue: unknown;
  displayCurrent: string;
  displaySuggested: string;
  status: FieldStatus;
  /** new: true = include; conflict: true = use suggested, false = keep current */
  accepted: boolean;
}

export interface KeyValidationResult {
  valid: boolean;
  model?: GeminiModel;
  error?: string;
  /** true when the key authenticated successfully but no model in the priority list was accessible */
  keyValidNoModel?: boolean;
  /** true when the API responded with 400/401/403 — key is definitively rejected */
  keyInvalid?: boolean;
}
