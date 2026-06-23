// Ephemeral autofill debug session. Held in memory by the content script,
// fetched on demand by the popup. One session at a time — new runs overwrite.

export type MatchLayer =
  | 'learned'
  | 'autocomplete'
  | 'dictionary_exact'
  | 'fuzzy'
  | 'context'
  | 'none';

export type FieldFinalState = 'green' | 'yellow' | 'red' | 'gray';

export interface DebugScanField {
  fieldId: string;
  label:   string;
  type:    string;
  name:    string;
  id:      string;
}

export interface DebugMappingField {
  fieldId:     string;
  matchLayer:  MatchLayer;
  confidence:  number;
  profilePath: string | null;
  finalState:  FieldFinalState;
}

export interface DebugAIField {
  fieldId:      string;
  label:        string;
  type:         'text' | 'radio' | 'checkbox';
  // Profile path (text) or selected option label(s) (radio/checkbox) returned by AI
  aiResult:     string | null;
  aiConfidence: 'high' | 'low' | null;
  // 'green' / 'yellow' if AI produced a fill; 'unchanged' if AI returned null or fill failed
  finalState:   'green' | 'yellow' | 'unchanged';
}

export interface DebugSummary {
  green:  number;
  yellow: number;
  red:    number;
  gray:   number;
}

export interface DebugSession {
  timestamp: number;
  scanner:   DebugScanField[];
  mapping:   DebugMappingField[];
  ai:        DebugAIField[];
  summary:   DebugSummary;
  aiSkipped: boolean; // true when no API key was configured at run time
}
