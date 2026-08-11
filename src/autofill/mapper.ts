import type { Profile } from '../types/profile';
import type { LearnedMappings, LearnedMappingValue } from '../types/storage';
import type { FieldSignals } from './signals';
import { normalize, similarity } from './normalizer';
import { FIELD_DICTIONARY } from './dictionary';
import { resolveProfileValue } from './resolver';
import type { MatchLayer } from './debug';
import {
  CONF_FILL, CONF_CONFIRMED, CONF_DICT_EXACT, CONF_FUZZY_THRESHOLD,
  CONF_FUZZY_STRONG_MULT, CONF_FUZZY_WEAK_MULT, CONF_CONTEXT, CONF_AUTOCOMPLETE,
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
  'given-name':        { path: 'personal.firstName',        confidence: CONF_AUTOCOMPLETE },
  'family-name':       { path: 'personal.lastName',         confidence: CONF_AUTOCOMPLETE },
  'nickname':          { path: 'personal.nickname',         confidence: CONF_AUTOCOMPLETE },
  'email':             { path: 'personal.email',            confidence: CONF_AUTOCOMPLETE },
  'tel':               { path: 'personal.phone.full',        confidence: CONF_AUTOCOMPLETE },
  'tel-national':      { path: 'personal.phone.number',      confidence: CONF_AUTOCOMPLETE },
  'tel-country-code':  { path: 'personal.phone.callingCode', confidence: CONF_AUTOCOMPLETE },
  'street-address':    { path: 'address.street',            confidence: CONF_AUTOCOMPLETE },
  'address-level2':    { path: 'address.city',              confidence: CONF_AUTOCOMPLETE },
  'country':           { path: 'address.country',           confidence: CONF_AUTOCOMPLETE },
  'country-name':      { path: 'address.country',           confidence: CONF_AUTOCOMPLETE },
  'postal-code':       { path: 'address.postalCode',        confidence: CONF_AUTOCOMPLETE },
  'organization':      { path: 'derived.currentCompany',    confidence: CONF_AUTOCOMPLETE },
  'organization-title':{ path: 'derived.currentTitle',      confidence: CONF_AUTOCOMPLETE },
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

// FIELD_DICTIONARY is static, so a given normalized signal always fuzzy-matches
// to the same result — memoize per unique signal to avoid re-scanning all
// ~100+ dictionary terms every time the same signal recurs (Layers 3 and 4
// can each call this per field, so common signals get looked up repeatedly
// within and across scans of a page). Content scripts persist across SPA
// client-side navigation (no full reload), so this is capped rather than
// left to grow unboundedly for the tab's lifetime — far more than any real
// page's distinct field labels, just a backstop against unbounded growth.
const FUZZY_CACHE_MAX_ENTRIES = 500;
const fuzzyCache = new Map<string, { fieldPath: string; score: number } | null>();

// Exported for testing only.
export function getFuzzyCacheSize(): number {
  return fuzzyCache.size;
}

function dictionaryFuzzy(norm: string): { fieldPath: string; score: number } | null {
  const cached = fuzzyCache.get(norm);
  if (cached !== undefined) return cached;

  let bestScore = 0;
  let bestPath: string | null = null;
  for (const [fieldPath, variations] of Object.entries(FIELD_DICTIONARY)) {
    for (const v of variations) {
      const s = similarity(norm, v);
      if (s > bestScore) { bestScore = s; bestPath = fieldPath; }
    }
  }
  const result = bestPath && bestScore >= CONF_FILL ? { fieldPath: bestPath, score: bestScore } : null;
  if (fuzzyCache.size >= FUZZY_CACHE_MAX_ENTRIES) {
    // Map preserves insertion order — evict the oldest entry (FIFO, not LRU;
    // simplicity is fine for a rarely-hit backstop, not a hot-path concern).
    const oldest = fuzzyCache.keys().next().value;
    if (oldest !== undefined) fuzzyCache.delete(oldest);
  }
  fuzzyCache.set(norm, result);
  return result;
}

function resolve(profile: Profile, fieldPath: string): string | null {
  const v = resolveProfileValue(profile, fieldPath);
  return v || null;
}

// Layers 2-4 all resolve dictionary hits through the same static reverse
// index (see EXACT_TERM_TO_PATH), so a text/url field sharing a resume/cv
// label with the file-upload dictionary entry (documents.cv.file) would
// otherwise resolve to the file's name rather than a URL — there's no
// 'documents.cv.url' dictionary entry, since giving it the same alias terms
// would just re-create the same collision. The disambiguating signal (is
// this element actually a file input) only mapField() has — FieldMatch
// itself carries no element info — so this can't be a page-wide
// sibling-detection pass like phoneResolution.ts; it has to happen here.
function resolveDictionaryHit(
  profile: Profile,
  fieldPath: string,
  signals: FieldSignals,
): { fieldPath: string; value: string | null } {
  if (fieldPath === 'documents.cv.file' && signals.type !== 'file') {
    // Redirect unconditionally, even if no url is stored — resolve() then
    // correctly returns null (gray/noData tier) rather than falling back to
    // filling the file's name into a text field, which is never right.
    return { fieldPath: 'documents.cv.url', value: resolve(profile, 'documents.cv.url') };
  }
  return { fieldPath, value: resolve(profile, fieldPath) };
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
    if (hit) {
      const resolved = resolveDictionaryHit(profile, hit, signals);
      return { fieldPath: resolved.fieldPath, confidence: CONF_DICT_EXACT, value: resolved.value, matchLayer: 'dictionary_exact' };
    }
  }

  // ── Layer 3: Fuzzy matching on primary signals ────────────────────────────
  let bestFuzzy: { fieldPath: string; score: number } | null = null;
  for (const n of normed) {
    const result = dictionaryFuzzy(n);
    if (result && (!bestFuzzy || result.score > bestFuzzy.score)) bestFuzzy = result;
  }
  if (bestFuzzy) {
    const { fieldPath, score } = bestFuzzy;
    const resolved = resolveDictionaryHit(profile, fieldPath, signals);
    if (score > CONF_FUZZY_THRESHOLD) {
      return { fieldPath: resolved.fieldPath, confidence: score * CONF_FUZZY_STRONG_MULT, value: resolved.value, matchLayer: 'fuzzy' };
    }
    if (score >= CONF_FILL) {
      return { fieldPath: resolved.fieldPath, confidence: score * CONF_FUZZY_WEAK_MULT, value: resolved.value, matchLayer: 'fuzzy' };
    }
  }

  // ── Layer 3.5: Custom link labels (dynamic, per-profile) ──────────────────
  // Unlike FIELD_DICTIONARY, this list is built from the user's own custom
  // link labels each call — labels are free text the user defines themselves
  // (e.g. "GitHub", "Behance"), so a static dictionary entry can't cover
  // them. Runs after the static dictionary layers so well-known fields
  // (LinkedIn, portfolio) always prefer their dedicated entries.
  const customLinks = profile.links?.custom ?? [];
  if (customLinks.length) {
    let best: { idx: number; score: number } | null = null;
    customLinks.forEach((link, idx) => {
      if (!link.label || !link.url) return;
      const normLabel = normalize(link.label);
      if (!normLabel) return;
      for (const n of normed) {
        const score = n === normLabel ? 1 : similarity(n, normLabel);
        if (!best || score > best.score) best = { idx, score };
      }
    });
    if (best) {
      const { idx, score } = best;
      const fieldPath = `links.custom.${idx}.url`;
      if (score === 1) {
        return { fieldPath, confidence: CONF_DICT_EXACT, value: resolve(profile, fieldPath), matchLayer: 'custom_link' };
      }
      if (score > CONF_FUZZY_THRESHOLD) {
        return { fieldPath, confidence: score * CONF_FUZZY_STRONG_MULT, value: resolve(profile, fieldPath), matchLayer: 'custom_link' };
      }
      if (score >= CONF_FILL) {
        return { fieldPath, confidence: score * CONF_FUZZY_WEAK_MULT, value: resolve(profile, fieldPath), matchLayer: 'custom_link' };
      }
    }
  }

  // ── Layer 4: Context signals (nearbyText only) ────────────────────────────
  const nearbyNorm = normalize(signals.nearbyText);
  if (nearbyNorm) {
    const exactHit = dictionaryExact(nearbyNorm);
    if (exactHit) {
      const resolved = resolveDictionaryHit(profile, exactHit, signals);
      return { fieldPath: resolved.fieldPath, confidence: CONF_CONTEXT, value: resolved.value, matchLayer: 'context' };
    }
    const fuzzyHit = dictionaryFuzzy(nearbyNorm);
    if (fuzzyHit && fuzzyHit.score >= CONF_FUZZY_THRESHOLD) {
      const resolved = resolveDictionaryHit(profile, fuzzyHit.fieldPath, signals);
      return { fieldPath: resolved.fieldPath, confidence: CONF_CONTEXT, value: resolved.value, matchLayer: 'context' };
    }
  }

  return { fieldPath: null, confidence: 0, value: null, matchLayer: 'none' };
}
