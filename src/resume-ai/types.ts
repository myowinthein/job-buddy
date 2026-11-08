export type GeminiModel =
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.8-flash';

// Models tried in order during the background probe. The first model to respond
// successfully is selected.
export const GEMINI_MODEL_PRIORITY: GeminiModel[] = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
];

// First candidate for automatic model selection.
export const DEFAULT_GEMINI_MODEL: GeminiModel = GEMINI_MODEL_PRIORITY[0];

/** The chosen model first, then the others in priority order, for fallback requests. */
export function fallbackModels(model: GeminiModel): GeminiModel[] {
  return [model, ...GEMINI_MODEL_PRIORITY.filter((candidate) => candidate !== model)];
}

export const MODEL_DISPLAY_NAMES: Record<GeminiModel, string> = {
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
};

// Persisted model strings can predate the current GeminiModel union (e.g. an
// older version's model name after a lineup change). Validates and falls back
// to the current default rather than passing a stale/unknown id to the API.
export function toGeminiModel(stored: string | null | undefined): GeminiModel {
  return (GEMINI_MODEL_PRIORITY as string[]).includes(stored ?? '')
    ? (stored as GeminiModel)
    : DEFAULT_GEMINI_MODEL;
}

export type ImportProgressStep = 'reading' | 'sending' | 'processing';

export type ImportErrorCode = 'rate_limit' | 'auth' | 'parse' | 'network' | 'timeout' | 'service' | 'file_too_large' | 'invalid_file' | 'not_resume';
export type ResumeDocumentType = 'resume' | 'uncertain';

export interface ResumeModelAttempt {
  model: GeminiModel;
  reason?: 'rate_limit' | 'timeout' | 'unavailable';
}

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
  /** Explains list replacement, merging, or a binary file change. */
  note?: string;
  entries?: import('./entryComparison').EntryComparison[];
  /** Replacement omits rejected entries instead of retaining their saved versions. */
  entryMode?: 'replace';
  /** Absent values are preserved, rather than counted as matching details. */
  hasIncomingValue?: boolean;
}

// ── AI autofill payload types ────────────────────────────────────────────────
// Shared between src/resume-ai/gemini.ts (producer) and src/autofill/ai.ts (consumer).

export interface AIOptionPayload {
  /** Stable within this request; preferred over ambiguous labels or values. */
  id?: string;
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
  /** Visible question text, excluding internal name/id fallbacks. */
  visibleLabel?: string;
  inputType?: string;
  multiple?: boolean;
  section?: string;
  entryIndex?: number;
  autocomplete?: string;
  constraints?: { min?: string; max?: string; step?: string; pattern?: string; maxLength?: number };
}

export interface AIFieldResponse {
  fieldId:          string;
  profilePath?:     string | null;
  selectedOption?:  string | null;
  selectedOptions?: string[] | null;
  confidence:       'high' | 'low' | null;
}

export type KeyCheckStatus =
  | 'valid'
  | 'invalid'
  | 'permission_denied'
  | 'rate_limit'
  | 'service_error'
  | 'network_error'
  | 'timeout'
  | 'cancelled';

export interface KeyValidationResult {
  errorCode?: Exclude<KeyCheckStatus, 'valid'> | 'no_model';
  valid: boolean;
  model?: GeminiModel;
  error?: string;
  /** true when the key authenticated successfully but no model in the priority list was accessible */
  keyValidNoModel?: boolean;
  /** true only when the response identifies an invalid or expired credential */
  keyInvalid?: boolean;
}
