import type { FieldMatch } from '@/src/autofill/mapper';

/** A confident dictionary match on a repeating-family marker path, as the post-passes receive it. */
export function marker(fieldPath: string, matchLayer: FieldMatch['matchLayer']): FieldMatch {
  return { fieldPath, confidence: 0.85, value: null, matchLayer };
}
