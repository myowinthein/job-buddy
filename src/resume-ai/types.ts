export type GeminiModel =
  | 'gemini-3.6-flash'
  | 'gemini-3.5-flash'
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.1-flash-lite';

// Models tried in order during the background probe. The first model to respond
// successfully is selected. Must equal GEMINI_MODEL_PRIORITY[0].
export const GEMINI_MODEL_PRIORITY: GeminiModel[] = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];

// The default model applied immediately when a key is validated (Step 2 of the
// debounce flow). The background probe (Step 3) may upgrade this to a higher
// priority model. Must equal GEMINI_MODEL_PRIORITY[0].
export const DEFAULT_GEMINI_MODEL: GeminiModel = GEMINI_MODEL_PRIORITY[0];

export const MODEL_DISPLAY_NAMES: Record<GeminiModel, string> = {
  'gemini-3.6-flash':      'Gemini 3.6 Flash',
  'gemini-3.5-flash':      'Gemini 3.5 Flash',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
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

// ── AI autofill payload types ────────────────────────────────────────────────
// Shared between src/resume-ai/gemini.ts (producer) and src/autofill/ai.ts (consumer).

export interface AIOptionPayload {
  label: string;
  value: string;
}

export interface AIFieldPayload {
  fieldId:      string;
  type:         'text' | 'select' | 'radio' | 'checkbox';
  label:        string;
  placeholder?: string;
  name?:        string;
  nearbyText?:  string;
  options?:     AIOptionPayload[];
}

export interface AIFieldResponse {
  fieldId:          string;
  profilePath?:     string | null;
  selectedOption?:  string | null;
  selectedOptions?: string[] | null;
  confidence:       'high' | 'low' | null;
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
