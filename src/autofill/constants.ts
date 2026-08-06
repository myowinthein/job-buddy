/** Minimum confidence to fill a field (yellow tier and above). */
export const CONF_FILL = 0.60;

/** Minimum confidence to fill without requiring review (green tier). */
export const CONF_GREEN = 0.85;

/** Confidence assigned to user-confirmed values (manual edit, silent re-fill). */
export const CONF_CONFIRMED = 0.97;

/** Confidence assigned to AI-resolved fields in the low/needReview tier.
 *  Intentionally equal to CONF_CONTEXT today but conceptually separate — these
 *  represent different pipeline stages and may drift independently. */
export const CONF_AI_YELLOW = 0.70;

/** Confidence assigned to an exact dictionary match (Layer 2). Same numeric
 *  value as CONF_GREEN today but kept separate so they can drift if needed. */
export const CONF_DICT_EXACT = 0.85;

/** Minimum normalised-similarity score for a fuzzy match to be eligible —
 *  used by Layer 3 (mapper) and by fillSelect / fillAriaListbox option matching. */
export const CONF_FUZZY_THRESHOLD = 0.75;

/** Multiplier applied to the fuzzy similarity score when score > FUZZY_THRESHOLD —
 *  caps a perfect fuzzy match at CONF_GREEN. */
export const CONF_FUZZY_STRONG_MULT = 0.85;

/** Multiplier applied when CONF_FILL ≤ score ≤ CONF_FUZZY_THRESHOLD —
 *  downgrades weaker fuzzy hits further. */
export const CONF_FUZZY_WEAK_MULT = 0.75;

/** Confidence floor for context-layer (nearbyText) matches. */
export const CONF_CONTEXT = 0.70;

/** Minimum similarity between a manually-typed value and an existing profile
 *  value before an edit-watcher (yellow/red/gray) save is trusted enough to
 *  save a learned mapping. Below this, the edit doesn't look like it
 *  corresponds to anything already in the profile. */
export const EDIT_LEARN_SIMILARITY_THRESHOLD = 0.5;

/** Minimum length (after trim) of a manually-typed value before attempting
 *  the profile-value similarity match above. Short strings ("US", "5") can
 *  coincidentally score high against unrelated short profile values. */
export const EDIT_LEARN_MIN_VALUE_LENGTH = 4;
