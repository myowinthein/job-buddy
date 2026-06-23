import { distance } from 'fastest-levenshtein';
import type { Profile } from '../types/profile';
import type { LearnedMappings } from '../types/storage';
import type { FieldSignals } from './signals';
import { normalize } from './normalizer';
import { FIELD_DICTIONARY } from './dictionary';
import { resolveProfileValue } from './resolver';
import type { MatchLayer } from './debug';

export interface FieldMatch {
  fieldPath:  string | null;
  confidence: number;
  value:      string | null;
  matchLayer: MatchLayer;
}

// ── Layer 1 — Autocomplete attribute map ────────────────────────────────────
const AUTOCOMPLETE_MAP: Record<string, { path: string; confidence: number }> = {
  'given-name':        { path: 'personal.firstName',        confidence: 0.95 },
  'family-name':       { path: 'personal.lastName',         confidence: 0.95 },
  'email':             { path: 'personal.email',            confidence: 0.95 },
  'tel':               { path: 'personal.phone.number',     confidence: 0.95 },
  'tel-country-code':  { path: 'personal.phone.callingCode', confidence: 0.95 },
  'street-address':    { path: 'address.street',            confidence: 0.95 },
  'address-level2':    { path: 'address.city',              confidence: 0.95 },
  'country':           { path: 'address.country',           confidence: 0.95 },
  'country-name':      { path: 'address.country',           confidence: 0.95 },
  'postal-code':       { path: 'address.postalCode',        confidence: 0.95 },
  'organization':      { path: 'derived.currentCompany',    confidence: 0.95 },
  'organization-title':{ path: 'derived.currentTitle',      confidence: 0.95 },
  'url':               { path: 'links.linkedin',            confidence: 0.80 },
};

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

function dictionaryExact(norm: string): string | null {
  for (const [fieldPath, variations] of Object.entries(FIELD_DICTIONARY)) {
    if (variations.includes(norm)) return fieldPath;
  }
  return null;
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
  return bestPath && bestScore >= 0.60 ? { fieldPath: bestPath, score: bestScore } : null;
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
  // Signals used in Layers 0–3 (nearbyText is reserved for Layer 4)
  const signalValues = [
    signals.name, signals.id, signals.placeholder, signals.ariaLabel, signals.label,
  ].filter(Boolean);
  const normed = signalValues.map(normalize).filter(Boolean);
  const domainMappings = learnedMappings[domain] ?? {};

  // ── Layer 0: Learned mappings ──────────────────────────────────────────────
  for (const n of normed) {
    const learned = domainMappings[n];
    if (learned) {
      return { fieldPath: learned, confidence: 0.97, value: resolve(profile, learned), matchLayer: 'learned' };
    }
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
    if (hit) return { fieldPath: hit, confidence: 0.85, value: resolve(profile, hit), matchLayer: 'dictionary_exact' };
  }

  // ── Layer 3: Fuzzy matching on primary signals ────────────────────────────
  let bestFuzzy: { fieldPath: string; score: number } | null = null;
  for (const n of normed) {
    const result = dictionaryFuzzy(n);
    if (result && (!bestFuzzy || result.score > bestFuzzy.score)) bestFuzzy = result;
  }
  if (bestFuzzy) {
    const { fieldPath, score } = bestFuzzy;
    if (score > 0.75) {
      return { fieldPath, confidence: score * 0.85, value: resolve(profile, fieldPath), matchLayer: 'fuzzy' };
    }
    if (score >= 0.60) {
      return { fieldPath, confidence: score * 0.75, value: resolve(profile, fieldPath), matchLayer: 'fuzzy' };
    }
  }

  // ── Layer 4: Context signals (nearbyText only) ────────────────────────────
  const nearbyNorm = normalize(signals.nearbyText);
  if (nearbyNorm) {
    const exactHit = dictionaryExact(nearbyNorm);
    if (exactHit) {
      return { fieldPath: exactHit, confidence: 0.70, value: resolve(profile, exactHit), matchLayer: 'context' };
    }
    const fuzzyHit = dictionaryFuzzy(nearbyNorm);
    if (fuzzyHit && fuzzyHit.score >= 0.75) {
      return { fieldPath: fuzzyHit.fieldPath, confidence: 0.70, value: resolve(profile, fuzzyHit.fieldPath), matchLayer: 'context' };
    }
  }

  return { fieldPath: null, confidence: 0, value: null, matchLayer: 'none' };
}
