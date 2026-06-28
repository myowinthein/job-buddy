import type { Profile } from '@/src/types/profile';

// Matches any line that already starts with a common bullet marker so we
// don't add a duplicate. Covers ASCII hyphens, asterisks, and common Unicode
// bullets seen in resumes (•, ·, ◦, ‣, ▪, ▶, ▸, ►, →).
const BULLET_RE = /^\s*[-•*·◦‣▪■▶▸▹►→]\s+/;

/**
 * Normalises a free-text description into a bullet list:
 *   - Each non-empty line becomes a bullet line prefixed with "- ".
 *   - Lines that already begin with a bullet marker are left unchanged.
 *   - Blank lines are preserved as paragraph separators.
 *
 * Idempotent: running this twice on the same input produces the same output.
 */
export function normalizeBullets(text: string): string {
  if (!text) return text;
  return text
    .split('\n')
    .map((line) => {
      if (!line.trim()) return '';
      if (BULLET_RE.test(line)) return line;
      return `- ${line.trim()}`;
    })
    .join('\n');
}

/**
 * Post-processes the Partial<Profile> returned by Gemini. Currently:
 *   - Normalises every workHistory[].description into bullet form.
 *
 * Pure: returns a new object, does not mutate the input.
 */
export function normalizeExtractedProfile(p: Partial<Profile>): Partial<Profile> {
  if (!p.workHistory?.length) return p;
  return {
    ...p,
    workHistory: p.workHistory.map((entry) =>
      entry.description ? { ...entry, description: normalizeBullets(entry.description) } : entry,
    ),
  };
}
