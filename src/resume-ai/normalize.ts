import type { Profile } from '@/src/types/profile';

// Matches any line that already starts with a common bullet marker so we
// don't add a duplicate. Covers ASCII hyphens, asterisks, and common Unicode
// bullets seen in resumes (•, ·, ◦, ‣, ▪, ▶, ▸, ►, →).
const BULLET_RE = /^\s*[-•*·◦‣▪■▶▸▹►→]\s+/;

/**
 * Normalises a free-text description into an intro paragraph + bullet list.
 *
 * Detection of where the bullet section starts:
 *   1. The first line that already carries a bullet marker, OR
 *   2. The first non-blank line that follows a blank-line separator
 *      (the resume-import prompt instructs Gemini to use this exact shape).
 *
 * Lines BEFORE the bullet section are preserved verbatim — they're the
 * company/team/product/role context paragraph that shouldn't be bulletised.
 *
 * Lines AT or AFTER the bullet section:
 *   - Blank lines pass through as paragraph separators.
 *   - Lines that already begin with -, •, *, ·, ◦, ‣, ▪, ■, ▶, ▸, ▹, ►, → are kept as-is.
 *   - All other non-blank lines get a "- " prefix.
 *
 * If no structure (no marker, no blank-line separator) is detected, the text
 * is returned UNCHANGED. This is intentional: blindly bulleting plain prose
 * would convert legitimate context paragraphs into responsibility lines.
 *
 * Idempotent: running this twice on the same input produces the same output.
 */
export function normalizeBullets(text: string): string {
  if (!text) return text;
  const lines = text.split('\n');

  let bulletStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (BULLET_RE.test(lines[i])) {
      bulletStartIdx = i;
      break;
    }
    if (!lines[i].trim() && i + 1 < lines.length && lines[i + 1].trim()) {
      bulletStartIdx = i + 1;
      break;
    }
  }

  if (bulletStartIdx === -1) return text;

  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i < bulletStartIdx) {
      result.push(lines[i]);
      continue;
    }
    const line = lines[i];
    if (!line.trim()) {
      result.push('');
      continue;
    }
    if (BULLET_RE.test(line)) {
      result.push(line);
      continue;
    }
    result.push(`- ${line.trim()}`);
  }

  return result.join('\n');
}

/**
 * Merges soft line wraps inside a professional summary string.
 *
 * PDF text extraction inserts line breaks at column boundaries that are not
 * intentional paragraph breaks. Gemini copies these verbatim. This function
 * collapses single-newline soft wraps within each paragraph into spaces while
 * keeping intentional paragraph separators (blank lines / \n\n) intact.
 *
 * Input:  "Senior Designer specializing in complex systems,\nand SaaS.\n\nExperienced in..."
 * Output: "Senior Designer specializing in complex systems, and SaaS.\n\nExperienced in..."
 *
 * Idempotent: running twice produces the same result.
 */
export function normalizeSummaryLineWraps(text: string): string {
  if (!text) return text;
  // Split on one or more consecutive blank lines — these are intentional breaks.
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs
    .map((para) =>
      para
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' '),
    )
    .join('\n\n');
}

/**
 * Post-processes the Partial<Profile> returned by Gemini:
 *   - Normalises every workHistory[].description into bullet form.
 *   - Merges soft PDF line wraps in professional.summary into spaces.
 *
 * Pure: returns a new object, does not mutate the input.
 */
export function normalizeExtractedProfile(p: Partial<Profile>): Partial<Profile> {
  const needsWorkNorm = !!p.workHistory?.length;
  const needsSummaryNorm = !!p.professional?.summary;
  if (!needsWorkNorm && !needsSummaryNorm) return p;

  return {
    ...p,
    ...(needsWorkNorm
      ? {
          workHistory: p.workHistory!.map((entry) =>
            entry.description ? { ...entry, description: normalizeBullets(entry.description) } : entry,
          ),
        }
      : undefined),
    ...(needsSummaryNorm
      ? {
          professional: {
            ...p.professional,
            summary: normalizeSummaryLineWraps(p.professional!.summary as string),
          },
        }
      : undefined),
  };
}
