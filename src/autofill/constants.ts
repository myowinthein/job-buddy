/** Minimum confidence to fill a field (yellow tier and above). */
export const CONF_FILL = 0.60;

/** Minimum confidence to fill without requiring review (green tier). */
export const CONF_GREEN = 0.85;

/** Confidence assigned to user-confirmed values (picker selection, manual edit, silent re-fill). */
export const CONF_CONFIRMED = 0.97;

/** Confidence assigned to AI-resolved fields in the low/needReview tier. */
export const CONF_AI_YELLOW = 0.70;
