import type { Profile } from '../types/profile';
import type { LearnedMappings, LearnedMappingValue } from '../types/storage';
import type { FieldSignals } from './signals';
import { normalize, similarity } from './normalizer';
import { FIELD_DICTIONARY } from './dictionary';
import { resolveProfileValue } from './resolver';
import type { MatchLayer } from './debug';
import {
  CONF_FILL, CONF_CONFIRMED, CONF_DICT_EXACT, CONF_FUZZY_THRESHOLD,
  CONF_FUZZY_STRONG_MULT, CONF_FUZZY_WEAK_MULT, CONF_CONTEXT,
} from './constants';

export interface FieldMatch {
  fieldPath:  string | null;
  confidence: number;
  value:      string | null;
  matchLayer: MatchLayer;
}

// Minimum number of confirmations before a learned mapping is trusted for Layer 0.
// 1 = stored but not yet promoted; ≥2 = trusted.
const LEARNED_MAPPING_THRESHOLD = 2;

// ── Layer 1 — Autocomplete attribute map ────────────────────────────────────
const AUTOCOMPLETE_MAP: Record<string, { path: string; confidence: number }> = {
  'given-name':        { path: 'personal.firstName',        confidence: 0.95 },
  'family-name':       { path: 'personal.lastName',         confidence: 0.95 },
  'email':             { path: 'personal.email',            confidence: 0.95 },
  'tel':               { path: 'personal.phone.full',        confidence: 0.95 },
  'tel-national':      { path: 'personal.phone.number',      confidence: 0.95 },
  'tel-country-code':  { path: 'personal.phone.callingCode', confidence: 0.95 },
  'street-address':    { path: 'address.street',            confidence: 0.95 },
  'address-level2':    { path: 'address.city',              confidence: 0.95 },
  'country':           { path: 'address.country',           confidence: 0.95 },
  'country-name':      { path: 'address.country',           confidence: 0.95 },
  'postal-code':       { path: 'address.postalCode',        confidence: 0.95 },
  'organization':      { path: 'derived.currentCompany',    confidence: 0.95 },
  'organization-title':{ path: 'derived.currentTitle',      confidence: 0.95 },
  // 'url' is intentionally absent: autocomplete="url" is too generic to assign
  // to any specific link field. Let the label/name signals decide via the
  // dictionary instead.
};


// Reverse index: normalized variation term → fieldPath. Built once at module
// load since FIELD_DICTIONARY is static, turning dictionaryExact into an O(1)
// Map lookup instead of an O(entries × variations) scan per call.
const EXACT_TERM_TO_PATH: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [fieldPath, variations] of Object.entries(FIELD_DICTIONARY)) {
    for (const v of variations) {
      if (!m.has(v)) m.set(v, fieldPath);
    }
  }
  return m;
})();

function dictionaryExact(norm: string): string | null {
  return EXACT_TERM_TO_PATH.get(norm) ?? null;
}

function dictionaryFuzzy(norm: string): { fieldPath: string; score: number } | null {
  let bestScore = 0;
  let bestPath: string | null = null;
  for (const [fieldPath, variations] of Object.entries(FIELD_DICTIONARY)) {
    for (const v of variations) {
      const s = similarity(norm, v);
      if (s > bestScore) { bestScore = s; bestPath = fieldPath; }
    }
  }
  return bestPath && bestScore >= CONF_FILL ? { fieldPath: bestPath, score: bestScore } : null;
}

function resolve(profile: Profile, fieldPath: string): string | null {
  const v = resolveProfileValue(profile, fieldPath);
  return v || null;
}

export function mapField(
  signals: FieldSignals,
  profile: Profile,
  learnedMappings: LearnedMappings,
  domain: string,
): FieldMatch {
  // Signals used in Layers 0–3 (nearbyText is reserved for Layer 4).
  // Label is checked first because it is the most semantically reliable
  // signal — it is what the user reads and describes what the field is FOR.
  // name/id are developer-assigned and may be stale, legacy, or misleading
  // (e.g. name="linkedin" on a "Website / Blog / Portfolio" field).
  const signalValues = [
    signals.label, signals.ariaLabel, signals.placeholder, signals.name, signals.id,
  ].filter(Boolean);
  const normed = signalValues.map(normalize).filter(Boolean);
  const domainMappings = learnedMappings[domain] ?? {};

  // ── Layer 0: Learned mappings ──────────────────────────────────────────────
  for (const n of normed) {
    const learned: LearnedMappingValue | undefined = domainMappings[n];
    if (!learned) continue;

    let fieldPath: string;
    if (typeof learned === 'string') {
      // Legacy format written by older versions — trust unconditionally.
      fieldPath = learned;
    } else if (learned.count >= LEARNED_MAPPING_THRESHOLD) {
      // New counted format — only promote once the threshold is reached.
      fieldPath = learned.path;
    } else {
      // Below threshold: keep accumulating, but don't use yet.
      continue;
    }

    return { fieldPath, confidence: CONF_CONFIRMED, value: resolve(profile, fieldPath), matchLayer: 'learned' };
  }

  // ── Layer 1: Autocomplete attribute ───────────────────────────────────────
  const ac = signals.autocomplete.toLowerCase().trim();
  if (ac && AUTOCOMPLETE_MAP[ac]) {
    const { path, confidence } = AUTOCOMPLETE_MAP[ac];
    return { fieldPath: path, confidence, value: resolve(profile, path), matchLayer: 'autocomplete' };
  }

  // ── Layer 2: Dictionary exact match ───────────────────────────────────────
  for (const n of normed) {
    const hit = dictionaryExact(n);
    if (hit) return { fieldPath: hit, confidence: CONF_DICT_EXACT, value: resolve(profile, hit), matchLayer: 'dictionary_exact' };
  }

  // ── Layer 3: Fuzzy matching on primary signals ────────────────────────────
  let bestFuzzy: { fieldPath: string; score: number } | null = null;
  for (const n of normed) {
    const result = dictionaryFuzzy(n);
    if (result && (!bestFuzzy || result.score > bestFuzzy.score)) bestFuzzy = result;
  }
  if (bestFuzzy) {
    const { fieldPath, score } = bestFuzzy;
    if (score > CONF_FUZZY_THRESHOLD) {
      return { fieldPath, confidence: score * CONF_FUZZY_STRONG_MULT, value: resolve(profile, fieldPath), matchLayer: 'fuzzy' };
    }
    if (score >= CONF_FILL) {
      return { fieldPath, confidence: score * CONF_FUZZY_WEAK_MULT, value: resolve(profile, fieldPath), matchLayer: 'fuzzy' };
    }
  }

  // ── Layer 4: Context signals (nearbyText only) ────────────────────────────
  const nearbyNorm = normalize(signals.nearbyText);
  if (nearbyNorm) {
    const exactHit = dictionaryExact(nearbyNorm);
    if (exactHit) {
      return { fieldPath: exactHit, confidence: CONF_CONTEXT, value: resolve(profile, exactHit), matchLayer: 'context' };
    }
    const fuzzyHit = dictionaryFuzzy(nearbyNorm);
    if (fuzzyHit && fuzzyHit.score >= CONF_FUZZY_THRESHOLD) {
      return { fieldPath: fuzzyHit.fieldPath, confidence: CONF_CONTEXT, value: resolve(profile, fuzzyHit.fieldPath), matchLayer: 'context' };
    }
  }

  return { fieldPath: null, confidence: 0, value: null, matchLayer: 'none' };
}
